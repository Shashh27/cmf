from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class AccessUserBase(BaseModel):
    user_name: str
    gmail: str
    role: str  # primary / default role
    center: Optional[str] = None
    group: Optional[str] = None


class AccessUserCreate(AccessUserBase):
    password: str
    # Optional extra roles (primary is always included server-side)
    roles: Optional[List[str]] = None


class AccessUserUpdate(BaseModel):
    user_name: Optional[str] = None
    gmail: Optional[str] = None
    role: Optional[str] = None
    center: Optional[str] = None
    group: Optional[str] = None
    password: Optional[str] = None
    roles: Optional[List[str]] = None


class AccessUserResponse(AccessUserBase):
    id: int
    createdAt: datetime
    updatedAt: datetime
    roles: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    user_name: str
    password: str
    # Selected portal role (multi-role users). Optional for single-role back-compat.
    role: Optional[str] = None


class LoginUserInfo(AccessUserBase):
    id: int
    createdAt: datetime
    updatedAt: datetime
    roles: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: LoginUserInfo


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: Optional[LoginUserInfo] = None
