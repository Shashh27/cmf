from datetime import date, time
from typing import List, Literal, Union
from pydantic import BaseModel, Field, field_validator

ShiftCode = Literal["GENERAL", "NEXT", "NON_WORKING", "CUSTOM"]

SHIFT_TIME_LOOKUP: dict[ShiftCode, tuple[time, time]] = {
    "GENERAL": (time(hour=8, minute=30), time(hour=17, minute=0)),
    "NEXT": (time(hour=17, minute=0), time(hour=21, minute=0)),
    "NON_WORKING": (time(hour=8, minute=30), time(hour=13, minute=0)),
    "CUSTOM": (time(hour=0, minute=0), time(hour=0, minute=0)),  # Will be overridden
}


class ShiftTimingResponse(BaseModel):
    id: int
    shift_code: ShiftCode
    shift_start: time
    shift_end: time
    custom_start: time | None = None
    custom_end: time | None = None

    class Config:
        from_attributes = True

class ShiftHoursConfigCreate(BaseModel):
    date: date
    working_day: bool
    selected_shifts: List[ShiftCode] = Field(default_factory=list)
    custom_start: time | None = None
    custom_end: time | None = None

    @field_validator("selected_shifts")
    @classmethod
    def validate_shift_selection(cls, value: List[ShiftCode], info) -> List[ShiftCode]:
        deduped = list(dict.fromkeys(value))
        
        # Get working_day from the data
        working_day = info.data.get('working_day', True)
        
        # Validation rules
        if len(deduped) > 2:
            raise ValueError("A day can have at most two shifts")
        
        # NEXT shift can only be selected with GENERAL on working days
        if "NEXT" in deduped and "GENERAL" not in deduped:
            raise ValueError("NEXT shift can only be selected along with GENERAL shift")
        
        if "NEXT" in deduped and not working_day:
            raise ValueError("NEXT shift is only applicable for working days")
        
        # NON_WORKING shift only for non-working days
        if "NON_WORKING" in deduped and working_day:
            raise ValueError("NON_WORKING shift is only applicable for non-working days")
        
        # Cannot combine NON_WORKING with other shifts
        if "NON_WORKING" in deduped and len(deduped) > 1:
            raise ValueError("NON_WORKING shift cannot be combined with other shifts")
        
        # If CUSTOM is selected, validate custom times are provided
        if "CUSTOM" in deduped:
            custom_start = info.data.get('custom_start')
            custom_end = info.data.get('custom_end')
            if not custom_start or not custom_end:
                raise ValueError("Custom shift requires both custom_start and custom_end times")
            if custom_start >= custom_end:
                raise ValueError("custom_start must be before custom_end")
        
        return deduped

    # model_config = {"from_attributes": True}


class ShiftHoursConfigUpdate(BaseModel):
    working_day: bool | None = None
    selected_shifts: List[ShiftCode] | None = None
    custom_start: time | None = None
    custom_end: time | None = None

    @field_validator("selected_shifts")
    @classmethod
    def validate_shift_selection(cls, value: List[ShiftCode] | None, info) -> List[ShiftCode] | None:
        if value is None:
            return value
            
        deduped = list(dict.fromkeys(value))
        
        # Get working_day from the data or assume current value
        working_day = info.data.get('working_day')
        
        # Validation rules
        if len(deduped) > 2:
            raise ValueError("A day can have at most two shifts")
        
        # NEXT shift can only be selected with GENERAL on working days
        if "NEXT" in deduped and "GENERAL" not in deduped:
            raise ValueError("NEXT shift can only be selected along with GENERAL shift")
        
        if "NEXT" in deduped and working_day is False:
            raise ValueError("NEXT shift is only applicable for working days")
        
        # NON_WORKING shift only for non-working days
        if "NON_WORKING" in deduped and working_day is True:
            raise ValueError("NON_WORKING shift is only applicable for non-working days")
        
        # Cannot combine NON_WORKING with other shifts
        if "NON_WORKING" in deduped and len(deduped) > 1:
            raise ValueError("NON_WORKING shift cannot be combined with other shifts")
        
        # If CUSTOM is selected, validate custom times are provided
        if "CUSTOM" in deduped:
            custom_start = info.data.get('custom_start')
            custom_end = info.data.get('custom_end')
            if not custom_start or not custom_end:
                raise ValueError("Custom shift requires both custom_start and custom_end times")
            if custom_start >= custom_end:
                raise ValueError("custom_start must be before custom_end")
        
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
