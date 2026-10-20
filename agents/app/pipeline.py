"""One run: Planner → Research → Strategist → Outreach, with Cognee memory read on the way in and written once you
approve. Each step saves the run, so the dashboard (polling GET /runs/{id}) shows progress as it happens."""
import logging
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel
from sqlmodel import select

from . import memory
from .band import handoff
from .config import RESEARCH_WEB
from .llm import AgentError, ask
from .store import Contact, Interaction, Run, User, now, session

log = logging.getLogger("networkos.pipeline")

GOALS = {"beta": "beta users", "investors": "investors", "cofounder": "a cofounder", "hiring": "hires"}


# ── what each agent answers ─────────────────────────────────────────────

class Plan(BaseModel):
    kind: Literal["capture", "question"]
    question: str
    person_name: str
    company: str
    role: str
    event: str
    met_where: str
    met_date: str
    discussed: str
    they_said: str
    they_promised: str
    i_promised: str
    mutual: str
    existing_contact_id: str


class Research(BaseModel):
    role: str
    company: str
    recent: str
    summary: str
    confidence: Literal["high", "medium", "low"]


class Strategy(BaseModel):
    score: int
    signal: str
    next_action: str
    next_date: str
    why: str
    give_first: str
    status: str
    tags: list[str]


class Answer(BaseModel):
    answer: str
    contact_ids: list[str]


class Draft(BaseModel):
    subject: str
    body: str


# ── prompts ────────────────────────────────────────────────────────────

PLANNER = """You are the Planner on NetworkOS, an AI relationship team for a startup founder.
Read what the founder said and pull out the facts. Use only what they said; leave a field as "" when they didn't say it.
- kind is "capture" when they describe meeting or talking with a specific person, or ask you to act on one person (draft, redraft, follow up). It is "question" when they ask something about their network as a whole, such as who to follow up with.
- For a question, restate it in "question" and leave the person fields "".
- met_date is an ISO date (YYYY-MM-DD). Resolve words like "yesterday" against today's date.
- If the person is already in their contacts (same name, or clearly the same person), put that contact's id in existing_contact_id, otherwise ""."""

RESEARCH = """You are the Research agent on NetworkOS. Use web search to find public information about one person a founder just met.
Public pages only: company sites, news, talks, public posts, public profiles. Never guess. If you can't tell which person it is, say so in summary and set confidence to "low".
- role and company: their current ones, or the ones given if you can't confirm better.
- recent: one sentence about something recent and public that matters for a conversation (a post, launch, hire, raise, talk). "" if none.
- summary: two sentences on who they are."""

STRATEGIST = """You are the Strategist on NetworkOS. Decide how much this relationship matters to the founder this week and what to do next.
- score: 1 to 10 for how much this person can help with what the founder needs this week, weighted by how warm the relationship is (met in person, real conversation, promises made, a mutual).
- signal: two to four words for why now (for example "Hiring signal", "Potential investor", "Beta fit").
- next_action: a short imperative, such as "Follow up tonight", "Send the deck", "Ask for an intro".
- next_date: ISO date for the next action. Promises are due soon; a warm chat cools in about three days.
- why: one sentence the founder can act on.
- give_first: something concrete the founder can offer this person before asking for anything, based only on the facts given. "" if nothing fits.
- status: a few words on the relationship, such as "Warm, met yesterday".
- tags: up to five short tags."""

ANSWERER = """You are the Strategist on NetworkOS. Answer the founder's question about their network using only their contacts and memory below. Be specific and short: names, why, and what to do. If the answer isn't in what you have, say so. List the ids of contacts you mention in contact_ids."""

OUTREACH = """You are the Outreach agent on NetworkOS. Write the follow-up email from the founder to this person.
- Pick up the real conversation: name the place and what you talked about. Keep any promise the founder made.
- Offer the give_first item if there is one, then make one clear ask that fits the next action.
- Under 120 words. Plain, warm, specific. No hype, no invented facts, no placeholders in brackets.
- Nothing is attached and no link is included unless the facts give one: say you'll send it, or that it's below, never that it's attached.
- Write in the founder's voice and sign with their first name.
- subject: short and specific."""


# ── helpers ────────────────────────────────────────────────────────────

def _say(run: Run, text: str) -> None:
    run.log = [*run.log, {"t": datetime.now().strftime("%H:%M:%S"), "text": text}]


def _note(run: Run, i: int, *lines: str) -> None:
    notes = [list(n) for n in run.notes]
    notes[i] = [*notes[i], *[l for l in lines if l]]
    run.notes = notes


def _use(run: Run, agent: str, u: dict[str, int]) -> None:
    prev = run.usage.get(agent, {"input": 0, "output": 0})
    run.usage = {**run.usage, agent: {"input": prev["input"] + u["input"], "output": prev["output"] + u["output"]}}


def _save(*objs: object) -> None:
    with session() as s:
        for o in objs:
            s.merge(o)
        s.commit()


def _card(c: Contact) -> str:
    rows = [("Name", c.name), ("Role", c.role), ("Company", c.company), ("Event", c.event), ("Where", c.met_where), ("Date", c.met_date),
            ("Talked about", c.discussed), ("They said", c.they_said), ("They promised", c.they_promised), ("I promised", c.i_promised),
            ("Recent", c.recent), ("Mutual", c.mutual), ("Notes", c.notes)]
    return "\n".join(f"{k}: {v}" for k, v in rows if v)


def _me(u: User) -> str:
    return f"Founder: {u.name}\nBuilding: {u.building or 'not given'}\nNeeds this week: {GOALS.get(u.goal, u.goal)}\nWriting voice: {u.voice}"


def _note_text(c: Contact, request: str) -> str:
    return f"Meeting note about {c.name}" + (f" ({c.role} at {c.company})" if c.company else "") + f".\nWhat the founder said: {request}\n{_card(c)}"


# ── the run ────────────────────────────────────────────────────────────

async def run_pipeline(run_id: str) -> None:
    with session() as s:
        run = s.get(Run, run_id)
        user = s.get(User, run.user_id) if run else None
        contacts = list(s.exec(select(Contact).where(Contact.user_id == run.user_id)).all()) if run else []
    if not run or not user:
        return
    try:
        await _run(run, user, contacts)
    except AgentError as e:
        run.status, run.error = "failed", str(e)
        _say(run, f"Stopped: {e}")
        _save(run)
    except Exception as e:  # keep the service up and tell the dashboard
        log.exception("run %s failed", run_id)
        run.status, run.error = "failed", "Something went wrong in the agents service. Check its logs."
        _say(run, f"Stopped: {type(e).__name__}")
        _save(run)


async def _run(run: Run, user: User, contacts: list[Contact]) -> None:
    today = date.today().isoformat()

    # 0 · Planner
    _say(run, "Reading your request")
    known = "\n".join(f"- {c.id}: {c.name}, {c.role} at {c.company}" for c in contacts) or "(none yet)"
    plan, u, _ = await ask(Plan, PLANNER, f"Today is {today}.\n\nTheir contacts:\n{known}\n\nWhat they said:\n{run.request}", effort="low")
    _use(run, "Planner", u)

    if plan.kind == "question" or not plan.person_name:
        await _answer(run, user, contacts, plan.question or run.request)
        return

    contact = next((c for c in contacts if c.id == plan.existing_contact_id), None)
    is_new = contact is None
    if contact is None:
        contact = Contact(user_id=user.id, name=plan.person_name)
    for field in ("company", "role", "event", "met_where", "met_date", "discussed", "they_said", "they_promised", "i_promised", "mutual"):
        value = getattr(plan, field).strip()
        if value:
            setattr(contact, field, value)
    contact.updated_at = now()
    contact.last_run_id = run.id
    run.contact_id = contact.id
    _note(run, 0, "Understood your request and made a plan", f"{'New contact' if is_new else 'Updating'}: {contact.name}")
    _say(run, f"Plan: research {contact.name}, score, draft")
    handoff(run, "Planner", "Research", f"Look up {contact.name}" + (f" at {contact.company}" if contact.company else ""))
    run.stage = 1
    _save(contact, run, Interaction(user_id=user.id, contact_id=contact.id, what=run.request))

    # 1 · Memory, then Research
    _say(run, "Retrieving past context from Cognee")
    context = await memory.recall(user.id, f"What do I know about {contact.name}" + (f" from {contact.company}" if contact.company else "") + "?")
    memory.remember_later(user.id, _note_text(contact, run.request))
    _note(run, 1, "Saved the note to memory", "Found earlier context in memory" if context else "")
    if RESEARCH_WEB:
        _say(run, f"Searching public profiles for {contact.name}")
        _save(run)
        found, u, sources = await ask(Research, RESEARCH, f"Who is this person?\n{_card(contact)}", effort="medium", web=True)
        _use(run, "Research", u)
        if found.confidence != "low":
            contact.role = found.role or contact.role
            contact.company = found.company or contact.company
        contact.recent = found.recent or contact.recent
        run.sources = sources[:6]
        _note(run, 1, f"Found {contact.name}'s public profile" if found.confidence != "low" else f"Not sure which {contact.name} this is",
              f"Signal: {found.recent}" if found.recent else "", f"{len(sources)} public sources read" if sources else "")
        summary = (found.summary or "Research finished").split(". ")[0].rstrip(".")
        _say(run, summary[:180] + ("…" if len(summary) > 180 else ""))
    handoff(run, "Research", "Strategist", "Person card with role, recent signal and memory")
    run.stage = 2
    _save(contact, run)

    # 2 · Strategist
    _say(run, "Weighing fit against what you need this week")
    plan_s, u, _ = await ask(Strategy, STRATEGIST, f"Today is {today}.\n\n{_me(user)}\n\nPerson:\n{_card(contact)}\n\nFrom memory:\n{context or '(nothing yet)'}", effort="medium")
    _use(run, "Strategist", u)
    contact.score = max(1, min(10, plan_s.score))
    contact.signal, contact.next_action, contact.next_date = plan_s.signal, plan_s.next_action, plan_s.next_date
    contact.why, contact.give, contact.status, contact.tags = plan_s.why, plan_s.give_first, plan_s.status, plan_s.tags[:5]
    _note(run, 2, "Read past interactions", f"Scored the opportunity: {contact.score}/10", f"Recommended: {plan_s.next_action.lower()}")
    _say(run, f"Scored {contact.score}/10 for {GOALS.get(user.goal, user.goal)}")
    handoff(run, "Strategist", "Outreach", f"{plan_s.next_action}. {plan_s.why}")
    run.stage = 3
    _save(contact, run)

    # 3 · Outreach
    _say(run, f"Writing in your style: {user.voice}")
    draft, u, _ = await ask(Draft, OUTREACH, f"{_me(user)}\n\nPerson:\n{_card(contact)}\n\nNext action: {contact.next_action}\nWhy: {contact.why}\nGive first: {contact.give or '(none)'}", effort="medium")
    _use(run, "Outreach", u)
    run.draft_subject, run.draft_body = draft.subject, draft.body
    _note(run, 3, "Wrote a personalized follow-up", f"Matched your style: {user.voice}", "Ready for your approval")
    _say(run, "Draft completed. Awaiting your approval.")
    handoff(run, "Outreach", "You", "Follow-up draft, waiting for your approval")
    run.stage, run.status, run.updated_at = 4, "waiting", now()
    _save(contact, run)


async def _answer(run: Run, user: User, contacts: list[Contact], question: str) -> None:
    run.kind = "question"
    _note(run, 0, "Understood your question")
    handoff(run, "Planner", "Strategist", question)
    run.stage = 1
    _say(run, "Searching your memory")
    _save(run)

    context = await memory.recall(user.id, question)
    _note(run, 1, "Searched memory", f"Read {len(contacts)} contacts")
    run.stage = 2
    _save(run)

    people = "\n\n".join(f"id {c.id}\n{_card(c)}\nScore: {c.score}/10\nNext: {c.next_action} by {c.next_date}" for c in contacts) or "(no contacts yet)"
    ans, u, _ = await ask(Answer, ANSWERER, f"Today is {date.today().isoformat()}.\n\n{_me(user)}\n\nContacts:\n{people}\n\nFrom memory:\n{context or '(nothing yet)'}\n\nQuestion: {question}", effort="medium")
    _use(run, "Strategist", u)
    run.answer = ans.answer
    run.contact_id = next((i for i in ans.contact_ids if any(c.id == i for c in contacts)), None)
    _note(run, 2, "Answered from your contacts and memory")
    _note(run, 3, "Nothing to draft for a question")
    _say(run, "Answer ready")
    run.stage, run.status, run.updated_at = 4, "answered", now()
    _save(run)


async def approve(run: Run, contact: Optional[Contact], body: Optional[str]) -> None:
    if body is not None and body.strip():
        run.draft_body = body
    run.status, run.updated_at = "approved", now()
    _say(run, "Approved by you. Saved to memory.")
    _save(run)
    if contact:
        outcome = f"The founder approved a follow-up to {contact.name}. Subject: {run.draft_subject}\n{run.draft_body}"
        _save(Interaction(user_id=run.user_id, contact_id=contact.id, what=f"You approved the follow-up: {run.draft_subject}"))
        memory.remember_later(run.user_id, outcome)
