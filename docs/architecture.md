# NetworkOS architecture

NetworkOS is an AI relationship team for founders. You tell it who you met and what happened. It works out who they are, checks what you already know, decides how much the relationship matters and what to do next, drafts the follow-up, and waits for your approval. Approved outcomes go back into memory.

```
CAPTURE → UNDERSTAND → PRIORITIZE → NEXT ACTION → HUMAN APPROVAL → REMEMBER
```

## The hackathon flow

```
"I met Sarah yesterday at the TechCrunch dinner…"
  ↓  Planner      pulls out who, where, what was said, what was promised
  ↓  Memory       saves the note to Cognee, recalls anything known about Sarah
  ↓  Research     public web: role, company, recent signal
  ↓  Strategist   priority 9/10, next action, why
  ↓  Outreach     follow-up draft in your voice
  ↓  You          approve, edit or reject
  ↓  Memory       the outcome is stored for next time
```

A question like "Who should I follow up with?" takes a shorter path: Planner → Memory → Strategist answers from what is stored.

## Parts

```
                    ┌──────────────────────────── Vercel ─────────────────────────────┐
 Browser ──────────▶│ website/  (Next.js 16)                                          │
 Google sign-in     │  /            landing + waitlist                                │
                    │  /signin      Continue with Google (Auth.js)                    │
                    │  /home        the dashboard                                     │
                    │  /api/os/*    forwards to agents/ with the signed-in user's ID  │
                    └───────────────────────────────┬─────────────────────────────────┘
                                                    │ HTTPS + shared secret + X-User-Id
                    ┌──────────────── Railway (one service, one disk at /data) ───────┐
                    │ agents/  (Python 3.12, FastAPI)                                  │
                    │  pipeline.py   Planner → Research → Strategist → Outreach        │
                    │  band.py       hands work between agents (Band; local for now)  │
                    │  memory.py     Cognee: add, cognify, search per user             │
                    │  store.py      SQLite: users, contacts, runs, interactions       │
                    │                                                                  │
                    │  /data/cognee  Cognee's own LanceDB (vectors), graph, metadata   │
                    │  /data/app.db  app state                                         │
                    └───────────────────────────────┬─────────────────────────────────┘
                                                    │
                                    OpenRouter (agents + web search) · Cognee's model calls
```

| Part | Tech | Where |
|---|---|---|
| Website, dashboard | Next.js 16, React 19, the frost-glass CSS in `globals.css` | Vercel, Root Directory `website` |
| Sign-in | Auth.js v5 with Google | Vercel |
| Agents | Python 3.12, FastAPI, OpenAI Python SDK pointed at OpenRouter | Railway |
| Agent coordination | Band, behind `agents/band.py` | inside `agents/` |
| Relationship memory | Cognee (LanceDB vectors + graph, file-based) | inside `agents/`, on the `/data` disk |
| App state | SQLite via SQLModel | inside `agents/`, `/data/app.db` |
| Domain | Cloudflare DNS → Vercel | Cloudflare |

### Why Cognee and SQLite both

Cognee is the memory: facts, conversations, who knows whom, searched by meaning. It is not built for lists you sort and update, such as "contacts ranked by priority" or "this draft is waiting for approval". Those live in a small SQLite file next to Cognee's files on the same disk. No extra service.

### Why one Python service

Cognee is Python, and its file-based stores expect a single writer. The agents are what read and write memory, so they share the process. That also keeps every API key on the server.

## Identity

- You sign in with Google. Your **user ID is your Google account ID** (the `sub` claim), the same everywhere.
- The website reads the session and sends `X-User-Id` with every call to `agents/`, plus `Authorization: Bearer <AGENTS_SECRET>`. `agents/` refuses calls without the secret, so only the website can act for a user.
- Each user's memory is a separate Cognee dataset named `user_<id>`. App rows carry `user_id`.

## agents/ API

All routes need `Authorization: Bearer <AGENTS_SECRET>` and `X-User-Id`.

| Method | Path | Body / answer |
|---|---|---|
| `GET` | `/health` | `{ok}`. No auth. |
| `PUT` | `/me` | `{name, email}` → creates or updates the user. Called on every sign-in. |
| `GET` | `/me` | Profile: name, building, goal, voice |
| `PATCH` | `/me` | `{building?, goal?, voice?}` |
| `POST` | `/capture` | `{text}` → `{run_id}`. Starts a run in the background. |
| `GET` | `/runs/{id}` | Stage, log, agent notes, handoffs, answer or draft, status. The dashboard polls this. |
| `GET` | `/people` | Contacts, ranked by score |
| `GET` | `/people/{id}` | One contact, its interactions and its latest run |
| `PATCH` | `/people/{id}` | `{notes?}` and editable facts |
| `POST` | `/runs/{id}/approve` | `{body?}` → saves the outcome to memory |
| `POST` | `/runs/{id}/reject` | Marks it rejected. Nothing is sent. |

A run moves through `stage` 0 to 4 (Planner, Research, Strategist, Outreach, done) and `status` `running` → `waiting` (draft ready) → `approved` or `rejected`, or `answered` for questions, or `failed`.

## Models

- Agents call a model through OpenRouter (OpenAI Python SDK with OpenRouter's URL). The default is `deepseek/deepseek-v4.1-flash`, set by `AGENT_MODEL`; any OpenRouter model ID works. Each step asks for a JSON answer that matches a schema, and only providers that honour the schema are used, so the code never parses free text.
- Research uses OpenRouter's web search plugin, so there is no separate search API key. Its citations become the run's sources.
- Cognee makes its own model calls when it builds the graph, through the same OpenRouter key and model, with a small local embedding model (fastembed) for vectors.

## Guardrails

- Public information only. Nothing behind a login is read.
- Nothing is sent anywhere. Approve copies the draft and stores the outcome; you send it yourself.
- Every memory and contact is scoped to the signed-in user.

## Not built yet

- Real Band connection: `band.py` runs the handoffs locally and logs them in the shape the Band panel shows. It switches to Band once we have their SDK docs and key.
- Badge photo and voice upload: the ask bar takes typed text for now.
- Sending email from NetworkOS.
