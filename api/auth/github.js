export const config = { runtime: 'edge' };

export default function handler(request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const baseUrl = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  const redirectUri = `${baseUrl}/api/auth/callback`;
  const scope = 'read:user repo';

  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

  return Response.redirect(authUrl, 302);
}
