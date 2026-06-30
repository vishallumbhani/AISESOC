from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Any, Dict
from uuid import UUID
from pydantic import BaseModel
from app.database import get_db
from app.models import Policy, AuditLog
from app.schemas import Policy as PolicySchema, PolicyCreate
from app.security import get_current_user
from app.schemas import TokenData
from app.policy_engine import PolicyEngine

router = APIRouter(prefix="/policies", tags=["policies"])


# ── Schemas ───────────────────────────────────────────────────

class PolicyUpdate(BaseModel):
    name:        Optional[str]            = None
    description: Optional[str]            = None
    policy_type: Optional[str]            = None
    rules:       Optional[Dict[str, Any]] = None
    status:      Optional[str]            = None
    priority:    Optional[int]            = None


class SimulateRequest(BaseModel):
    agent_id:   str
    asset_id:   str
    action:     str = "access"
    test_rules: Optional[Dict[str, Any]] = None   # bypass stored policies


class SimulateTraceEntry(BaseModel):
    policy:  str
    effect:  Optional[str] = None
    matched: bool
    rule:    Optional[str] = None


class SimulateResponse(BaseModel):
    decision:          str
    reason:            str
    matched_policy:    Optional[str] = None
    matched_policy_id: Optional[str] = None
    matched_rule:      Optional[str] = None
    rule_type:         Optional[str] = None
    explanation:       str
    trace:             List[SimulateTraceEntry] = []
    policies_applied:  List[str] = []
    action:            str


class PolicyVersionSnapshot(BaseModel):
    version:        int
    name:           str
    description:    Optional[str]            = None
    policy_type:    Optional[str]            = None
    rules:          Dict[str, Any]
    status:         Optional[str]            = None
    priority:       Optional[int]            = None
    saved_at:       str
    change_summary: Optional[str]            = None


# ── Helpers ───────────────────────────────────────────────────

def _log_audit(db, user_id, org_id, action, resource_id, changes):
    db.add(AuditLog(
        organization_id=org_id, user_id=user_id,
        action=action, resource_type="policy",
        resource_id=str(resource_id), changes=changes,
    ))


# ── CRUD ──────────────────────────────────────────────────────

@router.get("", response_model=List[PolicySchema])
async def list_policies(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    return db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id
    ).order_by(Policy.priority.asc()).all()


@router.post("", response_model=PolicySchema, status_code=status.HTTP_201_CREATED)
async def create_policy(
    policy: PolicyCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    if not isinstance(policy.rules, dict):
        raise HTTPException(status_code=422, detail="Rules must be a JSON object")
    new_policy = Policy(
        organization_id=current_user.organization_id,
        name=policy.name, description=policy.description,
        policy_type=policy.policy_type, rules=policy.rules,
        status=policy.status, priority=policy.priority,
        created_by=current_user.user_id,
    )
    db.add(new_policy)
    db.flush()
    _log_audit(db, current_user.user_id, current_user.organization_id,
               "policy_created", str(new_policy.id),
               {"name": new_policy.name, "policy_type": new_policy.policy_type,
                "rules": new_policy.rules, "status": new_policy.status,
                "priority": new_policy.priority})
    db.commit()
    db.refresh(new_policy)
    return new_policy


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_policy(
    body: SimulateRequest,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Dry-run a policy decision. Writes nothing — no events, no audit logs,
    no graph updates, no incidents.
    """
    from app.models import Agent, Asset
    agent = db.query(Agent).filter(Agent.id == body.agent_id).first()
    asset = db.query(Asset).filter(Asset.id == body.asset_id).first()
    agent_name = agent.name if agent else body.agent_id[:8]
    asset_name = asset.name if asset else body.asset_id[:8]

    if body.test_rules is not None:
        policies = [{
            "id": "preview", "name": "Preview Policy",
            "status": "active", "rules": body.test_rules, "description": "Ad-hoc preview",
        }]
    else:
        db_policies = db.query(Policy).filter(
            Policy.organization_id == current_user.organization_id,
            Policy.status == "active",
        ).order_by(Policy.priority.asc()).all()
        policies = [
            {"id": str(p.id), "name": p.name, "status": p.status,
             "rules": p.rules, "description": p.description or ""}
            for p in db_policies
        ]

    result = PolicyEngine.simulate(
        agent_id=body.agent_id, asset_id=body.asset_id,
        action=body.action, policies=policies,
        agent_name=agent_name, asset_name=asset_name,
    )

    trace = [
        SimulateTraceEntry(
            policy=t["policy"], effect=t.get("effect"),
            matched=t["matched"], rule=t.get("rule"),
        )
        for t in result.get("trace", [])
    ]

    return SimulateResponse(
        decision=result["decision"], reason=result["reason"],
        matched_policy=result.get("matched_policy"),
        matched_policy_id=result.get("matched_policy_id"),
        matched_rule=result.get("matched_rule"),
        rule_type=result.get("rule_type"),
        explanation=result.get("explanation", ""),
        trace=trace,
        policies_applied=result.get("policies_applied", []),
        action=result["action"],
    )


@router.get("/{policy_id}", response_model=PolicySchema)
async def get_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.patch("/{policy_id}", response_model=PolicySchema)
async def update_policy(
    policy_id: UUID,
    policy_update: PolicyUpdate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    update_data = policy_update.dict(exclude_unset=True)
    if "rules" in update_data and not isinstance(update_data["rules"], dict):
        raise HTTPException(status_code=422, detail="Rules must be a JSON object")
    for field, value in update_data.items():
        setattr(policy, field, value)
    _log_audit(db, current_user.user_id, current_user.organization_id,
               "policy_updated", str(policy_id),
               {"name": policy.name, "description": policy.description,
                "policy_type": policy.policy_type, "rules": policy.rules,
                "status": policy.status, "priority": policy.priority,
                "changed_fields": list(update_data.keys())})
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/{policy_id}", status_code=status.HTTP_200_OK)
async def delete_policy(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    _log_audit(db, current_user.user_id, current_user.organization_id,
               "policy_deleted", str(policy_id), {"name": policy.name})
    db.delete(policy)
    db.commit()
    return {"message": "Policy deleted successfully"}


@router.get("/{policy_id}/versions", response_model=List[PolicyVersionSnapshot])
async def get_policy_versions(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.resource_type == "policy",
                AuditLog.resource_id == str(policy_id),
                AuditLog.organization_id == current_user.organization_id)
        .order_by(AuditLog.created_at.asc())
        .all()
    )

    current_state = {
        "name": policy.name, "description": policy.description,
        "policy_type": policy.policy_type, "rules": policy.rules,
        "status": policy.status, "priority": policy.priority,
    }
    versions = []
    version_num = 0

    for log in logs:
        changes = log.changes or {}
        if log.action in ("policy_created", "policy_updated"):
            version_num += 1
            snap = {k: changes.get(k, current_state[k]) for k in current_state}
            summary = ("Initial version" if log.action == "policy_created"
                       else f"Updated: {', '.join(changes.get('changed_fields', []))}")
            versions.append({"version": version_num, "saved_at": log.created_at.isoformat(),
                              "change_summary": summary, **snap})
            current_state.update(snap)

    if not versions:
        versions.append({
            "version": 1, "saved_at": policy.created_at.isoformat(),
            "change_summary": "Current version (no audit history)",
            **current_state,
        })

    versions.sort(key=lambda v: v["version"], reverse=True)
    return versions


# ── Policy Authoring Framework ─────────────────────────────────

@router.post("/validate")
async def validate_policy(
    body: dict,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """
    Validate a policy before saving.
    Returns: errors[], warnings[], duplicates[], conflicts[], impact{}
    """
    from app.models import Agent, Asset, RuntimeEvent, Incident
    from app.policy_engine import PolicyEngine

    errors   = []
    warnings = []
    duplicates = []
    conflicts  = []

    name      = body.get("name", "").strip()
    rules     = body.get("rules", {})
    priority  = body.get("priority", 100)
    edit_id   = body.get("edit_id")  # set when editing existing policy

    # ── Required fields ────────────────────────────────────────
    if not name:
        errors.append("Policy name is required.")

    if not isinstance(rules, dict):
        errors.append("Rules must be a JSON object.")
        return {"errors": errors, "warnings": warnings, "duplicates": duplicates,
                "conflicts": conflicts, "impact": None}

    deny_rules  = rules.get("deny", [])
    allow_rules = rules.get("allow", [])
    all_rules   = deny_rules + allow_rules

    if not all_rules:
        errors.append("At least one allow or deny rule is required.")

    # ── Validate each rule ─────────────────────────────────────
    for i, rule in enumerate(all_rules):
        if not isinstance(rule, dict):
            continue
        effect  = "deny" if rule in deny_rules else "allow"
        agent_id = str(rule.get("agent_id", ""))
        asset_id = str(rule.get("asset_id", ""))
        actions  = rule.get("actions", [])

        if agent_id and agent_id != "*":
            exists = db.query(Agent).filter(
                Agent.id == agent_id,
                Agent.organization_id == current_user.organization_id,
            ).first()
            if not exists:
                errors.append(f"Rule {i+1} ({effect}): Agent '{agent_id[:8]}…' not found.")

        if asset_id and asset_id != "*":
            exists = db.query(Asset).filter(
                Asset.id == asset_id,
                Asset.organization_id == current_user.organization_id,
            ).first()
            if not exists:
                errors.append(f"Rule {i+1} ({effect}): Asset '{asset_id[:8]}…' not found.")

        if not actions:
            errors.append(f"Rule {i+1} ({effect}): Select at least one action.")

    # ── Duplicate & conflict detection ─────────────────────────
    existing_policies = db.query(Policy).filter(
        Policy.organization_id == current_user.organization_id,
        Policy.status == "active",
    ).all()
    if edit_id:
        existing_policies = [p for p in existing_policies if str(p.id) != edit_id]

    def _rule_sig(rule, effect):
        return (
            str(rule.get("agent_id", "*")),
            str(rule.get("asset_id", "*")),
            frozenset(rule.get("actions", ["*"])),
            effect,
        )

    new_sigs = {}
    for rule in deny_rules:
        new_sigs[_rule_sig(rule, "deny")] = rule
    for rule in allow_rules:
        new_sigs[_rule_sig(rule, "allow")] = rule

    for ep in existing_policies:
        er = ep.rules or {}
        for effect, rule_list in [("deny", er.get("deny",[])), ("allow", er.get("allow",[]))]:
            for rule in rule_list:
                if not isinstance(rule, dict):
                    continue
                sig = _rule_sig(rule, effect)
                if sig in new_sigs:
                    duplicates.append({
                        "existing_policy": ep.name,
                        "existing_policy_id": str(ep.id),
                        "effect": effect,
                        "agent_id": rule.get("agent_id",""),
                        "asset_id": rule.get("asset_id",""),
                        "actions": rule.get("actions",[]),
                    })

                # Conflict: same agent+asset+actions but opposite effect
                opp_sig = (sig[0], sig[1], sig[2], "allow" if effect == "deny" else "deny")
                if opp_sig in new_sigs:
                    conflicts.append({
                        "existing_policy":    ep.name,
                        "existing_effect":    effect,
                        "new_effect":         opp_sig[3],
                        "agent_id":           rule.get("agent_id",""),
                        "asset_id":           rule.get("asset_id",""),
                        "result":             "DENY always wins regardless of priority.",
                    })

    # ── Priority warning ───────────────────────────────────────
    has_deny  = bool(deny_rules)
    has_allow = bool(allow_rules)
    if has_deny and has_allow:
        warnings.append(
            "This policy has both DENY and ALLOW rules. "
            "DENY rules are always evaluated first — ALLOW rules for the same "
            "agent+asset combination will never trigger."
        )

    # Check existing policies for priority clash
    for ep in existing_policies:
        er = ep.rules or {}
        ep_has_deny  = bool(er.get("deny", []))
        ep_has_allow = bool(er.get("allow", []))
        if ep_has_deny and has_allow and ep.priority < priority:
            warnings.append(
                f"Policy '{ep.name}' (priority {ep.priority}) has DENY rules and "
                f"runs before this policy (priority {priority}). "
                "Its DENY rules will override your ALLOW rules."
            )
            break

    # ── Impact analysis ────────────────────────────────────────
    impact = None
    affected_agent_ids = set()
    affected_asset_ids = set()

    all_agents = db.query(Agent).filter(
        Agent.organization_id == current_user.organization_id
    ).all()
    all_assets = db.query(Asset).filter(
        Agent.organization_id == current_user.organization_id
    ).all()

    for rule in all_rules:
        if not isinstance(rule, dict):
            continue
        ra = str(rule.get("agent_id",""))
        rs = str(rule.get("asset_id",""))
        if ra == "*":
            affected_agent_ids.update(str(a.id) for a in all_agents)
        elif ra:
            affected_agent_ids.add(ra)
        if rs == "*":
            affected_asset_ids.update(str(a.id) for a in all_assets)
        elif rs:
            affected_asset_ids.add(rs)

    historical_matches = 0
    potential_denials  = 0
    for aid in affected_agent_ids:
        for asid in affected_asset_ids:
            cnt = db.query(RuntimeEvent).filter(
                RuntimeEvent.organization_id == current_user.organization_id,
                RuntimeEvent.agent_id == aid,
                RuntimeEvent.asset_id == asid,
            ).count()
            historical_matches += cnt
            if has_deny:
                potential_denials += cnt

    related_incidents = db.query(Incident).filter(
        Incident.organization_id == current_user.organization_id,
        Incident.agent_id.in_(list(affected_agent_ids)) if affected_agent_ids else False,
    ).count() if affected_agent_ids else 0

    ag_names = [a.name for a in all_agents if str(a.id) in affected_agent_ids]
    as_names = [a.name for a in db.query(Asset).filter(
        Asset.organization_id == current_user.organization_id
    ).all() if str(a.id) in affected_asset_ids]

    impact = {
        "affected_agents":       len(affected_agent_ids),
        "affected_assets":       len(affected_asset_ids),
        "historical_matches":    historical_matches,
        "potential_denials":     potential_denials if has_deny else 0,
        "related_incidents":     related_incidents,
        "agent_names":           ag_names[:5],
        "asset_names":           as_names[:5],
    }

    return {
        "errors":     errors,
        "warnings":   warnings,
        "duplicates": duplicates,
        "conflicts":  conflicts,
        "impact":     impact,
    }


@router.get("/templates")
async def get_policy_templates(
    current_user: TokenData = Depends(get_current_user),
):
    """Return pre-built policy templates."""
    return [
        {
            "id":   "deny_all",
            "name": "Deny Asset Access",
            "description": "Block an agent from all access to an asset.",
            "icon": "🚫",
            "rules": {"deny": [{"agent_id":"","asset_id":"","actions":["access","read","write","delete","admin"]}], "allow":[]},
        },
        {
            "id":   "allow_read",
            "name": "Allow Read Only",
            "description": "Allow an agent to read an asset but not modify it.",
            "icon": "👁",
            "rules": {"deny": [{"agent_id":"","asset_id":"","actions":["write","delete","admin"]}], "allow":[{"agent_id":"","asset_id":"","actions":["access","read"]}]},
        },
        {
            "id":   "finance_protection",
            "name": "Finance Data Protection",
            "description": "Deny all agents access to financial data assets.",
            "icon": "💰",
            "rules": {"deny": [{"agent_id":"*","asset_id":"","actions":["access","read","write","delete","admin"]}], "allow":[]},
        },
        {
            "id":   "pii_protection",
            "name": "PII Protection",
            "description": "Block write/delete on sensitive PII assets.",
            "icon": "🔒",
            "rules": {"deny": [{"agent_id":"*","asset_id":"","actions":["write","delete","admin"]}], "allow":[]},
        },
        {
            "id":   "prod_access_control",
            "name": "Production Access Control",
            "description": "Allow only read access to production assets.",
            "icon": "🏭",
            "rules": {"deny": [{"agent_id":"","asset_id":"","actions":["write","delete","admin"]}], "allow":[{"agent_id":"","asset_id":"","actions":["access","read"]}]},
        },
    ]


@router.get("/{policy_id}/delete-safety")
async def get_policy_delete_safety(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return runtime impact before deletion so user can confirm."""
    from app.models import RuntimeEvent, Incident

    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    policy_id_str = str(policy_id)

    all_events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
    ).all()

    runtime_matches = sum(
        1 for e in all_events
        if policy_id_str in (e.meta_data or {}).get("policies_applied", [])
        or (e.meta_data or {}).get("matched_policy") == policy.name
    )

    all_incidents = db.query(Incident).filter(
        Incident.organization_id == current_user.organization_id,
    ).all()
    incidents = sum(
        1 for i in all_incidents
        if policy_id_str in (i.resolution_details or {}).get("policies_applied", [])
    )

    return {
        "policy_id":       str(policy_id),
        "policy_name":     policy.name,
        "runtime_matches": runtime_matches,
        "incidents":       incidents,
        "safe_to_delete":  runtime_matches == 0 and incidents == 0,
    }


@router.get("/{policy_id}/runtime-matches")
async def get_policy_runtime_matches(
    policy_id: UUID,
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    from app.models import RuntimeEvent, Agent as AgentM, Asset as AssetM, EndUser, Incident

    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    policy_id_str = str(policy_id)
    all_events = db.query(RuntimeEvent).filter(
        RuntimeEvent.organization_id == current_user.organization_id,
    ).order_by(RuntimeEvent.created_at.desc()).all()

    matched = [
        e for e in all_events
        if policy_id_str in (e.meta_data or {}).get("policies_applied", [])
        or (e.meta_data or {}).get("matched_policy") == policy.name
    ]

    times_matched  = len(matched)
    times_denied   = sum(1 for e in matched if e.status == "deny")
    times_allowed  = times_matched - times_denied

    incidents = db.query(Incident).filter(
        Incident.organization_id == current_user.organization_id,
    ).all()
    incidents_generated = sum(
        1 for i in incidents
        if policy_id_str in (i.resolution_details or {}).get("policies_applied", [])
    )

    page   = matched[:limit]
    ag_ids = list({str(e.agent_id) for e in page if e.agent_id})
    as_ids = list({str(e.asset_id) for e in page if e.asset_id})
    eu_ids = list({str(e.end_user_id) for e in page if e.end_user_id})

    ag_map = {str(a.id): a.name for a in db.query(AgentM).filter(AgentM.id.in_(ag_ids)).all()}
    as_map = {str(a.id): a.name for a in db.query(AssetM).filter(AssetM.id.in_(as_ids)).all()}
    eu_map = {str(eu.id): eu.email or eu.external_user_id
              for eu in db.query(EndUser).filter(EndUser.id.in_(eu_ids)).all()}

    return {
        "policy_id": str(policy_id), "policy_name": policy.name,
        "times_matched": times_matched, "times_denied": times_denied,
        "times_allowed": times_allowed, "incidents_generated": incidents_generated,
        "last_triggered": matched[0].created_at.isoformat() if matched else None,
        "matches": [
            {
                "id": str(e.id), "ts": e.created_at.isoformat(),
                "agent":    ag_map.get(str(e.agent_id), "Unknown") if e.agent_id else "—",
                "asset":    as_map.get(str(e.asset_id), "Unknown") if e.asset_id else "—",
                "end_user": eu_map.get(str(e.end_user_id), "") if e.end_user_id else "",
                "prompt":   e.prompt_preview or "", "decision": e.status,
                "session_id": e.session_id or "", "action": e.action,
            }
            for e in page
        ],
    }


@router.get("/{policy_id}/impact-analysis")
async def get_policy_impact_analysis(
    policy_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    from app.models import Agent as AgentM, Asset as AssetM, RuntimeEvent

    policy = db.query(Policy).filter(
        Policy.id == policy_id,
        Policy.organization_id == current_user.organization_id,
    ).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    rules = policy.rules or {}
    affected_agents: set = set()
    affected_assets: set = set()

    all_agents = db.query(AgentM).filter(AgentM.organization_id == current_user.organization_id).all()
    all_assets = db.query(AssetM).filter(AssetM.organization_id == current_user.organization_id).all()

    for effect in ("deny", "allow"):
        for rule in rules.get(effect, []):
            if not isinstance(rule, dict): continue
            ra = str(rule.get("agent_id", ""))
            rs = str(rule.get("asset_id", ""))
            if ra == "*": affected_agents.update(str(a.id) for a in all_agents)
            elif ra: affected_agents.add(ra)
            if rs == "*": affected_assets.update(str(a.id) for a in all_assets)
            elif rs: affected_assets.add(rs)

    historical_matches = sum(
        db.query(RuntimeEvent).filter(
            RuntimeEvent.organization_id == current_user.organization_id,
            RuntimeEvent.agent_id == aid, RuntimeEvent.asset_id == asid,
        ).count()
        for aid in affected_agents for asid in affected_assets
    )

    return {
        "policy_id": str(policy_id), "policy_name": policy.name,
        "policy_status": policy.status,
        "affected_agents": len(affected_agents), "affected_assets": len(affected_assets),
        "historical_matches": historical_matches,
        "agent_names": [a.name for a in all_agents if str(a.id) in affected_agents][:10],
        "asset_names": [a.name for a in all_assets if str(a.id) in affected_assets][:10],
    }
