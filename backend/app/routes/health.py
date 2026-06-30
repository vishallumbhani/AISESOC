from fastapi import APIRouter
from app.database import SessionLocal
from app.graph import get_graph_db
from sqlalchemy import text

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Test database connection
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_status = "healthy"
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    try:
        # Test Neo4j connection
        graph = get_graph_db()
        result = graph.execute("RETURN 1")
        graph_status = "healthy"
    except Exception as e:
        graph_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "healthy" and graph_status == "healthy" else "degraded",
        "database": db_status,
        "graph": graph_status
    }
