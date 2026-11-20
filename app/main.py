import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models  # noqa: F401
from app.api.auth import router as auth_router
from app.api.carts import router as carts_router
from app.api.orders import router as orders_router
from app.api.payments import router as payments_router
from app.api.products import router as products_router
from app.api.users import router as users_router
from app.core.config import settings
from app.db.session import SessionLocal, get_db
from app.services.expiry import ReservationExpiryService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("artisan_cafe_pos")


async def reservation_expiry_worker():
    """Background task monitoring and expiring unpaid stock reservations."""
    while True:
        db = None
        try:
            db = SessionLocal()
            service = ReservationExpiryService(db)
            expired_count = await asyncio.to_thread(
                service.expire_due_reservations
            )
            if expired_count > 0:
                logger.info(f"Released {expired_count} expired reservation(s)")
        except Exception as exc:
            logger.error(f"Reservation expiry worker error: {exc}", exc_info=True)
        finally:
            if db is not None:
                db.close()
        await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    worker = asyncio.create_task(reservation_expiry_worker())
    logger.info("Artisan Café POS backend initialized. Worker started.")
    yield
    worker.cancel()
    try:
        await worker
    except asyncio.CancelledError:
        pass
    logger.info("Artisan Café POS background worker stopped.")


app = FastAPI(
    title="Artisan Café POS API",
    description="Enterprise point-of-sale and stock management system with concurrency-safe checkout and idempotency protection.",
    version="1.0.0",
    lifespan=lifespan,
)

# Robust CORS Configuration:
# In development, permits local Vite frontend hosts.
# In production, strictly requires explicit trusted domains without wildcard regex leakage.
frontend_url_env = os.getenv("FRONTEND_URL", settings.frontend_url)
frontend_origins = [url.strip() for url in frontend_url_env.split(",") if url.strip()]
frontend_origins.extend([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
])

# Optional strictly configured regex for multi-tenant deployment staging
origin_regex = os.getenv("CORS_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(set(frontend_origins)),
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(products_router)
app.include_router(carts_router)
app.include_router(payments_router)
app.include_router(orders_router)


@app.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
    """Liveness and readiness probe that actively validates database connectivity."""
    try:
        db.execute(text("SELECT 1"))
        db_status = "connected"
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(exc),
            },
        )

    return {
        "status": "ok",
        "service": "Artisan Café POS API",
        "database": db_status,
        "environment": settings.environment,
        "version": "1.0.0",
    }
