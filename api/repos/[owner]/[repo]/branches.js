import { verifyToken, getTokenFromCookies } from '../../../lib/auth.js';

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

  // Extract owner and repo from URL
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const repoIndex = pathParts.indexOf('repos');
  const owner = pathParts[repoIndex + 1];
  const repo = pathParts[repoIndex + 2];

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
      headers: {
        'Authorization': `Bearer ${payload.accessToken}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Timeline-App'
      }
    });

    const branches = await response.json();

    return new Response(JSON.stringify(branches.map(b => b.name)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Branches error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch branches' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
