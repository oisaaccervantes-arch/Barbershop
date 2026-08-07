from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.receptionist import Receptionist
from app.schemas.receptionist import ReceptionistCreate, ReceptionistRead, ReceptionistStatusUpdate, ReceptionistUpdate


router = APIRouter(prefix="/api/receptionists", tags=["receptionists"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_receptionist_or_404(receptionist_id: int, db: Session) -> Receptionist:
    receptionist = db.get(Receptionist, receptionist_id)
    if receptionist is None:
        raise HTTPException(status_code=404, detail="Recepcionista no encontrada")
    return receptionist


@router.get("", response_model=list[ReceptionistRead])
def list_receptionists(db: DatabaseSession, active: bool | None = Query(default=None)):
    statement = select(Receptionist)
    if active is not None:
        statement = statement.where(Receptionist.active == active)
    return db.scalars(statement.order_by(Receptionist.name, Receptionist.id)).all()


@router.post("", response_model=ReceptionistRead, status_code=status.HTTP_201_CREATED)
def create_receptionist(payload: ReceptionistCreate, db: DatabaseSession):
    receptionist = Receptionist(**payload.model_dump())
    db.add(receptionist)
    db.commit()
    db.refresh(receptionist)
    return receptionist


@router.put("/{receptionist_id}", response_model=ReceptionistRead)
def update_receptionist(receptionist_id: int, payload: ReceptionistUpdate, db: DatabaseSession):
    receptionist = get_receptionist_or_404(receptionist_id, db)
    for field, value in payload.model_dump().items():
        setattr(receptionist, field, value)
    db.commit()
    db.refresh(receptionist)
    return receptionist


@router.patch("/{receptionist_id}/status", response_model=ReceptionistRead)
def update_receptionist_status(receptionist_id: int, payload: ReceptionistStatusUpdate, db: DatabaseSession):
    receptionist = get_receptionist_or_404(receptionist_id, db)
    receptionist.active = payload.active
    db.commit()
    db.refresh(receptionist)
    return receptionist
