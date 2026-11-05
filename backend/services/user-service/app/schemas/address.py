import re
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, model_validator, field_validator
from app.models.address import AddressType

CONTACT_PHONE_REGEX = re.compile(r"^\+?\d{7,15}$")


class AddressCreateRequest(BaseModel):
    type: Optional[AddressType] = AddressType.HOME
    contactName: str = Field(min_length=1, max_length=120)
    contactPhone: str = Field(max_length=50)
    country: str = Field(default="UG", min_length=2, max_length=2)
    region: str = Field(min_length=1, max_length=120)
    district: str = Field(min_length=1, max_length=120)
    ward: Optional[str] = Field(default=None, max_length=120)
    addressLine: str = Field(min_length=1, max_length=300)
    landmark: Optional[str] = Field(default=None, max_length=200)
    postalCode: Optional[str] = Field(default=None, max_length=20)
    pickupStationId: Optional[str] = Field(default=None, max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    isDefault: Optional[bool] = False

    @field_validator("contactName", "region", "district", "addressLine")
    @classmethod
    def check_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("Field cannot be empty")
        return s

    @field_validator("contactPhone")
    @classmethod
    def check_contact_phone(cls, v: str) -> str:
        s = v.strip()
        if not CONTACT_PHONE_REGEX.match(s):
            raise ValueError("Enter a valid phone number for the recipient")
        return s

    @field_validator("country")
    @classmethod
    def clean_country(cls, v: str) -> str:
        return v.strip().upper()

    @model_validator(mode="after")
    def check_pickup_station(self) -> "AddressCreateRequest":
        if self.type == AddressType.PICKUP_STATION and not self.pickupStationId:
            raise ValueError("pickupStationId is required when type is PICKUP_STATION")
        return self


class AddressUpdateRequest(BaseModel):
    type: Optional[AddressType] = None
    contactName: Optional[str] = Field(default=None, min_length=1, max_length=120)
    contactPhone: Optional[str] = Field(default=None, max_length=50)
    country: Optional[str] = Field(default=None, min_length=2, max_length=2)
    region: Optional[str] = Field(default=None, min_length=1, max_length=120)
    district: Optional[str] = Field(default=None, min_length=1, max_length=120)
    ward: Optional[str] = Field(default=None, max_length=120)
    addressLine: Optional[str] = Field(default=None, min_length=1, max_length=300)
    landmark: Optional[str] = Field(default=None, max_length=200)
    postalCode: Optional[str] = Field(default=None, max_length=20)
    pickupStationId: Optional[str] = Field(default=None, max_length=64)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    isDefault: Optional[bool] = None

    @field_validator("contactPhone")
    @classmethod
    def check_contact_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            s = v.strip()
            if not CONTACT_PHONE_REGEX.match(s):
                raise ValueError("Enter a valid phone number for the recipient")
            return s
        return v

    @field_validator("country")
    @classmethod
    def clean_country(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return v.strip().upper()
        return v

    @model_validator(mode="after")
    def check_at_least_one(self) -> "AddressUpdateRequest":
        dumped = self.model_dump(exclude_unset=True)
        if not dumped:
            raise ValueError("Provide at least one field to update")
        return self


class AddressResponse(BaseModel):
    id: str
    userId: str
    type: AddressType
    contactName: str
    contactPhone: str
    country: str
    region: str
    district: str
    ward: Optional[str] = None
    addressLine: str
    landmark: Optional[str] = None
    postalCode: Optional[str] = None
    pickupStationId: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    isDefault: bool
    deletedAt: Optional[datetime] = None
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
