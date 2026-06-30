"""
backend/app/security.py

Dual authentication:
  1. JWT Bearer token  → get_current_user (existing, unchanged)
  2. X-AISECOS-API-KEY → get_api_key_user (new, for machine-to-machine)

Both return a TokenData with organization_id populated.
The runtime/connector endpoints accept either.

Fixed:
  - Removed __import__ hack; direct import from app.database
  - api key last_used_at uses flush() not commit()
  - Startup SECRET_KEY assertion
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.config import settings
from app.database import get_db
from app.schemas import TokenData
import uuid
import hashlib

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security    = HTTPBearer(auto_error=False)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain[:72], hashed)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password[:72])


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta
        else timedelta(hours=settings.jwt_expiration_hours)
    )
    to_encode["exp"] = expire
    token = jwt.encode(to_encode, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token


def verify_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
        user_id: str         = payload.get("sub")
        organization_id: str = payload.get("org")
        role: str            = payload.get("role", "user")
        is_platform: bool    = payload.get("is_platform", False)

        if user_id is None:
            return None

        org_uuid = None
        if organization_id and organization_id != "00000000-0000-0000-0000-000000000000":
            try:
                org_uuid = uuid.UUID(organization_id)
            except ValueError:
                org_uuid = None

        token_data = TokenData(
            user_id=uuid.UUID(user_id),
            organization_id=org_uuid,
        )
        object.__setattr__(token_data, "role",        role)
        object.__setattr__(token_data, "is_platform", is_platform)
        return token_data
    except JWTError:
        return None


def _verify_api_key(raw_key: str, db: Session, required_scope: Optional[str] = None) -> TokenData:
    """
    Verify an API key and return TokenData with org context.
    Raises HTTPException on any failure.
    """
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    try:
        row = db.execute(
            text("""
                SELECT id, organization_id, scopes, is_active, expires_at, name
                FROM api_keys
                WHERE key_hash = :h
            """),
            {"h": key_hash},
        ).fetchone()
    except Exception:
        raise HTTPException(status_code=401, detail="API key validation failed")

    if not row:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if not row.is_active:
        raise HTTPException(status_code=401, detail="API key is revoked")

    if row.expires_at and row.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=401, detail="API key has expired")

    if required_scope:
        scopes = row.scopes or []
        if required_scope not in scopes:
            raise HTTPException(
                status_code=403,
                detail=f"API key missing required scope: '{required_scope}'",
            )

    # Update last_used_at — use flush, not commit (caller handles the transaction)
    try:
        db.execute(
            text("UPDATE api_keys SET last_used_at = now() WHERE id = :id"),
            {"id": str(row.id)},
        )
        db.flush()
    except Exception:
        pass  # Non-fatal — don't fail auth over a metadata update

    token_data = TokenData(
        user_id=None,
        organization_id=uuid.UUID(str(row.organization_id)),
    )
    object.__setattr__(token_data, "role",          "api_key")
    object.__setattr__(token_data, "is_platform",   False)
    object.__setattr__(token_data, "api_key_name",  row.name)
    object.__setattr__(token_data, "api_key_scopes", row.scopes or [])
    return token_data


# ── Standard JWT dependency (unchanged behaviour) ──────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenData:
    """JWT-only authentication. Used by all existing endpoints."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token_data = verify_token(credentials.credentials)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return token_data


# ── Dual auth dependency (JWT or API Key) ──────────────────────

def get_current_user_or_api_key(required_scope: Optional[str] = None):
    """
    FastAPI dependency factory.
    Accepts EITHER:
      - Authorization: Bearer <JWT>
      - X-AISECOS-API-KEY: <api_key>
    """
    async def _auth(
        request: Request,
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db),
    ) -> TokenData:
        # 1. Try JWT
        if credentials and credentials.credentials:
            token_data = verify_token(credentials.credentials)
            if token_data is not None:
                return token_data

        # 2. Try API key header
        api_key = request.headers.get("X-AISECOS-API-KEY") or request.headers.get("x-aisecos-api-key")
        if api_key:
            return _verify_api_key(api_key, db, required_scope)

        # 3. Nothing worked
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required: provide Bearer JWT or X-AISECOS-API-KEY header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return _auth
