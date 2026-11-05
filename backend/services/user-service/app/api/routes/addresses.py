from typing import List, Dict, Any
from fastapi import APIRouter, Depends, status, Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.api.deps import get_current_user
from app.schemas.common import ApiResponse
from app.schemas.address import (
    AddressCreateRequest,
    AddressUpdateRequest,
    AddressResponse,
)
from app.services import address_service

router = APIRouter(prefix="/addresses", tags=["addresses"])


@router.get("", status_code=status.HTTP_200_OK, response_model=ApiResponse[List[AddressResponse]])
@router.get("/", status_code=status.HTTP_200_OK, response_model=ApiResponse[List[AddressResponse]], include_in_schema=False)
def list_addresses(
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    addresses = address_service.list_addresses(db, user["id"])
    return {"success": True, "data": addresses}


@router.post("", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[AddressResponse])
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ApiResponse[AddressResponse], include_in_schema=False)
async def create_address(
    body: AddressCreateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    address = await address_service.create(db, user["id"], body)
    return {"success": True, "data": address}


@router.get("/{id}", status_code=status.HTTP_200_OK, response_model=ApiResponse[AddressResponse])
def get_address_by_id(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    address = address_service.get_by_id_response(db, user["id"], id)
    return {"success": True, "data": address}


@router.patch("/{id}", status_code=status.HTTP_200_OK, response_model=ApiResponse[AddressResponse])
async def update_address(
    id: str,
    body: AddressUpdateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    address = await address_service.update(db, user["id"], id, body)
    return {"success": True, "data": address}


@router.post("/{id}/default", status_code=status.HTTP_200_OK, response_model=ApiResponse[AddressResponse])
def set_default_address(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    address = address_service.set_default(db, user["id"], id)
    return {"success": True, "data": address}


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_address(
    id: str,
    user: Dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    await address_service.remove(db, user["id"], id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
