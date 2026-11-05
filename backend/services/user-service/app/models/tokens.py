import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.core.database import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tokenHash = Column(String, unique=True, nullable=False, index=True)
    expiresAt = Column(DateTime, nullable=False)
    usedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="passwordResetTokens")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tokenHash = Column(String, unique=True, nullable=False, index=True)
    expiresAt = Column(DateTime, nullable=False)
    revokedAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = relationship("User", back_populates="refreshTokens")
