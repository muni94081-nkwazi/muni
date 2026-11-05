import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey, Enum, Index
from sqlalchemy.orm import relationship
from app.core.database import Base


class AddressType(str, enum.Enum):
    HOME = "HOME"
    WORK = "WORK"
    PICKUP_STATION = "PICKUP_STATION"


class Address(Base):
    __tablename__ = "addresses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(
        Enum(AddressType, name="AddressType", create_type=False, values_callable=lambda obj: [e.value for e in obj]),
        default=AddressType.HOME,
        nullable=False,
    )
    contactName = Column(String, nullable=False)
    contactPhone = Column(String, nullable=False)
    country = Column(String, default="UG", nullable=False)
    region = Column(String, nullable=False)
    district = Column(String, nullable=False)
    ward = Column(String, nullable=True)
    addressLine = Column(String, nullable=False)
    landmark = Column(String, nullable=True)
    postalCode = Column(String, nullable=True)
    pickupStationId = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    isDefault = Column(Boolean, default=False, nullable=False)
    deletedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updatedAt = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="addresses")

    __table_args__ = (
        Index("idx_addresses_user_deleted", "userId", "deletedAt"),
    )
