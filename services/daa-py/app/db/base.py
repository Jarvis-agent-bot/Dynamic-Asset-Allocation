from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for future persistence.

    The Python engine is currently stateless. We keep this base so Alembic can
    target a stable metadata object once we add models.
    """

    pass
