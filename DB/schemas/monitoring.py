from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class MachineLiveStatusBase(BaseModel):
    machine_id: int
    status: str
    current_order_id: Optional[int] = None
    current_part_id: Optional[int] = None
    current_operation_id: Optional[int] = None

class MachineLiveStatusCreate(MachineLiveStatusBase):
    pass

class MachineLiveStatus(MachineLiveStatusBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

class MachineLiveHistoryBase(BaseModel):
    machine_id: int
    status: str
    current_order_id: Optional[int] = None
    current_part_id: Optional[int] = None
    current_operation_id: Optional[int] = None

class MachineLiveHistoryCreate(MachineLiveHistoryBase):
    pass

class MachineLiveHistory(MachineLiveHistoryBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True

class LiveMonitoringDisplay(BaseModel):
    machine_id: int
    machine_name: str
    status: str
    last_updated: datetime
    sale_order_number: Optional[str] = None
    part_number: Optional[str] = None
    operation_name: Optional[str] = None
    operation_number: Optional[str] = None
    completed_qty: int = 0
    target_qty: int = 0
    
    class Config:
        from_attributes = True
