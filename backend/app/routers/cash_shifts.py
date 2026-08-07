from datetime import datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.database import get_db
from app.models.barber import Barber
from app.models.cash_shift import CashShift, ShiftBarber, ShiftExpense
from app.models.sale import Sale
from app.models.receptionist import Receptionist
from app.schemas.cash_shift import CashShiftClose, CashShiftCreate, CashShiftRead, ShiftExpenseCreate, ShiftExpenseRead


router = APIRouter(prefix="/api/shifts", tags=["shifts"])
DatabaseSession = Annotated[Session, Depends(get_db)]
LOCAL_ZONE = ZoneInfo("America/Hermosillo")
MAX_RECEIPT_NUMBER = 10_000


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
    last_number = db.scalar(
        select(Sale.receipt_number)
        .where(
            Sale.shift_id == shift.id,
            Sale.receipt_number.is_not(None),
        )
        .order_by(Sale.sold_at.desc(), Sale.id.desc())
        .limit(1)
    )
    if last_number is None:
        return shift.starting_receipt_number
    return 0 if last_number >= MAX_RECEIPT_NUMBER else last_number + 1


def shift_query():
    return select(CashShift).options(
        joinedload(CashShift.barbers).joinedload(ShiftBarber.barber),
        joinedload(CashShift.receptionist),
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
        "next_receipt_number": next_receipt_number(db, shift),
        "barbers": [{"id": row.barber.id, "name": row.barber.name} for row in shift.barbers],
        "expenses": [
            {"id": expense.id, "concept": expense.concept, "amount": expense.amount, "created_at": expense.created_at}
            for expense in shift.expenses
        ],
    }


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


@router.post("/{shift_id}/close", response_model=CashShiftRead)
def close_shift(shift_id: int, payload: CashShiftClose, db: DatabaseSession):
    shift = db.get(CashShift, shift_id)
    if shift is None or shift.status != "OPEN":
        raise HTTPException(status_code=400, detail="El turno no está abierto")
    shift.cash_counted = payload.cash_counted
    shift.card_reported = payload.card_reported
    shift.transfer_reported = payload.transfer_reported
    shift.closing_notes = " ".join(payload.closing_notes.split()) if payload.closing_notes else None
    shift.status = "CLOSED"
    shift.closed_at = datetime.now(LOCAL_ZONE)
    db.commit()
    saved = db.scalar(shift_query().where(CashShift.id == shift.id))
    return serialize_shift(saved, db)
