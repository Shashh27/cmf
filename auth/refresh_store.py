"""Persist hashed refresh tokens with rotation and revoke-on-logout."""

import hashlib
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from DB.models.refresh_token import RefreshToken


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def store_refresh_token(
    db: Session,
    *,
    user_id: int,
    jti: str,
    token: str,
    expires_at: datetime,
) -> RefreshToken:
    row = RefreshToken(
        user_id=user_id,
        jti=jti,
        token_hash=hash_token(token),
        expires_at=expires_at,
        revoked=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_valid_refresh_row(db: Session, *, jti: str, token: str) -> RefreshToken | None:
    row = (
        db.query(RefreshToken)
        .filter(RefreshToken.jti == jti, RefreshToken.revoked.is_(False))
        .first()
    )
    if not row:
        return None
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    if row.token_hash != hash_token(token):
        return None
    return row


def revoke_refresh_by_jti(db: Session, jti: str) -> None:
    row = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
    if row and not row.revoked:
        row.revoked = True
        db.add(row)
        db.commit()


def revoke_all_for_user(db: Session, user_id: int) -> None:
    (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .update({"revoked": True}, synchronize_session=False)
    )
    db.commit()


def rotate_refresh_token(
    db: Session,
    *,
    old_jti: str,
    user_id: int,
    new_jti: str,
    new_token: str,
    expires_at: datetime,
) -> RefreshToken:
    revoke_refresh_by_jti(db, old_jti)
    return store_refresh_token(
        db,
        user_id=user_id,
        jti=new_jti,
        token=new_token,
        expires_at=expires_at,
    )
