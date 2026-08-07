from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, UserSessionRead
from app.security import COOKIE_NAME, DUMMY_HASH, create_session_token, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])
DatabaseSession = Annotated[Session, Depends(get_db)]


def serialize_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "full_name": user.full_name, "role": user.role}


@router.post("/login", response_model=UserSessionRead)
def login(payload: LoginRequest, response: Response, db: DatabaseSession):
    user = db.scalar(select(User).where(func.lower(User.username) == payload.username))
    if user is None:
        verify_password(payload.password, DUMMY_HASH)
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos")
    settings = get_settings()
    response.set_cookie(
        key=COOKIE_NAME,
        value=create_session_token(user.id),
        max_age=settings.auth_session_hours * 60 * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
    return serialize_user(user)


@router.get("/me", response_model=UserSessionRead)
def current_user(request: Request):
    return serialize_user(request.state.user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
