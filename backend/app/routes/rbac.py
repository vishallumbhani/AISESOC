"""
backend/app/routes/rbac.py

Role-Based Access Control management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.models import User, AuditLog, Organization
from app.enterprise_models import Role, Permission, SYSTEM_ROLES, SYSTEM_PERMISSIONS

router = APIRouter(prefix="/rbac", tags=["rbac"])


# ── Schema ─────────────────────────────────────────────────────

class AssignRoleBody(BaseModel):
    user_id: str
    role_name: str


class CreateRoleBody(BaseModel):
    name:         str
    display_name: str
    description:  Optional[str] = None
    permissions:  List[str] = []


# ── Seed helpers ────────────────────────────────────────────────

def seed_system_roles(db: Session, org_id: UUID):
    """
    Idempotently create system roles and permissions for an org.
    Called at org creation time.
    """
    # Seed permissions (global — not per org)
    for perm_id, resource, action, desc in SYSTEM_PERMISSIONS:
        if not db.query(Permission).filter(Permission.id == perm_id).first():
            db.add(Permission(id=perm_id, resource=resource, action=action, description=desc))

    # Seed roles per org
    for role_name, role_def in SYSTEM_ROLES.items():
        existing = db.query(Role).filter(
            Role.organization_id == org_id,
            Role.name == role_name,
        ).first()
        if not existing:
            role = Role(
                organization_id=org_id,
                name=role_name,
                display_name=role_def["display_name"],
                description=role_def["description"],
                is_system=True,
            )
            db.add(role)
            db.flush()
            for perm_id in role_def["permissions"]:
                perm = db.query(Permission).filter(Permission.id == perm_id).first()
                if perm:
                    role.permissions.append(perm)

    db.commit()


# ── Routes ─────────────────────────────────────────────────────

@router.get("/roles")
async def list_roles(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    roles = db.query(Role).filter(
        Role.organization_id == current_user.organization_id,
    ).all()
    return [
        {
            "id":           str(r.id),
            "name":         r.name,
            "display_name": r.display_name,
            "description":  r.description,
            "is_system":    r.is_system,
            "permissions":  [p.id for p in r.permissions],
        }
        for r in roles
    ]


@router.post("/roles", status_code=201)
async def create_role(
    body: CreateRoleBody,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    existing = db.query(Role).filter(
        Role.organization_id == current_user.organization_id,
        Role.name == body.name,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Role name already exists")

    role = Role(
        organization_id=current_user.organization_id,
        name=body.name,
        display_name=body.display_name,
        description=body.description,
        is_system=False,
    )
    for perm_id in body.permissions:
        perm = db.query(Permission).filter(Permission.id == perm_id).first()
        if perm:
            role.permissions.append(perm)
    db.add(role)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="role_created",
        resource_type="role",
        resource_id=str(role.id),
        changes={"name": body.name, "permissions": body.permissions},
    ))
    db.commit()
    db.refresh(role)
    return {"id": str(role.id), "name": role.name, "display_name": role.display_name}


@router.get("/permissions")
async def list_permissions(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    perms = db.query(Permission).order_by(Permission.resource, Permission.action).all()
    return [
        {"id": p.id, "resource": p.resource, "action": p.action, "description": p.description}
        for p in perms
    ]


@router.get("/users")
async def list_users_with_roles(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    users = db.query(User).filter(
        User.organization_id == current_user.organization_id,
    ).order_by(User.username).all()
    return [
        {
            "id":           str(u.id),
            "username":     u.username,
            "email":        u.email,
            "role":         u.role,
            "is_active":    u.is_active,
            "last_login_at": u.last_login_at if hasattr(u, "last_login_at") else None,
            "roles":        [str(r.id) + ":" + r.name for r in (u.roles if hasattr(u, "roles") else [])],
        }
        for u in users
    ]


@router.post("/users/{user_id}/roles")
async def assign_role(
    user_id: UUID,
    body: AssignRoleBody,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = db.query(Role).filter(
        Role.organization_id == current_user.organization_id,
        Role.name == body.role_name,
    ).first()
    if not role:
        raise HTTPException(status_code=404, detail=f"Role '{body.role_name}' not found")

    # Update legacy role column too for backward compatibility
    user.role = body.role_name
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="role_assigned",
        resource_type="user",
        resource_id=str(user_id),
        changes={"role": body.role_name, "granted_by": str(current_user.user_id)},
    ))
    db.commit()
    return {"message": f"Role '{body.role_name}' assigned to user"}


@router.delete("/users/{user_id}/roles/{role_name}")
async def remove_role(
    user_id: UUID,
    role_name: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    user = db.query(User).filter(
        User.id == user_id,
        User.organization_id == current_user.organization_id,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.role = "read_only"
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="role_removed",
        resource_type="user",
        resource_id=str(user_id),
        changes={"removed_role": role_name},
    ))
    db.commit()
    return {"message": f"Role '{role_name}' removed"}


@router.get("/my-permissions")
async def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Return current user's effective permissions."""
    from app.services.rbac import get_user_permissions
    perms = get_user_permissions(db, current_user.user_id, current_user.organization_id)
    return {"permissions": sorted(list(perms)), "user_id": str(current_user.user_id)}


@router.post("/seed")
async def seed_roles(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Idempotently seed system roles for this organization."""
    seed_system_roles(db, current_user.organization_id)
    return {"message": "System roles seeded successfully"}
