import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator, model_validator
from app.models.user import Role

UGANDAN_PHONE_REGEX = re.compile(r"^(?:\+256|0)7\d{8}$")
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


def validate_email_format(v: str) -> str:
    s = v.strip().lower()
    if not EMAIL_REGEX.match(s):
        raise ValueError("Enter a valid email address")
    return s


def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must include a lowercase letter")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must include an uppercase letter")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must include a number")
    return v


class PublicUser(BaseModel):
    id: str
    firstName: str
    lastName: str
    email: str
    phoneNumber: Optional[str] = None
    role: Role
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class AuthResponseData(BaseModel):
    user: PublicUser
    accessToken: str
    refreshToken: str


class RegisterRequest(BaseModel):
    firstName: str
    lastName: str
    email: str
    phoneNumber: Optional[str] = None
    password: str

    @field_validator("firstName", "lastName")
    @classmethod
    def check_not_empty(cls, v: str, info) -> str:
        s = v.strip()
        if not s:
            field_name = "First name" if info.field_name == "firstName" else "Last name"
            raise ValueError(f"{field_name} is required")
        return s

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_format(v)

    @field_validator("phoneNumber")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        if not UGANDAN_PHONE_REGEX.match(s):
            raise ValueError("Enter a valid Ugandan phone number")
        return s

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_format(v)

    @field_validator("password")
    @classmethod
    def check_password_not_empty(cls, v: str) -> str:
        if not v:
            raise ValueError("Password is required")
        return v


class RefreshTokenRequest(BaseModel):
    refreshToken: str

    @field_validator("refreshToken")
    @classmethod
    def check_token_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Refresh token is required")
        return v.strip()


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def clean_email(cls, v: str) -> str:
        return validate_email_format(v)


class ResetPasswordRequest(BaseModel):
    token: str
    newPassword: str

    @field_validator("token")
    @classmethod
    def check_token_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Reset token is required")
        return v.strip()

    @field_validator("newPassword")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)
