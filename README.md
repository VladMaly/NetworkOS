# NetworkOS

Your AI relationship team: snap a badge at an event, and NetworkOS works out who they are, remembers what you talked about, and drafts a warm follow-up for you to approve.

## Folders

| Folder | What it is |
|---|---|
| `website/` | The Next.js app: landing page (`/`), the NetworkOS dashboard (`/home`) and its API routes (`app/api/`). Deployed on Vercel. |

Add new parts (for example `backend/`) as their own folders beside `website/`, each with its own README and dependencies.

## Run the website

```bash
cd website
npm install
npm run dev     # http://localhost:3003
```

## Deploy on Vercel

Import `VladMaly/NetworkOS` and set **Root Directory** to `website`. Leave the rest at the Next.js defaults.

The waitlist needs storage on Vercel: in the project go to **Storage → Upstash Redis**, connect it, and redeploy. Locally it writes `website/data/waitlist.json` instead.
