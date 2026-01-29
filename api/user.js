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

  return new Response(JSON.stringify(payload.user), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
