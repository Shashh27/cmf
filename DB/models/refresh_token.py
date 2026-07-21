"""SQLAlchemy model for hashed refresh tokens (never store plain tokens)."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, func

from ..database import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = {"schema": "accesscontrol"}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    jti = Column(String(64), unique=True, nullable=False, index=True)
    token_hash = Column(String(128), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
