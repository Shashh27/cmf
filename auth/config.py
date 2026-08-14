"""JWT and cookie settings from environment."""

import os
from datetime import timedelta


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


JWT_SECRET_KEY = os.getenv(
    "JWT_SECRET_KEY",
    "CHANGE-ME-cmf-jwt-secret-key-use-a-long-random-string",
)
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
JWT_REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("JWT_REFRESH_TOKEN_EXPIRE_DAYS", "7"))
JWT_ISSUER = os.getenv("JWT_ISSUER", "cmf-api")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "cmf-frontend")

REFRESH_COOKIE_NAME = os.getenv("REFRESH_COOKIE_NAME", "refresh_token")
COOKIE_SECURE = _bool(os.getenv("COOKIE_SECURE"), default=False)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_PATH = os.getenv("COOKIE_PATH", "/api/v1")

ACCESS_TOKEN_EXPIRE = timedelta(minutes=JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
REFRESH_TOKEN_EXPIRE = timedelta(days=JWT_REFRESH_TOKEN_EXPIRE_DAYS)
