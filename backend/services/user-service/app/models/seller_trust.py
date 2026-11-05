import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Float, ForeignKey, Enum, JSON
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.orm import relationship
from app.core.database import Base


class SellerStanding(str, enum.Enum):
    GOOD = "GOOD"
    AT_RISK = "AT_RISK"
    SUSPENDED = "SUSPENDED"


class SellerTrustStats(Base):
    __tablename__ = "seller_trust_stats"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    totalOrders = Column(Integer, default=0, nullable=False)
    onTimeDeliveries = Column(Integer, default=0, nullable=False)
    lateDeliveries = Column(Integer, default=0, nullable=False)
    disputesOpened = Column(Integer, default=0, nullable=False)
    disputesResolvedSellerFavor = Column(Integer, default=0, nullable=False)
    disputesResolvedBuyerFavor = Column(Integer, default=0, nullable=False)
    defectReportsINAD = Column(Integer, default=0, nullable=False)
    slaBreaches = Column(Integer, default=0, nullable=False)

    lateShipments = Column(Integer, default=0, nullable=False)
    cancelledBySeller = Column(Integer, default=0, nullable=False)
    ordersAccepted = Column(Integer, default=0, nullable=False)
    claimsGranted = Column(Integer, default=0, nullable=False)
    policyViolations = Column(Integer, default=0, nullable=False)

    totalResponseHours = Column(Float, default=0.0, nullable=False)
    resolvedResponseCount = Column(Integer, default=0, nullable=False)

    isVerifiedMerchant = Column(Boolean, default=False, nullable=False)

    trustScore = Column(Float, default=70.0, nullable=False)
    badges = Column(MutableList.as_mutable(PG_ARRAY(String).with_variant(JSON, "sqlite")), default=list, nullable=False)

    standing = Column(
        Enum(SellerStanding, name="SellerStanding", create_type=False, values_callable=lambda obj: [e.value for e in obj]),
        default=SellerStanding.GOOD,
        nullable=False,
    )
    standingReason = Column(String, nullable=True)
    standingChangedAt = Column(DateTime, nullable=True)

    lastCalculatedAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    createdAt = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updatedAt = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    user = relationship("User", back_populates="sellerTrustStats")
