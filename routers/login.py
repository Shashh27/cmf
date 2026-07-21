"""Login + JWT refresh / logout / me endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.access_control import (
    LoginRequest,
    LoginResponse,
    LoginUserInfo,
    LogoutRequest,
    RefreshRequest,
    TokenResponse,
)
from auth.config import REFRESH_COOKIE_NAME
from auth.cookies import clear_refresh_cookie, set_refresh_cookie
from auth.deps import get_current_user
from auth.jwt import create_access_token, create_refresh_token, decode_token
from auth.password import hash_password, verify_and_needs_rehash
from auth.refresh_store import (
    get_valid_refresh_row,
    revoke_all_for_user,
    revoke_refresh_by_jti,
    rotate_refresh_token,
    store_refresh_token,
)
from auth.roles import normalize_role

login_router = APIRouter(prefix="/login", tags=["login"])
auth_router = APIRouter(prefix="/auth", tags=["auth"])


def _user_info(user: AccessUserModel) -> LoginUserInfo:
    info = LoginUserInfo.model_validate(user)
    info.role = normalize_role(info.role) or (info.role or "")
    return info


def _issue_tokens(response: Response, db: Session, user: AccessUserModel) -> tuple[str, str]:
    access = create_access_token(user.id, user.role)
    refresh, jti, expires_at = create_refresh_token(user.id, user.role)
    store_refresh_token(
        db,
        user_id=user.id,
        jti=jti,
        token=refresh,
        expires_at=expires_at,
    )
    set_refresh_cookie(response, refresh)
    return access, refresh


def _resolve_refresh_token(request: Request, body_token: Optional[str] = None) -> Optional[str]:
    if body_token:
        return body_token
    return request.cookies.get(REFRESH_COOKIE_NAME)


@login_router.post("/", response_model=LoginResponse)
def login(
    login_data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    """Authenticate and return access + refresh JWT (refresh also in body for cross-origin)."""
    user = (
        db.query(AccessUserModel)
        .filter(AccessUserModel.user_name == login_data.user_name)
        .first()
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    ok, needs_rehash = verify_and_needs_rehash(login_data.password, user.password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    if needs_rehash:
        user.password = hash_password(login_data.password)
        db.add(user)
        db.commit()
        db.refresh(user)

    access, refresh = _issue_tokens(response, db, user)
    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
        user=_user_info(user),
    )


@auth_router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(
    request: Request,
    response: Response,
    body: RefreshRequest,
    db: Session = Depends(get_db),
):
    """Validate refresh token and return a new access token (reuse same refresh token)."""
    raw = _resolve_refresh_token(request, body.refresh_token)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    try:
        payload = decode_token(raw, "refresh")
    except HTTPException:
        clear_refresh_cookie(response)
        raise

    jti = payload.get("jti")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError):
        clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    row = get_valid_refresh_row(db, jti=jti, token=raw) if jti else None
    if not row or row.user_id != user_id:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not user:
        clear_refresh_cookie(response)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    set_refresh_cookie(response, raw)
    access = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=access,
        refresh_token=raw,
        token_type="bearer",
        user=_user_info(user),
    )


@auth_router.post("/logout")
def logout(
    request: Request,
    response: Response,
    body: Optional[LogoutRequest] = None,
    db: Session = Depends(get_db),
):
    """Invalidate refresh token server-side."""
    raw = _resolve_refresh_token(request, body.refresh_token if body else None)
    if raw:
        try:
            payload = decode_token(raw, "refresh")
            jti = payload.get("jti")
            if jti:
                revoke_refresh_by_jti(db, jti)
            else:
                try:
                    revoke_all_for_user(db, int(payload["sub"]))
                except (TypeError, ValueError):
                    pass
        except HTTPException:
            pass
    clear_refresh_cookie(response)
    return {"ok": True}


@auth_router.get("/me", response_model=LoginUserInfo)
def me(current_user: AccessUserModel = Depends(get_current_user)):
    return _user_info(current_user)


# Back-compat export name used by routers.__init__
router = login_router
