from decimal import Decimal
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class RiskEngine:
    """
    Dynamic risk scoring engine v2.

    Factors
    -------
    data_sensitivity   (0-100)  – how sensitive the data is
    permission_level   (0-100)  – how broad the access permissions are
    trust_score        (0-100)  – higher trust = lower risk (inverted internally)
    policy_gap         (0-100)  – driven by recent denial events (0 = well covered)
    environment        str      – production/staging/development/testing
    deny_event_count   int      – recent denial events (last 24h) for this asset
    asset_type         str      – database/api/storage/server/other
    """

    WEIGHTS = {
        "data_sensitivity": 0.28,
        "permission_level": 0.22,
        "trust_score":      0.18,
        "policy_gap":       0.18,   # bumped; now driven by live deny events
        "deny_events":      0.14,   # new — live signal
    }

    ENV_MULTIPLIERS = {
        "production":  1.0,
        "staging":     0.7,
        "development": 0.3,
        "testing":     0.2,
    }

    # Baseline data-sensitivity by asset type (applied when sensitivity=0)
    ASSET_TYPE_SENSITIVITY = {
        "database": 70,
        "api":      50,
        "storage":  55,
        "server":   35,
        "other":    20,
    }

    SEVERITY_THRESHOLDS = {
        "critical": 80.0,
        "high":     60.0,
        "medium":   40.0,
        "low":      20.0,
        "minimal":  0.0,
    }

    @staticmethod
    def calculate_risk_score(
        data_sensitivity: int = 0,
        permission_level: int = 0,
        trust_score: int = 50,
        environment: str = "production",
        policy_gap: int = 0,
        deny_event_count: int = 0,
        asset_type: str = "other",
    ) -> Dict[str, Any]:
        try:
            # Apply asset-type baseline if caller passes 0
            if data_sensitivity == 0:
                data_sensitivity = RiskEngine.ASSET_TYPE_SENSITIVITY.get(
                    asset_type.lower(), 20
                )

            ds  = min(100, max(0, data_sensitivity))
            pl  = min(100, max(0, permission_level))
            ts  = 100 - min(100, max(0, trust_score))   # invert
            pg  = min(100, max(0, policy_gap))
            # map deny count → 0-100; cap at 20 events = 100
            de  = min(100, deny_event_count * 5)

            score = (
                ds  * RiskEngine.WEIGHTS["data_sensitivity"]
                + pl  * RiskEngine.WEIGHTS["permission_level"]
                + ts  * RiskEngine.WEIGHTS["trust_score"]
                + pg  * RiskEngine.WEIGHTS["policy_gap"]
                + de  * RiskEngine.WEIGHTS["deny_events"]
            )

            env_mult = RiskEngine.ENV_MULTIPLIERS.get(environment.lower(), 1.0)
            score = score * env_mult

            severity = "minimal"
            for sev, threshold in RiskEngine.SEVERITY_THRESHOLDS.items():
                if score >= threshold:
                    severity = sev
                    break

            recommendation = RiskEngine._generate_recommendation(
                score, severity, ds, pl, pg, de, asset_type
            )

            return {
                "score":            float(round(Decimal(str(score)), 2)),
                "severity":         severity,
                "data_sensitivity": ds,
                "permission_level": pl,
                "trust_score":      100 - ts,   # return original
                "environment":      environment,
                "policy_gap":       pg,
                "deny_event_count": deny_event_count,
                "recommendation":   recommendation,
            }
        except Exception as e:
            logger.error(f"RiskEngine.calculate_risk_score: {e}")
            return {
                "score": 0.0,
                "severity": "minimal",
                "recommendation": "Unable to calculate risk score",
            }

    @staticmethod
    def _generate_recommendation(
        score: float,
        severity: str,
        data_sensitivity: int,
        permission_level: int,
        policy_gap: int,
        deny_event_score: int,
        asset_type: str,
    ) -> str:
        recs = []

        if data_sensitivity > 70:
            recs.append("Review data access controls for high-sensitivity data")
        if permission_level > 70:
            recs.append("Reduce permission levels for this asset")
        if policy_gap > 50:
            recs.append("Create or update policies — recent denial spike detected")
        if deny_event_score > 60:
            recs.append("Investigate repeated access denials — possible intrusion attempt")

        if asset_type.lower() == "database" and score > 40:
            recs.append("Apply database-level row security and connection limits")
        if asset_type.lower() == "api" and score > 40:
            recs.append("Enforce rate limits and token scoping on this API")

        if severity == "critical":
            recs.insert(0, "🚨 URGENT: Immediate security review required")
        elif severity == "high":
            recs.insert(0, "⚠ Schedule security assessment within 7 days")

        return " | ".join(recs) if recs else "Monitor this asset for security changes"

    @staticmethod
    def score_from_asset_context(
        asset_type: str,
        environment: str,
        deny_event_count: int = 0,
        has_policy: bool = True,
    ) -> Dict[str, Any]:
        """
        Convenience scorer that derives all factors from asset context.
        Used by the seed script and the auto-recalculate endpoint.
        """
        sensitivity = RiskEngine.ASSET_TYPE_SENSITIVITY.get(asset_type.lower(), 20)
        policy_gap  = 0 if has_policy else 60
        trust_score = 70 if has_policy else 40
        perm_level  = 60 if asset_type.lower() in ("database", "api") else 30

        return RiskEngine.calculate_risk_score(
            data_sensitivity=sensitivity,
            permission_level=perm_level,
            trust_score=trust_score,
            environment=environment,
            policy_gap=policy_gap,
            deny_event_count=deny_event_count,
            asset_type=asset_type,
        )
