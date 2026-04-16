from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime, date
from sqlalchemy.orm import joinedload
from DB.database import get_db
from DB.models.scheduling import MachineStatus, Status, MachineDowntime
from DB.models.configuration import Machine   # adjust path if needed

from DB.schemas.machine_status import (
    MachineStatusOut,
    MachineStatusResponse,
    UpdateMachineStatusRequest
)
from DB.schemas.machine_downtime import MachineDowntimeOut

router = APIRouter(
    prefix="/machine-status",
    tags=["Machine Status"]
)

# @router.get("/")
@router.get("/machine-status/", response_model=MachineStatusResponse)
async def get_machine_status(db: Session = Depends(get_db)):
    """
    Get status information for all machines.
    Returns machine make, status name, description, and available from date.
    Results are sorted by machine ID.
    Creates default status entries for machines without existing records.
    """
    try:
        # Get all machines
        # all_machines = db.query(Machine).order_by(Machine.id).all()

        all_machines = db.query(Machine).options(joinedload(Machine.work_center)).order_by(Machine.id).all()
        
        # Get existing machine statuses
        machine_statuses_query = db.query(
            MachineStatus,
            Machine,
            Status
        ).join(
            Machine, MachineStatus.machine_id == Machine.id
        ).join(
            Status, MachineStatus.status_id == Status.id
        ).order_by(Machine.id)
        
        machine_statuses_raw = machine_statuses_query.all()
        
        # Create a dictionary of existing machine statuses
        existing_statuses = {}
        for ms, machine, status in machine_statuses_raw:
            existing_statuses[machine.id] = (ms, machine, status)
        
        machine_statuses = []
        machines_without_status = []
        
        # Process all machines
        for machine in all_machines:
            if machine.id in existing_statuses:
                # Machine has existing status
                ms, machine_obj, status = existing_statuses[machine.id]
                machine_status = MachineStatusOut(
                    work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
                    machine_make=machine.make or "Unknown",
                    machine_id=machine.id,
                    status_id=status.id,
                    status_name=status.name,
                    description=ms.description,
                    available_from=ms.available_from,
                    available_to=ms.available_to
                )
                machine_statuses.append(machine_status)
            else:
                # Machine has no status record - create default entry
                machines_without_status.append(machine)
                
                # Get default ON status (assuming status_id=1 is ON)
                default_status = db.query(Status).filter(Status.id == 1).first()
                if not default_status:
                    default_status = db.query(Status).first()  # Fallback to first status
                
                # Create default status entry
                default_machine_status = MachineStatus(
                    machine_id=machine.id,
                    status_id=default_status.id,
                    description="Default status - machine created",
                    available_from=datetime(2026, 1, 1),  # Default from date as requested
                    available_to=None
                )
                db.add(default_machine_status)
                
                # Add to response
                machine_status = MachineStatusOut(
                    work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
                    machine_make=machine.make or "Unknown",
                    machine_id=machine.id,
                    status_id=default_status.id,
                    status_name=default_status.name,
                    description="Default status - machine created",
                    available_from=datetime(2026, 1, 1),
                    available_to=None
                )
                machine_statuses.append(machine_status)
        
        # Commit the new default status entries
        if machines_without_status:
            db.commit()
            print(f"Created default status entries for {len(machines_without_status)} machines")
        
        return MachineStatusResponse(
            total_machines=len(machine_statuses),
            statuses=machine_statuses
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching machine status: {str(e)}"
        )

# @router.put("/{machine_id}")
@router.put("/machine-status/{machine_id}", response_model=MachineStatusOut)
async def update_machine_status(
    machine_id: int, 
    status_update: UpdateMachineStatusRequest, 
    db: Session = Depends(get_db)
):
    """
    Update machine status.
    Allows changing status from ON to OFF (1->2) or any other valid status.
    Also updates available_from and available_to dates.
    """
    try:
        # Check if machine exists
        machine = (db.query(Machine).options(joinedload(Machine.work_center)).filter(Machine.id == machine_id).first())
        if not machine:
            raise HTTPException(
                status_code=404,
                detail=f"Machine with id {machine_id} not found"
            )
        

        # Check if status exists
        status = db.query(Status).filter(Status.id == status_update.status_id).first()
        if not status:
            raise HTTPException(
                status_code=400,
                detail=f"Status with id {status_update.status_id} not found"
            )
        
        # Find existing machine status
        machine_status = db.query(MachineStatus).filter(
            MachineStatus.machine_id == machine_id
        ).first()
        
        if not machine_status:
            raise HTTPException(
                status_code=404,
                detail=f"No status entry found for machine with id {machine_id}. Create machine first to initialize status."
            )
        
        # Store previous status for downtime logging
        previous_status_id = machine_status.status_id
        
        # Update existing status
        machine_status.status_id = status_update.status_id
        machine_status.description = status_update.description
        machine_status.available_from = status_update.available_from
        machine_status.available_to = status_update.available_to
        
        # Log downtime if status changed from ON (1) to OFF (2) or any other non-operational status
        if previous_status_id != status_update.status_id:
            # Close any existing downtime records for this machine (set end_time)
            existing_downtime = db.query(MachineDowntime).filter(
                MachineDowntime.machine_id == machine_id,
                MachineDowntime.end_time == datetime(1970, 1, 1)  # Using placeholder for active records
            ).first()
            
            if existing_downtime:
                existing_downtime.end_time = datetime.utcnow()
            
            # Create new downtime record for the status change
            # Use user-provided dates if available, otherwise use current time
            start_time = status_update.available_from if status_update.available_from else datetime.utcnow()
            
            # Only set end_time if user provided it, otherwise keep as active (1970 placeholder)
            if status_update.available_to:
                end_time = status_update.available_to
            else:
                end_time = datetime(2026, 1, 1)  # Placeholder for active downtime
            
            new_downtime = MachineDowntime(
                machine_id=machine_id,
                status_id=status_update.status_id,
                status_name=status.name,
                description=status_update.description or f"Status changed from {previous_status_id} to {status_update.status_id}",
                start_time=start_time,
                end_time=end_time,
                created_at=datetime.utcnow()  # Explicitly set created_at to current time
            )
            db.add(new_downtime)
        
        db.commit()
        
        db.refresh(machine_status)
        db.refresh(machine)
        
        # Return the updated status
        return MachineStatusOut(
            work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
            machine_make=machine.make or "Unknown",
            machine_id=machine.id,
            status_id=status.id,   
            status_name=status.name,
            description=machine_status.description,
            available_from=machine_status.available_from,
            available_to=machine_status.available_to
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error updating machine status: {str(e)}"
        )


@router.get("/machine-downtime/{machine_id}", response_model=List[MachineDowntimeOut])
async def get_machine_downtime(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Get downtime records for a specific machine.
    Returns all downtime entries with start and end times.
    """
    try:
        # Check if machine exists
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine:
            raise HTTPException(
                status_code=404,
                detail=f"Machine with id {machine_id} not found"
            )
        
        downtime_records = db.query(MachineDowntime,Machine).join(Machine, MachineDowntime.machine_id == Machine.id).options(joinedload(Machine.work_center)).filter(MachineDowntime.machine_id == machine_id).order_by(MachineDowntime.start_time.desc()).all()


        
        # Convert to response format
        downtime_list = []
        for record, machine in downtime_records:
            # Set end_time to None if it's the placeholder (1970-01-01)
            end_time = None if record.end_time.year == 1970 else record.end_time
            
            downtime_out = MachineDowntimeOut(
                work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
                machine_id=record.machine_id,
                machine_name=machine.make or f"Machine {record.machine_id}",
                status_id=record.status_id,
                status_name=record.status_name,
                description=record.description,
                start_time=record.start_time,
                end_time=end_time,
                created_at=record.created_at
            )
            downtime_list.append(downtime_out)
        
        return downtime_list
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching downtime records: {str(e)}"
        )


@router.delete("/machine-downtime/{machine_id}")
async def delete_downtime_records(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete all downtime records for a specific machine.
    """
    try:
        # Check if machine exists
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        if not machine:
            raise HTTPException(
                status_code=404,
                detail=f"Machine with id {machine_id} not found"
            )
        
        # Delete all downtime records for this machine
        deleted_count = db.query(MachineDowntime).filter(
            MachineDowntime.machine_id == machine_id
        ).delete()
        
        db.commit()
        
        return {"message": f"Deleted {deleted_count} downtime records for machine {machine_id}"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error deleting downtime records: {str(e)}"
        )


@router.get("/machine-downtime/", response_model=List[MachineDowntimeOut])
async def get_all_downtime_records(
    db: Session = Depends(get_db)
):
    """
    Get all downtime records for all machines.
    Returns all downtime entries with start and end times.
    """
    try:
        downtime_records = db.query(MachineDowntime,Machine).join(Machine, MachineDowntime.machine_id == Machine.id).options(joinedload(Machine.work_center)).order_by(MachineDowntime.start_time.desc()).all()
        
        # Convert to response format
        downtime_list = []
        for record, machine in downtime_records:
            # Set end_time to None if it's the placeholder (1970-01-01)
            end_time = None if record.end_time.year == 1970 else record.end_time
            
            downtime_out = MachineDowntimeOut(
                work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
                machine_id=record.machine_id,
                machine_name=machine.make or f"Machine {record.machine_id}",
                status_id=record.status_id,
                status_name=record.status_name,
                description=record.description,
                start_time=record.start_time,
                end_time=end_time,
                created_at=record.created_at
            )
            downtime_list.append(downtime_out)
        
        return downtime_list
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching downtime records: {str(e)}"
        )



@router.get("/machine-downtime-by-date")
def get_downtime_by_date(
    start_date: date,
    end_date: date,
    db: Session = Depends(get_db)
):
    """
    Returns all machine downtimes overlapping given date range
    """

    start_dt = datetime.combine(start_date, datetime.min.time())
    end_dt = datetime.combine(end_date, datetime.max.time())

    records = db.query(
        MachineDowntime,
        Machine
    ).join(
        Machine, MachineDowntime.machine_id == Machine.id
    ).filter(
        MachineDowntime.start_time <= end_dt,
        MachineDowntime.end_time >= start_dt
    ).all()

    result = []

    for record, machine in records:
        result.append({
            "machine_id": record.machine_id,
            "machine_name": machine.make,
            "status_name": record.status_name,
            "description": record.description,
            "start_time": record.start_time,
            "end_time": record.end_time
        })

    return result


@router.get("/active-machines/", response_model=MachineStatusResponse)
async def get_active_machines(db: Session = Depends(get_db)):
    """
    Get all machines that are currently active (status = "ON").
    Returns only machines with ON status, sorted by machine ID.
    """
    try:
        # Query for machines with ON status
        active_machines_query = db.query(
            MachineStatus,
            Machine,
            Status
        ).join(
            Machine, MachineStatus.machine_id == Machine.id
        ).join(
            Status, MachineStatus.status_id == Status.id
        ).filter(
            Status.name == "ON"
        ).options(
            joinedload(Machine.work_center)
        ).order_by(Machine.id)
        
        active_machines_raw = active_machines_query.all()
        
        # Convert to response format
        active_machines = []
        for ms, machine, status in active_machines_raw:
            machine_status = MachineStatusOut(
                work_center_name=machine.work_center.work_center_name if machine.work_center else "Unknown",
                machine_make=machine.make or "Unknown",
                machine_id=machine.id,
                status_id=status.id,
                status_name=status.name,
                description=ms.description,
                available_from=ms.available_from,
                available_to=ms.available_to
            )
            active_machines.append(machine_status)
        
        return MachineStatusResponse(
            total_machines=len(active_machines),
            statuses=active_machines
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching active machines: {str(e)}"
        )