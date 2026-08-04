"""HTTP cookie helpers for refresh tokens."""

from fastapi import Response

from auth.config import (
    COOKIE_PATH,
    COOKIE_SAMESITE,
    COOKIE_SECURE,
    REFRESH_COOKIE_NAME,
    REFRESH_TOKEN_EXPIRE,
)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path=COOKIE_PATH,
        max_age=int(REFRESH_TOKEN_EXPIRE.total_seconds()),
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=True,
        samesite=COOKIE_SAMESITE,
    )
