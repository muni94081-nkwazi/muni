"""FastAPI dependencies re-exported from app.core.auth."""
from app.core.auth import (
    UserIdentity,
    require_auth,
    require_admin,
    optional_auth,
    is_staff,
)

__all__ = [
    "UserIdentity",
    "require_auth",
    "require_admin",
    "optional_auth",
    "is_staff",
]
