from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.db import Base

# Ensure models are registered on Base.metadata for autogenerate.
import app.models  # noqa: F401

# Alembic Config object, provides access to values within alembic.ini.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for "autogenerate" support.
target_metadata = Base.metadata


def _db_url() -> str:
    # Prefer explicit env. Keep a useful default for local docker-compose.
    url = os.getenv("DAA_DB_URL") or os.getenv("DATABASE_URL")
    if url:
        return url
    return "postgresql+psycopg://daa:daa@localhost:15432/daa"


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""

    context.configure(
        url=_db_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""

    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _db_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
