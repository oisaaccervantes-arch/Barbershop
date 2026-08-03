from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.appointment import Appointment
from app.models.barber import Barber
from app.models.customer import Customer
from app.models.service import Service
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentStatus,
    AppointmentStatusUpdate,
)


router = APIRouter(prefix="/api/appointments", tags=["appointments"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def get_appointment_or_404(appointment_id: int, db: Session) -> Appointment:
    appointment = db.scalar(
        select(Appointment)
        .options(
            joinedload(Appointment.customer),
            joinedload(Appointment.barber),
            joinedload(Appointment.service),
        )
        .where(Appointment.id == appointment_id)
    )
    if appointment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cita no encontrada",
        )
    return appointment


def serialize_appointment(appointment: Appointment) -> dict:
    return {
        "id": appointment.id,
        "customer_id": appointment.customer_id,
        "customer_name": appointment.customer.name,
        "customer_phone": appointment.customer.phone,
        "barber_id": appointment.barber_id,
        "barber_name": appointment.barber.name,
        "service_id": appointment.service_id,
        "service_name": appointment.service.name,
        "appointment_date": appointment.appointment_date,
        "appointment_time": appointment.appointment_time,
        "price": appointment.price,
        "status": appointment.status,
        "created_at": appointment.created_at,
        "updated_at": appointment.updated_at,
    }


@router.get("", response_model=list[AppointmentRead])
def list_appointments(
    db: DatabaseSession,
    appointment_status: AppointmentStatus | None = Query(
        default=None, alias="status"
    ),
):
    statement = select(Appointment).options(
        joinedload(Appointment.customer),
        joinedload(Appointment.barber),
        joinedload(Appointment.service),
    )
    if appointment_status is not None:
        statement = statement.where(Appointment.status == appointment_status.value)
    statement = statement.order_by(
        Appointment.appointment_date,
        Appointment.appointment_time,
        Appointment.id,
    )
    return [serialize_appointment(item) for item in db.scalars(statement).all()]


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: DatabaseSession):
    customer = db.get(Customer, payload.customer_id)
    barber = db.get(Barber, payload.barber_id)
    service = db.get(Service, payload.service_id)
    if customer is None or not customer.active:
        raise HTTPException(status_code=400, detail="El cliente no está activo")
    if barber is None or not barber.active:
        raise HTTPException(status_code=400, detail="El barbero no está activo")
    if service is None or not service.active:
        raise HTTPException(status_code=400, detail="El servicio no está activo")

    appointment = Appointment(
        customer_id=customer.id,
        barber_id=barber.id,
        service_id=service.id,
        appointment_date=payload.appointment_date,
        appointment_time=payload.appointment_time,
        price=service.price,
        status=AppointmentStatus.pending.value,
    )
    db.add(appointment)
    db.commit()
    return serialize_appointment(get_appointment_or_404(appointment.id, db))


@router.patch("/{appointment_id}/status", response_model=AppointmentRead)
def update_appointment_status(
    appointment_id: int,
    payload: AppointmentStatusUpdate,
    db: DatabaseSession,
):
    appointment = get_appointment_or_404(appointment_id, db)
    terminal_statuses = {
        AppointmentStatus.completed.value,
        AppointmentStatus.cancelled.value,
    }
    if appointment.status in terminal_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita ya tiene un estado final",
        )
    appointment.status = payload.status.value
    db.commit()
    db.refresh(appointment)
    return serialize_appointment(appointment)
