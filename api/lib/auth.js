import { SignJWT, jwtVerify } from 'jose';

// No fallback: a known default would let anyone forge session tokens, and a random
// one would differ between serverless instances and break sign-in
if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is not set. Add it to your environment variables.');
}

const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET);

export async function createToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('24h')
    .sign(SECRET);
}

export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

export function getTokenFromCookies(cookieHeader) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {});
  return cookies.token || null;
}

export function setTokenCookie(token) {
  const isProduction = process.env.NODE_ENV === 'production';
  return `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${isProduction ? '; Secure' : ''}`;
}

export function clearTokenCookie() {
  return 'token=; Path=/; HttpOnly; Max-Age=0';
}
