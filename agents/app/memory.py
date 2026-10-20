"""Relationship memory in Cognee. Each user is one Cognee dataset (user_<google id>). Notes go in with `remember`;
Cognee builds its graph from them in the background (cognify makes its own model calls and can take a while), so a
run never waits on it. `recall` asks the graph a question and returns plain text, or "" when nothing is known yet.
Cognee's stores are file-based and want one writer, so writes share a lock."""
import asyncio
import os
import logging
import re

from . import config  # noqa: F401  (sets Cognee's storage paths before cognee is imported)
from datetime import datetime, timezone
import cognee
from cognee import SearchType

log = logging.getLogger("relationshipos.memory")

_write = asyncio.Lock()
_pending: dict[str, asyncio.Task[None]] = {}
_cloud: dict[str, dict[str, object]] = {}  # user → last push to Cognee Cloud


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
        return
    await push_cloud(user_id)


def cloud_dataset(user_id: str) -> str:
    return "networkos_" + re.sub(r"[^A-Za-z0-9_]", "_", user_id).removeprefix("networkos_")


async def push_cloud(user_id: str) -> None:
    """Copy the user's graph to Cognee Cloud (no LLM calls there), so it shows up in the Cognee web app."""
    if not (config.CLOUD_URL and config.CLOUD_KEY):
        return
    state = _cloud.setdefault(user_id, {})
    state.update(state="pushing", error="")
    try:
        async with _write:
            res = await cognee.push(dataset(user_id), target_dataset=cloud_dataset(user_id), mode="preserve", url=config.CLOUD_URL, api_key=config.CLOUD_KEY)
        state.update(state="pushed", at=datetime.now(timezone.utc).isoformat(timespec="seconds"), result=str(res)[:300])
        log.info("pushed %s to Cognee Cloud as %s", dataset(user_id), cloud_dataset(user_id))
    except Exception as e:
        log.exception("push to Cognee Cloud failed for %s", dataset(user_id))
        state.update(state="failed", error=f"{type(e).__name__}: {e}"[:300])


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
        # Cognee returns {"dataset_name": ..., "search_result": [...]} per dataset (older versions: objects or strings).
        value = r.get("search_result", r) if isinstance(r, dict) else getattr(r, "search_result", r)
        for v in value if isinstance(value, list) else [value]:
            parts.append(v if isinstance(v, str) else str(v))
    return "\n".join(p for p in parts if p).strip()


async def remember_many(user_id: str, texts: list[str]) -> None:
    """Save several notes in one write and one graph build (the NetworkOS page loading a whole network at once)."""
    if not texts:
        return
    try:
        async with _write:
            await cognee.add(texts, dataset_name=dataset(user_id))
    except Exception:
        log.exception("cognee.add failed for %s", dataset(user_id))
        return
    task = _pending.get(user_id)
    if task is None or task.done():
        _pending[user_id] = asyncio.create_task(_cognify(user_id))


async def stats(user_id: str) -> dict[str, object]:
    """What Cognee holds for this user: documents, the graph's size, and whether a graph build is running."""
    task = _pending.get(user_id)
    out: dict[str, object] = {"dataset": dataset(user_id), "documents": 0, "nodes": 0, "edges": 0, "building": bool(task and not task.done()),
                              "cloud": {"enabled": bool(config.CLOUD_URL and config.CLOUD_KEY), "dataset": cloud_dataset(user_id), **_cloud.get(user_id, {})}}
    try:
        ds = next((d for d in await cognee.datasets.list_datasets() if d.name == dataset(user_id)), None)
        if ds is None:
            return out
        out["documents"] = len(await cognee.datasets.list_data(ds.id))
        from cognee.context_global_variables import set_database_global_context_variables
        from cognee.infrastructure.databases.graph import get_graph_engine
        async with set_database_global_context_variables(ds.id, ds.owner_id):
            out["nodes"], out["edges"] = await (await get_graph_engine()).get_graph_counts()
    except Exception as e:
        log.info("couldn't read Cognee stats for %s: %s", dataset(user_id), e)
    return out


async def forget_all(user_id: str) -> bool:
    """Empty this user's Cognee dataset (FORGET): documents, graph and vectors. True if there was one."""
    try:
        ds = next((d for d in await cognee.datasets.list_datasets() if d.name == dataset(user_id)), None)
        if ds is None:
            return False
        async with _write:
            await cognee.datasets.empty_dataset(ds.id)
        _cloud.pop(user_id, None)
        return True
    except Exception:
        log.exception("couldn't empty Cognee dataset %s", dataset(user_id))
        raise


_writes: set[asyncio.Task[None]] = set()


def remember_later(user_id: str, text: str) -> None:
    """Save a note without making the caller wait on Cognee."""
    task = asyncio.create_task(remember(user_id, text))
    _writes.add(task)
    task.add_done_callback(_writes.discard)
