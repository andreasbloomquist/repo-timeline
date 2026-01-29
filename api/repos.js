import { verifyToken, getTokenFromCookies } from './lib/auth.js';

export const config = { runtime: 'edge' };

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

  try {
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=50', {
      headers: {
        'Authorization': `Bearer ${payload.accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Timeline-App'
      }
    });

    const repos = await response.json();

    const repoData = repos.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private
    }));

    return new Response(JSON.stringify(repoData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Repos error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch repos' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
