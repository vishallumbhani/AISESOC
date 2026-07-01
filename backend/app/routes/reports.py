"""
backend/app/routes/reports.py

Executive and Compliance report generation.
Outputs: JSON (default), CSV, PDF (basic).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime
import io, json, csv

from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.enterprise_models import ComplianceMapping
from app.services.compliance import (
    generate_executive_report,
    generate_compliance_report,
    report_to_csv,
    seed_compliance_mappings,
    get_control_methodology,
    THRESHOLDS,
    COMPLIANCE_MAPPINGS,
)

router = APIRouter(prefix="/reports", tags=["reports"])

# ---- Compliance summary cache (10 min TTL) ----
import time as _time
_SUMMARY_CACHE = {}
_SUMMARY_CACHE_TTL = 600  # seconds


def _get_cached_summary(key):
    entry = _SUMMARY_CACHE.get(key)
    if entry and (_time.time() - entry["ts"]) < _SUMMARY_CACHE_TTL:
        return entry["value"]
    return None


def _set_cached_summary(key, value):
    _SUMMARY_CACHE[key] = {"value": value, "ts": _time.time()}



FRAMEWORKS = ["SOC2", "ISO27001", "NIST_AI_RMF", "OWASP_LLM"]


# ── Routes ─────────────────────────────────────────────────────

@router.get("/frameworks")
async def list_frameworks():
    """Return supported compliance frameworks."""
    return {
        "frameworks": [
            {"id": "SOC2",        "name": "SOC 2 Type II",           "controls": 3},
            {"id": "ISO27001",    "name": "ISO/IEC 27001:2022",       "controls": 3},
            {"id": "NIST_AI_RMF", "name": "NIST AI Risk Management Framework", "controls": 3},
            {"id": "OWASP_LLM",   "name": "OWASP LLM Top 10",        "controls": 3},
        ]
    }


@router.get("/executive")
async def executive_report(
    days:   int    = Query(30, ge=1, le=365),
    format: str    = Query("json", regex="^(json|csv)$"),
    db:     Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Generate executive security summary report."""
    report = generate_executive_report(db, current_user.organization_id, days)

    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Executive Security Report"])
        w.writerow(["Generated", report.get("generated_at", "")])
        w.writerow(["Period (days)", report.get("period_days", days)])
        w.writerow([])
        w.writerow(["Metric", "Value"])
        # Flat report structure — iterate scalar top-level fields only,
        # skip nested structures (top_violating_agents) which get their
        # own section below.
        for k, v in report.items():
            if k in ("top_violating_agents", "generated_at", "period_days"):
                continue
            if isinstance(v, (list, dict)):
                continue
            w.writerow([k.replace("_", " ").title(), v])
        w.writerow([])
        w.writerow(["Top Violating Agents"])
        w.writerow(["Agent", "Deny Count"])
        for ag in report.get("top_violating_agents", []):
            w.writerow([ag.get("agent", ""), ag.get("deny_count", 0)])
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=executive_report_{days}d.csv"},
        )

    return report


@router.get("/compliance/{framework}")
async def compliance_report(
    framework: str,
    days:      int    = Query(30, ge=1, le=365),
    format:    str    = Query("json", regex="^(json|csv)$"),
    db:        Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Generate a compliance report for a specific framework."""
    framework = framework.upper()
    if framework not in FRAMEWORKS:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown framework. Valid: {FRAMEWORKS}",
        )

    # Auto-seed if mappings missing
    seed_compliance_mappings(db)

    report = generate_compliance_report(db, current_user.organization_id, framework, days)

    if format == "csv":
        csv_content = report_to_csv(report)
        return StreamingResponse(
            io.BytesIO(csv_content.encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=compliance_{framework}_{days}d.csv"},
        )

    return report



@router.get("/compliance/{framework}/methodology")
async def compliance_methodology(
    framework: str,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Full transparency endpoint: returns the exact evidence queries,
    weights, and scoring rules used to calculate compliance scores
    for this framework. No black box — every number is explainable.
    """
    framework = framework.upper()
    controls = get_control_methodology(framework)
    if not controls:
        raise HTTPException(status_code=404, detail=f"No methodology found for framework '{framework}'")
    return {
        "framework": framework,
        "scoring_method": "weighted_partial_credit",
        "scoring_explanation": (
            "Each control is assessed against live evidence from your organization's "
            "runtime events, policies, incidents, and audit logs. A control can score "
            "PASS (1.0), PARTIAL (0.5), or NEEDS_REVIEW (0.0) based on documented "
            "thresholds. The framework score is a weighted average across all controls, "
            "where higher-impact controls (e.g. access control) carry more weight than "
            "single-metric controls."
        ),
        "global_thresholds": THRESHOLDS,
        "controls": controls,
    }





@router.get("/compliance/{framework}/controls")
async def list_controls(
    framework: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """List controls for a framework without running evidence queries."""
    framework = framework.upper()
    seed_compliance_mappings(db)
    controls = db.query(ComplianceMapping).filter(
        ComplianceMapping.framework == framework
    ).order_by(ComplianceMapping.control_id).all()
    return [
        {
            "id":             c.id,
            "control_id":     c.control_id,
            "control_name":   c.control_name,
            "description":    c.description,
            "evidence_types": c.evidence_types,
        }
        for c in controls
    ]


@router.get("/summary")
async def report_summary(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Quick cross-framework compliance summary for dashboard."""
    seed_compliance_mappings(db)

    cache_key = f"compliance_summary:{current_user.organization_id}"
    cached = _get_cached_summary(cache_key)
    if cached is not None:
        return cached

    summaries = []
    for fw in FRAMEWORKS:
        try:
            r = generate_compliance_report(db, current_user.organization_id, fw, 30)
            summaries.append({
                "framework":      fw,
                "total_controls": r["total_controls"],
                "passed":         r["passed"],
                "score_pct":      r["score_pct"],
            })
        except Exception as e:
            summaries.append({"framework": fw, "error": str(e)})
    result = {"frameworks": summaries, "generated_at": datetime.utcnow().isoformat()}
    _set_cached_summary(cache_key, result)
    return result
