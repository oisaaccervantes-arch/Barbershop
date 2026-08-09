from datetime import date, datetime
from io import BytesIO
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.attendance import AttendanceRecord, WorkSchedule
from app.models.barber import Barber
from app.models.cash_shift import CashShift
from app.models.receptionist import Receptionist
from app.schemas.attendance import AttendanceCorrection, AttendanceEvent, AttendanceRead, WorkScheduleRead, WorkScheduleWeekWrite, WorkScheduleWrite
from app.services.excel_exports import export_attendance, export_schedule


router = APIRouter(prefix="/api/attendance", tags=["attendance"])
DatabaseSession = Annotated[Session, Depends(get_db)]
LOCAL_ZONE = ZoneInfo("America/Hermosillo")


def require_admin(request: Request):
    if request.state.user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Se requiere acceso de administración")
    return request.state.user


def person(db: Session, person_type: str, person_id: int):
    model = Barber if person_type == "BARBER" else Receptionist
    row = db.get(model, person_id)
    if row is None or not row.active:
        raise HTTPException(status_code=400, detail="La persona no existe o está inactiva")
    return row


def attendance_complete(row: AttendanceRecord) -> bool:
    return row.status in {"ABSENT", "REST", "PERMISSION"} or (
        row.clock_in is not None and row.clock_out is not None
    )


def serialize_attendance(row: AttendanceRecord) -> dict:
    return {
        "id": row.id,
        "shift_id": row.shift_id,
        "business_date": row.shift.business_date.isoformat(),
        "shift_type": row.shift.shift_type,
        "person_type": row.person_type,
        "person_id": row.person_id,
        "person_name": row.person_name,
        "scheduled_start": row.scheduled_start,
        "scheduled_end": row.scheduled_end,
        "clock_in": row.clock_in,
        "meal_out": row.meal_out,
        "meal_in": row.meal_in,
        "clock_out": row.clock_out,
        "status": row.status,
        "notes": row.notes,
        "recorded_by_name": row.recorded_by.full_name if row.recorded_by else None,
        "corrected_by_name": row.corrected_by.full_name if row.corrected_by else None,
        "complete": attendance_complete(row),
    }


def attendance_query():
    return select(AttendanceRecord).options(
        joinedload(AttendanceRecord.shift),
        joinedload(AttendanceRecord.recorded_by),
        joinedload(AttendanceRecord.corrected_by),
    )


@router.get("/current", response_model=list[AttendanceRead])
def current_attendance(db: DatabaseSession):
    shift = db.scalar(select(CashShift).where(CashShift.status == "OPEN").order_by(CashShift.id.desc()))
    if shift is None:
        return []
    rows = db.scalars(attendance_query().where(AttendanceRecord.shift_id == shift.id).order_by(AttendanceRecord.person_type, AttendanceRecord.person_name)).all()
    return [serialize_attendance(row) for row in rows]


@router.get("/history", response_model=list[AttendanceRead])
def attendance_history(db: DatabaseSession):
    rows = db.scalars(
        attendance_query()
        .join(AttendanceRecord.shift)
        .where(
            CashShift.status == "CLOSED",
            (AttendanceRecord.notes.is_(None))
            | (AttendanceRecord.notes != "Turno anterior a la implementación del checador"),
        )
        .order_by(AttendanceRecord.created_at.desc())
        .limit(500)
    ).all()
    return [serialize_attendance(row) for row in rows]


def excel_response(content: bytes, filename: str):
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/schedule")
def export_schedule_excel(week_start: date, shift_type: str, db: DatabaseSession):
    if shift_type not in {"MORNING", "EVENING"}:
        raise HTTPException(status_code=400, detail="Turno no válido")
    content = export_schedule(db, week_start, shift_type)
    return excel_response(content, f"horario_{week_start.isoformat()}_{shift_type.lower()}.xlsx")


@router.get("/export/history")
def export_attendance_excel(week_start: date, db: DatabaseSession):
    content = export_attendance(db, week_start)
    return excel_response(content, f"asistencias_{week_start.isoformat()}.xlsx")


@router.post("/{record_id}/event", response_model=AttendanceRead)
def register_event(record_id: int, payload: AttendanceEvent, request: Request, db: DatabaseSession):
    row = db.scalar(attendance_query().where(AttendanceRecord.id == record_id))
    if row is None or row.shift.status != "OPEN":
        raise HTTPException(status_code=400, detail="El registro no pertenece a un turno abierto")
    now = datetime.now(LOCAL_ZONE)
    if payload.event == "CLOCK_IN":
        if row.clock_in is not None:
            raise HTTPException(status_code=409, detail="La entrada ya fue registrada")
        row.clock_in = now
        row.status = "PRESENT"
    elif payload.event == "MEAL_OUT":
        if row.clock_in is None or row.clock_out is not None:
            raise HTTPException(status_code=400, detail="Primero registra la entrada")
        row.meal_out = now
    elif payload.event == "MEAL_IN":
        if row.meal_out is None or row.clock_out is not None:
            raise HTTPException(status_code=400, detail="Primero registra la salida a comida")
        row.meal_in = now
    elif payload.event == "CLOCK_OUT":
        if row.clock_in is None:
            raise HTTPException(status_code=400, detail="Primero registra la entrada")
        if row.clock_out is not None:
            raise HTTPException(status_code=409, detail="La salida ya fue registrada")
        row.clock_out = now
        row.status = "PRESENT"
    else:
        if row.clock_in is not None:
            raise HTTPException(status_code=409, detail="Ya existe una entrada; solicita una corrección administrativa")
        row.status = payload.event
    if payload.notes is not None:
        row.notes = payload.notes.strip() or None
    row.recorded_by_user_id = request.state.user.id
    db.commit()
    db.refresh(row)
    return serialize_attendance(row)


@router.put("/{record_id}", response_model=AttendanceRead)
def correct_attendance(record_id: int, payload: AttendanceCorrection, request: Request, db: DatabaseSession):
    user = require_admin(request)
    row = db.scalar(attendance_query().where(AttendanceRecord.id == record_id))
    if row is None:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    row.clock_in = payload.clock_in
    row.meal_out = payload.meal_out
    row.meal_in = payload.meal_in
    row.clock_out = payload.clock_out
    row.status = payload.status
    row.notes = payload.notes.strip() if payload.notes else None
    row.corrected_by_user_id = user.id
    db.commit()
    db.refresh(row)
    return serialize_attendance(row)


def serialize_schedule(row: WorkSchedule, name: str) -> dict:
    return {
        "id": row.id, "person_type": row.person_type, "person_id": row.person_id,
        "person_name": name, "week_start": row.week_start, "day_of_week": row.day_of_week, "shift_type": row.shift_type,
        "start_time": row.start_time, "end_time": row.end_time,
        "meal_start": row.meal_start, "meal_end": row.meal_end, "status": row.status,
    }


@router.get("/schedules", response_model=list[WorkScheduleRead])
def list_schedules(db: DatabaseSession, week_start: date | None = None, shift_type: str | None = None):
    query = select(WorkSchedule)
    if week_start:
        query = query.where(WorkSchedule.week_start == week_start)
    if shift_type:
        query = query.where(WorkSchedule.shift_type == shift_type)
    rows = db.scalars(query.order_by(WorkSchedule.person_type, WorkSchedule.person_id, WorkSchedule.day_of_week)).all()
    result = []
    for row in rows:
        model = Barber if row.person_type == "BARBER" else Receptionist
        employee = db.get(model, row.person_id)
        if employee:
            result.append(serialize_schedule(row, employee.name))
    return result


@router.post("/schedules", response_model=WorkScheduleRead, status_code=status.HTTP_201_CREATED)
def save_schedule(payload: WorkScheduleWrite, request: Request, db: DatabaseSession):
    require_admin(request)
    employee = person(db, payload.person_type, payload.person_id)
    row = db.scalar(select(WorkSchedule).where(
        WorkSchedule.person_type == payload.person_type,
        WorkSchedule.person_id == payload.person_id,
        WorkSchedule.week_start == payload.week_start,
        WorkSchedule.day_of_week == payload.day_of_week,
        WorkSchedule.shift_type == payload.shift_type,
    ))
    if row is None:
        row = WorkSchedule(week_start=payload.week_start, person_type=payload.person_type, person_id=payload.person_id, day_of_week=payload.day_of_week, shift_type=payload.shift_type)
        db.add(row)
    for field in ("start_time", "end_time", "meal_start", "meal_end", "status"):
        setattr(row, field, getattr(payload, field))
    db.commit()
    db.refresh(row)
    return serialize_schedule(row, employee.name)


@router.post("/schedules/week", response_model=list[WorkScheduleRead])
def save_schedule_week(payload: WorkScheduleWeekWrite, request: Request, db: DatabaseSession):
    require_admin(request)
    for item in payload.schedules:
        if item.week_start != payload.week_start or item.shift_type != payload.shift_type:
            raise HTTPException(status_code=400, detail="Todos los horarios deben corresponder a la semana y turno seleccionados")
        person(db, item.person_type, item.person_id)

    db.query(WorkSchedule).filter(
        WorkSchedule.week_start == payload.week_start,
        WorkSchedule.shift_type == payload.shift_type,
    ).delete(synchronize_session=False)
    for item in payload.schedules:
        db.add(WorkSchedule(**item.model_dump()))
    db.commit()
    return list_schedules(db, payload.week_start, payload.shift_type)


@router.delete("/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(schedule_id: int, request: Request, db: DatabaseSession):
    require_admin(request)
    row = db.get(WorkSchedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Horario no encontrado")
    db.delete(row)
    db.commit()
