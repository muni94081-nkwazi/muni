from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.config import settings
from app.core.exceptions import ApiError
from app.core.security import (
    hash_password,
    verify_password,
    sign_access_token,
    sign_refresh_token,
    verify_refresh_token,
    generate_opaque_token,
    hash_opaque_token,
)
from app.models.user import User
from app.models.preference import NotificationPreference
from app.models.tokens import RefreshToken, PasswordResetToken
from app.schemas.auth import RegisterRequest, LoginRequest, RefreshTokenRequest, ForgotPasswordRequest, ResetPasswordRequest, PublicUser
from app.events.publisher import publish, TOPICS


def issue_token_pair(db: Session, user: User) -> Tuple[str, str]:
    access_token = sign_access_token(user)
    refresh_token = sign_refresh_token(user)

    token_hash = hash_opaque_token(refresh_token)
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    token_rec = RefreshToken(
        userId=user.id,
        tokenHash=token_hash,
        expiresAt=expires_at,
    )
    db.add(token_rec)
    db.commit()

    return access_token, refresh_token


async def register(db: Session, data: RegisterRequest) -> Dict[str, Any]:
    query = db.query(User).filter(
        or_(
            User.email == data.email,
            *( [User.phoneNumber == data.phoneNumber] if data.phoneNumber else [] )
        )
    )
    existing = query.first()
    if existing:
        if existing.email == data.email:
            raise ApiError.conflict("An account with this email already exists")
        raise ApiError.conflict("An account with this phone number already exists")

    pwd_hash = hash_password(data.password)

    user = User(
        firstName=data.firstName,
        lastName=data.lastName,
        email=data.email,
        phoneNumber=data.phoneNumber,
        passwordHash=pwd_hash,
    )
    db.add(user)
    db.flush()

    # Preferences created alongside user so notification-service never misses a preference row
    pref = NotificationPreference(userId=user.id)
    db.add(pref)
    db.commit()
    db.refresh(user)

    access_token, refresh_token = issue_token_pair(db, user)

    await publish(TOPICS["USER_REGISTERED"], {
        "userId": user.id,
        "email": user.email,
        "firstName": user.firstName,
        "phoneNumber": user.phoneNumber,
    })

    return {
        "user": PublicUser.model_validate(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
    }


def login(db: Session, data: LoginRequest) -> Dict[str, Any]:
    user = db.query(User).filter(User.email == data.email).first()

    if not user or not user.isActive:
        raise ApiError.unauthorized("Invalid email or password")

    if not verify_password(data.password, user.passwordHash):
        raise ApiError.unauthorized("Invalid email or password")

    access_token, refresh_token = issue_token_pair(db, user)

    return {
        "user": PublicUser.model_validate(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
    }


def refresh(db: Session, data: RefreshTokenRequest) -> Dict[str, Any]:
    try:
        payload = verify_refresh_token(data.refreshToken)
    except Exception:
        raise ApiError.unauthorized("Invalid or expired refresh token")

    token_hash = hash_opaque_token(data.refreshToken)
    stored = db.query(RefreshToken).filter(RefreshToken.tokenHash == token_hash).first()

    now = datetime.now(timezone.utc)
    if not stored or stored.revokedAt is not None:
        raise ApiError.unauthorized("Invalid or expired refresh token")

    # Handle timezone naive vs aware
    stored_exp = stored.expiresAt
    if stored_exp.tzinfo is None:
        stored_exp = stored_exp.replace(tzinfo=timezone.utc)
    if stored_exp < now:
        raise ApiError.unauthorized("Invalid or expired refresh token")

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.isActive:
        raise ApiError.unauthorized("Invalid or expired refresh token")

    # Rotate
    stored.revokedAt = now
    db.add(stored)
    db.commit()

    access_token, refresh_token = issue_token_pair(db, user)

    return {
        "user": PublicUser.model_validate(user),
        "accessToken": access_token,
        "refreshToken": refresh_token,
    }


def logout(db: Session, data: RefreshTokenRequest) -> None:
    token_hash = hash_opaque_token(data.refreshToken)
    now = datetime.now(timezone.utc)
    db.query(RefreshToken).filter(
        RefreshToken.tokenHash == token_hash,
        RefreshToken.revokedAt.is_(None),
    ).update({"revokedAt": now})
    db.commit()


async def forgot_password(db: Session, data: ForgotPasswordRequest) -> None:
    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        return

    raw, token_hash = generate_opaque_token()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_TTL_MINUTES)

    rec = PasswordResetToken(
        userId=user.id,
        tokenHash=token_hash,
        expiresAt=expires_at,
    )
    db.add(rec)
    db.commit()

    await publish(TOPICS["USER_PASSWORD_RESET_REQUESTED"], {
        "userId": user.id,
        "email": user.email,
        "phoneNumber": user.phoneNumber,
        "firstName": user.firstName,
        "resetToken": raw,
        "expiresAt": expires_at.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
    })


async def reset_password(db: Session, data: ResetPasswordRequest) -> None:
    token_hash = hash_opaque_token(data.token)
    now = datetime.now(timezone.utc)

    rec = db.query(PasswordResetToken).filter(PasswordResetToken.tokenHash == token_hash).first()
    if not rec or rec.usedAt is not None:
        raise ApiError.bad_request("This reset link is invalid or has expired")

    rec_exp = rec.expiresAt
    if rec_exp.tzinfo is None:
        rec_exp = rec_exp.replace(tzinfo=timezone.utc)
    if rec_exp < now:
        raise ApiError.bad_request("This reset link is invalid or has expired")

    new_hash = hash_password(data.newPassword)

    # In transaction: update password, mark token used, revoke active sessions
    user = db.query(User).filter(User.id == rec.userId).first()
    if user:
        user.passwordHash = new_hash
        db.add(user)

    rec.usedAt = now
    db.add(rec)

    db.query(RefreshToken).filter(
        RefreshToken.userId == rec.userId,
        RefreshToken.revokedAt.is_(None),
    ).update({"revokedAt": now})

    db.commit()

    await publish(TOPICS["USER_PASSWORD_RESET"], {"userId": rec.userId})
