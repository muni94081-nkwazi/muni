from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ApiError
from app.models.address import Address
from app.schemas.address import AddressCreateRequest, AddressUpdateRequest, AddressResponse
from app.events.publisher import publish, TOPICS


def list_addresses(db: Session, user_id: str) -> List[AddressResponse]:
    addresses = (
        db.query(Address)
        .filter(Address.userId == user_id, Address.deletedAt.is_(None))
        .order_by(Address.isDefault.desc(), Address.updatedAt.desc())
        .all()
    )
    return [AddressResponse.model_validate(a) for a in addresses]


def get_by_id(db: Session, user_id: str, address_id: str) -> Address:
    address = (
        db.query(Address)
        .filter(
            Address.id == address_id,
            Address.userId == user_id,
            Address.deletedAt.is_(None),
        )
        .first()
    )
    if not address:
        raise ApiError.not_found("Address not found")
    return address


def get_by_id_response(db: Session, user_id: str, address_id: str) -> AddressResponse:
    return AddressResponse.model_validate(get_by_id(db, user_id, address_id))


async def create(db: Session, user_id: str, input_data: AddressCreateRequest) -> AddressResponse:
    existing_count = (
        db.query(Address)
        .filter(Address.userId == user_id, Address.deletedAt.is_(None))
        .count()
    )

    if existing_count >= settings.MAX_ADDRESSES_PER_USER:
        raise ApiError.bad_request(
            f"You can save at most {settings.MAX_ADDRESSES_PER_USER} addresses. Delete one before adding another."
        )

    # Invariant: first address is always default
    should_be_default = bool(input_data.isDefault) or (existing_count == 0)

    if should_be_default:
        db.query(Address).filter(
            Address.userId == user_id,
            Address.deletedAt.is_(None),
            Address.isDefault.is_(True),
        ).update({"isDefault": False})

    dumped = input_data.model_dump()
    dumped["userId"] = user_id
    dumped["isDefault"] = should_be_default

    address = Address(**dumped)
    db.add(address)
    db.commit()
    db.refresh(address)

    await publish(TOPICS["USER_ADDRESS_CHANGED"], {
        "userId": user_id,
        "addressId": address.id,
        "action": "created",
    })

    return AddressResponse.model_validate(address)


async def update(
    db: Session,
    user_id: str,
    address_id: str,
    updates: AddressUpdateRequest,
) -> AddressResponse:
    address = get_by_id(db, user_id, address_id)
    dumped = updates.model_dump(exclude_unset=True)

    if updates.isDefault is True:
        db.query(Address).filter(
            Address.userId == user_id,
            Address.deletedAt.is_(None),
            Address.isDefault.is_(True),
            Address.id != address_id,
        ).update({"isDefault": False})

    for k, v in dumped.items():
        setattr(address, k, v)

    db.add(address)
    db.commit()
    db.refresh(address)

    await publish(TOPICS["USER_ADDRESS_CHANGED"], {
        "userId": user_id,
        "addressId": address_id,
        "action": "updated",
    })

    return AddressResponse.model_validate(address)


def set_default(db: Session, user_id: str, address_id: str) -> AddressResponse:
    address = get_by_id(db, user_id, address_id)

    db.query(Address).filter(
        Address.userId == user_id,
        Address.deletedAt.is_(None),
        Address.isDefault.is_(True),
        Address.id != address_id,
    ).update({"isDefault": False})

    address.isDefault = True
    db.add(address)
    db.commit()
    db.refresh(address)

    return AddressResponse.model_validate(address)


async def remove(db: Session, user_id: str, address_id: str) -> None:
    address = get_by_id(db, user_id, address_id)
    now = datetime.now(timezone.utc)

    was_default = address.isDefault
    address.deletedAt = now
    address.isDefault = False
    db.add(address)

    if was_default:
        next_survivor = (
            db.query(Address)
            .filter(
                Address.userId == user_id,
                Address.deletedAt.is_(None),
                Address.id != address_id,
            )
            .order_by(Address.updatedAt.desc())
            .first()
        )
        if next_survivor:
            next_survivor.isDefault = True
            db.add(next_survivor)

    db.commit()

    await publish(TOPICS["USER_ADDRESS_CHANGED"], {
        "userId": user_id,
        "addressId": address_id,
        "action": "deleted",
    })


def get_default(db: Session, user_id: str) -> Optional[AddressResponse]:
    address = (
        db.query(Address)
        .filter(
            Address.userId == user_id,
            Address.deletedAt.is_(None),
            Address.isDefault.is_(True),
        )
        .first()
    )
    if not address:
        return None
    return AddressResponse.model_validate(address)
