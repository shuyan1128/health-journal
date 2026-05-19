# Health Journal

A personalized, LLM-powered health journal that helps you track symptoms, identify lifestyle triggers, and discover patterns over time.


## What it does

- **Conversational logging** — describe any symptom in your own words, AI asks smart follow-up questions based on time of day and your history
- **Trigger reasoning** — AI uses general health knowledge and your past logs to ask contextual questions (e.g. morning reflux → asks about last night's meal)
- **Severity slider** — quick 1–5 scale input for low-friction logging
- **Calendar history** — color-coded symptom dots sized by severity, tap to view session summary
- **Pattern analysis** — AI identifies recurring triggers, timing patterns, and co-occurring symptoms across your logs with confidence levels

## Tech stack

- React + Vite
- Tailwind CSS
- Claude API (claude-sonnet-4-6) via Anthropic
- Vercel serverless functions
- localStorage (no database — data is private to your browser)

## Running locally

1. Clone the repo
2. `npm install`
3. Add your Anthropic API key to `.env`: `ANTHROPIC_API_KEY=your_key`
4. `npm run dev` — app runs at localhost:5173
5. `node server.js` — proxy runs at localhost:3001
