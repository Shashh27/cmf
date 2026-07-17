from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AccessUserBase(BaseModel):
    user_name: str
    gmail: str
    role: str
    center: Optional[str] = None
    group: Optional[str] = None


class AccessUserCreate(AccessUserBase):
    password: str


class AccessUserUpdate(BaseModel):
    user_name: Optional[str] = None
    gmail: Optional[str] = None
    role: Optional[str] = None
    center: Optional[str] = None
    group: Optional[str] = None
    password: Optional[str] = None


class AccessUserResponse(AccessUserBase):
    id: int
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class LoginRequest(BaseModel):
    user_name: str
    password: str


class LoginUserInfo(AccessUserBase):
    id: int
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    user: LoginUserInfo
