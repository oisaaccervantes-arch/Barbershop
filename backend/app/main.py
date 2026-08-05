from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.database import engine
from app.routers.appointments import router as appointments_router
from app.routers.barbers import router as barbers_router
from app.routers.customers import router as customers_router
from app.routers.cash_shifts import router as cash_shifts_router
from app.routers.sales import router as sales_router
from app.routers.services import router as services_router


app = FastAPI(
    title="Bizantino POS API",
    version="0.1.0",
)

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


@app.get("/")
def root():
    return {"message": "Bizantino POS API funcionando"}


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
