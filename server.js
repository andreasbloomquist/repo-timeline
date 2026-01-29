import express from 'express';
import cors from 'cors';
import session from 'express-session';
import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3001;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'timeline-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// GitHub OAuth config
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const CALLBACK_URL = 'http://localhost:3001/auth/github/callback';

// Start OAuth flow
app.get('/auth/github', (req, res) => {
  const scope = 'read:user repo';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/github/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.redirect('http://localhost:5173?error=no_code');
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: CALLBACK_URL
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('OAuth error:', tokenData);
      return res.redirect('http://localhost:5173?error=oauth_failed');
    }

    // Store token in session
    req.session.accessToken = tokenData.access_token;

    // Get user info
    const octokit = new Octokit({ auth: tokenData.access_token });
    const { data: user } = await octokit.users.getAuthenticated();

    req.session.user = {
      login: user.login,
      avatar: user.avatar_url,
      name: user.name
    };

    res.redirect('http://localhost:5173?auth=success');
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect('http://localhost:5173?error=auth_failed');
  }
});

// Get current user
app.get('/api/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

// Logout
app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get user's repositories
app.get('/api/repos', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const octokit = new Octokit({ auth: req.session.accessToken });
    const { data: repos } = await octokit.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 50
    });

    const repoData = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private
    }));

    res.json(repoData);
  } catch (error) {
    console.error('Repos error:', error);
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
});

// Get branches for a repo
app.get('/api/repos/:owner/:repo/branches', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const octokit = new Octokit({ auth: req.session.accessToken });
    const { data: branches } = await octokit.repos.listBranches({
      owner: req.params.owner,
      repo: req.params.repo,
      per_page: 100
    });

    res.json(branches.map(b => b.name));
  } catch (error) {
    console.error('Branches error:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// Get timeline events (major commits and merged PRs)
app.get('/api/repos/:owner/:repo/timeline', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { owner, repo } = req.params;
  const { branch } = req.query;

  try {
    const octokit = new Octokit({ auth: req.session.accessToken });
    const events = [];

    // Fetch merged PRs
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 50,
      base: branch
    });

    // Filter merged PRs and get their stats
    for (const pr of prs.filter(p => p.merged_at)) {
      try {
        const { data: prDetail } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: pr.number
        });

        const totalChanges = prDetail.additions + prDetail.deletions;

        // Only include PRs with significant changes (>100 lines)
        if (totalChanges >= 100) {
          events.push({
            id: `pr-${pr.number}`,
            type: 'pr',
            summary: generateSummary(pr.title),
            description: pr.body || 'No description provided.',
            date: pr.merged_at,
            author: {
              name: pr.user.login,
              avatar: pr.user.avatar_url
            },
            additions: prDetail.additions,
            deletions: prDetail.deletions,
            url: pr.html_url,
            prNumber: pr.number
          });
        }
      } catch (e) {
        // Skip PRs we can't fetch details for
      }
    }

    // Fetch commits
    const { data: commits } = await octokit.repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page: 100
    });

    // Get commit stats for each commit
    for (const commit of commits.slice(0, 30)) { // Limit to avoid rate limits
      try {
        const { data: commitDetail } = await octokit.repos.getCommit({
          owner,
          repo,
          ref: commit.sha
        });

        const totalChanges = (commitDetail.stats?.additions || 0) + (commitDetail.stats?.deletions || 0);

        // Only include commits with significant changes (>100 lines)
        // and that are not merge commits (which would duplicate PR info)
        if (totalChanges >= 100 && commitDetail.parents?.length === 1) {
          // Check if this commit is already represented by a PR
          const isPRCommit = events.some(e =>
            e.type === 'pr' && commit.commit.message.includes(`#${e.prNumber}`)
          );

          if (!isPRCommit) {
            events.push({
              id: `commit-${commit.sha}`,
              type: 'commit',
              summary: generateSummary(commit.commit.message.split('\n')[0]),
              description: commit.commit.message,
              date: commit.commit.author.date,
              author: {
                name: commit.author?.login || commit.commit.author.name,
                avatar: commit.author?.avatar_url || `https://github.com/identicons/${commit.commit.author.name}.png`
              },
              additions: commitDetail.stats?.additions || 0,
              deletions: commitDetail.stats?.deletions || 0,
              url: commit.html_url,
              sha: commit.sha.substring(0, 7)
            });
          }
        }
      } catch (e) {
        // Skip commits we can't fetch details for
      }
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json(events.slice(0, 20)); // Return top 20 events
  } catch (error) {
    console.error('Timeline error:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Generate a 2-3 word summary from a title/message
function generateSummary(text) {
  // Remove common prefixes
  let clean = text
    .replace(/^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert)(\(.+?\))?:?\s*/i, '')
    .replace(/^\[.+?\]\s*/, '')
    .replace(/^(add|update|fix|remove|implement|create|delete|refactor)\s+/i, '');

  // Get first few meaningful words
  const words = clean.split(/\s+/).filter(w => w.length > 0);

  if (words.length <= 3) {
    return words.join(' ').substring(0, 30);
  }

  // Take first 2-3 words
  return words.slice(0, 3).join(' ').substring(0, 30);
}

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log('');
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    console.log('⚠️  GitHub OAuth not configured!');
    console.log('');
    console.log('Create a GitHub OAuth App:');
    console.log('1. Go to https://github.com/settings/developers');
    console.log('2. Click "New OAuth App"');
    console.log('3. Set Homepage URL: http://localhost:5173');
    console.log('4. Set Callback URL: http://localhost:3001/auth/github/callback');
    console.log('5. Create a .env file with:');
    console.log('   GITHUB_CLIENT_ID=your_client_id');
    console.log('   GITHUB_CLIENT_SECRET=your_client_secret');
    console.log('');
  } else {
    console.log('✓ GitHub OAuth configured');
  }
});
