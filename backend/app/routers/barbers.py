from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.barber import Barber
from app.schemas.barber import (
    BarberCreate,
    BarberRead,
    BarberStatusUpdate,
    BarberUpdate,
)


router = APIRouter(prefix="/api/barbers", tags=["barbers"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_barber_or_404(barber_id: int, db: Session) -> Barber:
    barber = db.get(Barber, barber_id)
    if barber is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Barbero no encontrado",
        )
    return barber


@router.get("", response_model=list[BarberRead])
def list_barbers(
    db: DatabaseSession,
    active: bool | None = Query(default=None),
):
    statement = select(Barber)
    if active is not None:
        statement = statement.where(Barber.active == active)
    return db.scalars(statement.order_by(Barber.name, Barber.id)).all()


@router.post("", response_model=BarberRead, status_code=status.HTTP_201_CREATED)
def create_barber(payload: BarberCreate, db: DatabaseSession):
    barber = Barber(**payload.model_dump())
    db.add(barber)
    db.commit()
    db.refresh(barber)
    return barber


@router.put("/{barber_id}", response_model=BarberRead)
def update_barber(barber_id: int, payload: BarberUpdate, db: DatabaseSession):
    barber = get_barber_or_404(barber_id, db)
    for field, value in payload.model_dump().items():
        setattr(barber, field, value)
    db.commit()
    db.refresh(barber)
    return barber


@router.patch("/{barber_id}/status", response_model=BarberRead)
def update_barber_status(
    barber_id: int,
    payload: BarberStatusUpdate,
    db: DatabaseSession,
):
    barber = get_barber_or_404(barber_id, db)
    barber.active = payload.active
    db.commit()
    db.refresh(barber)
    return barber
