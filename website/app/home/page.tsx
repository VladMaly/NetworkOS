import type { Metadata } from "next"
import { NetworkOS } from "./network-os"
import "./network-os.css"

export const metadata: Metadata = {
  title: "NetworkOS",
  description: "Your AI relationship team: who to follow up with, what you promised, and a draft waiting for your approval.",
}

export default function HomePage() {
  return <NetworkOS />
}
