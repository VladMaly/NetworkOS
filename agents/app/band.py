"""Handoffs between agents, through Band. Each agent (Planner, Research, Strategist, Outreach) is a remote agent in
Band with its own ID and key. A run gets its own Band room: the Planner opens it, adds the other agents and the founder,
and every handoff is a message from one agent @mentioning the next, so the founder can watch the team work in Band.

Handoffs are also recorded on the run (from, to, what) for the dashboard's Band panel. Band is best effort: if its keys
aren't set or a call fails, the run carries on and the handoff is only recorded locally."""
import asyncio
import logging
import os
from dataclasses import dataclass
from typing import Optional

from band.client.rest import DEFAULT_REQUEST_OPTIONS, AsyncRestClient, ChatRoomRequest
from band.runtime.tools import AgentTools

from .store import Run

log = logging.getLogger("relationshipos.band")


@dataclass(frozen=True)
class BandAgent:
    name: str
    agent_id: str
    api_key: str
    handle: str


def _agent(name: str, prefix: str) -> Optional[BandAgent]:
    agent_id, key, handle = (os.environ.get(f"{prefix}_{k}", "") for k in ("AGENT_ID", "API_KEY", "HANDLE"))
    return BandAgent(name, agent_id, key, handle) if agent_id and key and handle else None


AGENTS = {a.name: a for a in (_agent("Planner", "PLANNER"), _agent("Research", "RESEARCH"), _agent("Strategist", "STRATEGIST"), _agent("Outreach", "OUTREACH")) if a}
PLANNER = AGENTS.get("Planner")
# The founder who owns these agents; their handle is the agents' handle prefix (vladmaly7/relationshipos-planner).
OWNER = os.environ.get("BAND_OWNER_HANDLE") or (PLANNER.handle.split("/")[0] if PLANNER else "")

_rest: dict[str, AsyncRestClient] = {}
_rooms: dict[str, asyncio.Task[Optional[str]]] = {}  # run id → its room
_chain: dict[str, asyncio.Task[None]] = {}  # run id → last post, so messages land in order


def enabled() -> bool:
    return PLANNER is not None


def _client(agent: BandAgent) -> AsyncRestClient:
    if agent.name not in _rest:
        _rest[agent.name] = AsyncRestClient(api_key=agent.api_key)
    return _rest[agent.name]


async def _open_room(title: str) -> Optional[str]:
    assert PLANNER
    try:
        rest = _client(PLANNER)
        room = await rest.agent_api_chats.create_agent_chat(chat=ChatRoomRequest(title=title[:120]), request_options=DEFAULT_REQUEST_OPTIONS)
        room_id = str(room.data.id)
        tools = AgentTools(room_id, rest)
        for who in [a.handle for a in AGENTS.values() if a is not PLANNER] + ([OWNER] if OWNER else []):
            try:
                await tools.add_participant(who)
            except Exception as e:
                log.warning("couldn't add %s to Band room: %s", who, e)
        return room_id
    except Exception:
        log.exception("couldn't open a Band room")
        return None


async def _post(run_id: str, frm: str, to: str, text: str, after: Optional[asyncio.Task[None]]) -> None:
    if after:
        await asyncio.gather(after, return_exceptions=True)
    room_id = await _rooms[run_id]
    sender = AGENTS.get(frm) or PLANNER
    if not room_id or not sender:
        return
    target = AGENTS.get(to)
    mention = target.handle if target and target is not sender else OWNER
    try:
        tools = AgentTools(room_id, _client(sender))
        await tools.get_participants()  # mentions resolve against the room's members
        await tools.send_message(f"@{mention} {text}", mentions=[mention])
    except Exception as e:
        log.warning("Band post %s → %s failed: %s", frm, to, e)


def room_id(run_id: str) -> Optional[str]:
    """The run's Band room once it's open, else None."""
    task = _rooms.get(run_id)
    return task.result() if task and task.done() and not task.cancelled() and not task.exception() else None


def start(run: Run, title: str) -> None:
    """Open the run's Band room in the background."""
    if enabled() and run.id not in _rooms:
        _rooms[run.id] = asyncio.create_task(_open_room(f"RelationshipOS · {title}"))


def handoff(run: Run, frm: str, to: str, what: str) -> None:
    run.handoffs = [*run.handoffs, {"from": frm, "to": to, "what": what}]
    if not enabled() or to == "You":  # the last word to the founder is finish()
        return
    start(run, run.request[:80])
    _chain[run.id] = asyncio.create_task(_post(run.id, frm, to, f"{what}", _chain.get(run.id)))


def finish(run: Run, summary: str) -> None:
    """The last word in the room, to the founder: what's waiting for them."""
    if enabled() and run.id in _rooms:
        _chain[run.id] = asyncio.create_task(_post(run.id, "Outreach" if run.kind == "capture" else "Strategist", "You", summary, _chain.get(run.id)))
