"""
backend/app/services/rbac.py

Permission-based access control service.
Never use if role == "admin" — always check permissions.
"""
from typing import Optional, List, Set
from uuid import UUID
from functools import lru_cache
from sqlalchemy.orm import Session
from fastapi import Depends, HTTPException, status

from app.database import get_db
from app.schemas import TokenData
from app.security import get_current_user


# ── Permission checker ─────────────────────────────────────────

def get_user_permissions(db: Session, user_id: UUID, org_id: UUID) -> Set[str]:
    """
    Return the full set of permission IDs for a user within an org.
    Falls back to legacy role-based permissions if RBAC tables are empty.
    """
    from app.models import User

    # Try new RBAC first
    try:
        result = db.execute(
            """
            SELECT DISTINCT p.id
            FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            JOIN user_roles ur ON ur.role_id = rp.role_id
            WHERE ur.user_id = :uid AND ur.organization_id = :oid
            """,
            {"uid": str(user_id), "oid": str(org_id)},
        ).fetchall()
        if result:
            return {row[0] for row in result}
    except Exception:
        pass

    # Fallback: map legacy role string to permissions
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return set()
    return _legacy_role_permissions(user.role or "user")


def _legacy_role_permissions(role: str) -> Set[str]:
    """Maps old string roles to permission sets."""
    from app.enterprise_models import SYSTEM_ROLES
    mapping = {
        "admin":   SYSTEM_ROLES["org_admin"]["permissions"],
        "user":    SYSTEM_ROLES["security_analyst"]["permissions"],
        "auditor": SYSTEM_ROLES["auditor"]["permissions"],
        "viewer":  SYSTEM_ROLES["read_only"]["permissions"],
    }
    return set(mapping.get(role, SYSTEM_ROLES["read_only"]["permissions"]))


def require_permission(permission: str):
    """
    FastAPI dependency factory.
    Usage:
        @router.get("/incidents")
        async def list_incidents(
            _=Depends(require_permission("incident:read")),
            current_user=Depends(get_current_user),
            db=Depends(get_db),
        ):
    """
    async def _checker(
        current_user: TokenData = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        perms = get_user_permissions(db, current_user.user_id, current_user.organization_id)
        if permission not in perms:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: '{permission}' required.",
            )
        return current_user
    return _checker


def require_any_permission(*permissions: str):
    """User must have at least ONE of the listed permissions."""
    async def _checker(
        current_user: TokenData = Depends(get_current_user),
        db: Session = Depends(get_db),
    ):
        perms = get_user_permissions(db, current_user.user_id, current_user.organization_id)
        if not any(p in perms for p in permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: one of {list(permissions)} required.",
            )
        return current_user
    return _checker


def check_permission(db: Session, user_id: UUID, org_id: UUID, permission: str) -> bool:
    """Inline permission check (no exception)."""
    return permission in get_user_permissions(db, user_id, org_id)
