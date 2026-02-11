from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime, timedelta
import calendar
from datetime import date

from DB.database import get_db
from DB.models.scheduling import MachineStatus, ShiftHoursConfiguration, Status, MachineDowntime
from DB.models.configuration import Machine   # adjust path if needed


from DB.schemas.capacity_planning import (
    MachineUtilization
)

router = APIRouter(
    prefix="/machine-utilization",
    tags=["Machine Utilization"]
)



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

    # ----------------------------
    # WORKING DAYS
    # ----------------------------
    _, days_in_month = calendar.monthrange(year, month)

    working_days = sum(
        1 for d in range(1, days_in_month + 1)
        if datetime(year, month, d).weekday() < 5
    )

    efficiency = 0.85
    daily_hours = 8

    base_available_hours = working_days * daily_hours * efficiency

    start_date = datetime(year, month, 1)
    end_date = datetime(year + (month // 12), (month % 12) + 1, 1)

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
            MachineStatus.available_from < end_date,
            (MachineStatus.available_to == None)
            | (MachineStatus.available_to > start_date)
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

            start = max(st.available_from, start_date)
            end = st.available_to or end_date
            end = min(end, end_date)

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

    range_end = end_date + timedelta(days=1)

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
        if sc.working_day:
            total_shift_hours += sc.number_of_shifts * 8

    efficiency = 0.85
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
            | (MachineStatus.available_to > start_date)
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
                    overlap_start = max(st.available_from, start_date)
                    overlap_end = min(st.available_to, range_end)

                    if overlap_end > overlap_start:
                        hours = (overlap_end - overlap_start).total_seconds() / 3600
                        downtime_hours += hours
                else:
                    overlap_start = max(st.available_from, start_date)
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
