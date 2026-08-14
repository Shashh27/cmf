import os

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker, declarative_base

from DB.audit_context import get_audit_user
from DB.db_config import get_database_url

# Built from DB_HOST / DB_NAME / DB_USER / DB_PASSWORD in .env (or explicit DATABASE_URL).
DATABASE_URL = get_database_url()

# MinIO configuration (unchanged defaults for local/dev)
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "172.18.7.91:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET_NAME = os.getenv("MINIO_BUCKET_NAME", "cmf")
MINIO_SECURE = os.getenv("MINIO_SECURE", "False").lower() in ("1", "true", "yes")

_pool_size = int(os.getenv("DB_POOL_SIZE", "10"))
_max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "10"))

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_timeout=30,
    pool_recycle=1800,
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


@event.listens_for(SessionLocal, "after_begin")
def _set_audit_user(session, transaction, connection):
    """Push the request's user into transaction-local settings for the audit
    trigger. Uses set_config(..., is_local => true) so the value auto-clears at
    commit/rollback and never leaks across pooled connections."""
    user = get_audit_user()
    if not user:
        return
    connection.exec_driver_sql(
        "SELECT set_config('app.current_user', %(name)s, true),"
        " set_config('app.current_user_id', %(uid)s, true),"
        " set_config('app.current_user_role', %(role)s, true)",
        {
            "name": (user.get("name") or ""),
            "uid": ("" if user.get("id") is None else str(user["id"])),
            "role": (user.get("role") or ""),
        },
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_database_connection() -> None:
    """Lightweight readiness check — no DDL."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


# Schemas referenced by SQLAlchemy models (must exist before create_all).
_APP_SCHEMAS = (
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
)


def ensure_app_schemas() -> None:
    """Create application schemas if missing (used with ALLOW_AUTO_SCHEMA bootstrap)."""
    with engine.begin() as conn:
        for schema in _APP_SCHEMAS:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema}"))
