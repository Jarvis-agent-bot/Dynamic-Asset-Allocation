from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def _db_url() -> str:
    # Prefer explicit env. Keep a useful default for local docker-compose.
    url = os.getenv("DAA_DB_URL") or os.getenv("DATABASE_URL")
    if url:
        return url
    return "postgresql+psycopg://daa:daa@localhost:15432/daa"


_engine = None
_SessionLocal = None


def engine():
    global _engine
    if _engine is None:
        _engine = create_engine(_db_url(), pool_pre_ping=True)
    return _engine


def SessionLocal():
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=engine(), autocommit=False, autoflush=False, expire_on_commit=False)
    return _SessionLocal
