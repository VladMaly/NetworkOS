"""Handoffs between agents. Band is the coordination layer the agents will talk through; until its SDK and key are
connected, handoffs run in-process and are recorded on the run in the shape the dashboard's Band panel shows
(from, to, what). Swapping in Band means replacing `handoff` with a Band call that does the same recording."""
from .store import Run


def handoff(run: Run, frm: str, to: str, what: str) -> None:
    run.handoffs = [*run.handoffs, {"from": frm, "to": to, "what": what}]
