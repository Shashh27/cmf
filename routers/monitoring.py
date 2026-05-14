from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from typing import List
from datetime import datetime
from DB.database import get_db
from DB.models.configuration import Machine
from DB.models.monitoring import MachineLiveStatus, MachineLiveHistory
from DB.models.oms import Order, Part, Operation
from DB.schemas.monitoring import LiveMonitoringDisplay, MachineLiveStatusCreate, MachineLiveHistory

router = APIRouter(
    prefix="/monitoring",
    tags=["monitoring"]
)

@router.get("/live", response_model=List[LiveMonitoringDisplay])
def get_live_monitoring(db: Session = Depends(get_db)):
    # Get all machines
    machines = db.query(Machine).all()
    results = []

    for machine in machines:
        # Get live status
        live_status = db.query(MachineLiveStatus).filter(MachineLiveStatus.machine_id == machine.id).first()
        
        display_data = {
            "machine_id": machine.id,
            "machine_name": f"{machine.make or ''} {machine.model or ''}".strip(),
            "status": "OFF",
            "last_updated": datetime.now(),
            "sale_order_number": None,
            "part_number": None,
            "operation_name": None,
            "operation_number": None,
            "completed_qty": 0,
            "target_qty": 0
        }

        if live_status:
            display_data["last_updated"] = live_status.last_updated
            
            if live_status.order:
                display_data["sale_order_number"] = live_status.order.sale_order_number
            
            if live_status.part:
                display_data["part_number"] = live_status.part.part_number
                # Target qty is the qty column from the parts table
                display_data["target_qty"] = live_status.part.qty if live_status.part.qty else 0
            
            if live_status.operation:
                display_data["operation_name"] = live_status.operation.operation_name
                display_data["operation_number"] = live_status.operation.operation_number
                
                # Calculate part count from approved quantity in production logs
                # Get completed quantity using raw SQL
                completed_query = text("""
                    SELECT COALESCE(SUM(approved_quantity), 0)
                    FROM scheduling.production_logs
                    WHERE operation_id = :op_id
                """)
                completed = db.execute(completed_query, {"op_id": live_status.current_operation_id}).scalar() or 0
                display_data["completed_qty"] = int(completed) if completed else 0

            # Dynamic status logic:
            # OFF: No order, part, or operation (any is null)
            # ON: Order, part, and operation have data, and completed_qty is 0
            # PRODUCTION: Order, part, and operation have data, and completed_qty > 0
            has_job_data = (
                live_status.current_order_id is not None and 
                live_status.current_part_id is not None and 
                live_status.current_operation_id is not None
            )

            if not has_job_data:
                display_data["status"] = "OFF"
            elif display_data["completed_qty"] > 0:
                display_data["status"] = "PRODUCTION"
            else:
                display_data["status"] = "ON"

        results.append(display_data)

    return results

@router.post("/update-status")
def update_machine_status(status_data: MachineLiveStatusCreate, db: Session = Depends(get_db)):
    db_status = db.query(MachineLiveStatus).filter(MachineLiveStatus.machine_id == status_data.machine_id).first()
    
    # Determine status based on data rules:
    # OFF: No order, part, or operation (any is null)
    # ON: Order, part, and operation have data, and completed_qty is 0
    # PRODUCTION: Order, part, and operation have data, and completed_qty > 0
    
    has_job_data = (
        status_data.current_order_id is not None and 
        status_data.current_part_id is not None and 
        status_data.current_operation_id is not None
    )
    
    if not has_job_data:
        normalized_status = "OFF"
    else:
        # Check completed qty for this operation
        completed_query = text("""
            SELECT COALESCE(SUM(approved_quantity), 0)
            FROM scheduling.production_logs
            WHERE operation_id = :op_id
        """)
        completed = db.execute(completed_query, {"op_id": status_data.current_operation_id}).scalar() or 0
        normalized_status = "PRODUCTION" if completed > 0 else "ON"
    
    if db_status:
        # Save current state to history BEFORE updating
        history_record = MachineLiveHistory(
            machine_id=db_status.machine_id,
            status=db_status.status,
            last_updated=db_status.last_updated,
            current_order_id=db_status.current_order_id,
            current_part_id=db_status.current_part_id,
            current_operation_id=db_status.current_operation_id
        )
        db.add(history_record)
        
        # Now update the current status
        db_status.status = normalized_status
        db_status.current_order_id = status_data.current_order_id
        db_status.current_part_id = status_data.current_part_id
        db_status.current_operation_id = status_data.current_operation_id
    else:
        # Create new status record
        status_dict = status_data.dict()
        status_dict["status"] = normalized_status
        db_status = MachineLiveStatus(**status_dict)
        db.add(db_status)
    
    db.commit()
    db.refresh(db_status)
    return db_status

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
