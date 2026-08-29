from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from typing import Annotated
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from openpyxl import Workbook
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.config import get_settings
from app.database import get_db
from app.models.attendance import AttendanceEvidence, AttendanceRecord
from app.models.barber import Barber
from app.models.cash_shift import CashShift
from app.models.receptionist import Receptionist
from app.schemas.timeclock import (
    TimeclockAuditRead,
    TimeclockPinLookup,
    TimeclockPinUpdate,
    TimeclockPunchResult,
    TimeclockStatus,
)
from app.security import hash_password, verify_password


router = APIRouter(prefix="/api/timeclock", tags=["timeclock"])
DatabaseSession = Annotated[Session, Depends(get_db)]
LOCAL_ZONE = ZoneInfo("America/Hermosillo")
SETTINGS = get_settings()
TIMECLOCK_DIR = SETTINGS.evidence_path / "timeclock"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_STORED_BYTES = 500 * 1024
FAILED_WINDOW = timedelta(minutes=5)
MAX_FAILED_ATTEMPTS = 8
failed_attempts: dict[str, deque[datetime]] = defaultdict(deque)
EVENT_LABELS = {
    "CLOCK_IN": "Entrada registrada",
    "MEAL_OUT": "Salida a comida registrada",
    "MEAL_IN": "Regreso de comida registrado",
    "CLOCK_OUT": "Salida registrada",
}


def require_admin(request: Request):
    if request.state.user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Solo administración puede consultar el checador")
    return request.state.user


def client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def prune_attempts(key: str, now: datetime) -> deque[datetime]:
    attempts = failed_attempts[key]
    cutoff = now - FAILED_WINDOW
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    return attempts


def check_rate_limit(request: Request) -> None:
    now = datetime.now(timezone.utc)
    if len(prune_attempts(client_key(request), now)) >= MAX_FAILED_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Espera cinco minutos antes de volver a intentar",
        )


def failed_pin(request: Request) -> None:
    failed_attempts[client_key(request)].append(datetime.now(timezone.utc))


def clear_failed_pins(request: Request) -> None:
    failed_attempts.pop(client_key(request), None)


def active_people(db: Session):
    barbers = db.scalars(
        select(Barber).where(Barber.active.is_(True), Barber.timeclock_pin_hash.is_not(None))
    ).all()
    receptionists = db.scalars(
        select(Receptionist).where(
            Receptionist.active.is_(True), Receptionist.timeclock_pin_hash.is_not(None)
        )
    ).all()
    return [("BARBER", row) for row in barbers] + [
        ("RECEPTIONIST", row) for row in receptionists
    ]


def person_for_pin(db: Session, pin: str, request: Request):
    check_rate_limit(request)
    match = None
    for person_type, employee in active_people(db):
        try:
            valid = verify_password(pin, employee.timeclock_pin_hash)
        except Exception:
            valid = False
        if valid and match is None:
            match = (person_type, employee)
    if match is None:
        failed_pin(request)
        raise HTTPException(status_code=401, detail="PIN incorrecto o no disponible para el turno actual")
    clear_failed_pins(request)
    return match


def current_record(db: Session, person_type: str, person_id: int) -> AttendanceRecord:
    row = db.scalar(
        select(AttendanceRecord)
        .options(joinedload(AttendanceRecord.shift))
        .join(AttendanceRecord.shift)
        .where(
            CashShift.status == "OPEN",
            CashShift.business_date == datetime.now(LOCAL_ZONE).date(),
            AttendanceRecord.person_type == person_type,
            AttendanceRecord.person_id == person_id,
        )
        .order_by(CashShift.id.desc())
        .limit(1)
    )
    if row is None:
        raise HTTPException(
            status_code=409,
            detail="No perteneces a un turno abierto de hoy. Solicita a recepción que abra el turno o te agregue",
        )
    if row.status in {"ABSENT", "REST", "PERMISSION"}:
        raise HTTPException(status_code=409, detail="Tu asistencia tiene una incidencia registrada")
    return row


def available_events(row: AttendanceRecord) -> list[str]:
    if row.clock_out is not None:
        return []
    if row.clock_in is None:
        return ["CLOCK_IN"]
    if row.meal_out is not None and row.meal_in is None:
        return ["MEAL_IN"]
    if row.meal_in is not None:
        return ["CLOCK_OUT"]
    meal_scheduled = bool(row.scheduled_meal_start and row.scheduled_meal_end)
    return ["MEAL_OUT"] if meal_scheduled else ["MEAL_OUT", "CLOCK_OUT"]


def status_payload(row: AttendanceRecord) -> dict:
    return {
        "person_name": row.person_name,
        "person_type": row.person_type,
        "business_date": row.shift.business_date,
        "shift_type": row.shift.shift_type,
        "available_events": available_events(row),
        "meal_scheduled": bool(row.scheduled_meal_start and row.scheduled_meal_end),
        "scheduled_start": row.scheduled_start,
        "scheduled_end": row.scheduled_end,
        "scheduled_meal_start": row.scheduled_meal_start,
        "scheduled_meal_end": row.scheduled_meal_end,
        "clock_in": row.clock_in,
        "meal_out": row.meal_out,
        "meal_in": row.meal_in,
        "clock_out": row.clock_out,
    }


def evidence_deviation(evidence: AttendanceEvidence) -> tuple[str | None, int | None]:
    record = evidence.attendance_record
    targets = {
        "CLOCK_IN": record.scheduled_start,
        "MEAL_OUT": record.scheduled_meal_start,
        "MEAL_IN": record.scheduled_meal_end,
        "CLOCK_OUT": record.scheduled_end,
    }
    target = targets.get(evidence.event_type)
    if target is None:
        return None, None
    expected = datetime.combine(record.shift.business_date, target, tzinfo=LOCAL_ZONE)
    if (
        evidence.event_type == "CLOCK_OUT"
        and record.scheduled_start
        and record.scheduled_end
        and record.scheduled_end <= record.scheduled_start
    ):
        expected += timedelta(days=1)
    minutes = round((evidence.occurred_at.astimezone(LOCAL_ZONE) - expected).total_seconds() / 60)
    if minutes == 0:
        return "ON_TIME", 0
    if evidence.event_type == "CLOCK_IN":
        return ("LATE_ARRIVAL" if minutes > 0 else "EARLY_ARRIVAL"), abs(minutes)
    if evidence.event_type == "CLOCK_OUT":
        return ("LATE_DEPARTURE" if minutes > 0 else "EARLY_DEPARTURE"), abs(minutes)
    return ("LATE_MEAL" if minutes > 0 else "EARLY_MEAL"), abs(minutes)


def apply_punctuality_filter(rows, punctuality: str | None):
    if not punctuality:
        return rows
    return [row for row in rows if evidence_deviation(row)[0] == punctuality]


def compressed_photo(upload: UploadFile) -> bytes:
    if (upload.content_type or "") not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="La evidencia debe ser una fotografía JPG, PNG o WEBP")
    source = upload.file.read(MAX_SOURCE_BYTES + 1)
    if not source:
        raise HTTPException(status_code=400, detail="La fotografía está vacía")
    if len(source) > MAX_SOURCE_BYTES:
        raise HTTPException(status_code=413, detail="La fotografía original supera 8 MB")
    try:
        with Image.open(BytesIO(source)) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGB")
            image.thumbnail((1280, 720), Image.Resampling.LANCZOS)
            for quality in (74, 66, 58, 50):
                output = BytesIO()
                image.save(output, format="WEBP", quality=quality, method=6)
                content = output.getvalue()
                if len(content) <= MAX_STORED_BYTES:
                    return content
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="No se pudo procesar la fotografía") from exc
    raise HTTPException(status_code=413, detail="No fue posible comprimir la fotografía a menos de 500 KB")


def delete_expired_photos(db: Session) -> None:
    cutoff = datetime.now(timezone.utc) - timedelta(days=SETTINGS.timeclock_evidence_retention_days)
    rows = db.scalars(
        select(AttendanceEvidence).where(
            AttendanceEvidence.occurred_at < cutoff,
            AttendanceEvidence.photo_file_name.is_not(None),
        ).limit(100)
    ).all()
    if not rows:
        return
    deleted_at = datetime.now(timezone.utc)
    for evidence in rows:
        path = TIMECLOCK_DIR / evidence.photo_file_name
        if path.is_file():
            path.unlink()
        evidence.photo_file_name = None
        evidence.photo_size_bytes = 0
        evidence.photo_deleted_at = deleted_at


@router.post("/status", response_model=TimeclockStatus)
def timeclock_status(payload: TimeclockPinLookup, request: Request, db: DatabaseSession):
    person_type, employee = person_for_pin(db, payload.pin, request)
    row = current_record(db, person_type, employee.id)
    return status_payload(row)


@router.post("/punch", response_model=TimeclockPunchResult)
def timeclock_punch(
    request: Request,
    db: DatabaseSession,
    pin: Annotated[str, Form(min_length=4, max_length=8)],
    event: Annotated[str, Form()],
    photo: Annotated[UploadFile, File(...)],
):
    if not pin.isdigit():
        raise HTTPException(status_code=400, detail="El PIN debe contener únicamente números")
    person_type, employee = person_for_pin(db, pin, request)
    row = current_record(db, person_type, employee.id)
    allowed = available_events(row)
    if event not in allowed:
        raise HTTPException(status_code=409, detail="Ese movimiento ya no corresponde al estado actual")

    content = compressed_photo(photo)
    now = datetime.now(LOCAL_ZONE)
    incident_type = None
    if event == "CLOCK_IN":
        row.clock_in = now
        row.status = "PRESENT"
    elif event == "MEAL_OUT":
        row.meal_out = now
        if not (row.scheduled_meal_start and row.scheduled_meal_end):
            incident_type = "UNSCHEDULED_MEAL"
    elif event == "MEAL_IN":
        row.meal_in = now
    else:
        row.clock_out = now
        row.status = "PRESENT"

    TIMECLOCK_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"attendance_{row.id}_{event.lower()}_{uuid4().hex}.webp"
    target = TIMECLOCK_DIR / stored_name
    target.write_bytes(content)
    evidence = AttendanceEvidence(
        attendance_record_id=row.id,
        event_type=event,
        occurred_at=now,
        photo_file_name=stored_name,
        photo_content_type="image/webp",
        photo_size_bytes=len(content),
        incident_type=incident_type,
    )
    db.add(evidence)
    row.recorded_by_user_id = None
    try:
        delete_expired_photos(db)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if target.is_file():
            target.unlink()
        raise HTTPException(
            status_code=409,
            detail="Ese movimiento ya fue registrado. Actualiza el estado del checador",
        ) from exc
    except Exception:
        db.rollback()
        if target.is_file():
            target.unlink()
        raise
    return {
        "event": event,
        "occurred_at": now,
        "person_name": row.person_name,
        "incident_type": incident_type,
        "message": EVENT_LABELS[event],
    }


def all_pin_holders(db: Session):
    return [
        *(('BARBER', row) for row in db.scalars(select(Barber).where(Barber.timeclock_pin_hash.is_not(None))).all()),
        *(('RECEPTIONIST', row) for row in db.scalars(select(Receptionist).where(Receptionist.timeclock_pin_hash.is_not(None))).all()),
    ]


@router.patch("/pin/{person_type}/{person_id}")
def set_timeclock_pin(
    person_type: str,
    person_id: int,
    payload: TimeclockPinUpdate,
    request: Request,
    db: DatabaseSession,
):
    require_admin(request)
    model = Barber if person_type == "BARBER" else Receptionist if person_type == "RECEPTIONIST" else None
    if model is None:
        raise HTTPException(status_code=400, detail="Tipo de personal no válido")
    employee = db.get(model, person_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    for existing_type, existing in all_pin_holders(db):
        if existing_type == person_type and existing.id == person_id:
            continue
        if verify_password(payload.pin, existing.timeclock_pin_hash):
            raise HTTPException(status_code=409, detail="Ese PIN ya está asignado a otra persona")
    employee.timeclock_pin_hash = hash_password(payload.pin)
    db.commit()
    return {"status": "ok", "has_timeclock_pin": True}


@router.delete("/pin/{person_type}/{person_id}")
def remove_timeclock_pin(
    person_type: str,
    person_id: int,
    request: Request,
    db: DatabaseSession,
):
    require_admin(request)
    model = Barber if person_type == "BARBER" else Receptionist if person_type == "RECEPTIONIST" else None
    if model is None:
        raise HTTPException(status_code=400, detail="Tipo de personal no válido")
    employee = db.get(model, person_id)
    if employee is None:
        raise HTTPException(status_code=404, detail="Personal no encontrado")
    employee.timeclock_pin_hash = None
    db.commit()
    return {"status": "ok", "has_timeclock_pin": False}


@router.get("/audit", response_model=list[TimeclockAuditRead])
def timeclock_audit(
    request: Request,
    db: DatabaseSession,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    person_type: str | None = Query(default=None),
    person_id: int | None = Query(default=None),
    incident_only: bool = Query(default=False),
    punctuality: str | None = Query(default=None),
):
    require_admin(request)
    delete_expired_photos(db)
    query = (
        select(AttendanceEvidence)
        .options(joinedload(AttendanceEvidence.attendance_record).joinedload(AttendanceRecord.shift))
        .join(AttendanceEvidence.attendance_record)
        .join(AttendanceRecord.shift)
    )
    if date_from:
        query = query.where(AttendanceEvidence.occurred_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=LOCAL_ZONE))
    if date_to:
        query = query.where(AttendanceEvidence.occurred_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=LOCAL_ZONE))
    if person_type:
        query = query.where(AttendanceRecord.person_type == person_type)
    if person_id:
        query = query.where(AttendanceRecord.person_id == person_id)
    if incident_only:
        query = query.where(AttendanceEvidence.incident_type.is_not(None))
    rows = db.scalars(query.order_by(AttendanceEvidence.occurred_at.desc()).limit(5000)).all()
    rows = apply_punctuality_filter(rows, punctuality)[:1000]
    db.commit()
    retention = timedelta(days=SETTINGS.timeclock_evidence_retention_days)
    return [
        {
            "evidence_id": evidence.id,
            "attendance_record_id": evidence.attendance_record_id,
            "business_date": evidence.attendance_record.shift.business_date,
            "shift_type": evidence.attendance_record.shift.shift_type,
            "person_type": evidence.attendance_record.person_type,
            "person_id": evidence.attendance_record.person_id,
            "person_name": evidence.attendance_record.person_name,
            "event_type": evidence.event_type,
            "occurred_at": evidence.occurred_at,
            "scheduled_start": evidence.attendance_record.scheduled_start,
            "scheduled_end": evidence.attendance_record.scheduled_end,
            "scheduled_meal_start": evidence.attendance_record.scheduled_meal_start,
            "scheduled_meal_end": evidence.attendance_record.scheduled_meal_end,
            "incident_type": evidence.incident_type,
            "deviation_type": evidence_deviation(evidence)[0],
            "deviation_minutes": evidence_deviation(evidence)[1],
            "photo_available": bool(evidence.photo_file_name),
            "photo_url": f"/api/timeclock/evidence/{evidence.id}" if evidence.photo_file_name else None,
            "photo_expires_at": evidence.occurred_at + retention,
            "photo_deleted_at": evidence.photo_deleted_at,
        }
        for evidence in rows
    ]


@router.get("/audit/export")
def export_timeclock_audit(
    request: Request,
    db: DatabaseSession,
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    person_type: str | None = Query(default=None),
    person_id: int | None = Query(default=None),
    incident_only: bool = Query(default=False),
    punctuality: str | None = Query(default=None),
):
    require_admin(request)
    query = (
        select(AttendanceEvidence)
        .options(joinedload(AttendanceEvidence.attendance_record).joinedload(AttendanceRecord.shift))
        .join(AttendanceEvidence.attendance_record)
        .join(AttendanceRecord.shift)
    )
    if date_from:
        query = query.where(AttendanceEvidence.occurred_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=LOCAL_ZONE))
    if date_to:
        query = query.where(AttendanceEvidence.occurred_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=LOCAL_ZONE))
    if person_type:
        query = query.where(AttendanceRecord.person_type == person_type)
    if person_id:
        query = query.where(AttendanceRecord.person_id == person_id)
    if incident_only:
        query = query.where(AttendanceEvidence.incident_type.is_not(None))
    rows = db.scalars(query.order_by(AttendanceEvidence.occurred_at).limit(5000)).all()
    rows = apply_punctuality_filter(rows, punctuality)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Auditoría checador"
    sheet.append([
        "Fecha", "Turno", "Tipo", "Personal", "Movimiento", "Hora real",
        "Entrada programada", "Salida programada", "Comida programada",
        "Comparación", "Minutos", "Incidencia", "Fotografía disponible hasta",
    ])
    labels = {
        "CLOCK_IN": "Entrada", "MEAL_OUT": "Salida a comida",
        "MEAL_IN": "Regreso de comida", "CLOCK_OUT": "Salida",
    }
    retention = timedelta(days=SETTINGS.timeclock_evidence_retention_days)
    for evidence in rows:
        record = evidence.attendance_record
        meal = ""
        if record.scheduled_meal_start and record.scheduled_meal_end:
            meal = f"{record.scheduled_meal_start:%H:%M}–{record.scheduled_meal_end:%H:%M}"
        deviation_type, deviation_minutes = evidence_deviation(evidence)
        deviation_labels = {
            "ON_TIME": "A la hora", "LATE_ARRIVAL": "Retardo",
            "EARLY_ARRIVAL": "Entrada anticipada", "EARLY_DEPARTURE": "Salida anticipada",
            "LATE_DEPARTURE": "Salida posterior", "EARLY_MEAL": "Comida anticipada",
            "LATE_MEAL": "Comida posterior",
        }
        sheet.append([
            record.shift.business_date.isoformat(),
            "Matutino" if record.shift.shift_type == "MORNING" else "Vespertino",
            "Barbero" if record.person_type == "BARBER" else "Recepción",
            record.person_name,
            labels[evidence.event_type],
            evidence.occurred_at.astimezone(LOCAL_ZONE).strftime("%Y-%m-%d %H:%M:%S"),
            record.scheduled_start.strftime("%H:%M") if record.scheduled_start else "",
            record.scheduled_end.strftime("%H:%M") if record.scheduled_end else "",
            meal,
            deviation_labels.get(deviation_type, "Sin comparación"),
            deviation_minutes if deviation_minutes is not None else "",
            "Comida sin horario" if evidence.incident_type == "UNSCHEDULED_MEAL" else "",
            (evidence.occurred_at + retention).date().isoformat(),
        ])
    for cell in sheet[1]:
        cell.font = cell.font.copy(bold=True)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    widths = [13, 13, 13, 24, 20, 21, 19, 19, 20, 20, 12, 22, 29]
    for index, width in enumerate(widths, 1):
        sheet.column_dimensions[chr(64 + index)].width = width
    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="auditoria_checador.xlsx"'},
    )


@router.get("/evidence/{evidence_id}")
def timeclock_evidence(evidence_id: int, request: Request, db: DatabaseSession):
    require_admin(request)
    evidence = db.get(AttendanceEvidence, evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidencia no encontrada")
    if not evidence.photo_file_name:
        raise HTTPException(status_code=410, detail="La fotografía venció según la política de conservación")
    path = TIMECLOCK_DIR / Path(evidence.photo_file_name).name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="El archivo de evidencia no está disponible")
    return FileResponse(path, media_type=evidence.photo_content_type, content_disposition_type="inline")
