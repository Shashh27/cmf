from datetime import date, time
from typing import List, Literal
from pydantic import BaseModel, Field, field_validator

ShiftCode = Literal["GENERAL", "OT"]

SHIFT_TIME_LOOKUP: dict[ShiftCode, tuple[time, time]] = {
    "GENERAL": (time(hour=8, minute=30), time(hour=17, minute=0)),
    "OT": (time(hour=17, minute=0), time(hour=21, minute=0)),
}


class ShiftTimingResponse(BaseModel):
    id: int
    shift_code: ShiftCode
    shift_start: time
    shift_end: time

    class Config:
        from_attributes = True

class ShiftHoursConfigCreate(BaseModel):
    date: date
    working_day: bool
    selected_shifts: List[ShiftCode] = Field(default_factory=list)

    @field_validator("selected_shifts")
    @classmethod
    def dedupe_and_validate_selected_shifts(cls, value: List[ShiftCode]) -> List[ShiftCode]:
        deduped = list(dict.fromkeys(value))
        if len(deduped) > 2:
            raise ValueError("A day can have at most two shifts: GENERAL and OT")
        return deduped

    # model_config = {"from_attributes": True}


class ShiftHoursConfigUpdate(BaseModel):
    working_day: bool | None = None
    selected_shifts: List[ShiftCode] | None = None

    @field_validator("selected_shifts")
    @classmethod
    def dedupe_and_validate_selected_shifts(cls, value: List[ShiftCode] | None) -> List[ShiftCode] | None:
        if value is None:
            return value
        deduped = list(dict.fromkeys(value))
        if len(deduped) > 2:
            raise ValueError("A day can have at most two shifts: GENERAL and OT")
        return deduped

    # model_config = {"from_attributes": True}


class ShiftHoursConfigResponse(BaseModel):
    id: int
    date: date
    working_day: bool
    number_of_shifts: int
    selected_shifts: List[ShiftCode]
    shift_timings: List[ShiftTimingResponse]

    class Config:
        from_attributes = True


###################################################################

# class ShiftHoursConfigurationBase(BaseModel):
#     date: date
#     working_day: bool = True
#     number_of_shifts: int = 1

# class ShiftHoursConfigurationCreate(ShiftHoursConfigurationBase):
#     pass

# class ShiftHoursConfigurationUpdate(BaseModel):
#     working_day: Optional[bool] = None
#     number_of_shifts: Optional[int] = None

# class ShiftHoursConfigurationOut(ShiftHoursConfigurationBase):
#     id: int
#     created_at: datetime

#     class Config:
#         orm_mode = True

# class ShiftHoursCalendarResponse(BaseModel):
#     month: int
#     year: int
#     configurations: List[ShiftHoursConfigurationOut]
