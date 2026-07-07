from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from DB.database import get_db
from DB.models.configuration import (
    OperationChecklist,
    OperationChecklistAssign,
    Submission,
    SubmissionDetail,
    Machine
)
from DB.models.oms import Operation, Part, Product, Order
from DB.models.access_control import AccessUser
from DB.schemas.configuration import (
    OperationChecklist as OperationChecklistSchema,
    OperationChecklistCreate,
    OperationChecklistUpdate,
    OperationChecklistAssign as OperationChecklistAssignSchema,
    OperationChecklistAssignCreate,
    OperationChecklistAssignUpdate,
    OperationChecklistAssignWithChecklist,
    Submission as SubmissionSchema,
    SubmissionCreate,
    SubmissionUpdate,
    SubmissionWithDetails,
    SubmissionDetail as SubmissionDetailSchema,
    SubmissionDetailCreate,
    SubmissionDetailUpdate,
    SubmissionDetailWithChecklist,
    SupervisorAction
)

router = APIRouter(prefix="/operation-checklists", tags=["Operation Checklists"])


# =======================
# Operation Checklists CRUD
# =======================

@router.post("", response_model=OperationChecklistSchema, status_code=status.HTTP_201_CREATED)
def create_operation_checklist(checklist: OperationChecklistCreate, db: Session = Depends(get_db)):
    """Create a new operation checklist (general or custom)"""
    db_checklist = OperationChecklist(**checklist.dict())
    db.add(db_checklist)
    db.commit()
    db.refresh(db_checklist)
    return db_checklist


@router.get("", response_model=List[OperationChecklistSchema])
def get_operation_checklists(
    type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all operation checklists, optionally filtered by type (general/custom)"""
    query = db.query(OperationChecklist)
    if type:
        query = query.filter(OperationChecklist.type == type)
    checklists = query.all()
    return checklists


# =======================
# Operation Checklist Assignments CRUD
# =======================

@router.post("/assignments", response_model=OperationChecklistAssignSchema, status_code=status.HTTP_201_CREATED)
def create_operation_checklist_assignment(assignment: OperationChecklistAssignCreate, db: Session = Depends(get_db)):
    """Assign a checklist to an operation (MC only)"""
    db_assignment = OperationChecklistAssign(**assignment.dict())
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    return db_assignment


@router.get("/assignments")
def get_operation_checklist_assignments(
    operation_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all operation checklist assignments, optionally filtered by operation_id"""
    query = db.query(OperationChecklistAssign)
    if operation_id is not None:
        query = query.filter(OperationChecklistAssign.operation_id == operation_id)
    assignments = query.all()
    return [
        {
            "id": a.id,
            "operation_id": a.operation_id,
            "checklist_id": a.checklist_id,
            "checklist_name": a.checklist.name if a.checklist else None,
            "assigned_by": a.assigned_by,
            "created_at": a.created_at.isoformat() if a.created_at else None
        }
        for a in assignments
    ]


@router.get("/assignments/{assignment_id}", response_model=OperationChecklistAssignWithChecklist)
def get_operation_checklist_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Get a specific operation checklist assignment by ID"""
    assignment = db.query(OperationChecklistAssign).filter(OperationChecklistAssign.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Operation checklist assignment not found")
    return assignment


@router.put("/assignments/{assignment_id}", response_model=OperationChecklistAssignSchema)
def update_operation_checklist_assignment(
    assignment_id: int,
    assignment_update: OperationChecklistAssignUpdate,
    db: Session = Depends(get_db)
):
    """Update an operation checklist assignment"""
    db_assignment = db.query(OperationChecklistAssign).filter(OperationChecklistAssign.id == assignment_id).first()
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Operation checklist assignment not found")
    
    update_data = assignment_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_assignment, key, value)
    
    db.commit()
    db.refresh(db_assignment)
    return db_assignment


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation_checklist_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Delete an operation checklist assignment"""
    db_assignment = db.query(OperationChecklistAssign).filter(OperationChecklistAssign.id == assignment_id).first()
    if not db_assignment:
        raise HTTPException(status_code=404, detail="Operation checklist assignment not found")
    
    db.delete(db_assignment)
    db.commit()
    return None


@router.post("/assignments/bulk", status_code=status.HTTP_201_CREATED)
def bulk_assign_checklists(request: dict, db: Session = Depends(get_db)):
    """Bulk assign checklists to an operation (one-time assignment)"""
    operation_id = request.get("operation_id")
    checklist_ids = request.get("checklist_ids", [])
    assigned_by = request.get("assigned_by")
    
    # Delete existing assignments for this operation
    db.query(OperationChecklistAssign).filter(
        OperationChecklistAssign.operation_id == operation_id
    ).delete()
    
    # Create new assignments
    for checklist_id in checklist_ids:
        assignment = OperationChecklistAssign(
            operation_id=operation_id,
            checklist_id=checklist_id,
            assigned_by=assigned_by
        )
        db.add(assignment)
    
    db.commit()
    return {"message": "Checklists assigned successfully"}


# =======================
# Submissions CRUD
# =======================

@router.post("/submissions", response_model=SubmissionWithDetails, status_code=status.HTTP_201_CREATED)
def create_submission(submission: SubmissionCreate, db: Session = Depends(get_db)):
    """Create a new submission with checklist responses (Operator)"""
    # Extract details from submission
    details_data = submission.details
    submission_data = submission.dict(exclude={'details'})
    
    db_submission = Submission(**submission_data)
    db.add(db_submission)
    db.commit()
    db.refresh(db_submission)
    
    # Create submission details
    for detail in details_data:
        detail_dict = detail.dict()
        detail_dict['sub_id'] = db_submission.id
        db_detail = SubmissionDetail(**detail_dict)
        db.add(db_detail)
    
    db.commit()
    db.refresh(db_submission)
    return db_submission


@router.get("/submissions")
def get_submissions(
    operation_id: Optional[int] = None,
    operator: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all submissions, optionally filtered by operation_id, operator, or status"""
    query = db.query(Submission)
    if operation_id:
        query = query.filter(Submission.operation_id == operation_id)
    if operator:
        query = query.filter(Submission.operator == operator)
    if status:
        query = query.filter(Submission.status == status)
    submissions = query.all()
    
    result = []
    for submission in submissions:
        # Get operation details
        operation = db.query(Operation).filter(Operation.id == submission.operation_id).first()
        
        # Get operator details
        operator_user = db.query(AccessUser).filter(AccessUser.id == submission.operator).first()
        
        # Get supervisor details
        supervisor_user = None
        if submission.supervisor:
            supervisor_user = db.query(AccessUser).filter(AccessUser.id == submission.supervisor).first()
        
        # Get machine details from operation
        machine = None
        if operation and operation.machine_id:
            machine = db.query(Machine).filter(Machine.id == operation.machine_id).first()
        
        # Build nested response
        submission_data = {
            "id": submission.id,
            "operation_id": submission.operation_id,
            "operator_id": submission.operator,
            "supervisor_id": submission.supervisor,
            "status": submission.status,
            "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
            "sup_action_at": submission.sup_action_at.isoformat() if submission.sup_action_at else None,
            "sup_remarks": submission.sup_remarks,
            "supervisor_ack_by": submission.supervisor_ack_by,
            "supervisor_ack_at": submission.supervisor_ack_at.isoformat() if submission.supervisor_ack_at else None,
            "operator_ack_by": submission.operator_ack_by,
            "operator_ack_at": submission.operator_ack_at.isoformat() if submission.operator_ack_at else None,
            "mc_ack_by": submission.mc_ack_by,
            "mc_ack_at": submission.mc_ack_at.isoformat() if submission.mc_ack_at else None,
            "created_at": submission.created_at.isoformat() if submission.created_at else None,
            "updated_at": submission.updated_at.isoformat() if submission.updated_at else None,
            "operation": None,
            "machine": None,
            "operator": None,
            "supervisor": None,
            "checklist_names": []
        }
        
        # Add operation details
        if operation:
            submission_data["operation"] = {
                "id": operation.id,
                "operation_number": operation.operation_number,
                "operation_name": operation.operation_name,
                "part": None,
                "product": None,
                "order": None
            }
            
            # Add part details
            if operation.part:
                submission_data["operation"]["part"] = {
                    "id": operation.part.id,
                    "part_number": operation.part.part_number,
                    "part_name": operation.part.part_name
                }
            
            # Add product details
            if operation.part and operation.part.product:
                submission_data["operation"]["product"] = {
                    "id": operation.part.product.id,
                    "product_name": operation.part.product.product_name,
                    "product_version": operation.part.product.product_version
                }
                
                # Add order details (get first order for the product)
                order = db.query(Order).filter(Order.product_id == operation.part.product.id).first()
                if order:
                    submission_data["operation"]["order"] = {
                        "id": order.id,
                        "sale_order_number": order.sale_order_number,
                        "quantity": order.quantity,
                        "status": order.status,
                        "customer": None
                    }
                    
                    # Add customer details if available
                    if order.customer:
                        submission_data["operation"]["order"]["customer"] = {
                            "id": order.customer.id,
                            "customer_name": order.customer.company_name
                        }
        
        # Add machine details
        if machine:
            submission_data["machine"] = {
                "id": machine.id,
                "make": machine.make,
                "model": machine.model
            }
        
        # Add operator details
        if operator_user:
            submission_data["operator"] = {
                "id": operator_user.id,
                "user_name": operator_user.user_name,
                "gmail": operator_user.gmail
            }
        
        # Add supervisor details
        if supervisor_user:
            submission_data["supervisor"] = {
                "id": supervisor_user.id,
                "user_name": supervisor_user.user_name
            }
        
        # Add checklist names from submission details
        for detail in submission.details:
            if detail.checklist:
                submission_data["checklist_names"].append({
                    "checklist_id": detail.checklist.id,
                    "checklist_name": detail.checklist.name,
                    "response": detail.response,
                    "op_remarks": detail.op_remarks
                })
        
        result.append(submission_data)
    
    return result


@router.get("/submissions/latest")
def get_latest_submission(
    operation_id: int,
    operator: int,
    db: Session = Depends(get_db)
):
    """Get the latest submission for an operation by operator"""
    submission = db.query(Submission).filter(
        Submission.operation_id == operation_id,
        Submission.operator == operator
    ).order_by(Submission.submitted_at.desc()).first()
    
    if not submission:
        return {"status": None}
    
    # Get checklist IDs that had true responses (to be disabled on re-submission)
    disabled_checklists = [
        detail.checklist_id
        for detail in submission.details
        if detail.response is True
    ]
    
    return {
        "id": submission.id,
        "operation_id": submission.operation_id,
        "operator": submission.operator,
        "status": submission.status,
        "sup_remarks": submission.sup_remarks,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "disabled_checklists": disabled_checklists,
        "details": [
            {
                "id": detail.id,
                "checklist_id": detail.checklist_id,
                "response": detail.response,
                "op_remarks": detail.op_remarks
            }
            for detail in submission.details
        ]
    }


@router.get("/submissions/{submission_id}", response_model=SubmissionWithDetails)
def get_submission(submission_id: int, db: Session = Depends(get_db)):
    """Get a specific submission by ID with details"""
    submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return submission


@router.put("/submissions/{submission_id}/supervisor-action", response_model=SubmissionSchema)
def supervisor_action(
    submission_id: int,
    action: SupervisorAction,
    db: Session = Depends(get_db)
):
    """Supervisor approves or rejects a submission"""
    db_submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not db_submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    if action.status not in ['approved', 'rejected']:
        raise HTTPException(status_code=400, detail="Invalid status. Must be 'approved' or 'rejected'")
    
    db_submission.status = action.status
    db_submission.supervisor = action.supervisor_id
    db_submission.sup_remarks = action.sup_remarks
    db_submission.sup_action_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    
    db.commit()
    db.refresh(db_submission)
    return db_submission


@router.put("/submissions/{submission_id}/acknowledge", response_model=SubmissionSchema)
def acknowledge_submission(
    submission_id: int,
    ack_data: dict,
    db: Session = Depends(get_db)
):
    """Acknowledge a submission (supervisor, operator, or MC)"""
    db_submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not db_submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    role = ack_data.get('role')  # 'supervisor', 'operator', or 'mc'
    
    # Current IST time
    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    
    if role == 'supervisor':
        db_submission.supervisor_ack_by = True
        db_submission.supervisor_ack_at = ist_now
    elif role == 'operator':
        db_submission.operator_ack_by = True
        db_submission.operator_ack_at = ist_now
    elif role == 'mc':
        db_submission.mc_ack_by = True
        db_submission.mc_ack_at = ist_now
    else:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'supervisor', 'operator', or 'mc'")
    
    db.commit()
    db.refresh(db_submission)
    return db_submission


# =======================
# Submission Details CRUD
# =======================

@router.get("/submissions/{submission_id}/details", response_model=List[SubmissionDetailWithChecklist])
def get_submission_details(submission_id: int, db: Session = Depends(get_db)):
    """Get all details for a specific submission"""
    details = db.query(SubmissionDetail).filter(SubmissionDetail.sub_id == submission_id).all()
    return details


@router.put("/submission-details/{detail_id}", response_model=SubmissionDetailSchema)
def update_submission_detail(
    detail_id: int,
    detail_update: SubmissionDetailUpdate,
    db: Session = Depends(get_db)
):
    """Update a submission detail (for operator to edit when rejected)"""
    db_detail = db.query(SubmissionDetail).filter(SubmissionDetail.id == detail_id).first()
    if not db_detail:
        raise HTTPException(status_code=404, detail="Submission detail not found")
    
    update_data = detail_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_detail, key, value)
    
    db_detail.updated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    db.commit()
    db.refresh(db_detail)
    return db_detail


# =======================
# Submission Details CRUD
# =======================

@router.post("/submission-details", response_model=SubmissionDetailSchema, status_code=status.HTTP_201_CREATED)
def create_submission_detail(detail: SubmissionDetailCreate, db: Session = Depends(get_db)):
    """Create a new submission detail"""
    db_detail = SubmissionDetail(**detail.dict())
    db.add(db_detail)
    db.commit()
    db.refresh(db_detail)
    return db_detail


@router.get("/submission-details", response_model=List[SubmissionDetailWithChecklist])
def get_submission_details(
    sub_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all submission details, optionally filtered by sub_id"""
    query = db.query(SubmissionDetail)
    if sub_id:
        query = query.filter(SubmissionDetail.sub_id == sub_id)
    details = query.all()
    return details


@router.get("/submission-details/{detail_id}", response_model=SubmissionDetailWithChecklist)
def get_submission_detail(detail_id: int, db: Session = Depends(get_db)):
    """Get a specific submission detail by ID"""
    detail = db.query(SubmissionDetail).filter(SubmissionDetail.id == detail_id).first()
    if not detail:
        raise HTTPException(status_code=404, detail="Submission detail not found")
    return detail


@router.delete("/submission-details/{detail_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submission_detail(detail_id: int, db: Session = Depends(get_db)):
    """Delete a submission detail"""
    db_detail = db.query(SubmissionDetail).filter(SubmissionDetail.id == detail_id).first()
    if not db_detail:
        raise HTTPException(status_code=404, detail="Submission detail not found")
    
    db.delete(db_detail)
    db.commit()
    return None


# =======================
# Parameterized Routes (must come last)
# =======================

@router.get("/{checklist_id}", response_model=OperationChecklistSchema)
def get_operation_checklist(checklist_id: int, db: Session = Depends(get_db)):
    """Get a specific operation checklist by ID"""
    checklist = db.query(OperationChecklist).filter(OperationChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(status_code=404, detail="Operation checklist not found")
    return checklist


@router.put("/{checklist_id}", response_model=OperationChecklistSchema)
def update_operation_checklist(
    checklist_id: int,
    checklist_update: OperationChecklistUpdate,
    db: Session = Depends(get_db)
):
    """Update an operation checklist"""
    db_checklist = db.query(OperationChecklist).filter(OperationChecklist.id == checklist_id).first()
    if not db_checklist:
        raise HTTPException(status_code=404, detail="Operation checklist not found")
    
    update_data = checklist_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_checklist, key, value)
    
    db.commit()
    db.refresh(db_checklist)
    return db_checklist


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation_checklist(checklist_id: int, db: Session = Depends(get_db)):
    """Delete an operation checklist"""
    db_checklist = db.query(OperationChecklist).filter(OperationChecklist.id == checklist_id).first()
    if not db_checklist:
        raise HTTPException(status_code=404, detail="Operation checklist not found")
    
    db.delete(db_checklist)
    db.commit()
    return None


@router.put("/submissions/{submission_id}/resubmit", response_model=SubmissionWithDetails)
def resubmit_submission(submission_id: int, resubmission_data: dict, db: Session = Depends(get_db)):
    """Operator resubmits a submission after MC makes required changes"""
    db_submission = db.query(Submission).filter(Submission.id == submission_id).first()
    if not db_submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    # Reset status to pending
    db_submission.status = 'pending'
    db_submission.submitted_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    
    # Update details if provided
    if 'details' in resubmission_data:
        for detail_update in resubmission_data['details']:
            db_detail = db.query(SubmissionDetail).filter(
                SubmissionDetail.id == detail_update['id'],
                SubmissionDetail.sub_id == submission_id
            ).first()
            if db_detail:
                if 'response' in detail_update:
                    db_detail.response = detail_update['response']
                if 'op_remarks' in detail_update:
                    db_detail.op_remarks = detail_update['op_remarks']
                db_detail.updated_at = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    
    db.commit()
    db.refresh(db_submission)
    return db_submission
