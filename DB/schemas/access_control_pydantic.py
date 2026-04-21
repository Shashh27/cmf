from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date


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
    password: str
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    user_name: str
    password: str

class LoginResponse(AccessUserBase):
    id: int
    createdAt: datetime
    updatedAt: datetime
    
    class Config:
        from_attributes = True

class AccessUserResponseForOperator(BaseModel):
    id: int
    user_name: str
    gmail: str
    role: str
    center: Optional[str] = None
    group: Optional[str] = None
    
    class Config:
        from_attributes = True


# =======================
# Operator Leave Schemas
# =======================

class OperatorLeaveBase(BaseModel):
    operator_id: int
    from_date: date
    to_date: date
    reason: Optional[str] = None
    additional_remarks: Optional[str] = None
    status: str = "pending"

class OperatorLeaveCreate(OperatorLeaveBase):
    pass

class OperatorLeaveUpdate(BaseModel):
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    reason: Optional[str] = None
    additional_remarks: Optional[str] = None
    status: Optional[str] = None

class OperatorLeaveStatusUpdate(BaseModel):
    status: str  # 'acknowledged' or 'rejected'

class OperatorLeaveResponse(OperatorLeaveBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

    def dict(self, **kwargs):
        data = super().dict(**kwargs)
        # Remove additional_remarks if it's None, empty string, or placeholder values
        remarks = data.get('additional_remarks')
        if remarks is None or remarks == '' or remarks == 'string':
            data.pop('additional_remarks', None)
        return data