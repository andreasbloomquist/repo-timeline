export const config = { runtime: 'edge' };

export default function handler() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const permissionsUrl = `https://github.com/settings/connections/applications/${clientId}`;

  return Response.redirect(permissionsUrl, 302);
}
