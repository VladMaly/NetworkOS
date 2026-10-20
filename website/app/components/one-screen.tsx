"use client"

/* Lanyard's one screen, drawn the way Interlinked's sign-in draws itself (the Light theme of
   CellsInterlinked/src/components/auth/one-screen-shell.tsx): the frost ground with an ink tooth, the page held in a
   frame, four faint copies of the panel around it, one pane of frosted glass with the mark notched into its top, and
   the ways in hanging from its foot as pockets. Here the ways in are what you give Lanyard: a badge, what you talked
   about, the event, and you. */

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { PEOPLE, GOALS, findPerson, warmthOf, drafts, type Goal, type Person } from "../lib/people"

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

/* ── the frame and the faint copies ─────────────────────────── */
const SHEETS: [number, number, number][] = [[-0.62, -0.38, 0.55], [0.66, -0.3, 0.45], [-0.7, 0.55, 0.5], [0.6, 0.62, 0.6]]
type Sheet = { left: number; top: number; width: number; height: number; r: number; clipPath: string }
const FRAME = 18, FRAME_PHONE = 8
const SHEET_LIGHT: [number, number][] = [[0, 0.15], [0.38, 0.035], [0.7, 0.018], [1, 0.06]]
const FRAME_LIGHT: [number, number][] = [[0, 0.16], [0.35, 0.035], [0.7, 0.018], [1, 0.06]]

function outline(w: number, h: number, r: number) {
  const x = 0.5, y = 0.5, W = w - 1, H = h - 1, c = r * (1 - Math.SQRT1_2), sx = x + c, sy = y + c
  const d = `M${sx},${sy} A${r},${r} 0 0 1 ${x + r},${y} H${x + W - r} A${r},${r} 0 0 1 ${x + W},${y + r} V${y + H - r} ` +
    `A${r},${r} 0 0 1 ${x + W - r},${y + H} H${x + r} A${r},${r} 0 0 1 ${x},${y + H - r} V${y + r} A${r},${r} 0 0 1 ${sx},${sy}`
  const dx = Math.sin((160 * Math.PI) / 180), dy = -Math.cos((160 * Math.PI) / 180), half = (w * Math.abs(dx) + h * Math.abs(dy)) / 2
  return { d, x1: w / 2 - dx * half, y1: h / 2 - dy * half, x2: w / 2 + dx * half, y2: h / 2 + dy * half }
}
function Outline({ id, w, h, r, light, className, style }: { id: string; w: number; h: number; r: number; light: [number, number][]; className: string; style?: CSSProperties }) {
  const o = outline(w, h, r)
  return (
    <svg className={className} style={style} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={o.x1} y1={o.y1} x2={o.x2} y2={o.y2}>
          {light.map(([at, a]) => <stop key={at} offset={at} style={{ stopColor: "#fff", stopOpacity: Math.min(1, a * 8) }} />)}
        </linearGradient>
      </defs>
      <path className="os-line" d={o.d} fill="none" stroke={`url(#${id})`} />
    </svg>
  )
}
function placeSheets(r: { left: number; top: number; right: number; bottom: number; width: number }, ref: number, W: number, H: number): Sheet[] {
  const f = (W <= 640 ? FRAME_PHONE : FRAME) + 1
  return SHEETS.map(([fx, fy, sc]) => {
    const width = r.width * sc, height = ref * sc
    let top = H / 2 + fy * H * 0.5 - height / 2, left = W / 2 + fx * W * 0.5 - width / 2
    if (top < r.bottom + 24 && top + height > r.top - 24 && left < r.right + 24 && left + width > r.left - 24) {
      if (fy > 0 && r.bottom + 24 + height * 0.6 <= H - f) top = r.bottom + 24
      else left = fx < 0 ? r.left - 24 - width : r.right + 24
    }
    const clipPath = `inset(${Math.max(0, f - top)}px ${Math.max(0, left + width - (W - f))}px ${Math.max(0, top + height - (H - f))}px ${Math.max(0, f - left)}px)`
    return { left, top, width, height, r: 20 * sc, clipPath }
  })
}

/* ── the panel's one shape: notch at the top, pocket at the foot ── */
const ICON = 77
const TOP = Math.round(ICON / 2), GAP = 9, FILLET = 12, PANEL_R = 20
const NOTCH_R = Math.round(ICON * 0.225) + GAP
const POCKET_R = 16, POCKET_FILLET = 12, POCKET_FOOT = 8
type Pocket = { top: number; h: number; sel: [number, number]; rest: [number, number][] }
const PocketContext = createContext<((p: Pocket | null) => void) | null>(null)

function pocketPath(a: number, b: number, y: number, depth: number, lf: number, rf: number) {
  const r = POCKET_R
  return `H${b + rf} Q${b},${y} ${b},${y + rf} V${y + depth - r} A${r},${r} 0 0 1 ${b - r},${y + depth} H${a + r} A${r},${r} 0 0 1 ${a},${y + depth - r} V${y + lf} Q${a},${y} ${a - lf},${y} `
}
function panelPath(w: number, h: number, pocket: Pocket | null) {
  const cx = w / 2, n0 = cx - ICON / 2 - GAP, n1 = cx + ICON / 2 + GAP, nb = ICON + GAP, t = TOP + 0.5, r = PANEL_R
  const y = pocket ? pocket.top + 0.5 : h - 0.5
  let dip = "", rl = r, rr = r
  if (pocket) {
    const a = Math.max(0.5, pocket.sel[0]), b = Math.min(w - 0.5, pocket.sel[1]), gl = a - 0.5, gr = w - 0.5 - b
    const lf = Math.min(POCKET_FILLET, gl / 2), rf = Math.min(POCKET_FILLET, gr / 2)
    rl = Math.max(0, Math.min(r, gl - lf)); rr = Math.max(0, Math.min(r, gr - rf))
    dip = pocketPath(a, b, y, pocket.h - POCKET_FOOT - 0.5, lf, rf)
  }
  return `M0.5,${t + r} A${r},${r} 0 0 1 ${r + 0.5},${t} H${n0 - FILLET} Q${n0},${t} ${n0},${t + FILLET} V${nb - NOTCH_R} A${NOTCH_R},${NOTCH_R} 0 0 0 ${n0 + NOTCH_R},${nb} ` +
    `H${n1 - NOTCH_R} A${NOTCH_R},${NOTCH_R} 0 0 0 ${n1},${nb - NOTCH_R} V${t + FILLET} Q${n1},${t} ${n1 + FILLET},${t} H${w - r - 0.5} A${r},${r} 0 0 1 ${w - 0.5},${t + r} ` +
    `V${y - rr} A${rr},${rr} 0 0 1 ${w - 0.5 - rr},${y} ${dip}H${0.5 + rl} A${rl},${rl} 0 0 1 0.5,${y - rl} Z`
}
function ghostPath([a, b]: [number, number], pocket: Pocket) {
  const r = POCKET_R, y0 = pocket.top + 1, yb = pocket.top + 0.5 + pocket.h - POCKET_FOOT - 0.5
  return `M${b},${y0} V${yb - r} A${r},${r} 0 0 1 ${b - r},${yb} H${a + r} A${r},${r} 0 0 1 ${a},${yb - r} V${y0}`
}

function WaysBar<K extends string>({ ways, on, onPick }: { ways: [K, string][]; on: K; onPick: (k: K) => void }) {
  const bar = useRef<HTMLDivElement>(null)
  const btns = useRef<(HTMLButtonElement | null)[]>([])
  const report = useContext(PocketContext)
  const [geo, setGeo] = useState<{ h: number; top: number; left: number } | null>(null)
  const shown = useRef<[number, number] | null>(null)
  const index = ways.findIndex(([k]) => k === on)

  useIsoLayoutEffect(() => {
    const el = bar.current
    if (!el) return
    const measure = () => setGeo((g) => (g && g.h === el.offsetHeight && g.top === el.offsetTop && g.left === el.offsetLeft ? g : { h: el.offsetHeight, top: el.offsetTop, left: el.offsetLeft }))
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    void document.fonts?.ready.then(() => { shown.current = null; measure(); setGeo((g) => (g ? { ...g } : g)) })
    return () => { ro.disconnect(); report?.(null) }
  }, [report])

  useIsoLayoutEffect(() => {
    const b = btns.current[index]
    if (!geo || !b) return
    const spanOf = (n: HTMLButtonElement): [number, number] => [geo.left + n.offsetLeft, geo.left + n.offsetLeft + n.offsetWidth]
    const rest = btns.current.filter((n, i): n is HTMLButtonElement => !!n && i !== index).map(spanOf)
    const push = (sel: [number, number]) => { shown.current = sel; report?.({ top: geo.top, h: geo.h, sel, rest }) }
    const to = spanOf(b), from = shown.current
    if (!from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { push(to); return }
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 450), e = 1 - Math.pow(1 - k, 3.2)
      push([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e])
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [index, geo, report])

  return (
    <div className="os-seg" role="tablist" ref={bar}>
      {ways.map(([k, t], i) => (
        <button key={k} ref={(n) => { btns.current[i] = n }} type="button" role="tab" aria-selected={k === on} className={k === on ? "os-on" : ""} onClick={() => onPick(k)}>{t}</button>
      ))}
    </div>
  )
}

/* the mark: L. on the ink tile, the stop in the brand orange */
export function Mark({ size = 77 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Lanyard" style={{ display: "block" }}>
      <defs>
        <linearGradient id="ly-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" /><stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.08" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="100" height="100" rx="22.5" fill="#232D36" />
      <rect x="0.6" y="0.6" width="98.8" height="98.8" rx="22" fill="none" stroke="url(#ly-edge)" strokeWidth="1.2" />
      <rect x="25" y="21" width="17" height="58" rx="2" fill="#F4F5F7" />
      <rect x="25" y="62" width="31" height="17" rx="2" fill="#F4F5F7" />
      <rect x="61" y="62" width="17" height="17" rx="3" fill="#EA7526" className="ly-beat" />
    </svg>
  )
}

function Panel({ children }: { children: ReactNode }) {
  const splitRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [pocket, setPocket] = useState<Pocket | null>(null)
  const [arrive, setArrive] = useState(true)
  const report = useCallback((p: Pocket | null) => setPocket(p), [])
  useIsoLayoutEffect(() => {
    const el = splitRef.current
    if (!el) return
    const measure = () => setBox((b) => (b && b.w === el.offsetWidth && b.h === el.offsetHeight ? b : { w: el.offsetWidth, h: el.offsetHeight }))
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { const t = window.setTimeout(() => setArrive(false), 3800); return () => window.clearTimeout(t) }, [])
  const d = box ? panelPath(box.w, box.h, pocket) : ""
  const frame = box ? { width: box.w, height: box.h, viewBox: `0 0 ${box.w} ${box.h}` } : null
  return (
    <div className={`os-split os-notched${box ? " os-drawn" : ""}${arrive ? " os-arrive" : ""}`} ref={splitRef}>
      {frame && (
        <>
          <svg className="os-shade" {...frame} aria-hidden><path d={d} /></svg>
          <div className="os-glass" style={{ clipPath: `path("${d}")` }} aria-hidden><i className="os-light" /></div>
          <svg className="os-outline" {...frame} aria-hidden>
            <defs>
              <linearGradient id="os-outline-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" /><stop offset="0.38" stopColor="rgba(255,255,255,0.75)" /><stop offset="0.7" stopColor="rgba(255,255,255,0.4)" /><stop offset="1" stopColor="rgba(255,255,255,0.7)" />
              </linearGradient>
            </defs>
            <path d={d} fill="none" stroke="url(#os-outline-edge)" strokeWidth="1" />
            {pocket?.rest.map((s, i) => <path key={i} className="os-ghost-p" d={ghostPath(s, pocket)} />)}
          </svg>
        </>
      )}
      <PocketContext.Provider value={report}>{children}</PocketContext.Provider>
    </div>
  )
}

/* ── the screen ─────────────────────────────────────────────── */
type Way = "badge" | "note" | "event" | "you"
const WAYS: [Way, string][] = [["badge", "Badge"], ["note", "Voice note"], ["event", "Event"], ["you", "You"]]
const LENGTHS: [number, string][] = [[3, "2 min"], [10, "10 min"], [20, "20 min"], [30, "30+"]]

const COPY_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
const CHAT_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
const HAND_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 12h10M13 8l4 4-4 4M3 5v14M21 5v14" /></svg>
const SEND_ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 12l16-8-6 16-3-7z" /></svg>

export function OneScreen({ children }: { children?: ReactNode }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "")
  const pageRef = useRef<HTMLDivElement>(null)
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [frame, setFrame] = useState<{ f: number; w: number; h: number } | null>(null)

  const [way, setWay] = useState<Way>("badge")
  const [query, setQuery] = useState("")
  const [person, setPerson] = useState<Person | null>(null)
  const [miss, setMiss] = useState(false)
  const [topic, setTopic] = useState("")
  const [minutes, setMinutes] = useState(10)
  const [event, setEvent] = useState("lu.ma/agents-night-sf")
  const [eventRead, setEventRead] = useState(false)
  const [building, setBuilding] = useState("A tool that turns meeting notes into tasks")
  const [goal, setGoal] = useState<Goal>("beta")
  const [giveFirst, setGiveFirst] = useState(true)
  const [copied, setCopied] = useState<string | null>(null)

  // the frame and the copies, placed round the panel as it stands with the page at the top
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    const place = () => {
      const el = page.querySelector<HTMLElement>(".os-split")
      if (!el) return
      const b = el.getBoundingClientRect(), y = window.scrollY, W = window.innerWidth, H = window.innerHeight
      const r = { left: b.left, right: b.right, width: b.width, top: b.top + y, bottom: b.bottom + y }
      page.style.setProperty("--cx", `${((r.left + r.width / 2) / W) * 100}%`)
      page.style.setProperty("--cy", `${((r.top + b.height / 2) / H) * 100}%`)
      const fi = W <= 640 ? FRAME_PHONE : FRAME
      setFrame((o) => (o && o.f === fi && o.w === W - 2 * fi && o.h === H - 2 * fi ? o : { f: fi, w: W - 2 * fi, h: H - 2 * fi }))
      setSheets(placeSheets(r, 341, W, H))
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [])

  function find(q = query) {
    const p = findPerson(q)
    setPerson(p)
    setMiss(!p)
    if (p) {
      setQuery(p.name)
      if (!topic) setTopic(p.topic)
      setWay("note")
    }
  }
  function pickSample(p: Person) {
    setQuery(p.name)
    setPerson(p)
    setMiss(false)
    setTopic(p.topic)
  }
  async function copy(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(key); window.setTimeout(() => setCopied(null), 1600) } catch { setCopied(null) }
  }

  const warmth = person ? warmthOf(person, minutes, topic) : null
  const d = person ? drafts(person, topic, goal, giveFirst) : null

  return (
    <div className="os-page" ref={pageRef}>
      {frame && <Outline id={`${uid}f`} className="os-frame" style={{ left: frame.f, top: frame.f }} w={frame.w} h={frame.h} r={frame.f === FRAME ? 28 : 22} light={FRAME_LIGHT} />}
      {sheets.map(({ left, top, width, height, r, clipPath }, i) => (
        <Outline key={i} id={`${uid}s${i}`} className={`os-sheet${i % 2 ? " os-sheet-f" : ""}`} style={{ left, top, clipPath }} w={width} h={height} r={r} light={SHEET_LIGHT} />
      ))}

      <header className="ly-top">
        <a className="ly-word" href="#top">Lanyard<span>.</span></a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#join">Early access</a>
          <a href="/home">Open NetworkOS</a>
        </nav>
      </header>

      <div className="os-stage" id="top">
        <div className="os-box">
          <Panel>
            <div className="os-logo"><Mark /></div>
            <div className="os-chip">
              {person ? (
                <>Following up with <b>{person.name}</b> from <b className="os-mono">{person.event.toUpperCase()}</b></>
              ) : (
                <>Warm intros from <b>the room you&apos;re in</b></>
              )}
            </div>

            <div className="os-col" id="os-left">
              {way === "badge" && (
                <div className="os-pane" key="badge">
                  <form className="os-col" onSubmit={(e) => { e.preventDefault(); find() }}>
                    <label className="os-field">
                      <span className="sr">Name or company on the badge</span>
                      <input className={`os-in${miss ? " os-bad" : ""}`} value={query} onChange={(e) => { setQuery(e.target.value); setMiss(false) }} placeholder="Name or company on the badge" autoComplete="off" autoFocus />
                    </label>
                    <button className="os-btn os-main" type="submit">Find them</button>
                  </form>
                  <div className="os-ghost os-samples">
                    {PEOPLE.map((p) => (
                      <button key={p.id} type="button" className={person?.id === p.id ? "is-on" : ""} onClick={() => pickSample(p)}>{p.name.split(" ")[0]}</button>
                    ))}
                  </div>
                  {miss && <p className="os-err">This demo knows three sample badges. Try Maya, Dev or Lena.</p>}
                </div>
              )}
              {way === "note" && (
                <div className="os-pane" key="note">
                  <label className="os-field">
                    <span className="sr">What you talked about</span>
                    <input className="os-in" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What you talked about" autoComplete="off" />
                  </label>
                  <div className="os-ghost os-lengths" role="group" aria-label="How long you talked">
                    {LENGTHS.map(([m, t]) => (
                      <button key={m} type="button" className={minutes === m ? "is-on" : ""} onClick={() => setMinutes(m)}>{t}</button>
                    ))}
                  </div>
                  <p className="os-note">Ten seconds, right after the chat. This is the warm part: every draft picks up from here.</p>
                </div>
              )}
              {way === "event" && (
                <div className="os-pane" key="event">
                  <form className="os-col" onSubmit={(e) => { e.preventDefault(); setEventRead(true) }}>
                    <label className="os-field">
                      <span className="sr">Event link</span>
                      <input className="os-in" value={event} onChange={(e) => { setEvent(e.target.value); setEventRead(false) }} placeholder="lu.ma/your-event" autoComplete="off" />
                    </label>
                    <button className="os-btn os-main" type="submit">Read the event</button>
                  </form>
                  <p className="os-note">
                    {eventRead ? <>Agents Night SF: 3 hosts, 6 speakers, 140 going. <b>5 to find tonight</b>, nobody messaged.</> : <>Hosts, speakers and the public guest list, ranked before you arrive.</>}
                  </p>
                </div>
              )}
              {way === "you" && (
                <div className="os-pane" key="you">
                  <label className="os-field">
                    <span className="sr">What you are building</span>
                    <input className="os-in" value={building} onChange={(e) => setBuilding(e.target.value)} placeholder="What you're building" autoComplete="off" />
                  </label>
                  <div className="os-ghost os-goals" role="group" aria-label="What you need this week">
                    {GOALS.map(([g, t]) => (
                      <button key={g} type="button" className={goal === g ? "is-on" : ""} onClick={() => setGoal(g)}>{t}</button>
                    ))}
                  </div>
                  <label className="os-check">
                    <input type="checkbox" checked={giveFirst} onChange={(e) => setGiveFirst(e.target.checked)} />
                    Offer something before asking
                  </label>
                </div>
              )}
            </div>

            <div className="os-vor" aria-hidden><span /></div>

            <div className="os-col" id="os-right">
              {person && d && warmth !== null ? (
                <>
                  <div className="os-who">
                    <span className="os-av" aria-hidden>{person.name[0]}</span>
                    <span>{person.name} · {person.role}, {person.co}</span>
                    <span className="os-warm" title="Warmth">{warmth}</span>
                  </div>
                  <button type="button" className="os-btn os-pv" onClick={() => copy("opener", d.opener)}>
                    {CHAT_ICON}<span>Opener</span><span className="os-tag">{copied === "opener" ? "Copied" : "Say it now"}</span>
                  </button>
                  <button type="button" className="os-btn os-pv" onClick={() => copy("follow", d.followUp)}>
                    {SEND_ICON}<span>Follow-up</span><span className="os-tag">{copied === "follow" ? "Copied" : "Tonight"}</span>
                  </button>
                </>
              ) : (
                <div className="os-side">
                  <h3>Three warm drafts</h3>
                  <p>Snap or type a badge. Lanyard finds who they are, adds <b>what you talked about</b>, and writes the opener, the follow-up and the intro ask.</p>
                  <p className="os-faint">Never a stranger. Never sent without your tap.</p>
                </div>
              )}
            </div>

            <WaysBar ways={WAYS} on={way} onPick={setWay} />
          </Panel>

          {/* the drafts in full, on a pane of the same glass under the panel */}
          {person && d && warmth !== null && (
            <section className="ly-pane ly-drafts" aria-label="Drafts">
              <div className="ly-meter">
                <div className="ly-meter-top"><span className="ly-eyebrow">Warmth</span><b>{warmth}</b></div>
                <div className="ly-bar"><i style={{ left: `${warmth}%` }} /></div>
                <div className="ly-legend"><span>cold</span><span>met tonight · {LENGTHS.find(([m]) => m === minutes)?.[1]}{topic.trim().length > 3 ? " · real topic" : ""}{person.mutual ? ` · mutual: ${person.mutual}` : ""}</span><span>warm</span></div>
              </div>
              <div className="ly-draft">
                <div className="ly-draft-head"><span className="ly-eyebrow">Follow-up</span><button type="button" className="ly-copy" onClick={() => copy("follow", d.followUp)}>{COPY_ICON}{copied === "follow" ? "Copied" : "Copy"}</button></div>
                <p>{d.followUp}</p>
              </div>
              {d.intro && (
                <div className="ly-draft">
                  <div className="ly-draft-head"><span className="ly-eyebrow">Intro ask · to {person.mutual}</span><button type="button" className="ly-copy" onClick={() => copy("intro", d.intro!)}>{HAND_ICON}{copied === "intro" ? "Copied" : "Copy"}</button></div>
                  <p>{d.intro}</p>
                </div>
              )}
              <p className="ly-fine">Fit for {GOALS.find(([g]) => g === goal)?.[1].toLowerCase()}: <b>{person.fit[goal]}</b>. Built for: {building || "your project"}. This demo writes from templates in your browser.</p>
            </section>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
