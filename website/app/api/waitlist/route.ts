import { promises as fs } from "fs"
import path from "path"

/* Where sign-ups live. On Vercel the disk is read-only, so the list goes to Upstash Redis (add it from the Vercel
   dashboard: Storage → Upstash, which sets the REST url and token below). Locally, without those, it is a JSON file
   beside the app (data/waitlist.json). */
const REDIS_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
const KEY = "waitlist"
const FILE = path.join(process.cwd(), "data", "waitlist.json")

type Row = { email: string; goal: string; at: string }

class NoStore extends Error {}

async function redis<T>(command: (string | number)[]): Promise<T> {
  const res = await fetch(REDIS_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Redis answered ${res.status}`)
  return ((await res.json()) as { result: T }).result
}

async function readFile(): Promise<Row[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"))
  } catch {
    return []
  }
}

async function count(): Promise<number> {
  if (REDIS_URL && REDIS_TOKEN) return redis<number>(["HLEN", KEY])
  if (process.env.VERCEL) throw new NoStore()
  return (await readFile()).length
}

async function add(row: Row): Promise<number> {
  if (REDIS_URL && REDIS_TOKEN) {
    await redis(["HSETNX", KEY, row.email, JSON.stringify({ goal: row.goal, at: row.at })])
    return redis<number>(["HLEN", KEY])
  }
  if (process.env.VERCEL) throw new NoStore()
  const list = await readFile()
  if (!list.some((r) => r.email === row.email)) {
    list.push(row)
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    await fs.writeFile(FILE, JSON.stringify(list, null, 2))
  }
  return list.length
}

function failed(e: unknown) {
  if (e instanceof NoStore) {
    return Response.json({ error: "Sign-ups aren't connected yet. Add Upstash Redis to this Vercel project and redeploy." }, { status: 503 })
  }
  console.error("waitlist", e)
  return Response.json({ error: "Couldn't save that right now. Try again in a minute." }, { status: 500 })
}

export async function GET() {
  try {
    return Response.json({ count: await count() })
  } catch (e) {
    return failed(e)
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string; goal?: string }
  const email = (body.email ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "That email doesn't look right. Check it and try again." }, { status: 400 })
  }
  try {
    const n = await add({ email, goal: (body.goal ?? "").slice(0, 60), at: new Date().toISOString() })
    return Response.json({ ok: true, count: n })
  } catch (e) {
    return failed(e)
  }
}
