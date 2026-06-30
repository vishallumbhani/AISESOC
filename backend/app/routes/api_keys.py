"""
backend/app/routes/api_keys.py

API Key management — keys are hashed (SHA256), never stored in plaintext.
The raw key is returned exactly ONCE on creation.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID
from datetime import datetime

from app.database import get_db
from app.security import get_current_user
from app.schemas import TokenData
from app.models import AuditLog
from app.enterprise_models import ApiKey, API_KEY_SCOPES

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


# ── Schemas ────────────────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    name:       str
    scopes:     List[str]
    expires_at: Optional[datetime] = None


class ApiKeyResponse(BaseModel):
    id:           str
    name:         str
    key_prefix:   str
    scopes:       List[str]
    is_active:    bool
    expires_at:   Optional[datetime]
    last_used_at: Optional[datetime]
    created_at:   datetime


class ApiKeyCreated(ApiKeyResponse):
    raw_key: str   # returned ONCE — never stored


# ── Helpers ────────────────────────────────────────────────────

def _to_resp(k: ApiKey) -> dict:
    return {
        "id":           str(k.id),
        "name":         k.name,
        "key_prefix":   k.key_prefix,
        "scopes":       k.scopes or [],
        "is_active":    k.is_active,
        "expires_at":   k.expires_at,
        "last_used_at": k.last_used_at,
        "created_at":   k.created_at,
    }


# ── Routes ─────────────────────────────────────────────────────

@router.get("/scopes")
async def list_scopes():
    """Return all valid API key scopes."""
    return {"scopes": API_KEY_SCOPES}


@router.get("")
async def list_api_keys(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    keys = db.query(ApiKey).filter(
        ApiKey.organization_id == current_user.organization_id,
    ).order_by(ApiKey.created_at.desc()).all()
    return [_to_resp(k) for k in keys]


@router.post("", status_code=201)
async def create_api_key(
    body: ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    # Validate scopes
    invalid = [s for s in body.scopes if s not in API_KEY_SCOPES]
    if invalid:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid scopes: {invalid}. Valid: {API_KEY_SCOPES}",
        )

    raw_key, prefix, hashed = ApiKey.generate()

    key = ApiKey(
        organization_id=current_user.organization_id,
        created_by=current_user.user_id,
        name=body.name,
        key_prefix=prefix,
        key_hash=hashed,
        scopes=body.scopes,
        expires_at=body.expires_at,
    )
    db.add(key)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="api_key_created",
        resource_type="api_key",
        resource_id=str(key.id),
        changes={"name": body.name, "scopes": body.scopes},
    ))
    db.commit()
    db.refresh(key)

    return {**_to_resp(key), "raw_key": raw_key}  # raw_key ONLY here


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.organization_id == current_user.organization_id,
    ).first()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_active  = False
    key.revoked_at = datetime.utcnow()
    key.revoked_by = current_user.user_id

    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="api_key_revoked",
        resource_type="api_key",
        resource_id=str(key_id),
        changes={"name": key.name},
    ))
    db.commit()
    return {"message": "API key revoked"}


@router.post("/{key_id}/rotate", status_code=201)
async def rotate_api_key(
    key_id: UUID,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    """Revoke old key and issue a new one with the same name + scopes."""
    old_key = db.query(ApiKey).filter(
        ApiKey.id == key_id,
        ApiKey.organization_id == current_user.organization_id,
    ).first()
    if not old_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Revoke old
    old_key.is_active  = False
    old_key.revoked_at = datetime.utcnow()
    old_key.revoked_by = current_user.user_id

    # Create new
    raw_key, prefix, hashed = ApiKey.generate()
    new_key = ApiKey(
        organization_id=current_user.organization_id,
        created_by=current_user.user_id,
        name=old_key.name + " (rotated)",
        key_prefix=prefix,
        key_hash=hashed,
        scopes=old_key.scopes,
        expires_at=old_key.expires_at,
    )
    db.add(new_key)
    db.add(AuditLog(
        organization_id=current_user.organization_id,
        user_id=current_user.user_id,
        action="api_key_rotated",
        resource_type="api_key",
        resource_id=str(key_id),
        changes={"old_prefix": old_key.key_prefix, "new_prefix": prefix},
    ))
    db.commit()
    db.refresh(new_key)

    return {**_to_resp(new_key), "raw_key": raw_key}


@router.get("/verify")
async def verify_api_key(
    key: str = Query(..., description="Raw API key to verify"),
    db: Session = Depends(get_db),
):
    """
    Internal endpoint to validate an API key.
    Returns scopes if valid. Used by the runtime connector.
    """
    hashed = ApiKey.hash_key(key)
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == hashed,
        ApiKey.is_active == True,
    ).first()

    if not api_key:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key")

    if api_key.expires_at and api_key.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="API key expired")

    # Update last used
    api_key.last_used_at = datetime.utcnow()
    db.commit()

    return {
        "valid":           True,
        "organization_id": str(api_key.organization_id),
        "scopes":          api_key.scopes,
        "key_prefix":      api_key.key_prefix,
    }
