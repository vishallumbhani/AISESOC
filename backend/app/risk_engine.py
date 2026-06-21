from decimal import Decimal
from typing import Dict, Any, Optional
from uuid import UUID
import logging

logger = logging.getLogger(__name__)


class RiskEngine:
    """Simple risk scoring engine for assets."""

    # Risk factor weights (total = 100)
    WEIGHTS = {
        "data_sensitivity": 0.30,      # 30%
        "permission_level": 0.25,      # 25%
        "trust_score": 0.20,           # 20%
        "environment": 0.15,           # 15%
        "policy_gap": 0.10             # 10%
    }

    # Environment multipliers
    ENV_MULTIPLIERS = {
        "production": 1.0,
        "staging": 0.7,
        "development": 0.3,
        "testing": 0.2
    }

    # Severity thresholds
    SEVERITY_THRESHOLDS = {
        "critical": 80.0,
        "high": 60.0,
        "medium": 40.0,
        "low": 20.0,
        "minimal": 0.0
    }

    @staticmethod
    def calculate_risk_score(
        data_sensitivity: int,      # 0-100
        permission_level: int,      # 0-100
        trust_score: int,           # 0-100
        environment: str = "production",
        policy_gap: int = 0         # 0-100
    ) -> Dict[str, Any]:
        """
        Calculate risk score for an asset based on multiple factors.

        Returns:
            Dictionary with score, severity, and recommendation
        """
        try:
            # Normalize values to 0-100 range if needed
            data_sensitivity = min(100, max(0, data_sensitivity))
            permission_level = min(100, max(0, permission_level))
            trust_score = 100 - min(100, max(0, trust_score))  # Invert trust (lower trust = higher risk)
            policy_gap = min(100, max(0, policy_gap))

            # Calculate weighted score
            score = (
                data_sensitivity * RiskEngine.WEIGHTS["data_sensitivity"] +
                permission_level * RiskEngine.WEIGHTS["permission_level"] +
                trust_score * RiskEngine.WEIGHTS["trust_score"] +
                policy_gap * RiskEngine.WEIGHTS["policy_gap"]
            )

            # Apply environment multiplier
            env_multiplier = RiskEngine.ENV_MULTIPLIERS.get(environment.lower(), 1.0)
            score = score * env_multiplier

            # Determine severity
            severity = "minimal"
            for sev, threshold in RiskEngine.SEVERITY_THRESHOLDS.items():
                if score >= threshold:
                    severity = sev
                    break

            # Generate recommendation
            recommendation = RiskEngine._generate_recommendation(
                score, severity, data_sensitivity, permission_level, policy_gap
            )

            return {
                "score": float(round(Decimal(str(score)), 2)),
                "severity": severity,
                "data_sensitivity": data_sensitivity,
                "permission_level": permission_level,
                "trust_score": 100 - trust_score,  # Return original trust score
                "environment": environment,
                "policy_gap": policy_gap,
                "recommendation": recommendation
            }

        except Exception as e:
            logger.error(f"Error calculating risk score: {e}")
            return {
                "score": 0.0,
                "severity": "minimal",
                "recommendation": "Unable to calculate risk score"
            }

    @staticmethod
    def _generate_recommendation(score: float, severity: str, data_sensitivity: int, permission_level: int, policy_gap: int) -> str:
        """Generate a recommendation based on risk factors."""
        recommendations = []

        if data_sensitivity > 70:
            recommendations.append("Review data access controls for high-sensitivity data")

        if permission_level > 70:
            recommendations.append("Reduce permission levels for this asset")

        if policy_gap > 50:
            recommendations.append("Create or update policies for this asset")

        if severity == "critical":
            recommendations.append("URGENT: Immediate security review required")
        elif severity == "high":
            recommendations.append("Schedule security assessment within 7 days")

        return " | ".join(recommendations) if recommendations else "Monitor this asset for security changes"
