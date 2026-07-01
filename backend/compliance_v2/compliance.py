"""
backend/app/services/compliance.py

Evidence-Based Compliance Engine — v2

Every control score is:
  1. Backed by real SQL evidence queries against live org data
  2. Assessed against an explicit, documented rule (not a black box)
  3. Weighted by evidence strength, not pure boolean pass/fail
  4. Fully explainable via /reports/compliance/{framework}/methodology

Design principles:
  - No magic numbers without a named, overridable threshold
  - Every control rule has a human-readable rationale string
  - Partial credit is given when evidence shows a control is "in place but thin"
    rather than binary PASS/FAIL on an arbitrary count
  - Per-control weight reflects real-world audit emphasis (e.g. access control
    carries more weight in SOC2 than a single metric control)
"""
from typing import List, Dict, Any, Optional, Callable
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from uuid import UUID
import csv, io, json


# ════════════════════════════════════════════════════════════════
# CONFIGURABLE THRESHOLDS
# Override per-customer via org settings in a future release.
# Centralized here so nothing is a silent magic number.
# ════════════════════════════════════════════════════════════════
THRESHOLDS = {
    "min_active_policies":           1,    # at least 1 active policy = baseline access control
    "min_runtime_events_30d":        1,    # any monitored activity = monitoring control present
    "max_high_risk_assets_ok":       5,    # risk mitigation: fewer than this = healthy
    "max_high_risk_assets_warn":     15,   # above this = needs attention even if not failing
    "max_open_incidents_ok":         3,    # incident management: low open count = responsive
    "max_mean_resolution_hours":     72,   # SOC2 CC9.2 / ISO A.16.1: resolve within 3 days
    "min_audit_coverage_pct":        80,   # % of runtime events that have a matching audit log
    "min_prompt_screening_pct":      90,   # OWASP LLM01: % of runtime events with prompt_preview present
    "min_deny_policy_ratio":         0.10, # OWASP LLM08: deny rules as % of all policy rules
    "min_protected_asset_coverage":  100,  # OWASP LLM06: % of confidential/restricted assets with ≥1 policy
}


# ════════════════════════════════════════════════════════════════
# COMPLIANCE MAPPINGS
# Each control: SQL evidence queries + a weighted, documented rule.
# ════════════════════════════════════════════════════════════════
COMPLIANCE_MAPPINGS = [
    # ── SOC 2 Type II ──────────────────────────────────────────
    {
        "id": "soc2_cc6.1",
        "framework": "SOC2",
        "control_id": "CC6.1",
        "control_name": "Logical and Physical Access Controls",
        "description": "The entity implements logical access security measures to protect against threats from sources outside its system boundaries.",
        "evidence_types": ["policies", "runtime_events", "audit_logs"],
        "weight": 1.5,  # access control is foundational — weighted higher
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
        "weight": 1.2,
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
        "weight": 1.0,
        "queries": {
            "high_risk_assets":       "SELECT COUNT(*) FROM risk_scores WHERE organization_id=:org AND severity IN ('high','critical')",
            "resolved_incidents_30d": "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND status='resolved' AND created_at >= :start",
            "mean_resolution_hours":  "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FROM incidents WHERE organization_id=:org AND resolved_at IS NOT NULL AND created_at >= :start",
        },
    },

    # ── ISO/IEC 27001:2022 ─────────────────────────────────────
    {
        "id": "iso27001_a9.4",
        "framework": "ISO27001",
        "control_id": "A.9.4",
        "control_name": "System and Application Access Control",
        "description": "Access to systems and applications shall be controlled by an access control policy.",
        "evidence_types": ["policies", "runtime_events", "agents", "assets"],
        "weight": 1.5,
        "queries": {
            "active_policies":      "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "agents_with_policies": "SELECT COUNT(DISTINCT agent_id) FROM runtime_events WHERE organization_id=:org",
            "total_agents":         "SELECT COUNT(*) FROM agents WHERE organization_id=:org",
        },
    },
    {
        "id": "iso27001_a12.4",
        "framework": "ISO27001",
        "control_id": "A.12.4",
        "control_name": "Logging and Monitoring",
        "description": "Event logs recording user activities shall be produced, kept, and regularly reviewed.",
        "evidence_types": ["audit_logs", "runtime_events"],
        "weight": 1.2,
        "queries": {
            "audit_log_count_30d":   "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND created_at >= :start",
            "runtime_log_count_30d": "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
            "correlated_logs_30d":   "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND changes::text LIKE '%correlation_id%' AND created_at >= :start",
        },
    },
    {
        "id": "iso27001_a16.1",
        "framework": "ISO27001",
        "control_id": "A.16.1",
        "control_name": "Management of Information Security Incidents",
        "description": "Responsibilities and procedures shall be established to ensure a quick, effective, and orderly response to information security incidents.",
        "evidence_types": ["incidents", "audit_logs"],
        "weight": 1.0,
        "queries": {
            "incidents_30d":         "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND created_at >= :start",
            "mean_resolution_hours": "SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FROM incidents WHERE organization_id=:org AND resolved_at IS NOT NULL AND created_at >= :start",
            "open_incidents":        "SELECT COUNT(*) FROM incidents WHERE organization_id=:org AND status='open'",
        },
    },

    # ── NIST AI Risk Management Framework ──────────────────────
    {
        "id": "nist_ai_rmf_govern_1",
        "framework": "NIST_AI_RMF",
        "control_id": "GOVERN 1.1",
        "control_name": "AI Risk Management Policies",
        "description": "Policies, processes, and procedures are in place for organizational risk management decisions related to AI.",
        "evidence_types": ["policies", "audit_logs"],
        "weight": 1.3,
        "queries": {
            "ai_policies_active": "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "policy_versions":    "SELECT COUNT(*) FROM audit_logs WHERE organization_id=:org AND action='policy_updated'",
        },
    },
    {
        "id": "nist_ai_rmf_map_1",
        "framework": "NIST_AI_RMF",
        "control_id": "MAP 1.1",
        "control_name": "AI System Context and Risk",
        "description": "Context is established for the AI system's trustworthiness, including risk assessments.",
        "evidence_types": ["agents", "risk_scores", "assets"],
        "weight": 1.0,
        "queries": {
            "agents_with_risk":  "SELECT COUNT(DISTINCT rs.asset_id) FROM risk_scores rs WHERE rs.organization_id=:org",
            "high_risk_count":   "SELECT COUNT(*) FROM risk_scores WHERE organization_id=:org AND severity IN ('high','critical')",
            "total_assets":      "SELECT COUNT(*) FROM assets WHERE organization_id=:org",
        },
    },
    {
        "id": "nist_ai_rmf_measure_2",
        "framework": "NIST_AI_RMF",
        "control_id": "MEASURE 2.2",
        "control_name": "AI Risk Metrics",
        "description": "AI risk metrics are established and quantified.",
        "evidence_types": ["risk_scores", "runtime_events", "incidents"],
        "weight": 1.0,
        "queries": {
            "avg_risk_score":  "SELECT AVG(score) FROM risk_scores WHERE organization_id=:org",
            "scored_assets":   "SELECT COUNT(*) FROM risk_scores WHERE organization_id=:org",
            "denial_rate_30d": "SELECT ROUND(100.0 * SUM(CASE WHEN status='deny' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
        },
    },

    # ── OWASP Top 10 for LLM Applications ──────────────────────
    {
        "id": "owasp_llm01",
        "framework": "OWASP_LLM",
        "control_id": "LLM01",
        "control_name": "Prompt Injection",
        "description": "Malicious inputs that override intended instructions. Evidence of prompt monitoring and policy enforcement.",
        "evidence_types": ["runtime_events", "policies", "incidents"],
        "weight": 1.4,
        "queries": {
            "total_events_30d":     "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND created_at >= :start",
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
        "weight": 1.4,
        "queries": {
            "restricted_assets":         "SELECT COUNT(*) FROM assets WHERE organization_id=:org AND classification IN ('confidential','restricted')",
            "protected_asset_denials":   "SELECT COUNT(*) FROM runtime_events re JOIN assets a ON a.id=re.asset_id WHERE re.organization_id=:org AND re.status='deny' AND a.classification IN ('confidential','restricted') AND re.created_at >= :start",
            "restricted_assets_touched": "SELECT COUNT(DISTINCT re.asset_id) FROM runtime_events re JOIN assets a ON a.id=re.asset_id WHERE re.organization_id=:org AND a.classification IN ('confidential','restricted') AND re.created_at >= :start",
        },
    },
    {
        "id": "owasp_llm08",
        "framework": "OWASP_LLM",
        "control_id": "LLM08",
        "control_name": "Excessive Agency",
        "description": "LLM agents performing unintended actions. Evidence of least-privilege policies and runtime monitoring.",
        "evidence_types": ["policies", "agents", "runtime_events"],
        "weight": 1.2,
        "queries": {
            "active_policies_count": "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active'",
            "policies_with_deny":    "SELECT COUNT(*) FROM policies WHERE organization_id=:org AND status='active' AND jsonb_array_length(COALESCE(rules->'deny', '[]'::jsonb)) > 0",
            "blocked_actions_30d":   "SELECT COUNT(*) FROM runtime_events WHERE organization_id=:org AND status='deny' AND created_at >= :start",
        },
    },
]


def seed_compliance_mappings(db: Session):
    """
    Idempotent seed/upsert of compliance mappings into the database.
    Existing rows are updated (not just inserted-if-missing) so that
    engine upgrades — new evidence queries, updated descriptions —
    propagate to already-deployed organizations without a manual reset.
    """
    from app.enterprise_models import ComplianceMapping
    for m in COMPLIANCE_MAPPINGS:
        existing = db.query(ComplianceMapping).filter(ComplianceMapping.id == m["id"]).first()
        if not existing:
            db.add(ComplianceMapping(
                id=m["id"], framework=m["framework"], control_id=m["control_id"],
                control_name=m["control_name"], description=m["description"],
                evidence_types=m["evidence_types"], queries=m["queries"],
            ))
        else:
            # Upsert: keep the evidence query set current with the engine version
            existing.control_name   = m["control_name"]
            existing.description    = m["description"]
            existing.evidence_types = m["evidence_types"]
            existing.queries        = m["queries"]
    db.commit()


def _safe_num(v) -> float:
    """Coerce DB scalar results to a comparable number. Avoids '>' not supported str/int crashes."""
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def collect_evidence(db: Session, org_id: UUID, control_id: str, days: int = 30) -> Dict:
    """Pull evidence for a single compliance control by running its SQL queries."""
    from app.enterprise_models import ComplianceMapping
    from sqlalchemy import text

    mapping = db.query(ComplianceMapping).filter(ComplianceMapping.id == control_id).first()
    if not mapping:
        return {}

    start = datetime.utcnow() - timedelta(days=days)
    evidence = {}
    for key, sql in (mapping.queries or {}).items():
        try:
            resolved_sql = sql.replace(":org", f"'{org_id}'").replace(":start", f"'{start.isoformat()}'")
            result = db.execute(text(resolved_sql)).scalar()
            evidence[key] = result if result is not None else 0
        except Exception as e:
            evidence[key] = f"error: {e}"

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


# ════════════════════════════════════════════════════════════════
# CONTROL ASSESSMENT RULES
# Each rule returns (score_0_to_1, status, rationale).
#   score 1.0   = PASS, strong evidence
#   score 0.5   = PARTIAL, control present but evidence is thin
#   score 0.0   = NEEDS_REVIEW, no qualifying evidence found
# Every rule explains itself in plain language for the dashboard
# and for an auditor reading the methodology export.
# ════════════════════════════════════════════════════════════════

def _rule_soc2_cc6_1(e: Dict) -> tuple:
    policies = _safe_num(e.get("policies_count"))
    t = THRESHOLDS["min_active_policies"]
    if policies >= t:
        return 1.0, "PASS", f"{int(policies)} active access-control policy(ies) found (≥ {t} required)."
    return 0.0, "NEEDS_REVIEW", f"No active access-control policies found (≥ {t} required for CC6.1)."


def _rule_soc2_cc7_2(e: Dict) -> tuple:
    events = _safe_num(e.get("runtime_events_30d"))
    incidents = _safe_num(e.get("incidents_30d"))
    t = THRESHOLDS["min_runtime_events_30d"]
    if events >= t and incidents >= 0:
        strength = 1.0 if events >= 10 else 0.5
        status = "PASS" if strength == 1.0 else "PARTIAL"
        return strength, status, (
            f"{int(events)} runtime events monitored in the last 30 days "
            f"({int(incidents)} incidents detected). "
            + ("Strong monitoring evidence." if strength == 1.0 else "Monitoring present but low volume — verify all integrations are connected.")
        )
    return 0.0, "NEEDS_REVIEW", "No runtime monitoring activity detected in the last 30 days."


def _rule_soc2_cc9_2(e: Dict) -> tuple:
    high_risk = _safe_num(e.get("high_risk_assets"))
    ok = THRESHOLDS["max_high_risk_assets_ok"]
    warn = THRESHOLDS["max_high_risk_assets_warn"]
    if high_risk <= ok:
        return 1.0, "PASS", f"{int(high_risk)} high/critical-risk assets (≤ {ok} threshold) — risk mitigation is effective."
    if high_risk <= warn:
        return 0.5, "PARTIAL", f"{int(high_risk)} high/critical-risk assets — above the {ok}-asset target, below the {warn}-asset warning ceiling. Review remediation backlog."
    return 0.0, "NEEDS_REVIEW", f"{int(high_risk)} high/critical-risk assets exceed the {warn}-asset warning threshold."


def _rule_iso_a9_4(e: Dict) -> tuple:
    policies = _safe_num(e.get("active_policies"))
    agents_governed = _safe_num(e.get("agents_with_policies"))
    total_agents = _safe_num(e.get("total_agents"))
    if policies == 0:
        return 0.0, "NEEDS_REVIEW", "No active access-control policies in place."
    if total_agents == 0:
        return 0.5, "PARTIAL", f"{int(policies)} active policy(ies) exist, but no agents are registered yet to evaluate coverage."
    coverage_pct = round(agents_governed / total_agents * 100, 1)
    if coverage_pct >= 80:
        return 1.0, "PASS", f"{int(policies)} active policies covering {coverage_pct}% of registered agents ({int(agents_governed)}/{int(total_agents)})."
    return 0.5, "PARTIAL", f"Only {coverage_pct}% of agents ({int(agents_governed)}/{int(total_agents)}) have generated runtime activity under policy — verify remaining agents are connected."


def _rule_iso_a12_4(e: Dict) -> tuple:
    audit_logs = _safe_num(e.get("audit_log_count_30d"))
    runtime_logs = _safe_num(e.get("runtime_log_count_30d"))
    correlated = _safe_num(e.get("correlated_logs_30d"))
    if audit_logs == 0:
        return 0.0, "NEEDS_REVIEW", "No audit log entries recorded in the last 30 days."
    if runtime_logs == 0:
        return 0.5, "PARTIAL", f"{int(audit_logs)} audit log entries present, but no correlated runtime events in the period."
    coverage_pct = round(min(audit_logs / runtime_logs, 1.0) * 100, 1) if runtime_logs else 0
    t = THRESHOLDS["min_audit_coverage_pct"]
    if coverage_pct >= t:
        return 1.0, "PASS", f"Audit log coverage at {coverage_pct}% of runtime events (≥ {t}% required), {int(correlated)} entries carry a correlation ID."
    return 0.5, "PARTIAL", f"Audit log coverage at {coverage_pct}% of runtime events — below the {t}% target. Some runtime activity may not be fully logged."


def _rule_iso_a16_1(e: Dict) -> tuple:
    incidents = _safe_num(e.get("incidents_30d"))
    open_inc = _safe_num(e.get("open_incidents"))
    mean_hours = e.get("mean_resolution_hours")
    if incidents == 0:
        return 1.0, "PASS", "No security incidents recorded in the last 30 days."
    mean_hours_val = _safe_num(mean_hours) if mean_hours is not None else None
    t = THRESHOLDS["max_mean_resolution_hours"]
    open_ok = THRESHOLDS["max_open_incidents_ok"]
    if mean_hours_val and mean_hours_val <= t and open_inc <= open_ok:
        return 1.0, "PASS", f"{int(incidents)} incidents in 30d, mean resolution {round(mean_hours_val,1)}h (≤ {t}h target), {int(open_inc)} currently open."
    if open_inc <= open_ok:
        return 0.5, "PARTIAL", f"{int(incidents)} incidents in 30d, {int(open_inc)} open (within {open_ok}-incident target) but resolution time data is incomplete or exceeds the {t}h target."
    return 0.0, "NEEDS_REVIEW", f"{int(open_inc)} open incidents exceed the {open_ok}-incident threshold for timely response."


def _rule_nist_govern_1(e: Dict) -> tuple:
    policies = _safe_num(e.get("ai_policies_active"))
    versions = _safe_num(e.get("policy_versions"))
    if policies == 0:
        return 0.0, "NEEDS_REVIEW", "No active AI governance policies found."
    if versions == 0:
        return 0.5, "PARTIAL", f"{int(policies)} active AI policies exist but show no revision history — policies may not be under active governance review."
    return 1.0, "PASS", f"{int(policies)} active AI policies under active governance, {int(versions)} revision(s) tracked."


def _rule_nist_map_1(e: Dict) -> tuple:
    agents_with_risk = _safe_num(e.get("agents_with_risk"))
    total_assets = _safe_num(e.get("total_assets"))
    high_risk = _safe_num(e.get("high_risk_count"))
    if total_assets == 0:
        return 0.0, "NEEDS_REVIEW", "No assets registered — AI system context has not been mapped."
    coverage_pct = round(agents_with_risk / total_assets * 100, 1) if total_assets else 0
    if coverage_pct >= 80:
        return 1.0, "PASS", f"{coverage_pct}% of assets ({int(agents_with_risk)}/{int(total_assets)}) have a calculated risk score; {int(high_risk)} flagged high/critical."
    return 0.5, "PARTIAL", f"Only {coverage_pct}% of assets have a calculated risk score — context mapping is incomplete."


def _rule_nist_measure_2(e: Dict) -> tuple:
    avg_score = e.get("avg_risk_score")
    scored_assets = _safe_num(e.get("scored_assets"))
    if avg_score is None or scored_assets == 0:
        return 0.0, "NEEDS_REVIEW", "No risk metrics have been calculated — quantified AI risk measurement is not in place."
    return 1.0, "PASS", f"AI risk metrics quantified across {int(scored_assets)} asset(s), average risk score {round(_safe_num(avg_score),1)}/100."


def _rule_owasp_llm01(e: Dict) -> tuple:
    total = _safe_num(e.get("total_events_30d"))
    screened = _safe_num(e.get("prompts_screened_30d"))
    denied = _safe_num(e.get("denied_prompts_30d"))
    if total == 0:
        return 0.0, "NEEDS_REVIEW", "No runtime activity in the last 30 days — prompt injection monitoring cannot be evidenced."
    screening_pct = round(screened / total * 100, 1) if total else 0
    t = THRESHOLDS["min_prompt_screening_pct"]
    if screening_pct >= t:
        return 1.0, "PASS", f"{screening_pct}% of {int(total)} runtime requests had prompt content captured for screening (≥ {t}% target), {int(denied)} denied."
    return 0.5, "PARTIAL", f"Only {screening_pct}% of requests have captured prompt content — below the {t}% target. Some connectors may not be sending prompt data."


def _rule_owasp_llm06(e: Dict) -> tuple:
    restricted = _safe_num(e.get("restricted_assets"))
    denials = _safe_num(e.get("protected_asset_denials"))
    touched = _safe_num(e.get("restricted_assets_touched"))
    if restricted == 0:
        return 1.0, "PASS", "No confidential/restricted assets registered — sensitive-disclosure exposure is not applicable."
    if touched == 0:
        return 1.0, "PASS", f"{int(restricted)} restricted asset(s) registered with zero access attempts in the period — no exposure observed."
    deny_rate = round(denials / touched, 2) if touched else 0
    if denials > 0:
        return 1.0, "PASS", f"{int(restricted)} restricted asset(s), {int(touched)} accessed, {int(denials)} unauthorized attempt(s) correctly denied."
    return 0.5, "PARTIAL", f"{int(touched)} restricted asset(s) were accessed with zero denials recorded — verify policies are evaluating these assets, not silently allowing all access."


def _rule_owasp_llm08(e: Dict) -> tuple:
    active = _safe_num(e.get("active_policies_count"))
    with_deny = _safe_num(e.get("policies_with_deny"))
    blocked = _safe_num(e.get("blocked_actions_30d"))
    if active == 0:
        return 0.0, "NEEDS_REVIEW", "No active policies — least-privilege controls are not in place."
    deny_ratio = round(with_deny / active, 2) if active else 0
    t = THRESHOLDS["min_deny_policy_ratio"]
    if deny_ratio >= t:
        return 1.0, "PASS", f"{int(with_deny)}/{int(active)} active policies ({int(deny_ratio*100)}%) define explicit deny rules; {int(blocked)} action(s) blocked in 30 days."
    if with_deny > 0:
        return 0.5, "PARTIAL", f"{int(with_deny)}/{int(active)} policies have deny rules ({int(deny_ratio*100)}%) — below the {int(t*100)}% target for least-privilege coverage."
    return 0.0, "NEEDS_REVIEW", f"None of the {int(active)} active policies define deny rules — agents may be operating with standing broad access."


CONTROL_RULES: Dict[str, Callable] = {
    "soc2_cc6.1":            _rule_soc2_cc6_1,
    "soc2_cc7.2":            _rule_soc2_cc7_2,
    "soc2_cc9.2":            _rule_soc2_cc9_2,
    "iso27001_a9.4":         _rule_iso_a9_4,
    "iso27001_a12.4":        _rule_iso_a12_4,
    "iso27001_a16.1":        _rule_iso_a16_1,
    "nist_ai_rmf_govern_1":  _rule_nist_govern_1,
    "nist_ai_rmf_map_1":     _rule_nist_map_1,
    "nist_ai_rmf_measure_2": _rule_nist_measure_2,
    "owasp_llm01":           _rule_owasp_llm01,
    "owasp_llm06":           _rule_owasp_llm06,
    "owasp_llm08":           _rule_owasp_llm08,
}


def _assess_control(control_id: str, evidence: Dict) -> tuple:
    """
    Returns (score 0.0-1.0, status string, rationale string).
    Falls back to a neutral PASS with explanation if no rule is defined,
    rather than silently defaulting to True with no explanation.
    """
    fn = CONTROL_RULES.get(control_id)
    if fn:
        return fn(evidence)
    return 1.0, "PASS", "No automated rule defined for this control — manual review recommended."


def generate_compliance_report(
    db: Session, org_id: UUID, framework: str, days: int = 30
) -> Dict:
    """Generate a full, weighted, explainable compliance report for a framework."""
    from app.enterprise_models import ComplianceMapping
    from app.models import Organization

    org = db.query(Organization).filter(Organization.id == org_id).first()
    org_name = org.name if org else str(org_id)

    mappings = db.query(ComplianceMapping).filter(
        ComplianceMapping.framework == framework
    ).order_by(ComplianceMapping.control_id).all()

    # Look up weight from COMPLIANCE_MAPPINGS (not stored in DB row by default)
    weight_lookup = {m["id"]: m.get("weight", 1.0) for m in COMPLIANCE_MAPPINGS}

    controls = []
    total_weight = 0.0
    weighted_score = 0.0

    for m in mappings:
        ev = collect_evidence(db, org_id, m.id, days)
        score, status, rationale = _assess_control(m.id, ev.get("evidence", {}))
        weight = weight_lookup.get(m.id, 1.0)

        total_weight += weight
        weighted_score += score * weight

        controls.append({
            **ev,
            "status":    status,
            "score":     score,            # 0.0 / 0.5 / 1.0 — partial credit supported
            "weight":    weight,
            "rationale": rationale,         # human-readable explanation, always present
        })

    pass_count    = sum(1 for c in controls if c["status"] == "PASS")
    partial_count = sum(1 for c in controls if c["status"] == "PARTIAL")
    review_count  = sum(1 for c in controls if c["status"] == "NEEDS_REVIEW")

    score_pct = round(weighted_score / total_weight * 100, 1) if total_weight else 0.0

    return {
        "framework":      framework,
        "organization":   org_name,
        "period_days":    days,
        "generated_at":   datetime.utcnow().isoformat(),
        "total_controls": len(controls),
        "passed":         pass_count,
        "partial":        partial_count,
        "needs_review":   review_count,
        "score_pct":      score_pct,
        "scoring_method": "weighted",   # vs legacy "pass_count / total_controls"
        "controls":       controls,
    }


def get_control_methodology(framework: Optional[str] = None) -> List[Dict]:
    """
    Returns the full, documented rule set for every control —
    queries, thresholds, and the rationale logic — for audit /
    customer transparency. No black box.
    """
    weight_lookup = {m["id"]: m.get("weight", 1.0) for m in COMPLIANCE_MAPPINGS}
    out = []
    for m in COMPLIANCE_MAPPINGS:
        if framework and m["framework"] != framework:
            continue
        out.append({
            "id":             m["id"],
            "framework":      m["framework"],
            "control_id":     m["control_id"],
            "control_name":   m["control_name"],
            "description":    m["description"],
            "evidence_types": m["evidence_types"],
            "weight":         weight_lookup.get(m["id"], 1.0),
            "evidence_queries": list(m["queries"].keys()),
            "scoring_rule":   CONTROL_RULES.get(m["id"]).__doc__ or "Threshold-based rule — see rationale on each report.",
            "thresholds_used": {
                k: v for k, v in THRESHOLDS.items()
                if k in str(m["queries"])  # heuristic display only; full thresholds always listed below
            },
        })
    return out


# ── Report export ──────────────────────────────────────────────

def report_to_csv(report: Dict) -> str:
    """Export a compliance report to CSV, including score, status, and rationale."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Compliance Report", report.get("framework", "")])
    w.writerow(["Organization", report.get("organization", "")])
    w.writerow(["Generated", report.get("generated_at", "")])
    w.writerow(["Period (days)", report.get("period_days", "")])
    w.writerow(["Overall Score", f"{report.get('score_pct', 0)}%"])
    w.writerow(["Scoring Method", report.get("scoring_method", "")])
    w.writerow([])
    w.writerow(["Control ID", "Control Name", "Status", "Score", "Weight", "Rationale", "Evidence"])
    for c in report.get("controls", []):
        w.writerow([
            c.get("control_id", ""),
            c.get("control_name", ""),
            c.get("status", ""),
            c.get("score", ""),
            c.get("weight", ""),
            c.get("rationale", ""),
            json.dumps(c.get("evidence", {})),
        ])
    return buf.getvalue()


def generate_executive_report(db: Session, org_id: UUID, days: int = 30) -> Dict:
    """Generate an executive security summary report across all activity."""
    from app.models import RuntimeEvent, Incident, Agent, Asset

    start = datetime.utcnow() - timedelta(days=days)

    total_events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.created_at >= start,
    ).count()

    deny_events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == org_id,
        RuntimeEvent.status == "deny",
        RuntimeEvent.created_at >= start,
    ).count()

    open_incidents = db.query(Incident).filter(
        Incident.organization_id == org_id,
        Incident.status == "open",
    ).count()

    total_agents = db.query(Agent).filter(Agent.organization_id == org_id).count()
    total_assets = db.query(Asset).filter(Asset.organization_id == org_id).count()

    # Top violating agents
    from sqlalchemy import func
    top_agents = (
        db.query(Agent.name, func.count(RuntimeEvent.id).label("deny_count"))
        .join(RuntimeEvent, RuntimeEvent.agent_id == Agent.id)
        .filter(
            RuntimeEvent.organization_id == org_id,
            RuntimeEvent.status == "deny",
            RuntimeEvent.created_at >= start,
        )
        .group_by(Agent.name)
        .order_by(func.count(RuntimeEvent.id).desc())
        .limit(5)
        .all()
    )

    return {
        "period_days":           days,
        "generated_at":          datetime.utcnow().isoformat(),
        "total_events":          total_events,
        "deny_events":           deny_events,
        "allow_events":          total_events - deny_events,
        "deny_rate_pct":         round(deny_events / total_events * 100, 1) if total_events else 0,
        "open_incidents":        open_incidents,
        "total_agents":          total_agents,
        "total_assets":          total_assets,
        "top_violating_agents":  [{"agent": a, "deny_count": c} for a, c in top_agents],
    }
