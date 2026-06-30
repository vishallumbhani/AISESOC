"""
app/graph.py -- Neo4j driver with graceful degradation.

This is the ONLY graph.py in the project (lives at app/graph.py).
The routes file lives at app/routes/graph.py and imports from here.

If Neo4j is unreachable at startup or at query time, every method returns
a safe empty value and logs a warning.  All other backend features continue
to work normally.

The singleton retries the connection on every call, so if Neo4j comes back
online the app automatically reconnects without a restart.
"""

from neo4j import GraphDatabase
from app.config import settings
from typing import List, Dict, Any, Optional
import logging
import time

logger = logging.getLogger(__name__)

VALID_REL_TYPES = {
    "AGENT_USES_ASSET",
    "AGENT_ACCESS_DENIED",
    "AGENT_ACCESS_ALLOWED",
    "ASSET_CONNECTED_TO",
    "POLICY_PROTECTS_ASSET",
    "END_USER_QUERIED_AGENT",
}


class Neo4jGraph:
    """
    Thin wrapper around the Neo4j driver.

    self.connected is True only when the driver was successfully created
    and verified with a test query.  All public methods check this flag and
    return safe empty values (False / [] / {}) when it is False.
    """

    def __init__(self):
        self.driver    = None
        self.connected = False
        self._connect()

    # ── Connection management ──────────────────────────────────────

    def _connect(self) -> None:
        """Try to open the driver and verify the connection with a probe query."""
        try:
            user, password = settings.neo4j_credentials
            self.driver = GraphDatabase.driver(
                settings.neo4j_uri,
                auth=(user, password),
                encrypted=False,
                connection_timeout=5,           # fail fast, don't block startup
                max_transaction_retry_time=5,
            )
            with self.driver.session() as session:
                session.run("RETURN 1")
            self.connected = True
            logger.info("Neo4j connected")
        except Exception as exc:
            self.connected = False
            logger.warning(f"Neo4j unavailable: {exc}. Graph features disabled.")
            if self.driver:
                try:
                    self.driver.close()
                except Exception:
                    pass
                self.driver = None

    def _ensure_connected(self) -> bool:
        """Return True if connected; attempt one reconnect if not."""
        if self.connected and self.driver:
            return True
        self._connect()
        return self.connected

    def close(self):
        if self.driver:
            try:
                self.driver.close()
            except Exception:
                pass
        self.driver    = None
        self.connected = False

    def execute(self, query: str, parameters: Dict[str, Any] = None) -> list:
        if not self._ensure_connected():
            return []
        try:
            with self.driver.session() as session:
                result = session.run(query, parameters or {})
                return list(result)
        except Exception as exc:
            logger.warning(f"Neo4j query failed: {exc}")
            self.connected = False
            return []

    # ── Graph reset (used by seed.py --reset-graph) ───────────────

    def reset(self) -> bool:
        """Delete all nodes and relationships in the graph."""
        if not self._ensure_connected():
            logger.warning("Cannot reset graph: Neo4j not connected.")
            return False
        try:
            self.execute("MATCH (n) DETACH DELETE n")
            logger.info("Neo4j graph cleared.")
            return True
        except Exception as exc:
            logger.error(f"Graph reset failed: {exc}")
            return False

    # ── Node upserts ──────────────────────────────────────────────

    def create_asset_node(self, asset_id: str, asset_name: str, asset_type: str) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                "MERGE (a:Asset {id: $id}) "
                "SET a.name=$name, a.type=$type, a.updated_at=timestamp()",
                {"id": asset_id, "name": asset_name, "type": asset_type},
            )
            return True
        except Exception as e:
            logger.error(f"create_asset_node: {e}")
            return False

    def create_agent_node(self, agent_id: str, agent_name: str, agent_type: str) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                "MERGE (a:Agent {id: $id}) "
                "SET a.name=$name, a.type=$type, a.updated_at=timestamp()",
                {"id": agent_id, "name": agent_name, "type": agent_type},
            )
            return True
        except Exception as e:
            logger.error(f"create_agent_node: {e}")
            return False

    def create_end_user_node(
        self,
        end_user_id: str,
        label: str,
        email: str = "",
        ip_address: str = "",
        risk_score: int = 0,
    ) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                """
                MERGE (u:EndUser {id: $id})
                SET u.name       = $label,
                    u.email      = $email,
                    u.ip_address = $ip,
                    u.type       = 'end_user',
                    u.risk_score = $risk_score,
                    u.updated_at = timestamp()
                """,
                {"id": end_user_id, "label": label, "email": email,
                 "ip": ip_address, "risk_score": risk_score},
            )
            return True
        except Exception as e:
            logger.error(f"create_end_user_node: {e}")
            return False

    def create_policy_node(self, policy_id: str, policy_name: str, policy_type: str) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                "MERGE (p:Policy {id: $id}) "
                "SET p.name=$name, p.type=$type, p.updated_at=timestamp()",
                {"id": policy_id, "name": policy_name, "type": policy_type},
            )
            return True
        except Exception as e:
            logger.error(f"create_policy_node: {e}")
            return False

    def create_tool_node(self, tool_id: str, tool_name: str) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                "MERGE (t:Tool {id: $id}) SET t.name=$name, t.updated_at=timestamp()",
                {"id": tool_id, "name": tool_name},
            )
            return True
        except Exception as e:
            logger.error(f"create_tool_node: {e}")
            return False

    def create_data_source_node(
        self, source_id: str, source_name: str, source_type: str
    ) -> bool:
        if not self._ensure_connected():
            return False
        try:
            self.execute(
                "MERGE (d:DataSource {id: $id}) "
                "SET d.name=$name, d.type=$type, d.updated_at=timestamp()",
                {"id": source_id, "name": source_name, "type": source_type},
            )
            return True
        except Exception as e:
            logger.error(f"create_data_source_node: {e}")
            return False

    # ── Relationships ─────────────────────────────────────────────

    def create_relationship(
        self,
        from_id: str,
        to_id: str,
        relationship_type: str,
        from_label: str = "Agent",
        to_label: str = "Asset",
        properties: Optional[Dict[str, Any]] = None,
    ) -> bool:
        if relationship_type not in VALID_REL_TYPES:
            logger.error(f"Invalid relationship type: {relationship_type}")
            return False
        if not self._ensure_connected():
            return False
        try:
            params: Dict[str, Any] = {"from_id": from_id, "to_id": to_id}
            set_clause = "SET r.updated_at = timestamp()"
            if properties:
                params.update(properties)
                prop_sets  = ", ".join(f"r.{k} = ${k}" for k in properties)
                set_clause += f", {prop_sets}"
            query = f"""
            MATCH (from:{from_label} {{id: $from_id}})
            MATCH (to:{to_label}   {{id: $to_id}})
            MERGE (from)-[r:{relationship_type}]->(to)
            {set_clause}
            RETURN from, to
            """
            self.execute(query, params)
            return True
        except Exception as e:
            logger.error(f"create_relationship ({relationship_type}): {e}")
            return False

    def record_access_event(
        self,
        agent_id: str,
        asset_id: str,
        decision: str,
        action: str,
        policy_id: Optional[str] = None,
    ) -> bool:
        if not self._ensure_connected():
            return False
        rel_type = (
            "AGENT_ACCESS_ALLOWED" if decision == "allow" else "AGENT_ACCESS_DENIED"
        )
        props = {"action": action, "timestamp": time.time()}
        ok = self.create_relationship(
            agent_id, asset_id, rel_type, "Agent", "Asset", props
        )
        if ok and policy_id:
            self.create_relationship(
                policy_id, asset_id, "POLICY_PROTECTS_ASSET", "Policy", "Asset"
            )
        return ok

    def record_end_user_event(
        self,
        end_user_id: str,
        agent_id: str,
        session_id: str = "",
        prompt_preview: str = "",
        action: str = "access",
        decision: str = "allow",
        asset_id: Optional[str] = None,
        asset_name: Optional[str] = None,
        policy_name: Optional[str] = None,
        ts: Optional[float] = None,
    ) -> bool:
        if not self._ensure_connected():
            return False
        props = {
            "session_id":     session_id,
            "prompt_preview": prompt_preview[:200] if prompt_preview else "",
            "action":         action,
            "decision":       decision,
            "asset_id":       asset_id or "",
            "asset_name":     asset_name or "",
            "policy_name":    policy_name or "",
            "timestamp":      ts or time.time(),
        }
        return self.create_relationship(
            end_user_id, agent_id,
            "END_USER_QUERIED_AGENT", "EndUser", "Agent", props,
        )

    # ── Graph queries ─────────────────────────────────────────────

    def get_full_graph(self) -> Dict[str, Any]:
        if not self._ensure_connected():
            return {"nodes": [], "edges": [], "neo4j_available": False}
        try:
            node_result = self.execute(
                """
                MATCH (n)
                WHERE n:Agent OR n:Asset OR n:Policy OR n:Tool
                      OR n:DataSource OR n:EndUser
                RETURN n, labels(n) AS labels
                """
            )
            nodes: List[Dict] = []
            seen: set         = set()
            for record in node_result:
                node    = record["n"]
                node_id = node.get("id", str(node.id))
                if node_id in seen:
                    continue
                seen.add(node_id)
                nodes.append({
                    "id":         node_id,
                    "label":      record["labels"][0] if record["labels"] else "Unknown",
                    "name":       node.get("name", node_id),
                    "type":       node.get("type", ""),
                    "email":      node.get("email", ""),
                    "ip_address": node.get("ip_address", ""),
                    "risk_score": node.get("risk_score", 0),
                })

            rel_result = self.execute(
                """
                MATCH (from)-[r]->(to)
                WHERE (from:Agent OR from:Asset OR from:Policy
                       OR from:Tool OR from:DataSource OR from:EndUser)
                  AND (to:Agent OR to:Asset OR to:Policy
                       OR to:Tool OR to:DataSource OR to:EndUser)
                RETURN
                    from.id          AS from_id,
                    from.name        AS from_name,
                    to.id            AS to_id,
                    to.name          AS to_name,
                    type(r)          AS rel_type,
                    r.action         AS action,
                    r.decision       AS decision,
                    r.session_id     AS session_id,
                    r.prompt_preview AS prompt_preview,
                    r.asset_id       AS asset_id,
                    r.asset_name     AS asset_name,
                    r.policy_name    AS policy_name,
                    r.timestamp      AS ts
                """
            )
            edges: List[Dict] = []
            for record in rel_result:
                edges.append({
                    "id":             (
                        f"{record['from_id']}-{record['rel_type']}-{record['to_id']}"
                    ),
                    "from":           record["from_id"],
                    "to":             record["to_id"],
                    "from_name":      record["from_name"],
                    "to_name":        record["to_name"],
                    "type":           record["rel_type"],
                    "action":         record["action"],
                    "decision":       record["decision"],
                    "session_id":     record["session_id"],
                    "prompt_preview": record["prompt_preview"],
                    "asset_id":       record["asset_id"],
                    "asset_name":     record["asset_name"],
                    "policy_name":    record["policy_name"],
                    "timestamp":      record["ts"],
                })
            return {"nodes": nodes, "edges": edges, "neo4j_available": True}
        except Exception as e:
            logger.error(f"get_full_graph: {e}")
            return {"nodes": [], "edges": [], "neo4j_available": False}

    def get_asset_graph(self, asset_id: str) -> Dict[str, Any]:
        if not self._ensure_connected():
            return {"nodes": [], "edges": [], "neo4j_available": False}
        try:
            result = self.execute(
                "MATCH (n)-[r]-(asset:Asset {id: $id}) "
                "RETURN n, labels(n) AS labels, r, asset",
                {"id": asset_id},
            )
            nodes: Dict[str, Any] = {}
            edges: List[Dict]     = []
            for record in result:
                a    = record["asset"]
                a_id = a.get("id", asset_id)
                if a_id not in nodes:
                    nodes[a_id] = {
                        "id": a_id, "label": "Asset",
                        "name": a.get("name", a_id), "type": a.get("type", ""),
                    }
                other    = record["n"]
                other_id = other.get("id", str(other.id))
                lbls     = record["labels"]
                if other_id not in nodes:
                    nodes[other_id] = {
                        "id": other_id,
                        "label": lbls[0] if lbls else "Unknown",
                        "name": other.get("name", other_id),
                        "type": other.get("type", ""),
                    }
                rel = record["r"]
                edges.append({
                    "from":   rel.start_node.get("id", str(rel.start_node.id)),
                    "to":     rel.end_node.get("id", str(rel.end_node.id)),
                    "type":   rel.type,
                    "action": rel.get("action"),
                })
            return {"nodes": list(nodes.values()), "edges": edges, "neo4j_available": True}
        except Exception as e:
            logger.error(f"get_asset_graph: {e}")
            return {"nodes": [], "edges": [], "neo4j_available": False}

    def query_sensitive_data_access(self, organization_id: str) -> List[Dict[str, Any]]:
        if not self._ensure_connected():
            return []
        try:
            result = self.execute(
                """
                MATCH (a:Agent)-[*]->(ds:DataSource {type: "database"})
                WHERE ds.sensitivity = "high"
                RETURN a.id   AS agent_id,  a.name  AS agent_name,
                       ds.id  AS source_id, ds.name AS source_name
                """
            )
            return [dict(r) for r in result]
        except Exception as e:
            logger.error(f"query_sensitive_data_access: {e}")
            return []

    def get_graph_paths(self, from_id: str, to_id: str) -> List[List[str]]:
        if not self._ensure_connected():
            return []
        try:
            result = self.execute(
                "MATCH path = (from {id: $from_id})-[*]->(to {id: $to_id}) RETURN path",
                {"from_id": from_id, "to_id": to_id},
            )
            return [
                [n.get("name", n.get("id")) for n in record[0].nodes]
                for record in result
            ]
        except Exception as e:
            logger.error(f"get_graph_paths: {e}")
            return []


# ── Singleton ─────────────────────────────────────────────────

_graph_db: Optional[Neo4jGraph] = None


def get_graph_db() -> Neo4jGraph:
    """Return the singleton Neo4jGraph. Never raises, even if Neo4j is down."""
    global _graph_db
    if _graph_db is None:
        _graph_db = Neo4jGraph()
    return _graph_db


def close_graph_db():
    global _graph_db
    if _graph_db:
        _graph_db.close()
        _graph_db = None
