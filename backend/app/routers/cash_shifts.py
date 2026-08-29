from datetime import datetime, timedelta
from pathlib import Path
from typing import Annotated
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.config import get_settings
from app.models.barber import Barber
from app.models.cash_shift import CashShift, ShiftBarber, ShiftExpense
from app.models.sale import Sale
from app.models.receptionist import Receptionist
from app.models.attendance import AttendanceRecord, WorkSchedule
from app.schemas.cash_shift import CashShiftClose, CashShiftCreate, CashShiftRead, ShiftExpenseCreate, ShiftExpenseRead


router = APIRouter(prefix="/api/shifts", tags=["shifts"])
DatabaseSession = Annotated[Session, Depends(get_db)]
LOCAL_ZONE = ZoneInfo("America/Hermosillo")
MAX_RECEIPT_NUMBER = 10_000
EVIDENCE_DIR = get_settings().evidence_path
MAX_EVIDENCE_BYTES = 8 * 1024 * 1024
ALLOWED_EVIDENCE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def next_global_receipt_number(db: Session) -> int | None:
    last_number = db.scalar(
        select(Sale.receipt_number)
        .where(Sale.receipt_number.is_not(None))
        .order_by(Sale.sold_at.desc(), Sale.id.desc())
        .limit(1)
    )
    if last_number is None:
        return None
    return 0 if last_number >= MAX_RECEIPT_NUMBER else last_number + 1


def next_receipt_number(db: Session, shift: CashShift) -> int:
    receipt_numbers = db.scalars(
        select(Sale.receipt_number)
        .where(
            Sale.shift_id == shift.id,
            Sale.receipt_number.is_not(None),
        )
        .order_by(Sale.sold_at.desc(), Sale.id.desc())
    ).all()
    if not receipt_numbers:
        return shift.starting_receipt_number

    used_numbers = set(receipt_numbers)
    candidate = (
        0 if receipt_numbers[0] >= MAX_RECEIPT_NUMBER else receipt_numbers[0] + 1
    )
    for _ in range(MAX_RECEIPT_NUMBER + 1):
        if candidate not in used_numbers:
            return candidate
        candidate = 0 if candidate >= MAX_RECEIPT_NUMBER else candidate + 1

    raise HTTPException(
        status_code=409,
        detail="Ya se utilizaron todos los folios disponibles en este turno",
    )


def missing_receipt_numbers(db: Session, shift: CashShift) -> list[int]:
    """Return gaps from the shift's starting folio through its highest used folio."""
    used_numbers = set(db.scalars(
        select(Sale.receipt_number).where(
            Sale.shift_id == shift.id,
            Sale.receipt_number.is_not(None),
        )
    ).all())
    if not used_numbers:
        return []

    start = shift.starting_receipt_number
    high_numbers = [number for number in used_numbers if number >= start]
    if not high_numbers:
        return []

    expected = set(range(start, max(high_numbers) + 1))
    if MAX_RECEIPT_NUMBER in used_numbers:
        low_numbers = [number for number in used_numbers if number < start]
        if low_numbers:
            expected.update(range(0, max(low_numbers) + 1))
    return sorted(expected - used_numbers)


def shift_query():
    return select(CashShift).options(
        joinedload(CashShift.barbers).joinedload(ShiftBarber.barber),
        joinedload(CashShift.receptionist),
        joinedload(CashShift.evidence_uploaded_by),
        joinedload(CashShift.closed_by),
        selectinload(CashShift.expenses),
    )


def serialize_shift(shift: CashShift, db: Session) -> dict:
    return {
        "id": shift.id,
        "business_date": shift.business_date,
        "shift_type": shift.shift_type,
        "status": shift.status,
        "opening_cash": shift.opening_cash,
        "starting_receipt_number": shift.starting_receipt_number,
        "receptionist": (
            {"id": shift.receptionist.id, "name": shift.receptionist.name}
            if shift.receptionist else None
        ),
        "opened_at": shift.opened_at,
        "closed_at": shift.closed_at,
        "cash_counted": shift.cash_counted,
        "card_reported": shift.card_reported,
        "transfer_reported": shift.transfer_reported,
        "closing_notes": shift.closing_notes,
        "receipt_gap_reason": shift.receipt_gap_reason,
        "missing_receipt_numbers": missing_receipt_numbers(db, shift),
        "evidence_original_name": shift.evidence_original_name,
        "evidence_uploaded_at": shift.evidence_uploaded_at,
        "evidence_uploaded_by_name": shift.evidence_uploaded_by.full_name if shift.evidence_uploaded_by else None,
        "closed_by_name": shift.closed_by.full_name if shift.closed_by else None,
        "evidence_url": f"/api/shifts/{shift.id}/evidence" if shift.evidence_file_name else None,
        "next_receipt_number": next_receipt_number(db, shift),
        "barbers": [{"id": row.barber.id, "name": row.barber.name} for row in shift.barbers],
        "expenses": [
            {"id": expense.id, "concept": expense.concept, "amount": expense.amount, "created_at": expense.created_at}
            for expense in shift.expenses
        ],
    }


def schedule_for(db: Session, person_type: str, person_id: int, shift: CashShift):
    day_index = (shift.business_date.weekday() - 5) % 7
    return db.scalar(select(WorkSchedule).where(
        WorkSchedule.person_type == person_type,
        WorkSchedule.person_id == person_id,
        WorkSchedule.week_start == shift.business_date - timedelta(days=day_index),
        WorkSchedule.day_of_week == day_index,
        WorkSchedule.shift_type == shift.shift_type,
    ))


def attendance_record(db: Session, shift: CashShift, person_type: str, employee):
    schedule = schedule_for(db, person_type, employee.id, shift)
    record = AttendanceRecord(
        shift=shift,
        person_type=person_type,
        person_id=employee.id,
        person_name=employee.name,
        scheduled_start=schedule.start_time if schedule and schedule.status == "WORK" else None,
        scheduled_end=schedule.end_time if schedule and schedule.status == "WORK" else None,
        scheduled_meal_start=schedule.meal_start if schedule and schedule.status == "WORK" else None,
        scheduled_meal_end=schedule.meal_end if schedule and schedule.status == "WORK" else None,
        status="REST" if schedule and schedule.status == "REST" else "PENDING",
    )
    if shift.shift_type == "EVENING":
        previous = db.scalar(
            select(AttendanceRecord)
            .join(AttendanceRecord.shift)
            .where(
                CashShift.business_date == shift.business_date,
                CashShift.shift_type == "MORNING",
                CashShift.status == "CLOSED",
                AttendanceRecord.person_type == person_type,
                AttendanceRecord.person_id == employee.id,
                AttendanceRecord.continues_next_shift.is_(True),
            )
            .order_by(CashShift.id.desc())
            .limit(1)
        )
        if previous:
            record.clock_in = previous.clock_in
            record.meal_out = previous.meal_out
            record.meal_in = previous.meal_in
            record.status = "PRESENT"
            record.continued_from_record_id = previous.id
    return record


def works_evening(db: Session, row: AttendanceRecord, shift: CashShift) -> bool:
    day_index = (shift.business_date.weekday() - 5) % 7
    evening = db.scalar(select(WorkSchedule.id).where(
        WorkSchedule.person_type == row.person_type,
        WorkSchedule.person_id == row.person_id,
        WorkSchedule.week_start == shift.business_date - timedelta(days=day_index),
        WorkSchedule.day_of_week == day_index,
        WorkSchedule.shift_type == "EVENING",
        WorkSchedule.status == "WORK",
    ))
    return evening is not None


@router.get("/current", response_model=CashShiftRead | None)
def get_current_shift(db: DatabaseSession):
    shift = db.scalar(shift_query().where(CashShift.status == "OPEN").order_by(CashShift.id.desc()))
    return serialize_shift(shift, db) if shift else None


@router.get("/next-receipt")
def get_next_receipt(db: DatabaseSession):
    next_number = next_global_receipt_number(db)
    return {
        "next_receipt_number": 0 if next_number is None else next_number,
        "can_choose": next_number is None,
    }


@router.get("", response_model=list[CashShiftRead])
def list_shifts(db: DatabaseSession):
    shifts = db.scalars(shift_query().order_by(CashShift.opened_at.desc(), CashShift.id.desc()))
    return [serialize_shift(shift, db) for shift in shifts.unique().all()]


@router.post("", response_model=CashShiftRead, status_code=status.HTTP_201_CREATED)
def open_shift(payload: CashShiftCreate, db: DatabaseSession):
    if db.scalar(select(CashShift.id).where(CashShift.status == "OPEN").limit(1)):
        raise HTTPException(status_code=409, detail="Ya existe un turno abierto")
    barber_ids = list(dict.fromkeys(payload.barber_ids))
    barbers = db.scalars(select(Barber).where(Barber.id.in_(barber_ids), Barber.active.is_(True))).all()
    if len(barbers) != len(barber_ids):
        raise HTTPException(status_code=400, detail="Uno de los barberos no existe o está inactivo")
    receptionist = db.get(Receptionist, payload.receptionist_id)
    if receptionist is None or not receptionist.active:
        raise HTTPException(status_code=400, detail="La recepcionista no existe o está inactiva")
    shift = CashShift(
        business_date=datetime.now(LOCAL_ZONE).date(),
        shift_type=payload.shift_type.value,
        opening_cash=payload.opening_cash,
        starting_receipt_number=payload.starting_receipt_number,
        receptionist_id=receptionist.id,
        barbers=[ShiftBarber(barber_id=barber.id) for barber in barbers],
    )
    shift.attendance_records = [
        attendance_record(db, shift, "RECEPTIONIST", receptionist),
        *[attendance_record(db, shift, "BARBER", barber) for barber in barbers],
    ]
    db.add(shift)
    db.commit()
    saved = db.scalar(shift_query().where(CashShift.id == shift.id))
    return serialize_shift(saved, db)


@router.post("/{shift_id}/expenses", response_model=ShiftExpenseRead, status_code=status.HTTP_201_CREATED)
def add_expense(shift_id: int, payload: ShiftExpenseCreate, db: DatabaseSession):
    shift = db.get(CashShift, shift_id)
    if shift is None or shift.status != "OPEN":
        raise HTTPException(status_code=400, detail="El turno no está abierto")
    concept = " ".join(payload.concept.split())
    expense = ShiftExpense(shift_id=shift.id, concept=concept, amount=payload.amount)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.post("/{shift_id}/evidence", response_model=CashShiftRead)
def upload_shift_evidence(
    shift_id: int,
    evidence: Annotated[UploadFile, File(...)],
    request: Request,
    db: DatabaseSession,
):
    shift = db.get(CashShift, shift_id)
    if shift is None or shift.status != "OPEN":
        raise HTTPException(status_code=400, detail="El turno no está abierto")
    extension = ALLOWED_EVIDENCE_TYPES.get(evidence.content_type or "")
    if extension is None:
        raise HTTPException(status_code=400, detail="Selecciona una imagen JPG, PNG o WEBP")

    content = evidence.file.read(MAX_EVIDENCE_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="La imagen está vacía")
    if len(content) > MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="La imagen no puede pesar más de 8 MB")

    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    previous_path = EVIDENCE_DIR / shift.evidence_file_name if shift.evidence_file_name else None
    stored_name = f"shift_{shift.id}_{uuid4().hex}{extension}"
    target = EVIDENCE_DIR / stored_name
    target.write_bytes(content)

    shift.evidence_file_name = stored_name
    shift.evidence_original_name = Path(evidence.filename or "evidencia").name[:255]
    shift.evidence_content_type = evidence.content_type
    shift.evidence_uploaded_at = datetime.now(LOCAL_ZONE)
    shift.evidence_uploaded_by_user_id = request.state.user.id
    db.commit()
    if previous_path and previous_path.is_file() and previous_path != target:
        previous_path.unlink()
    saved = db.scalar(shift_query().where(CashShift.id == shift.id))
    return serialize_shift(saved, db)


@router.get("/{shift_id}/evidence")
def get_shift_evidence(shift_id: int, db: DatabaseSession):
    shift = db.get(CashShift, shift_id)
    if shift is None or not shift.evidence_file_name:
        raise HTTPException(status_code=404, detail="Este turno no tiene evidencia")
    path = EVIDENCE_DIR / shift.evidence_file_name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No se encontró el archivo de evidencia")
    return FileResponse(
        path,
        media_type=shift.evidence_content_type or "application/octet-stream",
        filename=shift.evidence_original_name or path.name,
        content_disposition_type="inline",
    )


@router.post("/{shift_id}/close", response_model=CashShiftRead)
def close_shift(shift_id: int, payload: CashShiftClose, request: Request, db: DatabaseSession):
    shift = db.scalar(
        select(CashShift)
        .options(
            selectinload(CashShift.attendance_records)
            .selectinload(AttendanceRecord.evidences)
        )
        .where(CashShift.id == shift_id)
    )
    if shift is None or shift.status != "OPEN":
        raise HTTPException(status_code=400, detail="El turno no está abierto")
    if not shift.evidence_file_name:
        raise HTTPException(
            status_code=409,
            detail="Adjunta la evidencia del checador antes de cerrar el turno",
        )
    incomplete = []
    for row in shift.attendance_records:
        if row.status in {"ABSENT", "REST", "PERMISSION"}:
            continue
        if row.clock_in is None:
            incomplete.append(row.person_name)
            continue
        has_scheduled_meal = bool(row.scheduled_meal_start and row.scheduled_meal_end)
        if row.meal_out is not None and row.meal_in is None:
            incomplete.append(f"{row.person_name} (regreso de comida)")
            continue
        if has_scheduled_meal and (row.meal_out is None or row.meal_in is None):
            incomplete.append(f"{row.person_name} (comida)")
            continue
        if row.clock_out is None:
            if shift.shift_type == "MORNING" and works_evening(db, row, shift):
                row.continues_next_shift = True
            else:
                incomplete.append(row.person_name)
    if incomplete:
        raise HTTPException(
            status_code=409,
            detail="Completa entrada y salida o registra una incidencia para: " + ", ".join(incomplete),
        )
    missing_receipts = missing_receipt_numbers(db, shift)
    gap_reason = " ".join(payload.receipt_gap_reason.split()) if payload.receipt_gap_reason else None
    if missing_receipts and (gap_reason is None or len(gap_reason) < 3):
        formatted = ", ".join(f"{number:04d}" for number in missing_receipts[:20])
        suffix = "…" if len(missing_receipts) > 20 else ""
        raise HTTPException(
            status_code=409,
            detail=(
                f"Faltan los folios {formatted}{suffix}. Corrígelos desde Ventas "
                "o escribe el motivo del salto antes de cerrar el turno"
            ),
        )
    shift.cash_counted = payload.cash_counted
    shift.card_reported = payload.card_reported
    shift.transfer_reported = payload.transfer_reported
    shift.closing_notes = " ".join(payload.closing_notes.split()) if payload.closing_notes else None
    shift.receipt_gap_reason = gap_reason if missing_receipts else None
    shift.closed_by_user_id = request.state.user.id
    shift.status = "CLOSED"
    shift.closed_at = datetime.now(LOCAL_ZONE)
    db.commit()
    saved = db.scalar(shift_query().where(CashShift.id == shift.id))
    return serialize_shift(saved, db)
