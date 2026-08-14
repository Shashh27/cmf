import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Literal
from datetime import datetime
from DB.database import SessionLocal, get_db
from DB.models.configuration import Machine
from DB.models.monitoring import MachineLiveStatus, MachineLiveHistory, MachineProcessData
from DB.schemas.monitoring import (
    LiveMonitoringDisplay,
    MachineLiveHistory as MachineLiveHistorySchema,
    MachineProcessHistoryResponse,
    MachineProcessPoint,
)


router = APIRouter(
    prefix="/monitoring",
    tags=["monitoring"]
)

PROCESS_PARAMETERS = ("feed_rate", "spindle_speed", "spindle_load")

# Machines not on machine_live_status (not connected) — activation from production_logs
DISCONNECTED_MACHINE_IDS = {20, 21, 34, 35, 50, 51}


def normalize_display_status(raw_status: str | None) -> str:
    normalized = (raw_status or "OFF").strip().upper()
    if not normalized:
        return "OFF"
    if normalized == "ON":
        return "IDLE"
    return normalized


def get_operation_quantity_totals(db: Session, operation_ids: list[int]) -> dict[int, dict[str, int]]:
    """Sum produced, approved, and rejected quantities across all logs per operation."""
    if not operation_ids:
        return {}

    rows = db.execute(
        text("""
            SELECT
                operation_id,
                COALESCE(SUM(produced_quantity), 0) AS produced_qty,
                COALESCE(SUM(approved_quantity), 0) AS approved_qty,
                COALESCE(SUM(rejected_quantity), 0) AS rejected_qty
            FROM scheduling.production_logs
            WHERE operation_id = ANY(:operation_ids)
            GROUP BY operation_id
        """),
        {"operation_ids": operation_ids},
    ).mappings().all()

    return {
        row["operation_id"]: {
            "produced_qty": int(row["produced_qty"] or 0),
            "approved_qty": int(row["approved_qty"] or 0),
            "rejected_qty": int(row["rejected_qty"] or 0),
        }
        for row in rows
    }


def get_current_scheduled_jobs(db: Session, machine_ids: list[int]) -> dict[int, dict]:
    """
    Current schedule window from scheduling.rescheduling_items:
    now() is between start_time and end_time for each machine.
    """
    if not machine_ids:
        return {}

    rows = db.execute(
        text("""
            SELECT DISTINCT ON (ri.machine_id)
                ri.machine_id,
                ri.order_id,
                ri.part_id,
                ri.operation_id,
                ri.start_time,
                ri.end_time,
                o.sale_order_number,
                p.part_number,
                COALESCE(p.qty, 0) AS part_qty,
                op.operation_number,
                op.operation_name
            FROM scheduling.rescheduling_items ri
            LEFT JOIN oms.orders o ON o.id = ri.order_id
            LEFT JOIN oms.parts p ON p.id = ri.part_id
            LEFT JOIN oms.operations op ON op.id = ri.operation_id
            WHERE ri.machine_id = ANY(:machine_ids)
              AND ri.start_time IS NOT NULL
              AND ri.end_time IS NOT NULL
              AND NOW() >= ri.start_time
              AND NOW() <= ri.end_time
            ORDER BY ri.machine_id, ri.start_time ASC
        """),
        {"machine_ids": machine_ids},
    ).mappings().all()

    return {
        int(row["machine_id"]): {
            "sale_order_number": row["sale_order_number"],
            "part_number": row["part_number"],
            "part_qty": int(row["part_qty"] or 0),
            "operation_number": (
                str(row["operation_number"]) if row["operation_number"] is not None else None
            ),
            "operation_name": row["operation_name"],
            "start_time": row["start_time"],
            "end_time": row["end_time"],
        }
        for row in rows
        if row["machine_id"] is not None
    }


def get_latest_production_log_jobs(db: Session, machine_ids: list[int]) -> dict[int, dict]:
    """
    For disconnected machines: latest production_logs row per machine
    (via oms.operations.machine_id) is treated as the activated job.
    """
    if not machine_ids:
        return {}

    rows = db.execute(
        text("""
            SELECT DISTINCT ON (op.machine_id)
                op.machine_id,
                pl.operation_id,
                op.operation_number,
                op.operation_name,
                p.part_number,
                COALESCE(p.qty, 0) AS part_qty,
                COALESCE(psi.sale_order_number, ord.sale_order_number) AS sale_order_number,
                pl.created_at AS last_log_at
            FROM scheduling.production_logs pl
            JOIN oms.operations op ON op.id = pl.operation_id
            LEFT JOIN oms.parts p ON p.id = op.part_id
            LEFT JOIN oms.products pr ON pr.id = p.product_id
            LEFT JOIN oms.orders ord ON ord.product_id = pr.id
            LEFT JOIN LATERAL (
                SELECT psi.sale_order_number
                FROM scheduling.planned_schedule_items psi
                WHERE psi.operation_id = pl.operation_id
                ORDER BY psi.id DESC
                LIMIT 1
            ) psi ON TRUE
            WHERE op.machine_id = ANY(:machine_ids)
            ORDER BY op.machine_id, pl.created_at DESC NULLS LAST, pl.id DESC
        """),
        {"machine_ids": machine_ids},
    ).mappings().all()

    operation_ids = [int(row["operation_id"]) for row in rows if row["operation_id"] is not None]
    quantity_totals = get_operation_quantity_totals(db, operation_ids)

    result = {}
    for row in rows:
        if row["machine_id"] is None or row["operation_id"] is None:
            continue
        op_id = int(row["operation_id"])
        totals = quantity_totals.get(op_id, {})
        result[int(row["machine_id"])] = {
            "operation_id": op_id,
            "sale_order_number": row["sale_order_number"],
            "part_number": row["part_number"],
            "part_qty": int(row["part_qty"] or 0),
            "operation_number": (
                str(row["operation_number"]) if row["operation_number"] is not None else None
            ),
            "operation_name": row["operation_name"],
            "produced_qty": totals.get("produced_qty", 0),
            "approved_qty": totals.get("approved_qty", 0),
            "rejected_qty": totals.get("rejected_qty", 0),
            "last_log_at": row["last_log_at"],
        }
    return result


def build_live_monitoring_snapshot(db: Session):
    machines = db.query(Machine).all()
    live_statuses = {
        status.machine_id: status
        for status in db.query(MachineLiveStatus).all()
    }

    machine_ids = [machine.id for machine in machines]
    scheduled_by_machine = get_current_scheduled_jobs(db, machine_ids)

    disconnected_ids = [mid for mid in machine_ids if mid in DISCONNECTED_MACHINE_IDS]
    production_log_jobs = get_latest_production_log_jobs(db, disconnected_ids)

    operation_ids = [
        status.current_operation_id
        for status in live_statuses.values()
        if status.current_operation_id is not None
    ]
    quantity_totals = get_operation_quantity_totals(db, operation_ids)

    results = []

    for machine in machines:
        live_status = live_statuses.get(machine.id)
        scheduled = scheduled_by_machine.get(machine.id)
        in_schedule_window = scheduled is not None
        is_disconnected = machine.id in DISCONNECTED_MACHINE_IDS

        display_data = {
            "machine_id": machine.id,
            "machine_name": f"{machine.make or ''} {machine.model or ''}".strip(),
            "machine_type": machine.type,
            "work_center_name": machine.work_center.work_center_name if machine.work_center else "Unassigned",
            "make": machine.make,
            "model": machine.model,
            "cnc_controller": machine.cnc_controller,
            "year_of_installation": machine.year_of_installation,
            "remarks": machine.remarks,
            "mhr": machine.mhr,
            "status": "OFF",
            "last_updated": datetime.now(),
            "schedule_status": "NOT_SCHEDULED",
            "operator_status": "INACTIVE",
            "job_source": "NONE",
            "sale_order_number": None,
            "part_number": None,
            "operation_name": None,
            "operation_number": None,
            "part_qty": 0,
            "produced_qty": 0,
            "approved_qty": 0,
            "rejected_qty": 0,
            "program_name": None,
            "active_program_number": None,
            "main_program_number": None,
            "mode": None,
            "run_status": None,
            "feed_rate": None,
            "spindle_speed": None,
            "spindle_load": None,
            "axis_load": None,
            "has_process_data": False,
        }

        activated_job = None

        if is_disconnected:
            # Not on machine_live_status — activation from latest production_logs for machine
            display_data["status"] = "NOT_CONNECTED"
            pl_job = production_log_jobs.get(machine.id)
            if pl_job:
                if pl_job.get("last_log_at"):
                    display_data["last_updated"] = pl_job["last_log_at"]
                part_qty = pl_job["part_qty"]
                approved_qty = pl_job["approved_qty"]
                job_complete = part_qty > 0 and part_qty == approved_qty
                if not job_complete:
                    display_data["operator_status"] = "ACTIVATED"
                    activated_job = pl_job
        elif live_status:
            display_data["last_updated"] = live_status.last_updated
            display_data["status"] = normalize_display_status(live_status.status)
            display_data["program_name"] = live_status.program_name
            display_data["active_program_number"] = live_status.active_program_number
            display_data["main_program_number"] = live_status.main_program_number
            display_data["mode"] = live_status.mode
            display_data["run_status"] = live_status.run_status
            display_data["feed_rate"] = live_status.feed_rate
            display_data["spindle_speed"] = live_status.spindle_speed
            display_data["spindle_load"] = live_status.spindle_load
            display_data["axis_load"] = live_status.axis_load
            display_data["has_process_data"] = any(
                getattr(live_status, key) is not None for key in PROCESS_PARAMETERS
            )

            has_job_card = bool(
                live_status.current_order_id
                and live_status.current_part_id
                and live_status.current_operation_id
            )

            part_qty = 0
            if live_status.part:
                part_qty = live_status.part.qty if live_status.part.qty else 0

            produced_qty = 0
            approved_qty = 0
            rejected_qty = 0
            if live_status.current_operation_id is not None:
                totals = quantity_totals.get(live_status.current_operation_id, {})
                produced_qty = totals.get("produced_qty", 0)
                approved_qty = totals.get("approved_qty", 0)
                rejected_qty = totals.get("rejected_qty", 0)

            # Target == Approved → completed → Inactive, no job details
            job_complete = has_job_card and part_qty > 0 and part_qty == approved_qty

            if has_job_card and not job_complete:
                display_data["operator_status"] = "ACTIVATED"
                activated_job = {
                    "sale_order_number": live_status.order.sale_order_number if live_status.order else None,
                    "part_number": live_status.part.part_number if live_status.part else None,
                    "part_qty": part_qty,
                    "operation_name": live_status.operation.operation_name if live_status.operation else None,
                    "operation_number": (
                        str(live_status.operation.operation_number)
                        if live_status.operation and live_status.operation.operation_number is not None
                        else None
                    ),
                    "produced_qty": produced_qty,
                    "approved_qty": approved_qty,
                    "rejected_qty": rejected_qty,
                }

        # Activated (in progress) → Scheduled pill
        # Else Scheduled only while now is between start_time and end_time
        # Completed jobs: schedule rows are removed → Not Scheduled + Inactive + empty details
        if display_data["operator_status"] == "ACTIVATED" or in_schedule_window:
            display_data["schedule_status"] = "SCHEDULED"
        else:
            display_data["schedule_status"] = "NOT_SCHEDULED"

        # Details priority: active activated job first, else current schedule-window job
        if activated_job:
            display_data["job_source"] = "ACTIVATED"
            display_data["sale_order_number"] = activated_job["sale_order_number"]
            display_data["part_number"] = activated_job["part_number"]
            display_data["part_qty"] = activated_job["part_qty"]
            display_data["operation_name"] = activated_job["operation_name"]
            display_data["operation_number"] = activated_job["operation_number"]
            display_data["produced_qty"] = activated_job["produced_qty"]
            display_data["approved_qty"] = activated_job["approved_qty"]
            display_data["rejected_qty"] = activated_job["rejected_qty"]
        elif in_schedule_window:
            display_data["job_source"] = "SCHEDULED"
            display_data["sale_order_number"] = scheduled["sale_order_number"]
            display_data["part_number"] = scheduled["part_number"]
            display_data["part_qty"] = scheduled["part_qty"]
            display_data["operation_name"] = scheduled["operation_name"]
            display_data["operation_number"] = scheduled["operation_number"]
            # Scheduled only → target shown; other qtys remain 0 / disabled in UI
        # else: completed / nothing assigned → empty card details (Not Scheduled + Inactive)

        results.append(display_data)

    return results

@router.get("/live", response_model=List[LiveMonitoringDisplay])
def get_live_monitoring(db: Session = Depends(get_db)):
    return build_live_monitoring_snapshot(db)


@router.get("/process-data/{machine_id}", response_model=MachineProcessHistoryResponse)
def get_machine_process_data(
    machine_id: int,
    parameter: Literal["feed_rate", "spindle_speed", "spindle_load"] = Query(...),
    start: datetime = Query(..., description="Range start (ISO datetime)"),
    end: datetime = Query(..., description="Range end (ISO datetime)"),
    db: Session = Depends(get_db),
):
    """Historical CNC parameter values from production_monitoring.machine_process_data."""
    if end < start:
        raise HTTPException(status_code=400, detail="end must be greater than or equal to start")

    value_column = getattr(MachineProcessData, parameter)
    rows = (
        db.query(MachineProcessData.timestamp, value_column.label("value"))
        .filter(
            MachineProcessData.machine_id == machine_id,
            MachineProcessData.timestamp >= start,
            MachineProcessData.timestamp <= end,
        )
        .order_by(MachineProcessData.timestamp.asc())
        .all()
    )

    return MachineProcessHistoryResponse(
        machine_id=machine_id,
        parameter=parameter,
        start=start,
        end=end,
        points=[
            MachineProcessPoint(timestamp=row.timestamp, value=row.value)
            for row in rows
        ],
    )


@router.websocket("/live/ws")
async def live_monitoring_websocket(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            db = SessionLocal()
            try:
                snapshot = build_live_monitoring_snapshot(db)
            finally:
                db.close()

            await websocket.send_json(jsonable_encoder(snapshot))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        return



@router.get("/history/{machine_id}", response_model=List[MachineLiveHistorySchema])
def get_machine_history(machine_id: int, limit: int = 100, db: Session = Depends(get_db)):
    """
    Get historical status changes for a specific machine
    """
    history = db.query(MachineLiveHistory).filter(
        MachineLiveHistory.machine_id == machine_id
    ).order_by(MachineLiveHistory.last_updated.desc()).limit(limit).all()
    
    return history

@router.get("/history/{machine_id}/date-range")
def get_machine_history_by_date(
    machine_id: int, 
    start_date: str, 
    end_date: str, 
    db: Session = Depends(get_db)
):
    """
    Get historical status changes for a machine within a date range
    """
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        
        history = db.query(MachineLiveHistory).filter(
            MachineLiveHistory.machine_id == machine_id,
            MachineLiveHistory.last_updated >= start_dt,
            MachineLiveHistory.last_updated <= end_dt
        ).order_by(MachineLiveHistory.last_updated.desc()).all()
        
        return {
            "machine_id": machine_id,
            "start_date": start_date,
            "end_date": end_date,
            "history_count": len(history),
            "history": history
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

