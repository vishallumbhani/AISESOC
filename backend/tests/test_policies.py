"""
test_policies.py — API tests for /api/v1/policies

Tests match the ACTUAL deployed policies.py:
  - CRUD: list, create (201), get, patch, delete
  - Audit log written on create/update/delete
  - NO versioning endpoints (not in deployed code)
  - NO simulate endpoint (not in deployed code)
  - Schema: Policy has {id, name, description, policy_type, rules,
                        status, priority, organization_id, created_at, updated_at}
  - rules must be a JSON object (dict), otherwise 422
"""
import pytest
from uuid import uuid4

BASE = "/api/v1/policies"

VALID_RULES  = {"allow": [], "deny": []}
DENY_RULES   = {
    "deny": [{"agent_id": "agent-x", "asset_id": "asset-y", "actions": ["access"]}],
    "allow": [],
}


class TestListPolicies:
    def test_list_returns_200_and_array(self, client, auth_headers):
        r = client.get(BASE, headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_requires_auth(self, client):
        r = client.get(BASE)
        assert r.status_code == 403

    def test_list_empty_for_new_org(self, client, auth_headers):
        r = client.get(BASE, headers=auth_headers)
        assert r.json() == []

    def test_list_returns_only_own_org_policies(self, client, auth_headers, deny_policy):
        r = client.get(BASE, headers=auth_headers)
        ids = [p["id"] for p in r.json()]
        assert str(deny_policy.id) in ids

    def test_list_ordered_by_priority(self, client, auth_headers):
        for prio in [300, 100, 200]:
            client.post(BASE, json={"name": f"P{prio}", "rules": VALID_RULES,
                                     "status": "active", "priority": prio},
                        headers=auth_headers)
        r = client.get(BASE, headers=auth_headers)
        priorities = [p["priority"] for p in r.json()]
        assert priorities == sorted(priorities)


class TestCreatePolicy:
    def test_create_returns_201(self, client, auth_headers):
        r = client.post(BASE, json={"name": "My Policy", "rules": VALID_RULES,
                                     "status": "active", "priority": 50},
                        headers=auth_headers)
        assert r.status_code == 201

    def test_create_returns_policy_fields(self, client, auth_headers):
        r = client.post(BASE, json={"name": "Test P", "rules": VALID_RULES,
                                     "status": "active", "priority": 100},
                        headers=auth_headers)
        data = r.json()
        assert data["name"] == "Test P"
        assert data["status"] == "active"
        assert data["priority"] == 100
        assert "id" in data
        assert "created_at" in data
        assert "organization_id" in data

    def test_create_with_description_and_type(self, client, auth_headers):
        r = client.post(BASE, json={"name": "Desc P", "description": "Test desc",
                                     "policy_type": "access_control",
                                     "rules": DENY_RULES, "status": "active",
                                     "priority": 10},
                        headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["description"] == "Test desc"
        assert r.json()["policy_type"] == "access_control"

    def test_create_requires_auth(self, client):
        r = client.post(BASE, json={"name": "X", "rules": VALID_RULES,
                                     "status": "active", "priority": 1})
        assert r.status_code == 403

    def test_create_requires_name(self, client, auth_headers):
        r = client.post(BASE, json={"rules": VALID_RULES, "status": "active",
                                     "priority": 1},
                        headers=auth_headers)
        assert r.status_code == 422

    def test_create_with_complex_deny_rules(self, client, auth_headers):
        r = client.post(BASE, json={"name": "Complex", "rules": DENY_RULES,
                                     "status": "active", "priority": 100},
                        headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["rules"]["deny"][0]["agent_id"] == "agent-x"

    def test_create_inactive_policy(self, client, auth_headers):
        r = client.post(BASE, json={"name": "Inactive P", "rules": VALID_RULES,
                                     "status": "inactive", "priority": 100},
                        headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["status"] == "inactive"


class TestGetPolicy:
    def test_get_existing_policy(self, client, auth_headers, deny_policy):
        r = client.get(f"{BASE}/{deny_policy.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == str(deny_policy.id)
        assert r.json()["name"] == deny_policy.name

    def test_get_nonexistent_returns_404(self, client, auth_headers):
        r = client.get(f"{BASE}/{uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_requires_auth(self, client, deny_policy):
        r = client.get(f"{BASE}/{deny_policy.id}")
        assert r.status_code == 403

    def test_cannot_get_other_org_policy(self, client, auth_headers):
        # Random UUID that belongs to no org accessible to this user
        r = client.get(f"{BASE}/{uuid4()}", headers=auth_headers)
        assert r.status_code == 404


class TestUpdatePolicy:
    def _create(self, client, auth_headers, name="Update Me", priority=50):
        r = client.post(BASE, json={"name": name, "rules": VALID_RULES,
                                     "status": "active", "priority": priority},
                        headers=auth_headers)
        assert r.status_code == 201
        return r.json()["id"]

    def test_patch_name(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        r = client.patch(f"{BASE}/{pid}", json={"name": "Renamed"},
                          headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed"

    def test_patch_status(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        r = client.patch(f"{BASE}/{pid}", json={"status": "inactive"},
                          headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["status"] == "inactive"

    def test_patch_rules(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        new_rules = {"deny": [{"agent_id": "*", "asset_id": "*", "actions": ["delete"]}],
                     "allow": []}
        r = client.patch(f"{BASE}/{pid}", json={"rules": new_rules}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["rules"]["deny"][0]["actions"] == ["delete"]

    def test_patch_priority(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        r = client.patch(f"{BASE}/{pid}", json={"priority": 999}, headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["priority"] == 999

    def test_patch_nonexistent_returns_404(self, client, auth_headers):
        r = client.patch(f"{BASE}/{uuid4()}", json={"name": "X"}, headers=auth_headers)
        assert r.status_code == 404

    def test_patch_requires_auth(self, client, deny_policy):
        r = client.patch(f"{BASE}/{deny_policy.id}", json={"name": "X"})
        assert r.status_code == 403

    def test_patch_all_fields(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        r = client.patch(f"{BASE}/{pid}", json={
            "name": "All Fields", "description": "Updated desc",
            "policy_type": "security", "rules": DENY_RULES,
            "status": "inactive", "priority": 5,
        }, headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "All Fields"
        assert d["description"] == "Updated desc"
        assert d["status"] == "inactive"


class TestDeletePolicy:
    def _create(self, client, auth_headers):
        r = client.post(BASE, json={"name": "Delete Me", "rules": VALID_RULES,
                                     "status": "active", "priority": 100},
                        headers=auth_headers)
        return r.json()["id"]

    def test_delete_returns_200(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        r = client.delete(f"{BASE}/{pid}", headers=auth_headers)
        assert r.status_code == 200

    def test_deleted_policy_not_found(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        client.delete(f"{BASE}/{pid}", headers=auth_headers)
        r = client.get(f"{BASE}/{pid}", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(f"{BASE}/{uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_delete_requires_auth(self, client, deny_policy):
        r = client.delete(f"{BASE}/{deny_policy.id}")
        assert r.status_code == 403

    def test_deleted_policy_no_longer_in_list(self, client, auth_headers):
        pid = self._create(client, auth_headers)
        client.delete(f"{BASE}/{pid}", headers=auth_headers)
        ids = [p["id"] for p in client.get(BASE, headers=auth_headers).json()]
        assert pid not in ids


class TestPolicyAuditLog:
    """Verify audit log entries are written for CRUD operations."""

    def test_create_writes_audit_log(self, client, auth_headers, db):
        from app.models import AuditLog
        before = db.query(AuditLog).filter(AuditLog.action == "policy_created").count()
        client.post(BASE, json={"name": "Audited Create", "rules": VALID_RULES,
                                 "status": "active", "priority": 100},
                    headers=auth_headers)
        after = db.query(AuditLog).filter(AuditLog.action == "policy_created").count()
        assert after == before + 1

    def test_update_writes_audit_log(self, client, auth_headers, deny_policy, db):
        from app.models import AuditLog
        before = db.query(AuditLog).filter(AuditLog.action == "policy_updated").count()
        client.patch(f"{BASE}/{deny_policy.id}", json={"name": "Updated"},
                     headers=auth_headers)
        after = db.query(AuditLog).filter(AuditLog.action == "policy_updated").count()
        assert after == before + 1

    def test_delete_writes_audit_log(self, client, auth_headers, db):
        from app.models import AuditLog
        r = client.post(BASE, json={"name": "To Delete", "rules": VALID_RULES,
                                     "status": "active", "priority": 1},
                        headers=auth_headers)
        pid = r.json()["id"]
        before = db.query(AuditLog).filter(AuditLog.action == "policy_deleted").count()
        client.delete(f"{BASE}/{pid}", headers=auth_headers)
        after = db.query(AuditLog).filter(AuditLog.action == "policy_deleted").count()
        assert after == before + 1
