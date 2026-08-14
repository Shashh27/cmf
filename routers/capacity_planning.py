from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta, date
import calendar

from DB.database import get_db
from DB.models.scheduling import (
    MachineStatus,
    ShiftHoursConfiguration,
    EfficiencyFactor,
    PlannedScheduleItem,
    Rescheduling,
)
from DB.models.configuration import Machine

from DB.schemas.capacity_planning import (
    MachineUtilization,
    EfficiencyUpdate,
    EfficiencyResponse,
)

router = APIRouter(
    prefix="/machine-utilization",
    tags=["Machine Utilization"],
)


# Match scheduler defaults (algorithm.DEFAULT_SHIFT_START/END): 08:30–17:00 = 8.5h
DEFAULT_SHIFT_HOURS = 8.5


def _configured_shift_hours(config: ShiftHoursConfiguration) -> float:
    """
    Hours available for one calendar day.
    - Non-working day with 0 shifts → 0
    - If rows exist in shift_timing_configuration → sum those windows
    - Else → default GENERAL shift 8.5h (08:30–17:00), same as the scheduler
    """
    if not config.working_day and config.number_of_shifts == 0:
        return 0.0
    if config.shift_timings:
        total = 0.0
        for timing in config.shift_timings:
            start_dt = datetime.combine(config.date, timing.shift_start)
            end_dt = datetime.combine(config.date, timing.shift_end)
            total += (end_dt - start_dt).total_seconds() / 3600
        return max(total, 0.0)
    return float(DEFAULT_SHIFT_HOURS)


def _clip_hours(seg_start: datetime, seg_end: datetime, win_start: datetime, win_end: datetime) -> float:
    """Hours of [seg_start, seg_end] that fall inside [win_start, win_end]."""
    if not seg_start or not seg_end or seg_end <= seg_start:
        return 0.0
    start = max(seg_start, win_start)
    end = min(seg_end, win_end)
    if end <= start:
        return 0.0
    return (end - start).total_seconds() / 3600.0


def _load_utilized_hours_by_machine(
    db: Session,
    start_dt: datetime,
    end_dt: datetime,
    machine_id: Optional[int] = None,
) -> Tuple[Dict[int, float], str]:
    """
    Prefer dynamic schedule (rescheduling_items) so capacity tracks production-log
    updates. Fall back to planned_schedule_items when dynamic has no rows yet.

    Returns (machine_id -> utilized_hours, source_label).
    """
    dyn_q = db.query(Rescheduling).filter(
        Rescheduling.machine_id.isnot(None),
        Rescheduling.status.in_(("scheduled", "rescheduled")),
        Rescheduling.start_time < end_dt,
        Rescheduling.end_time > start_dt,
    )
    if machine_id is not None:
        dyn_q = dyn_q.filter(Rescheduling.machine_id == machine_id)
    dynamic_items = dyn_q.all()

    by_machine: Dict[int, float] = {}
    if dynamic_items:
        for item in dynamic_items:
            hours = _clip_hours(item.start_time, item.end_time, start_dt, end_dt)
            if hours <= 0 or item.machine_id is None:
                continue
            by_machine[item.machine_id] = by_machine.get(item.machine_id, 0.0) + hours
        return by_machine, "dynamic"

    plan_q = db.query(PlannedScheduleItem).filter(
        PlannedScheduleItem.machine_id.isnot(None),
        PlannedScheduleItem.planned_start_time.isnot(None),
        PlannedScheduleItem.planned_end_time.isnot(None),
        PlannedScheduleItem.planned_start_time < end_dt,
        PlannedScheduleItem.planned_end_time > start_dt,
    )
    if machine_id is not None:
        plan_q = plan_q.filter(PlannedScheduleItem.machine_id == machine_id)
    planned_items = plan_q.all()

    for item in planned_items:
        hours = _clip_hours(
            item.planned_start_time, item.planned_end_time, start_dt, end_dt
        )
        if hours <= 0 or item.machine_id is None:
            continue
        by_machine[item.machine_id] = by_machine.get(item.machine_id, 0.0) + hours
    return by_machine, "planned"


@router.get("/machine-utilization", response_model=List[MachineUtilization])
def get_machine_utilization(
    db: Session = Depends(get_db),
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    machine_id: Optional[int] = Query(None),
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

    shift_configs = (
        db.query(ShiftHoursConfiguration)
        .filter(
            ShiftHoursConfiguration.date >= start_date,
            ShiftHoursConfiguration.date <= end_date,
        )
        .all()
    )

    total_shift_hours = sum(_configured_shift_hours(sc) for sc in shift_configs)

    settings = db.query(EfficiencyFactor).first()
    efficiency = settings.efficiency_factor if settings else 1.0
    base_available_hours = total_shift_hours * efficiency

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    machines_query = db.query(Machine)
    if machine_id:
        machines_query = machines_query.filter(Machine.id == machine_id)
    machines = machines_query.all()

    statuses = (
        db.query(MachineStatus)
        .filter(
            MachineStatus.available_from != None,
            MachineStatus.available_from < end_dt,
            (MachineStatus.available_to == None)
            | (MachineStatus.available_to > start_dt),
        )
        .all()
    )

    status_map = {}
    for s in statuses:
        status_map.setdefault(s.machine_id, []).append(s)

    utilized_by_machine, _source = _load_utilized_hours_by_machine(
        db, start_dt, end_dt, machine_id=machine_id
    )

    result = []
    for m in machines:
        downtime_hours = 0.0
        for st in status_map.get(m.id, []):
            if st.status_id != 2:
                continue
            start = max(st.available_from, start_dt)
            end = st.available_to or end_dt
            end = min(end, end_dt)
            if end > start:
                downtime_hours += (end - start).total_seconds() / 3600

        downtime_hours *= efficiency
        available_hours = max(0.0, base_available_hours - downtime_hours)
        utilized_hours = utilized_by_machine.get(m.id, 0.0)

        utilization_percentage = 0.0
        if available_hours > 0:
            utilization_percentage = (utilized_hours / available_hours) * 100

        remaining_hours = max(0.0, available_hours - utilized_hours)

        result.append(
            MachineUtilization(
                machine_id=m.id,
                machine_type=m.type,
                machine_make=m.make,
                machine_model=m.model,
                work_center_name=m.work_center.work_center_name if m.work_center else None,
                work_center_bool=m.work_center.is_schedulable if m.work_center else False,
                available_hours=round(available_hours, 2),
                utilized_hours=round(utilized_hours, 2),
                remaining_hours=round(remaining_hours, 2),
                utilization_percentage=round(utilization_percentage, 2),
            )
        )

    return result


@router.get("/machine-utilization/range", response_model=List[MachineUtilization])
def get_machine_utilization_by_range(
    db: Session = Depends(get_db),
    start_date: date = Query(...),
    end_date: date = Query(...),
    machine_id: Optional[int] = Query(None),
):
    if start_date > end_date:
        raise HTTPException(400, "End date must be after start date")

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())
    range_end = end_dt + timedelta(seconds=1)

    shift_configs = (
        db.query(ShiftHoursConfiguration)
        .filter(
            ShiftHoursConfiguration.date >= start_date,
            ShiftHoursConfiguration.date <= end_date,
        )
        .all()
    )

    total_shift_hours = sum(_configured_shift_hours(sc) for sc in shift_configs)

    settings = db.query(EfficiencyFactor).first()
    efficiency = settings.efficiency_factor if settings else 1.0
    base_available_hours = total_shift_hours * efficiency

    machines_query = db.query(Machine)
    if machine_id:
        machines_query = machines_query.filter(Machine.id == machine_id)
    machines = machines_query.all()

    utilized_by_machine, _source = _load_utilized_hours_by_machine(
        db, start_dt, end_dt, machine_id=machine_id
    )

    statuses = (
        db.query(MachineStatus)
        .filter(
            MachineStatus.available_from != None,
            MachineStatus.available_from < range_end,
            (MachineStatus.available_to == None)
            | (MachineStatus.available_to > start_dt),
        )
        .order_by(MachineStatus.available_from)
        .all()
    )

    status_map = {}
    for s in statuses:
        status_map.setdefault(s.machine_id, []).append(s)

    result = []
    for m in machines:
        downtime_hours = 0.0
        for st in status_map.get(m.id, []):
            if st.status_id != 2:
                continue
            if st.available_to:
                overlap_start = max(st.available_from, start_dt)
                overlap_end = min(st.available_to, range_end)
                if overlap_end > overlap_start:
                    downtime_hours += (overlap_end - overlap_start).total_seconds() / 3600
            else:
                overlap_start = max(st.available_from, start_dt)
                downtime_hours += (range_end - overlap_start).total_seconds() / 3600

        available_hours = max(0.0, base_available_hours - (downtime_hours * efficiency))
        utilized_hours = utilized_by_machine.get(m.id, 0.0)

        utilization_percentage = 0.0
        if available_hours > 0:
            utilization_percentage = (utilized_hours / available_hours) * 100

        remaining_hours = max(0.0, available_hours - utilized_hours)

        result.append(
            MachineUtilization(
                machine_id=m.id,
                machine_type=m.type,
                machine_make=m.make,
                machine_model=m.model,
                work_center_name=m.work_center.code if m.work_center else None,
                work_center_bool=m.work_center.is_schedulable if m.work_center else False,
                available_hours=round(available_hours, 2),
                utilized_hours=round(utilized_hours, 2),
                remaining_hours=round(remaining_hours, 2),
                utilization_percentage=round(utilization_percentage, 2),
            )
        )

    return result


@router.get("/efficiency", response_model=EfficiencyResponse)
def get_efficiency(db: Session = Depends(get_db)):
    record = db.query(EfficiencyFactor).first()
    if not record:
        record = EfficiencyFactor(efficiency_factor=1.0)
        db.add(record)
        db.commit()
        db.refresh(record)
    return record


@router.put("/efficiency", response_model=EfficiencyResponse)
def update_efficiency(settings: EfficiencyUpdate, db: Session = Depends(get_db)):
    record = db.query(EfficiencyFactor).first()
    if not record:
        raise HTTPException(404, "Efficiency not initialized")
    record.efficiency_factor = settings.efficiency_factor
    db.commit()
    db.refresh(record)
    return record
