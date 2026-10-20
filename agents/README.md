# agents/

The RelationshipOS agents service: Planner, Research, Strategist and Outreach, with Cognee as relationship memory and SQLite for app state. Python 3.12 + FastAPI. Only the website calls it.

- How it fits together: [../docs/architecture.md](../docs/architecture.md)
- Running and deploying it: [../docs/setup.md](../docs/setup.md)

| File | What it does |
|---|---|
| `app/main.py` | The HTTP API and its auth (shared secret + `X-User-Id`) |
| `app/pipeline.py` | One run, step by step, and the prompts |
| `app/llm.py` | Structured model calls through OpenRouter, with web search for Research |
| `app/memory.py` | Cognee: remember, recall, background graph builds |
| `app/band.py` | Handoffs between agents (local until Band is connected) |
| `app/store.py` | SQLite tables: users, contacts, runs, interactions |
| `app/config.py` | Settings, storage paths and Cognee defaults |
