from typing import Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.common import ApiResponse
from app.schemas.address import AddressResponse
from app.services import address_service

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/users/{userId}/default-address", status_code=status.HTTP_200_OK, response_model=ApiResponse[Optional[AddressResponse]])
def get_default_address_for_user(userId: str, db: Session = Depends(get_db)):
    address = address_service.get_default(db, userId)
    return {"success": True, "data": address}
