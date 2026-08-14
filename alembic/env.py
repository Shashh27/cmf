"""Alembic environment — uses MIGRATION_DATABASE_URL (cmf_owner) when set."""

from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool, text

# backend/ on sys.path so "DB" imports resolve when running from backend/
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

load_dotenv(BACKEND_ROOT / ".env")

from DB.database import Base  # noqa: E402
from DB.db_config import get_migration_database_url  # noqa: E402
import DB.models  # noqa: E402,F401 — register all models on Base.metadata

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Built from DB_* in .env (or explicit MIGRATION_DATABASE_URL).
_migration_url = get_migration_database_url()
config.set_main_option("sqlalchemy.url", _migration_url.replace("%", "%%"))


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # Ensure app schemas exist before table migrations (owner role).
        for schema in (
            "accesscontrol",
            "oms",
            "configuration",
            "inventory",
            "documents",
            "maintenance",
            "ems",
            "notifications",
            "production_monitoring",
            "chatbox",
        ):
            connection.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
        connection.commit()

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
