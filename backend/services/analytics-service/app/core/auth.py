"""Authentication and authorization dependencies for analytics-service."""
from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel
from fastapi import Request

from app.core.internal_identity import (
    INTERNAL_IDENTITY_HEADER,
    is_internal_identity_enabled,
    verify_identity,
)
from app.core.exceptions import AnalyticsError

STAFF_ROLES = ["ROLE_ADMIN", "ROLE_SUPER_ADMIN"]


class UserIdentity(BaseModel):
    user_id: str
    roles: List[str]
    calling_service: Optional[str] = None


def is_staff(identity: UserIdentity) -> bool:
    """Return True if caller has staff role or is a calling service."""
    return bool(identity.calling_service) or any(r in STAFF_ROLES for r in identity.roles)


def resolve_identity(request: Request) -> Optional[UserIdentity]:
    """
    Resolve caller identity according to configured mode:
    - Signed mode (when INTERNAL_IDENTITY_SECRET is set): cryptographically verified.
    - Headers mode: reads x-user-id and x-user-roles.
    """
    if is_internal_identity_enabled():
        token = request.headers.get(INTERNAL_IDENTITY_HEADER)
        if not token:
            return None
        payload = verify_identity(token)
        if not payload:
            return None
        return UserIdentity(
            user_id=payload["sub"],
            roles=payload.get("roles", []),
            calling_service=payload.get("svc"),
        )

    user_id = request.headers.get("x-user-id")
    if not user_id:
        return None
    raw_roles = request.headers.get("x-user-roles", "")
    roles = [r.strip() for r in raw_roles.split(",") if r.strip()]
    return UserIdentity(user_id=user_id, roles=roles)


def require_auth(request: Request) -> UserIdentity:
    identity = resolve_identity(request)
    if not identity:
        raise AnalyticsError.unauthorized()
    return identity


def require_admin(request: Request) -> UserIdentity:
    identity = require_auth(request)
    if not is_staff(identity):
        raise AnalyticsError.forbidden()
    return identity


def optional_auth(request: Request) -> Optional[UserIdentity]:
    return resolve_identity(request)
