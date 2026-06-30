"""
test_incidents.py — API tests for /api/v1/incidents

Tests the ACTUAL deployed incidents.py:
  - GET /incidents           list with filters (status_filter, severity, owner)
  - GET /incidents/{id}      get one (enriched with agent_name, asset_name)
  - GET /incidents/{id}/events  related runtime events
  - PATCH /incidents/{id}    update status/owner/timeline
  - Auto-creation after 3+ denials in 10min window
"""
import pytest
from uuid import uuid4

BASE     = "/api/v1/incidents"
DECISION = "/api/v1/runtime/decision"


def _decide(client, auth_headers, agent_id, asset_id, action="access"):
    return client.post(DECISION, json={"agent_id": str(agent_id),
                                        "asset_id": str(asset_id),
                                        "action": action},
                       headers=auth_headers)


class TestListIncidents:
    def test_list_returns_200(self, client, auth_headers):
        r = client.get(BASE, headers=auth_headers)
        assert r.status_code == 200

    def test_list_is_array(self, client, auth_headers):
        assert isinstance(client.get(BASE, headers=auth_headers).json(), list)

    def test_list_requires_auth(self, client):
        assert client.get(BASE).status_code == 403

    def test_list_includes_seeded_incident(self, client, auth_headers, open_incident):
        ids = [i["id"] for i in client.get(BASE, headers=auth_headers).json()]
        assert str(open_incident.id) in ids

    def test_filter_by_status_open(self, client, auth_headers, open_incident):
        r = client.get(BASE, params={"status_filter": "open"}, headers=auth_headers)
        assert r.status_code == 200
        assert all(i["status"] == "open" for i in r.json())

    def test_filter_by_severity_high(self, client, auth_headers, open_incident):
        r = client.get(BASE, params={"severity": "high"}, headers=auth_headers)
        assert r.status_code == 200
        assert all(i["severity"] == "high" for i in r.json())

    def test_filter_by_owner_returns_empty_when_no_owner(self, client, auth_headers,
                                                          open_incident):
        r = client.get(BASE, params={"owner": "nobody@corp.com"}, headers=auth_headers)
        assert r.status_code == 200
        # The open_incident fixture has no owner, so this should be empty
        assert r.json() == []

    def test_incident_has_agent_name(self, client, auth_headers, open_incident, agent):
        incidents = client.get(BASE, headers=auth_headers).json()
        target = next(i for i in incidents if i["id"] == str(open_incident.id))
        assert target["agent_name"] == agent.name

    def test_incident_has_asset_name(self, client, auth_headers, open_incident, asset):
        incidents = client.get(BASE, headers=auth_headers).json()
        target = next(i for i in incidents if i["id"] == str(open_incident.id))
        assert target["asset_name"] == asset.name


class TestGetIncident:
    def test_get_existing(self, client, auth_headers, open_incident):
        r = client.get(f"{BASE}/{open_incident.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == str(open_incident.id)

    def test_get_nonexistent_404(self, client, auth_headers):
        r = client.get(f"{BASE}/{uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_requires_auth(self, client, open_incident):
        assert client.get(f"{BASE}/{open_incident.id}").status_code == 403

    def test_get_has_timeline(self, client, auth_headers, open_incident):
        r = client.get(f"{BASE}/{open_incident.id}", headers=auth_headers)
        assert isinstance(r.json()["timeline"], list)
        assert len(r.json()["timeline"]) >= 1

    def test_get_has_resolution_details(self, client, auth_headers, open_incident):
        r = client.get(f"{BASE}/{open_incident.id}", headers=auth_headers)
        assert isinstance(r.json()["resolution_details"], dict)


class TestUpdateIncident:
    def test_update_status_to_investigating(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "investigating"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "investigating"

    def test_update_status_to_resolved(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "resolved", "resolution_notes": "Fixed."},
                          headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "resolved"
        assert r.json()["resolved_at"] is not None

    def test_update_status_to_false_positive(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "false_positive"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["resolved_at"] is not None

    def test_update_status_to_closed(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "closed"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "closed"

    def test_invalid_status_returns_422(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "bogus_status"}, headers=auth_headers)
        assert r.status_code == 422

    def test_update_owner(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"owner": "analyst@corp.com"}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["owner"] == "analyst@corp.com"

    def test_update_resolution_notes(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"resolution_notes": "Root cause: misconfigured policy"},
                          headers=auth_headers)
        assert r.status_code == 200
        assert "misconfigured" in r.json()["resolution_notes"]

    def test_timeline_note_appended(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"timeline_note": "Investigating the root cause"},
                          headers=auth_headers)
        assert r.status_code == 200
        tl = r.json()["timeline"]
        notes = [e.get("note", "") for e in tl]
        assert any("root cause" in (n or "") for n in notes)

    def test_status_change_appended_to_timeline(self, client, auth_headers, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}",
                          json={"status": "investigating"}, headers=auth_headers)
        tl = r.json()["timeline"]
        actions = [e["action"] for e in tl]
        assert any("status_changed" in a for a in actions)

    def test_patch_nonexistent_404(self, client, auth_headers):
        r = client.patch(f"{BASE}/{uuid4()}", json={"status": "closed"},
                          headers=auth_headers)
        assert r.status_code == 404

    def test_patch_requires_auth(self, client, open_incident):
        r = client.patch(f"{BASE}/{open_incident.id}", json={"status": "closed"})
        assert r.status_code == 403

    def test_update_writes_audit_log(self, client, auth_headers, open_incident, db):
        from app.models import AuditLog
        before = db.query(AuditLog).filter(AuditLog.action == "incident_updated").count()
        client.patch(f"{BASE}/{open_incident.id}", json={"status": "investigating"},
                     headers=auth_headers)
        db.expire_all()
        after = db.query(AuditLog).filter(AuditLog.action == "incident_updated").count()
        assert after == before + 1


class TestIncidentAutoCreation:
    """Verify that 3+ denials in 10-minute window auto-creates an incident."""

    def test_auto_create_after_threshold_denials(self, client, auth_headers,
                                                  agent, asset, deny_policy, db):
        from app.models import Incident
        before = db.query(Incident).filter(
            Incident.agent_id == agent.id,
            Incident.asset_id == asset.id,
        ).count()
        for _ in range(3):
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        after = db.query(Incident).filter(
            Incident.agent_id == agent.id,
            Incident.asset_id == asset.id,
        ).count()
        assert after > before

    def test_auto_created_incident_status_is_open(self, client, auth_headers,
                                                   agent, asset, deny_policy, db):
        from app.models import Incident
        for _ in range(3):
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        inc = db.query(Incident).filter(
            Incident.agent_id == agent.id,
            Incident.asset_id == asset.id,
            Incident.status == "open",
        ).first()
        assert inc is not None

    def test_auto_created_incident_severity_is_high(self, client, auth_headers,
                                                     agent, asset, deny_policy, db):
        from app.models import Incident
        for _ in range(3):
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        inc = db.query(Incident).filter(
            Incident.agent_id == agent.id,
            Incident.asset_id == asset.id,
        ).first()
        assert inc.severity == "high"

    def test_auto_created_incident_has_timeline(self, client, auth_headers,
                                                 agent, asset, deny_policy, db):
        from app.models import Incident
        for _ in range(3):
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        inc = db.query(Incident).filter(
            Incident.agent_id == agent.id,
        ).first()
        if inc:
            assert isinstance(inc.timeline, list)
            assert len(inc.timeline) >= 1

    def test_no_duplicate_open_incidents(self, client, auth_headers,
                                         agent, asset, deny_policy, db):
        from app.models import Incident
        for _ in range(6):  # 2x threshold
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        count = db.query(Incident).filter(
            Incident.agent_id == agent.id,
            Incident.asset_id == asset.id,
            Incident.status == "open",
            Incident.incident_type == "unauthorized_access_attempt",
        ).count()
        assert count <= 1

    def test_auto_incident_audit_log_written(self, client, auth_headers,
                                              agent, asset, deny_policy, db):
        from app.models import AuditLog
        before = db.query(AuditLog).filter(
            AuditLog.action == "incident_auto_created"
        ).count()
        for _ in range(3):
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        after = db.query(AuditLog).filter(
            AuditLog.action == "incident_auto_created"
        ).count()
        assert after > before

    def test_below_threshold_no_incident(self, client, auth_headers,
                                          agent, asset, deny_policy, db):
        from app.models import Incident
        before = db.query(Incident).count()
        for _ in range(2):   # below threshold of 3
            _decide(client, auth_headers, agent.id, asset.id)
        db.expire_all()
        after = db.query(Incident).count()
        assert after == before   # no new incident


class TestIncidentEvents:
    def test_events_endpoint_returns_200(self, client, auth_headers, open_incident):
        r = client.get(f"{BASE}/{open_incident.id}/events", headers=auth_headers)
        assert r.status_code == 200

    def test_events_is_list(self, client, auth_headers, open_incident):
        r = client.get(f"{BASE}/{open_incident.id}/events", headers=auth_headers)
        assert isinstance(r.json(), list)

    def test_events_nonexistent_incident_404(self, client, auth_headers):
        r = client.get(f"{BASE}/{uuid4()}/events", headers=auth_headers)
        assert r.status_code == 404
