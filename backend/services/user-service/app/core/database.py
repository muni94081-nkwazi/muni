import re
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

def get_engine_url(url: str) -> str:
    # If postgresql:// is provided without driver, psycopg2 will be used by SQLAlchemy
    # Clean query parameters like ?schema=public if not directly supported by engine
    clean_url = re.sub(r"[?&]schema=[^&]+", "", url)
    return clean_url

engine = create_engine(
    get_engine_url(settings.DATABASE_URL),
    pool_pre_ping=True,
    # SQLite compatibility for testing
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
