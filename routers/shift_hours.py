from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, date
from calendar import monthrange

from DB.database import get_db
from DB.models.scheduling import ShiftHoursConfiguration
from DB.schemas.shift_hours_pydantic import (
    ShiftHoursConfigCreate,
    ShiftHoursConfigUpdate,
    ShiftHoursConfigResponse,
    # ShiftHoursCalendarResponse
)

router = APIRouter(
    prefix="/shift-hours",
    tags=["Shift Hours"]
)



# ---------------- CREATE ----------------
@router.post("/", response_model=ShiftHoursConfigResponse)
def create_shift_config(data: ShiftHoursConfigCreate, db: Session = Depends(get_db)):
    # Check if configuration already exists for this date
    existing = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.date == data.date
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Shift configuration already exists for {data.date}. Use PUT to update."
        )
    
    new_config = ShiftHoursConfiguration(**data.model_dump())
    db.add(new_config)
    db.commit()
    db.refresh(new_config)
    
    return ShiftHoursConfigResponse(
        id=new_config.id,
        date=new_config.date,
        working_day=new_config.working_day,
        number_of_shifts=new_config.number_of_shifts
    )




# ---------------- GET ALL ----------------
@router.get("/", response_model=list[ShiftHoursConfigResponse])
def get_all_shift_configs(db: Session = Depends(get_db)):
    configs = (
        db.query(ShiftHoursConfiguration)
        .order_by(ShiftHoursConfiguration.date.asc())   # sort by date
        .all()
    )

    return [
        ShiftHoursConfigResponse(
            id=c.id,
            date=c.date,
            working_day=c.working_day,        # True or False
            number_of_shifts=c.number_of_shifts
        )
        for c in configs
    ]


# ---------------- GET ONE ----------------
@router.get("/{config_id}", response_model=ShiftHoursConfigResponse)
def get_shift_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    return ShiftHoursConfigResponse(
        id=config.id,
        date=config.date,
        working_day=config.working_day,
        number_of_shifts=config.number_of_shifts
    )







# ---------------- GET ALL ----------------
# @router.get("/", response_model=List[ShiftHoursConfigResponse])
# def get_all_shift_configs(db: Session = Depends(get_db)):
#     configs = db.query(ShiftHoursConfiguration).all()
#     return configs


# ---------------- GET ONE ----------------
# @router.get("/{config_id}", response_model=ShiftHoursConfigResponse)
# def get_shift_config(config_id: int, db: Session = Depends(get_db)):
#     config = db.query(ShiftHoursConfiguration).filter(
#         ShiftHoursConfiguration.id == config_id
#     ).first()

#     if not config:
#         raise HTTPException(404, "Shift configuration not found")

#     return config



# ---------------- UPDATE ----------------
@router.put("/{config_id}", response_model=ShiftHoursConfigResponse)
def update_shift_config(
    config_id: int, data: ShiftHoursConfigUpdate, 
    db: Session = Depends(get_db)
):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    if data.working_day is not None:
        config.working_day = data.working_day

    if data.number_of_shifts is not None:
        config.number_of_shifts = data.number_of_shifts

    db.commit()
    db.refresh(config)
    
    return ShiftHoursConfigResponse(
        id=config.id,
        date=config.date,
        working_day=config.working_day,
        number_of_shifts=config.number_of_shifts
    )



# ---------------- DELETE ----------------
@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    db.delete(config)
    db.commit()
    return None




##########################################################################################################
