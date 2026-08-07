from datetime import datetime, timedelta
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.appointment import Appointment
from app.models.barber import Barber
from app.models.customer import Customer
from app.models.cash_shift import CashShift, ShiftBarber
from app.models.service import Service
from app.schemas.appointment import (
    AppointmentCreate,
    AppointmentRead,
    AppointmentStatus,
    AppointmentStatusUpdate,
    AppointmentUpdate,
)


router = APIRouter(prefix="/api/appointments", tags=["appointments"])
DatabaseSession = Annotated[Session, Depends(get_db)]
APPOINTMENT_DURATION_MINUTES = 15


def ensure_barber_is_available_for_open_shift(
    db: Session, barber_id: int, appointment_date
) -> None:
    shift = db.scalar(
        select(CashShift).where(
            CashShift.status == "OPEN",
            CashShift.business_date == appointment_date,
        ).limit(1)
    )
    if shift is None:
        return
    assigned = db.scalar(
        select(ShiftBarber.id).where(
            ShiftBarber.shift_id == shift.id,
            ShiftBarber.barber_id == barber_id,
        ).limit(1)
    )
    if assigned is None:
        raise HTTPException(
            status_code=400,
            detail="El barbero no está registrado en el turno de esa fecha",
        )


def has_schedule_conflict(
    db: Session,
    barber_id: int,
    appointment_date,
    appointment_time,
    exclude_appointment_id: int | None = None,
) -> bool:
    statement = select(Appointment).where(
        Appointment.barber_id == barber_id,
        Appointment.appointment_date == appointment_date,
        Appointment.status.in_([
            AppointmentStatus.pending.value,
            AppointmentStatus.confirmed.value,
        ]),
    )
    if exclude_appointment_id is not None:
        statement = statement.where(Appointment.id != exclude_appointment_id)
    requested_start = datetime.combine(appointment_date, appointment_time)
    requested_end = requested_start + timedelta(minutes=APPOINTMENT_DURATION_MINUTES)
    return any(
        requested_start < datetime.combine(item.appointment_date, item.appointment_time)
        + timedelta(minutes=APPOINTMENT_DURATION_MINUTES)
        and requested_end > datetime.combine(item.appointment_date, item.appointment_time)
        for item in db.scalars(statement).all()
    )


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


def appointment_service_ids(appointment: Appointment) -> list[int]:
    return list(appointment.service_ids or ([appointment.service_id] if appointment.service_id else []))


def get_active_services(db: Session, service_ids: list[int]) -> list[Service]:
    unique_ids = list(dict.fromkeys(service_ids))
    if not unique_ids:
        return []
    services = db.scalars(select(Service).where(Service.id.in_(unique_ids))).all()
    by_id = {service.id: service for service in services}
    ordered = [by_id[service_id] for service_id in unique_ids if service_id in by_id]
    if len(ordered) != len(unique_ids) or any(not service.active for service in ordered):
        raise HTTPException(status_code=400, detail="Uno de los servicios no está activo")
    return ordered


def serialize_appointment(appointment: Appointment, db: Session) -> dict:
    service_ids = appointment_service_ids(appointment)
    services = db.scalars(select(Service).where(Service.id.in_(service_ids))).all() if service_ids else []
    by_id = {service.id: service for service in services}
    ordered_services = [by_id[service_id] for service_id in service_ids if service_id in by_id]
    return {
        "id": appointment.id,
        "customer_id": appointment.customer_id,
        "customer_name": appointment.customer.name,
        "customer_phone": appointment.customer.phone,
        "customer_birth_date": appointment.customer.birth_date,
        "barber_id": appointment.barber_id,
        "barber_name": appointment.barber.name if appointment.barber else None,
        "service_id": appointment.service_id,
        "service_name": appointment.service.name if appointment.service else None,
        "service_ids": service_ids,
        "service_names": [service.name for service in ordered_services],
        "appointment_date": appointment.appointment_date,
        "appointment_time": appointment.appointment_time,
        "price": appointment.price,
        "status": appointment.status,
        "cancellation_note": appointment.cancellation_note,
        "cancelled_at": appointment.cancelled_at,
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
    return [serialize_appointment(item, db) for item in db.scalars(statement).all()]


@router.post("", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
def create_appointment(payload: AppointmentCreate, db: DatabaseSession):
    customer = db.get(Customer, payload.customer_id)
    barber = db.get(Barber, payload.barber_id) if payload.barber_id else None
    selected_service_ids = payload.service_ids or ([payload.service_id] if payload.service_id else [])
    services = get_active_services(db, selected_service_ids)
    service = services[0] if services else None
    if customer is None or not customer.active:
        raise HTTPException(status_code=400, detail="El cliente no está activo")
    if payload.barber_id and (barber is None or not barber.active):
        raise HTTPException(status_code=400, detail="El barbero no está activo")
    if payload.service_id and (service is None or not service.active):
        raise HTTPException(status_code=400, detail="El servicio no está activo")
    if barber:
        ensure_barber_is_available_for_open_shift(
            db, barber.id, payload.appointment_date
        )

    if barber and has_schedule_conflict(
        db, barber.id, payload.appointment_date, payload.appointment_time
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="El barbero ya tiene una cita dentro de ese lapso de 15 minutos",
        )

    appointment = Appointment(
        customer_id=customer.id,
        barber_id=barber.id if barber else None,
        service_id=service.id if service else None,
        service_ids=[item.id for item in services] or None,
        appointment_date=payload.appointment_date,
        appointment_time=payload.appointment_time,
        price=sum((item.price for item in services), start=0) if services else None,
        status=AppointmentStatus.pending.value,
    )
    db.add(appointment)
    db.commit()
    return serialize_appointment(get_appointment_or_404(appointment.id, db), db)


@router.put("/{appointment_id}", response_model=AppointmentRead)
def update_appointment(
    appointment_id: int,
    payload: AppointmentUpdate,
    db: DatabaseSession,
):
    appointment = get_appointment_or_404(appointment_id, db)
    if appointment.status not in {
        AppointmentStatus.pending.value,
        AppointmentStatus.confirmed.value,
    }:
        raise HTTPException(status_code=409, detail="Solo se pueden editar citas activas")
    selected_service_ids = payload.service_ids or ([payload.service_id] if payload.service_id else [])
    services = get_active_services(db, selected_service_ids)
    service = services[0] if services else None
    if payload.service_id and (service is None or not service.active):
        raise HTTPException(status_code=400, detail="El servicio no está activo")
    barber = db.get(Barber, payload.barber_id) if payload.barber_id else None
    if payload.barber_id and (barber is None or not barber.active):
        raise HTTPException(status_code=400, detail="El barbero no está activo")
    if appointment.status == AppointmentStatus.confirmed.value and not barber:
        raise HTTPException(status_code=400, detail="Una cita confirmada debe tener barbero")
    if appointment.status == AppointmentStatus.confirmed.value and not service:
        raise HTTPException(status_code=400, detail="Una cita confirmada debe tener servicio")
    if barber:
        ensure_barber_is_available_for_open_shift(
            db, barber.id, payload.appointment_date
        )
    if barber and has_schedule_conflict(
        db,
        barber.id,
        payload.appointment_date,
        payload.appointment_time,
        exclude_appointment_id=appointment.id,
    ):
        raise HTTPException(
            status_code=409,
            detail="El barbero ya tiene una cita dentro de ese lapso de 15 minutos",
        )
    appointment.service_id = service.id if service else None
    appointment.service_ids = [item.id for item in services] or None
    appointment.barber_id = barber.id if barber else None
    appointment.appointment_date = payload.appointment_date
    appointment.appointment_time = payload.appointment_time
    appointment.price = sum((item.price for item in services), start=0) if services else None
    db.commit()
    return serialize_appointment(get_appointment_or_404(appointment.id, db), db)


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
    if payload.status == AppointmentStatus.confirmed:
        barber_id = payload.barber_id or appointment.barber_id
        barber = db.get(Barber, barber_id) if barber_id else None
        if barber is None or not barber.active:
            raise HTTPException(
                status_code=400,
                detail="Selecciona un barbero activo para confirmar la cita",
            )
        ensure_barber_is_available_for_open_shift(
            db, barber.id, appointment.appointment_date
        )
        if has_schedule_conflict(
            db,
            barber.id,
            appointment.appointment_date,
            appointment.appointment_time,
            exclude_appointment_id=appointment.id,
        ):
            raise HTTPException(
                status_code=409,
                detail="El barbero ya tiene una cita dentro de ese lapso de 15 minutos",
            )
        appointment.barber_id = barber.id
        selected_service_ids = payload.service_ids or appointment_service_ids(appointment)
        services = get_active_services(db, selected_service_ids)
        if not services:
            raise HTTPException(
                status_code=400,
                detail="Selecciona un servicio activo para confirmar la cita",
            )
        appointment.service_id = services[0].id
        appointment.service_ids = [service.id for service in services]
        appointment.price = sum((service.price for service in services), start=0)
    if payload.status == AppointmentStatus.cancelled:
        cancellation_note = " ".join((payload.cancellation_note or "").split())
        if not cancellation_note:
            raise HTTPException(
                status_code=400,
                detail="Es necesario escribir el motivo de la cancelación",
            )
        appointment.cancellation_note = cancellation_note
        appointment.cancelled_at = datetime.now(ZoneInfo("America/Hermosillo"))
    appointment.status = payload.status.value
    db.commit()
    db.refresh(appointment)
    return serialize_appointment(appointment, db)
