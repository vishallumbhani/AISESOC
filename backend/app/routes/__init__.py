from app.routes.auth import router as auth_router
from app.routes.assets import router as assets_router
from app.routes.agents import router as agents_router
from app.routes.models import router as models_router
from app.routes.tools import router as tools_router
from app.routes.data_sources import router as data_sources_router
from app.routes.policies import router as policies_router
from app.routes.risk_scores import router as risk_scores_router
from app.routes.runtime import router as runtime_router
from app.routes.health import router as health_router
from app.routes.audit_logs import router as audit_logs_router
from app.routes.graph import router as graph_router
from app.routes.incidents import router as incidents_router

__all__ = [
    "auth_router",
    "assets_router",
    "agents_router",
    "models_router",
    "tools_router",
    "data_sources_router",
    "policies_router",
    "risk_scores_router",
    "runtime_router",
    "health_router",
    "audit_logs_router",
    "graph_router",
    "incidents_router",
]
