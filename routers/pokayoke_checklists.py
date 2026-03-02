from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime, timezone, timedelta
import re
from sqlalchemy.orm import Session
from DB.database import get_db
from DB.models.configuration import (
    PokayokeChecklist,
    PokayokeChecklistItem,
    PokayokeMachineAssignment,
    PokayokeCompletedLog,
    PokayokeItemResponse,
    Machine
)
from DB.schemas.configuration import (
    PokayokeChecklist as PokayokeChecklistSchema,
    PokayokeChecklistItem as PokayokeChecklistItemSchema,
    PokayokeMachineAssignment as PokayokeMachineAssignmentSchema,
    PokayokeCompletedLog as PokayokeCompletedLogSchema,
    PokayokeItemResponse as PokayokeItemResponseSchema,
    PokayokeChecklistCreate,
    PokayokeChecklistUpdate,
    PokayokeChecklistItemCreate,
    PokayokeChecklistItemUpdate,
    PokayokeMachineAssignmentCreate,
    PokayokeMachineAssignmentUpdate,
    PokayokeCompletedLogCreate,
    PokayokeCompletedLogUpdate,
    PokayokeItemResponseCreate,
    PokayokeItemResponseUpdate,
    PokayokeChecklistWithItems,
    PokayokeCompletedLogWithResponses
)

router = APIRouter(
    prefix="/pokayoke-checklists",
    tags=["pokayoke-checklists"]
)

# Create a separate router for completed logs to avoid path conflicts
completed_logs_router = APIRouter(
    prefix="/pokayoke-completed-logs",
    tags=["pokayoke-completed-logs"]
)

IST = timezone(timedelta(hours=5, minutes=30))

def validate_expected_value(item_type: str, expected_value: str) -> bool:
    """Validate expected_value based on item_type"""
    if not expected_value:
        return False
    
    if item_type == 'boolean':
        # Allow true/false, yes/no, 1/0 (case insensitive)
        valid_values = ['true', 'false', 'yes', 'no', '1', '0']
        return expected_value.lower() in valid_values
    
    elif item_type == 'numerical':
        # Allow numbers, ranges (e.g., 18-25), comparisons (e.g., >=50, <=100, =75)
        # Check if it's a single number
        if expected_value.replace('.', '').replace('-', '').replace('>', '').replace('<', '').replace('=', '').isdigit():
            return True
        
        # Check if it's a range (e.g., 18-25)
        range_pattern = r'^\d+(\.\d+)?-\d+(\.\d+)?$'
        if re.match(range_pattern, expected_value):
            return True
        
        # Check if it's a comparison (e.g., >=50, <=100, =75)
        comparison_pattern = r'^[><=]+\d+(\.\d+)?$'
        if re.match(comparison_pattern, expected_value):
            return True
        
        return False
    
    elif item_type == 'text':
        # Text can be any string, but not empty
        return len(expected_value.strip()) > 0
    
    return False

# =======================
# POKAYOKE CHECKLISTS CRUD
# =======================

@router.post("/", response_model=PokayokeChecklistSchema, status_code=status.HTTP_201_CREATED)
def create_checklist(checklist: PokayokeChecklistCreate, db: Session = Depends(get_db)):
    """Create a new Pokayoke checklist"""
    checklist_data = checklist.model_dump()
    checklist_data["created_at"] = datetime.now(IST).replace(tzinfo=None)
    db_checklist = PokayokeChecklist(**checklist_data)
    db.add(db_checklist)
    db.commit()
    db.refresh(db_checklist)
    return db_checklist


@router.get("/", response_model=List[PokayokeChecklistSchema])
def get_all_checklists(db: Session = Depends(get_db)):
    """Get all Pokayoke checklists"""
    checklists = db.query(PokayokeChecklist).all()
    return checklists


@router.get("/{checklist_id}", response_model=PokayokeChecklistWithItems)
def get_checklist(checklist_id: int, db: Session = Depends(get_db)):
    """Get a specific Pokayoke checklist with its items and machine assignments"""
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    # Get items ordered by sequence number
    items = db.query(PokayokeChecklistItem).filter(
        PokayokeChecklistItem.checklist_id == checklist_id
    ).order_by(PokayokeChecklistItem.sequence_number).all()
    
    # Get machine assignments
    machine_assignments = db.query(PokayokeMachineAssignment).filter(
        PokayokeMachineAssignment.checklist_id == checklist_id
    ).all()
    
    return PokayokeChecklistWithItems(
        id=checklist.id,
        name=checklist.name,
        description=checklist.description,
        created_at=checklist.created_at,
        items=items,
        machine_assignments=machine_assignments
    )


@router.put("/{checklist_id}", response_model=PokayokeChecklistSchema)
def update_checklist(checklist_id: int, checklist_update: PokayokeChecklistUpdate, db: Session = Depends(get_db)):
    """Update a Pokayoke checklist"""
    db_checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not db_checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    update_data = checklist_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_checklist, field, value)
    
    db.commit()
    db.refresh(db_checklist)
    return db_checklist


@router.delete("/{checklist_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist(checklist_id: int, db: Session = Depends(get_db)):
    """Delete a Pokayoke checklist (cascade deletes items and assignments)"""
    db_checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not db_checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    db.delete(db_checklist)
    db.commit()
    return None


# =======================
# POKAYOKE CHECKLIST ITEMS CRUD
# =======================

@router.post("/{checklist_id}/items", response_model=PokayokeChecklistItemSchema, status_code=status.HTTP_201_CREATED)
def create_checklist_item(checklist_id: int, item: PokayokeChecklistItemCreate, db: Session = Depends(get_db)):
    """Add an item to a Pokayoke checklist"""
    # Verify checklist exists
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    # Validate item_type
    if item.item_type not in ['boolean', 'numerical', 'text']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="item_type must be 'boolean', 'numerical', or 'text'"
        )
    
    # Validate expected_value based on item_type
    if not validate_expected_value(item.item_type, item.expected_value):
        if item.item_type == 'boolean':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="For boolean type, expected_value must be: true, false, yes, no, 1, or 0"
            )
        elif item.item_type == 'numerical':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="For numerical type, expected_value must be: a number, range (e.g., 18-25), or comparison (e.g., >=50, <=100, =75)"
            )
        elif item.item_type == 'text':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="For text type, expected_value must be a non-empty text"
            )
    
    # Calculate next sequence number
    last_item = db.query(PokayokeChecklistItem).filter(
        PokayokeChecklistItem.checklist_id == checklist_id
    ).order_by(PokayokeChecklistItem.sequence_number.desc()).first()
    
    next_sequence = (last_item.sequence_number + 1) if last_item else 1
    
    # Create item with auto-generated sequence number and checklist_id from URL
    item_data = item.model_dump()
    item_data['checklist_id'] = checklist_id
    item_data['sequence_number'] = next_sequence
    item_data['created_at'] = datetime.now(IST).replace(tzinfo=None)
    
    db_item = PokayokeChecklistItem(**item_data)
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@router.get("/{checklist_id}/items", response_model=List[PokayokeChecklistItemSchema])
def get_checklist_items(checklist_id: int, db: Session = Depends(get_db)):
    """Get all items for a specific Pokayoke checklist"""
    # Verify checklist exists
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    items = db.query(PokayokeChecklistItem).filter(
        PokayokeChecklistItem.checklist_id == checklist_id
    ).order_by(PokayokeChecklistItem.sequence_number).all()
    return items


@router.put("/items/{item_id}", response_model=PokayokeChecklistItemSchema)
def update_checklist_item(item_id: int, item_update: PokayokeChecklistItemUpdate, db: Session = Depends(get_db)):
    """Update a Pokayoke checklist item"""
    db_item = db.query(PokayokeChecklistItem).filter(PokayokeChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist item with id {item_id} not found"
        )
    
    # Validate item_type if provided
    if item_update.item_type and item_update.item_type not in ['boolean', 'numerical', 'text']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="item_type must be 'boolean', 'numerical', or 'text'"
        )
    
    # Validate expected_value if provided and item_type is provided or existing
    item_type = item_update.item_type or db_item.item_type
    expected_value = item_update.expected_value or db_item.expected_value
    
    if item_update.expected_value is not None and item_type:
        if not validate_expected_value(item_type, item_update.expected_value):
            if item_type == 'boolean':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="For boolean type, expected_value must be: true, false, yes, no, 1, or 0"
                )
            elif item_type == 'numerical':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="For numerical type, expected_value must be: a number, range (e.g., 18-25), or comparison (e.g., >=50, <=100, =75)"
                )
            elif item_type == 'text':
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="For text type, expected_value must be a non-empty text"
                )
    
    update_data = item_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_item, field, value)
    
    db.commit()
    db.refresh(db_item)
    return db_item


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(item_id: int, db: Session = Depends(get_db)):
    """Delete a Pokayoke checklist item"""
    db_item = db.query(PokayokeChecklistItem).filter(PokayokeChecklistItem.id == item_id).first()
    if not db_item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist item with id {item_id} not found"
        )
    
    db.delete(db_item)
    db.commit()
    return None


# =======================
# POKAYOKE MACHINE ASSIGNMENTS CRUD
# =======================

@router.post("/{checklist_id}/assignments", response_model=PokayokeMachineAssignmentSchema, status_code=status.HTTP_201_CREATED)
def create_machine_assignment(checklist_id: int, assignment: PokayokeMachineAssignmentCreate, db: Session = Depends(get_db)):
    """Assign a Pokayoke checklist to a machine"""
    # Verify checklist exists
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    # Verify machine exists
    machine = db.query(Machine).filter(Machine.id == assignment.machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {assignment.machine_id} not found"
        )
    
    # Check if assignment already exists
    existing_assignment = db.query(PokayokeMachineAssignment).filter(
        PokayokeMachineAssignment.checklist_id == checklist_id,
        PokayokeMachineAssignment.machine_id == assignment.machine_id
    ).first()
    
    if existing_assignment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This checklist is already assigned to this machine"
        )
    
    # Create assignment with checklist_id from URL
    assignment_data = assignment.model_dump()
    assignment_data['checklist_id'] = checklist_id
    assignment_data['assigned_at'] = datetime.now(IST).replace(tzinfo=None)
    
    db_assignment = PokayokeMachineAssignment(**assignment_data)
    db.add(db_assignment)
    db.commit()
    db.refresh(db_assignment)
    return db_assignment


@router.get("/{checklist_id}/assignments", response_model=List[PokayokeMachineAssignmentSchema])
def get_machine_assignments(checklist_id: int, db: Session = Depends(get_db)):
    """Get all machine assignments for a specific Pokayoke checklist"""
    # Verify checklist exists
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {checklist_id} not found"
        )
    
    assignments = db.query(PokayokeMachineAssignment).filter(
        PokayokeMachineAssignment.checklist_id == checklist_id
    ).all()
    return assignments


@router.get("/machines/{machine_id}/assignments", response_model=List[PokayokeMachineAssignmentSchema])
def get_machine_checklists(machine_id: int, db: Session = Depends(get_db)):
    """Get all Pokayoke checklists assigned to a specific machine"""
    # Verify machine exists
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    assignments = db.query(PokayokeMachineAssignment).filter(
        PokayokeMachineAssignment.machine_id == machine_id
    ).all()
    return assignments


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_machine_assignment(assignment_id: int, db: Session = Depends(get_db)):
    """Remove a Pokayoke checklist assignment from a machine"""
    db_assignment = db.query(PokayokeMachineAssignment).filter(PokayokeMachineAssignment.id == assignment_id).first()
    if not db_assignment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assignment with id {assignment_id} not found"
        )
    
    db.delete(db_assignment)
    db.commit()
    return None


# =======================
# POKAYOKE COMPLETED LOGS CRUD
# =======================

@completed_logs_router.post("/", response_model=PokayokeCompletedLogSchema, status_code=status.HTTP_201_CREATED)
def create_completed_log(log: PokayokeCompletedLogCreate, db: Session = Depends(get_db)):
    """Create a new Pokayoke completed log"""
    # Verify checklist exists
    checklist = db.query(PokayokeChecklist).filter(PokayokeChecklist.id == log.checklist_id).first()
    if not checklist:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist with id {log.checklist_id} not found"
        )
    
    # Verify machine exists
    machine = db.query(Machine).filter(Machine.id == log.machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {log.machine_id} not found"
        )
    
    # Set completed_at to current IST time if not provided
    log_data = log.model_dump()
    if not log_data.get('completed_at'):
        log_data['completed_at'] = datetime.now(IST).replace(tzinfo=None)
    
    db_log = PokayokeCompletedLog(**log_data)
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log


@completed_logs_router.get("/", response_model=List[PokayokeCompletedLogSchema])
def get_all_completed_logs(db: Session = Depends(get_db)):
    """Get all Pokayoke completed logs"""
    logs = db.query(PokayokeCompletedLog).all()
    return logs


@completed_logs_router.get("/{log_id}", response_model=PokayokeCompletedLogWithResponses)
def get_completed_log(log_id: int, db: Session = Depends(get_db)):
    """Get a specific Pokayoke completed log with item responses"""
    log = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == log_id).first()
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Completed log with id {log_id} not found"
        )
    
    # Get item responses
    responses = db.query(PokayokeItemResponse).filter(
        PokayokeItemResponse.completed_log_id == log_id
    ).all()
    
    return PokayokeCompletedLogWithResponses(
        id=log.id,
        checklist_id=log.checklist_id,
        machine_id=log.machine_id,
        operator_id=log.operator_id,
        production_order_id=log.production_order_id,
        part_id=log.part_id,
        completed_at=log.completed_at,
        all_items_passed=log.all_items_passed,
        comments=log.comments,
        read=log.read,
        item_responses=responses
    )


@completed_logs_router.get("/machines/{machine_id}/logs", response_model=List[PokayokeCompletedLogSchema])
def get_machine_completed_logs(machine_id: int, db: Session = Depends(get_db)):
    """Get all completed logs for a specific machine"""
    # Verify machine exists
    machine = db.query(Machine).filter(Machine.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    logs = db.query(PokayokeCompletedLog).filter(
        PokayokeCompletedLog.machine_id == machine_id
    ).order_by(PokayokeCompletedLog.completed_at.desc()).all()
    return logs


@completed_logs_router.put("/{log_id}", response_model=PokayokeCompletedLogSchema)
def update_completed_log(log_id: int, log_update: PokayokeCompletedLogUpdate, db: Session = Depends(get_db)):
    """Update a Pokayoke completed log"""
    db_log = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Completed log with id {log_id} not found"
        )
    
    update_data = log_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_log, field, value)
    
    db.commit()
    db.refresh(db_log)
    return db_log


@completed_logs_router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_completed_log(log_id: int, db: Session = Depends(get_db)):
    """Delete a Pokayoke completed log"""
    db_log = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == log_id).first()
    if not db_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Completed log with id {log_id} not found"
        )
    
    db.delete(db_log)
    db.commit()
    return None


# =======================
# POKAYOKE ITEM RESPONSES CRUD
# =======================

@completed_logs_router.post("/item-responses", response_model=PokayokeItemResponseSchema, status_code=status.HTTP_201_CREATED)
def create_item_response(response: PokayokeItemResponseCreate, db: Session = Depends(get_db)):
    """Create a new Pokayoke item response"""
    # Verify completed log exists
    completed_log = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == response.completed_log_id).first()
    if not completed_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Completed log with id {response.completed_log_id} not found"
        )
    
    # Verify item exists
    item = db.query(PokayokeChecklistItem).filter(PokayokeChecklistItem.id == response.item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Checklist item with id {response.item_id} not found"
        )
    
    # Set timestamp to current IST time if not provided
    response_data = response.model_dump()
    if not response_data.get('timestamp'):
        response_data['timestamp'] = datetime.now(IST).replace(tzinfo=None)
    
    db_response = PokayokeItemResponse(**response_data)
    db.add(db_response)
    db.commit()
    db.refresh(db_response)
    return db_response


@completed_logs_router.get("/{log_id}/item-responses", response_model=List[PokayokeItemResponseSchema])
def get_item_responses_for_log(log_id: int, db: Session = Depends(get_db)):
    """Get all item responses for a specific completed log"""
    # Verify completed log exists
    completed_log = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == log_id).first()
    if not completed_log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Completed log with id {log_id} not found"
        )
    
    responses = db.query(PokayokeItemResponse).filter(
        PokayokeItemResponse.completed_log_id == log_id
    ).all()
    return responses


@completed_logs_router.get("/item-responses/{response_id}", response_model=PokayokeItemResponseSchema)
def get_item_response(response_id: int, db: Session = Depends(get_db)):
    """Get a specific Pokayoke item response"""
    response = db.query(PokayokeItemResponse).filter(PokayokeItemResponse.id == response_id).first()
    if not response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item response with id {response_id} not found"
        )
    return response


@completed_logs_router.put("/item-responses/{response_id}", response_model=PokayokeItemResponseSchema)
def update_item_response(response_id: int, response_update: PokayokeItemResponseUpdate, db: Session = Depends(get_db)):
    """Update a Pokayoke item response"""
    db_response = db.query(PokayokeItemResponse).filter(PokayokeItemResponse.id == response_id).first()
    if not db_response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item response with id {response_id} not found"
        )
    
    update_data = response_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_response, field, value)
    
    db.commit()
    db.refresh(db_response)
    return db_response


@completed_logs_router.delete("/item-responses/{response_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item_response(response_id: int, db: Session = Depends(get_db)):
    """Delete a Pokayoke item response"""
    db_response = db.query(PokayokeItemResponse).filter(PokayokeItemResponse.id == response_id).first()
    if not db_response:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Item response with id {response_id} not found"
        )
    
    db.delete(db_response)
    db.commit()
    return None


# Export both routers
__all__ = ["router", "completed_logs_router"]
