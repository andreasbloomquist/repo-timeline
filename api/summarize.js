import Anthropic from '@anthropic-ai/sdk';
import { verifyToken, getTokenFromCookies } from './lib/auth.js';

export const config = { runtime: 'edge' };

function getAIConfig() {
  const provider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  const defaults = {
    anthropic: { model: 'claude-haiku-4-5-20251001', key: process.env.ANTHROPIC_API_KEY },
    openai: { model: 'gpt-4o-mini', key: process.env.OPENAI_API_KEY },
    google: { model: 'gemini-2.0-flash', key: process.env.GOOGLE_AI_API_KEY }
  };
  const config = defaults[provider] || defaults.anthropic;
  return { provider, model: process.env.AI_MODEL || config.model, apiKey: config.key };
}

async function callAI(prompt, provider, model, apiKey) {
  if (provider === 'anthropic') {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0].type === 'text' ? message.content[0].text : null;
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content || null;
  }

  if (provider === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 200 } })
      }
    );
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  }

  return null;
}

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

    const { provider, model, apiKey } = getAIConfig();

    if (!apiKey) {
      return new Response(JSON.stringify({
        summary: 'AI summarization not configured. Set AI_PROVIDER and the corresponding API key.',
        error: 'AI summarization not configured'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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

    const summary = await callAI(prompt, provider, model, apiKey);

    return new Response(JSON.stringify({ summary: summary || 'Unable to generate summary.' }), {
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
