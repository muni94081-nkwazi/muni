import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    transactionalSms = Column(Boolean, default=True, nullable=False)
    transactionalEmail = Column(Boolean, default=True, nullable=False)
    transactionalPush = Column(Boolean, default=True, nullable=False)

    marketingSms = Column(Boolean, default=False, nullable=False)
    marketingEmail = Column(Boolean, default=True, nullable=False)
    marketingPush = Column(Boolean, default=False, nullable=False)

    whatsappOptIn = Column(Boolean, default=False, nullable=False)

    timezone = Column(String, default="Africa/Kampala", nullable=False)
    quietHoursStart = Column(Integer, nullable=True)
    quietHoursEnd = Column(Integer, nullable=True)

    locale = Column(String, default="en", nullable=False)

    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updatedAt = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="preferences")
