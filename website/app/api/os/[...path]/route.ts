import { currentUser } from "../../../lib/session"
import { agents, AgentsDown } from "../../../lib/agents"

/* The dashboard's door to the agents service: checks the Google session, then forwards the call with the user's ID.
   Only these top-level paths pass through. */
const ALLOWED = new Set(["me", "capture", "runs", "people"])

async function forward(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await currentUser()
  const userId = user?.id
  if (!userId) return Response.json({ error: "Sign in to continue." }, { status: 401 })

  const { path } = await params
  if (!ALLOWED.has(path[0])) return Response.json({ error: "Not found." }, { status: 404 })

  const body = req.method === "GET" ? undefined : await req.json().catch(() => ({}))
  try {
    const res = await agents(userId, `/${path.map(encodeURIComponent).join("/")}`, { method: req.method, body })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" } })
  } catch (e) {
    if (e instanceof AgentsDown) return Response.json({ error: e.message }, { status: 503 })
    throw e
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as PUT }
