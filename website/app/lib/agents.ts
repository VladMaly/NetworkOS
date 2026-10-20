import "server-only"

/* Calls to the agents service (agents/ on Railway). Only the server talks to it: the shared secret proves the call
   comes from this website, and X-User-Id says which signed-in user it is for. */
const URL_ = process.env.AGENTS_URL?.replace(/\/$/, "")
const SECRET = process.env.AGENTS_SECRET

export class AgentsDown extends Error {}

export function agentsConfigured() {
  return Boolean(URL_ && SECRET)
}

export async function agents(userId: string, path: string, init: { method?: string; body?: unknown } = {}) {
  if (!URL_ || !SECRET) throw new AgentsDown("AGENTS_URL and AGENTS_SECRET aren't set.")
  try {
    return await fetch(`${URL_}${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: `Bearer ${SECRET}`, "X-User-Id": userId, "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    })
  } catch {
    throw new AgentsDown(`Couldn't reach the agents service at ${URL_}.`)
  }
}
