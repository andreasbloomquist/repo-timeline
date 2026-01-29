import { verifyToken, getTokenFromCookies } from '../../../lib/auth.js';

export const config = { runtime: 'edge' };

function generateSummary(text) {
  let clean = text
    .replace(/^(feat|fix|chore|docs|style|refactor|test|build|ci|perf|revert)(\(.+?\))?:?\s*/i, '')
    .replace(/^\[.+?\]\s*/, '')
    .replace(/^(add|update|fix|remove|implement|create|delete|refactor)\s+/i, '');

  const words = clean.split(/\s+/).filter(w => w.length > 0);

  if (words.length <= 3) {
    return words.join(' ').substring(0, 30);
  }

  return words.slice(0, 3).join(' ').substring(0, 30);
}

export default async function handler(request) {
  const token = getTokenFromCookies(request.headers.get('cookie'));

  if (!token) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload = await verifyToken(token);

  if (!payload) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const repoIndex = pathParts.indexOf('repos');
  const owner = pathParts[repoIndex + 1];
  const repo = pathParts[repoIndex + 2];
  const branch = url.searchParams.get('branch') || 'main';

  const headers = {
    'Authorization': `Bearer ${payload.accessToken}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'Timeline-App'
  };

  const events = [];

  try {
    // Fetch merged PRs
    const prsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30&base=${branch}`,
      { headers }
    );
    const prs = await prsResponse.json();

    // Process PRs
    for (const pr of (prs || []).filter(p => p.merged_at).slice(0, 15)) {
      try {
        const prDetailResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}`,
          { headers }
        );
        const prDetail = await prDetailResponse.json();

        const totalChanges = (prDetail.additions || 0) + (prDetail.deletions || 0);

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
            additions: prDetail.additions || 0,
            deletions: prDetail.deletions || 0,
            url: pr.html_url,
            prNumber: pr.number
          });
        }
      } catch (e) {
        // Skip PRs we can't fetch
      }
    }

    // Fetch commits
    const commitsResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=50`,
      { headers }
    );
    const commits = await commitsResponse.json();

    // Process commits
    for (const commit of (commits || []).slice(0, 20)) {
      try {
        const commitDetailResponse = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/${commit.sha}`,
          { headers }
        );
        const commitDetail = await commitDetailResponse.json();

        const totalChanges = (commitDetail.stats?.additions || 0) + (commitDetail.stats?.deletions || 0);

        if (totalChanges >= 100 && (commitDetail.parents?.length === 1)) {
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
        // Skip commits we can't fetch
      }
    }

    // Sort by date descending
    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return new Response(JSON.stringify(events.slice(0, 20)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Timeline error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch timeline' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
