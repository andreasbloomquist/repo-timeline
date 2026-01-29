import { clearTokenCookie } from '../lib/auth.js';

export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearTokenCookie()
    }
  });
}
