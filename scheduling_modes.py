"""Operator schedule mode flags and one-live-engine lock.

Batch job cards come from planned_schedule_items / rescheduling_items.
Unit-wise job cards come from unit_schedule_items.

ENABLE_BATCH_SCHEDULING and ENABLE_UNIT_WISE_SCHEDULING default to on.
UNIT_WISE_SCHEDULE_ENABLED remains the legacy alias for unit-wise only.
PPS rebuild/list/details are not gated here.
"""

from __future__ import annotations

import os
import re
from typing import Any, Dict, Iterable, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

_TRUE = ("1", "true", "yes", "on")
UNIT_WISE_NOTES_PREFIX = "unit-wise units "
_UNIT_RANGE_RE = re.compile(
    rf"{re.escape(UNIT_WISE_NOTES_PREFIX.strip())}\s+(\d+)\s*-\s*(\d+)",
    re.IGNORECASE,
)
_STARTED_STATUSES = ("inprogress", "completed")


def _flag(name: str, default: str = "true") -> bool:
    return os.getenv(name, default).lower().strip() in _TRUE


def batch_scheduling_enabled() -> bool:
    return _flag("ENABLE_BATCH_SCHEDULING", "true")


def unit_wise_scheduling_enabled() -> bool:
    explicit = os.getenv("ENABLE_UNIT_WISE_SCHEDULING")
    if explicit is not None:
        return explicit.lower().strip() in _TRUE
    from unit_wise_scheduler import unit_wise_enabled

    return unit_wise_enabled()


SHOP_PLAN_ENGINES = ("batch", "unit_wise")


def chosen_engine(shop_plan: Optional[str]) -> str:
    """Live rewrite target. Anything other than unit_wise stays on batch."""
    return "unit_wise" if shop_plan == "unit_wise" else "batch"


def get_shop_plan(db: Session) -> str:
    """Persisted factory plan. Missing row means batch."""
    from DB.models.scheduling import ShopSchedulePlan

    row = db.query(ShopSchedulePlan).order_by(ShopSchedulePlan.id.asc()).first()
    engine = getattr(row, "engine", None) if row is not None else None
    if engine in SHOP_PLAN_ENGINES:
        return engine
    return "batch"


def _open_in_progress_on_engine(db: Session, engine: str):
    """A log still in progress on this engine. Uses production_logs.status."""
    from DB.models.scheduling import ProductionLog

    rows = (
        db.query(ProductionLog)
        .filter(ProductionLog.status == "inprogress")
        .all()
    )
    for log in rows:
        if str(getattr(log, "status", "") or "").lower() != "inprogress":
            continue
        if log_engine(log) == engine:
            return log
    return None


def shop_plan_switch_block(db: Session, target: Optional[str] = None) -> Optional[str]:
    """Block leaving the current engine while a production log on it is still in progress."""
    current = get_shop_plan(db)
    if target is not None and target == current:
        return None
    if _open_in_progress_on_engine(db, current) is None:
        return None
    return (
        f"A {engine_label(current)} operation is still in progress. "
        "Complete it before switching the shop plan."
    )


def require_shop_plan_editor(db: Session, user_id: Optional[int]):
    """Only admin or manufacturing_coordinator may change the shop plan."""
    if user_id is None:
        raise HTTPException(
            400,
            "updated_by is required. Must be an admin or manufacturing_coordinator.",
        )
    from DB.models import AccessUser

    user = db.query(AccessUser).filter(AccessUser.id == int(user_id)).first()
    if user is None:
        raise HTTPException(400, f"User {user_id} not found")
    if user.role not in ("admin", "manufacturing_coordinator"):
        raise HTTPException(
            403,
            "Only admin or manufacturing_coordinator can update the shop plan",
        )
    return user


def set_shop_plan(db: Session, engine: str, updated_by: Optional[int] = None):
    """
    Store the factory plan. 409 when the engine being left still has an open card.
    Env flags remain a hard off switch.
    """
    engine = (engine or "").lower().strip()
    if engine not in SHOP_PLAN_ENGINES:
        raise HTTPException(400, "engine must be batch or unit_wise")
    if engine == "batch" and not batch_scheduling_enabled():
        raise HTTPException(403, "Batch scheduling is disabled")
    if engine == "unit_wise" and not unit_wise_scheduling_enabled():
        raise HTTPException(403, "Unit-wise scheduling is disabled")

    blocked = shop_plan_switch_block(db, engine)
    if blocked:
        raise HTTPException(409, blocked)

    from time_utils import now_ist
    from DB.models.scheduling import ShopSchedulePlan

    row = db.query(ShopSchedulePlan).order_by(ShopSchedulePlan.id.asc()).first()
    now = now_ist()
    if row is None:
        row = ShopSchedulePlan(engine=engine, updated_at=now, updated_by=updated_by)
        db.add(row)
    else:
        row.engine = engine
        row.updated_at = now
        row.updated_by = updated_by
    db.commit()
    db.refresh(row)
    return row


def get_scheduling_modes(db: Optional[Session] = None) -> dict:
    modes = {
        "batch_scheduling": batch_scheduling_enabled(),
        "unit_wise_scheduling": unit_wise_scheduling_enabled(),
    }
    if db is None:
        return modes
    plan = get_shop_plan(db)
    modes["shop_plan"] = plan
    if plan != "batch":
        modes["batch_scheduling"] = False
    if plan != "unit_wise":
        modes["unit_wise_scheduling"] = False
    return modes


def require_batch_scheduling(db: Optional[Session] = None) -> None:
    if not batch_scheduling_enabled():
        raise HTTPException(403, "Batch scheduling is disabled")
    if db is not None and get_shop_plan(db) != "batch":
        raise HTTPException(403, "Shop floor follows unit-wise. Batch job cards are locked.")


def require_unit_wise_scheduling(db: Optional[Session] = None) -> None:
    if not unit_wise_scheduling_enabled():
        raise HTTPException(403, "Unit-wise scheduling is disabled")
    if db is not None and get_shop_plan(db) != "unit_wise":
        raise HTTPException(403, "Shop floor follows batch. Unit-wise job cards are locked.")


def log_engine(log: Any) -> str:
    """Unit-wise logs store unit_from/unit_to on the row. Older rows used notes."""
    if unit_range_from_log(log) is not None:
        return "unit_wise"
    return "batch"


def unit_range_from_notes(notes: Optional[str]) -> Optional[Tuple[int, int]]:
    """Parse legacy 'unit-wise units 2-2' notes. New logs do not write this."""
    match = _UNIT_RANGE_RE.search(notes or "")
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def unit_range_from_log(log: Any) -> Optional[Tuple[int, int]]:
    """Prefer columns; fall back to the old notes marker."""
    unit_from = getattr(log, "unit_from", None)
    unit_to = getattr(log, "unit_to", None)
    if unit_from is not None and unit_to is not None:
        return int(unit_from), int(unit_to)
    return unit_range_from_notes(getattr(log, "notes", None))


def engine_label(engine: Optional[str]) -> str:
    if engine == "unit_wise":
        return "unit-wise"
    if engine == "batch":
        return "batch"
    return "unknown"


def part_started_engine_from_logs(logs: Iterable[Any]) -> Optional[str]:
    rows = [
        log
        for log in (logs or [])
        if str(getattr(log, "operator_status", "") or "").lower() in _STARTED_STATUSES
    ]
    if not rows:
        return None
    in_progress = [
        log
        for log in rows
        if str(getattr(log, "operator_status", "") or "").lower() == "inprogress"
    ]
    if in_progress:
        return log_engine(in_progress[0])
    latest = max(rows, key=lambda log: getattr(log, "created_at", None) or 0)
    return log_engine(latest)


def live_engine_for_part_logs(
    logs: Iterable[Any],
    has_remaining: bool,
    has_remaining_unit_schedule: bool = False,
    shop_plan: Optional[str] = None,
) -> Optional[str]:
    """In-progress always locks.

    When the shop plan is batch, leftover unit_schedule_items and completed
    unit-wise logs do not hide batch cards. An open in-progress card still
    locks to its own engine.

    Otherwise a remaining latest unit_schedule wins over leftover batch logs.
    Completed logs lock batch only when qty remains and there is no remaining
    unit-wise plan.
    """
    rows = [
        log
        for log in (logs or [])
        if str(getattr(log, "operator_status", "") or "").lower() in _STARTED_STATUSES
    ]
    in_progress = [
        log
        for log in rows
        if str(getattr(log, "operator_status", "") or "").lower() == "inprogress"
    ]
    if in_progress:
        return log_engine(in_progress[0])
    if not has_remaining:
        return None
    if shop_plan == "batch":
        return "batch" if rows else None
    if has_remaining_unit_schedule:
        return "unit_wise"
    if not rows:
        return None
    return part_started_engine_from_logs(rows)


def _in_progress_on_machine(db: Session, machine_id: Optional[int]):
    from DB.models.scheduling import ProductionLog

    if machine_id is None:
        return None
    return (
        db.query(ProductionLog)
        .filter(
            ProductionLog.machine_id == int(machine_id),
            ProductionLog.operator_status == "inprogress",
        )
        .first()
    )


def _in_progress_on_operation(db: Session, operation_id: int):
    from DB.models.scheduling import ProductionLog

    return (
        db.query(ProductionLog)
        .filter(
            ProductionLog.operation_id == int(operation_id),
            ProductionLog.operator_status == "inprogress",
        )
        .first()
    )


def _part_id_for_operation(db: Session, operation_id: int) -> Optional[int]:
    from DB.models.oms import Operation

    op = db.query(Operation).filter(Operation.id == int(operation_id)).first()
    if not op or op.part_id is None:
        return None
    return int(op.part_id)


def part_started_engine(db: Session, part_id: int) -> Optional[str]:
    from DB.models.oms import Operation
    from DB.models.scheduling import ProductionLog

    rows = (
        db.query(ProductionLog)
        .join(Operation, Operation.id == ProductionLog.operation_id)
        .filter(
            Operation.part_id == int(part_id),
            ProductionLog.operator_status.in_(list(_STARTED_STATUSES)),
        )
        .all()
    )
    remaining = _part_has_remaining_work(db, part_id)
    return live_engine_for_part_logs(
        rows,
        remaining,
        remaining and _part_has_remaining_unit_schedule(db, part_id),
        shop_plan=get_shop_plan(db),
    )


def _part_has_remaining_work(db: Session, part_id: int) -> bool:
    from DB.models.oms import Operation, Part
    from production_log_helpers import remaining_to_close, total_approved_for_operation

    part = db.query(Part).filter(Part.id == int(part_id)).first()
    qty = int(part.qty or 0) if part is not None else 0
    ops = db.query(Operation).filter(Operation.part_id == int(part_id)).all()
    if not ops:
        return False
    for op in ops:
        approved = total_approved_for_operation(db, op.id)
        if remaining_to_close(qty, approved) > 0:
            return True
    return False


def _machine_unit_wise_part_ids(db: Session, machine_id: int) -> set:
    from sqlalchemy import and_, func

    from DB.models.scheduling import UnitScheduleItem

    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .filter(UnitScheduleItem.machine_id == int(machine_id))
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    rows = (
        db.query(UnitScheduleItem.part_id)
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
                UnitScheduleItem.machine_id == int(machine_id),
            ),
        )
        .distinct()
        .all()
    )
    return {int(row[0]) for row in rows if row[0] is not None}


def _machine_batch_part_ids(db: Session, machine_id: int) -> set:
    from DB.models.scheduling import Rescheduling

    rows = (
        db.query(Rescheduling.part_id)
        .filter(
            Rescheduling.machine_id == int(machine_id),
            Rescheduling.status.in_(["scheduled", "rescheduled"]),
        )
        .distinct()
        .all()
    )
    return {int(row[0]) for row in rows if row[0] is not None}


def _machine_has_engine_job(db: Session, machine_id: int, part_id: int, engine: str) -> bool:
    part_id = int(part_id)
    if engine == "unit_wise":
        return part_id in _machine_unit_wise_part_ids(db, machine_id)
    return part_id in _machine_batch_part_ids(db, machine_id)


def _parts_with_latest_unit_schedule(db: Session) -> set:
    from sqlalchemy import and_, func

    from DB.models.scheduling import UnitScheduleItem

    subq = (
        db.query(
            UnitScheduleItem.part_id,
            func.max(UnitScheduleItem.schedule_version).label("max_version"),
        )
        .group_by(UnitScheduleItem.part_id)
        .subquery()
    )
    rows = (
        db.query(UnitScheduleItem.part_id)
        .join(
            subq,
            and_(
                UnitScheduleItem.part_id == subq.c.part_id,
                UnitScheduleItem.schedule_version == subq.c.max_version,
            ),
        )
        .distinct()
        .all()
    )
    return {int(row[0]) for row in rows if row[0] is not None}


def _part_has_remaining_unit_schedule(db: Session, part_id: int) -> bool:
    from sqlalchemy import func

    from DB.models.scheduling import UnitScheduleItem

    max_version = (
        db.query(func.max(UnitScheduleItem.schedule_version))
        .filter(UnitScheduleItem.part_id == int(part_id))
        .scalar()
    )
    if max_version is None:
        return False
    row = (
        db.query(UnitScheduleItem.id)
        .filter(
            UnitScheduleItem.part_id == int(part_id),
            UnitScheduleItem.schedule_version == max_version,
        )
        .first()
    )
    return row is not None


def _live_part_engines(db: Session) -> Dict[str, str]:
    from DB.models.oms import Operation
    from DB.models.scheduling import ProductionLog

    started_rows = (
        db.query(ProductionLog, Operation.part_id)
        .join(Operation, Operation.id == ProductionLog.operation_id)
        .filter(ProductionLog.operator_status.in_(list(_STARTED_STATUSES)))
        .all()
    )
    by_part: Dict[int, list] = {}
    for log, part_id in started_rows:
        if part_id is None:
            continue
        by_part.setdefault(int(part_id), []).append(log)
    unit_parts = _parts_with_latest_unit_schedule(db)
    shop_plan = get_shop_plan(db)
    remaining_cache: Dict[int, bool] = {}
    engines: Dict[str, str] = {}
    for part_id in set(by_part) | unit_parts:
        if part_id not in remaining_cache:
            remaining_cache[part_id] = _part_has_remaining_work(db, part_id)
        remaining = remaining_cache[part_id]
        engine = live_engine_for_part_logs(
            by_part.get(part_id, []),
            remaining,
            remaining and part_id in unit_parts,
            shop_plan=shop_plan,
        )
        if engine:
            engines[str(part_id)] = engine
    return engines


def pps_batch_update_block(shop_plan: Optional[str]) -> Tuple[bool, Optional[str]]:
    """Planned/Actual Update follows the stored shop plan, not leftover unit rows."""
    if shop_plan == "unit_wise":
        return (
            True,
            "Shop floor follows unit-wise. Update the live plan from Unit Scheduling.",
        )
    return False, None


def shop_floor_lock(db: Session, machine_id: Optional[int] = None) -> Dict[str, Any]:
    """Flags plus live engine lock.

    part_engines is shop-wide remaining work: one engine per part.
    machine_id scopes in_progress_engine / toggle_allowed only.
    machine_part_engines is which of those live parts still have a card
    on this machine for that engine (empty-state), not the hide/show map.
    """
    payload = get_scheduling_modes(db)
    in_progress = _in_progress_on_machine(db, machine_id)
    in_progress_engine = log_engine(in_progress) if in_progress else None
    toggle_allowed = in_progress_engine is None
    toggle_lock_reason = None
    if in_progress_engine:
        toggle_lock_reason = (
            "Finish or submit the open job card before switching schedule."
        )

    shop_part_engines = _live_part_engines(db)
    part_engines = shop_part_engines
    machine_part_engines: Dict[str, str] = {}
    if machine_id is not None:
        unit_parts = _machine_unit_wise_part_ids(db, machine_id)
        batch_parts = _machine_batch_part_ids(db, machine_id)
        for part_key, engine in shop_part_engines.items():
            part_id = int(part_key)
            locked_on_machine = part_id in (
                unit_parts if engine == "unit_wise" else batch_parts
            )
            if locked_on_machine:
                machine_part_engines[part_key] = engine

    shop_started_unit_wise = any(
        engine == "unit_wise" for engine in shop_part_engines.values()
    )
    shop_started_batch = any(
        engine == "batch" for engine in shop_part_engines.values()
    )
    any_started = bool(shop_part_engines)

    shop_plan = payload.get("shop_plan") or "batch"
    pps_block_batch_update, pps_block_message = pps_batch_update_block(shop_plan)
    pps_confirm_planned_update = not pps_block_batch_update and not any_started
    process_plan_save_warning = None
    if (
        (in_progress_engine == "batch" or shop_started_batch)
        and not shop_started_unit_wise
        and in_progress_engine != "unit_wise"
    ):
        process_plan_save_warning = (
            "Operators are on Batch. Saving here updates unit-wise rows only; "
            "job cards will not change until the shop switches to Unit-wise."
        )

    payload.update(
        {
            "in_progress_engine": in_progress_engine,
            "toggle_allowed": toggle_allowed,
            "toggle_lock_reason": toggle_lock_reason,
            "part_engines": part_engines,
            "machine_part_engines": machine_part_engines,
            "shop_started_unit_wise": shop_started_unit_wise,
            "shop_started_batch": shop_started_batch,
            "pps_block_batch_update": pps_block_batch_update,
            "pps_confirm_planned_update": pps_confirm_planned_update,
            "pps_block_message": pps_block_message,
            "process_plan_save_warning": process_plan_save_warning,
        }
    )
    return payload


def require_activate_engine(
    db: Session,
    engine: str,
    *,
    operation_id: int,
    machine_id: Optional[int],
) -> None:
    """403 when this part or machine already started on the other engine."""
    if engine == "batch":
        require_batch_scheduling(db)
    else:
        require_unit_wise_scheduling(db)

    if machine_id is not None:
        machine_open = _in_progress_on_machine(db, machine_id)
        if machine_open and log_engine(machine_open) != engine:
            other = engine_label(log_engine(machine_open))
            raise HTTPException(
                403,
                f"This machine has an open {other} job card. "
                "Finish or submit it before switching schedule.",
            )

    open_op = _in_progress_on_operation(db, operation_id)
    if open_op and log_engine(open_op) != engine:
        other = engine_label(log_engine(open_op))
        raise HTTPException(
            403,
            f"This operation has an open {other} job card. "
            "Finish or submit it before switching schedule.",
        )

    part_id = _part_id_for_operation(db, operation_id)
    if part_id is None:
        return
    started = part_started_engine(db, part_id)
    if not started or started == engine:
        return
    raise HTTPException(
        403,
        f"This part is already in production on the {engine_label(started)} schedule. "
        "Stay on that schedule for remaining operations.",
    )


def require_submit_engine(
    db: Session,
    engine: str,
    *,
    operation_id: int,
) -> None:
    open_op = _in_progress_on_operation(db, operation_id)
    if open_op and log_engine(open_op) != engine:
        raise HTTPException(
            403,
            f"This open job card belongs to the {engine_label(log_engine(open_op))} schedule.",
        )
