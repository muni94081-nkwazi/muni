from typing import Dict, Any, Optional, List, Callable
from fastapi import Request, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ApiError
from app.core.security import verify_access_token
from app.core.internal_identity import INTERNAL_IDENTITY_HEADER, verify_identity


def get_current_user(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("authorization") or ""
    parts = auth_header.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or not parts[1].strip():
        raise ApiError.unauthorized("Missing or malformed Authorization header")

    token = parts[1].strip()
    payload = verify_access_token(token)

    sub = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")

    if not sub:
        raise ApiError.unauthorized("Invalid or expired access token")

    user_info = {"id": sub, "email": email, "role": role}
    request.state.user = user_info
    return user_info


def require_role(*roles: str) -> Callable:
    def dependency(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        user_role = user.get("role")
        if not user or user_role not in roles:
            raise ApiError.forbidden("Insufficient permissions")
        return user
    return dependency


def authorize_trust_event(request: Request) -> Dict[str, Any]:
    # 1. Peer service assertion via x-internal-identity
    internal_token = request.headers.get(INTERNAL_IDENTITY_HEADER)
    if internal_token:
        identity = verify_identity(internal_token)
        if identity and identity.get("svc"):
            actor = {"type": "service", "name": identity["svc"]}
            request.state.trust_event_actor = actor
            return actor
        # If header was supplied but invalid or lacking svc claim, and no valid bearer token follows,
        # TS rejects as 401 unauthenticated.
        # Fall through to Bearer check below.

    # 2. Signed-in seller or admin
    seller_id = request.path_params.get("sellerId")
    viewer = get_current_user(request)

    if viewer.get("role") == "ADMIN":
        actor = {"type": "admin", "name": viewer["id"]}
        request.state.trust_event_actor = actor
        return actor

    if viewer.get("id") == seller_id:
        actor = {"type": "seller", "name": viewer["id"]}
        request.state.trust_event_actor = actor
        return actor

    raise ApiError.forbidden("You can only record trust events for your own seller account")
