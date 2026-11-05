import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator, field_validator
from app.schemas.auth import UGANDAN_PHONE_REGEX


class UpdateProfileRequest(BaseModel):
    firstName: Optional[str] = None
    lastName: Optional[str] = None
    phoneNumber: Optional[str] = None

    @field_validator("firstName", "lastName")
    @classmethod
    def clean_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if not s:
                raise ValueError("Must not be empty")
            return s
        return v

    @field_validator("phoneNumber")
    @classmethod
    def check_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if not UGANDAN_PHONE_REGEX.match(s):
                raise ValueError("Enter a valid Ugandan phone number")
            return s
        return v

    @model_validator(mode="after")
    def check_at_least_one(self) -> "UpdateProfileRequest":
        dumped = self.model_dump(exclude_unset=True)
        if not dumped:
            raise ValueError("Provide at least one field to update")
        return self


class UpdatePreferencesRequest(BaseModel):
    transactionalSms: Optional[bool] = None
    transactionalEmail: Optional[bool] = None
    transactionalPush: Optional[bool] = None
    marketingSms: Optional[bool] = None
    marketingEmail: Optional[bool] = None
    marketingPush: Optional[bool] = None
    whatsappOptIn: Optional[bool] = None
    timezone: Optional[str] = None
    quietHoursStart: Optional[int] = Field(default=None, ge=0, le=23)
    quietHoursEnd: Optional[int] = Field(default=None, ge=0, le=23)
    locale: Optional[str] = None

    @field_validator("timezone")
    @classmethod
    def clean_timezone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Timezone must not be empty")
        return v.strip() if v else v

    @field_validator("locale")
    @classmethod
    def clean_locale(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if len(s) < 2 or len(s) > 10:
                raise ValueError("Locale must be between 2 and 10 characters")
            return s
        return v

    @model_validator(mode="after")
    def validate_rules(self) -> "UpdatePreferencesRequest":
        dumped = self.model_dump(exclude_unset=True)
        if not dumped:
            raise ValueError("Provide at least one field to update")

        if "quietHoursStart" in dumped or "quietHoursEnd" in dumped:
            start_is_none = self.quietHoursStart is None
            end_is_none = self.quietHoursEnd is None
            if start_is_none != end_is_none:
                raise ValueError("Set both quietHoursStart and quietHoursEnd, or neither")
        return self


class NotificationPreferenceResponse(BaseModel):
    id: str
    userId: str
    transactionalSms: bool
    transactionalEmail: bool
    transactionalPush: bool
    marketingSms: bool
    marketingEmail: bool
    marketingPush: bool
    whatsappOptIn: bool
    timezone: str
    quietHoursStart: Optional[int] = None
    quietHoursEnd: Optional[int] = None
    locale: str
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class ContactProfileResponse(BaseModel):
    userId: str
    email: str
    phoneNumber: Optional[str] = None
    firstName: str
    lastName: str
    isActive: bool
    preferences: NotificationPreferenceResponse
