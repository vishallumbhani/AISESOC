"""
backend/app/graph_v2_methods.py

New Neo4jGraph methods for the redesigned Graph Explorer.
Paste these methods into the Neo4jGraph class in app/graph.py
(append after get_asset_graph, before query_sensitive_data_access).

Solves the "spaghetti graph" problem by:
  1. Ranking nodes by risk/activity instead of returning everything
  2. Returning only the top-N highest-risk nodes + their immediate edges
  3. Supporting time-windowed queries (last hour / today / week)
  4. Supporting one-click drill-down on a single node
  5. Supporting correlation-ID-based incident tracing (the standout feature)
"""

# ── Method 1: Risk-ranked overview graph (replaces unfiltered get_full_graph) ──
def get_risk_ranked_graph(
    self,
    organization_id: str,
    limit: int = 25,
    risk_filter: str = "all",      # all | critical | high | medium | low
    entity_types: list = None,      # ["Agent","Asset","Policy","Tool","EndUser"] or None=all
    hours: int = 1,                 # time window for activity scoring
) -> dict:
    """
    Returns only the top-N nodes ranked by a composite risk/activity score,
    plus the edges directly connecting them. This is what the Graph
    Explorer overview should call instead of get_full_graph().

    Risk score per node is computed from:
      - denial_count in the time window (heaviest weight)
      - total request count in the time window
      - any pre-computed risk_score property already on the node
    """
    if not self._ensure_connected():
        return {"nodes": [], "edges": [], "neo4j_available": False, "total_nodes": 0}

    type_filter = ""
    if entity_types:
        labels = " OR ".join([f"n:{t}" for t in entity_types])
        type_filter = f"AND ({labels})"

    risk_clause = ""
    if risk_filter == "critical":
        risk_clause = "AND computed_risk >= 80"
    elif risk_filter == "high":
        risk_clause = "AND computed_risk >= 60 AND computed_risk < 80"
    elif risk_filter == "medium":
        risk_clause = "AND computed_risk >= 30 AND computed_risk < 60"
    elif risk_filter == "low":
        risk_clause = "AND computed_risk < 30"

    try:
        # Step 1: compute a risk/activity score per node from recent
        # relationship activity, then take the top N.
        query = f"""
            MATCH (n)
            WHERE (n:Agent OR n:Asset OR n:Policy OR n:Tool OR n:EndUser)
                  AND n.organization_id = $org_id
                  {type_filter}
            OPTIONAL MATCH (n)-[r]-()
            WHERE r.timestamp IS NULL
               OR datetime(r.timestamp) >= datetime() - duration({{hours: $hours}})
            WITH n, labels(n) AS node_labels,
                 count(r) AS activity_count,
                 sum(CASE WHEN r.decision = 'deny' THEN 1 ELSE 0 END) AS deny_count
            WITH n, node_labels, activity_count, deny_count,
                 (coalesce(n.risk_score, 0) * 0.4
                  + (deny_count * 10) * 0.4
                  + (CASE WHEN activity_count > 0 THEN 20 ELSE 0 END) * 0.2
                 ) AS computed_risk
            WHERE 1=1 {risk_clause}
            RETURN n, node_labels, activity_count, deny_count, computed_risk
            ORDER BY computed_risk DESC, activity_count DESC
            LIMIT $limit
        """
        node_result = self.execute(query, {
            "org_id": organization_id, "limit": limit, "hours": hours,
        })

        nodes = []
        node_ids = []
        for record in node_result:
            node = record["n"]
            node_id = node.get("id", str(node.id))
            node_ids.append(node_id)
            risk = round(record["computed_risk"] or 0, 1)
            nodes.append({
                "id":             node_id,
                "label":          record["node_labels"][0] if record["node_labels"] else "Unknown",
                "name":           node.get("name", node_id),
                "type":           node.get("type", ""),
                "email":          node.get("email", ""),
                "risk_score":     risk,
                "risk_level":     _risk_level(risk),
                "activity_count": record["activity_count"] or 0,
                "deny_count":     record["deny_count"] or 0,
            })

        if not node_ids:
            return {"nodes": [], "edges": [], "neo4j_available": True, "total_nodes": 0}

        # Step 2: get edges connecting ONLY the selected top-N nodes
        # (avoids pulling in unrelated relationships that would
        # reintroduce the spaghetti problem)
        edge_result = self.execute(
            """
            MATCH (from)-[r]->(to)
            WHERE from.id IN $ids AND to.id IN $ids
            RETURN
                from.id AS from_id, from.name AS from_name,
                to.id   AS to_id,   to.name   AS to_name,
                type(r) AS rel_type, r.action AS action,
                r.decision AS decision, r.timestamp AS ts,
                r.correlation_id AS correlation_id
            LIMIT 200
            """,
            {"ids": node_ids},
        )
        edges = []
        for record in edge_result:
            edges.append({
                "id":             f"{record['from_id']}-{record['rel_type']}-{record['to_id']}",
                "from":           record["from_id"],
                "to":             record["to_id"],
                "from_name":      record["from_name"],
                "to_name":        record["to_name"],
                "type":           record["rel_type"],
                "action":         record["action"],
                "decision":       record["decision"],
                "timestamp":      record["ts"],
                "correlation_id": record["correlation_id"],
            })

        # Count total matching nodes (for "Showing 25 of N" UI)
        count_result = self.execute(
            f"""
            MATCH (n)
            WHERE (n:Agent OR n:Asset OR n:Policy OR n:Tool OR n:EndUser)
                  AND n.organization_id = $org_id {type_filter}
            RETURN count(n) AS total
            """,
            {"org_id": organization_id},
        )
        total = count_result[0]["total"] if count_result else len(nodes)

        return {
            "nodes": nodes, "edges": edges,
            "neo4j_available": True, "total_nodes": total,
        }
    except Exception as e:
        logger.error(f"get_risk_ranked_graph: {e}")
        return {"nodes": [], "edges": [], "neo4j_available": False, "total_nodes": 0, "error": str(e)}


# ── Method 2: Single-node drill-down ────────────────────────────
def get_node_drilldown(self, node_id: str, organization_id: str) -> dict:
    """
    Returns everything connected to ONE node — used when a SOC
    analyst clicks a node in the overview graph. This is where
    full detail is acceptable since it's scoped to one entity,
    not the whole graph.
    """
    if not self._ensure_connected():
        return {"node": None, "connections": [], "neo4j_available": False}

    try:
        node_result = self.execute(
            """
            MATCH (n {id: $id, organization_id: $org_id})
            RETURN n, labels(n) AS labels
            """,
            {"id": node_id, "org_id": organization_id},
        )
        if not node_result:
            return {"node": None, "connections": [], "neo4j_available": True}

        n = node_result[0]["n"]
        labels = node_result[0]["labels"]

        conn_result = self.execute(
            """
            MATCH (center {id: $id, organization_id: $org_id})-[r]-(other)
            RETURN
                other.id AS other_id, other.name AS other_name,
                labels(other) AS other_labels,
                type(r) AS rel_type,
                startNode(r).id = $id AS outgoing,
                r.action AS action, r.decision AS decision,
                r.timestamp AS ts, r.correlation_id AS correlation_id
            ORDER BY r.timestamp DESC
            LIMIT 100
            """,
            {"id": node_id, "org_id": organization_id},
        )

        connections = [{
            "id":             c["other_id"],
            "name":           c["other_name"],
            "label":          c["other_labels"][0] if c["other_labels"] else "Unknown",
            "relationship":   c["rel_type"],
            "direction":      "outgoing" if c["outgoing"] else "incoming",
            "action":         c["action"],
            "decision":       c["decision"],
            "timestamp":      c["ts"],
            "correlation_id": c["correlation_id"],
        } for c in conn_result]

        return {
            "node": {
                "id":         node_id,
                "name":       n.get("name", node_id),
                "label":      labels[0] if labels else "Unknown",
                "type":       n.get("type", ""),
                "email":      n.get("email", ""),
                "risk_score": n.get("risk_score", 0),
            },
            "connections": connections,
            "neo4j_available": True,
        }
    except Exception as e:
        logger.error(f"get_node_drilldown: {e}")
        return {"node": None, "connections": [], "neo4j_available": False, "error": str(e)}


# ── Method 3: Correlation chain trace (the standout feature) ────
def get_correlation_chain(self, correlation_id: str, organization_id: str) -> dict:
    """
    Given a single CORR-ID, returns the complete chain of entities
    and relationships involved in that one runtime decision —
    EndUser -> Agent -> Tool -> Asset -> Policy -> (Incident if denied).
    This is the "one click investigation" feature.
    """
    if not self._ensure_connected():
        return {"nodes": [], "edges": [], "neo4j_available": False}

    try:
        result = self.execute(
            """
            MATCH (from)-[r {correlation_id: $corr_id}]->(to)
            WHERE from.organization_id = $org_id
            RETURN from, labels(from) AS from_labels,
                   to,   labels(to)   AS to_labels,
                   type(r) AS rel_type, r.action AS action,
                   r.decision AS decision, r.timestamp AS ts
            """,
            {"corr_id": correlation_id, "org_id": organization_id},
        )

        nodes = {}
        edges = []
        for record in result:
            for side, labels_key in [("from", "from_labels"), ("to", "to_labels")]:
                node = record[side]
                node_id = node.get("id", str(node.id))
                if node_id not in nodes:
                    nodes[node_id] = {
                        "id":    node_id,
                        "name":  node.get("name", node_id),
                        "label": record[labels_key][0] if record[labels_key] else "Unknown",
                        "type":  node.get("type", ""),
                    }
            edges.append({
                "from":      record["from"].get("id"),
                "to":        record["to"].get("id"),
                "type":      record["rel_type"],
                "action":    record["action"],
                "decision":  record["decision"],
                "timestamp": record["ts"],
            })

        return {
            "correlation_id": correlation_id,
            "nodes": list(nodes.values()),
            "edges": edges,
            "neo4j_available": True,
        }
    except Exception as e:
        logger.error(f"get_correlation_chain: {e}")
        return {"nodes": [], "edges": [], "neo4j_available": False, "error": str(e)}


def _risk_level(score: float) -> str:
    if score >= 80: return "critical"
    if score >= 60: return "high"
    if score >= 30: return "medium"
    if score > 0:   return "low"
    return "info"
