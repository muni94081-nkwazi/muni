import re
from typing import Any, Dict, List, Optional
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.config import settings

REQUIRED_MESSAGES: Dict[str, str] = {
    "firstName": "First name is required",
    "lastName": "Last name is required",
    "email": "Enter a valid email address",
    "password": "Password is required",
    "token": "Reset token is required",
    "newPassword": "Password must be at least 8 characters",
    "refreshToken": "Refresh token is required",
    "contactName": "Contact name is required",
    "contactPhone": "Enter a valid phone number for the recipient",
    "region": "Region is required",
    "district": "District is required",
    "addressLine": "Street address is required",
}


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        details: Optional[List[Dict[str, str]]] = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details
        self.is_operational = True

    @classmethod
    def bad_request(cls, message: str, details: Optional[List[Dict[str, str]]] = None) -> "ApiError":
        return cls(400, message, details)

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized") -> "ApiError":
        return cls(401, message)

    @classmethod
    def forbidden(cls, message: str = "Forbidden") -> "ApiError":
        return cls(403, message)

    @classmethod
    def not_found(cls, message: str = "Not found") -> "ApiError":
        return cls(404, message)

    @classmethod
    def conflict(cls, message: str) -> "ApiError":
        return cls(409, message)

    @classmethod
    def internal(cls, message: str = "Internal server error") -> "ApiError":
        return cls(500, message)


async def api_error_handler(request: Request, exc: ApiError) -> JSONResponse:
    content: Dict[str, Any] = {
        "success": False,
        "message": exc.message,
    }
    if exc.details is not None:
        content["details"] = exc.details
    return JSONResponse(status_code=exc.status_code, content=content)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details: List[Dict[str, str]] = []
    for error in exc.errors():
        field_loc = [str(loc) for loc in error.get("loc", []) if loc != "body"]
        field_name = ".".join(field_loc) if field_loc else "body"

        raw_msg = error.get("msg", "Invalid value")
        err_type = error.get("type", "")

        if err_type == "missing" and field_name in REQUIRED_MESSAGES:
            clean_msg = REQUIRED_MESSAGES[field_name]
        else:
            # Strip Pydantic V2 prefixes like "Value error, " or "Assertion failed, "
            clean_msg = re.sub(r"^(Value error|Assertion failed),\s*", "", raw_msg)

        details.append({
            "field": field_name,
            "message": clean_msg,
        })

    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "message": "Validation failed",
            "details": details,
        },
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if exc.status_code == 404:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": f"Route not found: {request.method} {request.url.path}",
            },
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail if isinstance(exc.detail, str) else "Error",
        },
    )


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    content: Dict[str, Any] = {
        "success": False,
        "message": "Something went wrong. Please try again.",
    }
    if settings.NODE_ENV == "development":
        content["stack"] = str(exc)

    return JSONResponse(status_code=500, content=content)
