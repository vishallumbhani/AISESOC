"""
backend/app/correlation.py

Shared utilities for the correlated event chain.

Every runtime decision generates ONE correlation_id that flows through:
  RuntimeEvent → Incident → AuditLog → Graph → Reports

Usage:
    from app.correlation import new_correlation_id, prompt_classify, prompt_risk_score

Architecture:
    correlation_id = CORR-{8 hex chars}  e.g. CORR-9A71F2C3
    All tables store this. Clicking any row in any module shows the full chain.
"""
import uuid
import hashlib
import re
from datetime import datetime, timezone
from typing import Optional, Dict, Any


# ── Correlation ID ─────────────────────────────────────────────

def new_correlation_id() -> str:
    """Generate a human-readable correlation ID: CORR-{8 hex}"""
    return f"CORR-{uuid.uuid4().hex[:8].upper()}"


def format_incident_id(incident_uuid) -> str:
    """INC-{first 8 hex chars of UUID} for display"""
    return f"INC-{str(incident_uuid)[:8].upper()}"


def format_runtime_id(event_uuid) -> str:
    """RT-{first 8 hex chars of UUID} for display"""
    return f"RT-{str(event_uuid)[:8].upper()}"


# ── Prompt Intelligence ────────────────────────────────────────

# Category detection patterns (ordered by priority)
PROMPT_PATTERNS = [
    ("data_exfiltration",    r"export|exfil|dump|extract|download|transfer.*data|send.*to"),
    ("credential_access",    r"password|secret|token|credential|api.?key|auth|login"),
    ("pii_access",           r"ssn|social.?security|passport|dob|date.?of.?birth|phone.?number|home.?address|personal"),
    ("financial",            r"payroll|salary|bank|payment|invoice|credit.?card|financial|revenue"),
    ("system_discovery",     r"list.*files?|show.*config|what.*servers?|network|topology|infrastructure"),
    ("privilege_escalation", r"admin|root|sudo|grant.*access|elevat|superuser|permission"),
    ("harmful_content",      r"malware|exploit|hack|bypass|override|ignore.*policy|jailbreak|prompt.?inject"),
    ("data_modification",    r"delete|drop|truncate|update.*all|modify|overwrite|wipe"),
    ("reconnaissance",       r"who.*admin|who.*owner|list.*users|find.*agents|discover"),
    ("general_query",        r".*"),  # catch-all
]

# Risk weights per category (0-100)
CATEGORY_RISK = {
    "data_exfiltration":    85,
    "credential_access":    90,
    "pii_access":           80,
    "financial":            75,
    "system_discovery":     60,
    "privilege_escalation": 88,
    "harmful_content":      95,
    "data_modification":    82,
    "reconnaissance":       55,
    "general_query":        10,
}

# Sensitive entity patterns
SENSITIVE_PATTERNS = {
    "email":   r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "phone":   r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "ssn":     r"\b\d{3}-\d{2}-\d{4}\b",
    "ip":      r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b",
    "url":     r"https?://\S+",
    "api_key": r"\b(?:sk-|secos_|Bearer\s+)[A-Za-z0-9_\-]{10,}\b",
}


def prompt_classify(prompt: Optional[str]) -> str:
    """Classify a prompt into a risk category."""
    if not prompt:
        return "general_query"
    text = prompt.lower()
    for category, pattern in PROMPT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return category
    return "general_query"


def prompt_risk_score(
    prompt: Optional[str],
    category: Optional[str] = None,
    decision: str = "allow",
) -> float:
    """
    Score a prompt 0-100.
    Base: category weight.
    Boosts: denied decision (+15), length (+0-10), sensitive entities (+5 each).
    """
    if not prompt:
        return 5.0

    cat   = category or prompt_classify(prompt)
    base  = float(CATEGORY_RISK.get(cat, 10))
    score = base

    # Denied decision boost
    if decision.lower() == "deny":
        score = min(100, score + 15)

    # Length boost (longer prompts can indicate more complex intent)
    length_bonus = min(10, len(prompt) / 50)
    score = min(100, score + length_bonus)

    # Sensitive entity boost
    for entity_type, pattern in SENSITIVE_PATTERNS.items():
        if re.search(pattern, prompt, re.IGNORECASE):
            score = min(100, score + 5)

    return round(score, 1)


def detect_sensitive_entities(prompt: Optional[str]) -> Dict[str, int]:
    """Return count of each sensitive entity type found in prompt."""
    if not prompt:
        return {}
    found = {}
    for entity_type, pattern in SENSITIVE_PATTERNS.items():
        matches = re.findall(pattern, prompt, re.IGNORECASE)
        if matches:
            found[entity_type] = len(matches)
    return found


# ── MITRE ATT&CK for AI mapping ───────────────────────────────

CATEGORY_TO_MITRE = {
    "data_exfiltration":    ("AML.T0025", "Exfiltration", "Infer Training Data"),
    "credential_access":    ("AML.T0012", "Persistence",  "Backdoor ML Model"),
    "pii_access":           ("AML.T0025", "Exfiltration", "Infer Training Data"),
    "financial":            ("AML.T0025", "Exfiltration", "Infer Training Data"),
    "system_discovery":     ("AML.T0043", "Discovery",    "Discover ML Artifacts"),
    "privilege_escalation": ("AML.T0048", "Initial Access","Phishing via ML API"),
    "harmful_content":      ("AML.T0006", "Impact",       "Poison Training Data"),
    "data_modification":    ("AML.T0029", "Impact",       "Denial of ML Service"),
    "reconnaissance":       ("AML.T0043", "Discovery",    "Discover ML Artifacts"),
    "general_query":        (None, None, None),
}


def get_mitre_mapping(category: str):
    """Return (technique_id, tactic, technique_name) for a prompt category."""
    return CATEGORY_TO_MITRE.get(category, (None, None, None))


# ── Correlated event builder ───────────────────────────────────

def build_correlated_event(
    *,
    correlation_id: str,
    org_id,
    agent_name: str,
    asset_name: str,
    connector: Optional[str],
    api_key_name: Optional[str],
    prompt: Optional[str],
    decision: str,
    policy_name: Optional[str],
    reason: Optional[str],
    incident_id: Optional[str],
    runtime_event_id: Optional[str],
    session_id: Optional[str],
    source_ip: Optional[str],
    risk_score: Optional[float],
    latency_ms: Optional[float],
) -> Dict[str, Any]:
    """
    Returns a structured dict representing one complete correlated security event.
    Used for audit logs and reporting.
    """
    prompt_cat   = prompt_classify(prompt)
    prompt_risk  = prompt_risk_score(prompt, prompt_cat, decision)
    mitre_id, mitre_tactic, mitre_tech = get_mitre_mapping(prompt_cat)

    return {
        "correlation_id":    correlation_id,
        "timestamp":         datetime.now(timezone.utc).isoformat(),
        "organization_id":   str(org_id),
        "connector":         connector,
        "api_key_name":      api_key_name,
        "agent":             agent_name,
        "asset":             asset_name,
        "session_id":        session_id,
        "source_ip":         source_ip,
        "prompt_preview":    (prompt or "")[:200],
        "prompt_category":   prompt_cat,
        "prompt_risk_score": prompt_risk,
        "decision":          decision.upper(),
        "policy_name":       policy_name,
        "reason":            reason,
        "risk_score":        risk_score,
        "latency_ms":        latency_ms,
        "incident_id":       incident_id,
        "runtime_event_id":  runtime_event_id,
        "mitre_technique":   mitre_id,
        "mitre_tactic":      mitre_tactic,
        "mitre_technique_name": mitre_tech,
        "sensitive_entities":detect_sensitive_entities(prompt),
    }
