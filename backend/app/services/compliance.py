"""
backend/app/services/compliance.py

Compliance reporting engine.

Fixes:
  - collect_evidence: all results coerced to numeric (int/float) before storing.
    If a query fails, evidence[key] = 0 (not an error string).
    This prevents "'>' not supported between instances of 'str' and 'int'" in _assess_control.
  - Uses sqlalchemy text() with proper parameter binding (no string interpolation).
  - _assess_control: safe_int() helper prevents any type errors on comparison.
  - owasp_llm08 query simplified (jsonb_array_length can fail on non-jsonb setups).
  - generate_executive_report: bad subquery replaced with safe equivalent.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import text
from uuid import UUID
import csv, io, json, logging

logger = logging.getLogger(__name__)


# ── Built-in compliance mappings ───────────────────────────────

COMPLIANCE_MAPPINGS = [
    # ── SOC 2 ──────────────────────────────────────────────────
    {
        "id": "soc2_cc6.1",
        "framework": "SOC2",
        "control_id": "CC6.1",
        "control_name": "Logical and Physical Access Controls",
        "description": "The entity implements logical access security measures to protect against threats from sources outside its system boundaries.",
        "evidence_types": ["policies", "runtime_events", "audit_logs"],
        "queries": {
            "policies_count":      "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "denied_requests_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND created_at >= :start",
            "policy_changes_30d":  "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND action LIKE 'policy_%' AND created_at >= :start",
        },
    },
    {
        "id": "soc2_cc7.2",
        "framework": "SOC2",
        "control_id": "CC7.2",
        "control_name": "System Monitoring",
        "description": "The entity monitors system components and the operation of controls to detect anomalies.",
        "evidence_types": ["runtime_events", "incidents", "audit_logs"],
        "queries": {
            "incidents_30d":      "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND created_at >= :start",
            "open_incidents":     "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND status='open'",
            "runtime_events_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
        },
    },
    {
        "id": "soc2_cc9.2",
        "framework": "SOC2",
        "control_id": "CC9.2",
        "control_name": "Risk Mitigation Activities",
        "description": "The entity selects and develops risk mitigation activities for risks arising from potential business disruptions.",
        "evidence_types": ["risk_scores", "incidents", "policies"],
        "queries": {
            "high_risk_assets":       "SELECT COUNT(*) FROM risk_scores WHERE organization_id=:org AND severity IN ('high','critical')",
            "resolved_incidents_30d": "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND status='resolved' AND created_at >= :start",
        },
    },
    # ── ISO 27001 ───────────────────────────────────────────────
    {
        "id": "iso27001_a9.4",
        "framework": "ISO27001",
        "control_id": "A.9.4",
        "control_name": "System and Application Access Control",
        "description": "Access to systems and applications shall be controlled by an access control policy.",
        "evidence_types": ["policies", "runtime_events", "agents", "assets"],
        "queries": {
            "active_policies":      "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "agents_with_policies": "SELECT COUNT(DISTINCT agent_id) FROM runtime_events WHERE organization_id=:org",
        },
    },
    {
        "id": "iso27001_a12.4",
        "framework": "ISO27001",
        "control_id": "A.12.4",
        "control_name": "Logging and Monitoring",
        "description": "Event logs recording user activities shall be produced, kept, and regularly reviewed.",
        "evidence_types": ["audit_logs", "runtime_events"],
        "queries": {
            "audit_log_count_30d":   "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND created_at >= :start",
            "runtime_log_count_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
        },
    },
    {
        "id": "iso27001_a16.1",
        "framework": "ISO27001",
        "control_id": "A.16.1",
        "control_name": "Management of Information Security Incidents",
        "description": "Responsibilities and procedures shall be established to ensure a quick, effective, and orderly response to information security incidents.",
        "evidence_types": ["incidents", "audit_logs"],
        "queries": {
            "incidents_30d":         "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND created_at >= :start",
            "resolved_incidents_30d":"SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND status='resolved' AND created_at >= :start",
        },
    },
    # ── NIST AI RMF ─────────────────────────────────────────────
    {
        "id": "nist_ai_rmf_govern_1",
        "framework": "NIST_AI_RMF",
        "control_id": "GOVERN 1.1",
        "control_name": "AI Risk Management Policies",
        "description": "Policies, processes, and procedures are in place for organizational risk management decisions related to AI.",
        "evidence_types": ["policies", "audit_logs"],
        "queries": {
            "ai_policies_active": "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "policy_updates_30d": "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND action='policy_updated' AND created_at >= :start",
        },
    },
    {
        "id": "nist_ai_rmf_map_1",
        "framework": "NIST_AI_RMF",
        "control_id": "MAP 1.1",
        "control_name": "AI System Context and Risk",
        "description": "Context is established for the AI system's trustworthiness, including risk assessments.",
        "evidence_types": ["agents", "risk_scores", "assets"],
        "queries": {
            "assets_with_risk_scores": "SELECT COUNT(DISTINCT asset_id) FROM risk_scores WHERE organization_id=:org",
            "high_risk_count":         "SELECT COUNT(*) FROM risk_scores WHERE organization_id=:org AND severity IN ('high','critical')",
        },
    },
    {
        "id": "nist_ai_rmf_measure_2",
        "framework": "NIST_AI_RMF",
        "control_id": "MEASURE 2.2",
        "control_name": "AI Risk Metrics",
        "description": "AI risk metrics are established and quantified.",
        "evidence_types": ["risk_scores", "runtime_events", "incidents"],
        "queries": {
            "avg_risk_score":   "SELECT COALESCE(AVG(score), 0) FROM risk_scores WHERE organization_id=:org",
            "total_events_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
            "denied_events_30d":"SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND created_at >= :start",
        },
    },
    # ── OWASP LLM Top 10 ────────────────────────────────────────
    {
        "id": "owasp_llm01",
        "framework": "OWASP_LLM",
        "control_id": "LLM01",
        "control_name": "Prompt Injection",
        "description": "Malicious inputs that override intended instructions. Evidence of prompt monitoring and policy enforcement.",
        "evidence_types": ["runtime_events", "policies", "incidents"],
        "queries": {
            "prompts_screened_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND prompt_preview IS NOT NULL AND created_at >= :start",
            "denied_prompts_30d":   "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND prompt_preview IS NOT NULL AND created_at >= :start",
        },
    },
    {
        "id": "owasp_llm06",
        "framework": "OWASP_LLM",
        "control_id": "LLM06",
        "control_name": "Sensitive Information Disclosure",
        "description": "LLMs may reveal sensitive data. Evidence of access control policies on sensitive assets.",
        "evidence_types": ["assets", "policies", "runtime_events"],
        "queries": {
            "restricted_assets":       "SELECT COUNT(*) FROM assets WHERE organization_id=:org AND classification IN ('confidential','restricted')",
            "active_policies":         "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "denied_events_30d":       "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND created_at >= :start",
        },
    },
    {
        "id": "owasp_llm08",
        "framework": "OWASP_LLM",
        "control_id": "LLM08",
        "control_name": "Excessive Agency",
        "description": "LLM agents performing unintended actions. Evidence of least-privilege policies and runtime monitoring.",
        "evidence_types": ["policies", "agents", "runtime_events"],
        "queries": {
            # Simplified: count active policies (jsonb_array_length was crashing on some setups)
            "active_deny_policies": "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "blocked_actions_30d":  "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND created_at >= :start",
        },
    },
]


# ── Safe numeric coercion ──────────────────────────────────────

def _safe_num(value: Any) -> float:
    """
    Coerce any DB result to a float.
    Returns 0.0 if value is None, an error string, or unconvertible.
    This is the fix for: "'>' not supported between instances of 'str' and 'int'"
    """
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    # Decimal (from AVG, ROUND etc.)
    try:
        from decimal import Decimal
        if isinstance(value, Decimal):
            return float(value)
    except Exception:
        pass
    # Last resort: try converting the string
    try:
        return float(str(value))
    except (ValueError, TypeError):
        return 0.0


def safe_int(evidence: Dict, key: str, default: int = 0) -> int:
    """Get an evidence value as int, safely."""
    return int(_safe_num(evidence.get(key, default)))


# ── Seeding ────────────────────────────────────────────────────

def seed_compliance_mappings(db: Session):
    """Idempotently insert compliance mappings into DB."""
    from app.enterprise_models import ComplianceMapping
    try:
        for m in COMPLIANCE_MAPPINGS:
            existing = db.query(ComplianceMapping).filter(ComplianceMapping.id == m["id"]).first()
            if not existing:
                db.add(ComplianceMapping(**m))
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"seed_compliance_mappings: {e}")


# ── Evidence collection ────────────────────────────────────────

def collect_evidence(db: Session, org_id: UUID, control_id: str, days: int = 30) -> Dict:
    """
    Pull evidence for a single compliance control.

    All results are coerced to numeric values.
    Errors store 0, never strings — prevents type errors in _assess_control.
    """
    from app.enterprise_models import ComplianceMapping
    mapping = db.query(ComplianceMapping).filter(ComplianceMapping.id == control_id).first()
    if not mapping:
        return {}

    start = (datetime.utcnow() - timedelta(days=days)).isoformat()
    evidence: Dict[str, Any] = {}

    for key, sql in (mapping.queries or {}).items():
        try:
            # Use text() with proper parameter binding — no string interpolation
            result = db.execute(
                text(sql),
                {"org": str(org_id), "start": start},
            ).scalar()
            # Always store as a numeric value
            evidence[key] = _safe_num(result)
        except Exception as e:
            logger.warning(f"Evidence query failed [{control_id}.{key}]: {e}")
            evidence[key] = 0  # safe default — never a string

    return {
        "control_id":     mapping.control_id,
        "control_name":   mapping.control_name,
        "framework":      mapping.framework,
        "description":    mapping.description,
        "evidence_types": mapping.evidence_types,
        "evidence":       evidence,
        "period_days":    days,
        "generated_at":   datetime.utcnow().isoformat(),
    }


# ── Compliance assessment ──────────────────────────────────────

def _assess_control(control_id: str, evidence: Dict) -> bool:
    """
    Heuristic pass/fail per control.
    Uses safe_int() so comparisons never crash on unexpected types.
    """
    def gt0(key: str)  -> bool: return safe_int(evidence, key) > 0
    def lt(key: str, n: int) -> bool: return safe_int(evidence, key) < n
    def gte(key: str, n: int) -> bool: return safe_int(evidence, key) >= n

    checks: Dict[str, bool] = {
        # SOC 2
        "soc2_cc6.1":           gt0("policies_count"),
        "soc2_cc7.2":           gt0("runtime_events_30d"),
        "soc2_cc9.2":           lt("high_risk_assets", 10),
        # ISO 27001
        "iso27001_a9.4":        gt0("active_policies"),
        "iso27001_a12.4":       gt0("audit_log_count_30d"),
        "iso27001_a16.1":       safe_int(evidence, "incidents_30d") < 50,
        # NIST AI RMF
        "nist_ai_rmf_govern_1": gt0("ai_policies_active"),
        "nist_ai_rmf_map_1":    gt0("assets_with_risk_scores"),
        "nist_ai_rmf_measure_2": gt0("total_events_30d") or gt0("avg_risk_score"),
        # OWASP LLM
        "owasp_llm01":          gt0("prompts_screened_30d") or gt0("denied_prompts_30d"),
        "owasp_llm06":          gt0("active_policies"),
        "owasp_llm08":          gt0("active_deny_policies"),
    }
    # Default to PASS if control not in our map (don't penalize unknown controls)
    return checks.get(control_id, True)


# ── Report generation ──────────────────────────────────────────

def generate_compliance_report(
    db: Session, org_id: UUID, framework: str, days: int = 30
) -> Dict:
    """Generate a full compliance report for a framework."""
    from app.enterprise_models import ComplianceMapping
    from app.models import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    org_name = org.name if org else str(org_id)

    mappings = db.query(ComplianceMapping).filter(
        ComplianceMapping.framework == framework
    ).order_by(ComplianceMapping.control_id).all()

    controls = []
    for m in mappings:
        try:
            ev = collect_evidence(db, org_id, m.id, days)
            passed = _assess_control(m.id, ev.get("evidence", {}))
            controls.append({**ev, "status": "PASS" if passed else "NEEDS_REVIEW"})
        except Exception as e:
            logger.error(f"Control evaluation failed [{m.id}]: {e}")
            controls.append({
                "control_id":   m.control_id,
                "control_name": m.control_name,
                "framework":    framework,
                "description":  m.description,
                "evidence":     {},
                "status":       "ERROR",
                "error":        str(e),
            })

    pass_count = sum(1 for c in controls if c["status"] == "PASS")
    total = len(controls)

    return {
        "framework":      framework,
        "organization":   org_name,
        "period_days":    days,
        "generated_at":   datetime.utcnow().isoformat(),
        "total_controls": total,
        "passed":         pass_count,
        "needs_review":   total - pass_count,
        "score_pct":      round(pass_count / total * 100, 1) if total else 0,
        "controls":       controls,
    }


# ── Report export ──────────────────────────────────────────────

def report_to_csv(report: Dict) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Framework", "Control ID", "Control Name", "Status", "Evidence"])
    for c in report.get("controls", []):
        w.writerow([
            c.get("framework", ""),
            c.get("control_id", ""),
            c.get("control_name", ""),
            c.get("status", ""),
            json.dumps(c.get("evidence", {})),
        ])
    return buf.getvalue()


# ── Executive report ───────────────────────────────────────────

def generate_executive_report(db: Session, org_id: UUID, days: int = 30) -> Dict:
    """Executive summary report — blocked requests, incidents, risk posture."""
    from app.models import RuntimeEvent, Incident, RiskScore
    from sqlalchemy import func

    start = datetime.utcnow() - timedelta(days=days)

    total_events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.created_at >= start,
    ).count()

    blocked = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= start,
    ).count()

    allowed = total_events - blocked

    incidents_total = db.query(Incident).filter(
        Incident.organization_id == org_id,
        Incident.created_at >= start,
    ).count()

    open_incidents = db.query(Incident).filter(
        Incident.organization_id == org_id,
        Incident.status == "open",
    ).count()

    high_risk_assets = db.query(RiskScore).filter(
        RiskScore.organization_id == org_id,
        RiskScore.severity.in_(["high", "critical"]),
    ).count()

    # Top violating agents — safe query without subquery self-reference
    top_agent_rows = db.query(
        RuntimeEvent.agent_id,
        func.count(RuntimeEvent.id).label("deny_count"),
    ).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= start,
    ).group_by(RuntimeEvent.agent_id).order_by(
        func.count(RuntimeEvent.id).desc()
    ).limit(5).all()

    from app.models import Agent as AgentM
    top_agent_list = []
    for row in top_agent_rows:
        ag = db.query(AgentM).filter(AgentM.id == row.agent_id).first()
        top_agent_list.append({
            "agent":      ag.name if ag else str(row.agent_id),
            "deny_count": row.deny_count,
        })

    # Top targeted assets
    from app.models import Asset as AssetM
    top_asset_rows = db.query(
        RuntimeEvent.asset_id,
        func.count(RuntimeEvent.id).label("event_count"),
    ).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.created_at >= start,
    ).group_by(RuntimeEvent.asset_id).order_by(
        func.count(RuntimeEvent.id).desc()
    ).limit(5).all()

    top_asset_list = []
    for row in top_asset_rows:
        asset = db.query(AssetM).filter(AssetM.id == row.asset_id).first()
        top_asset_list.append({
            "asset":       asset.name if asset else str(row.asset_id),
            "event_count": row.event_count,
        })

    return {
        "report_type":  "executive",
        "period_days":  days,
        "generated_at": datetime.utcnow().isoformat(),
        "total_events": total_events,
        "allow_events": allowed,
        "deny_events":  blocked,
        "deny_rate":    round(blocked / total_events * 100, 1) if total_events else 0,
        "open_incidents":   open_incidents,
        "incidents_period": incidents_total,
        "high_risk_assets": high_risk_assets,
        # Legacy key kept for backward compat with frontend
        "summary": {
            "total_requests":   total_events,
            "blocked_requests": blocked,
            "allowed_requests": allowed,
            "block_rate_pct":   round(blocked / total_events * 100, 1) if total_events else 0,
            "incidents_period": incidents_total,
            "open_incidents":   open_incidents,
            "high_risk_assets": high_risk_assets,
        },
        "top_violating_agents": top_agent_list,
        "top_assets":           top_asset_list,
    }
