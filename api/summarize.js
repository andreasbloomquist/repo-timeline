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
    const { type, title, description, additions, deletions, files } = body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({
        summary: description || title || 'No summary available.',
        error: 'AI summarization not configured'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    const prompt = `You are summarizing a ${type === 'pr' ? 'pull request' : 'commit'} for a developer.

Title: ${title}
Description: ${description || 'No description provided'}
Lines added: ${additions}
Lines deleted: ${deletions}
${files ? `Files changed: ${files.join(', ')}` : ''}

Write a clear, concise 2-3 sentence summary explaining what this change does in plain English. Focus on the "what" and "why", not implementation details. Write in present tense.`;

    const message = await client.messages.create({
      model: 'claude-3-5-haiku-20241022',
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
