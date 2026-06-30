"""
tests/conftest.py
─────────────────
Shared pytest fixtures for the AI-SecOS test suite.

Design decisions
────────────────
* Uses SQLite (in-memory via a temporary file) so no Postgres instance is
  needed.  The ``app/models.py`` GUID TypeDecorator makes every table
  compatible with SQLite.

* Each test gets a fresh, rolled-back transaction so tests never pollute one
  another.

* Neo4j is stubbed: the ``get_graph_db`` dependency is replaced with a no-op
  object, so tests never need a running Neo4j instance.

* JWT tokens are generated directly using the same secret and algorithm as
  ``app/security``, so the real ``get_current_user`` dependency works without
  modification.
"""

import uuid
import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ── Import the real application ────────────────────────────────
from app.database import Base, get_db
from app.main import app
from app.models import (
    Organization, User, Agent, Asset,
    Policy, RiskScore, Incident,
)
from app.security import get_password_hash, create_access_token
from app.graph import get_graph_db


# ── Neo4j stub ─────────────────────────────────────────────────
class _Neo4jStub:
    """
    Drop-in replacement for ``Neo4jGraph``.
    Every method that the route handlers call returns a harmless value
    so tests never need a live Neo4j connection.
    """

    def close(self):                            pass
    def execute(self, *a, **kw):                return []
    def create_asset_node(self, *a, **kw):      return True
    def create_agent_node(self, *a, **kw):      return True
    def create_end_user_node(self, *a, **kw):   return True
    def create_policy_node(self, *a, **kw):     return True
    def create_tool_node(self, *a, **kw):       return True
    def create_data_source_node(self, *a, **kw): return True
    def create_relationship(self, *a, **kw):    return True
    def record_access_event(self, *a, **kw):    return True
    def record_end_user_event(self, *a, **kw):  return True
    def get_full_graph(self):                   return {"nodes": [], "edges": []}
    def get_asset_graph(self, *a, **kw):        return {"nodes": [], "edges": []}
    def query_sensitive_data_access(self, *a):  return []
    def get_graph_paths(self, *a, **kw):        return []

_stub_instance = _Neo4jStub()


# ── SQLite engine (one per test session) ──────────────────────
_DB_URL = "sqlite://"   # pure in-memory; shared across connections via StaticPool

engine = create_engine(
    _DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,   # all connections share the same in-memory DB
)
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def create_tables():
    """Create all tables once per test session; drop them at the end."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    """
    Provide a transactional database session.

    Each test runs inside a savepoint; rolling back at teardown undoes every
    write made during that test without re-creating the schema.
    """
    connection  = engine.connect()
    transaction = connection.begin()
    session     = TestSession(bind=connection)
    # SQLite nested transaction support
    session.begin_nested()

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db):
    """
    TestClient wired to the per-test DB session and Neo4j stub.

    Overrides:
      • ``get_db``       → the rolled-back test session
      • ``get_graph_db`` → a no-op stub (no Neo4j needed)
    """
    def _override_db():
        yield db

    app.dependency_overrides[get_db]       = _override_db
    app.dependency_overrides[get_graph_db] = lambda: _stub_instance

    with TestClient(app, raise_server_exceptions=True) as c:
        yield c

    app.dependency_overrides.clear()


# ── Seed fixtures ──────────────────────────────────────────────

@pytest.fixture()
def org(db):
    o = Organization(name=f"TestOrg-{uuid.uuid4().hex[:8]}")
    db.add(o)
    db.flush()
    return o


@pytest.fixture()
def user(db, org):
    u = User(
        organization_id=org.id,
        username=f"u-{uuid.uuid4().hex[:6]}",
        email=f"u-{uuid.uuid4().hex[:6]}@test.com",
        password_hash=get_password_hash("password123"),
        role="admin",
        is_active=True,
    )
    db.add(u)
    db.flush()
    return u


@pytest.fixture()
def auth_headers(user, org):
    """Bearer token for ``user`` in ``org``."""
    token = create_access_token({"sub": str(user.id), "org": str(org.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def agent(db, org, user):
    a = Agent(
        organization_id=org.id,
        name="Support Agent",
        agent_type="support",
        status="active",
        created_by=user.id,
    )
    db.add(a)
    db.flush()
    return a


@pytest.fixture()
def asset(db, org, user):
    """Asset with a seeded risk score (score=75, high severity)."""
    a = Asset(
        organization_id=org.id,
        name="Payroll DB",
        asset_type="database",
        status="active",
        classification="restricted",
        created_by=user.id,
    )
    db.add(a)
    db.flush()

    rs = RiskScore(
        organization_id=org.id,
        asset_id=a.id,
        score=75.00,
        severity="high",
        data_sensitivity=80,
        permission_level=70,
        trust_score=30,
        environment="production",
        policy_gap=20,
    )
    db.add(rs)
    db.flush()
    return a


@pytest.fixture()
def asset2(db, org, user):
    """A second asset not covered by ``deny_policy``."""
    a = Asset(
        organization_id=org.id,
        name="Logs Storage",
        asset_type="storage",
        status="active",
        classification="internal",
        created_by=user.id,
    )
    db.add(a)
    db.flush()
    return a


@pytest.fixture()
def deny_policy(db, org, user, agent, asset):
    """Active policy: deny agent → asset for common actions."""
    p = Policy(
        organization_id=org.id,
        name="Deny Support to Payroll",
        description="Blocks support agents from payroll data",
        policy_type="access_control",
        rules={
            "deny": [{
                "agent_id": str(agent.id),
                "asset_id": str(asset.id),
                "actions":  ["access", "read", "write", "delete"],
            }],
            "allow": [],
        },
        status="active",
        priority=100,
        created_by=user.id,
    )
    db.add(p)
    db.flush()
    return p


@pytest.fixture()
def allow_policy(db, org, user, agent, asset2):
    """Active policy: allow agent → asset2 for read/access."""
    p = Policy(
        organization_id=org.id,
        name="Allow Support to Logs",
        policy_type="access_control",
        rules={
            "allow": [{
                "agent_id": str(agent.id),
                "asset_id": str(asset2.id),
                "actions":  ["access", "read"],
            }],
            "deny": [],
        },
        status="active",
        priority=200,
        created_by=user.id,
    )
    db.add(p)
    db.flush()
    return p


@pytest.fixture()
def open_incident(db, org, agent, asset):
    """Pre-seeded open incident with one timeline entry."""
    i = Incident(
        organization_id=org.id,
        agent_id=agent.id,
        asset_id=asset.id,
        incident_type="unauthorized_access_attempt",
        severity="high",
        description="Test incident",
        status="open",
        timeline=[{
            "ts":     "2025-01-01T00:00:00",
            "actor":  "system",
            "action": "incident_auto_created",
            "note":   "3 denials in 10 minutes",
        }],
        resolution_details={},
    )
    db.add(i)
    db.flush()
    return i


# ── Helper ─────────────────────────────────────────────────────

def make_decision(client, auth_headers, agent_id, asset_id, action="access", **extra):
    """POST /api/v1/runtime/decision and return the Response object."""
    return client.post(
        "/api/v1/runtime/decision",
        json={
            "agent_id": str(agent_id),
            "asset_id": str(asset_id),
            "action":   action,
            **extra,
        },
        headers=auth_headers,
    )
