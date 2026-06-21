from typing import Dict, Any, Optional, List
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class PolicyEngine:
    """Policy decision engine for runtime access control."""

    @staticmethod
    def evaluate_policy(
        agent_id: str,
        asset_id: str,
        policies: List[Dict[str, Any]],
        action: str = "access"
    ) -> Dict[str, Any]:
        """
        Evaluate if an agent can perform an action on an asset based on policies.

        Returns:
            Dictionary with decision, reason, and applied policies
        """
        try:
            applied_policies = []
            deny_reason = None

            # Check each policy
            for policy in policies:
                if not policy.get("status") == "active":
                    continue

                policy_id = policy.get("id")
                rules = policy.get("rules", {})

                # Check deny rules
                if "deny" in rules:
                    deny_list = rules.get("deny", [])
                    if PolicyEngine._check_deny_rule(agent_id, asset_id, deny_list):
                        applied_policies.append(policy_id)
                        deny_reason = f"Policy '{policy.get('name')}' denies this access"
                        return {
                            "decision": "deny",
                            "reason": deny_reason,
                            "policies_applied": applied_policies,
                            "action": action
                        }

                # Check allow rules
                if "allow" in rules:
                    allow_list = rules.get("allow", [])
                    if PolicyEngine._check_allow_rule(agent_id, asset_id, allow_list):
                        applied_policies.append(policy_id)

            # If no deny policies matched, allow
            return {
                "decision": "allow",
                "reason": "No policies deny this access" if applied_policies else "No matching policies",
                "policies_applied": applied_policies,
                "action": action
            }

        except Exception as e:
            logger.error(f"Error evaluating policy: {e}")
            return {
                "decision": "deny",
                "reason": f"Policy evaluation error: {str(e)}",
                "policies_applied": [],
                "action": action
            }

    @staticmethod
    def _check_deny_rule(agent_id: str, asset_id: str, deny_rules: List[str]) -> bool:
        """Check if agent or asset is in deny list."""
        # Simple string matching - can be enhanced with pattern matching
        for rule in deny_rules:
            if agent_id in rule or asset_id in rule:
                return True
        return False

    @staticmethod
    def _check_allow_rule(agent_id: str, asset_id: str, allow_rules: List[str]) -> bool:
        """Check if agent or asset is in allow list."""
        # Simple string matching - can be enhanced with pattern matching
        for rule in allow_rules:
            if agent_id in rule or asset_id in rule:
                return True
        return False

    @staticmethod
    def create_sample_policy() -> Dict[str, Any]:
        """Create a sample policy structure."""
        return {
            "name": "Sample Support Policy",
            "description": "Support agents can access customer data but not payroll",
            "policy_type": "access_control",
            "rules": {
                "deny": [
                    "support-agent:payroll-database",
                    "support-agent:hr-database"
                ],
                "allow": [
                    "support-agent:crm-tool",
                    "support-agent:customer-database"
                ]
            },
            "priority": 100
        }
