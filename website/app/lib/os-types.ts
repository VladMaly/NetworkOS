/* What the agents service sends back (agents/app/main.py), as the dashboard reads it. */
import type { Goal } from "./people"

export type Profile = { id: string; name: string; email: string; building: string; goal: Goal; voice: string }

export type Contact = {
  id: string
  name: string
  role: string
  company: string
  event: string
  met_where: string
  met_date: string
  discussed: string
  they_said: string
  they_promised: string
  i_promised: string
  recent: string
  mutual: string
  signal: string
  score: number
  next_action: string
  next_date: string
  why: string
  status: string
  give: string
  tags: string[]
  notes: string
  last_run_id: string | null
  last_status: RunStatus | null
  updated_at: string
}

export type Interaction = { id: string; at: string; what: string }

export type RunStatus = "running" | "waiting" | "approved" | "rejected" | "answered" | "failed"

export type Run = {
  id: string
  contact_id: string | null
  request: string
  kind: "capture" | "question"
  stage: number
  status: RunStatus
  log: { t: string; text: string }[]
  notes: string[][]
  handoffs: { from: string; to: string; what: string }[]
  sources: { title: string; url: string }[]
  usage: Record<string, { input: number; output: number }>
  cost_usd: number
  answer: string | null
  draft_subject: string | null
  draft_body: string | null
  error: string | null
  created_at: string
}

export type PersonDetail = { contact: Contact; interactions: Interaction[]; run: Run | null }
