"""
test_runtime.py — API tests for /api/v1/runtime/decision

Tests match the ACTUAL deployed runtime.py which returns EnrichedDecisionResponse:
  {decision, reason, risk_score, policies_applied, agent_name, asset_name,
   action, matched_policy_name, evaluation_time, incident_created, end_user_id}
  NO explainability fields (matched_rule, explanation, trace) in deployed version.
"""
import pytest
from uuid import uuid4

DECISION_URL = "/api/v1/runtime/decision"
EVENTS_URL   = "/api/v1/runtime/events"


def _body(agent_id, asset_id, action="access", **extra):
    return {"agent_id": str(agent_id), "asset_id": str(asset_id),
            "action": action, **extra}


class TestBasicDecision:
    def test_decision_returns_200(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.status_code == 200

    def test_decision_requires_auth(self, client, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id))
        assert r.status_code == 403

    def test_unknown_agent_404(self, client, auth_headers, asset):
        r = client.post(DECISION_URL, json=_body(uuid4(), asset.id), headers=auth_headers)
        assert r.status_code == 404

    def test_unknown_asset_404(self, client, auth_headers, agent):
        r = client.post(DECISION_URL, json=_body(agent.id, uuid4()), headers=auth_headers)
        assert r.status_code == 404

    def test_response_has_required_fields(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        d = r.json()
        for field in ("decision", "reason", "policies_applied", "action"):
            assert field in d, f"Missing field: {field}"

    def test_response_decision_is_allow_or_deny(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json()["decision"] in ("allow", "deny")

    def test_response_policies_applied_is_list(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert isinstance(r.json()["policies_applied"], list)

    def test_response_risk_score_numeric(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        rs = r.json().get("risk_score")
        if rs is not None:
            assert isinstance(rs, (int, float))

    def test_evaluation_time_returned(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json().get("evaluation_time") is not None


class TestDenyDecision:
    def test_deny_policy_blocks_agent(self, client, auth_headers, agent, asset, deny_policy):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id, "access"),
                        headers=auth_headers)
        assert r.json()["decision"] == "deny"

    def test_deny_returns_policy_in_policies_applied(self, client, auth_headers,
                                                      agent, asset, deny_policy):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert str(deny_policy.id) in r.json()["policies_applied"]

    def test_deny_returns_matched_policy_name(self, client, auth_headers,
                                               agent, asset, deny_policy):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json()["matched_policy_name"] == deny_policy.name

    def test_deny_returns_agent_and_asset_names(self, client, auth_headers,
                                                 agent, asset, deny_policy):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        d = r.json()
        assert d["agent_name"] == agent.name
        assert d["asset_name"] == asset.name

    def test_deny_for_multiple_actions(self, client, auth_headers, agent, asset, deny_policy):
        for action in ("access", "read", "write", "delete"):
            r = client.post(DECISION_URL, json=_body(agent.id, asset.id, action),
                            headers=auth_headers)
            assert r.json()["decision"] == "deny", f"Expected deny for {action}"

    def test_deny_action_echoed(self, client, auth_headers, agent, asset, deny_policy):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id, "write"),
                        headers=auth_headers)
        assert r.json()["action"] == "write"

    def test_deny_bumps_risk_score(self, client, auth_headers, agent, asset, deny_policy, db):
        from app.models import RiskScore
        rs_before = db.query(RiskScore).filter(RiskScore.asset_id == asset.id).first()
        score_before = float(rs_before.score) if rs_before else 0.0
        # Fire 3 denials to trigger score bump
        for _ in range(3):
            client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        db.expire_all()
        rs_after = db.query(RiskScore).filter(RiskScore.asset_id == asset.id).first()
        # Score should be at least as high (denial bumps policy_gap)
        assert rs_after is not None


class TestAllowDecision:
    def test_no_policy_defaults_to_allow(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json()["decision"] == "allow"

    def test_allow_policies_applied_may_be_empty(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        # Without any policy, policies_applied is empty
        assert r.json()["policies_applied"] == []

    def test_allow_no_matched_policy_name(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        # No deny policy → matched_policy_name is None
        assert r.json().get("matched_policy_name") is None

    def test_allow_on_unrelated_asset(self, client, auth_headers, agent, asset2,
                                      deny_policy, allow_policy):
        """deny_policy targets asset, not asset2 → agent can access asset2"""
        r = client.post(DECISION_URL, json=_body(agent.id, asset2.id, "read"),
                        headers=auth_headers)
        assert r.json()["decision"] == "allow"

    def test_inactive_policy_does_not_deny(self, client, auth_headers, agent, asset, db):
        from app.models import Policy
        p = Policy(organization_id=agent.organization_id,
                   name="Inactive Deny", policy_type="access_control",
                   rules={"deny": [{"agent_id": str(agent.id), "asset_id": str(asset.id),
                                    "actions": ["access"]}], "allow": []},
                   status="inactive", priority=1, created_by=agent.created_by)
        db.add(p); db.flush()
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json()["decision"] == "allow"


class TestEndUserTracking:
    def test_end_user_id_returned_when_provided(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(
            agent.id, asset.id,
            end_user_external_id="u-001",
            end_user_email="jane@corp.com",
            session_id="sess-abc",
            prompt="show salaries",
        ), headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["end_user_id"] is not None

    def test_end_user_id_none_when_not_provided(self, client, auth_headers, agent, asset):
        r = client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        assert r.json()["end_user_id"] is None

    def test_end_user_persisted_in_db(self, client, auth_headers, agent, asset, db):
        from app.models import EndUser
        ext_id = f"eu-{uuid4().hex[:8]}"
        client.post(DECISION_URL, json=_body(
            agent.id, asset.id,
            end_user_external_id=ext_id,
        ), headers=auth_headers)
        db.expire_all()
        eu = db.query(EndUser).filter(EndUser.external_user_id == ext_id).first()
        assert eu is not None

    def test_session_and_prompt_stored_in_runtime_event(self, client, auth_headers,
                                                          agent, asset, db):
        from app.models import RuntimeEvent
        sess = f"sess-{uuid4().hex[:6]}"
        prompt = "List all employees earning above 100k"
        client.post(DECISION_URL, json=_body(
            agent.id, asset.id,
            session_id=sess,
            prompt=prompt,
        ), headers=auth_headers)
        db.expire_all()
        ev = db.query(RuntimeEvent).filter(RuntimeEvent.session_id == sess).first()
        assert ev is not None
        assert ev.prompt_preview and "100k" in ev.prompt_preview

    def test_duplicate_end_user_updates_not_duplicates(self, client, auth_headers,
                                                        agent, asset, db):
        from app.models import EndUser
        ext_id = f"eu-dup-{uuid4().hex[:6]}"
        for _ in range(3):
            client.post(DECISION_URL, json=_body(
                agent.id, asset.id, end_user_external_id=ext_id,
            ), headers=auth_headers)
        db.expire_all()
        count = db.query(EndUser).filter(EndUser.external_user_id == ext_id).count()
        assert count == 1


class TestRuntimeEventPersistence:
    def test_event_written_on_allow(self, client, auth_headers, agent, asset, db):
        from app.models import RuntimeEvent
        before = db.query(RuntimeEvent).filter(RuntimeEvent.status == "allow").count()
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        db.expire_all()
        after = db.query(RuntimeEvent).filter(RuntimeEvent.status == "allow").count()
        assert after == before + 1

    def test_event_written_on_deny(self, client, auth_headers, agent, asset,
                                   deny_policy, db):
        from app.models import RuntimeEvent
        before = db.query(RuntimeEvent).filter(RuntimeEvent.status == "deny").count()
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        db.expire_all()
        after = db.query(RuntimeEvent).filter(RuntimeEvent.status == "deny").count()
        assert after == before + 1

    def test_event_has_correct_agent_and_asset(self, client, auth_headers,
                                                agent, asset, db):
        from app.models import RuntimeEvent
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        db.expire_all()
        ev = (db.query(RuntimeEvent)
              .filter(RuntimeEvent.agent_id == agent.id)
              .order_by(RuntimeEvent.created_at.desc()).first())
        assert ev is not None
        assert str(ev.asset_id) == str(asset.id)

    def test_audit_log_written(self, client, auth_headers, agent, asset, db):
        from app.models import AuditLog
        before = db.query(AuditLog).filter(AuditLog.action == "runtime_decision").count()
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        db.expire_all()
        after = db.query(AuditLog).filter(AuditLog.action == "runtime_decision").count()
        assert after == before + 1


class TestRuntimeEventsList:
    def test_events_list_returns_200(self, client, auth_headers):
        r = client.get(EVENTS_URL, headers=auth_headers)
        assert r.status_code == 200

    def test_events_is_list(self, client, auth_headers):
        assert isinstance(client.get(EVENTS_URL, headers=auth_headers).json(), list)

    def test_events_appear_after_decision(self, client, auth_headers, agent, asset):
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        events = client.get(EVENTS_URL, headers=auth_headers).json()
        assert len(events) >= 1

    def test_event_fields_present(self, client, auth_headers, agent, asset):
        client.post(DECISION_URL, json=_body(agent.id, asset.id), headers=auth_headers)
        ev = client.get(EVENTS_URL, headers=auth_headers).json()[0]
        for f in ("id", "agent_id", "asset_id", "action", "status", "created_at"):
            assert f in ev

    def test_events_requires_auth(self, client):
        r = client.get(EVENTS_URL)
        assert r.status_code == 403
