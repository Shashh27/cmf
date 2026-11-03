"""Build DATABASE_URL from backend/.env (single place for host/db/password)."""

from __future__ import annotations

import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "172.18.7.86")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "CMF_Demo")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")


def build_url(user: str, password: str, host: str, port: str, db: str) -> str:
    return (
        f"postgresql+psycopg2://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}/{db}"
    )


def get_database_url() -> str:
    """Runtime / Alembic URL. Explicit DATABASE_URL overrides the parts."""
    explicit = os.getenv("DATABASE_URL")
    if explicit:
        return explicit
    return build_url(DB_USER, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME)


def get_migration_database_url() -> str:
    """Same as runtime URL (single postgres user)."""
    explicit = os.getenv("MIGRATION_DATABASE_URL")
    if explicit:
        return explicit
    return get_database_url()
