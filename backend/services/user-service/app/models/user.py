import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


class Role(str, enum.Enum):
    CUSTOMER = "CUSTOMER"
    SELLER = "SELLER"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    firstName = Column(String, nullable=False)
    lastName = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    phoneNumber = Column(String, unique=True, nullable=True, index=True)
    passwordHash = Column(String, nullable=False)
    role = Column(
        Enum(Role, name="Role", create_type=False, values_callable=lambda obj: [e.value for e in obj]),
        default=Role.CUSTOMER,
        nullable=False,
    )
    isActive = Column(Boolean, default=True, nullable=False)
    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updatedAt = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    addresses = relationship("Address", back_populates="user", cascade="all, delete-orphan")
    preferences = relationship("NotificationPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")
    sellerTrustStats = relationship("SellerTrustStats", back_populates="user", uselist=False, cascade="all, delete-orphan")
    passwordResetTokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    refreshTokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
