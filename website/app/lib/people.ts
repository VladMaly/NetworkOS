/* The three sample badges the demo knows. Every one is invented. */
export type Goal = "beta" | "investors" | "cofounder" | "hiring"

export type Person = {
  id: string
  name: string
  role: string
  co: string
  event: string
  recent: string
  topic: string
  mutual: string | null
  give: string
  fit: Record<Goal, number>
}

export const PEOPLE: Person[] = [
  {
    id: "maya",
    name: "Maya Chen",
    role: "DevRel",
    co: "Tessera AI",
    event: "Agents Night SF",
    recent: "posted about teams drowning in standup notes",
    topic: "agent memory",
    mutual: "Sam Ortiz",
    give: "I can intro you to Priya, whose design team lives in meeting notes too.",
    fit: { beta: 92, investors: 38, cofounder: 44, hiring: 61 },
  },
  {
    id: "dev",
    name: "Dev Patel",
    role: "Partner",
    co: "Northlight Ventures",
    event: "Agents Night SF",
    recent: "wrote a thread on voice-first tools",
    topic: "voice as the next interface",
    mutual: null,
    give: "Happy to send you the three voice startups from tonight's demos.",
    fit: { beta: 40, investors: 94, cofounder: 30, hiring: 52 },
  },
  {
    id: "lena",
    name: "Lena Ortiz",
    role: "Founder",
    co: "Fieldwork",
    event: "Agents Night SF",
    recent: "is hiring her first engineer",
    topic: "building for field teams",
    mutual: "Jonah Kim",
    give: "Two engineers I met tonight want exactly that kind of role. Want their names?",
    fit: { beta: 66, investors: 22, cofounder: 81, hiring: 58 },
  },
]

export const GOALS: [Goal, string][] = [
  ["beta", "Beta users"],
  ["investors", "Investors"],
  ["cofounder", "Cofounder"],
  ["hiring", "Hiring"],
]

const ASK: Record<Goal, string> = {
  beta: "Here's the 2 minute demo I mentioned. Would you try the beta this week?",
  investors: "Here's the short deck I mentioned. Open to 20 minutes next week?",
  cofounder: "I'd love to keep going over coffee this week. Thursday work?",
  hiring: "If anyone comes to mind for the role we talked about, I'd love an intro.",
}

/** Find a sample by anything typed: a first name, a full name, or a company. */
export function findPerson(q: string): Person | null {
  const s = q.trim().toLowerCase()
  if (s.length < 2) return null
  return PEOPLE.find((p) => p.name.toLowerCase().includes(s) || s.includes(p.name.split(" ")[0].toLowerCase()) || s.includes(p.co.toLowerCase())) ?? null
}

export function warmthOf(p: Person, minutes: number, topic: string) {
  let w = 40 // you met in person
  w += Math.min(minutes, 20) * 1.5
  if (topic.trim().length > 3) w += 15
  if (p.mutual) w += 10
  return Math.min(100, Math.round(w))
}

export function drafts(p: Person, topic: string, goal: Goal, giveFirst: boolean) {
  const first = p.name.split(" ")[0]
  const t = topic.trim() || "what you're building"
  return {
    opener: `Saw you ${p.recent}. That's close to what I'm working on, can I show you in 60 seconds?`,
    followUp: [`Hi ${first}, great talking ${t} with you at ${p.event}.`, ASK[goal], giveFirst ? p.give : ""].filter(Boolean).join(" "),
    intro: p.mutual
      ? `Hey ${p.mutual.split(" ")[0]},I met ${first} at ${p.event} tonight and we talked ${t}. Would you be up for a quick intro? Only if ${first} is happy to.`
      : null,
  }
}
