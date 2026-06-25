from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime

from DB import AccessUser as AccessUserModel, OperatorLeave
from DB.schemas.access_control_pydantic import (
    OperatorLeaveCreate,
    OperatorLeaveUpdate,
    OperatorLeaveResponse,
    OperatorLeaveResponseWithOperator,
    OperatorLeaveStatusUpdate,
    AccessUserResponseForOperator
)
from DB.database import get_db

router = APIRouter(
    prefix="/operator-leaves",
    tags=["Operator Leaves"]
)


@router.get("/operators", response_model=List[AccessUserResponseForOperator])
def get_operators(db: Session = Depends(get_db)):
    """Get all operators (users with role = 'operator')"""
    operators = (
        db.query(AccessUserModel)
        .filter(AccessUserModel.role == "operator")
        .order_by(AccessUserModel.user_name.asc())
        .all()
    )
    return operators


@router.post("/", response_model=OperatorLeaveResponse)
def create_leave(
    operator_id: int = Query(..., description="Operator ID"),
    from_date: date = Query(..., description="Leave start date"),
    to_date: date = Query(..., description="Leave end date"),
    reason: Optional[str] = Query(None, description="Reason for leave (optional)"),
    additional_remarks: Optional[str] = Query(None, description="Additional remarks (optional)"),
    db: Session = Depends(get_db)
):
    """Create a new leave request for an operator using query parameters"""
    
    # Validate operator exists and has role = "operator"
    operator = db.query(AccessUserModel).filter(
        AccessUserModel.id == operator_id,
        AccessUserModel.role == "operator"
    ).first()
    
    if not operator:
        raise HTTPException(
            status_code=400,
            detail="Operator not found or user is not an operator"
        )
    
    # Check for overlapping leave dates
    overlapping_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == operator_id,
        OperatorLeave.from_date <= to_date,
        OperatorLeave.to_date >= from_date
    ).all()
    
    if overlapping_leaves:
        raise HTTPException(
            status_code=400,
            detail="Operator already has leave during this period, instead update the leave"
        )
    
    # Check for leaves with same from_date
    same_from_date_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == operator_id,
        OperatorLeave.from_date == from_date
    ).all()
    
    if same_from_date_leaves:
        raise HTTPException(
            status_code=400,
            detail=f"Operator already has a leave request starting on {from_date}. An operator can only have one leave per start date."
        )
    
    # Create leave record
    leave = OperatorLeave(
        operator_id=operator_id,
        from_date=from_date,
        to_date=to_date,
        reason=reason,
        additional_remarks=additional_remarks,
        status="pending"  # Default status for new leave requests
    )
    db.add(leave)
    db.commit()
    db.refresh(leave)
    
    return leave


@router.get("/", response_model=List[OperatorLeaveResponseWithOperator])
def get_all_leaves(
    operator_id: Optional[int] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get all leave requests with optional filters"""
    
    query = db.query(OperatorLeave).join(AccessUserModel, OperatorLeave.operator_id == AccessUserModel.id)
    
    # Apply filters
    if operator_id:
        query = query.filter(OperatorLeave.operator_id == operator_id)
    
    if from_date:
        query = query.filter(OperatorLeave.to_date >= from_date)
    
    if to_date:
        query = query.filter(OperatorLeave.from_date <= to_date)
    
    leaves = query.order_by(OperatorLeave.from_date.desc()).all()
    
    # Create response with operator name
    leave_responses = []
    for leave in leaves:
        leave_response = OperatorLeaveResponseWithOperator(
            id=leave.id,
            operator_id=leave.operator_id,
            operator_name=leave.operator.user_name,
            from_date=leave.from_date,
            to_date=leave.to_date,
            reason=leave.reason,
            additional_remarks=leave.additional_remarks,
            status=leave.status,
            approved_by=leave.approved_by,
            created_at=leave.created_at,
            updated_at=leave.updated_at
        )
        leave_responses.append(leave_response)
    
    return leave_responses


@router.get("/{leave_id}", response_model=OperatorLeaveResponse)
def get_leave(leave_id: int, db: Session = Depends(get_db)):
    """Get a specific leave request by ID"""
    
    leave = db.query(OperatorLeave).filter(OperatorLeave.id == leave_id).first()
    
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    return leave


@router.get("/operator/{operator_id}", response_model=List[OperatorLeaveResponse])
def get_operator_leaves(
    operator_id: int,
    db: Session = Depends(get_db)
):
    """Get all leave requests for a specific operator"""
    
    # Validate operator exists
    operator = db.query(AccessUserModel).filter(
        AccessUserModel.id == operator_id,
        AccessUserModel.role == "operator"
    ).first()
    
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    
    leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == operator_id
    ).order_by(OperatorLeave.from_date.desc()).all()
    
    return leaves


@router.put("/{leave_id}", response_model=OperatorLeaveResponse)
def update_leave(
    leave_id: int,
    from_date: date = Query(..., description="Leave start date"),
    to_date: date = Query(..., description="Leave end date"),
    reason: Optional[str] = Query(None, description="Reason for leave (optional)"),
    additional_remarks: Optional[str] = Query(None, description="Additional remarks (optional)"),
    db: Session = Depends(get_db)
):
    """Update an existing leave request using query parameters"""
    
    leave = db.query(OperatorLeave).filter(OperatorLeave.id == leave_id).first()
    
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    # Update all required fields
    leave.from_date = from_date
    leave.to_date = to_date
    leave.reason = reason
    
    # Update optional field if provided
    if additional_remarks is not None:
        leave.additional_remarks = additional_remarks
    
    # Check for overlapping dates
    overlapping_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == leave.operator_id,
        OperatorLeave.id != leave_id,
        OperatorLeave.from_date <= to_date,
        OperatorLeave.to_date >= from_date
    ).all()
    
    if overlapping_leaves:
        raise HTTPException(
            status_code=400,
            detail="Updated dates overlap with existing leave period"
        )
    
    # Check for leaves with same from_date (excluding current leave)
    same_from_date_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == leave.operator_id,
        OperatorLeave.id != leave_id,
        OperatorLeave.from_date == from_date
    ).all()
    
    if same_from_date_leaves:
        raise HTTPException(
            status_code=400,
            detail=f"Operator already has a leave request starting on {from_date}. An operator can only have one leave per start date."
        )
    
    leave.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(leave)
    
    return leave


@router.delete("/{leave_id}")
def delete_leave(leave_id: int, db: Session = Depends(get_db)):
    """Delete a leave request"""
    
    leave = db.query(OperatorLeave).filter(OperatorLeave.id == leave_id).first()
    
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    db.delete(leave)
    db.commit()
    
    return {"message": "Leave request deleted successfully"}


@router.get("/check-availability/{operator_id}")
def check_operator_availability(
    operator_id: int,
    from_date: date = Query(..., description="Check availability from this date"),
    to_date: date = Query(..., description="Check availability to this date"),
    db: Session = Depends(get_db)
):
    """Check if an operator is available (no leave) for a given date range"""
    
    # Validate operator exists
    operator = db.query(AccessUserModel).filter(
        AccessUserModel.id == operator_id,
        AccessUserModel.role == "operator"
    ).first()
    
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    
    # Check for overlapping leaves
    overlapping_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.operator_id == operator_id,
        OperatorLeave.from_date <= to_date,
        OperatorLeave.to_date >= from_date
    ).all()
    
    is_available = len(overlapping_leaves) == 0
    
    return {
        "operator_id": operator_id,
        "operator_name": operator.user_name,
        "from_date": from_date,
        "to_date": to_date,
        "is_available": is_available,
        "conflicting_leaves": overlapping_leaves if not is_available else []
    }


@router.put("/{leave_id}/approve", response_model=OperatorLeaveResponse)
def approve_leave(
    leave_id: int,
    status_update: OperatorLeaveStatusUpdate,
    db: Session = Depends(get_db)
):
    """Approve or reject a leave request (Manufacturing Coordinator or Supervisor)"""
    
    # Validate status value
    if status_update.status not in ['acknowledged', 'rejected']:
        raise HTTPException(
            status_code=400,
            detail="Status must be either 'acknowledged' or 'rejected'"
        )
    
    # Validate approver exists and has appropriate role
    approver = db.query(AccessUserModel).filter(
        AccessUserModel.id == status_update.approved_by
    ).first()
    
    if not approver:
        raise HTTPException(
            status_code=400,
            detail="Approver not found"
        )
    
    if approver.role not in ['manufacturing_coordinator', 'supervisor', 'admin']:
        raise HTTPException(
            status_code=400,
            detail="Only manufacturing_coordinator, supervisor, or admin can approve leaves"
        )
    
    # Get leave request
    leave = db.query(OperatorLeave).filter(OperatorLeave.id == leave_id).first()
    
    if not leave:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    # Update status and approver
    leave.status = status_update.status
    leave.approved_by = status_update.approved_by
    leave.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(leave)
    
    return leave


@router.get("/pending", response_model=List[OperatorLeaveResponse])
def get_pending_leaves(db: Session = Depends(get_db)):
    """Get all pending leave requests for Manufacturing Coordinator approval"""
    
    pending_leaves = db.query(OperatorLeave).filter(
        OperatorLeave.status == 'pending'
    ).order_by(OperatorLeave.from_date.asc()).all()
    
    return pending_leaves


@router.get("/status/{status}", response_model=List[OperatorLeaveResponse])
def get_leaves_by_status(
    status: str,
    db: Session = Depends(get_db)
):
    """Get leave requests by status (pending, acknowledged, rejected)"""
    
    # Validate status value
    if status not in ['pending', 'acknowledged', 'rejected']:
        raise HTTPException(
            status_code=400,
            detail="Status must be one of: pending, acknowledged, rejected"
        )
    
    leaves = db.query(OperatorLeave).filter(
        OperatorLeave.status == status
    ).order_by(OperatorLeave.from_date.desc()).all()
    
    return leaves
