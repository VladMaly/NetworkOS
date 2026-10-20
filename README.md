# NetworkOS

Your AI relationship team: tell it who you met and what happened, and it works out who they are, remembers what you talked about, decides what to do next and drafts a warm follow-up for you to approve.

## Folders

| Folder | What it is |
|---|---|
| `website/` | The Next.js app: landing page (`/`), sign-in (`/signin`), the dashboard (`/home`) and its API routes. Deployed on Vercel. |
| `agents/` | Python service: the AI team (Planner, Research, Strategist, Outreach), Cognee memory, SQLite app state. Deployed on Railway. |
| `docs/` | Architecture and setup. Start with [docs/architecture.md](docs/architecture.md). |

Add new parts as their own folders beside these, each with its own README and dependencies.

## Run and deploy

See [docs/setup.md](docs/setup.md): running both parts locally, the environment variables, Google sign-in, and deploying to Vercel (Root Directory `website`) and Railway (Root Directory `agents`).
