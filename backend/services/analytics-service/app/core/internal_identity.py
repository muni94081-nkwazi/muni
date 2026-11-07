"""Cryptographic internal identity minting and verification."""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any
import jwt

TTL_SECONDS = 30
ISSUER = "muni-api-gateway"
AUDIENCE = "muni-internal"
INTERNAL_IDENTITY_HEADER = "x-internal-identity"


def get_secret() -> Optional[str]:
    # Check os.environ first to support runtime modification in tests
    secret = os.environ.get("INTERNAL_IDENTITY_SECRET")
    if not secret or len(secret) < 32:
        return None
    return secret


def is_internal_identity_enabled() -> bool:
    return get_secret() is not None


def sign_identity(sub: str, roles: List[str]) -> Optional[str]:
    secret = get_secret()
    if not secret:
        return None

    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "roles": roles,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def sign_service_identity(sub: str, roles: List[str], svc: str) -> Optional[str]:
    secret = get_secret()
    if not secret:
        return None

    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "roles": roles,
        "svc": svc,
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_identity(token: Optional[str]) -> Optional[Dict[str, Any]]:
    secret = get_secret()
    if not secret or not token:
        return None

    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            issuer=ISSUER,
            audience=AUDIENCE,
        )
        sub = payload.get("sub")
        roles = payload.get("roles")
        if not isinstance(sub, str) or not isinstance(roles, list):
            return None

        clean_roles = [r for r in roles if isinstance(r, str)]
        res: Dict[str, Any] = {"sub": sub, "roles": clean_roles}
        if "svc" in payload and isinstance(payload["svc"], str):
            res["svc"] = payload["svc"]
        return res
    except Exception:
        return None
