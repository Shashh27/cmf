"""Create and verify JWT access / refresh tokens."""

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

import jwt
from jwt.exceptions import PyJWTError
from fastapi import HTTPException, status

from auth.config import (
    ACCESS_TOKEN_EXPIRE,
    JWT_ALGORITHM,
    JWT_AUDIENCE,
    JWT_ISSUER,
    JWT_SECRET_KEY,
    REFRESH_TOKEN_EXPIRE,
)
from auth.roles import normalize_role

TokenType = Literal["access", "refresh"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(
    *,
    user_id: int,
    role: str,
    token_type: TokenType,
) -> tuple[str, str, datetime]:
    """Return (jwt, jti, expires_at). Payload has no PII beyond role + sub."""
    now = _now()
    expire = now + (ACCESS_TOKEN_EXPIRE if token_type == "access" else REFRESH_TOKEN_EXPIRE)
    jti = str(uuid4())
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "role": normalize_role(role) or role,
        "type": token_type,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
        "jti": jti,
    }
    token = jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return token, jti, expire


def create_access_token(user_id: int, role: str) -> str:
    token, _, _ = create_token(user_id=user_id, role=role, token_type="access")
    return token


def create_refresh_token(user_id: int, role: str) -> tuple[str, str, datetime]:
    return create_token(user_id=user_id, role=role, token_type="refresh")


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any]:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
            options={"require": ["exp", "iat", "sub"]},
        )
    except PyJWTError:
        raise credentials_exc from None

    if payload.get("type") != expected_type:
        raise credentials_exc
    if not payload.get("sub"):
        raise credentials_exc
    return payload
