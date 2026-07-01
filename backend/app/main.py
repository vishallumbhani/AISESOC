"""
app/main.py -- FastAPI application entry point.

On startup:
  1. Validates SECRET_KEY is not the insecure default (in production)
  2. Runs Alembic migrations (alembic upgrade head)
  3. Logs which graph.py and models.py are loaded
  4. Connects to Neo4j (gracefully -- never crashes if Neo4j is down)
  5. Seeds compliance mappings if table is empty
"""

import logging
import subprocess
import sys
import os
import inspect

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import Base, engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── Startup validation ─────────────────────────────────────────

def _log_loaded_modules():
    try:
        import app.models as m
        import app.graph  as g
        logger.info(f"Loaded models module : {inspect.getfile(m)}")
        logger.info(f"Loaded graph module  : {inspect.getfile(g)}")
    except Exception as exc:
        logger.warning(f"Could not inspect module paths: {exc}")


def _assert_secret_key():
    insecure_defaults = {"change-me-in-production", "secret", "changeme", ""}
    if settings.secret_key in insecure_defaults:
        if not getattr(settings, "debug", False):
            logger.critical(
                "SECRET_KEY is set to an insecure default. "
                "Set a cryptographically random SECRET_KEY environment variable before deploying."
            )
            # In production, exit. In debug/dev, warn only.
            sys.exit(1)
        else:
            logger.warning(
                "⚠️  SECRET_KEY is insecure — acceptable for local dev only. "
                "NEVER deploy with this key."
            )


# ── Migrations ────────────────────────────────────────────────

def run_migrations() -> None:
    try:
        logger.info("Running database migrations (alembic upgrade head)...")
        alembic_ini = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
        )
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-c", alembic_ini, "upgrade", "head"],
            capture_output=True, text=True,
            cwd=os.path.dirname(alembic_ini),
        )
        for line in (result.stdout + result.stderr).strip().splitlines():
            logger.info(f"[alembic] {line}")
        if result.returncode != 0:
            logger.error("Alembic migration reported an error -- see above.")
        else:
            logger.info("Migrations complete.")
    except FileNotFoundError:
        logger.warning("alembic.ini not found -- falling back to create_all.")
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.error(f"Migration error: {exc} -- falling back to create_all.")
        Base.metadata.create_all(bind=engine)


def _seed_compliance():
    """Seed compliance mappings if table is empty."""
    try:
        from app.database import SessionLocal
        from app.services.compliance import seed_compliance_mappings
        db = SessionLocal()
        try:
            seed_compliance_mappings(db)
        finally:
            db.close()
    except Exception as exc:
        logger.warning(f"Compliance seed skipped: {exc}")


# ── Lifespan ──────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting AI-SecOS")

    # 1. Validate security configuration
    _assert_secret_key()

    # 2. Log which files are loaded (catches duplicate-package bugs early)
    _log_loaded_modules()

    # 3. Apply DB migrations
    run_migrations()

    # 4. Connect to Neo4j (never blocks startup on failure)
    try:
        from app.graph import get_graph_db
        graph = get_graph_db()
        logger.info(f"Neo4j connected      : {graph.connected}")
        if not graph.connected:
            logger.warning(
                "Neo4j is offline. Graph endpoints will return empty results. "
                "All other features work normally."
            )
    except Exception as exc:
        logger.warning(f"Neo4j init error: {exc}")

    # 5. Seed compliance mappings
    _seed_compliance()

    yield

    # Shutdown
    logger.info("Shutting down AI-SecOS")
    try:
        from app.graph import close_graph_db
        close_graph_db()
    except Exception:
        pass


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI Security Operations System — Enterprise Platform",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "auth",              "description": "Authentication & registration"},
        {"name": "agents",            "description": "AI agent management"},
        {"name": "assets",            "description": "Asset inventory & classification"},
        {"name": "policies",          "description": "Policy management & lifecycle"},
        {"name": "runtime",           "description": "Runtime policy decisions (JWT)"},
        {"name": "connector-runtime", "description": "Machine-to-machine runtime decisions (API key)"},
        {"name": "incidents",         "description": "Security incident management"},
        {"name": "audit-logs",        "description": "Immutable audit trail"},
        {"name": "reports",           "description": "Executive & compliance reports"},
        {"name": "graph",             "description": "Neo4j security graph"},
        {"name": "risk-scores",       "description": "Asset risk scoring"},
        {"name": "rbac",              "description": "Roles & permissions"},
        {"name": "api-keys",          "description": "Enterprise API key management"},
        {"name": "connectors",        "description": "Connector framework"},
        {"name": "platform",          "description": "Platform admin (AI-SecOS staff only)"},
        {"name": "health",            "description": "Health checks"},
    ],
)

# ── Rate limiting ──────────────────────────────────────────────
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded

    limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    logger.info("Rate limiting enabled (slowapi)")
except ImportError:
    logger.warning("slowapi not installed — rate limiting disabled. Run: pip install slowapi")

# ── CORS ───────────────────────────────────────────────────────
# In production, replace "*" with the actual frontend origin
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Core routers ───────────────────────────────────────────────
from app.routes import (       # noqa: E402
    auth_router,
    assets_router,
    agents_router,
    models_router,
    tools_router,
    data_sources_router,
    policies_router,
    risk_scores_router,
    runtime_router,
    health_router,
    audit_logs_router,
    graph_router,
    incidents_router,
)

p = settings.api_prefix
app.include_router(health_router)                          # /health (no prefix)
app.include_router(auth_router,         prefix=p)
app.include_router(assets_router,       prefix=p)
app.include_router(agents_router,       prefix=p)
app.include_router(models_router,       prefix=p)
app.include_router(tools_router,        prefix=p)
app.include_router(data_sources_router, prefix=p)
app.include_router(policies_router,     prefix=p)
app.include_router(risk_scores_router,  prefix=p)
app.include_router(runtime_router,      prefix=p)
app.include_router(audit_logs_router,   prefix=p)
app.include_router(graph_router,        prefix=p)

try:
    from app.routes.graph_v2 import router as graph_v2_router
    app.include_router(graph_v2_router, prefix=p)
    logger.info('Graph Explorer v2 router registered')
except Exception as e:
    logger.warning(f'Graph v2 router skipped: {e}')
app.include_router(incidents_router,    prefix=p)

# ── Enterprise & Platform routers ──────────────────────────────
try:
    from app.routes.platform import router as platform_router
    app.include_router(platform_router, prefix=p)
    logger.info("Platform router registered")
except Exception as e:
    logger.warning(f"Platform router not loaded: {e}")

try:
    from app.routes.api_keys          import router as api_keys_router
    from app.routes.rbac              import router as rbac_router
    from app.routes.connectors        import router as connectors_router
    from app.routes.reports           import router as reports_router
    from app.routes.connector_runtime import router as connector_runtime_router
    app.include_router(api_keys_router,          prefix=p)
    app.include_router(rbac_router,              prefix=p)
    app.include_router(connectors_router,        prefix=p)
    app.include_router(reports_router,           prefix=p)
    app.include_router(connector_runtime_router, prefix=p)
    from app.routes.dashboard import router as dashboard_router
    app.include_router(dashboard_router, prefix=p)
    logger.info("Enterprise routers registered")
except Exception as e:
    logger.warning(f"Enterprise routers not loaded: {e}")


# ── Root ───────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "name":    settings.app_name,
        "version": settings.app_version,
        "status":  "running",
        "docs":    "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.fastapi_host,
        port=settings.fastapi_port,
        reload=settings.debug,
    )
