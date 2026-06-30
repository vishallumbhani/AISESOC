"""
graph.py — Neo4j stub for tests.
All methods return True / empty structures so tests never need a real Neo4j.
"""
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

VALID_REL_TYPES = {
    "AGENT_USES_ASSET", "AGENT_ACCESS_DENIED", "AGENT_ACCESS_ALLOWED",
    "ASSET_CONNECTED_TO", "POLICY_PROTECTS_ASSET", "END_USER_QUERIED_AGENT",
}

class Neo4jGraph:
    """Stub that satisfies all callers without touching Neo4j."""

    def close(self): pass
    def execute(self, query: str, parameters: Dict = None): return []

    def create_asset_node(self, *a, **kw)         -> bool: return True
    def create_agent_node(self, *a, **kw)         -> bool: return True
    def create_end_user_node(self, *a, **kw)      -> bool: return True
    def create_policy_node(self, *a, **kw)        -> bool: return True
    def create_tool_node(self, *a, **kw)          -> bool: return True
    def create_data_source_node(self, *a, **kw)   -> bool: return True

    def create_relationship(self, from_id, to_id, relationship_type,
                             from_label="Agent", to_label="Asset",
                             properties=None) -> bool:
        if relationship_type not in VALID_REL_TYPES:
            logger.error(f"Invalid rel type: {relationship_type}")
            return False
        return True

    def record_access_event(self, agent_id, asset_id, decision,
                             action, policy_id=None) -> bool:
        return True

    def record_end_user_event(self, end_user_id, agent_id,
                               session_id="", prompt_preview="",
                               action="access", decision="allow",
                               asset_id=None, asset_name=None,
                               policy_name=None, ts=None) -> bool:
        return True

    def get_full_graph(self) -> Dict[str, Any]:
        return {"nodes": [], "edges": []}

    def get_asset_graph(self, asset_id: str) -> Dict[str, Any]:
        return {"nodes": [], "edges": []}

    def query_sensitive_data_access(self, organization_id: str) -> List[Dict]: return []
    def get_graph_paths(self, from_id: str, to_id: str) -> List[List[str]]: return []


_graph_db: Optional[Neo4jGraph] = None

def get_graph_db() -> Neo4jGraph:
    global _graph_db
    if _graph_db is None:
        _graph_db = Neo4jGraph()
    return _graph_db

def close_graph_db():
    global _graph_db
    if _graph_db:
        _graph_db.close()
        _graph_db = None
