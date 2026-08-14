"""
Scheduler #3 — Live Reconciliation Engine.

Not a replacement for DynamicSchedulerEngine.dynamic_reschedule
(Scheduler #2 / Rescheduler). This module:

  * derives operation state from production_logs / operation_status
  * detects meaningful time/state transitions
  * computes an impact set (seed part remaining ops + colliding machines)
  * replans through DynamicSchedulerEngine helpers with a live clock
  * no-ops when the live schedule is still valid

Writes scheduling.rescheduling_items only. Does not touch planned_schedule_items.
Does not auto-activate job cards.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Set

from sqlalchemy.orm import Session

from algorithm import DynamicSchedulerEngine, LiveReconcileContext, _strip_tz
from DB.models.scheduling import OperationStatus, ProductionLog, Rescheduling
from live_schedule_lock import live_schedule_lock

logger = logging.getLogger(__name__)

STATE_NOT_STARTED = "NOT_STARTED"
STATE_IN_PROGRESS = "IN_PROGRESS"
STATE_PARTIALLY_COMPLETED = "PARTIALLY_COMPLETED"
STATE_AWAITING_REVIEW = "AWAITING_REVIEW"
STATE_COMPLETED = "COMPLETED"

LIVE_RECONCILE_INTERVAL_MINUTES = 5
_OPEN_REVIEW_STATUSES = ("pending", "inprogress", "rework", "rejected")

_scheduler = None


# ---------------------------------------------------------------------------
# Derived state
# ---------------------------------------------------------------------------

def _combine_log_start(log: ProductionLog) -> Optional[datetime]:
    if log.from_date and log.from_time:
        return datetime.combine(log.from_date, log.from_time)
    return None


def derive_operation_state(
    db: Session,
    operation_id: int,
    total_qty: int,
) -> str:
    """
    Map production reality onto the Dynamic Scheduler state machine.

    PAUSED is not a column; AWAITING_REVIEW / gap-between-logs is the stand-in.
    """
    logs: List[ProductionLog] = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id == operation_id)
        .all()
    )
    approved = sum((log.approved_quantity or 0) for log in logs)
    if total_qty > 0 and approved >= total_qty:
        return STATE_COMPLETED

    open_run = any(
        getattr(log, "operator_status", None) == "inprogress"
        and log.to_time is None
        for log in logs
    )
    if open_run:
        return STATE_IN_PROGRESS

    awaiting = any(
        getattr(log, "operator_status", None) == "completed"
        and getattr(log, "status", None) in _OPEN_REVIEW_STATUSES
        and log.to_time is not None
        for log in logs
    )
    if awaiting and approved < total_qty:
        return STATE_AWAITING_REVIEW

    if approved > 0 or any(log.to_time is not None for log in logs):
        if total_qty > 0 and approved >= total_qty:
            return STATE_COMPLETED
        return STATE_PARTIALLY_COMPLETED

    op_status = None
    try:
        op_status = (
            db.query(OperationStatus)
            .filter(OperationStatus.operation_id == operation_id)
            .first()
        )
    except Exception:
        op_status = None
    if op_status is not None:
        if op_status.status == "completed" and approved >= total_qty:
            return STATE_COMPLETED
        if op_status.status == "inprogress":
            return STATE_IN_PROGRESS

    return STATE_NOT_STARTED


def _live_windows(db: Session) -> Dict[int, dict]:
    rows = (
        db.query(Rescheduling)
        .filter(Rescheduling.status.in_(["scheduled", "rescheduled"]))
        .all()
    )
    windows: Dict[int, dict] = {}
    for row in rows:
        bucket = windows.get(row.operation_id)
        if bucket is None:
            windows[row.operation_id] = {
                "part_id": row.part_id,
                "min_start": row.start_time,
                "max_end": row.end_time,
                "machine_ids": {row.machine_id} if row.machine_id else set(),
                "total_qty": row.total_qty or 0,
                "remaining_qty": row.remaining_qty or 0,
            }
        else:
            if row.start_time < bucket["min_start"]:
                bucket["min_start"] = row.start_time
            if row.end_time > bucket["max_end"]:
                bucket["max_end"] = row.end_time
            if row.machine_id:
                bucket["machine_ids"].add(row.machine_id)
            bucket["remaining_qty"] = max(bucket["remaining_qty"], row.remaining_qty or 0)
    return windows


def _actual_start(db: Session, operation_id: int) -> Optional[datetime]:
    logs = (
        db.query(ProductionLog)
        .filter(ProductionLog.operation_id == operation_id)
        .all()
    )
    starts = [_combine_log_start(log) for log in logs]
    starts = [s for s in starts if s is not None]
    return min(starts) if starts else None


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

class LiveReconciliationEngine(DynamicSchedulerEngine):
    """
    Scheduler #3. Reuses SchedulerEngine / DynamicSchedulerEngine helpers.
    Only the live clock, activation anchors, and impact scope differ.
    """

    def reconcile(
        self,
        trigger: str,
        now: Optional[datetime] = None,
        operation_id: Optional[int] = None,
        part_id: Optional[int] = None,
        machine_id: Optional[int] = None,
    ) -> Dict:
        now = _strip_tz(now or datetime.now())
        windows = _live_windows(self.db)

        stale_not_started: Set[int] = set()
        rewrite_inprogress: Set[int] = set()
        activation_ops: Set[int] = set()

        for op_id, window in windows.items():
            state = derive_operation_state(self.db, op_id, window["total_qty"] or 0)
            if state == STATE_NOT_STARTED and window["max_end"] < now:
                stale_not_started.add(op_id)
            elif state == STATE_IN_PROGRESS:
                started = _actual_start(self.db, op_id)
                if started is not None and window["min_start"] < started:
                    rewrite_inprogress.add(op_id)
            elif state in (STATE_PARTIALLY_COMPLETED, STATE_AWAITING_REVIEW):
                if window["max_end"] < now:
                    stale_not_started.add(op_id)

        if trigger == "activation" and operation_id:
            activation_ops.add(operation_id)
            rewrite_inprogress.add(operation_id)

        if trigger == "production_review" and operation_id:
            window = windows.get(operation_id)
            if window is not None and window["max_end"] < now:
                stale_not_started.add(operation_id)

        if trigger == "completion" and operation_id:
            window = windows.get(operation_id)
            if window is not None and window["max_end"] < now:
                stale_not_started.add(operation_id)
            # Downstream leftover past windows on this part.
            completed_part = windows.get(operation_id, {}).get("part_id")
            if completed_part is not None:
                for other_id, other in windows.items():
                    if other["part_id"] == completed_part and other["max_end"] < now:
                        stale_not_started.add(other_id)

        if trigger == "machine_status" and machine_id is not None:
            for op_id, window in windows.items():
                if machine_id in window["machine_ids"] and window["max_end"] >= now:
                    stale_not_started.add(op_id)

        if part_id is not None and trigger != "periodic":
            for op_id, window in windows.items():
                if window["part_id"] == part_id and window["max_end"] < now:
                    stale_not_started.add(op_id)

        seed_ops = set(stale_not_started) | set(rewrite_inprogress) | set(activation_ops)

        if not seed_ops:
            logger.info(
                "Live reconciliation no-op",
                extra={"event": "live_reconciliation_noop", "trigger": trigger},
            )
            return {
                "success": True,
                "noop": True,
                "message": "No meaningful live-schedule transition.",
                "reschedule_version": None,
                "parts_rescheduled": 0,
                "operations_inserted": 0,
                "trigger": trigger,
            }

        impact_parts = self._impact_part_ids(seed_ops, windows, now)
        if part_id is not None:
            impact_parts.add(part_id)

        if not impact_parts:
            return {
                "success": True,
                "noop": True,
                "message": "No impacted parts.",
                "reschedule_version": None,
                "parts_rescheduled": 0,
                "operations_inserted": 0,
                "trigger": trigger,
            }

        live_context = LiveReconcileContext(
            now=now,
            stale_not_started_op_ids=stale_not_started,
            rewrite_inprogress_op_ids=rewrite_inprogress,
            activation_op_ids=activation_ops,
        )

        logger.info(
            "Live reconciliation running",
            extra={
                "event": "live_reconciliation_started",
                "trigger": trigger,
                "seed_ops": sorted(seed_ops),
                "impact_parts": sorted(impact_parts),
                "now": now.isoformat(),
            },
        )

        result = self.dynamic_reschedule(
            part_ids=list(impact_parts),
            live_context=live_context,
        )
        result["trigger"] = trigger
        result["noop"] = bool(result.get("noop", False))
        result["impact_parts"] = sorted(impact_parts)
        return result

    def _impact_part_ids(
        self,
        seed_ops: Set[int],
        windows: Dict[int, dict],
        now: datetime,
    ) -> Set[int]:
        seed_parts: Set[int] = set()
        for op_id in seed_ops:
            window = windows.get(op_id)
            if window is None:
                continue
            seed_parts.add(window["part_id"])
        return seed_parts


def reconcile_live_schedule(
    db: Session,
    trigger: str = "periodic",
    now: Optional[datetime] = None,
    operation_id: Optional[int] = None,
    part_id: Optional[int] = None,
    machine_id: Optional[int] = None,
    blocking: Optional[bool] = None,
) -> Dict:
    """
    Public Scheduler #3 entry. Safe to call from event hooks and APScheduler.

    Does not raise to the caller for lock contention on the periodic path.
    """
    if blocking is None:
        blocking = trigger != "periodic"

    with live_schedule_lock(db, blocking=blocking) as acquired:
        if not acquired:
            logger.info(
                "Live reconciliation skipped — lock held",
                extra={"event": "live_reconciliation_lock_skipped", "trigger": trigger},
            )
            return {
                "success": True,
                "noop": True,
                "skipped": True,
                "message": "Live schedule lock not acquired.",
                "trigger": trigger,
            }
        try:
            result = LiveReconciliationEngine(db).reconcile(
                trigger=trigger,
                now=now,
                operation_id=operation_id,
                part_id=part_id,
                machine_id=machine_id,
            )
            if result.get("success"):
                logger.info(
                    "Live reconciliation completed",
                    extra={
                        "event": "live_reconciliation_completed",
                        "trigger": trigger,
                        "noop": result.get("noop"),
                        "reschedule_version": result.get("reschedule_version"),
                        "parts_rescheduled": result.get("parts_rescheduled"),
                        "operations_inserted": result.get("operations_inserted"),
                    },
                )
            else:
                logger.error(
                    "Live reconciliation failed",
                    extra={
                        "event": "live_reconciliation_failed",
                        "trigger": trigger,
                        "result_message": result.get("message"),
                    },
                )
            return result
        except Exception as exc:
            logger.exception(
                "Live reconciliation crashed",
                extra={"event": "live_reconciliation_crashed", "trigger": trigger},
            )
            try:
                db.rollback()
            except Exception:
                pass
            return {
                "success": False,
                "noop": True,
                "message": f"Live reconciliation failed: {exc}",
                "trigger": trigger,
            }


def _safe_reconcile_after_event(
    db: Session,
    trigger: str,
    operation_id: Optional[int] = None,
    part_id: Optional[int] = None,
    machine_id: Optional[int] = None,
) -> None:
    """Event-path wrapper: never fail the originating shop-floor action."""
    try:
        reconcile_live_schedule(
            db,
            trigger=trigger,
            operation_id=operation_id,
            part_id=part_id,
            machine_id=machine_id,
            blocking=True,
        )
    except Exception:
        logger.exception(
            "Live reconciliation event hook failed",
            extra={"event": "live_reconciliation_hook_failed", "trigger": trigger},
        )


def run_periodic_live_reconciliation() -> None:
    """APScheduler job: new session, try-lock, reconcile, close."""
    from DB.database import SessionLocal

    db = SessionLocal()
    try:
        reconcile_live_schedule(db, trigger="periodic", blocking=False)
    finally:
        db.close()


def start_live_reconciliation_scheduler() -> None:
    """Start BackgroundScheduler inside the FastAPI process. Idempotent."""
    global _scheduler
    if os.getenv("LIVE_RECONCILIATION_DISABLED", "").lower() in ("1", "true", "yes"):
        logger.info("Live reconciliation scheduler disabled by env")
        return
    if _scheduler is not None and _scheduler.running:
        return

    from apscheduler.schedulers.background import BackgroundScheduler

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        run_periodic_live_reconciliation,
        "interval",
        minutes=LIVE_RECONCILE_INTERVAL_MINUTES,
        id="live_reconciliation",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=60,
    )
    _scheduler.start()
    logger.info(
        "Live reconciliation scheduler started",
        extra={
            "event": "live_reconciliation_scheduler_started",
            "interval_minutes": LIVE_RECONCILE_INTERVAL_MINUTES,
        },
    )


def shutdown_live_reconciliation_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
        logger.info(
            "Live reconciliation scheduler stopped",
            extra={"event": "live_reconciliation_scheduler_stopped"},
        )
    except Exception:
        logger.exception("Failed to stop live reconciliation scheduler")
    _scheduler = None
