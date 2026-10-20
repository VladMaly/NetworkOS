import { agents, AgentsDown } from "../../lib/agents"
import { currentUser } from "../../lib/session"

/* The NetworkOS page's line to the real agents. Signed in, it works as you (your Cognee memory, your contacts, the
   same ones /home shows); signed out, as one shared demo founder. The people on the page are example data, but what
   happens to them here is real: the four Band agents hand a note along in a Band room, and Cognee keeps and recalls it.
   Only these calls pass: Band status, Cognee stats, load the network into memory, start a run, read a run, approve it. */
const DEMO_USER = "networkos-demo"
const DEMO_PROFILE = { building: "Ledgerly, bookkeeping for freelancers (410 paying users, +22% a month)", goal: "investors", voice: "short, leads with a number" }
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/
const json = (body: unknown, status = 200) => Response.json(body, { status })

async function who() {
  const user = await currentUser()
  return user ? { id: user.id, name: user.name, email: user.email, demo: false } : { id: DEMO_USER, name: "Sam (NetworkOS demo)", email: "", demo: true }
}

async function call(userId: string, path: string, init: { method?: string; body?: unknown } = {}) {
  try {
    const res = await agents(userId, path, init)
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } })
  } catch (e) {
    if (e instanceof AgentsDown) return json({ error: e.message }, 503)
    throw e
  }
}

/* The agents service only knows people who have said hello; the demo founder also gets a profile to write from. */
async function hello(u: Awaited<ReturnType<typeof who>>) {
  const me = await call(u.id, "/me", { method: "PUT", body: { name: u.name, email: u.email } })
  if (me.ok && u.demo) await call(u.id, "/me", { method: "PATCH", body: DEMO_PROFILE })
  return me
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const u = await who()
  if (q.has("memory")) {
    const me = await hello(u)
    return me.ok ? call(u.id, "/memory") : me
  }
  const run = q.get("run")
  if (run === null) return call(u.id, "/health")
  if (!RUN_ID.test(run)) return json({ error: "Bad run id." }, 400)
  return call(u.id, `/runs/${run}`)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; approve?: unknown; draft?: unknown; seed?: unknown }
  const u = await who()
  if (typeof body.approve === "string") {
    if (!RUN_ID.test(body.approve)) return json({ error: "Bad run id." }, 400)
    return call(u.id, `/runs/${body.approve}/approve`, { method: "POST", body: { body: typeof body.draft === "string" ? body.draft.slice(0, 4000) : null } })
  }
  const me = await hello(u)
  if (!me.ok) return me
  if (Array.isArray(body.seed)) return call(u.id, "/memory/seed", { method: "POST", body: { people: body.seed.slice(0, 60) } })
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : ""
  if (!text) return json({ error: "Say who you met." }, 400)
  return call(u.id, "/capture", { method: "POST", body: { text } })
}
