from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.security import hash_password


router = APIRouter(prefix="/api/users", tags=["users"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def require_admin(request: Request) -> User:
    if request.state.user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Se requiere acceso de administración")
    return request.state.user


def serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "active": user.active,
    }


def ensure_unique_username(db: Session, username: str, excluded_id: int | None = None) -> None:
    query = select(User.id).where(func.lower(User.username) == username.lower())
    if excluded_id is not None:
        query = query.where(User.id != excluded_id)
    if db.scalar(query.limit(1)):
        raise HTTPException(status_code=409, detail="Ese nombre de usuario ya está registrado")


@router.get("", response_model=list[UserRead])
def list_users(request: Request, db: DatabaseSession):
    require_admin(request)
    rows = db.scalars(select(User).order_by(User.full_name, User.id)).all()
    return [serialize_user(row) for row in rows]


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, request: Request, db: DatabaseSession):
    require_admin(request)
    ensure_unique_username(db, payload.username)
    user = User(
        username=payload.username,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.put("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, request: Request, db: DatabaseSession):
    current = require_admin(request)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current.id and payload.role != "ADMIN":
        raise HTTPException(status_code=409, detail="No puedes quitar tu propio acceso de administración")
    ensure_unique_username(db, payload.username, user.id)
    user.username = payload.username
    user.full_name = payload.full_name
    user.role = payload.role
    if payload.password:
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return serialize_user(user)


@router.patch("/{user_id}/active", response_model=UserRead)
def toggle_user(user_id: int, request: Request, db: DatabaseSession):
    current = require_admin(request)
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if user.id == current.id and user.active:
        raise HTTPException(status_code=409, detail="No puedes desactivar tu propia cuenta")
    user.active = not user.active
    db.commit()
    db.refresh(user)
    return serialize_user(user)
