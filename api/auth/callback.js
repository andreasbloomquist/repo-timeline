import { createToken, setTokenCookie } from '../lib/auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';

  if (!code) {
    return Response.redirect(`${baseUrl}?error=no_code`, 302);
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
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${baseUrl}/api/auth/callback`
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('OAuth error:', tokenData);
      return Response.redirect(`${baseUrl}?error=oauth_failed`, 302);
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Timeline-App'
      }
    });

    const user = await userResponse.json();

    // Create JWT with user info and access token
    const token = await createToken({
      accessToken: tokenData.access_token,
      user: {
        login: user.login,
        avatar: user.avatar_url,
        name: user.name
      }
    });

    // Redirect to app with cookie
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${baseUrl}?auth=success`,
        'Set-Cookie': setTokenCookie(token)
      }
    });
  } catch (error) {
    console.error('Auth error:', error);
    return Response.redirect(`${baseUrl}?error=auth_failed`, 302);
  }
}
