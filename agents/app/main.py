"""The agents service. Only the website calls it: every route but /health needs the shared secret and the signed-in
user's Google ID (X-User-Id)."""
import asyncio
import hmac
import logging
from contextlib import asynccontextmanager
from typing import Annotated, Any, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import col, select

from . import store
from .config import AGENTS_SECRET, PRICE_IN, PRICE_OUT
from .pipeline import approve, run_pipeline
from .store import Contact, Interaction, Run, User, now, session

logging.basicConfig(level=logging.INFO)
_tasks: set[asyncio.Task[None]] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init()
    yield


app = FastAPI(title="NetworkOS agents", lifespan=lifespan)


def user_id(authorization: Annotated[str, Header()] = "", x_user_id: Annotated[str, Header()] = "") -> str:
    if not AGENTS_SECRET:
        raise HTTPException(503, "AGENTS_SECRET isn't set on the agents service.")
    if not hmac.compare_digest(authorization, f"Bearer {AGENTS_SECRET}"):
        raise HTTPException(401, "Wrong or missing agents secret.")
    if not x_user_id:
        raise HTTPException(400, "Missing X-User-Id.")
    return x_user_id


Uid = Annotated[str, Depends(user_id)]


def _user(uid: str) -> User:
    with session() as s:
        u = s.get(User, uid)
    if not u:
        raise HTTPException(404, "Unknown user. Sign in again.")
    return u


def _run_out(r: Run) -> dict[str, Any]:
    d = r.model_dump(mode="json")
    tin = sum(v["input"] for v in r.usage.values())
    tout = sum(v["output"] for v in r.usage.values())
    d["cost_usd"] = round(tin / 1e6 * PRICE_IN + tout / 1e6 * PRICE_OUT, 4)
    return d


def _contact_out(c: Contact, runs: dict[str, Run]) -> dict[str, Any]:
    d = c.model_dump(mode="json")
    last = runs.get(c.last_run_id or "")
    d["last_status"] = last.status if last else None
    return d


@app.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}


# ── you ──

class MeIn(BaseModel):
    name: str = ""
    email: str = ""


class MePatch(BaseModel):
    building: Optional[str] = None
    goal: Optional[str] = None
    voice: Optional[str] = None


@app.put("/me")
def put_me(body: MeIn, uid: Uid) -> dict[str, Any]:
    with session() as s:
        u = s.get(User, uid) or User(id=uid)
        u.name, u.email = body.name or u.name, body.email or u.email
        s.add(u)
        s.commit()
        return u.model_dump(mode="json")


@app.get("/me")
def get_me(uid: Uid) -> dict[str, Any]:
    return _user(uid).model_dump(mode="json")


@app.patch("/me")
def patch_me(body: MePatch, uid: Uid) -> dict[str, Any]:
    u = _user(uid)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(u, k, v.strip()[:400])
    with session() as s:
        s.merge(u)
        s.commit()
    return u.model_dump(mode="json")


# ── runs ──

class CaptureIn(BaseModel):
    text: str


@app.post("/capture")
async def capture(body: CaptureIn, uid: Uid) -> dict[str, str]:
    _user(uid)
    text = body.text.strip()
    if not text:
        raise HTTPException(400, "Tell NetworkOS what happened or what you want to know.")
    run = Run(user_id=uid, request=text[:4000])
    with session() as s:
        s.add(run)
        s.commit()
    task = asyncio.create_task(run_pipeline(run.id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"run_id": run.id}


def _own_run(uid: str, run_id: str) -> Run:
    with session() as s:
        r = s.get(Run, run_id)
    if not r or r.user_id != uid:
        raise HTTPException(404, "No such run.")
    return r


@app.get("/runs/{run_id}")
def get_run(run_id: str, uid: Uid) -> dict[str, Any]:
    return _run_out(_own_run(uid, run_id))


class ApproveIn(BaseModel):
    body: Optional[str] = None


@app.post("/runs/{run_id}/approve")
async def approve_run(run_id: str, body: ApproveIn, uid: Uid) -> dict[str, Any]:
    r = _own_run(uid, run_id)
    if r.status != "waiting":
        raise HTTPException(409, "This draft isn't waiting for approval.")
    with session() as s:
        c = s.get(Contact, r.contact_id) if r.contact_id else None
    await approve(r, c, body.body)
    return _run_out(r)


@app.post("/runs/{run_id}/reject")
def reject_run(run_id: str, uid: Uid) -> dict[str, Any]:
    r = _own_run(uid, run_id)
    if r.status != "waiting":
        raise HTTPException(409, "This draft isn't waiting for approval.")
    r.status, r.updated_at = "rejected", now()
    r.log = [*r.log, {"t": now().astimezone().strftime("%H:%M:%S"), "text": "Rejected by you. Nothing was sent."}]
    with session() as s:
        s.merge(r)
        if r.contact_id:
            s.add(Interaction(user_id=uid, contact_id=r.contact_id, what="You rejected a draft"))
        s.commit()
    return _run_out(r)


# ── people ──

@app.get("/people")
def people(uid: Uid) -> list[dict[str, Any]]:
    with session() as s:
        cs = s.exec(select(Contact).where(Contact.user_id == uid).order_by(col(Contact.score).desc(), col(Contact.updated_at).desc())).all()
        ids = [c.last_run_id for c in cs if c.last_run_id]
        runs = {r.id: r for r in s.exec(select(Run).where(col(Run.id).in_(ids))).all()} if ids else {}
    return [_contact_out(c, runs) for c in cs]


def _own_contact(uid: str, contact_id: str) -> Contact:
    with session() as s:
        c = s.get(Contact, contact_id)
    if not c or c.user_id != uid:
        raise HTTPException(404, "No such person.")
    return c


@app.get("/people/{contact_id}")
def person(contact_id: str, uid: Uid) -> dict[str, Any]:
    c = _own_contact(uid, contact_id)
    with session() as s:
        inter = s.exec(select(Interaction).where(Interaction.contact_id == c.id).order_by(col(Interaction.at))).all()
        run = s.get(Run, c.last_run_id) if c.last_run_id else None
    return {
        "contact": _contact_out(c, {run.id: run} if run else {}),
        "interactions": [i.model_dump(mode="json") for i in inter],
        "run": _run_out(run) if run else None,
    }


EDITABLE = {"role", "company", "event", "met_where", "met_date", "discussed", "they_said", "they_promised", "i_promised", "mutual",
            "next_action", "next_date", "status", "notes"}


@app.patch("/people/{contact_id}")
def patch_person(contact_id: str, body: dict[str, Any], uid: Uid) -> dict[str, Any]:
    c = _own_contact(uid, contact_id)
    for k, v in body.items():
        if k in EDITABLE and isinstance(v, str):
            setattr(c, k, v[:2000])
    c.updated_at = now()
    with session() as s:
        s.merge(c)
        s.commit()
    return _contact_out(c, {})
