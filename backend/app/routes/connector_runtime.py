"""
backend/app/routes/connector_runtime.py

Machine-to-machine runtime endpoint.

Every decision generates ONE correlation_id that flows through:
  RuntimeEvent → AuditLog → Incident → Graph → Reports

Auth: X-AISECOS-API-KEY (or JWT fallback).
Names resolved to UUIDs automatically within org scope.

Changes from previous version:
  - Uses app.services.runtime_helpers (no circular imports)
  - Single DB transaction wrapping all writes
  - prompt max_length=10000 enforced
  - Graph sync warnings (not debug) on failure
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging
import time

from app.database import get_db
from app.models import Agent, Asset, RuntimeEvent, AuditLog, Organization, EndUser
from app.models import Policy as PolicyModel
from app.schemas import TokenData
from app.security import get_current_user_or_api_key
from app.policy_engine import PolicyEngine
from app.services.runtime_helpers import bump_risk_score, maybe_create_incident
from app.graph import get_graph_db
from app.correlation import (
    new_correlation_id, prompt_classify, prompt_risk_score,
    get_mitre_mapping, detect_sensitive_entities, format_incident_id
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/connectors/runtime", tags=["connector-runtime"])


# ── Schemas ────────────────────────────────────────────────────

class ConnectorDecisionRequest(BaseModel):
    connector:  str
    agent:      str
    asset:      str
    user:       Optional[str] = None
    session:    Optional[str] = None
    prompt:     Optional[str] = Field(None, max_length=10000)
    action:     str = "access"
    model:      Optional[str] = None
    tool:       Optional[str] = None


class ConnectorDecisionResponse(BaseModel):
    decision:           str
    reason:             str
    explanation:        Optional[str] = None
    policy:             Optional[str] = None
    risk_score:         Optional[float] = None
    prompt_risk_score:  Optional[float] = None
    prompt_category:    Optional[str] = None
    incident_created:   bool = False
    incident_id:        Optional[str] = None
    correlation_id:     str
    agent_id:           Optional[str] = None
    asset_id:           Optional[str] = None
    connector:          Optional[str] = None
    latency_ms:         Optional[float] = None
    mitre_technique:    Optional[str] = None
    mitre_tactic:       Optional[str] = None


# ── Main decision endpoint ─────────────────────────────────────

@router.post("/decision", response_model=ConnectorDecisionResponse)
async def connector_decision(
    body: ConnectorDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_or_api_key("runtime:write")),
):
    t_start = time.perf_counter()

    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=403, detail="Cannot determine organization")

    # ── Generate correlation ID for this entire event chain ────
    correlation_id = new_correlation_id()

    # ── Get API key metadata for enrichment ───────────────────
    api_key_name = getattr(current_user, "api_key_name", None)

    # ── 1. Resolve agent by name ───────────────────────────────
    agent = (
        db.query(Agent).filter(Agent.organization_id == org_id, Agent.name.ilike(body.agent)).first()
        or db.query(Agent).filter(Agent.organization_id == org_id, Agent.name.ilike(f"%{body.agent}%")).first()
    )
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent '{body.agent}' not found. Check /agents.")

    # ── 2. Resolve asset by name ───────────────────────────────
    asset = (
        db.query(Asset).filter(Asset.organization_id == org_id, Asset.name.ilike(body.asset)).first()
        or db.query(Asset).filter(Asset.organization_id == org_id, Asset.name.ilike(f"%{body.asset}%")).first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{body.asset}' not found. Check /assets.")

    # ── 3. Prompt intelligence ─────────────────────────────────
    prompt_cat = prompt_classify(body.prompt)
    p_risk     = prompt_risk_score(body.prompt, prompt_cat, "allow")

    # ── 4. Policy evaluation ───────────────────────────────────
    policies = db.query(PolicyModel).filter(
        PolicyModel.organization_id == org_id,
        PolicyModel.status == "active",
    ).all()

    policies_dicts = [
        {
            "id":          str(p.id),
            "name":        p.name,
            "rules":       p.rules or {},
            "status":      p.status or "active",
            "priority":    getattr(p, "priority", 0) or 0,
            "effect":      getattr(p, "effect", "deny") or "deny",
            "description": getattr(p, "description", "") or "",
        }
        for p in policies
    ]

    t_policy_start = time.perf_counter()
    decision = PolicyEngine.evaluate_policy(
        agent_id=str(agent.id),
        asset_id=str(asset.id),
        policies=policies_dicts,
        action=body.action,
        agent_name=agent.name,
        asset_name=asset.name,
    )
    latency_ms = round((time.perf_counter() - t_policy_start) * 1000, 2)

    # Update prompt risk with decision context
    p_risk = prompt_risk_score(body.prompt, prompt_cat, decision["decision"])

    matched_policy_name = decision.get("matched_policy") or decision.get("matched_policy_name")
    matched_policy_id   = decision.get("matched_policy_id")
    mitre_id, mitre_tactic, _ = get_mitre_mapping(prompt_cat)

    # ── 5. Risk score lookup ───────────────────────────────────
    from app.models import RiskScore
    rs_obj = db.query(RiskScore).filter(
        RiskScore.asset_id == asset.id,
        RiskScore.organization_id == org_id,
    ).first()
    risk_score = float(rs_obj.score) if rs_obj else None

    # ── 6. Upsert end user ─────────────────────────────────────
    end_user_db_id = None
    if body.user:
        try:
            eu = db.query(EndUser).filter(
                EndUser.organization_id == org_id,
                EndUser.external_user_id == body.user,
            ).first()
            if eu:
                eu.last_seen = datetime.now(timezone.utc)
            else:
                eu = EndUser(
                    organization_id=org_id,
                    external_user_id=body.user,
                    email=body.user if "@" in body.user else None,
                    risk_score=0,
                )
                db.add(eu)
            db.flush()
            end_user_db_id = str(eu.id)
        except Exception as e:
            logger.warning(f"End user upsert failed: {e}")

    # ── 7. Create Runtime Event (fully enriched) ───────────────
    source_ip = request.client.host if request.client else None
    event = RuntimeEvent(
        organization_id=org_id,
        agent_id=agent.id,
        asset_id=asset.id,
        event_type="connector_decision",
        action=body.action,
        status=decision["decision"].lower(),
        end_user_id=end_user_db_id,
        session_id=body.session,
        prompt_preview=(body.prompt or "")[:500],
        source_ip=source_ip,
        user_agent=f"connector:{body.connector}",
        meta_data={
            "correlation_id":    correlation_id,
            "matched_policy":    matched_policy_name,
            "matched_policy_id": str(matched_policy_id) if matched_policy_id else None,
            "reason":            decision.get("reason"),
            "connector":         body.connector,
            "api_key_name":      api_key_name,
            "prompt_category":   prompt_cat,
            "prompt_risk_score": p_risk,
            "mitre_technique":   mitre_id,
            "mitre_tactic":      mitre_tactic,
        },
    )
    # Set correlation fields if columns exist (via migration 0013/0014)
    for field, val in [
        ("correlation_id",       correlation_id),
        ("connector_name",       body.connector),
        ("connector_type",       body.connector),
        ("api_key_name",         api_key_name),
        ("model_name",           body.model),
        ("tool_name",            body.tool),
        ("prompt_category",      prompt_cat),
        ("prompt_risk_score",    p_risk),
        ("decision_reason",      decision.get("reason")),
        ("decision_explanation", decision.get("explanation")),
        ("matched_policy_name",  matched_policy_name),
        ("matched_policy_id",    str(matched_policy_id) if matched_policy_id else None),
        ("latency_ms",           latency_ms),
    ]:
        try:
            setattr(event, field, val)
        except Exception:
            pass  # column not yet migrated

    db.add(event)
    db.flush()

    # ── 8. DENY branch: incident + risk bump ───────────────────
    incident_created = False
    incident_id_str  = None
    incident_obj     = None

    if decision["decision"] == "deny":
        # Bump risk score (recalculates severity correctly)
        bump_risk_score(db, org_id, asset.id)

        incident_obj = maybe_create_incident(
            db=db,
            org_id=org_id,
            agent_id=agent.id,
            asset_id=asset.id,
            action=body.action,
            policies_applied=decision.get("policies_applied", []),
        )
        if incident_obj:
            incident_created = True
            incident_id_str  = format_incident_id(incident_obj.id)

            # Enrich incident with correlation + context
            for field, val in [
                ("correlation_id",      correlation_id),
                ("runtime_event_id",    str(event.id)),
                ("connector_name",      body.connector),
                ("prompt_preview",      (body.prompt or "")[:500]),
                ("matched_policy_name", matched_policy_name),
                ("mitre_technique",     mitre_id),
                ("mitre_tactic",        mitre_tactic),
                ("risk_score",          risk_score),
                ("evidence", {
                    "correlation_id":    correlation_id,
                    "runtime_event_id":  str(event.id),
                    "prompt":            body.prompt,
                    "prompt_category":   prompt_cat,
                    "prompt_risk_score": p_risk,
                    "decision_reason":   decision.get("reason"),
                    "explanation":       decision.get("explanation"),
                    "source_ip":         source_ip,
                    "session_id":        body.session,
                    "api_key_name":      api_key_name,
                    "connector":         body.connector,
                    "sensitive_entities": detect_sensitive_entities(body.prompt),
                }),
            ]:
                try:
                    setattr(incident_obj, field, val)
                except Exception:
                    pass

        # Update event with incident link
        try:
            event.incident_id = incident_id_str
        except Exception:
            pass

    # ── 9. Correlated Audit Log ────────────────────────────────
    audit = AuditLog(
        organization_id=org_id,
        user_id=current_user.user_id,
        action="connector_runtime_decision",
        resource_type="runtime_event",
        resource_id=str(event.id),
        changes={
            "correlation_id":    correlation_id,
            "connector":         body.connector,
            "agent":             agent.name,
            "asset":             asset.name,
            "user":              body.user,
            "action":            body.action,
            "decision":          decision["decision"],
            "policy":            matched_policy_name,
            "prompt_category":   prompt_cat,
            "prompt_risk_score": p_risk,
            "incident_id":       incident_id_str,
            "api_key_name":      api_key_name,
        },
    )
    # Set correlation fields on audit log
    for field, val in [
        ("correlation_id",  correlation_id),
        ("runtime_event_id", str(event.id)),
        ("incident_id",     incident_id_str),
        ("agent_id",        str(agent.id)),
        ("asset_id",        str(asset.id)),
        ("session_id",      body.session),
        ("connector_name",  body.connector),
        ("source_ip",       source_ip),
        ("decision",        decision["decision"].upper()),
        ("policy_name",     matched_policy_name),
    ]:
        try:
            setattr(audit, field, val)
        except Exception:
            pass

    db.add(audit)

    # ── 10. Single DB commit ───────────────────────────────────
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"connector_runtime commit failed: {e}")
        raise HTTPException(status_code=500, detail="Runtime decision could not be saved")

    # ── 11. Graph sync (non-fatal) ─────────────────────────────
    try:
        graph = get_graph_db()
        if graph and graph.connected:
            graph.create_agent_node(str(agent.id), agent.name, getattr(agent, "agent_type", "agent") or "agent")
            graph.create_asset_node(str(asset.id), asset.name, getattr(asset, "asset_type", "data") or "data")
            graph.record_access_event(
                agent_id=str(agent.id),
                asset_id=str(asset.id),
                decision=decision["decision"],
                action=body.action,
                policy_id=str(matched_policy_id) if matched_policy_id else None,
            )
            if body.user:
                graph.create_end_user_node(
                    end_user_id=body.user,
                    label=body.user,
                    email=body.user if "@" in body.user else None,
                    ip_address=source_ip,
                )
                graph.record_end_user_event(
                    end_user_id=body.user,
                    agent_id=str(agent.id),
                    session_id=body.session,
                    prompt_preview=(body.prompt or "")[:200],
                    action=body.action,
                    decision=decision["decision"],
                    asset_id=str(asset.id),
                    asset_name=asset.name,
                    policy_name=matched_policy_name or "",
                )
    except Exception as ge:
        logger.warning(f"Graph sync failed (non-fatal): {ge}")

    # ── 12. Total latency ──────────────────────────────────────
    total_ms = round((time.perf_counter() - t_start) * 1000, 2)

    return ConnectorDecisionResponse(
        decision          = decision["decision"].upper(),
        reason            = decision.get("reason", f"{agent.name} {'can' if decision['decision']=='allow' else 'cannot'} {body.action} {asset.name}"),
        explanation       = decision.get("explanation"),
        policy            = matched_policy_name,
        risk_score        = risk_score,
        prompt_risk_score = p_risk,
        prompt_category   = prompt_cat,
        incident_created  = incident_created,
        incident_id       = incident_id_str,
        correlation_id    = correlation_id,
        agent_id          = str(agent.id),
        asset_id          = str(asset.id),
        connector         = body.connector,
        latency_ms        = total_ms,
        mitre_technique   = mitre_id,
        mitre_tactic      = mitre_tactic,
    )


# ── Health check ───────────────────────────────────────────────

@router.get("/health")
async def connector_health(
    request: Request,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_or_api_key("runtime:read")),
):
    org = db.query(Organization).filter(Organization.id == current_user.organization_id).first()
    return {
        "status":            "ok",
        "authenticated":     True,
        "auth_method":       "api_key" if getattr(current_user, "role", "") == "api_key" else "jwt",
        "organization_id":   str(current_user.organization_id),
        "organization_name": org.name if org else "unknown",
        "api_key_name":      getattr(current_user, "api_key_name", None),
        "scopes":            getattr(current_user, "api_key_scopes", []),
        "timestamp":         datetime.now(timezone.utc).isoformat(),
    }
