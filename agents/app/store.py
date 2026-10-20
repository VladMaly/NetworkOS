"""App state in SQLite: users, contacts, runs and interactions. Memory itself (what was said, who knows whom) lives in
Cognee; this is the part the dashboard lists, sorts and updates. JSON columns are always reassigned, never mutated in
place, so SQLAlchemy sees the change."""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import JSON, Column
from sqlmodel import Field, Session, SQLModel, create_engine, select

from .config import DATA_DIR

engine = create_engine(f"sqlite:///{DATA_DIR / 'app.db'}", connect_args={"check_same_thread": False})


def now() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class User(SQLModel, table=True):
    id: str = Field(primary_key=True)  # Google account ID
    name: str = ""
    email: str = ""
    building: str = ""
    goal: str = "beta"
    voice: str = "friendly, concise, specific"
    created_at: datetime = Field(default_factory=now)


class Contact(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True)
    name: str
    role: str = ""
    company: str = ""
    event: str = ""
    met_where: str = ""
    met_date: str = ""
    discussed: str = ""
    they_said: str = ""
    they_promised: str = ""
    i_promised: str = ""
    recent: str = ""
    mutual: str = ""
    signal: str = ""
    score: int = 0
    next_action: str = ""
    next_date: str = ""
    why: str = ""
    status: str = ""
    give: str = ""
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON))
    notes: str = ""
    last_run_id: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class Interaction(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True)
    contact_id: str = Field(index=True)
    at: datetime = Field(default_factory=now)
    what: str


class Run(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True)
    contact_id: Optional[str] = None
    request: str
    kind: str = "capture"  # capture | question
    stage: int = 0  # 0 Planner, 1 Research, 2 Strategist, 3 Outreach, 4 done
    status: str = "running"  # running | waiting | approved | rejected | answered | failed
    log: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    notes: list[list[str]] = Field(default_factory=lambda: [[], [], [], []], sa_column=Column(JSON))
    handoffs: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    sources: list[dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    usage: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    answer: Optional[str] = None
    draft_subject: Optional[str] = None
    draft_body: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


def init() -> None:
    SQLModel.metadata.create_all(engine)
    # A run cut off by a restart can't finish; say so instead of leaving it spinning.
    with Session(engine) as s:
        for r in s.exec(select(Run).where(Run.status == "running")).all():
            r.status, r.error = "failed", "The agents service restarted during this run. Run it again."
            s.add(r)
        s.commit()


def session() -> Session:
    return Session(engine, expire_on_commit=False)
