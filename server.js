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
const CALLBACK_URL = 'http://localhost:3001/api/auth/callback';

// Start OAuth flow
app.get('/api/auth/github', (req, res) => {
  const scope = 'read:user repo';
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(CALLBACK_URL)}&scope=${encodeURIComponent(scope)}`;
  res.redirect(authUrl);
});

// OAuth callback
app.get('/api/auth/callback', async (req, res) => {
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

// Manage GitHub org permissions
app.get('/api/auth/permissions', (req, res) => {
  const permissionsUrl = `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`;
  res.redirect(permissionsUrl);
});

// Logout
app.post('/api/auth/logout', (req, res) => {
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
  const { branch, minLines } = req.query;
  const threshold = parseInt(minLines) || 100;

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

    // Get all merged PRs (any line count)
    const prCommitShas = new Set();
    for (const pr of prs.filter(p => p.merged_at)) {
      try {
        const { data: prDetail } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: pr.number
        });

        // Track merge commit SHA to exclude from direct commits
        if (prDetail.merge_commit_sha) {
          prCommitShas.add(prDetail.merge_commit_sha);
        }

        // Get PR commits to exclude them from direct commits
        try {
          const { data: prCommits } = await octokit.pulls.listCommits({
            owner,
            repo,
            pull_number: pr.number,
            per_page: 100
          });
          prCommits.forEach(c => prCommitShas.add(c.sha));
        } catch (e) {
          // Continue without PR commits list
        }

        // Only include PRs that meet the line threshold
        const prTotalChanges = (prDetail.additions || 0) + (prDetail.deletions || 0);
        if (prTotalChanges > threshold) {
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

    // Get direct commits (not part of any PR) with >100 line changes
    for (const commit of commits.slice(0, 50)) { // Limit to avoid rate limits
      // Skip if this commit is part of a PR
      if (prCommitShas.has(commit.sha)) {
        continue;
      }

      // Skip merge commits (they have multiple parents)
      if (commit.parents && commit.parents.length > 1) {
        continue;
      }

      try {
        const { data: commitDetail } = await octokit.repos.getCommit({
          owner,
          repo,
          ref: commit.sha
        });

        const totalChanges = (commitDetail.stats?.additions || 0) + (commitDetail.stats?.deletions || 0);

        // Only include direct commits with line changes above threshold
        if (totalChanges > threshold) {
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

// AI Summarize endpoint
app.post('/api/summarize', async (req, res) => {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { type, title, description, additions, deletions, files } = req.body;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({
      summary: description || title || 'No summary available.',
      error: 'AI summarization not configured'
    });
  }

  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const prompt = `You are summarizing a ${type === 'pr' ? 'pull request' : 'commit'} for a developer.

Title: ${title}
Description: ${description || 'No description provided'}
Lines added: ${additions}
Lines deleted: ${deletions}
${files ? `Files changed: ${files.join(', ')}` : ''}

Write a clear, concise 2-3 sentence summary explaining what this change does in plain English. Focus on the "what" and "why", not implementation details. Write in present tense.`;

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 200,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const summary = message.content[0].type === 'text'
      ? message.content[0].text
      : 'Unable to generate summary.';

    res.json({ summary });
  } catch (error) {
    console.error('Summarize error:', error);
    res.json({
      summary: description || title || 'Unable to generate AI summary at this time.'
    });
  }
});

// Generate a short summary from a title/message
function generateSummary(text) {
  // Only strip conventional commit prefixes like "feat:", "fix(scope):"
  let clean = text
    .replace(/^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert)(\(.+?\))?:?\s*/i, '')
    .replace(/^\[.+?\]\s*/, '');

  const words = clean.split(/\s+/).filter(w => w.length > 0);

  if (words.length <= 4) {
    return words.join(' ');
  }

  return words.slice(0, 4).join(' ') + '...';
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
    console.log('4. Set Callback URL: http://localhost:3001/api/auth/callback');
    console.log('5. Create a .env file with:');
    console.log('   GITHUB_CLIENT_ID=your_client_id');
    console.log('   GITHUB_CLIENT_SECRET=your_client_secret');
    console.log('');
  } else {
    console.log('✓ GitHub OAuth configured');
  }
});
