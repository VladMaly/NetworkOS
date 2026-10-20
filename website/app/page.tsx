import { OneScreen } from "./components/one-screen"
import { Waitlist } from "./components/waitlist"

const STEPS = [
  ["Read", "The badge and the Luma page.", "name · company · event"],
  ["Find", "Public profiles. Asks you if unsure.", "profile links"],
  ["Enrich", "Role, recent posts, mutuals.", "person card"],
  ["Match", "Fit with your goals, and how warm.", "ranked people"],
  ["Write", "Picks up your chat, in your voice.", "opener · follow-up · intro"],
]

const IDEAS = [
  ["Give first", "Every message offers something before it asks: an intro, a link, a name from tonight."],
  ["Intros from your night", "Two people you met need each other. Both say yes before anything is sent."],
  ["Mutual paths", "Missed the speaker? Lanyard finds who in your memory knows you both."],
  ["Badge swap", "Both scan one QR and profiles trade with consent. The warmest possible start."],
  ["Warmth cools", "A chat stays warm about three days. You get a nudge before it goes cold."],
  ["Night recap", "Who you met, what you promised, what is sent and what is waiting."],
]

export default function Page() {
  return (
    <OneScreen>
      <main className="ly-below">
        <section className="ly-section" id="how">
          <div className="ly-head">
            <span className="ly-eyebrow">How it works</span>
            <h2>A badge and a voice note in. <b>Three warm drafts out.</b></h2>
          </div>
          <ol className="ly-steps">
            {STEPS.map(([t, p, o], i) => (
              <li key={t} className={`ly-pane ly-step${t === "Match" ? " is-hot" : ""}`}>
                <span className="ly-n">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{p}</p>
                <span className="ly-out">{o}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="ly-section">
          <div className="ly-head">
            <span className="ly-eyebrow">Warm, never cold</span>
            <h2>The handshake is the warm part. <b>Lanyard makes sure you follow up.</b></h2>
          </div>
          <div className="ly-versus">
            <div className="ly-cold">
              <span className="ly-eyebrow">Cold outreach</span>
              <p className="ly-quote">&ldquo;Hi Maya, I&apos;m the founder of NoteFlow, an AI tool that...&rdquo;</p>
              <span className="ly-fine">A stranger from a list. A pitch. No reason to reply.</span>
            </div>
            <div className="ly-pane ly-warm">
              <span className="ly-eyebrow">Lanyard</span>
              <p className="ly-quote">&ldquo;Great talking agent memory with you by the demo tables. Here&apos;s the demo I mentioned.&rdquo;</p>
              <span className="ly-fine">Someone you met tonight. Your real conversation. Something offered first.</span>
            </div>
          </div>
        </section>

        <section className="ly-section">
          <div className="ly-head">
            <span className="ly-eyebrow">What&apos;s new in the idea</span>
            <h2>More than a badge scanner. <b>A memory for your network.</b></h2>
          </div>
          <div className="ly-ideas">
            {IDEAS.map(([t, p]) => (
              <div key={t} className="ly-idea">
                <h3>{t}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="ly-section ly-join" id="join">
          <div className="ly-head">
            <span className="ly-eyebrow">Early access</span>
            <h2>Go to the next event <b>with Lanyard.</b></h2>
          </div>
          <Waitlist />
        </section>

        <footer className="ly-legal">
          <span>Lanyard, a hackathon build</span>
          <span>Public profiles only · badge photos deleted once read · nothing sends without your tap</span>
        </footer>
      </main>
    </OneScreen>
  )
}
