from typing import Dict, Any
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import ApiError
from app.api.deps import get_current_user, require_role, authorize_trust_event
from app.schemas.common import ApiResponse
from app.schemas.seller_trust import (
    TrustProfile,
    ScorecardResponseData,
    TrustEventRequest,
    TrustScoreResponseData,
    SetVerifiedMerchantRequest,
    UpdateStandingRequest,
    StandingResponseData,
)
from app.services import seller_trust_service

router = APIRouter(prefix="/sellers", tags=["sellers"])


@router.get("/{sellerId}/trust-score", status_code=status.HTTP_200_OK, response_model=ApiResponse[TrustProfile])
def get_trust_profile(sellerId: str, db: Session = Depends(get_db)):
    profile = seller_trust_service.get_trust_profile(db, sellerId)
    return {"success": True, "data": profile}


@router.get("/{sellerId}/scorecard", status_code=status.HTTP_200_OK, response_model=ApiResponse[ScorecardResponseData])
def get_scorecard(
    sellerId: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    is_owner = user.get("id") == sellerId
    is_admin = user.get("role") == "ADMIN"

    if not is_owner and not is_admin:
        raise ApiError.forbidden("You can only view your own scorecard")

    profile = seller_trust_service.get_trust_profile(db, sellerId)
    scorecard_data = ScorecardResponseData(
        sellerId=profile.sellerId,
        scorecard=profile.scorecard,
        standing=profile.standing,
        standingReason=profile.standingReason,
        recommendedStanding=profile.recommendedStanding,
        lastCalculatedAt=profile.lastCalculatedAt,
    )
    return {"success": True, "data": scorecard_data}


@router.post("/{sellerId}/trust-events", status_code=status.HTTP_200_OK, response_model=ApiResponse[TrustScoreResponseData])
def record_trust_event(
    sellerId: str,
    body: TrustEventRequest,
    _actor: Dict[str, Any] = Depends(authorize_trust_event),
    db: Session = Depends(get_db),
):
    stats = seller_trust_service.record_event(db, sellerId, body)
    return {
        "success": True,
        "data": {
            "userId": stats.userId,
            "trustScore": stats.trustScore,
            "badges": stats.badges,
        },
    }


@router.patch("/{sellerId}/verify", status_code=status.HTTP_200_OK, response_model=ApiResponse[TrustScoreResponseData])
def set_verified_merchant(
    sellerId: str,
    body: SetVerifiedMerchantRequest,
    _admin: Dict[str, Any] = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    stats = seller_trust_service.set_verified_merchant(db, sellerId, body.isVerified)
    return {
        "success": True,
        "data": {
            "userId": stats.userId,
            "trustScore": stats.trustScore,
            "badges": stats.badges,
        },
    }


@router.patch("/{sellerId}/standing", status_code=status.HTTP_200_OK, response_model=ApiResponse[StandingResponseData])
async def update_standing(
    sellerId: str,
    body: UpdateStandingRequest,
    _admin: Dict[str, Any] = Depends(require_role("ADMIN")),
    db: Session = Depends(get_db),
):
    stats = await seller_trust_service.apply_standing(db, sellerId, body.standing, body.reason)
    return {
        "success": True,
        "data": {
            "userId": stats.userId,
            "standing": stats.standing,
            "standingReason": stats.standingReason,
            "standingChangedAt": stats.standingChangedAt,
        },
    }
