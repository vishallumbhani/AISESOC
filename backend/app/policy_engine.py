from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)


class PolicyEngine:
    """Policy decision engine — returns fully explainable results."""

    @staticmethod
    def evaluate_policy(
        agent_id: str,
        asset_id: str,
        policies: List[Dict[str, Any]],
        action: str = "access",
        agent_name: str = "",
        asset_name: str = "",
    ) -> Dict[str, Any]:
        """
        Evaluate all active policies and return an explainable decision.

        Returns
        -------
        {
            decision           : "allow" | "deny"
            reason             : human-readable summary
            policies_applied   : [policy_id, ...]
            action             : the action evaluated
            # explainability fields
            matched_policy     : policy name that triggered the decision
            matched_policy_id  : policy UUID
            matched_rule       : "<agent_name or id> → <asset_name or id>"
            rule_type          : "deny" | "allow" | None
            explanation        : detailed explanation string
            trace              : list of {policy, effect, matched} for all evaluated policies
        }
        """
        try:
            applied_policies: List[str] = []
            action = (action or "access").lower()
            trace: List[Dict[str, Any]] = []

            for policy in policies:
                if policy.get("status") != "active":
                    continue

                policy_id   = policy.get("id", "")
                policy_name = policy.get("name", "unknown")
                rules       = policy.get("rules", {}) or {}
                description = policy.get("description", "")

                # ── Check deny rules first ─────────────────────
                deny_list = rules.get("deny", [])
                matched_deny, deny_rule = PolicyEngine._match_rules_with_detail(
                    agent_id, asset_id, deny_list, action
                )
                if matched_deny:
                    applied_policies.append(policy_id)
                    agent_label = agent_name or agent_id[:8]
                    asset_label = asset_name or asset_id[:8]
                    matched_rule_str = PolicyEngine._rule_to_label(
                        deny_rule, agent_label, asset_label
                    )
                    trace.append({
                        "policy": policy_name,
                        "effect": "deny",
                        "matched": True,
                        "rule": matched_rule_str,
                    })
                    explanation = (
                        f"'{agent_label}' is explicitly denied '{action}' access "
                        f"to '{asset_label}' by policy '{policy_name}'."
                    )
                    if description:
                        explanation += f" Policy purpose: {description}"
                    return {
                        "decision":          "deny",
                        "reason":            f"Policy '{policy_name}' denies this access",
                        "policies_applied":  applied_policies,
                        "action":            action,
                        "matched_policy":    policy_name,
                        "matched_policy_id": policy_id,
                        "matched_rule":      matched_rule_str,
                        "rule_type":         "deny",
                        "explanation":       explanation,
                        "trace":             trace,
                    }

                # ── Check allow rules ──────────────────────────
                allow_list = rules.get("allow", [])
                matched_allow, allow_rule = PolicyEngine._match_rules_with_detail(
                    agent_id, asset_id, allow_list, action
                )
                if matched_allow:
                    applied_policies.append(policy_id)
                    trace.append({
                        "policy": policy_name,
                        "effect": "allow",
                        "matched": True,
                        "rule": PolicyEngine._rule_to_label(
                            allow_rule, agent_name or agent_id[:8], asset_name or asset_id[:8]
                        ),
                    })
                else:
                    trace.append({"policy": policy_name, "effect": None, "matched": False})

            # ── Default: allow ─────────────────────────────────
            reason = "No policies deny this access" if applied_policies else "No matching policies found"
            return {
                "decision":          "allow",
                "reason":            reason,
                "policies_applied":  applied_policies,
                "action":            action,
                "matched_policy":    None,
                "matched_policy_id": None,
                "matched_rule":      None,
                "rule_type":         "allow" if applied_policies else None,
                "explanation":       reason,
                "trace":             trace,
            }

        except Exception as e:
            logger.error(f"PolicyEngine.evaluate_policy error: {e}")
            return {
                "decision":          "deny",
                "reason":            f"Policy evaluation error: {str(e)}",
                "policies_applied":  [],
                "action":            action,
                "matched_policy":    None,
                "matched_policy_id": None,
                "matched_rule":      None,
                "rule_type":         None,
                "explanation":       f"An internal error prevented policy evaluation: {str(e)}",
                "trace":             [],
            }

    @staticmethod
    def _match_rules_with_detail(
        agent_id: str,
        asset_id: str,
        rules: List[Any],
        action: str,
    ) -> tuple[bool, Optional[Dict]]:
        """Like _match_rules but also returns the matched rule dict."""
        action = (action or "access").lower()
        for rule in rules:
            if isinstance(rule, str):
                if agent_id.lower() in rule.lower() and asset_id.lower() in rule.lower():
                    return True, {"raw": rule}

            if isinstance(rule, dict):
                rule_agent = str(
                    rule.get("agent_id") or rule.get("agent") or rule.get("subject") or ""
                )
                rule_asset = str(
                    rule.get("asset_id") or rule.get("resource_id") or
                    rule.get("resource") or rule.get("asset") or ""
                )
                actions = rule.get("actions") or rule.get("action") or ["*"]
                if isinstance(actions, str):
                    actions = [actions]
                actions = [str(a).lower() for a in actions]

                agent_match  = rule_agent == "*" or rule_agent.lower() == agent_id.lower()
                asset_match  = rule_asset == "*" or rule_asset.lower() == asset_id.lower()
                action_match = "*" in actions or action in actions

                if agent_match and asset_match and action_match:
                    return True, rule

        return False, None

    @staticmethod
    def _match_rules(
        agent_id: str, asset_id: str, rules: List[Any], action: str = "access"
    ) -> bool:
        matched, _ = PolicyEngine._match_rules_with_detail(agent_id, asset_id, rules, action)
        return matched

    @staticmethod
    def _rule_to_label(rule: Optional[Dict], agent_label: str, asset_label: str) -> str:
        if not rule:
            return f"{agent_label} → {asset_label}"
        if "raw" in rule:
            return str(rule["raw"])
        a_id  = rule.get("agent_id") or rule.get("agent") or agent_label
        as_id = rule.get("asset_id") or rule.get("asset") or rule.get("resource_id") or asset_label
        acts  = rule.get("actions") or rule.get("action") or ["*"]
        if isinstance(acts, list):
            acts = ", ".join(acts)
        return f"{a_id} → {as_id} [{acts}]"

    # ── Simulator: dry-run against arbitrary rules ─────────────
    @staticmethod
    def simulate(
        agent_id: str,
        asset_id: str,
        action: str,
        policies: List[Dict[str, Any]],
        agent_name: str = "",
        asset_name: str = "",
    ) -> Dict[str, Any]:
        """
        Same as evaluate_policy but never touches the database.
        Returns a full trace even when decision is allow.
        """
        return PolicyEngine.evaluate_policy(
            agent_id=agent_id,
            asset_id=asset_id,
            policies=policies,
            action=action,
            agent_name=agent_name,
            asset_name=asset_name,
        )
