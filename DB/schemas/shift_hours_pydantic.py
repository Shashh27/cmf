from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel
from pydantic import ConfigDict

# Import ShiftHoursConfiguration model from scheduling module
from DB.models.scheduling import ShiftHoursConfiguration

class ShiftHoursConfigCreate(BaseModel):
    date: date
    working_day: bool
    number_of_shifts: int

    # model_config = {"from_attributes": True}


class ShiftHoursConfigUpdate(BaseModel):
    working_day: bool | None = None
    number_of_shifts: int | None = None

    # model_config = {"from_attributes": True}


class ShiftHoursConfigResponse(BaseModel):
    id: int
    date: date
    working_day: bool
    number_of_shifts: int

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
