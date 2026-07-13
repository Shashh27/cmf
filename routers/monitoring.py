import asyncio

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime
from DB.database import SessionLocal, get_db
from DB.models.configuration import Machine
from DB.models.monitoring import MachineLiveStatus, MachineLiveHistory
from DB.schemas.monitoring import LiveMonitoringDisplay, MachineLiveHistory


router = APIRouter(
    prefix="/monitoring",
    tags=["monitoring"]
)


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


def build_live_monitoring_snapshot(db: Session):
    machines = db.query(Machine).all()
    live_statuses = {
        status.machine_id: status
        for status in db.query(MachineLiveStatus).all()
    }

    operation_ids = [
        status.current_operation_id
        for status in live_statuses.values()
        if status.current_operation_id is not None
    ]
    quantity_totals = get_operation_quantity_totals(db, operation_ids)

    results = []

    for machine in machines:
        live_status = live_statuses.get(machine.id)

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
            "sale_order_number": None,
            "part_number": None,
            "operation_name": None,
            "operation_number": None,
            "part_qty": 0,
            "produced_qty": 0,
            "approved_qty": 0,
            "rejected_qty": 0,
        }

        if live_status:
            display_data["last_updated"] = live_status.last_updated
            display_data["status"] = normalize_display_status(live_status.status)

            if live_status.order:
                display_data["sale_order_number"] = live_status.order.sale_order_number

            if live_status.part:
                display_data["part_number"] = live_status.part.part_number
                display_data["part_qty"] = live_status.part.qty if live_status.part.qty else 0

            if live_status.operation:
                display_data["operation_name"] = live_status.operation.operation_name
                display_data["operation_number"] = live_status.operation.operation_number

                totals = quantity_totals.get(live_status.current_operation_id, {})
                display_data["produced_qty"] = totals.get("produced_qty", 0)
                display_data["approved_qty"] = totals.get("approved_qty", 0)
                display_data["rejected_qty"] = totals.get("rejected_qty", 0)

        results.append(display_data)

    return results

@router.get("/live", response_model=List[LiveMonitoringDisplay])
def get_live_monitoring(db: Session = Depends(get_db)):
    return build_live_monitoring_snapshot(db)


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



@router.get("/history/{machine_id}", response_model=List[MachineLiveHistory])
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
