"""
backend/app/routes/runtime.py

Fixes:
  - list_runtime_events: 'search' param now filters on agent_name,
    asset_name, session_id, prompt_preview, correlation_id.
    Previously the param was accepted but never applied.
  - list_runtime_events: returns correlation_id, prompt_category,
    mitre_technique in each item.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import UUID
from typing import Optional
from datetime import datetime, timedelta
from app.database import get_db
from app.models import Policy, RuntimeEvent, Agent, Asset, RiskScore, AuditLog, EndUser
from app.security import get_current_user, get_current_user_or_api_key
from app.schemas import TokenData, RuntimeDecisionRequest, ExplainedDecisionResponse
from app.policy_engine import PolicyEngine
from app.graph import get_graph_db
from app.services.runtime_helpers import bump_risk_score, maybe_create_incident
from app.correlation import (
    new_correlation_id, prompt_classify, prompt_risk_score,
    get_mitre_mapping, detect_sensitive_entities
)
import time
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/runtime", tags=["runtime"])


def _upsert_end_user(db, org_id, external_id, email, ip_address, ua) -> EndUser:
    eu = db.query(EndUser).filter(
        EndUser.organization_id == org_id,
        EndUser.external_user_id == external_id,
    ).first()
    if eu:
        eu.email      = email      or eu.email
        eu.ip_address = ip_address or eu.ip_address
        eu.user_agent = ua         or eu.user_agent
        eu.last_seen  = datetime.utcnow()
    else:
        eu = EndUser(
            organization_id=org_id,
            external_user_id=external_id,
            email=email, ip_address=ip_address, user_agent=ua, risk_score=0,
        )
        db.add(eu)
    db.flush()
    return eu


def _sync_to_graph(agent, asset, decision, eu_external_id, session_id):
    try:
        graph_db = get_graph_db()
        if graph_db is None or not graph_db.connected:
            return
        graph_db.record_access_event(
            agent_id=str(agent.id), agent_name=agent.name,
            asset_id=str(asset.id), asset_name=asset.name,
            action=decision.get("action", "access"),
            decision=decision["decision"],
            end_user_id=eu_external_id or "unknown",
            session_id=session_id or "unknown",
            timestamp=datetime.utcnow().isoformat(),
        )
    except Exception as e:
        logger.warning(f"Graph sync skipped: {e}")


@router.post("/decision", response_model=ExplainedDecisionResponse)
async def make_decision(
    request_data: RuntimeDecisionRequest,
    raw_request: Request,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user_or_api_key("runtime:write")),
):
    org_id = current_user.organization_id

    agent = db.query(Agent).filter(
        Agent.id == request_data.agent_id,
        Agent.organization_id == org_id,
    ).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    asset = db.query(Asset).filter(
        Asset.id == request_data.asset_id,
        Asset.organization_id == org_id,
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    policies = db.query(Policy).filter(
        Policy.organization_id == org_id,
        Policy.status == "active",
    ).all()

    correlation_id = new_correlation_id()
    t0_perf = time.perf_counter()

    prompt_cat = prompt_classify(request_data.prompt)
    p_risk     = prompt_risk_score(request_data.prompt, prompt_cat, "allow")
    mitre_id, mitre_tactic, _ = get_mitre_mapping(prompt_cat)

    t0 = datetime.utcnow()
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
    decision = PolicyEngine.evaluate_policy(
        agent_id=str(request_data.agent_id),
        asset_id=str(request_data.asset_id),
        policies=policies_dicts,
        action=request_data.action,
        agent_name=agent.name,
        asset_name=asset.name,
    )
    evaluation_time = (datetime.utcnow() - t0).total_seconds() * 1000
    p_risk = prompt_risk_score(request_data.prompt, prompt_cat, decision["decision"])
    matched_policy_name = decision.get("matched_policy_name") or decision.get("matched_policy")

    eu_external_id = request_data.end_user_external_id
    eu_email       = request_data.end_user_email
    session_id     = request_data.session_id
    source_ip      = raw_request.client.host if raw_request.client else None

    end_user_db_id = None
    if eu_external_id or eu_email:
        eu = _upsert_end_user(db, org_id, eu_external_id or eu_email,
                              eu_email, request_data.end_user_ip, request_data.user_agent)
        end_user_db_id = str(eu.id)

    rs_obj     = db.query(RiskScore).filter(
        RiskScore.asset_id == request_data.asset_id,
        RiskScore.organization_id == org_id,
    ).first()
    risk_score = float(rs_obj.score) if rs_obj else None

    event = RuntimeEvent(
        organization_id=org_id,
        agent_id=request_data.agent_id,
        asset_id=request_data.asset_id,
        event_type="policy_decision",
        action=request_data.action,
        status=decision["decision"].lower(),
        session_id=session_id,
        prompt_preview=(request_data.prompt or "")[:500],
        source_ip=source_ip,
        user_agent=request_data.user_agent or raw_request.headers.get("user-agent"),
        end_user_id=end_user_db_id,
        meta_data={
            "correlation_id":    correlation_id,
            "matched_policy":    decision.get("matched_policy"),
            "matched_policy_id": str(decision.get("matched_policy_id")) if decision.get("matched_policy_id") else None,
            "reason":            decision.get("reason"),
            "prompt_category":   prompt_cat,
            "prompt_risk_score": p_risk,
            "mitre_technique":   mitre_id,
            "mitre_tactic":      mitre_tactic,
        },
    )
    for field, val in [
        ("correlation_id", correlation_id), ("prompt_risk_score", p_risk),
        ("prompt_category", prompt_cat), ("latency_ms", evaluation_time),
        ("decision_reason", decision.get("reason")),
        ("decision_explanation", decision.get("explanation")),
        ("matched_policy_name", matched_policy_name),
        ("matched_policy_id", str(decision.get("matched_policy_id")) if decision.get("matched_policy_id") else None),
    ]:
        try:
            setattr(event, field, val)
        except Exception:
            pass

    db.add(event)
    db.flush()

    audit = AuditLog(
        organization_id=org_id,
        user_id=current_user.user_id,
        action="runtime_decision",
        resource_type="runtime_event",
        resource_id=str(event.id),
        changes={
            "correlation_id":    correlation_id,
            "agent":             agent.name,
            "asset":             asset.name,
            "action":            request_data.action,
            "decision":          decision["decision"],
            "policy":            matched_policy_name,
            "prompt_category":   prompt_cat,
            "prompt_risk_score": p_risk,
        },
    )
    for field, val in [
        ("correlation_id", correlation_id), ("runtime_event_id", str(event.id)),
        ("agent_id", str(request_data.agent_id)), ("asset_id", str(request_data.asset_id)),
        ("session_id", session_id), ("source_ip", source_ip),
        ("decision", decision["decision"].upper()), ("policy_name", matched_policy_name),
    ]:
        try:
            setattr(audit, field, val)
        except Exception:
            pass
    db.add(audit)

    incident_created = False
    if decision["decision"] == "deny":
        bump_risk_score(db, org_id, request_data.asset_id)
        incident = maybe_create_incident(
            db=db, org_id=org_id,
            agent_id=request_data.agent_id, asset_id=request_data.asset_id,
            action=request_data.action, policies_applied=decision.get("policies_applied", []),
        )
        if incident:
            incident_created = True

    _sync_to_graph(agent, asset, decision, eu_external_id, session_id)
    db.commit()

    if rs_obj:
        db.refresh(rs_obj)
        risk_score = float(rs_obj.score)

    return ExplainedDecisionResponse(
        decision=decision["decision"],
        reason=decision["reason"],
        risk_score=risk_score,
        policies_applied=decision["policies_applied"],
        agent_name=agent.name,
        asset_name=asset.name,
        action=request_data.action,
        matched_policy_name=matched_policy_name,
        evaluation_time=evaluation_time,
        incident_created=incident_created,
        end_user_id=end_user_db_id,
        matched_policy=decision.get("matched_policy"),
        matched_policy_id=decision.get("matched_policy_id"),
        matched_rule=decision.get("matched_rule"),
        rule_type=decision.get("rule_type"),
        explanation=decision.get("explanation"),
        trace=decision.get("trace", []),
    )


@router.get("/events")
async def list_runtime_events(
    agent_id:   Optional[str] = None,
    asset_id:   Optional[str] = None,
    decision:   Optional[str] = None,
    end_user:   Optional[str] = None,
    session_id: Optional[str] = None,
    date_from:  Optional[str] = None,
    date_to:    Optional[str] = None,
    search:     Optional[str] = None,  # ← now actually used
    limit:  int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    q = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id
    )
    if agent_id:
        q = q.filter(RuntimeEvent.agent_id == agent_id)
    if asset_id:
        q = q.filter(RuntimeEvent.asset_id == asset_id)
    if decision:
        q = q.filter(RuntimeEvent.status == decision.lower())
    if session_id:
        q = q.filter(RuntimeEvent.session_id == session_id)
    if date_from:
        q = q.filter(RuntimeEvent.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(RuntimeEvent.created_at <= datetime.fromisoformat(date_to))

    # ── Search: filters on agent name, asset name, session, prompt, correlation ──
    # We collect event IDs whose agent/asset name matches, then apply OR filter.
    if search:
        s = search.strip().lower()

        # Find matching agent IDs
        matching_agent_ids = [
            str(a.id) for a in db.query(Agent).filter(
                Agent.organization_id == current_user.organization_id,
                Agent.name.ilike(f"%{s}%"),
            ).all()
        ]
        # Find matching asset IDs
        matching_asset_ids = [
            str(a.id) for a in db.query(Asset).filter(
                Asset.organization_id == current_user.organization_id,
                Asset.name.ilike(f"%{s}%"),
            ).all()
        ]

        # Build OR conditions
        conditions = []
        if matching_agent_ids:
            from sqlalchemy import cast
            from sqlalchemy.dialects.postgresql import UUID as PGUUID
            conditions.append(RuntimeEvent.agent_id.in_(matching_agent_ids))
        if matching_asset_ids:
            conditions.append(RuntimeEvent.asset_id.in_(matching_asset_ids))
        # Also search on fields stored directly on the event row
        conditions.append(RuntimeEvent.session_id.ilike(f"%{s}%"))
        conditions.append(RuntimeEvent.prompt_preview.ilike(f"%{s}%"))
        conditions.append(RuntimeEvent.source_ip.ilike(f"%{s}%"))
        # Correlation ID (if column exists)
        try:
            conditions.append(RuntimeEvent.correlation_id.ilike(f"%{s}%"))
        except Exception:
            pass

        q = q.filter(or_(*conditions))

    total  = q.count()
    events = q.order_by(RuntimeEvent.created_at.desc()).offset(offset).limit(limit).all()

    agent_ids = {str(e.agent_id)    for e in events if e.agent_id}
    asset_ids = {str(e.asset_id)    for e in events if e.asset_id}
    eu_ids    = {str(e.end_user_id) for e in events if e.end_user_id}

    agent_map = {str(a.id): a.name for a in db.query(Agent).filter(Agent.id.in_(agent_ids)).all()} if agent_ids else {}
    asset_map = {str(a.id): a.name for a in db.query(Asset).filter(Asset.id.in_(asset_ids)).all()} if asset_ids else {}
    eu_map    = {str(u.id): (u.email or u.external_user_id) for u in db.query(EndUser).filter(EndUser.id.in_(eu_ids)).all()} if eu_ids else {}

    return {
        "total": total,
        "items": [
            {
                "id":              str(e.id),
                "agent_id":        str(e.agent_id)    if e.agent_id    else None,
                "asset_id":        str(e.asset_id)    if e.asset_id    else None,
                "end_user_id":     str(e.end_user_id) if e.end_user_id else None,
                "agent_name":      agent_map.get(str(e.agent_id))   if e.agent_id    else None,
                "asset_name":      asset_map.get(str(e.asset_id))   if e.asset_id    else None,
                "end_user_email":  eu_map.get(str(e.end_user_id))   if e.end_user_id else None,
                "event_type":      e.event_type,
                "action":          e.action,
                "status":          e.status,
                "session_id":      e.session_id,
                "prompt_preview":  e.prompt_preview,
                "source_ip":       e.source_ip,
                "user_agent":      e.user_agent,
                "created_at":      e.created_at.isoformat(),
                "correlation_id":  getattr(e, "correlation_id", None) or (e.meta_data or {}).get("correlation_id"),
                "matched_policy":  (e.meta_data or {}).get("matched_policy"),
                "reason":          (e.meta_data or {}).get("reason"),
                "prompt_category": getattr(e, "prompt_category", None) or (e.meta_data or {}).get("prompt_category"),
                "mitre_technique": (e.meta_data or {}).get("mitre_technique"),
            }
            for e in events
        ],
    }


@router.get("/stats/summary")
async def runtime_summary(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    org_id = current_user.organization_id
    window = datetime.utcnow() - timedelta(hours=24)

    total   = db.query(RuntimeEvent).filter(RuntimeEvent.organization_id == org_id).count()
    allowed = db.query(RuntimeEvent).filter(RuntimeEvent.organization_id == org_id, RuntimeEvent.status == "allow").count()
    denied  = db.query(RuntimeEvent).filter(RuntimeEvent.organization_id == org_id, RuntimeEvent.status == "deny").count()
    today   = db.query(RuntimeEvent).filter(RuntimeEvent.organization_id == org_id, RuntimeEvent.created_at >= window).count()

    return {
        "total_events":    total,
        "allowed":         allowed,
        "denied":          denied,
        "events_24h":      today,
        "denial_rate_pct": round(denied / total * 100, 1) if total else 0,
    }
