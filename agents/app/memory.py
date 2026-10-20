"""Relationship memory in Cognee. Each user is one Cognee dataset (user_<google id>). Notes go in with `remember`;
Cognee builds its graph from them in the background (cognify makes its own model calls and can take a while), so a
run never waits on it. `recall` asks the graph a question and returns plain text, or "" when nothing is known yet.
Cognee's stores are file-based and want one writer, so writes share a lock."""
import asyncio
import os
import logging
import re

from . import config  # noqa: F401  (sets Cognee's storage paths before cognee is imported)
import cognee
from cognee import SearchType

log = logging.getLogger("networkos.memory")

_write = asyncio.Lock()
_pending: dict[str, asyncio.Task[None]] = {}


def dataset(user_id: str) -> str:
    return "user_" + re.sub(r"[^A-Za-z0-9_]", "_", user_id)


async def _cognify(user_id: str) -> None:
    if not os.environ.get("LLM_API_KEY"):
        log.info("skipping graph build for %s: no LLM key", dataset(user_id))
        return
    try:
        async with _write:
            await cognee.cognify(datasets=[dataset(user_id)])
    except Exception:
        log.exception("cognify failed for %s", dataset(user_id))


async def remember(user_id: str, text: str) -> None:
    try:
        async with _write:
            await cognee.add(text, dataset_name=dataset(user_id))
    except Exception:
        log.exception("cognee.add failed for %s", dataset(user_id))
        return
    # One graph build per user at a time; a newer note is picked up by the next one.
    task = _pending.get(user_id)
    if task is None or task.done():
        _pending[user_id] = asyncio.create_task(_cognify(user_id))


async def recall(user_id: str, question: str) -> str:
    try:
        results = await cognee.search(query_text=question, query_type=SearchType.GRAPH_COMPLETION, datasets=[dataset(user_id)], top_k=10)
    except Exception as e:  # an empty or still-building dataset is normal early on
        log.info("recall found nothing for %s: %s", dataset(user_id), type(e).__name__)
        return ""
    parts = []
    for r in results or []:
        value = getattr(r, "search_result", r)
        parts.append(value if isinstance(value, str) else str(value))
    return "\n".join(p for p in parts if p).strip()


_writes: set[asyncio.Task[None]] = set()


def remember_later(user_id: str, text: str) -> None:
    """Save a note without making the caller wait on Cognee."""
    task = asyncio.create_task(remember(user_id, text))
    _writes.add(task)
    task.add_done_callback(_writes.discard)
