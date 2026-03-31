from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from DB.database import get_db
from DB.models.scheduling import ShiftHoursConfiguration, ShiftTimingConfiguration
from DB.schemas.shift_hours_pydantic import (
    ShiftHoursConfigCreate,
    ShiftHoursConfigUpdate,
    ShiftHoursConfigResponse,
    ShiftTimingResponse,
    ShiftCode,
    SHIFT_TIME_LOOKUP,
    # ShiftHoursCalendarResponse
)

router = APIRouter(
    prefix="/shift-hours",
    tags=["Shift Hours"]
)


def _sync_shift_timings(config, selected_shifts, db: Session, custom_start=None, custom_end=None):
    config.shift_timings.clear()
    
    db.flush()  # 👈 IMPORTANT FIX

    for shift_code in selected_shifts:
        if shift_code == "CUSTOM":
            start_time = custom_start
            end_time = custom_end
        else:
            start_time, end_time = SHIFT_TIME_LOOKUP[shift_code]
        
        timing_config = ShiftTimingConfiguration(
            shift_code=shift_code,
            shift_start=start_time,
            shift_end=end_time,
        )
        
        # Add custom times for CUSTOM shifts
        if shift_code == "CUSTOM":
            timing_config.custom_start = custom_start
            timing_config.custom_end = custom_end
            
        config.shift_timings.append(timing_config)

    # number_of_shifts is 2 only when both GENERAL and NEXT are selected
    if "GENERAL" in selected_shifts and "NEXT" in selected_shifts:
        config.number_of_shifts = 2
    else:
        config.number_of_shifts = len(selected_shifts)



# def _sync_shift_timings(
#     config: ShiftHoursConfiguration,
#     selected_shifts: list[ShiftCode],
# ) -> None:
#     config.shift_timings.clear()
#     for shift_code in selected_shifts:
#         start_time, end_time = SHIFT_TIME_LOOKUP[shift_code]
#         config.shift_timings.append(
#             ShiftTimingConfiguration(
#                 shift_code=shift_code,
#                 shift_start=start_time,
#                 shift_end=end_time,
#             )
#         )
    # Keep parent table strictly in sync with linked timings.
    # config.number_of_shifts = len(selected_shifts)


def _enforce_shift_count_consistency(config: ShiftHoursConfiguration) -> None:
    """Ensure number_of_shifts matches the actual shift timings count."""
    timing_count = len(config.shift_timings)
    if timing_count > 0:
        # number_of_shifts is 2 only when both GENERAL and NEXT are selected
        has_general = any(t.shift_code == "GENERAL" for t in config.shift_timings)
        has_next = any(t.shift_code == "NEXT" for t in config.shift_timings)
        if has_general and has_next:
            config.number_of_shifts = 2
        else:
            config.number_of_shifts = timing_count
    else:
        config.number_of_shifts = 0 if not config.working_day else 1


def _build_response(config: ShiftHoursConfiguration) -> ShiftHoursConfigResponse:
    _enforce_shift_count_consistency(config)
    sorted_timings = sorted(config.shift_timings, key=lambda t: t.shift_start)
    selected_shifts = [timing.shift_code for timing in sorted_timings]
    return ShiftHoursConfigResponse(
        id=config.id,
        date=config.date,
        working_day=config.working_day,
        number_of_shifts=config.number_of_shifts,
        selected_shifts=selected_shifts,
        shift_timings=[
            ShiftTimingResponse(
                id=timing.id,
                shift_code=timing.shift_code,
                shift_start=timing.shift_start,
                shift_end=timing.shift_end,
                custom_start=timing.custom_start,
                custom_end=timing.custom_end
            ) for timing in sorted_timings
        ],
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
    
    selected_shifts = data.selected_shifts
    custom_start = data.custom_start
    custom_end = data.custom_end
    number_of_shifts = len(selected_shifts)

    # Default behaviour: non-working day with no selected shifts has 0 shifts.
    # Dedicated non-working-day shifts are still allowed when selected.
    if data.working_day and number_of_shifts == 0:
        number_of_shifts = 1
        selected_shifts = ["GENERAL"]

    new_config = ShiftHoursConfiguration(
        date=data.date,
        working_day=data.working_day,
        number_of_shifts=0,  # Will be set correctly by _sync_shift_timings and _enforce_shift_count_consistency
    )
    _sync_shift_timings(new_config, selected_shifts, db, custom_start, custom_end)
    _enforce_shift_count_consistency(new_config)
    db.add(new_config)
    db.commit()
    db.refresh(new_config)

    return _build_response(new_config)




# ---------------- GET ALL ----------------
@router.get("/", response_model=list[ShiftHoursConfigResponse])
def get_all_shift_configs(db: Session = Depends(get_db)):
    configs = (
        db.query(ShiftHoursConfiguration)
        .order_by(ShiftHoursConfiguration.date.asc())   # sort by date
        .all()
    )

    return [_build_response(c) for c in configs]


# ---------------- GET ONE ----------------
@router.get("/{config_id}", response_model=ShiftHoursConfigResponse)
def get_shift_config(config_id: int, db: Session = Depends(get_db)):
    config = db.query(ShiftHoursConfiguration).filter(
        ShiftHoursConfiguration.id == config_id
    ).first()

    if not config:
        raise HTTPException(404, "Shift configuration not found")

    return _build_response(config)







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

    if data.selected_shifts is not None:
        selected_shifts = data.selected_shifts
        custom_start = data.custom_start
        custom_end = data.custom_end
        number_of_shifts = len(selected_shifts)

        if config.working_day and number_of_shifts == 0:
            number_of_shifts = 1
            selected_shifts = ["GENERAL"]

        _sync_shift_timings(config, selected_shifts, db, custom_start, custom_end)
    elif data.working_day is not None and config.working_day and not config.shift_timings:
        _sync_shift_timings(config, ["GENERAL"], db)

    _enforce_shift_count_consistency(config)

    db.commit()
    db.refresh(config)

    return _build_response(config)



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
