"use client"

/* NetworkOS home: the people you met, the AI team working on them, the draft waiting for you, and what memory keeps.
   Everything comes from the agents service through /api/os/*; a run is polled while it works. It sits on the landing
   page's frost ground and panes of glass (globals.css). */

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { GOALS, type Goal } from "../lib/people"
import type { Contact, PersonDetail, Profile, Run } from "../lib/os-types"
import { signOutAction } from "./actions"
import { Icon, NetMark } from "./icons"

type Tab = "overview" | "conversation" | "company" | "notes" | "action"
type BandTab = "sessions" | "handoffs" | "messages" | "tokens"
type MemTab = "facts" | "past" | "goals" | "related"
type User = { name: string; email: string; image: string | null }

const AGENTS = [
  { name: "Planner", icon: "plan", job: "Breaks down your request and assigns tasks", done: "Request analyzed and tasks created" },
  { name: "Research", icon: "search", job: "Finds context about people and companies", done: "Profile and company research completed" },
  { name: "Strategist", icon: "target", job: "Weighs fit and decides the next action", done: "Relevance scored and next action decided" },
  { name: "Outreach", icon: "mail", job: "Drafts a message in your voice", done: "Message drafted" },
] as const
const DONE = AGENTS.length
const POLL_MS = 1000

const NAV: { key: string; label: string; icon: string; href?: string }[] = [
  { key: "home", label: "Home", icon: "home", href: "#top" },
  { key: "people", label: "People", icon: "people", href: "#priorities" },
  { key: "today", label: "Today", icon: "today", href: "#activity" },
  { key: "messages", label: "Messages", icon: "mail", href: "#draft" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "memory", label: "Memory", icon: "memory", href: "#memory" },
  { key: "settings", label: "Settings", icon: "settings" },
]
const EXAMPLE = "I met Sarah Chen, founder of Luma AI, at the TechCrunch founder dinner yesterday. We talked about her hiring a product lead. She said to follow up next week, and I promised to send my resume and examples of marketplaces I worked on."
const SUGGESTIONS = ["I met someone at…", "Who should I follow up with?", "What did I promise?", "Who in my network can help with fundraising?"]
const TABS: [Tab, string][] = [["overview", "Overview"], ["conversation", "Conversation"], ["company", "Company"], ["notes", "Notes"], ["action", "Suggested action"]]
const BAND_TABS: [BandTab, string][] = [["sessions", "Agent Sessions"], ["handoffs", "Handoffs"], ["messages", "Messages"], ["tokens", "Tokens / Cost"]]
const MEM_TABS: [MemTab, string][] = [["facts", "Stored facts"], ["past", "Past interactions"], ["goals", "Goals & preferences"], ["related", "Related people"]]
const FACTS: [string, keyof Contact, string][] = [
  ["pin", "met_where", "Met at"], ["calendar", "met_date", "Date"], ["chat", "discussed", "What we discussed"], ["quote", "they_said", "They said"],
  ["check", "i_promised", "I promised"], ["people", "they_promised", "They promised"], ["pulse", "status", "Relationship"], ["today", "next_action", "Next action"],
]

async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/os/${path}`, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? data.detail ?? `Request failed (${res.status})`)
  return data as T
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?"
const first = (name: string) => name.split(" ")[0]
const fmtDate = (s: string) => {
  if (!s) return ""
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}
const goalLabel = (g: string) => GOALS.find(([k]) => k === g)?.[1] ?? g

function Avatar({ name, size = 44, hot = false }: { name: string; size?: number; hot?: boolean }) {
  return <span className={`nx-av${hot ? " is-hot" : ""}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials(name)}</span>
}

function Score({ n }: { n: number }) {
  if (!n) return <span className="nx-score">new</span>
  return <span className={`nx-score${n >= 8 ? " is-high" : n >= 6 ? " is-mid" : ""}`}>{n}/10</span>
}

export function NetworkOS({ user, offline }: { user: User; offline: string | null }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [people, setPeople] = useState<Contact[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selId, setSelId] = useState<string | null>(null)
  const [detail, setDetail] = useState<PersonDetail | null>(null)
  const [live, setLive] = useState<Run | null>(null)
  const [error, setError] = useState<string | null>(offline)
  const [busy, setBusy] = useState(false)

  const [hello, setHello] = useState("Hello")
  const [nav, setNav] = useState("home")
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("overview")
  const [bandTab, setBandTab] = useState<BandTab>("sessions")
  const [memTab, setMemTab] = useState<MemTab>("facts")
  const [bandFull, setBandFull] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [factEdit, setFactEdit] = useState(false)
  const [factDraft, setFactDraft] = useState<Partial<Record<keyof Contact, string>>>({})
  const [notes, setNotes] = useState("")
  const [prof, setProf] = useState({ building: "", goal: "beta" as Goal, voice: "" })
  const askRef = useRef<HTMLInputElement>(null)

  const c = detail?.contact ?? null
  // the run you just started wins until it belongs to someone else; otherwise the selected person's last run
  const run = live && (live.status === "running" || !live.contact_id || live.contact_id === selId) ? live : detail?.run ?? null
  const running = run?.status === "running"
  const stage = run ? run.stage : -1
  const draftBody = run ? edited[run.id] ?? run.draft_body ?? "" : ""
  const draft = run?.draft_subject ? `Subject: ${run.draft_subject}\n\n${draftBody}` : draftBody

  // ── loading ──
  const loadPeople = useCallback(async () => {
    const list = await api<Contact[]>("people")
    setPeople(list)
    return list
  }, [])

  const loadDetail = useCallback(async (id: string) => {
    const d = await api<PersonDetail>(`people/${id}`)
    setDetail(d)
    setNotes(d.contact.notes)
    return d
  }, [])

  useEffect(() => {
    const h = new Date().getHours()
    setHello(h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening")
    if (offline) { setLoaded(true); return }
    ;(async () => {
      try {
        const [me, list] = await Promise.all([api<Profile>("me"), loadPeople()])
        setProfile(me)
        setProf({ building: me.building, goal: me.goal, voice: me.voice })
        if (list[0]) setSelId(list[0].id)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load your network.")
      } finally {
        setLoaded(true)
      }
    })()
  }, [offline, loadPeople])

  useEffect(() => {
    if (!selId) { setDetail(null); return }
    loadDetail(selId).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load that person."))
  }, [selId, loadDetail])

  // ── follow a run while it works ──
  useEffect(() => {
    if (!live || live.status !== "running") return
    const t = window.setTimeout(async () => {
      try {
        const next = await api<Run>(`runs/${live.id}`)
        setLive(next)
        if (next.contact_id && next.contact_id !== live.contact_id) setSelId(next.contact_id)
        if (next.stage !== live.stage || next.status !== "running") {
          await loadPeople()
          if (next.contact_id) await loadDetail(next.contact_id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Lost track of the run.")
        setLive({ ...live, status: "failed" })
      }
    }, POLL_MS)
    return () => window.clearTimeout(t)
  }, [live, loadPeople, loadDetail])

  useEffect(() => {
    if (!bandFull) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBandFull(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bandFull])

  // ── actions ──
  async function ask(text: string) {
    const t = text.trim()
    if (!t || busy) return
    if (t.endsWith("…")) { setQuery(t.slice(0, -1)); askRef.current?.focus(); return }
    setBusy(true)
    setError(null)
    try {
      const { run_id } = await api<{ run_id: string }>("capture", { method: "POST", body: { text: t } })
      setLive({ id: run_id, contact_id: null, request: t, kind: "capture", stage: 0, status: "running", log: [], notes: [[], [], [], []], handoffs: [], sources: [], usage: {}, cost_usd: 0, answer: null, draft_subject: null, draft_body: null, error: null, created_at: new Date().toISOString() })
      setQuery("")
      setEditing(false)
      setTab("overview")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the AI team.")
    } finally {
      setBusy(false)
    }
  }

  function onAsk(e: FormEvent) {
    e.preventDefault()
    ask(query)
  }

  function select(id: string) {
    setSelId(id)
    setEditing(false)
    setFactEdit(false)
    if (live && live.status !== "running" && live.contact_id !== id) setLive(null)
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      return true
    } catch {
      return false
    }
  }

  async function decide(kind: "approve" | "reject") {
    if (!run) return
    setBusy(true)
    try {
      if (kind === "approve") await copyDraft()
      const next = await api<Run>(`runs/${run.id}/${kind}`, { method: "POST", body: kind === "approve" ? { body: edited[run.id] ?? null } : {} })
      setLive(next)
      setEditing(false)
      await loadPeople()
      if (next.contact_id) await loadDetail(next.contact_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.")
    } finally {
      setBusy(false)
    }
  }

  async function saveFacts() {
    if (!c) return
    const changed = Object.fromEntries(Object.entries(factDraft).filter(([k, v]) => v !== c[k as keyof Contact]))
    setFactEdit(false)
    if (!Object.keys(changed).length) return
    try {
      await api(`people/${c.id}`, { method: "PATCH", body: changed })
      await Promise.all([loadDetail(c.id), loadPeople()])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save those facts.")
    }
  }

  async function saveNotes() {
    if (!c || notes === c.notes) return
    try {
      await api(`people/${c.id}`, { method: "PATCH", body: { notes } })
      await loadDetail(c.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your notes.")
    }
  }

  async function saveProfile(patch: Partial<typeof prof>) {
    const next = { ...prof, ...patch }
    setProf(next)
    try {
      setProfile(await api<Profile>("me", { method: "PATCH", body: next }))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your profile.")
    }
  }

  const agentState = (i: number) => (!run ? "queued" : run.status === "failed" && i === stage ? "failed" : i < stage ? "done" : i === stage && running ? "working" : i < DONE && stage >= DONE ? "done" : "queued")

  const steps = [
    ...AGENTS.map((a, i) => ({ name: `${a.name} Agent`, icon: a.icon, state: agentState(i), sub: agentState(i) === "done" ? a.done : agentState(i) === "working" ? "Working…" : agentState(i) === "failed" ? "Stopped" : "Queued" })),
    {
      name: "Human Review", icon: "user",
      state: run && ["approved", "rejected"].includes(run.status) ? "done" : run?.status === "waiting" ? "working" : "queued",
      sub: run?.status === "approved" ? "Approved by you" : run?.status === "rejected" ? "Rejected by you" : run?.status === "waiting" ? "Waiting for your approval" : run?.kind === "question" && run.status === "answered" ? "Nothing to approve" : "Queued",
    },
    {
      name: "Save to Memory", icon: "memory",
      state: run?.status === "approved" ? "done" : "queued",
      sub: run?.status === "approved" ? "Saved to Cognee" : "Will save after approval",
    },
  ]

  const related = c ? [
    ...(c.mutual ? [{ name: c.mutual, line: `Mutual, knows you and ${first(c.name)}` }] : []),
    ...people.filter((x) => x.id !== c.id && c.event && x.event === c.event).map((x) => ({ name: x.name, line: `Also at ${x.event}` })),
  ] : []
  const tokens = run ? Object.entries(run.usage) : []
  const tokenTotal = tokens.reduce((s, [, u]) => s + u.input + u.output, 0)
  const status = run?.status

  return (
    <div className="os-page nx">
      <div className="nx-shell" id="top">
        {/* ── sidebar ── */}
        <aside className="nx-side ly-pane">
          <Link className="nx-brand" href="/">
            <NetMark />
            <span>NetworkOS</span>
          </Link>
          <nav className="nx-nav" aria-label="Main">
            {NAV.map((item) =>
              item.href ? (
                <a key={item.key} href={item.href} className={nav === item.key ? "is-on" : ""} aria-current={nav === item.key ? "page" : undefined} onClick={() => setNav(item.key)}>
                  <Icon n={item.icon} />
                  <span>{item.label}</span>
                </a>
              ) : (
                <span key={item.key} className="is-off" aria-disabled="true" title="Coming soon">
                  <Icon n={item.icon} />
                  <span>{item.label}</span>
                  <em>soon</em>
                </span>
              ),
            )}
          </nav>
          <div className="nx-me">
            {user.image ? <img className="nx-av nx-av-me" src={user.image} alt="" referrerPolicy="no-referrer" /> : <span className="nx-av nx-av-me" aria-hidden>{initials(user.name)}</span>}
            <div>
              <b>{user.name}</b>
              <span>{user.email}</span>
            </div>
            <form action={signOutAction}>
              <button type="submit" className="nx-out" title="Sign out" aria-label="Sign out"><Icon n="arrow" s={16} /></button>
            </form>
          </div>
        </aside>

        {/* ── main ── */}
        <main className="nx-main">
          <header className="nx-hello">
            <div>
              <h1>{hello}, {first(user.name)}</h1>
              <p>Your AI relationship team is here to turn your network into opportunities.</p>
            </div>
            <button type="button" className="nx-btn" onClick={() => { setQuery("I met "); askRef.current?.focus() }}>
              <Icon n="calendar" s={17} />
              Add from event
            </button>
          </header>

          {error && (
            <div className="nx-banner" role="alert">
              <span>{error}</span>
              <button type="button" className="ly-copy" onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          <form className="nx-ask ly-pane" onSubmit={onAsk}>
            <div className="nx-ask-row">
              <span className="nx-mic" aria-hidden><Icon n="mic" s={20} /></span>
              <label className="sr" htmlFor="nx-ask">Tell us what happened or ask what to do next</label>
              <input id="nx-ask" ref={askRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tell us what happened or ask what to do next…" autoComplete="off" disabled={!!offline} />
              <button type="submit" className="nx-send" aria-label="Send" disabled={!query.trim() || busy || running || !!offline}><Icon n="send" s={18} /></button>
            </div>
            <div className="nx-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)} disabled={running || !!offline}>{s}</button>
              ))}
            </div>
            {live?.kind === "question" && (live.answer || running) && (
              <div className="nx-answer">
                <span className="nx-label">{running ? "Thinking…" : "Answer"}</span>
                {live.answer && <p>{live.answer}</p>}
                {!running && <button type="button" className="ly-copy" onClick={() => setLive(null)}>Close</button>}
              </div>
            )}
          </form>

          {profile && !profile.building && (
            <section className="nx-setup ly-pane" aria-label="About you">
              <h2 className="nx-h3">Tell your AI team about you</h2>
              <p className="nx-fine">The Strategist scores people against this, and Outreach writes in your voice.</p>
              <label className="sr" htmlFor="nx-building">What you are building</label>
              <input id="nx-building" className="os-in" value={prof.building} onChange={(e) => setProf({ ...prof, building: e.target.value })} placeholder="What you're building, in one line" />
              <div className="os-ghost os-goals" role="group" aria-label="What you need this week">
                {GOALS.map(([g, t]) => <button key={g} type="button" className={prof.goal === g ? "is-on" : ""} onClick={() => setProf({ ...prof, goal: g })}>{t}</button>)}
              </div>
              <button type="button" className="nx-btn is-ink" onClick={() => saveProfile({})} disabled={!prof.building.trim()}>Save</button>
            </section>
          )}

          <section className="nx-team ly-pane" aria-label="AI team">
            <div className="nx-row-head">
              <h2><Icon n="bot" s={18} /> {running ? "AI team is working…" : status === "failed" ? "AI team stopped" : "AI team is ready"}</h2>
              <a href="#band" className="nx-link">View in Band Desktop <Icon n="arrow" s={15} /></a>
            </div>
            <ol className="nx-flow">
              {AGENTS.map((a, i) => (
                <li key={a.name} className={`nx-agent is-${agentState(i)}`}>
                  <span className="nx-agent-ic"><Icon n={a.icon} s={18} /></span>
                  <div>
                    <b>{a.name}</b>
                    <p>{a.job}</p>
                  </div>
                </li>
              ))}
            </ol>
            {run?.status === "failed" && run.error && <p className="nx-err">{run.error}</p>}
          </section>

          <section className="nx-pri" id="priorities">
            <div className="nx-row-head">
              <h2 className="nx-h2">Today&apos;s priorities {people.length > 0 && <span className="nx-count">{people.length} {people.length === 1 ? "person needs" : "people need"} your attention</span>}</h2>
              {profile && <span className="nx-fine">Ranked for {goalLabel(profile.goal).toLowerCase()}</span>}
            </div>
            {people.length ? (
              <div className="nx-cards">
                {people.map((x) => (
                  <button key={x.id} type="button" className={`nx-card ly-pane${x.id === selId ? " is-on" : ""}`} onClick={() => select(x.id)} aria-pressed={x.id === selId}>
                    <span className="nx-card-top">
                      <Avatar name={x.name} hot={x.id === selId} />
                      <Score n={x.score} />
                    </span>
                    <b className="nx-card-name">{x.name}</b>
                    <span className="nx-card-role">{[x.role, x.company].filter(Boolean).join(" @ ") || "Details coming"}</span>
                    <span className="nx-tags">
                      {x.signal && <span className="nx-tag is-hot">{x.signal}</span>}
                      {(x.met_where || x.event) && <span className="nx-tag">{x.met_where || x.event}</span>}
                    </span>
                    <span className="nx-card-next">
                      <span className="nx-label">Next action</span>
                      <b>{x.next_action || (x.last_status === "running" ? "Working on it…" : "Not decided yet")}</b>
                      {x.next_date && <span className="nx-when"><Icon n="calendar" s={14} /> {fmtDate(x.next_date)}</span>}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="nx-empty ly-pane">
                <b>{loaded ? "No one here yet" : "Loading your network…"}</b>
                {loaded && (
                  <>
                    <p>Tell NetworkOS about someone you met: who, where, what you talked about, and what either of you promised.</p>
                    <button type="button" className="nx-btn" onClick={() => { setQuery(EXAMPLE); askRef.current?.focus() }} disabled={!!offline}>Use an example</button>
                  </>
                )}
              </div>
            )}
          </section>

          {c && (
            <section className="nx-detail ly-pane" aria-label={`${c.name} details`}>
              <div className="nx-detail-left">
                <div className="nx-who">
                  <Avatar name={c.name} size={64} hot />
                  <div>
                    <h3>{c.name}</h3>
                    <p>{[c.role, c.company].filter(Boolean).join(" @ ")}</p>
                    <span className="nx-tags">
                      {c.score > 0 && <span className="nx-tag is-score"><Score n={c.score} /> {c.score >= 8 ? "High priority" : c.score >= 6 ? "Good fit" : "Lower fit this week"}</span>}
                      {c.signal && <span className="nx-tag is-hot">{c.signal}</span>}
                    </span>
                  </div>
                </div>
                <div className="nx-tabs" role="tablist">
                  {TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{t}</button>)}
                </div>
                <div className="nx-tab-body" role="tabpanel">
                  {tab === "overview" && (
                    <dl className="nx-facts">
                      {FACTS.slice(0, 6).filter(([, k]) => c[k]).map(([ic, k, label]) => (
                        <div key={k}><dt><Icon n={ic} s={15} />{label}</dt><dd>{k === "met_date" ? fmtDate(c.met_date) : k === "they_said" ? `"${c.they_said}"` : String(c[k])}</dd></div>
                      ))}
                      {!c.discussed && !c.met_where && <p className="nx-fine">Nothing stored yet.</p>}
                    </dl>
                  )}
                  {tab === "conversation" && (
                    <div className="nx-convo">
                      {c.they_said && <blockquote>&ldquo;{c.they_said}&rdquo;<span>{c.name}</span></blockquote>}
                      {c.discussed && <p><b>You talked about:</b> {c.discussed}</p>}
                      {c.i_promised && <p><b>You promised:</b> {c.i_promised}</p>}
                      {c.they_promised && <p><b>They promised:</b> {c.they_promised}</p>}
                      {!c.they_said && !c.discussed && <p className="nx-fine">No conversation stored yet.</p>}
                    </div>
                  )}
                  {tab === "company" && (
                    <dl className="nx-facts">
                      <div><dt><Icon n="globe" s={15} />Company</dt><dd>{c.company || "Unknown"}</dd></div>
                      <div><dt><Icon n="user" s={15} />Role</dt><dd>{c.role || "Unknown"}</dd></div>
                      <div><dt><Icon n="pulse" s={15} />Recent</dt><dd>{c.recent || "Nothing recent found"}</dd></div>
                      <div><dt><Icon n="people" s={15} />Mutual</dt><dd>{c.mutual || "None known yet"}</dd></div>
                    </dl>
                  )}
                  {tab === "notes" && (
                    <div className="nx-notes">
                      <label className="sr" htmlFor="nx-notes">Your notes on {c.name}</label>
                      <textarea id="nx-notes" className="os-in" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder={`Anything to remember about ${first(c.name)}`} rows={5} />
                      <p className="nx-fine">Saved when you click away. The agents read these next run.</p>
                    </div>
                  )}
                  {tab === "action" && (
                    <div className="nx-convo">
                      {c.next_action ? <p><b>{c.next_action}</b>{c.next_date && <> by {fmtDate(c.next_date)}</>}.</p> : <p className="nx-fine">The Strategist hasn&apos;t decided yet.</p>}
                      {c.why && <p>{c.why}</p>}
                      {c.give && <p className="nx-fine">Give first: {c.give}</p>}
                    </div>
                  )}
                </div>
              </div>

              <div className="nx-detail-right" id="draft">
                {c.next_action && (
                  <div className="nx-next">
                    <span className="nx-label">Recommended next action</span>
                    <div className="nx-next-row">
                      <span className="nx-next-ic"><Icon n="calendar" s={18} /></span>
                      <div>
                        <b>{c.next_action}</b>
                        <p>{c.why}</p>
                      </div>
                    </div>
                  </div>
                )}

                {run && run.kind === "capture" && (run.contact_id === c.id || running) && (
                  <>
                    <div className={`nx-draft${status === "rejected" ? " is-rejected" : ""}`}>
                      <div className="nx-draft-head">
                        <span><Icon n="mail" s={16} /> Draft message <em>(Email)</em></span>
                        <button type="button" className="ly-copy" onClick={copyDraft} disabled={!draftBody}><Icon n="copy" s={14} />{copied ? "Copied" : "Copy"}</button>
                      </div>
                      {running || !draftBody ? (
                        <p className="nx-draft-wait">{status === "failed" ? "No draft this time." : "The Outreach agent is writing this draft…"}</p>
                      ) : editing ? (
                        <>
                          <label className="sr" htmlFor="nx-edit">Edit the draft</label>
                          <textarea id="nx-edit" className="os-in nx-edit" value={editText} onChange={(e) => setEditText(e.target.value)} rows={9} />
                        </>
                      ) : (
                        <p className="nx-draft-text">{draft}</p>
                      )}
                    </div>

                    {status === "approved" ? (
                      <p className="nx-status is-ok"><Icon n="check" s={16} /> Approved and saved to memory. The draft is on your clipboard; paste it into your email.</p>
                    ) : status === "rejected" || status === "failed" ? (
                      <div className="nx-status">
                        <span>{status === "rejected" ? "Rejected. Nothing was sent." : "This run stopped."}</span>
                        <button type="button" className="nx-btn" onClick={() => ask(`Redraft my follow-up to ${c.name}`)} disabled={busy}><Icon n="refresh" s={16} /> Run again</button>
                      </div>
                    ) : editing ? (
                      <div className="nx-actions">
                        <button type="button" className="nx-btn is-ink" onClick={() => { setEdited((m) => ({ ...m, [run.id]: editText })); setEditing(false) }}><Icon n="check" s={16} /> Save draft</button>
                        <button type="button" className="nx-btn" onClick={() => setEditing(false)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="nx-actions">
                        <button type="button" className="nx-btn is-ink" onClick={() => decide("approve")} disabled={status !== "waiting" || busy}><Icon n="send" s={16} /> Approve &amp; Send</button>
                        <button type="button" className="nx-btn" onClick={() => { setEditText(draftBody); setEditing(true) }} disabled={status !== "waiting"}><Icon n="edit" s={16} /> Edit</button>
                        <button type="button" className="nx-btn is-warn" onClick={() => decide("reject")} disabled={status !== "waiting" || busy}><Icon n="x" s={16} /> Reject</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          )}
        </main>

        {/* ── AI team activity ── */}
        <aside className="nx-activity ly-pane" id="activity">
          <div className="nx-row-head">
            <h2 className="nx-h3">AI Team Activity</h2>
            <span className={`nx-live${running ? " is-live" : ""}`}><i />{running ? "Live" : "Ready"}</span>
          </div>
          {run ? (
            <ol className="nx-timeline">
              {AGENTS.map((a, i) => {
                const st = agentState(i)
                const lines = run.notes[i] ?? []
                return (
                  <li key={a.name} className={`is-${st}`}>
                    <span className="nx-agent-ic"><Icon n={a.icon} s={17} /></span>
                    <div className="nx-tl-body">
                      <div className="nx-tl-head">
                        <div>
                          <b>{a.name} Agent</b>
                          <span>{st === "done" ? "Done" : st === "working" ? "Working…" : st === "failed" ? "Stopped" : "Queued"}</span>
                        </div>
                        {st === "done" && <span className="nx-ok"><Icon n="check" s={13} /></span>}
                        {st === "working" && <span className="nx-spin" aria-label="Working" />}
                      </div>
                      {lines.length > 0 && <ul>{lines.map((n) => <li key={n}><Icon n="check" s={13} />{n}</li>)}</ul>}
                    </div>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="nx-fine">When you tell NetworkOS about someone, each agent&apos;s work shows up here.</p>
          )}
          <div className="nx-sources">
            <h3 className="nx-label">Sources used</h3>
            <ul>
              {run && (
                <li>
                  <span className="nx-src-ic"><Icon n="chat" s={17} /></span>
                  <div><b>Your note</b><span>What you told NetworkOS</span></div>
                </li>
              )}
              {run && run.stage >= 1 && (
                <li>
                  <span className="nx-src-ic"><Icon n="memory" s={17} /></span>
                  <div><b>Cognee memory</b><span>Past conversations</span></div>
                </li>
              )}
              {run?.sources.map((s) => {
                let host = s.url
                try { host = new URL(s.url).hostname.replace(/^www\./, "") } catch { /* keep the raw url */ }
                return (
                  <li key={s.url}>
                    <span className="nx-src-ic"><Icon n={host.includes("linkedin") ? "link" : "globe"} s={17} /></span>
                    <div><a href={s.url} target="_blank" rel="noreferrer"><b>{s.title || host}</b></a><span>{host}</span></div>
                  </li>
                )
              })}
              {!run && <li className="nx-fine">Nothing yet.</li>}
            </ul>
          </div>
        </aside>

        {/* ── Band Desktop and memory ── */}
        <div className="nx-right">
          {bandFull && <div className="nx-scrim" onClick={() => setBandFull(false)} aria-hidden />}
          <section className={`nx-band${bandFull ? " is-full" : ""}`} id="band" aria-label="Band Desktop">
            <header className="nx-band-top">
              <span className="nx-band-name"><span className="nx-band-logo"><Icon n="board" s={16} /></span> Band Desktop</span>
              <span className="nx-band-tools">
                <span className={`nx-conn${offline ? " is-off" : ""}`}><i /> {offline ? "Offline" : "Connected"}</span>
                <button type="button" className="nx-band-btn" onClick={() => setBandFull((f) => !f)}>
                  <Icon n={bandFull ? "shrink" : "expand"} s={15} />{bandFull ? "Exit full screen" : "Open in full screen"}
                </button>
              </span>
            </header>
            <div className="nx-band-body">
              <div className="nx-band-side">
                <div className="nx-room"><NetMark size={26} /><div><b>NetworkOS</b><span>net-ops-room</span></div></div>
                <ul>
                  <li className="is-on"><Icon n="board" s={16} />Workboard</li>
                  <li><Icon n="bot" s={16} />Agents</li>
                  <li><Icon n="clock" s={16} />Sessions</li>
                  <li><Icon n="chat" s={16} />Messages</li>
                  <li><Icon n="tools" s={16} />Tools</li>
                  <li><Icon n="file" s={16} />Files</li>
                  <li><Icon n="settings" s={16} />Settings</li>
                </ul>
              </div>
              <div className="nx-band-main">
                <div className="nx-band-head">
                  <h3>Workboard <span className={`nx-run${running ? " is-live" : ""}`}><i />{running ? "Running" : status === "waiting" ? "Waiting on you" : "Idle"}</span></h3>
                  <button type="button" className="nx-band-new" onClick={() => { if (bandFull) setBandFull(false); askRef.current?.focus(); askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }) }}><Icon n="plus" s={15} /> New task</button>
                </div>
                {run ? (
                  <div className="nx-task">
                    <b>{run.kind === "question" ? `Answer: ${run.request}` : `Process new contact: ${c && run.contact_id === c.id ? `${c.name}${c.company ? ` (${c.company})` : ""}` : "reading your note…"}`}</b>
                    <span className="nx-tags">
                      {c && run.contact_id === c.id && c.score > 0 && <span className={`nx-pill${c.score >= 8 ? " is-ok" : ""}`}>{c.score >= 8 ? "High priority" : "Normal priority"}</span>}
                      {run.kind === "capture" && <span className="nx-pill is-warn">Human approval required</span>}
                    </span>
                    <ol className="nx-steps">
                      {steps.map((s, i) => (
                        <li key={s.name} className={`is-${s.state}`}>
                          <span className="nx-step-n">{i + 1}</span>
                          <span className="nx-step-ic"><Icon n={s.icon} s={16} /></span>
                          <div><b>{s.name}</b><span>{s.sub}</span></div>
                          <em />
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="nx-band-fine">No tasks yet. Start one from the ask bar.</p>
                )}
              </div>
            </div>
            <div className="nx-band-tabs" role="tablist">
              {BAND_TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={bandTab === k} className={bandTab === k ? "is-on" : ""} onClick={() => setBandTab(k)}>{t}</button>)}
            </div>
            <div className="nx-band-panel" role="tabpanel">
              {bandTab === "sessions" && (
                <>
                  <div className="nx-session-head">
                    <span><Icon n="mail" s={15} /> {running ? `${AGENTS[Math.min(stage, DONE - 1)].name} Agent Session` : "Last session"}</span>
                    <span className={`nx-pill${running ? " is-ok" : ""}`}>{running ? "Live" : "Ended"}</span>
                  </div>
                  <ol className="nx-log" aria-live="polite">
                    {run?.log.slice(-8).map((l, i) => <li key={`${l.t}${i}`}><time>{l.t}</time><span>{l.text}</span></li>)}
                    {!run?.log.length && <li><time>—</time><span>{running ? "Starting…" : "No session yet."}</span></li>}
                  </ol>
                </>
              )}
              {bandTab === "handoffs" && (
                <ol className="nx-log nx-hand">
                  {run?.handoffs.map((h, i) => <li key={i}><time>{h.from} → {h.to}</time><span>{h.what}</span></li>)}
                  {!run?.handoffs.length && <li><time>—</time><span>No handoffs yet.</span></li>}
                </ol>
              )}
              {bandTab === "messages" && (
                <ol className="nx-log nx-hand">
                  {people.map((x) => (
                    <li key={x.id}><time>{x.name}</time><span>{x.last_status === "running" ? "Drafting…" : x.last_status === "approved" ? "Approved" : x.last_status === "rejected" ? "Rejected" : x.last_status === "waiting" ? "Draft waiting for approval" : x.last_status === "failed" ? "Run stopped" : "No draft"}</span></li>
                  ))}
                  {!people.length && <li><time>—</time><span>No messages yet.</span></li>}
                </ol>
              )}
              {bandTab === "tokens" && (
                <>
                  <ol className="nx-log nx-hand">
                    {tokens.map(([a, u]) => <li key={a}><time>{a}</time><span className="nx-num">{(u.input + u.output).toLocaleString("en-US")} tokens</span></li>)}
                    {tokens.length > 0 && <li><time>Total</time><span className="nx-num">{tokenTotal.toLocaleString("en-US")} tokens · ${run?.cost_usd.toFixed(3)}</span></li>}
                    {!tokens.length && <li><time>—</time><span>No model calls yet.</span></li>}
                  </ol>
                  <p className="nx-band-fine">This run only, at DeepSeek V4.1 Flash list prices. Cognee&apos;s own memory calls aren&apos;t counted.</p>
                </>
              )}
            </div>
          </section>

          <section className="nx-mem ly-pane" id="memory" aria-label="Memory">
            <div className="nx-row-head">
              <h2 className="nx-h3"><Icon n="memory" s={19} /> Cognee Memory</h2>
              {memTab === "facts" && c && (
                <button type="button" className="ly-copy" onClick={() => { if (factEdit) saveFacts(); else { setFactDraft(Object.fromEntries(FACTS.map(([, k]) => [k, String(c[k] ?? "")]))); setFactEdit(true) } }}>
                  <Icon n={factEdit ? "check" : "edit"} s={14} />{factEdit ? "Save" : "Edit"}
                </button>
              )}
            </div>
            <div className="nx-tabs" role="tablist">
              {MEM_TABS.map(([k, t]) => <button key={k} type="button" role="tab" aria-selected={memTab === k} className={memTab === k ? "is-on" : ""} onClick={() => setMemTab(k)}>{t}</button>)}
            </div>
            <div role="tabpanel">
              {memTab === "facts" && (c ? (
                <>
                  <h3 className="nx-mem-title">Stored facts about {c.name}</h3>
                  <dl className="nx-facts nx-mem-facts">
                    <div><dt><Icon n="user" s={15} />Person</dt><dd>{c.name}{c.role || c.company ? `, ${[c.role, c.company].filter(Boolean).join(" @ ")}` : ""}</dd></div>
                    {FACTS.map(([ic, k, label]) => (factEdit || c[k]) ? (
                      <div key={k}>
                        <dt><Icon n={ic} s={15} />{label}</dt>
                        <dd>
                          {factEdit
                            ? <input className="os-in nx-fact-in" aria-label={label} value={factDraft[k] ?? ""} onChange={(e) => setFactDraft((f) => ({ ...f, [k]: e.target.value }))} />
                            : k === "met_date" ? fmtDate(c.met_date) : k === "next_action" && c.next_date ? `${c.next_action} (${fmtDate(c.next_date)})` : String(c[k])}
                        </dd>
                      </div>
                    ) : null)}
                    {c.tags.length > 0 && <div><dt><Icon n="tag" s={15} />Tags</dt><dd>{c.tags.join(", ")}</dd></div>}
                  </dl>
                </>
              ) : <p className="nx-fine">Pick a person to see what memory holds about them.</p>)}
              {memTab === "past" && (
                <ol className="nx-past">
                  {detail?.interactions.map((h) => <li key={h.id}><time>{fmtDate(h.at).replace(/^\w+, /, "")}</time><span>{h.what}</span></li>)}
                  {!detail?.interactions.length && <li className="nx-fine">No interactions stored yet.</li>}
                </ol>
              )}
              {memTab === "goals" && (
                <div className="nx-goals">
                  <label className="nx-label" htmlFor="nx-p-building">Building</label>
                  <input id="nx-p-building" className="os-in nx-fact-in" value={prof.building} onChange={(e) => setProf({ ...prof, building: e.target.value })} onBlur={() => saveProfile({})} placeholder="What you're building" />
                  <p className="nx-label">What you need this week</p>
                  <div className="os-ghost os-goals" role="group" aria-label="What you need this week">
                    {GOALS.map(([g, t]) => <button key={g} type="button" className={prof.goal === g ? "is-on" : ""} onClick={() => saveProfile({ goal: g })}>{t}</button>)}
                  </div>
                  <label className="nx-label" htmlFor="nx-p-voice">Your voice</label>
                  <input id="nx-p-voice" className="os-in nx-fact-in" value={prof.voice} onChange={(e) => setProf({ ...prof, voice: e.target.value })} onBlur={() => saveProfile({})} placeholder="friendly, concise, specific" />
                  <p className="nx-fine">The next run scores people against this and writes in this voice.</p>
                </div>
              )}
              {memTab === "related" && (
                <ul className="nx-related">
                  {related.map((r) => <li key={r.name}><Avatar name={r.name} size={34} /><div><b>{r.name}</b><span>{r.line}</span></div></li>)}
                  {!related.length && <li className="nx-fine">{c ? `No one else in memory connects to ${first(c.name)} yet.` : "Pick a person first."}</li>}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
