from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.common import ApiResponse, MessageResponse
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthResponseData,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[AuthResponseData])
async def register(body: RegisterRequest, db: Session = Depends(get_db)):
    result = await auth_service.register(db, body)
    return {"success": True, "data": result}


@router.post("/login", status_code=status.HTTP_200_OK, response_model=ApiResponse[AuthResponseData])
def login(body: LoginRequest, db: Session = Depends(get_db)):
    result = auth_service.login(db, body)
    return {"success": True, "data": result}


@router.post("/refresh", status_code=status.HTTP_200_OK, response_model=ApiResponse[AuthResponseData])
def refresh(body: RefreshTokenRequest, db: Session = Depends(get_db)):
    result = auth_service.refresh(db, body)
    return {"success": True, "data": result}


@router.post("/logout", status_code=status.HTTP_200_OK, response_model=MessageResponse)
def logout(body: RefreshTokenRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, body)
    return {"success": True, "message": "Logged out"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK, response_model=MessageResponse)
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    await auth_service.forgot_password(db, body)
    return {
        "success": True,
        "message": "If an account exists for this email, password reset instructions have been sent.",
    }


@router.post("/reset-password", status_code=status.HTTP_200_OK, response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    await auth_service.reset_password(db, body)
    return {"success": True, "message": "Password has been reset"}
