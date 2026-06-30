"""
backend/app/routes/platform.py

Platform Admin API — Level 1 (AI-SecOS staff only).
Prefix: /platform  (registered as /api/v1/platform/...)
ALL endpoints check is_platform=True in JWT.
Customer org users can never reach these endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from pydantic import BaseModel, EmailStr
from uuid import UUID
from datetime import datetime, timedelta
import uuid

from app.database import get_db
from app.security import get_current_user, get_password_hash
from app.schemas import TokenData
from app.models import Organization, User, Agent, Asset, Policy, RuntimeEvent, Incident
from sqlalchemy import text

router = APIRouter(prefix="/platform", tags=["platform"])


# ── Platform-admin guard ───────────────────────────────────────

async def require_platform(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Rejects any token without is_platform=True."""
    if getattr(current_user, "is_platform", False):
        return current_user
    # Fallback: check DB flag on user row
    try:
        user = db.query(User).filter(User.id == current_user.user_id).first()
        if user and getattr(user, "is_platform_admin", False):
            return current_user
    except Exception:
        pass
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Platform admin access required.",
    )


def _plog(db, admin_id, org_id, action, changes: dict):
    """Write to platform_audit_logs (separate from org audit_logs)."""
    try:
        import json
        db.execute(
            text("""INSERT INTO platform_audit_logs
               (id, platform_admin_id, organization_id, action, changes)
               VALUES (gen_random_uuid(), :a, :o, :act, :ch::jsonb)"""),
            {
                "a":   str(admin_id) if admin_id else None,
                "o":   str(org_id)   if org_id   else None,
                "act": action,
                "ch":  json.dumps(changes),
            },
        )
    except Exception:
        pass  # Non-fatal — don't crash the main action


# ── Schemas ────────────────────────────────────────────────────

class OrgCreate(BaseModel):
    name:           str
    description:    Optional[str] = None
    plan:           str = "free"
    billing_email:  Optional[EmailStr] = None
    contact_name:   Optional[str] = None
    contact_email:  Optional[EmailStr] = None
    max_users:      int = 10
    max_agents:     int = 50
    max_assets:     int = 100
    max_policies:   int = 50
    admin_username: Optional[str] = None
    admin_email:    Optional[str] = None
    admin_password: Optional[str] = None


class OrgUpdate(BaseModel):
    name:          Optional[str] = None
    description:   Optional[str] = None
    plan:          Optional[str] = None
    billing_email: Optional[str] = None
    max_users:     Optional[int] = None
    max_agents:    Optional[int] = None
    max_assets:    Optional[int] = None
    max_policies:  Optional[int] = None
    feature_flags: Optional[dict] = None


class SuspendRequest(BaseModel):
    reason: str


class ImpersonateRequest(BaseModel):
    organization_id: str
    reason:          str


class PlatformAdminCreate(BaseModel):
    username: str
    email:    EmailStr
    password: str


# ── Platform Admin management ──────────────────────────────────

@router.post("/admins", status_code=201)
async def create_platform_admin(
    body: PlatformAdminCreate,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    """Create a new platform admin account."""
    try:
        existing = db.execute(
            text("SELECT id FROM platform_admins WHERE username = :u OR email = :e"),
            {"u": body.username, "e": body.email},
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Username or email already exists")

        db.execute(
            text("""INSERT INTO platform_admins (id, username, email, password_hash)
               VALUES (gen_random_uuid(), :u, :e, :h)"""),
            {"u": body.username, "e": body.email, "h": get_password_hash(body.password)},
        )
        _plog(db, admin.user_id, None, "platform_admin_created",
              {"username": body.username, "email": body.email})
        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed: {e}")
    return {"message": "Platform admin created", "username": body.username}


@router.get("/admins")
async def list_platform_admins(
    _=Depends(require_platform),
    db: Session = Depends(get_db),
):
    try:
        rows = db.execute(
            text("SELECT id, username, email, is_active, last_login_at, created_at FROM platform_admins")
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception:
        return []


# ── Organizations ──────────────────────────────────────────────

@router.get("/organizations")
async def list_organizations(
    status_filter: Optional[str] = None,
    search:        Optional[str] = None,
    _=Depends(require_platform),
    db: Session = Depends(get_db),
):
    q = db.query(Organization)
    if search:
        q = q.filter(Organization.name.ilike(f"%{search}%"))

    orgs = q.order_by(Organization.created_at.desc()).all()
    result = []
    for org in orgs:
        result.append({
            "id":            str(org.id),
            "name":          org.name,
            "description":   org.description,
            "plan":          getattr(org, "plan", "free"),
            "status":        getattr(org, "status", "active"),
            "billing_email": getattr(org, "billing_email", None),
            "contact_name":  getattr(org, "contact_name", None),
            "max_users":     getattr(org, "max_users", 10),
            "max_agents":    getattr(org, "max_agents", 50),
            "user_count":    db.query(User).filter(User.organization_id == org.id).count(),
            "agent_count":   db.query(Agent).filter(Agent.organization_id == org.id).count(),
            "asset_count":   db.query(Asset).filter(Asset.organization_id == org.id).count(),
            "open_incidents":db.query(Incident).filter(
                Incident.organization_id == org.id,
                Incident.status == "open",
            ).count(),
            "created_at":    org.created_at.isoformat(),
        })
    return result


@router.post("/organizations", status_code=201)
async def create_organization(
    body: OrgCreate,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    existing = db.query(Organization).filter(Organization.name == body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Organization name already exists")

    org = Organization(
        name=body.name,
        description=body.description or f"Organization: {body.name}",
    )
    for col in ["plan", "billing_email", "contact_name", "contact_email",
                "max_users", "max_agents", "max_assets", "max_policies"]:
        val = getattr(body, col, None)
        if val is not None:
            try:
                setattr(org, col, val)
            except Exception:
                pass

    db.add(org)
    db.flush()

    if body.admin_email and body.admin_password:
        admin_user = User(
            organization_id=org.id,
            username=body.admin_username or body.admin_email.split("@")[0],
            email=body.admin_email,
            password_hash=get_password_hash(body.admin_password),
            role="org_admin",
            is_active=True,
        )
        db.add(admin_user)

    _plog(db, admin.user_id, org.id, "org_created",
          {"name": body.name, "plan": body.plan})
    db.commit()
    db.refresh(org)

    try:
        from app.routes.rbac import seed_system_roles
        seed_system_roles(db, org.id)
    except Exception:
        pass

    return {"id": str(org.id), "name": org.name, "plan": body.plan,
            "message": "Organization created successfully"}


@router.get("/organizations/{org_id}")
async def get_organization(
    org_id: UUID,
    _=Depends(require_platform),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    users = db.query(User).filter(User.organization_id == org_id).all()
    return {
        "id":            str(org.id),
        "name":          org.name,
        "description":   org.description,
        "plan":          getattr(org, "plan", "free"),
        "status":        getattr(org, "status", "active"),
        "billing_email": getattr(org, "billing_email", None),
        "contact_name":  getattr(org, "contact_name", None),
        "max_users":     getattr(org, "max_users", 10),
        "max_agents":    getattr(org, "max_agents", 50),
        "max_assets":    getattr(org, "max_assets", 100),
        "feature_flags": getattr(org, "feature_flags", {}),
        "created_at":    org.created_at.isoformat(),
        "stats": {
            "users":    db.query(User).filter(User.organization_id == org_id).count(),
            "agents":   db.query(Agent).filter(Agent.organization_id == org_id).count(),
            "assets":   db.query(Asset).filter(Asset.organization_id == org_id).count(),
            "policies": db.query(Policy).filter(Policy.organization_id == org_id).count(),
            "open_incidents": db.query(Incident).filter(
                Incident.organization_id == org_id, Incident.status == "open").count(),
        },
        "users": [
            {"id": str(u.id), "username": u.username, "email": u.email,
             "role": u.role, "is_active": u.is_active}
            for u in users
        ],
    }


@router.patch("/organizations/{org_id}")
async def update_organization(
    org_id: UUID,
    body: OrgUpdate,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    changes = {}
    for k, v in body.dict(exclude_unset=True).items():
        try:
            old = getattr(org, k, None)
            setattr(org, k, v)
            changes[k] = {"old": str(old), "new": str(v)}
        except Exception:
            pass

    _plog(db, admin.user_id, org_id, "org_updated", changes)
    db.commit()
    return {"id": str(org_id), "message": "Organization updated"}


@router.post("/organizations/{org_id}/suspend")
async def suspend_organization(
    org_id: UUID,
    body: SuspendRequest,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    try:
        org.status       = "suspended"
        org.suspended_at = datetime.utcnow()
        org.suspended_by = str(admin.user_id)
    except Exception:
        pass
    _plog(db, admin.user_id, org_id, "org_suspended", {"reason": body.reason})
    db.commit()
    return {"message": f"Organization '{org.name}' suspended"}


@router.post("/organizations/{org_id}/reactivate")
async def reactivate_organization(
    org_id: UUID,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    try:
        org.status       = "active"
        org.suspended_at = None
    except Exception:
        pass
    _plog(db, admin.user_id, org_id, "org_reactivated", {})
    db.commit()
    return {"message": f"Organization '{org.name}' reactivated"}


@router.delete("/organizations/{org_id}")
async def delete_organization(
    org_id: UUID,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    name = org.name
    _plog(db, admin.user_id, org_id, "org_deleted", {"name": name})
    db.delete(org)
    db.commit()
    return {"message": f"Organization '{name}' permanently deleted"}


# ── Platform Metrics (cross-tenant) ───────────────────────────

@router.get("/metrics")
async def platform_metrics(
    _=Depends(require_platform),
    db: Session = Depends(get_db),
):
    top_orgs = db.query(
        RuntimeEvent.organization_id,
        func.count(RuntimeEvent.id).label("cnt"),
    ).group_by(RuntimeEvent.organization_id).order_by(
        func.count(RuntimeEvent.id).desc()
    ).limit(5).all()

    top_list = []
    for row in top_orgs:
        org = db.query(Organization).filter(Organization.id == row.organization_id).first()
        top_list.append({
            "org_id":   str(row.organization_id),
            "org_name": org.name if org else "Unknown",
            "events":   row.cnt,
        })

    return {
        "generated_at":  datetime.utcnow().isoformat(),
        "organizations": {
            "total":  db.query(Organization).count(),
            "active": db.query(Organization).filter(
                getattr(Organization, "status", None) == "active"
                if hasattr(Organization, "status") else True
            ).count() if hasattr(Organization, "status") else db.query(Organization).count(),
        },
        "users":          {"total": db.query(User).count()},
        "agents":         {"total": db.query(Agent).count()},
        "assets":         {"total": db.query(Asset).count()},
        "policies":       {"total": db.query(Policy).count()},
        "runtime_events": {
            "total":  db.query(RuntimeEvent).count(),
            "denied": db.query(RuntimeEvent).filter(RuntimeEvent.status == "deny").count(),
        },
        "incidents": {
            "open": db.query(Incident).filter(Incident.status == "open").count(),
        },
        "top_active_orgs": top_list,
    }


# ── Impersonation ──────────────────────────────────────────────

@router.post("/impersonate")
async def impersonate_org(
    body: ImpersonateRequest,
    admin: TokenData = Depends(require_platform),
    db: Session = Depends(get_db),
):
    from app.security import create_access_token

    org = db.query(Organization).filter(
        Organization.id == body.organization_id
    ).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_admin = db.query(User).filter(
        User.organization_id == org.id,
        User.role.in_(["org_admin", "admin"]),
        User.is_active == True,
    ).first()
    if not org_admin:
        raise HTTPException(status_code=404, detail="No active org admin found")

    # Record impersonation session
    try:
        db.execute(
            text("""INSERT INTO impersonation_sessions
               (id, platform_admin_id, organization_id, target_user_id, reason)
               VALUES (gen_random_uuid(), :a, :o, :u, :r)"""),
            {"a": str(admin.user_id), "o": str(org.id),
             "u": str(org_admin.id), "r": body.reason},
        )
    except Exception:
        pass

    _plog(db, admin.user_id, org.id, "org_impersonated",
          {"reason": body.reason, "target_user": str(org_admin.id)})
    db.commit()

    token = create_access_token(
        data={
            "sub":             str(org_admin.id),
            "org":             str(org.id),
            "role":            org_admin.role,
            "is_platform":     False,
            "impersonated_by": str(admin.user_id),
        },
        expires_delta=timedelta(hours=1),
    )
    return {
        "access_token":   token,
        "token_type":     "bearer",
        "organization":   org.name,
        "expires_in_hrs": 1,
        "warning":        "This session is fully audited.",
    }


# ── Platform Audit Logs (separate from org audit_logs) ─────────

@router.get("/audit-logs")
async def platform_audit_logs(
    limit: int = 100,
    _=Depends(require_platform),
    db: Session = Depends(get_db),
):
    try:
        rows = db.execute(
            text(f"SELECT * FROM platform_audit_logs ORDER BY created_at DESC LIMIT {limit}")
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    except Exception:
        return []
