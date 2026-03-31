from datetime import date, time
from typing import List, Literal, Union
from pydantic import BaseModel, Field, field_validator, model_validator

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
        
        # NEXT shift can be selected alone or with GENERAL on any day (working or non-working)
        if "NEXT" in deduped and "GENERAL" in deduped and len(deduped) > 2:
            raise ValueError("NEXT shift with GENERAL can only have at most 2 shifts")
        
        # NON_WORKING shift can be selected on any day (working or non-working)
        # Cannot combine NON_WORKING with other shifts
        if "NON_WORKING" in deduped and len(deduped) > 1:
            raise ValueError("NON_WORKING shift cannot be combined with other shifts")
        
        # CUSTOM shift can be selected on any day
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

    @model_validator(mode='after')
    def validate_shift_selection(self):
        selected_shifts = self.selected_shifts
        if selected_shifts is None:
            return self
            
        deduped = list(dict.fromkeys(selected_shifts))
        
        # Validation rules
        if len(deduped) > 2:
            raise ValueError("A day can have at most two shifts")
        
        # NEXT shift can be selected alone or with GENERAL on any day (working or non-working)
        if "NEXT" in deduped and "GENERAL" in deduped and len(deduped) > 2:
            raise ValueError("NEXT shift with GENERAL can only have at most 2 shifts")
        
        # NON_WORKING shift can be selected on any day (working or non-working)
        # Cannot combine NON_WORKING with other shifts
        if "NON_WORKING" in deduped and len(deduped) > 1:
            raise ValueError("NON_WORKING shift cannot be combined with other shifts")
        
        # CUSTOM shift can be selected on any day
        # If CUSTOM is selected, validate custom times are provided
        if "CUSTOM" in deduped:
            if not self.custom_start or not self.custom_end:
                raise ValueError("Custom shift requires both custom_start and custom_end times")
            if self.custom_start >= self.custom_end:
                raise ValueError("custom_start must be before custom_end")
        
        self.selected_shifts = deduped
        return self

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
