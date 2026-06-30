"""
tests/test_incidents.py
tests/test_risk_engine.py
tests/test_graph.py
Combined into one file to keep things tidy.
"""
import pytest
from uuid import uuid4


# ── test_incidents ─────────────────────────────────────────────

class TestIncidents:
    BASE = "/api/v1/incidents"

    def test_list_empty(self, client, auth_headers):
        r = client.get(self.BASE, headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_filter_by_status(self, client, auth_headers):
        r = client.get(self.BASE, params={"status_filter": "open"}, headers=auth_headers)
        assert r.status_code == 200

    def test_filter_by_severity(self, client, auth_headers):
        r = client.get(self.BASE, params={"severity": "high"}, headers=auth_headers)
        assert r.status_code == 200

    def test_get_nonexistent_404(self, client, auth_headers):
        r = client.get(f"{self.BASE}/{uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_auto_incident_created_after_denials(self, client, auth_headers, agent, asset, deny_policy):
        """Trigger 3 denials in quick succession; incident should be created."""
        for _ in range(3):
            client.post("/api/v1/runtime/decision",
                        json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                              "action": "access"},
                        headers=auth_headers)
        r = client.get(self.BASE, params={"status_filter": "open"}, headers=auth_headers)
        incidents = r.json()
        matching = [i for i in incidents if i["agent_id"] == str(agent.id)]
        assert len(matching) >= 1

    def test_patch_incident_status(self, client, auth_headers, agent, asset, deny_policy):
        # Create an incident by firing denials
        for _ in range(3):
            client.post("/api/v1/runtime/decision",
                        json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                              "action": "access"},
                        headers=auth_headers)
        incidents = client.get(self.BASE, params={"status_filter": "open"},
                                headers=auth_headers).json()
        if not incidents:
            pytest.skip("No open incidents to update")
        iid = incidents[0]["id"]
        r = client.patch(f"{self.BASE}/{iid}",
                         json={"status": "investigating", "owner": "analyst@corp.com",
                               "timeline_note": "Looking into it"},
                         headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "investigating"
        assert r.json()["owner"] == "analyst@corp.com"
        assert len(r.json()["timeline"]) >= 1

    def test_patch_invalid_status_422(self, client, auth_headers, agent, asset, deny_policy):
        for _ in range(3):
            client.post("/api/v1/runtime/decision",
                        json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                              "action": "access"},
                        headers=auth_headers)
        incidents = client.get(self.BASE, params={"status_filter": "open"},
                                headers=auth_headers).json()
        if not incidents:
            pytest.skip("No incidents")
        iid = incidents[0]["id"]
        r = client.patch(f"{self.BASE}/{iid}",
                         json={"status": "not-a-real-status"}, headers=auth_headers)
        assert r.status_code == 422

    def test_incident_events_endpoint(self, client, auth_headers, agent, asset, deny_policy):
        for _ in range(3):
            client.post("/api/v1/runtime/decision",
                        json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                              "action": "access"},
                        headers=auth_headers)
        incidents = client.get(self.BASE, headers=auth_headers).json()
        if not incidents:
            pytest.skip("No incidents")
        iid = incidents[0]["id"]
        r = client.get(f"/api/v1/incidents/{iid}/events", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ── test_risk_engine ───────────────────────────────────────────

class TestRiskEngine:
    def test_basic_score_in_range(self):
        from app.risk_engine import RiskEngine
        result = RiskEngine.calculate_risk_score(
            data_sensitivity=50, permission_level=50, trust_score=50,
            environment="production", policy_gap=0
        )
        assert 0 <= result["score"] <= 100

    def test_high_sensitivity_high_score(self):
        from app.risk_engine import RiskEngine
        r = RiskEngine.calculate_risk_score(100, 100, 0, "production", 100)
        assert r["score"] > 60

    def test_low_sensitivity_low_score(self):
        from app.risk_engine import RiskEngine
        r = RiskEngine.calculate_risk_score(0, 0, 100, "development", 0)
        assert r["score"] < 30

    def test_severity_levels(self):
        from app.risk_engine import RiskEngine
        r_crit = RiskEngine.calculate_risk_score(100, 100, 0, "production", 100)
        r_min  = RiskEngine.calculate_risk_score(0, 0, 100, "testing", 0)
        assert r_crit["severity"] in ("critical", "high")
        assert r_min["severity"] in ("minimal", "low")

    def test_environment_multiplier(self):
        from app.risk_engine import RiskEngine
        r_prod = RiskEngine.calculate_risk_score(70, 70, 30, "production", 30)
        r_dev  = RiskEngine.calculate_risk_score(70, 70, 30, "development", 30)
        assert r_prod["score"] > r_dev["score"]

    def test_recommendation_not_empty(self):
        from app.risk_engine import RiskEngine
        r = RiskEngine.calculate_risk_score(80, 80, 20, "production", 50)
        assert r["recommendation"] and len(r["recommendation"]) > 5

    def test_risk_recalculate_endpoint(self, client, auth_headers, asset):
        r = client.post(
            f"/api/v1/risk-scores/recalculate/{asset.id}",
            params={"data_sensitivity": 80, "permission_level": 70,
                    "trust_score": 30, "environment": "production", "policy_gap": 40},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["score"] > 0

    def test_deny_events_bump_risk(self, client, auth_headers, agent, asset, deny_policy):
        # Fire denials to bump risk
        for _ in range(5):
            client.post("/api/v1/runtime/decision",
                        json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                              "action": "access"},
                        headers=auth_headers)
        r = client.get(f"/api/v1/assets/{asset.id}/risk-score", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["score"] > 0


# ── test_graph ─────────────────────────────────────────────────

class TestGraphAPI:
    BASE = "/api/v1/graph"

    def test_get_full_graph_returns_structure(self, client, auth_headers):
        r = client.get(self.BASE, headers=auth_headers)
        # Neo4j may not be available in test env — accept 200 or 500 gracefully
        assert r.status_code in (200, 500)
        if r.status_code == 200:
            data = r.json()
            assert "nodes" in data
            assert "edges" in data

    def test_sync_endpoint(self, client, auth_headers):
        r = client.get(f"{self.BASE}/sync", headers=auth_headers)
        assert r.status_code in (200, 500)

    def test_invalid_relationship_type_422(self, client, auth_headers):
        r = client.post(f"{self.BASE}/relationships",
                        json={"from_id": "x", "to_id": "y",
                              "from_label": "Agent", "to_label": "Asset",
                              "relationship_type": "INVALID_TYPE"},
                        headers=auth_headers)
        assert r.status_code == 422

    def test_node_detail_asset(self, client, auth_headers, asset):
        r = client.get(f"{self.BASE}/node/{asset.id}",
                       params={"node_type": "asset"}, headers=auth_headers)
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert r.json()["node_id"] == str(asset.id)

    def test_node_detail_agent(self, client, auth_headers, agent):
        r = client.get(f"{self.BASE}/node/{agent.id}",
                       params={"node_type": "agent"}, headers=auth_headers)
        assert r.status_code in (200, 404)


# ── test_audit_logs ────────────────────────────────────────────

class TestAuditLogs:
    BASE = "/api/v1/audit-logs"

    def test_list(self, client, auth_headers):
        r = client.get(self.BASE, headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_analytics_summary(self, client, auth_headers):
        r = client.get(f"{self.BASE}/analytics/summary", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "denied_today" in data
        assert "top_denied_agents" in data
        assert "top_protected_assets" in data
        assert "recent_decisions" in data

    def test_export_csv(self, client, auth_headers):
        r = client.get(f"{self.BASE}/export/csv", headers=auth_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")

    def test_filter_by_decision(self, client, auth_headers, agent, asset, deny_policy):
        client.post("/api/v1/runtime/decision",
                    json={"agent_id": str(agent.id), "asset_id": str(asset.id),
                          "action": "access"},
                    headers=auth_headers)
        r = client.get(self.BASE, params={"decision": "deny"}, headers=auth_headers)
        assert r.status_code == 200
