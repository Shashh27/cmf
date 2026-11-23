from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from ..database import Base


class AccessUser(Base):
    __tablename__ = "access_users"
    __table_args__ = {"schema": "accesscontrol"}

    id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, unique=True, nullable=False)
    gmail = Column(String, unique=True, nullable=False)
    role = Column(String, nullable=False)  # primary / default role (kept for back-compat)
    center = Column(String)
    group = Column(String)
    password = Column(String, nullable=False)
    createdAt = Column(DateTime, default=func.now())
    updatedAt = Column(DateTime, default=func.now(), onupdate=func.now())

    extra_roles = relationship(
        "AccessUserRole",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class AccessUserRole(Base):
    """Additional (and primary) roles a user may activate at login."""

    __tablename__ = "access_user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role", name="uq_access_user_roles_user_role"),
        {"schema": "accesscontrol"},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("accesscontrol.access_users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())

    user = relationship("AccessUser", back_populates="extra_roles")
