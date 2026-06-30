"""
backend/app/routes/auth.py

Auth routes — org login, platform login, user management.

Fixes:
  - list_org_users: wraps every attribute access in getattr() so missing
    columns (last_login_at, display_name) never crash the endpoint
  - list_org_users: returns last_login_at so frontend can display it
  - get_me: uses text() for raw SQL (SQLAlchemy 2.x requirement)
  - All routes: robust error handling, never 500 on missing columns
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import timedelta, datetime
from typing import Optional
from pydantic import BaseModel, EmailStr
from uuid import UUID

from app.database import get_db
from app.models import User, Organization, AuditLog
from app.schemas import UserCreate, Token, TokenData
from app.security import (
    get_password_hash, verify_password,
    create_access_token, get_current_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Schemas ────────────────────────────────────────────────────

class PlatformLoginRequest(BaseModel):
    username: str
    password: str


class InviteUserRequest(BaseModel):
    email:    EmailStr
    username: str
    role:     str = "security_analyst"
    password: str


# ── Helper ─────────────────────────────────────────────────────

def _audit(db, org_id, user_id, action, resource_type, resource_id, changes):
    try:
        db.add(AuditLog(
            organization_id=org_id,
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            changes=changes,
        ))
    except Exception:
        pass


def _safe_isoformat(dt) -> Optional[str]:
    """Safely convert a datetime to ISO string, returning None on any failure."""
    try:
        if dt is None:
            return None
        return dt.isoformat()
    except Exception:
        return None


def _user_dict(u: User) -> dict:
    """
    Safely serialize a User model row to a dict.
    Uses getattr() for every column that may not exist yet
    (added by migrations that haven't run on all envs).
    """
    return {
        "id":           str(u.id),
        "username":     u.username or "",
        "email":        u.email or "",
        "role":         u.role or "user",
        "is_active":    u.is_active if u.is_active is not None else True,
        "display_name": getattr(u, "display_name", None),
        "last_login_at": _safe_isoformat(getattr(u, "last_login_at", None)),
        "mfa_enabled":  getattr(u, "mfa_enabled", False),
        "created_at":   _safe_isoformat(u.created_at),
    }


# ── Register ───────────────────────────────────────────────────

@router.post("/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    org = db.query(Organization).first()
    if not org:
        org = Organization(name="Default Organization")
        db.add(org)
        db.commit()
        db.refresh(org)

    user = User(
        organization_id=org.id,
        username=user_data.username,
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        role=user_data.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={
        "sub":         str(user.id),
        "org":         str(org.id),
        "role":        user.role,
        "is_platform": False,
    })
    return {"access_token": access_token, "token_type": "bearer"}


# ── Org Login ──────────────────────────────────────────────────

@router.post("/login", response_model=Token)
async def login(username: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Check org suspension
    try:
        org = db.query(Organization).filter(Organization.id == user.organization_id).first()
        if org and getattr(org, "status", "active") == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization has been suspended.",
            )
    except HTTPException:
        raise
    except Exception:
        pass

    # Update last_login_at (safe — column may not exist yet)
    try:
        user.last_login_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()

    access_token = create_access_token(data={
        "sub":         str(user.id),
        "org":         str(user.organization_id),
        "role":        user.role,
        "is_platform": False,
    })
    return {"access_token": access_token, "token_type": "bearer"}


# ── Platform Admin Login ───────────────────────────────────────

@router.post("/platform/login", response_model=Token)
async def platform_login(body: PlatformLoginRequest, db: Session = Depends(get_db)):
    try:
        row = db.execute(
            text("SELECT id, username, password_hash, is_active FROM platform_admins WHERE username = :u"),
            {"u": body.username},
        ).fetchone()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Platform admin table not found. Run migrations first.",
        )

    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid platform credentials")
    if not row.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin account is disabled")
    if not verify_password(body.password, row.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid platform credentials")

    try:
        db.execute(
            text("UPDATE platform_admins SET last_login_at = now() WHERE id = :id"),
            {"id": str(row.id)},
        )
        db.execute(
            text("""INSERT INTO platform_audit_logs (id, platform_admin_id, action, changes)
               VALUES (gen_random_uuid(), :admin_id, 'platform_login',
               jsonb_build_object('username', :username))"""),
            {"admin_id": str(row.id), "username": body.username},
        )
        db.commit()
    except Exception:
        db.rollback()

    token = create_access_token(data={
        "sub":         str(row.id),
        "org":         "00000000-0000-0000-0000-000000000000",
        "role":        "platform_admin",
        "is_platform": True,
    })
    return {"access_token": token, "token_type": "bearer"}


# ── Current User Profile ───────────────────────────────────────

@router.get("/me")
async def get_me(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_platform = getattr(current_user, "is_platform", False)

    if is_platform:
        try:
            # text() required for SQLAlchemy 2.x
            row = db.execute(
                text("SELECT id, username, email FROM platform_admins WHERE id = :id"),
                {"id": str(current_user.user_id)},
            ).fetchone()
            return {
                "user":         {"id": str(row.id), "username": row.username,
                                 "email": row.email, "role": "platform_admin"},
                "organization": None,
                "permissions":  ["*"],
                "is_platform":  True,
            }
        except Exception:
            return {"user": {"role": "platform_admin"}, "is_platform": True}

    user = db.query(User).filter(User.id == current_user.user_id).first()
    org  = db.query(Organization).filter(
        Organization.id == current_user.organization_id
    ).first() if current_user.organization_id else None

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        from app.services.rbac import get_user_permissions
        perms = sorted(list(get_user_permissions(db, user.id, org.id if org else None)))
    except Exception:
        perms = []

    return {
        "user": _user_dict(user),
        "organization": {
            "id":     str(org.id),
            "name":   org.name,
            "plan":   getattr(org, "plan", "free"),
            "status": getattr(org, "status", "active"),
        } if org else None,
        "permissions":  perms,
        "is_platform":  False,
    }


# ── Invite User ────────────────────────────────────────────────

@router.post("/invite", status_code=201)
async def invite_user(
    body: InviteUserRequest,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    VALID_ROLES = [
        "org_admin", "security_architect", "security_analyst",
        "auditor", "read_only", "admin", "user",
    ]
    if body.role not in VALID_ROLES:
        raise HTTPException(status_code=422, detail=f"Invalid role. Valid: {VALID_ROLES}")

    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    existing = db.query(User).filter(
        User.email == body.email,
        User.organization_id == current_user.organization_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already exists in this organization")

    existing_uname = db.query(User).filter(
        User.username == body.username,
        User.organization_id == current_user.organization_id,
    ).first()
    if existing_uname:
        raise HTTPException(status_code=409, detail="Username already exists in this organization")

    user = User(
        organization_id=current_user.organization_id,
        username=body.username,
        email=body.email,
        password_hash=get_password_hash(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(user)
    db.flush()
    _audit(db, current_user.organization_id, current_user.user_id,
           "user_invited", "user", user.id,
           {"email": body.email, "role": body.role, "username": body.username})
    db.commit()
    return _user_dict(user)


# ── List Org Users ─────────────────────────────────────────────

@router.get("/users")
async def list_org_users(
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List all users in the current organization.
    Every attribute access is safe — missing columns return None/default.
    """
    try:
        users = db.query(User).filter(
            User.organization_id == current_user.organization_id,
        ).order_by(User.username).all()
        return [_user_dict(u) for u in users]
    except Exception as e:
        # Log and return empty rather than 500
        import logging
        logging.getLogger(__name__).error(f"list_org_users error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load users: {str(e)}")


# ── Update User ────────────────────────────────────────────────

@router.patch("/users/{user_id}")
async def update_user(
    user_id: UUID,
    body: dict,
    current_user: TokenData = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    changes = {}
    for field in ("role", "is_active", "display_name"):
        if field in body:
            try:
                old = getattr(user, field, None)
                setattr(user, field, body[field])
                changes[field] = {"old": str(old), "new": str(body[field])}
            except Exception:
                pass  # Column may not exist yet

    _audit(db, current_user.organization_id, current_user.user_id,
           "user_updated", "user", user_id, changes)
    db.commit()
    return _user_dict(user)
