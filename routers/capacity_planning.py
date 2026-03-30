from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
import calendar
from datetime import date

from DB.database import get_db
from DB.models.scheduling import MachineStatus, ShiftHoursConfiguration, Status, MachineDowntime, EfficiencyFactor
from DB.models.configuration import Machine   # adjust path if needed


from DB.schemas.capacity_planning import (
    MachineUtilization,
    EfficiencyCreate,
    EfficiencyUpdate,
    EfficiencyResponse
)

router = APIRouter(
    prefix="/machine-utilization",
    tags=["Machine Utilization"]
)


def _configured_shift_hours(config: ShiftHoursConfiguration) -> float:
    if not config.working_day and config.number_of_shifts == 0:
        return 0.0
    if config.shift_timings:
        total = 0.0
        for timing in config.shift_timings:
            start_dt = datetime.combine(config.date, timing.shift_start)
            end_dt = datetime.combine(config.date, timing.shift_end)
            total += (end_dt - start_dt).total_seconds() / 3600
        return max(total, 0.0)
    return float(config.number_of_shifts * 8)



# get machine utilization by month
@router.get("/machine-utilization", response_model=List[MachineUtilization])
def get_machine_utilization(
    db: Session = Depends(get_db),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    machine_id: Optional[int] = Query(None)
):
    if not month or not year:
        now = datetime.now()
        month = month or now.month
        year = year or now.year

    if not 1 <= month <= 12:
        raise HTTPException(400, "Month must be 1-12")

    start_date = date(year, month, 1)
    _, days_in_month = calendar.monthrange(year, month)
    end_date = date(year, month, days_in_month)

    # ------------------------------------
    # SHIFT CONFIG → AVAILABLE HOURS BASE
    # ------------------------------------
    shift_configs = (
        db.query(ShiftHoursConfiguration)
        .filter(
            ShiftHoursConfiguration.date >= start_date,
            ShiftHoursConfiguration.date <= end_date
        )
        .all()
    )

    total_shift_hours = 0
    for sc in shift_configs:
        total_shift_hours += _configured_shift_hours(sc)

    # efficiency = 0.85
    settings = db.query(EfficiencyFactor).first()
    efficiency = settings.efficiency_factor if settings else 0.85
    base_available_hours = total_shift_hours * efficiency

    # 🔧 convert date → datetime for status filtering
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    range_end = end_dt + timedelta(seconds=1)

    # ----------------------------
    # MACHINES
    # ----------------------------
    machines_query = db.query(Machine)

    if machine_id:
        machines_query = machines_query.filter(Machine.id == machine_id)

    machines = machines_query.all()

    # ----------------------------
    # MACHINE STATUSES (DOWNTIME)
    # ----------------------------
    statuses = (
        db.query(MachineStatus)
        .filter(
            MachineStatus.available_from != None,
            MachineStatus.available_from < end_dt,
            (MachineStatus.available_to == None)
            | (MachineStatus.available_to > start_dt)
        )
        .all()
    )

    status_map = {}
    for s in statuses:
        status_map.setdefault(s.machine_id, []).append(s)

    # ----------------------------
    # CALCULATION
    # ----------------------------
    result = []

    for m in machines:
        available_hours = base_available_hours

        downtime_hours = 0

        machine_statuses = status_map.get(m.id, [])

        for st in machine_statuses:
            # status_id = 2 means OFF
            if st.status_id != 2:
                continue

            start = max(st.available_from, start_dt)
            end = st.available_to or end_dt
            end = min(end, end_dt)

            if end > start:
                hours = (end - start).total_seconds() / 3600
                downtime_hours += hours

        downtime_hours *= efficiency

        available_hours = max(0, base_available_hours - downtime_hours)

        result.append(
            MachineUtilization(
                machine_id=m.id,
                machine_type=m.type,
                machine_make=m.make,
                machine_model=m.model,
                work_center_name=m.work_center.work_center_name if m.work_center else None,
                work_center_bool=m.work_center.is_schedulable if m.work_center else False,
                available_hours=round(available_hours, 2),
                utilized_hours=0,
                remaining_hours=round(available_hours, 2),
                utilization_percentage=0,
            )
        )

    return result





# get machine utilization by range (start_date, end_date)
@router.get("/machine-utilization/range", response_model=List[MachineUtilization])
def get_machine_utilization_by_range(
    db: Session = Depends(get_db),
    start_date: date = Query(...),
    end_date: date = Query(...),
    machine_id: Optional[int] = Query(None)
):

    if start_date > end_date:
        raise HTTPException(400, "End date must be after start date")

    # range_end = end_date + timedelta(days=1)

    # 🔧 convert date → datetime (IMPORTANT FIX)
    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    range_end = end_dt + timedelta(seconds=1)

    # ------------------------------------
    # SHIFT CONFIG → AVAILABLE HOURS BASE
    # ------------------------------------
    shift_configs = (
        db.query(ShiftHoursConfiguration)
        .filter(
            ShiftHoursConfiguration.date >= start_date,
            ShiftHoursConfiguration.date <= end_date
        )
        .all()
    )

    total_shift_hours = 0

    for sc in shift_configs:
        total_shift_hours += _configured_shift_hours(sc)

    # efficiency = 0.85
    settings = db.query(EfficiencyFactor).first()
    efficiency = settings.efficiency_factor if settings else 0.85
    base_available_hours = total_shift_hours * efficiency

    # ------------------------------------
    # MACHINES
    # ------------------------------------
    machines_query = db.query(Machine)

    if machine_id:
        machines_query = machines_query.filter(Machine.id == machine_id)

    machines = machines_query.all()

    # ------------------------------------
    # MACHINE STATUS (DOWNTIME)
    # ------------------------------------
    statuses = (
        db.query(MachineStatus)
        .filter(
            MachineStatus.available_from != None,
            MachineStatus.available_from < range_end,
            (MachineStatus.available_to == None)
            | (MachineStatus.available_to > start_dt)
        )
        .order_by(MachineStatus.available_from)
        .all()
    )

    status_map = {}
    for s in statuses:
        status_map.setdefault(s.machine_id, []).append(s)

    # ------------------------------------
    # CALCULATION
    # ------------------------------------
    result = []

    for m in machines:
        available_hours = base_available_hours
        downtime_hours = 0

        machine_statuses = status_map.get(m.id, [])

        for st in machine_statuses:
            if st.status_id == 2:  # OFF

                if st.available_to:
                    overlap_start = max(st.available_from, start_dt)
                    overlap_end = min(st.available_to, range_end)

                    if overlap_end > overlap_start:
                        hours = (overlap_end - overlap_start).total_seconds() / 3600
                        downtime_hours += hours
                else:
                    overlap_start = max(st.available_from, start_dt)
                    overlap_end = range_end
                    hours = (overlap_end - overlap_start).total_seconds() / 3600
                    downtime_hours += hours

        # ------------------------------------
        # FINAL HOURS
        # ------------------------------------
        adjusted_downtime = downtime_hours * efficiency
        available_hours = max(0, base_available_hours - adjusted_downtime)

        utilized_hours = 0
        remaining_hours = available_hours
        utilization_percentage = 0

        result.append(
            MachineUtilization(
                machine_id=m.id,
                machine_type=m.type,
                machine_make=m.make,
                machine_model=m.model,
                work_center_name=m.work_center.code if m.work_center else None,
                work_center_bool=m.work_center.is_schedulable if m.work_center else False,
                available_hours=round(available_hours, 2),
                utilized_hours=0,
                remaining_hours=round(remaining_hours, 2),
                utilization_percentage=0,
            )
        )

    return result


# ------------------------------------
# EFFICIENCY ENDPOINTS
# ------------------------------------


# Create efficiency setting
# @router.post("/efficiency", response_model=EfficiencyResponse)
# def create_efficiency(settings: EfficiencyCreate, db: Session = Depends(get_db)):

#     existing = db.query(EfficiencyFactor).first()
#     if existing:
#         raise HTTPException(400, "Efficiency already initialized")

#     record = EfficiencyFactor(
#         efficiency_factor=settings.efficiency_factor
#     )

#     db.add(record)
#     db.commit()
#     db.refresh(record)

#     return record

# ------------------------------------
# EFFICIENCY ENDPOINTS
# ------------------------------------



# Get efficiency setting
@router.get("/efficiency", response_model=EfficiencyResponse)
def get_efficiency(db: Session = Depends(get_db)):

    record = db.query(EfficiencyFactor).first()

    if not record:
        record = EfficiencyFactor(efficiency_factor=0.85)
        db.add(record)
        db.commit()
        db.refresh(record)

    return record



# Update efficiency setting
@router.put("/efficiency", response_model=EfficiencyResponse)
def update_efficiency(settings: EfficiencyUpdate, db: Session = Depends(get_db)):

    record = db.query(EfficiencyFactor).first()

    if not record:
        raise HTTPException(404, "Efficiency not initialized")

    record.efficiency_factor = settings.efficiency_factor

    db.commit()
    db.refresh(record)

    return record