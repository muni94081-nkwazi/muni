import re
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Tuple
import bcrypt
import jwt

from app.core.config import settings
from app.core.exceptions import ApiError


def parse_duration(duration_str: str) -> timedelta:
    match = re.match(r"^(\d+)([smhd])$", duration_str.strip())
    if not match:
        try:
            return timedelta(seconds=int(duration_str))
        except ValueError:
            return timedelta(minutes=15)
    
    val, unit = int(match.group(1)), match.group(2)
    if unit == "s":
        return timedelta(seconds=val)
    elif unit == "m":
        return timedelta(minutes=val)
    elif unit == "h":
        return timedelta(hours=val)
    elif unit == "d":
        return timedelta(days=val)
    return timedelta(minutes=15)


def hash_password(plain_password: str) -> str:
    pwd_bytes = plain_password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    pwd_bytes = plain_password.encode("utf-8")
    hash_bytes = hashed_password.encode("utf-8")
    return bcrypt.checkpw(pwd_bytes, hash_bytes)


def sign_access_token(user: Any) -> str:
    now = datetime.now(timezone.utc)
    expires_delta = parse_duration(settings.JWT_ACCESS_EXPIRES_IN)
    exp = now + expires_delta

    user_id = getattr(user, "id", None) or user.get("id")
    email = getattr(user, "email", None) or user.get("email")
    role = getattr(user, "role", None) or user.get("role")
    if hasattr(role, "value"):
        role = role.value

    payload = {
        "sub": str(user_id),
        "email": email,
        "role": str(role),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_ACCESS_SECRET, algorithm="HS256")


def sign_refresh_token(user: Any) -> str:
    now = datetime.now(timezone.utc)
    expires_delta = parse_duration(settings.JWT_REFRESH_EXPIRES_IN)
    exp = now + expires_delta

    user_id = getattr(user, "id", None) or user.get("id")

    payload = {
        "sub": str(user_id),
        "jti": secrets.token_hex(16),
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.JWT_REFRESH_SECRET, algorithm="HS256")


def verify_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_ACCESS_SECRET, algorithms=["HS256"])
        return payload
    except Exception as exc:
        raise ApiError.unauthorized("Invalid or expired access token") from exc


def verify_refresh_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.JWT_REFRESH_SECRET, algorithms=["HS256"])
        return payload
    except Exception as exc:
        raise ApiError.unauthorized("Invalid or expired refresh token") from exc


def generate_opaque_token() -> Tuple[str, str]:
    raw = secrets.token_hex(32)
    hash_val = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return raw, hash_val


def hash_opaque_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
