"use client"

import { useState } from "react"

export function Waitlist() {
  const [email, setEmail] = useState("")
  const [state, setState] = useState<{ kind: "idle" | "busy" | "ok" | "err"; text: string }>({ kind: "idle", text: "" })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ kind: "busy", text: "" })
    try {
      const res = await fetch("/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })
      const data = await res.json()
      if (!res.ok) return setState({ kind: "err", text: data.error ?? "Couldn't save that. Try again." })
      setState({ kind: "ok", text: `You're on the list. ${data.count} ${data.count === 1 ? "person" : "people"} so far.` })
      setEmail("")
    } catch {
      setState({ kind: "err", text: "Couldn't reach the server. Check that it's running and try again." })
    }
  }

  return (
    <div className="ly-join-form">
      <form onSubmit={submit}>
        <label className="os-field">
          <span className="sr">Email</span>
          <input className={`os-in${state.kind === "err" ? " os-bad" : ""}`} type="email" required placeholder="you@startup.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button className="os-btn os-main" type="submit" disabled={state.kind === "busy"}>{state.kind === "busy" ? "Saving" : "Get early access"}</button>
      </form>
      <p className={state.kind === "err" ? "os-err" : "os-note"} role="status">{state.text || "One email when your spot opens. Nothing else."}</p>
    </div>
  )
}
