from datetime import datetime
from decimal import Decimal
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.appointment import Appointment
from app.models.barber import Barber
from app.models.customer import Customer
from app.models.sale import Payment, Sale, SaleItem
from app.models.service import Service
from app.schemas.sale import PaymentMethod, SaleCreate, SaleRead


router = APIRouter(prefix="/api/sales", tags=["sales"])
DatabaseSession = Annotated[Session, Depends(get_db)]
MONEY_UNIT = Decimal("0.01")


def serialize_sale(sale: Sale) -> dict:
    return {
        "id": sale.id,
        "folio": sale.folio,
        "customer_id": sale.customer_id,
        "customer_name": sale.customer.name if sale.customer else None,
        "barber_id": sale.barber_id,
        "barber_name": sale.barber.name,
        "appointment_id": sale.appointment_id,
        "subtotal": sale.subtotal,
        "discount": sale.discount,
        "discount_reason": sale.discount_reason,
        "total": sale.total,
        "status": sale.status,
        "sold_at": sale.sold_at,
        "items": [
            {
                "id": item.id,
                "service_id": item.service_id,
                "service_name": item.service_name,
                "service_type": item.service_type,
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "line_total": item.line_total,
            }
            for item in sale.items
        ],
        "payments": [
            {
                "id": payment.id,
                "method": payment.method,
                "amount": payment.amount,
                "tendered_amount": payment.tendered_amount,
                "change_amount": payment.change_amount,
            }
            for payment in sale.payments
        ],
    }


def sale_query():
    return select(Sale).options(
        joinedload(Sale.customer),
        joinedload(Sale.barber),
        joinedload(Sale.items),
        joinedload(Sale.payments),
    )


@router.get("", response_model=list[SaleRead])
def list_sales(db: DatabaseSession):
    sales = db.scalars(sale_query().order_by(Sale.sold_at.desc(), Sale.id.desc()))
    return [serialize_sale(sale) for sale in sales.unique().all()]


@router.post("", response_model=SaleRead, status_code=status.HTTP_201_CREATED)
def create_sale(payload: SaleCreate, db: DatabaseSession):
    customer = db.get(Customer, payload.customer_id) if payload.customer_id else None
    barber = db.get(Barber, payload.barber_id)
    appointment = (
        db.get(Appointment, payload.appointment_id)
        if payload.appointment_id
        else None
    )
    if payload.customer_id and (customer is None or not customer.active):
        raise HTTPException(status_code=400, detail="El cliente no está activo")
    if barber is None or not barber.active:
        raise HTTPException(status_code=400, detail="El barbero no está activo")
    if payload.appointment_id and appointment is None:
        raise HTTPException(status_code=400, detail="La cita no existe")
    if appointment and appointment.status in {"COMPLETED", "CANCELLED"}:
        raise HTTPException(status_code=409, detail="La cita ya tiene un estado final")
    if appointment and (
        appointment.customer_id != payload.customer_id
        or appointment.barber_id != payload.barber_id
    ):
        raise HTTPException(
            status_code=400,
            detail="La cita no corresponde al cliente o barbero seleccionado",
        )

    item_rows: list[SaleItem] = []
    subtotal = Decimal("0")
    for item_payload in payload.items:
        service = db.get(Service, item_payload.service_id)
        if service is None or not service.active:
            raise HTTPException(status_code=400, detail="Un servicio no está activo")
        line_total = (service.price * item_payload.quantity).quantize(MONEY_UNIT)
        subtotal += line_total
        item_rows.append(
            SaleItem(
                service_id=service.id,
                service_name=service.name,
                service_type=service.type,
                quantity=item_payload.quantity,
                unit_price=service.price,
                line_total=line_total,
            )
        )

    subtotal = subtotal.quantize(MONEY_UNIT)
    discount = payload.discount.quantize(MONEY_UNIT)
    discount_reason = None
    if payload.birthday_service_id is not None:
        if customer is None or customer.birth_date is None:
            raise HTTPException(status_code=400, detail="El cliente no tiene fecha de nacimiento")
        today = datetime.now(ZoneInfo("America/Hermosillo")).date()
        if (customer.birth_date.month, customer.birth_date.day) != (today.month, today.day):
            raise HTTPException(status_code=400, detail="El cliente no cumple aÃ±os hoy")
        birthday_item = next(
            (item for item in item_rows if item.service_id == payload.birthday_service_id),
            None,
        )
        if birthday_item is None:
            raise HTTPException(status_code=400, detail="El servicio del descuento no estÃ¡ en la venta")
        expected_discount = (birthday_item.unit_price / 2).quantize(MONEY_UNIT)
        if discount != expected_discount:
            raise HTTPException(status_code=400, detail="El descuento de cumpleaÃ±os no es vÃ¡lido")
        discount_reason = "BIRTHDAY"
    elif discount != 0:
        raise HTTPException(status_code=400, detail="El descuento requiere una razÃ³n vÃ¡lida")
    if discount > subtotal:
        raise HTTPException(status_code=400, detail="El descuento supera el subtotal")
    total = (subtotal - discount).quantize(MONEY_UNIT)

    payment_methods = [payment.method for payment in payload.payments]
    if len(payment_methods) != len(set(payment_methods)):
        raise HTTPException(status_code=400, detail="Hay métodos de pago repetidos")
    payment_total = sum(
        (payment.amount for payment in payload.payments), start=Decimal("0")
    ).quantize(MONEY_UNIT)
    if payment_total != total:
        raise HTTPException(
            status_code=400,
            detail="La suma de los pagos debe coincidir con el total",
        )

    payment_rows: list[Payment] = []
    for payment_payload in payload.payments:
        amount = payment_payload.amount.quantize(MONEY_UNIT)
        tendered = payment_payload.tendered_amount
        change = None
        if payment_payload.method == PaymentMethod.cash:
            tendered = (tendered or amount).quantize(MONEY_UNIT)
            if tendered < amount:
                raise HTTPException(
                    status_code=400,
                    detail="El efectivo recibido es menor al importe en efectivo",
                )
            change = (tendered - amount).quantize(MONEY_UNIT)
        elif tendered is not None:
            raise HTTPException(
                status_code=400,
                detail="Solo el efectivo puede incluir importe recibido",
            )
        payment_rows.append(
            Payment(
                method=payment_payload.method.value,
                amount=amount,
                tendered_amount=tendered,
                change_amount=change,
            )
        )

    sale = Sale(
        customer_id=payload.customer_id,
        barber_id=payload.barber_id,
        appointment_id=payload.appointment_id,
        subtotal=subtotal,
        discount=discount,
        discount_reason=discount_reason,
        total=total,
        status="COMPLETED",
        items=item_rows,
        payments=payment_rows,
    )
    db.add(sale)
    if appointment:
        appointment.status = "COMPLETED"
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La cita ya fue cobrada",
        ) from exc

    saved_sale = db.scalar(sale_query().where(Sale.id == sale.id))
    return serialize_sale(saved_sale)
