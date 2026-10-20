import { agents, AgentsDown } from "../../lib/agents"
import { currentUser } from "../../lib/session"

/* The NetworkOS page's line to the real agents, for the signed-in founder only: it works as you (your Cognee memory and
   your contacts, the same ones /home shows). The four Band agents hand a note along in a Band room, and Cognee keeps and
   recalls it. Signed out there is no shared memory to read: real contacts must never be reachable without sign-in.
   Only these calls pass: Band status, Cognee stats, load people or notes into memory, push memory to Cognee Cloud,
   start a run, read a run, approve it. */
const RUN_ID = /^[A-Za-z0-9_-]{1,64}$/
const json = (body: unknown, status = 200) => Response.json(body, { status })
const signInFirst = () => json({ error: "Sign in to use your agents." }, 401)

async function call(userId: string, path: string, init: { method?: string; body?: unknown } = {}) {
  try {
    const res = await agents(userId, path, init)
    return new Response(await res.text(), { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } })
  } catch (e) {
    if (e instanceof AgentsDown) return json({ error: e.message }, 503)
    throw e
  }
}

/* The agents service only knows people who have said hello. */
async function hello(u: { id: string; name: string; email: string }) {
  return call(u.id, "/me", { method: "PUT", body: { name: u.name, email: u.email } })
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams
  const u = await currentUser()
  const run = q.get("run")
  if (!q.has("memory") && run === null) return call(u?.id ?? "-", "/health") // Band status only: no personal data
  if (!u) return signInFirst()
  if (q.has("memory")) {
    const me = await hello(u)
    return me.ok ? call(u.id, "/memory") : me
  }
  if (!run || !RUN_ID.test(run)) return json({ error: "Bad run id." }, 400)
  return call(u.id, `/runs/${run}`)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: unknown; approve?: unknown; draft?: unknown; seed?: unknown; push?: unknown; notes?: unknown }
  const u = await currentUser()
  if (!u) return signInFirst()
  if (typeof body.approve === "string") {
    if (!RUN_ID.test(body.approve)) return json({ error: "Bad run id." }, 400)
    return call(u.id, `/runs/${body.approve}/approve`, { method: "POST", body: { body: typeof body.draft === "string" ? body.draft.slice(0, 4000) : null } })
  }
  const me = await hello(u)
  if (!me.ok) return me
  if (Array.isArray(body.seed)) return call(u.id, "/memory/seed", { method: "POST", body: { people: body.seed.slice(0, 200) } })
  if (body.push === true) return call(u.id, "/memory/push", { method: "POST" })
  if (Array.isArray(body.notes)) return call(u.id, "/memory/notes", { method: "POST", body: { notes: body.notes.filter((n) => typeof n === "string").slice(0, 50) } })
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 1000) : ""
  if (!text) return json({ error: "Say who you met." }, 400)
  return call(u.id, "/capture", { method: "POST", body: { text } })
}
