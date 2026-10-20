"use client"

/* NetworkOS home: the person you met, the AI team working on them, the draft waiting for you, and what memory keeps.
   It sits on the landing page's frost ground and panes of glass (globals.css). Runs are simulated in the browser
   until the API routes and models are connected. */

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { GOALS, type Goal } from "../lib/people"
import {
  AGENTS, CONTACTS, ME, MORE_SOURCES, SOURCES, TOKENS,
  agentNotes, draftFor, goalLabel, handoffs, rank, scoreOf, seedLog, stageLines,
  type Contact, type LogLine,
} from "../lib/network"
import Link from "next/link"
import { Icon, NetMark } from "./icons"

type Decision = "pending" | "approved" | "rejected"
type Run = { stage: number; decision: Decision; log: LogLine[]; edited: string | null; seeded: boolean }
type Tab = "overview" | "conversation" | "company" | "notes" | "action"
type BandTab = "sessions" | "handoffs" | "messages" | "tokens"
type MemTab = "facts" | "past" | "goals" | "related"

const DONE = AGENTS.length
const STEP_MS = 1100
const AGO = ["4m ago", "3m ago", "2m ago", "Just now"]

const NAV: { key: string; label: string; icon: string; href?: string }[] = [
  { key: "home", label: "Home", icon: "home", href: "#top" },
  { key: "people", label: "People", icon: "people", href: "#priorities" },
  { key: "today", label: "Today", icon: "today", href: "#activity" },
  { key: "messages", label: "Messages", icon: "mail", href: "#draft" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "memory", label: "Memory", icon: "memory", href: "#memory" },
  { key: "settings", label: "Settings", icon: "settings" },
]
const SUGGESTIONS = ["I met someone at Agents Night SF", "Who should I follow up with?", "What did I promise Maya?", "Find investors in my network"]
const TABS: [Tab, string][] = [["overview", "Overview"], ["conversation", "Conversation"], ["company", "Company"], ["notes", "Notes"], ["action", "Suggested action"]]
const BAND_TABS: [BandTab, string][] = [["sessions", "Agent Sessions"], ["handoffs", "Handoffs"], ["messages", "Messages"], ["tokens", "Tokens / Cost"]]
const MEM_TABS: [MemTab, string][] = [["facts", "Stored facts"], ["past", "Past interactions"], ["goals", "Goals & preferences"], ["related", "Related people"]]

const clock = () => new Date().toTimeString().slice(0, 8)
const initials = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2)
const firstName = (c: Contact) => c.person.name.split(" ")[0]

function Avatar({ name, size = 44, hot = false }: { name: string; size?: number; hot?: boolean }) {
  return <span className={`nx-av${hot ? " is-hot" : ""}`} style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials(name)}</span>
}

function Score({ n }: { n: number }) {
  return <span className={`nx-score${n >= 8 ? " is-high" : n >= 6 ? " is-mid" : ""}`}>{n}/10</span>
}

export function NetworkOS() {
  const [goal, setGoal] = useState<Goal>(ME.goal)
  const ranked = useMemo(() => rank(goal), [goal])
  const [selId, setSelId] = useState(() => rank(ME.goal)[0].person.id)
  const c = CONTACTS.find((x) => x.person.id === selId)!
  const score = scoreOf(c, goal)

  const [runs, setRuns] = useState<Record<string, Run>>(() =>
    Object.fromEntries(CONTACTS.map((x) => [x.person.id, { stage: DONE, decision: "pending" as Decision, log: seedLog(x, ME.goal), edited: null, seeded: true }])),
  )
  const run = runs[selId]
  const running = run.stage < DONE
  const draft = run.edited ?? draftFor(c, goal)

  const [hello, setHello] = useState("Hello")
  const [nav, setNav] = useState("home")
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<Tab>("overview")
  const [bandTab, setBandTab] = useState<BandTab>("sessions")
  const [memTab, setMemTab] = useState<MemTab>("facts")
  const [bandFull, setBandFull] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [moreSources, setMoreSources] = useState(false)
  const [eventOpen, setEventOpen] = useState(false)
  const [eventLink, setEventLink] = useState("lu.ma/agents-night-sf")
  const [eventRead, setEventRead] = useState(false)
  const [factEdit, setFactEdit] = useState(false)
  const [facts, setFacts] = useState<Record<string, Partial<Record<string, string>>>>({})

  const timers = useRef<number[]>([])
  const askRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const h = new Date().getHours()
    setHello(h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening")
    const t = timers.current
    return () => t.forEach((id) => window.clearTimeout(id))
  }, [])

  useEffect(() => {
    if (!bandFull) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setBandFull(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [bandFull])

  function patch(id: string, f: (r: Run) => Partial<Run>) {
    setRuns((all) => ({ ...all, [id]: { ...all[id], ...f(all[id]) } }))
  }

  function startRun(id: string, request: string, g: Goal) {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    const target = CONTACTS.find((x) => x.person.id === id)!
    setEditing(false)
    setRuns((all) => ({ ...all, [id]: { stage: 0, decision: "pending", edited: null, seeded: false, log: [{ t: clock(), text: `Request: "${request}"` }] } }))
    for (let s = 0; s < DONE; s++) {
      timers.current.push(window.setTimeout(() => {
        patch(id, (r) => ({ stage: s + 1, log: [...r.log, ...stageLines(target, g, s).map((text) => ({ t: clock(), text }))] }))
      }, STEP_MS * (s + 1)))
    }
  }

  function select(id: string) {
    setSelId(id)
    setEditing(false)
    setFactEdit(false)
  }

  function ask(text: string) {
    const t = text.trim()
    if (!t) return
    const lower = t.toLowerCase()
    let g = goal
    if (lower.includes("investor")) { g = "investors"; setGoal(g) }
    const named = CONTACTS.find((x) => lower.includes(firstName(x).toLowerCase()) || lower.includes(x.person.co.toLowerCase()))
    const id = (named ?? rank(g)[0]).person.id
    select(id)
    setTab(lower.includes("promise") ? "conversation" : "overview")
    startRun(id, t, g)
    setQuery("")
  }

  function onAsk(e: FormEvent) {
    e.preventDefault()
    ask(query)
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

  async function decide(d: Decision) {
    if (d === "approved") {
      const ok = await copyDraft()
      patch(selId, (r) => ({ decision: d, log: [...r.log, { t: clock(), text: ok ? "Approved by you. Draft copied, saved to memory." : "Approved by you. Saved to memory." }] }))
    } else {
      patch(selId, (r) => ({ decision: d, log: [...r.log, { t: clock(), text: "Rejected by you. Run again for a new draft." }] }))
    }
    setEditing(false)
  }

  function saveEdit() {
    patch(selId, (r) => ({ edited: editText, log: [...r.log, { t: clock(), text: "You edited the draft." }] }))
    setEditing(false)
  }

  const notesFor = agentNotes(c, goal)
  const agentState = (i: number) => (i < run.stage ? "done" : i === run.stage ? "working" : "queued")

  const steps = [
    ...AGENTS.map((a, i) => ({
      name: `${a.name} Agent`, icon: a.icon, state: agentState(i),
      sub: i < run.stage ? a.done : i === run.stage ? "Working…" : "Queued",
      ago: run.seeded ? AGO[i] : "",
    })),
    {
      name: "Human Review", icon: "user", ago: "",
      state: run.decision !== "pending" ? "done" : run.stage === DONE ? "working" : "queued",
      sub: run.decision === "approved" ? "Approved by you" : run.decision === "rejected" ? "Rejected by you" : run.stage === DONE ? "Waiting for your approval" : "Queued",
    },
    {
      name: "Save to Memory", icon: "memory", ago: "",
      state: run.decision === "approved" ? "done" : "queued",
      sub: run.decision === "approved" ? "Saved" : "Will save after approval",
    },
  ]

  const factRows: [string, string, string][] = [
    ["user", "Person", `${c.person.name}, ${c.person.role} @ ${c.person.co}`],
    ["pin", "Met at", c.met],
    ["calendar", "Date", c.date],
    ["chat", "What we discussed", c.discussed],
    ["quote", "They said", `"${c.said}"`],
    ["check", "I promised", c.promised],
    ["pulse", "Relationship", c.status],
    ["today", "Next action", `${c.next} (${c.nextDate})`],
    ["tag", "Tags", c.tags.join(", ")],
  ]
  const factOf = (label: string, fallback: string) => facts[selId]?.[label] ?? fallback

  const related = [
    ...(c.person.mutual ? [{ name: c.person.mutual, line: `Mutual, knows you and ${firstName(c)}` }] : []),
    ...CONTACTS.filter((x) => x !== c && x.person.event === c.person.event).map((x) => ({ name: x.person.name, line: `Also at ${x.person.event}` })),
  ]

  const tokenTotal = TOKENS.reduce((s, [, n]) => s + n, 0)

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
            <span className="nx-av nx-av-me" aria-hidden>{ME.initials}</span>
            <div>
              <b>{ME.name}</b>
              <span>{ME.role}</span>
            </div>
          </div>
        </aside>

        {/* ── main ── */}
        <main className="nx-main">
          <header className="nx-hello">
            <div>
              <h1>{hello}, {ME.name}</h1>
              <p>Your AI relationship team is here to turn your network into opportunities.</p>
            </div>
            <div className="nx-pop-wrap">
              <button type="button" className="nx-btn" onClick={() => setEventOpen((o) => !o)} aria-expanded={eventOpen}>
                <Icon n="calendar" s={17} />
                Add from event
              </button>
              {eventOpen && (
                <form className="nx-pop ly-pane" onSubmit={(e) => { e.preventDefault(); setEventRead(true) }}>
                  <label className="sr" htmlFor="nx-event">Event link</label>
                  <input id="nx-event" className="os-in" value={eventLink} onChange={(e) => { setEventLink(e.target.value); setEventRead(false) }} placeholder="lu.ma/your-event" autoComplete="off" />
                  <button className="os-btn os-main" type="submit">Read the event</button>
                  <p className="nx-fine">
                    {eventRead
                      ? <>Agents Night SF: 3 hosts, 6 speakers, 140 going. <b>5 people worth finding</b>, ranked for {goalLabel(goal).toLowerCase()}.</>
                      : <>Reads the hosts, speakers and public guest list, and ranks them before you arrive.</>}
                  </p>
                </form>
              )}
            </div>
          </header>

          <form className="nx-ask ly-pane" onSubmit={onAsk}>
            <div className="nx-ask-row">
              <span className="nx-mic" aria-hidden><Icon n="mic" s={20} /></span>
              <label className="sr" htmlFor="nx-ask">Tell us what happened or ask what to do next</label>
              <input id="nx-ask" ref={askRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tell us what happened or ask what to do next…" autoComplete="off" />
              <button type="submit" className="nx-send" aria-label="Send" disabled={!query.trim()}><Icon n="send" s={18} /></button>
            </div>
            <div className="nx-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </form>

          <section className="nx-team ly-pane" aria-label="AI team">
            <div className="nx-row-head">
              <h2><Icon n="bot" s={18} /> {running ? "AI team is working…" : "AI team is ready"}</h2>
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
          </section>

          <section className="nx-pri" id="priorities">
            <div className="nx-row-head">
              <h2 className="nx-h2">Today&apos;s priorities <span className="nx-count">{CONTACTS.length} people need your attention</span></h2>
              <span className="nx-fine">Ranked for {goalLabel(goal).toLowerCase()}</span>
            </div>
            <div className="nx-cards">
              {ranked.map((x) => (
                <button key={x.person.id} type="button" className={`nx-card ly-pane${x.person.id === selId ? " is-on" : ""}`} onClick={() => select(x.person.id)} aria-pressed={x.person.id === selId}>
                  <span className="nx-card-top">
                    <Avatar name={x.person.name} hot={x.person.id === selId} />
                    <Score n={scoreOf(x, goal)} />
                  </span>
                  <b className="nx-card-name">{x.person.name}</b>
                  <span className="nx-card-role">{x.person.role} @ {x.person.co}</span>
                  <span className="nx-tags">
                    <span className="nx-tag is-hot">{x.signal}</span>
                    <span className="nx-tag">{x.where}</span>
                  </span>
                  <span className="nx-card-next">
                    <span className="nx-label">Next action</span>
                    <b>{x.next}</b>
                    <span className="nx-when"><Icon n="calendar" s={14} /> {x.nextDate}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="nx-detail ly-pane" aria-label={`${c.person.name} details`}>
            <div className="nx-detail-left">
              <div className="nx-who">
                <Avatar name={c.person.name} size={64} hot />
                <div>
                  <h3>{c.person.name}</h3>
                  <p>{c.person.role} @ {c.person.co}</p>
                  <span className="nx-tags">
                    <span className="nx-tag is-score"><Score n={score} /> {score >= 8 ? "High priority" : score >= 6 ? "Good fit" : "Low fit this week"}</span>
                    <span className="nx-tag is-hot">{c.signal}</span>
                  </span>
                </div>
              </div>
              <div className="nx-tabs" role="tablist">
                {TABS.map(([k, t]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{t}</button>
                ))}
              </div>
              <div className="nx-tab-body" role="tabpanel">
                {tab === "overview" && (
                  <dl className="nx-facts">
                    {factRows.slice(1, 6).map(([ic, label, value]) => (
                      <div key={label}><dt><Icon n={ic} s={15} />{label}</dt><dd>{factOf(label, value)}</dd></div>
                    ))}
                  </dl>
                )}
                {tab === "conversation" && (
                  <div className="nx-convo">
                    <p className="nx-label">From your voice note, {c.date}</p>
                    <blockquote>&ldquo;{c.said}&rdquo;<span>{c.person.name}</span></blockquote>
                    <p><b>You talked about:</b> {c.discussed}.</p>
                    <p><b>You promised:</b> {c.promised}.</p>
                  </div>
                )}
                {tab === "company" && (
                  <dl className="nx-facts">
                    <div><dt><Icon n="globe" s={15} />Company</dt><dd>{c.person.co}</dd></div>
                    <div><dt><Icon n="user" s={15} />Role</dt><dd>{c.person.role}</dd></div>
                    <div><dt><Icon n="pulse" s={15} />Recent</dt><dd>{c.person.name.split(" ")[0]} {c.person.recent}</dd></div>
                    <div><dt><Icon n="people" s={15} />Mutual</dt><dd>{c.person.mutual ?? "None found yet"}</dd></div>
                  </dl>
                )}
                {tab === "notes" && (
                  <div className="nx-notes">
                    <label className="sr" htmlFor="nx-notes">Your notes on {c.person.name}</label>
                    <textarea id="nx-notes" className="os-in" value={notes[selId] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [selId]: e.target.value }))} placeholder={`Anything to remember about ${firstName(c)}`} rows={5} />
                    <p className="nx-fine">Notes stay in this browser for now.</p>
                  </div>
                )}
                {tab === "action" && (
                  <div className="nx-convo">
                    <p><b>{c.next}</b> by {c.nextDate}.</p>
                    <p>{c.why}</p>
                    <p className="nx-fine">Give first: {c.person.give}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="nx-detail-right" id="draft">
              <div className="nx-next">
                <span className="nx-label">Recommended next action</span>
                <div className="nx-next-row">
                  <span className="nx-next-ic"><Icon n="calendar" s={18} /></span>
                  <div>
                    <b>{c.next}</b>
                    <p>{c.why}</p>
                  </div>
                </div>
              </div>

              <div className={`nx-draft${run.decision === "rejected" ? " is-rejected" : ""}`}>
                <div className="nx-draft-head">
                  <span><Icon n="mail" s={16} /> Draft message <em>(Email)</em></span>
                  <button type="button" className="ly-copy" onClick={copyDraft} disabled={running}><Icon n="copy" s={14} />{copied ? "Copied" : "Copy"}</button>
                </div>
                {running ? (
                  <p className="nx-draft-wait">The Outreach agent is writing this draft…</p>
                ) : editing ? (
                  <>
                    <label className="sr" htmlFor="nx-edit">Edit the draft</label>
                    <textarea id="nx-edit" className="os-in nx-edit" value={editText} onChange={(e) => setEditText(e.target.value)} rows={9} />
                  </>
                ) : (
                  <p className="nx-draft-text">{draft}</p>
                )}
              </div>

              {run.decision === "approved" ? (
                <p className="nx-status is-ok"><Icon n="check" s={16} /> Approved and saved to memory. The draft is on your clipboard; paste it into your email.</p>
              ) : run.decision === "rejected" ? (
                <div className="nx-status">
                  <span>Rejected. Nothing was sent.</span>
                  <button type="button" className="nx-btn" onClick={() => startRun(selId, `Redraft for ${firstName(c)}`, goal)}><Icon n="refresh" s={16} /> Run again</button>
                </div>
              ) : editing ? (
                <div className="nx-actions">
                  <button type="button" className="nx-btn is-ink" onClick={saveEdit}><Icon n="check" s={16} /> Save draft</button>
                  <button type="button" className="nx-btn" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              ) : (
                <div className="nx-actions">
                  <button type="button" className="nx-btn is-ink" onClick={() => decide("approved")} disabled={running}><Icon n="send" s={16} /> Approve &amp; Send</button>
                  <button type="button" className="nx-btn" onClick={() => { setEditText(draft); setEditing(true) }} disabled={running}><Icon n="edit" s={16} /> Edit</button>
                  <button type="button" className="nx-btn is-warn" onClick={() => decide("rejected")} disabled={running}><Icon n="x" s={16} /> Reject</button>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* ── AI team activity ── */}
        <aside className="nx-activity ly-pane" id="activity">
          <div className="nx-row-head">
            <h2 className="nx-h3">AI Team Activity</h2>
            <span className={`nx-live${running ? " is-live" : ""}`}><i />{running ? "Live" : "Ready"}</span>
          </div>
          <ol className="nx-timeline">
            {AGENTS.map((a, i) => {
              const st = agentState(i)
              return (
                <li key={a.name} className={`is-${st}`}>
                  <span className="nx-agent-ic"><Icon n={a.icon} s={17} /></span>
                  <div className="nx-tl-body">
                    <div className="nx-tl-head">
                      <div>
                        <b>{a.name} Agent</b>
                        <span>{st === "done" ? (run.seeded ? AGO[i] : "Done") : st === "working" ? "Working…" : "Queued"}</span>
                      </div>
                      {st === "done" && <span className="nx-ok"><Icon n="check" s={13} /></span>}
                      {st === "working" && <span className="nx-spin" aria-label="Working" />}
                    </div>
                    {st === "done" && (
                      <ul>
                        {notesFor[i].map((n) => <li key={n}><Icon n="check" s={13} />{n}</li>)}
                      </ul>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
          <div className="nx-sources">
            <h3 className="nx-label">Sources used</h3>
            <ul>
              {[...SOURCES, ...(moreSources ? MORE_SOURCES : [])].map((s) => (
                <li key={s.name}>
                  <span className="nx-src-ic"><Icon n={s.icon} s={17} /></span>
                  <div><b>{s.name}</b><span>{s.sub}</span></div>
                </li>
              ))}
            </ul>
            <button type="button" className="nx-btn nx-wide" onClick={() => setMoreSources((m) => !m)}>{moreSources ? "Show fewer sources" : "View all sources"}</button>
          </div>
        </aside>

        {/* ── Band Desktop and memory ── */}
        <div className="nx-right">
          {bandFull && <div className="nx-scrim" onClick={() => setBandFull(false)} aria-hidden />}
          <section className={`nx-band${bandFull ? " is-full" : ""}`} id="band" aria-label="Band Desktop">
            <header className="nx-band-top">
              <span className="nx-band-name"><span className="nx-band-logo"><Icon n="board" s={16} /></span> Band Desktop</span>
              <span className="nx-band-tools">
                <span className="nx-conn"><i /> Connected</span>
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
                  <h3>Workboard <span className={`nx-run${running ? " is-live" : ""}`}><i />{running ? "Running" : run.stage === DONE && run.decision === "pending" ? "Waiting on you" : "Idle"}</span></h3>
                  <button type="button" className="nx-band-new" onClick={() => { askRef.current?.focus(); askRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); if (bandFull) setBandFull(false) }}><Icon n="plus" s={15} /> New task</button>
                </div>
                <div className="nx-task">
                  <b>Process new contact: {c.person.name} ({c.person.co})</b>
                  <span className="nx-tags">
                    <span className={`nx-pill${score >= 8 ? " is-ok" : ""}`}>{score >= 8 ? "High priority" : "Normal priority"}</span>
                    <span className="nx-pill is-warn">Human approval required</span>
                  </span>
                  <ol className="nx-steps">
                    {steps.map((s, i) => (
                      <li key={s.name} className={`is-${s.state}`}>
                        <span className="nx-step-n">{i + 1}</span>
                        <span className="nx-step-ic"><Icon n={s.icon} s={16} /></span>
                        <div><b>{s.name}</b><span>{s.sub}</span></div>
                        <em>{s.ago}</em>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
            <div className="nx-band-tabs" role="tablist">
              {BAND_TABS.map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={bandTab === k} className={bandTab === k ? "is-on" : ""} onClick={() => setBandTab(k)}>{t}</button>
              ))}
            </div>
            <div className="nx-band-panel" role="tabpanel">
              {bandTab === "sessions" && (
                <>
                  <div className="nx-session-head"><span><Icon n="mail" s={15} /> {running ? `${AGENTS[run.stage].name} Agent Session` : "Outreach Agent Session"}</span><span className={`nx-pill${running ? " is-ok" : ""}`}>{running ? "Live" : "Ended"}</span></div>
                  <ol className="nx-log" aria-live="polite">
                    {run.log.slice(-8).map((l, i) => <li key={`${l.t}${i}`}><time>{l.t}</time><span>{l.text}</span></li>)}
                  </ol>
                </>
              )}
              {bandTab === "handoffs" && (
                <ol className="nx-log nx-hand">
                  {handoffs(c).map(([from, to, what]) => <li key={from}><time>{from} → {to}</time><span>{what}</span></li>)}
                </ol>
              )}
              {bandTab === "messages" && (
                <ol className="nx-log nx-hand">
                  {ranked.map((x) => {
                    const r = runs[x.person.id]
                    return <li key={x.person.id}><time>{x.person.name}</time><span>{r.stage < DONE ? "Drafting…" : r.decision === "approved" ? "Approved" : r.decision === "rejected" ? "Rejected" : "Draft waiting for approval"}</span></li>
                  })}
                </ol>
              )}
              {bandTab === "tokens" && (
                <>
                  <ol className="nx-log nx-hand">
                    {TOKENS.map(([a, n]) => <li key={a}><time>{a}</time><span className="nx-num">{n.toLocaleString("en-US")} tokens</span></li>)}
                    <li><time>Total</time><span className="nx-num">{tokenTotal.toLocaleString("en-US")} tokens</span></li>
                  </ol>
                  <p className="nx-band-fine">Sample numbers. Real counts appear once models are connected.</p>
                </>
              )}
            </div>
          </section>

          <section className="nx-mem ly-pane" id="memory" aria-label="Memory">
            <div className="nx-row-head">
              <h2 className="nx-h3"><Icon n="memory" s={19} /> Cognee Memory</h2>
              {memTab === "facts" && (
                <button type="button" className="ly-copy" onClick={() => setFactEdit((f) => !f)}><Icon n={factEdit ? "check" : "edit"} s={14} />{factEdit ? "Done" : "Edit"}</button>
              )}
            </div>
            <div className="nx-tabs" role="tablist">
              {MEM_TABS.map(([k, t]) => (
                <button key={k} type="button" role="tab" aria-selected={memTab === k} className={memTab === k ? "is-on" : ""} onClick={() => setMemTab(k)}>{t}</button>
              ))}
            </div>
            <div role="tabpanel">
              {memTab === "facts" && (
                <>
                  <h3 className="nx-mem-title">Stored facts about {c.person.name}</h3>
                  <dl className="nx-facts nx-mem-facts">
                    {factRows.map(([ic, label, value]) => (
                      <div key={label}>
                        <dt><Icon n={ic} s={15} />{label}</dt>
                        <dd>
                          {factEdit && label !== "Person" ? (
                            <input className="os-in nx-fact-in" aria-label={label} value={factOf(label, value)} onChange={(e) => setFacts((f) => ({ ...f, [selId]: { ...f[selId], [label]: e.target.value } }))} />
                          ) : factOf(label, value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
              {memTab === "past" && (
                <ol className="nx-past">
                  {c.history.map((h, i) => <li key={i}><time>{h.when}</time><span>{h.what}</span></li>)}
                  {run.decision === "approved" && <li><time>Today</time><span>You approved the follow-up</span></li>}
                </ol>
              )}
              {memTab === "goals" && (
                <div className="nx-goals">
                  <p><b>Building:</b> {ME.building}</p>
                  <p className="nx-label">What you need this week</p>
                  <div className="os-ghost os-goals" role="group" aria-label="What you need this week">
                    {GOALS.map(([g, t]) => (
                      <button key={g} type="button" className={goal === g ? "is-on" : ""} onClick={() => setGoal(g)}>{t}</button>
                    ))}
                  </div>
                  <p><b>Your voice:</b> {ME.voice}</p>
                  <p className="nx-fine">Changing what you need re-ranks today&apos;s priorities and rewrites the ask in every draft.</p>
                </div>
              )}
              {memTab === "related" && (
                <ul className="nx-related">
                  {related.length ? related.map((r) => (
                    <li key={r.name}><Avatar name={r.name} size={34} /><div><b>{r.name}</b><span>{r.line}</span></div></li>
                  )) : <li className="nx-fine">No one else in memory connects to {firstName(c)} yet.</li>}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
