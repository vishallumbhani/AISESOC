"""
test_policy_engine.py

Pure unit tests for PolicyEngine — no database, no HTTP.
Tests match the ACTUAL deployed policy_engine.py which returns:
  {decision, reason, policies_applied, action}
  (no explainability fields in the deployed version)
"""
import pytest
from app.policy_engine import PolicyEngine

AGENT_ID = "agent-aaa-111"
ASSET_ID = "asset-bbb-222"
OTHER_ID = "other-ccc-333"


def _policy(name="P", deny_agent=None, deny_asset=None, allow_agent=None,
            allow_asset=None, actions=None, status="active"):
    deny = []
    allow = []
    acts = actions or ["access", "read", "write"]
    if deny_agent and deny_asset:
        deny = [{"agent_id": deny_agent, "asset_id": deny_asset, "actions": acts}]
    if allow_agent and allow_asset:
        allow = [{"agent_id": allow_agent, "asset_id": allow_asset, "actions": acts}]
    return {"id": f"pol-{name}", "name": name, "status": status,
            "rules": {"deny": deny, "allow": allow}}


class TestBasicDecisions:
    def test_no_policies_returns_allow(self):
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, [], "access")
        assert r["decision"] == "allow"

    def test_deny_rule_blocks_access(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "deny"

    def test_allow_rule_when_no_deny(self):
        p = [_policy(allow_agent=AGENT_ID, allow_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "allow"

    def test_inactive_policy_skipped(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID, status="inactive")]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "allow"

    def test_deny_evaluated_before_allow(self):
        """deny rule and allow rule both match — deny must win."""
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID,
                     allow_agent=AGENT_ID, allow_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "deny"

    def test_different_agent_not_denied(self):
        p = [_policy(deny_agent="other-agent", deny_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "allow"

    def test_different_asset_not_denied(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset="other-asset")]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "allow"


class TestActionMatching:
    def test_action_in_deny_list_blocked(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID, actions=["write"])]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "write")
        assert r["decision"] == "deny"

    def test_action_not_in_deny_list_allowed(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID, actions=["write"])]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "read")
        assert r["decision"] == "allow"

    def test_wildcard_action_blocks_all(self):
        p = [{"id": "p1", "name": "P", "status": "active",
              "rules": {"deny": [{"agent_id": AGENT_ID, "asset_id": ASSET_ID,
                                   "actions": ["*"]}], "allow": []}}]
        for action in ("access", "read", "write", "delete", "admin"):
            r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, action)
            assert r["decision"] == "deny", f"Expected deny for {action}"

    def test_action_case_insensitive(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID, actions=["READ"])]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "read")
        assert r["decision"] == "deny"


class TestWildcards:
    def test_wildcard_agent_blocks_any_agent(self):
        p = [{"id": "p1", "name": "P", "status": "active",
              "rules": {"deny": [{"agent_id": "*", "asset_id": ASSET_ID,
                                   "actions": ["access"]}], "allow": []}}]
        for agent in (AGENT_ID, "another-agent", "totally-different"):
            r = PolicyEngine.evaluate_policy(agent, ASSET_ID, p, "access")
            assert r["decision"] == "deny"

    def test_wildcard_asset_blocks_any_asset(self):
        p = [{"id": "p1", "name": "P", "status": "active",
              "rules": {"deny": [{"agent_id": AGENT_ID, "asset_id": "*",
                                   "actions": ["access"]}], "allow": []}}]
        for asset in (ASSET_ID, "other-asset", "third-asset"):
            r = PolicyEngine.evaluate_policy(AGENT_ID, asset, p, "access")
            assert r["decision"] == "deny"


class TestReturnShape:
    def test_deny_has_required_keys(self):
        p = [_policy(deny_agent=AGENT_ID, deny_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert "decision" in r
        assert "reason" in r
        assert "policies_applied" in r
        assert "action" in r

    def test_allow_has_required_keys(self):
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, [], "read")
        assert "decision" in r
        assert "reason" in r
        assert "policies_applied" in r
        assert "action" in r

    def test_policies_applied_contains_matching_policy_id(self):
        p = [_policy(name="X", deny_agent=AGENT_ID, deny_asset=ASSET_ID)]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert "pol-X" in r["policies_applied"]

    def test_action_echoed_in_response(self):
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, [], "delete")
        assert r["action"] == "delete"

    def test_reason_is_string(self):
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, [], "access")
        assert isinstance(r["reason"], str) and len(r["reason"]) > 0

    def test_policies_applied_empty_when_no_match(self):
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, [], "access")
        assert r["policies_applied"] == []


class TestLegacyStringRules:
    def test_legacy_string_rule_format(self):
        """Old format: 'agent-id:asset-id' string in deny list."""
        p = [{"id": "p1", "name": "P", "status": "active",
              "rules": {"deny": [f"{AGENT_ID}:{ASSET_ID}"], "allow": []}}]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "deny"


class TestMultiplePolicies:
    def test_first_deny_wins(self):
        p = [
            _policy(name="A", deny_agent=AGENT_ID, deny_asset=ASSET_ID),
            _policy(name="B", allow_agent=AGENT_ID, allow_asset=ASSET_ID),
        ]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "deny"
        assert "pol-A" in r["policies_applied"]

    def test_allow_in_later_policy_does_not_override_earlier_deny(self):
        p = [
            _policy(name="Deny", deny_agent=AGENT_ID, deny_asset=ASSET_ID),
            _policy(name="Allow", allow_agent=AGENT_ID, allow_asset=ASSET_ID),
        ]
        r = PolicyEngine.evaluate_policy(AGENT_ID, ASSET_ID, p, "access")
        assert r["decision"] == "deny"


class TestCreateSamplePolicy:
    def test_sample_policy_structure(self):
        # create_sample_policy is optional - skip if not present
        if not hasattr(PolicyEngine, "create_sample_policy"):
            return
        p = PolicyEngine.create_sample_policy()
        assert "name" in p
        assert "rules" in p
        assert "deny" in p["rules"]
        assert "allow" in p["rules"]
        assert isinstance(p["rules"]["deny"], list)
