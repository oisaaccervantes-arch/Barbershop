from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.service import Service
from app.schemas.service import (
    ServiceCreate,
    ServiceRead,
    ServiceStatusUpdate,
    ServiceUpdate,
)


router = APIRouter(prefix="/api/services", tags=["services"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_service_or_404(service_id: int, db: Session) -> Service:
    service = db.get(Service, service_id)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Servicio no encontrado",
        )
    return service


@router.get("", response_model=list[ServiceRead])
def list_services(
    db: DatabaseSession,
    active: bool | None = Query(default=None),
):
    statement = select(Service)
    if active is not None:
        statement = statement.where(Service.active == active)
    statement = statement.order_by(Service.display_order, Service.id)
    return db.scalars(statement).all()


@router.post("", response_model=ServiceRead, status_code=status.HTTP_201_CREATED)
def create_service(payload: ServiceCreate, db: DatabaseSession):
    service = Service(**payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceRead)
def update_service(service_id: int, payload: ServiceUpdate, db: DatabaseSession):
    service = get_service_or_404(service_id, db)
    for field, value in payload.model_dump().items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/{service_id}/status", response_model=ServiceRead)
def update_service_status(
    service_id: int,
    payload: ServiceStatusUpdate,
    db: DatabaseSession,
):
    service = get_service_or_404(service_id, db)
    service.active = payload.active
    db.commit()
    db.refresh(service)
    return service
