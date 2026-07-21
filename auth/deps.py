"""FastAPI auth dependencies: JWT Bearer enforcement + current user."""

from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from starlette.responses import JSONResponse

from DB.database import SessionLocal, get_db
from DB.models.access_control import AccessUser
from auth.jwt import decode_token
from auth.roles import normalize_role

# Paths that do not require a Bearer access token (method, path suffix match).
_PUBLIC_EXACT = {
    ("POST", "/api/v1/login"),
    ("POST", "/api/v1/login/"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/auth/refresh/"),
    ("POST", "/api/v1/auth/logout"),
    ("POST", "/api/v1/auth/logout/"),
    ("GET", "/api/v1/machines/verify"),
    ("GET", "/api/v1/machines"),
    ("GET", "/api/v1/machines/"),
}


# App metadata + Swagger/ReDoc (no JWT — API calls from docs still need Bearer)
_PUBLIC_PATH_PREFIXES = (
    "/docs",
    "/redoc",
)
_PUBLIC_PATHS = {
    "/",
    "/health",
    "/info",
    "/openapi.json",
}


def is_public_request(request: Request) -> bool:
    method = request.method.upper()
    path = request.url.path

    if path in _PUBLIC_PATHS or path.rstrip("/") in _PUBLIC_PATHS:
        return True
    if any(path == p or path.startswith(p + "/") for p in _PUBLIC_PATH_PREFIXES):
        return True

    if (method, path) in _PUBLIC_EXACT:
        return True
    alt = path.rstrip("/") if path != "/" else path
    alt_slash = alt + "/"
    return (method, alt) in _PUBLIC_EXACT or (method, alt_slash) in _PUBLIC_EXACT


def extract_bearer_token(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None


_bearer_scheme = HTTPBearer(auto_error=False, scheme_name="BearerAuth")


async def get_bearer_token(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[str]:
    """Extract Bearer token from Authorization header (HTTP + WebSocket)."""
    if credentials:
        return credentials.credentials
    return None


def _load_user_from_access_token(token: str, db: Session) -> AccessUser:
    payload = decode_token(token, "access")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(AccessUser).filter(AccessUser.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(get_bearer_token),
) -> AccessUser:
    """Require authenticated user for the endpoint."""
    cached = getattr(request.state, "current_user", None)
    if cached is not None:
        return cached
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _load_user_from_access_token(token, db)
    request.state.current_user = user
    return user


def require_roles(*allowed_roles: str):
    """Dependency factory: enforce role membership (centralized RBAC helper)."""
    allowed = {normalize_role(r) for r in allowed_roles}

    async def _checker(user: AccessUser = Depends(get_current_user)) -> AccessUser:
        role = normalize_role(user.role)
        if role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return _checker


async def jwt_auth_http_middleware(request: Request, call_next):
    """
    HTTP-only JWT gate. WebSocket routes skip this middleware and use
    Depends(get_current_user) or remain open until explicitly secured.
    """
    # CORS preflight — never require JWT (browser sends OPTIONS before POST)
    if request.method.upper() == "OPTIONS":
        return await call_next(request)

    if is_public_request(request):
        request.state.current_user = None
        return await call_next(request)

    token = extract_bearer_token(request.headers.get("authorization"))
    if not token:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Not authenticated"},
            headers={"WWW-Authenticate": "Bearer"},
        )

    db = SessionLocal()
    try:
        user = _load_user_from_access_token(token, db)
        request.state.current_user = user
    except HTTPException as exc:
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=dict(exc.headers or {}),
        )
    finally:
        db.close()

    return await call_next(request)
