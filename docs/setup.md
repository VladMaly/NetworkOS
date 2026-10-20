# Setup

## Run it locally

Two terminals.

**agents/**
```bash
cd agents
py -3.12 -m venv .venv            # macOS/Linux: python3.12 -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
cp .env.example .env              # then fill it in
.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

**website/**
```bash
cd website
npm install
cp .env.example .env.local        # then fill it in
npm run dev                       # http://localhost:3003
```

## Environment variables

### agents/ (`agents/.env`, or Railway → Variables)

| Name | What |
|---|---|
| `AGENTS_SECRET` | Long random string. The website sends it on every call. Same value in both places. |
| `OPENROUTER_API_KEY` | OpenRouter key (openrouter.ai/keys), used by the agents and by Cognee |
| `AGENT_MODEL` | Optional. Any OpenRouter model ID. Defaults to `deepseek/deepseek-v4.1-flash` |
| `PLANNER_*`, `RESEARCH_*`, `STRATEGIST_*`, `OUTREACH_*` | Band remote agents: `_AGENT_ID`, `_API_KEY`, `_HANDLE` for each (app.band.ai → Agents → Connect remote agent) |
| `RESEARCH_WEB` | Optional. `0` turns off web search in Research |
| `DATA_DIR` | Optional. Defaults to `./data` locally. On Railway set `/data` (the disk) |
| Cognee settings | Defaults in `app/config.py`: the OpenRouter model for its graph, fastembed for embeddings. No Cognee key needed. |

### website/ (`website/.env.local`, or Vercel → Settings → Environment Variables)

| Name | What |
|---|---|
| `AUTH_SECRET` | Random string for Auth.js. Make one with `npx auth secret` |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `AGENTS_URL` | Where agents/ runs. `http://localhost:8000` locally, the Railway URL in production |
| `AGENTS_SECRET` | Same value as in agents/ |

## Google sign-in

In Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID (Web application):

- Authorized JavaScript origins: `http://localhost:3003` and your Vercel URL
- Authorized redirect URIs: `http://localhost:3003/api/auth/callback/google` and `https://<your-vercel-domain>/api/auth/callback/google`

Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

## Deploy

**agents/ on Railway**
1. New project → Deploy from GitHub → `VladMaly/NetworkOS`, Root Directory `agents`. Railway builds the Dockerfile.
2. Add a Volume, mount path `/data`.
3. Variables: everything in the agents table, with `DATA_DIR=/data`.
4. Settings → Networking → Generate Domain. That URL is `AGENTS_URL`.

**agents/ from a laptop, while there's no host (Cloudflare Tunnel)**
1. Run agents/ locally (above), on port 8000.
2. `winget install Cloudflare.cloudflared`, then `cloudflared tunnel --url http://localhost:8000`.
3. It prints an `https://….trycloudflare.com` address. That is `AGENTS_URL` in Vercel. It changes each time the tunnel restarts, and the laptop must stay on.

**website/ on Vercel**
1. Import `VladMaly/NetworkOS`, Root Directory `website`.
2. Add the website variables, with `AGENTS_URL` set to the Railway URL.
3. Add the Vercel URL to the Google OAuth client (above).
4. Optional: Storage → Upstash Redis for the landing page waitlist.
