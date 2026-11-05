from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from app.events.publisher import is_producer_ready

router = APIRouter()


@router.get("/health/live")
def health_live():
    return {
        "service": "user-service",
        "status": "up",
        "ts": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/health/ready")
def health_ready(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {
            "service": "user-service",
            "ready": True,
            "db": "up",
            "kafka": "up" if is_producer_ready() else "degraded",
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    except Exception:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "service": "user-service",
                "ready": False,
                "db": "down",
                "ts": datetime.now(timezone.utc).isoformat(),
            },
        )


@router.get("/health")
def health():
    return {"status": "ok", "service": "user-service"}
