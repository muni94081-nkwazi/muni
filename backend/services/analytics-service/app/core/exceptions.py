"""Exceptions and HTTP error handlers for analytics-service."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AnalyticsError(Exception):
    """Domain exception with HTTP status code and optional error code."""

    def __init__(self, status_code: int, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.code = code

    @classmethod
    def unauthorized(cls, message: str = "Authentication required", code: str = "UNAUTHORIZED") -> AnalyticsError:
        return cls(401, message, code)

    @classmethod
    def forbidden(cls, message: str = "Insufficient permissions", code: str = "FORBIDDEN") -> AnalyticsError:
        return cls(403, message, code)

    @classmethod
    def seller_idor(cls, message: str = "You can only view your own analytics.") -> AnalyticsError:
        return cls(403, message, None)

    @classmethod
    def bad_request(cls, message: str = "Bad request") -> AnalyticsError:
        return cls(400, message, None)

    @classmethod
    def internal(cls, message: str = "Internal server error") -> AnalyticsError:
        return cls(500, message, None)


async def analytics_error_handler(_request: Request, exc: AnalyticsError) -> JSONResponse:
    content: Dict[str, Any] = {"success": False, "message": exc.message}
    if exc.code is not None:
        content["code"] = exc.code
    return JSONResponse(status_code=exc.status_code, content=content)


async def starlette_http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content=exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": str(exc.detail)},
    )
