/* NetworkOS: today's board, built on the same invented samples as the landing demo (lib/people.ts), plus what you
   said, promised and planned with each. Every person and number here is invented. */
import { PEOPLE, GOALS, drafts, type Goal, type Person } from "./people"

export const ME = {
  name: "Elizaveta",
  initials: "EG",
  role: "Founder / Operator",
  building: "A tool that turns meeting notes into tasks",
  goal: "beta" as Goal,
  voice: "friendly, concise, specific",
}

export type Contact = {
  person: Person
  signal: string // why now, as one chip
  where: string // where you met, as one chip
  met: string
  date: string
  discussed: string
  said: string
  promised: string
  next: string
  nextDate: string
  status: string
  why: string
  tags: string[]
  history: { when: string; what: string }[]
}

const byId = (id: string) => PEOPLE.find((p) => p.id === id)!

const PRIYA: Person = {
  id: "priya",
  name: "Priya Rao",
  role: "Head of Design",
  co: "Loomwork",
  event: "Design Systems Meetup",
  recent: "shared how her team runs design crits",
  topic: "turning design crits into tasks",
  mutual: "Maya Chen",
  give: "I can send you the crit template two teams at Agents Night swore by.",
  fit: { beta: 74, investors: 18, cofounder: 35, hiring: 40 },
}

export const CONTACTS: Contact[] = [
  {
    person: byId("maya"),
    signal: "Beta fit",
    where: "Demo tables",
    met: "Agents Night SF, by the demo tables",
    date: "Oct 19, 2026",
    discussed: "Agent memory, her community of AI teams, our notes-to-tasks demo",
    said: "Our teams are drowning in standup notes. Send me the demo.",
    promised: "Send the 2 minute demo and set it up for a few teams in her community",
    next: "Follow up tonight",
    nextDate: "Tue, Oct 20",
    status: "Warm, met last night",
    why: "She talks to hundreds of AI teams and just posted about your exact problem.",
    tags: ["DevRel", "Agents", "Beta", "Agents Night SF"],
    history: [
      { when: "Oct 19", what: "Met at Agents Night SF, talked for about ten minutes" },
      { when: "Oct 19", what: "Your voice note: agent memory, she wants note tools for her community" },
      { when: "Oct 19", what: "Research found her post about standup notes" },
    ],
  },
  {
    person: byId("dev"),
    signal: "Potential investor",
    where: "After the demos",
    met: "Agents Night SF, after the demos",
    date: "Oct 19, 2026",
    discussed: "Voice as the next interface, and when you plan to raise",
    said: "Send me the deck once you have usage numbers.",
    promised: "Share the three voice startups from tonight's demos",
    next: "Send the startups list",
    nextDate: "Thu, Oct 22",
    status: "Warm, no mutual yet",
    why: "Northlight backs voice-first tools. He asked for usage numbers, so the deck can wait for the beta.",
    tags: ["Investor", "Voice", "Agents Night SF"],
    history: [
      { when: "Oct 19", what: "Met at Agents Night SF, talked for about five minutes" },
      { when: "Oct 19", what: "Your voice note: voice interfaces, wants usage numbers first" },
    ],
  },
  {
    person: byId("lena"),
    signal: "Hiring signal",
    where: "Her booth",
    met: "Agents Night SF, at the Fieldwork booth",
    date: "Oct 19, 2026",
    discussed: "Building for field teams, and her first engineering hire",
    said: "If you meet anyone strong, send them my way.",
    promised: "Send the names of two engineers from tonight",
    next: "Make the intro",
    nextDate: "Wed, Oct 21",
    status: "Warm, mutual: Jonah Kim",
    why: "Field teams live in meeting notes, and helping her hire first earns a real beta conversation.",
    tags: ["Founder", "Hiring", "Field teams"],
    history: [
      { when: "Oct 19", what: "Met at the Fieldwork booth" },
      { when: "Oct 19", what: "Your voice note: first engineer, field teams, knows Jonah Kim" },
    ],
  },
  {
    person: PRIYA,
    signal: "Design team fit",
    where: "Meetup",
    met: "Design Systems Meetup",
    date: "Oct 15, 2026",
    discussed: "How her team turns design crits into tasks",
    said: "Crit notes go nowhere. I'd try anything that fixes that.",
    promised: "Send the crit template",
    next: "Reconnect",
    nextDate: "Tue, Oct 27",
    status: "Cooling, met five days ago",
    why: "Her team has the exact problem, and Maya can vouch for you.",
    tags: ["Design", "Beta", "Design Systems Meetup"],
    history: [
      { when: "Oct 15", what: "Met at the Design Systems Meetup" },
      { when: "Oct 16", what: "You sent a thank-you note. No reply yet" },
    ],
  },
]

export const goalLabel = (g: Goal) => GOALS.find(([k]) => k === g)![1]

/** Fit for what you need this week, out of ten. */
export const scoreOf = (c: Contact, goal: Goal) => Math.max(1, Math.round(c.person.fit[goal] / 10))

export const rank = (goal: Goal) => [...CONTACTS].sort((a, b) => b.person.fit[goal] - a.person.fit[goal])

export const AGENTS = [
  { name: "Planner", icon: "plan", job: "Breaks down your request and assigns tasks", done: "Request analyzed and tasks created" },
  { name: "Research", icon: "search", job: "Finds context about people and companies", done: "Profile and company research completed" },
  { name: "Strategist", icon: "target", job: "Weighs fit and decides the next action", done: "Relevance scored and next action decided" },
  { name: "Outreach", icon: "mail", job: "Drafts a message in your voice", done: "Message drafted" },
] as const

/** What each agent reports once it has finished with this person. */
export function agentNotes(c: Contact, goal: Goal): string[][] {
  const p = c.person
  return [
    ["Understood your request and made a plan"],
    [`Found ${p.name}'s public profile`, `Read ${p.co}'s site`, `Signal: ${p.recent}`, "Saved context to memory"],
    ["Read past interactions", `Scored the opportunity: ${scoreOf(c, goal)}/10`, `Recommended: ${c.next.toLowerCase()}`],
    ["Wrote a personalized follow-up", `Matched your style: ${ME.voice}`, "Ready for your approval"],
  ]
}

/** The session log lines each agent writes as it finishes. */
export function stageLines(c: Contact, goal: Goal, stage: number): string[] {
  const p = c.person
  return [
    ["Reading your request", "Plan: research, score, draft"],
    [`Searching public profiles for ${p.name}`, `Found ${p.co}'s site and recent posts`],
    ["Retrieving past context from memory", `Scored ${scoreOf(c, goal)}/10 for ${goalLabel(goal).toLowerCase()}`],
    [`Matched your style: ${ME.voice}`, "Draft completed. Awaiting your approval."],
  ][stage]
}

export type LogLine = { t: string; text: string }

/** The log of the run that already happened before you opened the board. */
export function seedLog(c: Contact, goal: Goal): LogLine[] {
  const lines = AGENTS.flatMap((_, i) => stageLines(c, goal, i))
  return lines.map((text, i) => {
    const s = 12 + i * 3
    return { t: `10:24:${String(s).padStart(2, "0")}`, text }
  })
}

/** The follow-up email, written from the same templates as the landing demo. */
export function draftFor(c: Contact, goal: Goal) {
  const first = c.person.name.split(" ")[0]
  const body = drafts(c.person, c.person.topic, goal, true).followUp.replace(`Hi ${first}, `, "")
  return `Hi ${first},\n\n${body[0].toUpperCase()}${body.slice(1)}\n\nBest,\n${ME.name}`
}

export function handoffs(c: Contact) {
  const p = c.person
  return [
    ["Planner", "Research", `Look up ${p.name} at ${p.co}`],
    ["Research", "Strategist", "Person card with role, posts and mutuals"],
    ["Strategist", "Outreach", `${c.next}. ${c.why}`],
    ["Outreach", "You", "Follow-up draft, waiting for your approval"],
  ] as const
}

/* Sample token counts per agent until real models are connected. */
export const TOKENS: [string, number][] = [["Planner", 1240], ["Research", 8410], ["Strategist", 3120], ["Outreach", 2630]]

export const SOURCES = [
  { icon: "link", name: "LinkedIn", sub: "Profile, recent activity" },
  { icon: "globe", name: "Company website", sub: "About, careers, news" },
  { icon: "ticket", name: "Event page", sub: "Hosts, speakers, guest list" },
  { icon: "chat", name: "Past conversations", sub: "From memory" },
]
export const MORE_SOURCES = [
  { icon: "camera", name: "Badge photo", sub: "Read, then deleted" },
  { icon: "mic", name: "Your voice note", sub: "What you talked about" },
]
