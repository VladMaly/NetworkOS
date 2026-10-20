import { agents, AgentsDown } from "../../lib/agents"

/* The NetworkOS page's line to the real agents: no sign-in, one shared demo founder. The page's people are mock data,
   but a run here is real: the four Band agents hand the note along in a Band room, and Cognee recalls and keeps it.
   Only four calls pass: Band status, start a run, read a run, approve its draft. */
const DEMO_USER = "networkos-demo"
const PROFILE = { building: "Ledgerly, bookkeeping for freelancers (410 paying users, +22% a month)", goal: "investors", voice: "short, leads with a number" }
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/

async function call(path: string, init: { method?: string; body?: unknown } = {}) {
  try {
    const res = await agents(DEMO_USER, path, init)
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } })
  } catch (e) {
    if (e instanceof AgentsDown) return Response.json({ error: e.message }, { status: 503 })
    throw e
  }
}

export async function GET(req: Request) {
  const run = new URL(req.url).searchParams.get("run")
  if (run === null) return call("/health")
  if (!RUN_ID.test(run)) return Response.json({ error: "Bad run id." }, { status: 400 })
  return call(`/runs/${run}`)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; approve?: unknown; draft?: unknown }
  if (typeof body.approve === "string") {
    if (!RUN_ID.test(body.approve)) return Response.json({ error: "Bad run id." }, { status: 400 })
    return call(`/runs/${body.approve}/approve`, { method: "POST", body: { body: typeof body.draft === "string" ? body.draft.slice(0, 4000) : null } })
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : ""
  if (!text) return Response.json({ error: "Say who you met." }, { status: 400 })
  const me = await call("/me", { method: "PUT", body: { name: "Sam (NetworkOS demo)", email: "" } })
  if (!me.ok) return me
  await call("/me", { method: "PATCH", body: PROFILE })
  return call("/capture", { method: "POST", body: { text } })
}
