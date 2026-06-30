"""
Test FastAPI application — mirrors the real backend but:
  - Uses SQLite (via test DB override)
  - Stubs out Neo4j
  - Includes all routes that tests exercise
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.routes.policies   import router as policies_router
from app.routes.runtime    import router as runtime_router
from app.routes.incidents  import router as incidents_router
from app.routes.audit_logs import router as audit_logs_router
from app.routes.graph      import router as graph_router
from app.routes.assets     import router as assets_router
from app.routes.risk_scores import router as risk_scores_router

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AI-SecOS-Test", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

PREFIX = "/api/v1"
app.include_router(policies_router,    prefix=PREFIX)
app.include_router(runtime_router,     prefix=PREFIX)
app.include_router(incidents_router,   prefix=PREFIX)
app.include_router(audit_logs_router,  prefix=PREFIX)
app.include_router(graph_router,       prefix=PREFIX)
app.include_router(assets_router,      prefix=PREFIX)
app.include_router(risk_scores_router, prefix=PREFIX)

@app.get("/health")
async def health():
    return {"status": "healthy", "database": "healthy", "graph": "healthy"}
