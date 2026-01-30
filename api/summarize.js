import Anthropic from '@anthropic-ai/sdk';
import { verifyToken, getTokenFromCookies } from './lib/auth.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

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
    const body = await request.json();
    const { type, title, description, additions, deletions, owner, repo, prNumber, sha } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        summary: 'AI summarization not configured. Add an ANTHROPIC_API_KEY to enable.',
        error: 'AI summarization not configured'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Fetch the diff from GitHub
    const ghHeaders = {
      'Authorization': `Bearer ${payload.accessToken}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'Timeline-App'
    };

    let diff = '';
    let filesChanged = [];

    try {
      if (type === 'pr' && prNumber && owner && repo) {
        const filesRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=50`,
          { headers: ghHeaders }
        );
        const prFiles = await filesRes.json();
        filesChanged = (prFiles || []).map(f => f.filename);
        diff = (prFiles || [])
          .filter(f => f.patch)
          .map(f => `--- ${f.filename}\n${f.patch}`)
          .join('\n\n');
      } else if (sha && owner && repo) {
        const commitRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
          { headers: ghHeaders }
        );
        const commitDetail = await commitRes.json();
        filesChanged = (commitDetail.files || []).map(f => f.filename);
        diff = (commitDetail.files || [])
          .filter(f => f.patch)
          .map(f => `--- ${f.filename}\n${f.patch}`)
          .join('\n\n');
      }
    } catch (e) {
      // Continue without diff
    }

    // Truncate diff to avoid token limits
    const maxDiffLen = 6000;
    const truncatedDiff = diff.length > maxDiffLen
      ? diff.substring(0, maxDiffLen) + '\n... (diff truncated)'
      : diff;

    const prompt = `You are a senior code reviewer summarizing a ${type === 'pr' ? 'pull request' : 'commit'} for a team lead who needs to quickly understand what changed.

Title: ${title}
Description: ${description || 'No description provided'}
Lines added: ${additions}
Lines deleted: ${deletions}
Files changed: ${filesChanged.join(', ') || 'unknown'}

${truncatedDiff ? `Code diff:\n\`\`\`\n${truncatedDiff}\n\`\`\`` : ''}

Write a 1-2 sentence summary based on the actual code changes, the title, and the description. Be direct and specific — state what was changed and why in plain English. No filler, no restating the title, no implementation details like file names or function signatures. Use present tense. Do not start with "This commit" or "This PR".`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const summary = message.content[0].type === 'text'
      ? message.content[0].text
      : 'Unable to generate summary.';

    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Summarize error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate summary',
      summary: 'Unable to generate AI summary at this time.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
