from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.core.exceptions import ApiError
from app.models.user import User
from app.models.preference import NotificationPreference
from app.schemas.auth import PublicUser
from app.schemas.user import UpdateProfileRequest, UpdatePreferencesRequest, NotificationPreferenceResponse, ContactProfileResponse
from app.events.publisher import publish, TOPICS


def get_by_id(db: Session, user_id: str) -> PublicUser:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApiError.not_found("User not found")
    return PublicUser.model_validate(user)


async def update_profile(db: Session, user_id: str, updates: UpdateProfileRequest) -> PublicUser:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApiError.not_found("User not found")

    dumped = updates.model_dump(exclude_unset=True)

    if updates.phoneNumber:
        existing = db.query(User).filter(
            User.phoneNumber == updates.phoneNumber,
            User.id != user_id,
        ).first()
        if existing:
            raise ApiError.conflict("An account with this phone number already exists")

    for k, v in dumped.items():
        setattr(user, k, v)

    db.add(user)
    db.commit()
    db.refresh(user)

    await publish(TOPICS["USER_PROFILE_UPDATED"], {
        "userId": user.id,
        "updates": dumped,
    })

    return PublicUser.model_validate(user)


def get_preferences(db: Session, user_id: str) -> NotificationPreferenceResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApiError.not_found("User not found")

    pref = db.query(NotificationPreference).filter(NotificationPreference.userId == user_id).first()
    if not pref:
        pref = NotificationPreference(userId=user_id)
        db.add(pref)
        db.commit()
        db.refresh(pref)

    return NotificationPreferenceResponse.model_validate(pref)


def update_preferences(db: Session, user_id: str, updates: UpdatePreferencesRequest) -> NotificationPreferenceResponse:
    get_preferences(db, user_id)  # ensures row exists

    pref = db.query(NotificationPreference).filter(NotificationPreference.userId == user_id).first()
    dumped = updates.model_dump(exclude_unset=True)

    for k, v in dumped.items():
        setattr(pref, k, v)

    db.add(pref)
    db.commit()
    db.refresh(pref)

    return NotificationPreferenceResponse.model_validate(pref)


def get_contact_profile(db: Session, user_id: str) -> ContactProfileResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ApiError.not_found("User not found")

    pref = get_preferences(db, user_id)

    return ContactProfileResponse(
        userId=user.id,
        email=user.email,
        phoneNumber=user.phoneNumber,
        firstName=user.firstName,
        lastName=user.lastName,
        isActive=user.isActive,
        preferences=pref,
    )
