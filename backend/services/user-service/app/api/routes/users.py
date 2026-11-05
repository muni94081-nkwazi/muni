from typing import Dict, Any
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.schemas.common import ApiResponse
from app.schemas.auth import PublicUser
from app.schemas.user import (
    UpdateProfileRequest,
    UpdatePreferencesRequest,
    NotificationPreferenceResponse,
    ContactProfileResponse,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", status_code=status.HTTP_200_OK, response_model=ApiResponse[PublicUser])
def get_me(user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = user_service.get_by_id(db, user["id"])
    return {"success": True, "data": profile}


@router.patch("/me", status_code=status.HTTP_200_OK, response_model=ApiResponse[PublicUser])
async def update_me(
    body: UpdateProfileRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = await user_service.update_profile(db, user["id"], body)
    return {"success": True, "data": profile}


@router.get("/me/preferences", status_code=status.HTTP_200_OK, response_model=ApiResponse[NotificationPreferenceResponse])
def get_my_preferences(user: Dict[str, Any] = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = user_service.get_preferences(db, user["id"])
    return {"success": True, "data": prefs}


@router.patch("/me/preferences", status_code=status.HTTP_200_OK, response_model=ApiResponse[NotificationPreferenceResponse])
def update_my_preferences(
    body: UpdatePreferencesRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    prefs = user_service.update_preferences(db, user["id"], body)
    return {"success": True, "data": prefs}


@router.get("/{userId}/contact-profile", status_code=status.HTTP_200_OK, response_model=ApiResponse[ContactProfileResponse])
def get_contact_profile(userId: str, db: Session = Depends(get_db)):
    profile = user_service.get_contact_profile(db, userId)
    return {"success": True, "data": profile}
