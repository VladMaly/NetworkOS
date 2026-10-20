import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { agents, agentsConfigured } from "../lib/agents"
import { currentUser } from "../lib/session"
import { NetworkOS } from "./network-os"
import "./network-os.css"

export const metadata: Metadata = {
  title: "NetworkOS",
  description: "Your AI relationship team: who to follow up with, what you promised, and a draft waiting for your approval.",
}

export default async function HomePage() {
  await connection()
  const user = await currentUser()
  if (!user) redirect("/signin")

  // Make sure the agents service knows this person; their Google ID is their NetworkOS ID.
  let offline: string | null = null
  if (!agentsConfigured()) offline = "The agents service isn't connected: set AGENTS_URL and AGENTS_SECRET."
  else {
    try {
      const res = await agents(user.id, "/me", { method: "PUT", body: { name: user.name, email: user.email } })
      if (!res.ok) offline = `The agents service answered ${res.status}.`
    } catch (e) {
      offline = e instanceof Error ? e.message : "Couldn't reach the agents service."
    }
  }

  return <NetworkOS user={{ name: user.name, email: user.email, image: user.image }} offline={offline} />
}
