from pydantic import BaseModel, field_validator, Field
from typing import Optional, List, Union, Annotated
from datetime import datetime
import re

def _parse_naive_datetime(v: Union[str, datetime]) -> datetime:
    if isinstance(v, datetime):
        return v.replace(tzinfo=None)
    if not isinstance(v, str):
        raise ValueError("Invalid datetime format")
    s = v.strip()
    s = re.sub(r'(Z|[+-]\d{2}:\d{2})$', '', s)
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        try:
            dt = datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            raise ValueError("Invalid datetime string")
    return dt.replace(tzinfo=None)


# =======================
# OEE Issues Schemas
# =======================
class OEEIssueBase(BaseModel):
    machine_id: int
    reported_by: int
    issue_category: str
    issue_reason: List[str]
    start_time: Annotated[datetime, Field(examples=["2026-02-23T10:00:00"])]
    end_time: Annotated[datetime, Field(examples=["2026-02-23T11:00:00"])]

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def _ensure_naive(cls, v):
        if v is None:
            return v
        return _parse_naive_datetime(v)

    @field_validator("issue_category")
    @classmethod
    def validate_category(cls, v: str):
        allowed = {"availability", "quality", "performance"}
        if v is None:
            raise ValueError("issue_category required")
        vv = v.strip().lower()
        if vv not in allowed:
            raise ValueError("issue_category must be one of Availability, Quality, Performance")
        return vv

    @field_validator("issue_reason")
    @classmethod
    def validate_reason(cls, v: List[str]):
        allowed = {
            "machine oeeissue",
            "tool change",
            "setup/adjustment",
            "power failure",
            "material shortage",
            "planned maintenance",
        }
        if not v or not isinstance(v, list):
            raise ValueError("issue_reason must be a non-empty list")
        norm = [s.strip().lower() for s in v]
        for s in norm:
            if s not in allowed:
                raise ValueError("invalid issue_reason value")
        return norm

    @field_validator("end_time")
    @classmethod
    def validate_times(cls, v: datetime, info):
        start = info.data.get("start_time")
        if start and v < start:
            raise ValueError("end_time must be >= start_time")
        return v


class OEEIssueCreate(OEEIssueBase):
    reported_at: Optional[datetime] = None


class OEEIssueUpdate(BaseModel):
    machine_id: Optional[int] = None
    reported_by: Optional[int] = None
    issue_category: Optional[str] = None
    issue_reason: Optional[List[str]] = None
    start_time: Optional[Annotated[datetime, Field(examples=["2026-02-23T10:00:00"])]] = None
    end_time: Optional[Annotated[datetime, Field(examples=["2026-02-23T11:00:00"])]] = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def validate_naive_datetime(cls, v):
        if v is None:
            return v
        return _parse_naive_datetime(v)


class OEEIssue(OEEIssueBase):
    id: int
    machine_name: Optional[str] = None
    operator_name: Optional[str] = None
    reported_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Machine Breakdown Schemas
# =======================
class MachineBreakdownBase(BaseModel):
    machine_id: int
    reported_by: int
    issue_category: str
    machine_status: str
    issue_reason: List[str]
    additional_reason: Optional[str] = None

    @field_validator("issue_category")
    @classmethod
    def validate_category(cls, v: str):
        allowed = {"availability", "quality", "performance"}
        if v is None:
            raise ValueError("issue_category required")
        vv = v.strip().lower()
        if vv not in allowed:
            raise ValueError("issue_category must be one of Availability, Quality, Performance")
        return vv

    @field_validator("issue_reason")
    @classmethod
    def validate_reason(cls, v: List[str]):
        allowed = {
            "machine breakdown",
            "electrical issue",
            "mechanical issue",
            "hydraulic issue",
            "pneumatic issue",
            "software issue",
            "emergency stop",
        }
        if not v or not isinstance(v, list):
            raise ValueError("issue_reason must be a non-empty list")
        norm = [s.strip().lower() for s in v]
        for s in norm:
            if s not in allowed:
                raise ValueError("invalid issue_reason value")
        return norm

    @field_validator("machine_status")
    @classmethod
    def validate_machine_status(cls, v: str):
        allowed = {"on", "off"}
        if v is None:
            raise ValueError("machine_status required")
        vv = v.strip().lower()
        if vv not in allowed:
            raise ValueError("machine_status must be one of ON, OFF")
        return "ON" if vv == "on" else "OFF"


class MachineBreakdownCreate(MachineBreakdownBase):
    reported_at: Optional[datetime] = None


class MachineBreakdownUpdate(BaseModel):
    machine_id: Optional[int] = None
    reported_by: Optional[int] = None
    issue_category: Optional[str] = None
    machine_status: Optional[str] = None
    issue_reason: Optional[List[str]] = None
    additional_reason: Optional[str] = None


class MachineBreakdown(MachineBreakdownBase):
    id: int
    machine_name: Optional[str] = None
    operator_name: Optional[str] = None
    reported_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# =======================
# Component Issues Schemas
# =======================
class ComponentIssueBase(BaseModel):
    machine_id: int
    reported_by: int
    component_status: str
    production_order_id: int
    part_id: int
    description: str

    @field_validator("component_status")
    @classmethod
    def validate_status(cls, v: str):
        allowed = {"available", "not available"}
        if v is None:
            raise ValueError("component_status required")
        vv = v.strip().lower()
        if vv not in allowed:
            raise ValueError("component_status must be one of Available, not available")
        return "Available" if vv == "available" else "not available"


class ComponentIssueCreate(ComponentIssueBase):
    reported_at: Optional[datetime] = None


class ComponentIssueUpdate(BaseModel):
    machine_id: Optional[int] = None
    reported_by: Optional[int] = None
    component_status: Optional[str] = None
    production_order_id: Optional[int] = None
    part_id: Optional[int] = None
    description: Optional[str] = None


class ComponentIssue(ComponentIssueBase):
    id: int
    machine_name: Optional[str] = None
    operator_name: Optional[str] = None
    order_name: Optional[str] = None
    part_name: Optional[str] = None
    reported_at: Optional[datetime] = None

    class Config:
        from_attributes = True
