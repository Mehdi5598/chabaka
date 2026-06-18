import os
import time

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Defaults match docker-compose. Override with DATABASE_URL in any other env.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg://outage:outage@db:5432/outage",
)

# Engine connects lazily on first query, so importing this module never blocks.
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(retries: int = 12, delay: float = 2.0):
    """Create tables, retrying while Postgres finishes booting."""
    from . import models  # noqa: F401  (register models on Base)

    last_err = None
    for _ in range(retries):
        try:
            Base.metadata.create_all(bind=engine)
            return
        except Exception as err:  # pragma: no cover - startup race only
            last_err = err
            time.sleep(delay)
    raise last_err
