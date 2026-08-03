from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.customer import Customer
from app.schemas.customer import (
    CustomerCreate,
    CustomerRead,
    CustomerStatusUpdate,
    CustomerUpdate,
)


router = APIRouter(prefix="/api/customers", tags=["customers"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_customer_or_404(customer_id: int, db: Session) -> Customer:
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cliente no encontrado",
        )
    return customer


@router.get("", response_model=list[CustomerRead])
def list_customers(
    db: DatabaseSession,
    active: bool | None = Query(default=None),
    search: str | None = Query(default=None, max_length=120),
):
    statement = select(Customer)
    if active is not None:
        statement = statement.where(Customer.active == active)
    if search and search.strip():
        pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(Customer.name.ilike(pattern), Customer.phone.ilike(pattern))
        )
    return db.scalars(statement.order_by(Customer.name, Customer.id)).all()


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: DatabaseSession):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un cliente con ese teléfono",
        ) from exc
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=CustomerRead)
def update_customer(customer_id: int, payload: CustomerUpdate, db: DatabaseSession):
    customer = get_customer_or_404(customer_id, db)
    for field, value in payload.model_dump().items():
        setattr(customer, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe un cliente con ese teléfono",
        ) from exc
    db.refresh(customer)
    return customer


@router.patch("/{customer_id}/status", response_model=CustomerRead)
def update_customer_status(
    customer_id: int,
    payload: CustomerStatusUpdate,
    db: DatabaseSession,
):
    customer = get_customer_or_404(customer_id, db)
    customer.active = payload.active
    db.commit()
    db.refresh(customer)
    return customer
