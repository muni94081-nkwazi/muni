"""Dependencies for recommendation-service route handlers."""
from __future__ import annotations

from typing import Optional
from fastapi import Header


def get_current_user_id(x_user_id: Optional[str] = Header(default=None)) -> Optional[str]:
    return x_user_id
