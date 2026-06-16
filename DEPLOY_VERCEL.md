# Deploying GamerMind to Vercel

Quick steps to deploy this repo to Vercel (recommended: connect GitHub repo to Vercel dashboard).

1) Commit & push this repository to GitHub (or any Git provider):

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

2) Create a Vercel project (via dashboard) and point it at this repository.

3) In Vercel project settings, set the following Environment Variables (at minimum):

- `GEMINI_API_KEY` (your Google Gemini API key) OR
- `GROQ_API_KEY` (your Groq API key)
- `GEMINI_MODEL` (optional)
- `GROQ_MODEL` (optional)
- `PORT` (not required on Vercel)

4) The `vercel.json` file routes static files from the `frontend/` folder and Node serverless functions from the `api/` folder. No build step is required.

5) (Optional) Deploy from your machine using Vercel CLI:

```bash
npm i -g vercel
vercel login
vercel --prod
```

Notes & caveats
- Streaming SSE (`/api/chat/stream`) is implemented best-effort; some serverless platforms buffer responses. If streaming behaves inconsistently, use the non-streaming endpoint `/api/chat` instead.
- Ensure you DO NOT commit real API keys to the repo. Use Vercel's Environment Variables UI.
- If you need a custom domain, configure it in Vercel after deployment.

If you want, I can (A) run a local smoke test against the new API routes, or (B) help you connect this repo to Vercel step-by-step.
