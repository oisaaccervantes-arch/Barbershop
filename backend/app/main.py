from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
from app.database import SessionLocal
from app.models.user import User
from app.security import COOKIE_NAME, decode_session_token
from app.routers.auth import router as auth_router
from app.routers.appointments import router as appointments_router
from app.routers.barbers import router as barbers_router
from app.routers.customers import router as customers_router
from app.routers.cash_shifts import router as cash_shifts_router
from app.routers.sales import router as sales_router
from app.routers.services import router as services_router
from app.routers.receptionists import router as receptionists_router
from pathlib import Path


app = FastAPI(
    title="Bizantino POS API",
    version="0.1.0",
)

FRONTEND_DIR = Path(__file__).resolve().parents[2]

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(appointments_router)
app.include_router(barbers_router)
app.include_router(customers_router)
app.include_router(cash_shifts_router)
app.include_router(sales_router)
app.include_router(services_router)
app.include_router(receptionists_router)
app.include_router(auth_router)


PUBLIC_API_PATHS = {"/api/auth/login", "/api/health", "/api/health/database"}


@app.middleware("http")
async def require_authenticated_session(request: Request, call_next):
    if request.method == "OPTIONS" or not request.url.path.startswith("/api/") or request.url.path in PUBLIC_API_PATHS:
        return await call_next(request)
    user_id = decode_session_token(request.cookies.get(COOKIE_NAME, ""))
    if user_id is None:
        return JSONResponse(status_code=401, content={"detail": "Sesión requerida"})
    with SessionLocal() as db:
        user = db.get(User, user_id)
        if user is None or not user.active:
            return JSONResponse(status_code=401, content={"detail": "Sesión inválida"})
        request.state.user = user
        response = await call_next(request)
    return response


@app.get("/")
def root():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/app.js", include_in_schema=False)
def frontend_javascript():
    return FileResponse(FRONTEND_DIR / "app.js", media_type="application/javascript")


@app.get("/styles.css", include_in_schema=False)
def frontend_styles():
    return FileResponse(FRONTEND_DIR / "styles.css", media_type="text/css")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/database")
def database_health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No fue posible conectar con PostgreSQL",
        ) from exc

    return {"status": "ok", "database": "connected"}
