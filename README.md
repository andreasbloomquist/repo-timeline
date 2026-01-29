# Repo Timeline

A visual timeline of meaningful changes in a GitHub repository, explained in plain English.

## Why

In the era of vibe coding, codebases change fast. A single session with an AI coding assistant can produce dozens of commits and PRs with thousands of lines changed. Traditional commit logs become noise -- endless lists of diffs that are hard to parse and even harder to understand at a glance.

Repo Timeline cuts through that noise. It pulls the changes that actually matter (merged PRs and large commits), plots them on a clean vertical timeline, and uses AI to summarize what each change actually did in plain language. Instead of reading diffs, you read sentences.

## What it does

- Connects to your GitHub account via OAuth
- Lets you select any repo and branch you have access to
- Displays a vertical timeline of major changes:
  - All merged pull requests
  - Direct commits with 100+ line changes
- Click any event to expand it and get an AI-generated summary of the change
- Links back to the original PR or commit on GitHub

## Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Express (local dev) / Vercel Edge Functions (production)
- **Auth**: GitHub OAuth with JWT sessions
- **AI**: Anthropic Claude API for change summaries
- **Styling**: Custom CSS, IBM Plex Mono, minimal black-and-white aesthetic

## Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Set Homepage URL: `http://localhost:5173`
4. Set Callback URL: `http://localhost:3001/api/auth/callback`

### 2. Configure environment

```bash
cp .env.example .env
```

Add your credentials to `.env`:

```
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
SESSION_SECRET=any-random-string
ANTHROPIC_API_KEY=your_anthropic_key
```

The Anthropic API key is optional -- the app works without it but won't generate AI summaries.

### 3. Run locally

```bash
npm install
npm run dev      # starts Vite on :5173
node server.js   # starts Express on :3001
```

Open `http://localhost:5173`, sign in with GitHub, and select a repo.

## Deploying to Vercel

The `api/` directory contains Edge Functions that replace the Express server in production. Set the same environment variables in your Vercel project settings, plus:

```
APP_URL=https://your-production-url.vercel.app
```

Update your GitHub OAuth App's callback URL to `https://your-production-url.vercel.app/api/auth/callback`.
