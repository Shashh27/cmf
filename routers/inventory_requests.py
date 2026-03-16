
from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta, timezone
from DB.database import get_db
from DB.models.inventory import InventoryRequest, ToolsList
from DB.models.access_control import AccessUser
from DB.models.oms import Order, Part
from DB.schemas.inventory import (
    InventoryRequest as InventoryRequestSchema,
    InventoryRequestCreate as InventoryRequestCreateSchema,
    InventoryRequestUpdate as InventoryRequestUpdateSchema,
    InventoryRequestWithDetails as InventoryRequestWithDetailsSchema
)

router = APIRouter(
    prefix="/inventory-requests",
    tags=["Inventory Requests"]
)

IST = timezone(timedelta(hours=5, minutes=30))



# =======================
# Inventory Requests CRUD
# =======================

@router.post("/", response_model=InventoryRequestSchema)
def create_inventory_request(
    request_data: InventoryRequestCreateSchema, 
    db: Session = Depends(get_db)
):
    """Create a new inventory request"""
    # Verify tool exists and has enough quantity
    tool = db.query(ToolsList).filter(ToolsList.id == request_data.tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {request_data.tool_id} not found"
        )
    
    if tool.quantity < request_data.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient quantity. Available: {tool.quantity}, Requested: {request_data.quantity}"
        )
    
    # Verify operator exists
    operator = db.query(AccessUser).filter(AccessUser.id == request_data.operator_id).first()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operator with id {request_data.operator_id} not found"
        )
    
    # Verify project exists
    project = db.query(Order).filter(Order.id == request_data.project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project with id {request_data.project_id} not found"
        )
    
    # Verify part exists
    part = db.query(Part).filter(Part.id == request_data.part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {request_data.part_id} not found"
        )
    
    # Force status to be "pending" and inventory_supervisor_id to be None on creation
    create_data = request_data.dict()
    create_data['status'] = 'pending'
    create_data['inventory_supervisor_id'] = None  # Inventory Supervisor ID will be set during approval
    if 'created_at' not in create_data or not create_data.get('created_at'):
        create_data['created_at'] = datetime.now(IST).replace(tzinfo=None)
    
    db_inventory_request = InventoryRequest(**create_data)
    db.add(db_inventory_request)
    db.commit()
    db.refresh(db_inventory_request)
    return db_inventory_request


@router.get("/", response_model=List[InventoryRequestWithDetailsSchema])
def get_all_inventory_requests(db: Session = Depends(get_db)):
    """Get all inventory requests with details"""
    requests = db.query(InventoryRequest).all()
    
    result = []
    for req in requests:
        # Get related details
        tool = db.query(ToolsList).filter(ToolsList.id == req.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == req.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == req.inventory_supervisor_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "purpose_of_use": req.purpose_of_use,
            "inventory_supervisor_id": req.inventory_supervisor_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "tool_type": tool.type if tool else None,
            "operator_name": operator.user_name if operator else None,
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        result.append(InventoryRequestWithDetailsSchema(**request_dict))
    
    return result


@router.get("/{request_id}", response_model=InventoryRequestWithDetailsSchema)
def get_inventory_request(request_id: int, db: Session = Depends(get_db)):
    """Get a specific inventory request by ID"""
    request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    # Get related details
    tool = db.query(ToolsList).filter(ToolsList.id == request.tool_id).first()
    operator = db.query(AccessUser).filter(AccessUser.id == request.operator_id).first()
    inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == request.inventory_supervisor_id).first()
    project = db.query(Order).filter(Order.id == request.project_id).first()
    part = db.query(Part).filter(Part.id == request.part_id).first()
    
    request_dict = {
        "id": request.id,
        "tool_id": request.tool_id,
        "operator_id": request.operator_id,
        "project_id": request.project_id,
        "part_id": request.part_id,
        "quantity": request.quantity,
        "purpose_of_use": request.purpose_of_use,
        "inventory_supervisor_id": request.inventory_supervisor_id,
        "status": request.status,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "tool_name": tool.item_description if tool else None,
        "tool_type": tool.type if tool else None,
        "operator_name": operator.user_name if operator else None,
        "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
        "project_name": project.sale_order_number if project else None,
        "part_name": part.part_name if part else None
    }
    
    return InventoryRequestWithDetailsSchema(**request_dict)


@router.put("/{request_id}", response_model=InventoryRequestSchema)
def update_inventory_request(
    request_id: int, 
    request_update: InventoryRequestUpdateSchema, 
    db: Session = Depends(get_db)
):
    """Update an inventory request (all columns)"""
    # Verify request exists
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    update_data = request_update.dict(exclude_unset=True)
    
    # Remove inventory_supervisor_id and status from update_data - these should only be updated via status endpoint
    if 'inventory_supervisor_id' in update_data:
        del update_data['inventory_supervisor_id']
    
    if 'status' in update_data:
        del update_data['status']
    
    # Validate foreign keys if they're being updated
    if 'tool_id' in update_data:
        tool = db.query(ToolsList).filter(ToolsList.id == update_data['tool_id']).first()
        if not tool:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tool with id {update_data['tool_id']} not found"
            )
    
    if 'operator_id' in update_data:
        operator = db.query(AccessUser).filter(AccessUser.id == update_data['operator_id']).first()
        if not operator:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Operator with id {update_data['operator_id']} not found"
            )
    
    if 'project_id' in update_data:
        project = db.query(Order).filter(Order.id == update_data['project_id']).first()
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project with id {update_data['project_id']} not found"
            )
    
    if 'part_id' in update_data:
        part = db.query(Part).filter(Part.id == update_data['part_id']).first()
        if not part:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Part with id {update_data['part_id']} not found"
            )
    
    # Validate quantity if it's being updated
    if 'quantity' in update_data:
        if update_data['quantity'] <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Quantity must be greater than 0"
            )
        
        # If request is approved, check tool availability for new quantity
        if db_inventory_request.status == 'approved':
            tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
            quantity_diff = update_data['quantity'] - db_inventory_request.quantity
            
            if quantity_diff > 0:  # Increasing quantity
                if tool.quantity < quantity_diff:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Insufficient quantity for increase. Available: {tool.quantity}, Needed: {quantity_diff}"
                    )
                tool.quantity -= quantity_diff
            elif quantity_diff < 0:  # Decreasing quantity
                tool.quantity += abs(quantity_diff)
            
            db.commit()
    
    # Apply all updates
    for key, value in update_data.items():
        setattr(db_inventory_request, key, value)
    
    db.commit()
    db.refresh(db_inventory_request)
    return db_inventory_request


@router.put("/{request_id}/status")
def update_inventory_request_status(
    request_id: int, 
    inventory_supervisor_id: int,  # This will come from authentication/session
    status: str,    # "approved" or "rejected"
    db: Session = Depends(get_db)
):
    """Update inventory request status (inventory supervisor approval/rejection)"""
    # Validate status
    if status not in ['approved', 'rejected']:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Status must be either 'approved' or 'rejected'"
        )
    
    # Verify request exists
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    # Verify inventory supervisor exists
    inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == inventory_supervisor_id).first()
    if not inventory_supervisor:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Inventory Supervisor with id {inventory_supervisor_id} not found"
        )
    
    tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {db_inventory_request.tool_id} not found"
        )
    
    # Handle inventory quantity based on status change - ONE-WAY LOGIC
    if status == 'approved':
        # Can only approve from pending status
        if db_inventory_request.status != 'pending':
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot approve request that is already {db_inventory_request.status}. Status can only change from pending to approved."
            )
        
        # Check available quantity
        if tool.quantity < db_inventory_request.quantity:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient quantity. Available: {tool.quantity}, Requested: {db_inventory_request.quantity}"
            )
        # Reduce tool quantity
        tool.quantity -= db_inventory_request.quantity
    
    elif status == 'rejected':
        # Can only reject from pending status
        if db_inventory_request.status != 'pending':
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reject request that is already {db_inventory_request.status}. Status can only change from pending to rejected."
            )
        # No change to inventory quantity for rejected requests
    
    # Update the request with inventory_supervisor_id, status, and updated_at
    db_inventory_request.inventory_supervisor_id = inventory_supervisor_id
    db_inventory_request.status = status
    db_inventory_request.updated_at = datetime.now(IST).replace(tzinfo=None)
    
    db.commit()
    db.refresh(db_inventory_request)
    
    action = "approved" if status == 'approved' else "rejected"
    return {"message": f"Inventory request {action} successfully", "request": db_inventory_request}


@router.delete("/{request_id}")
def delete_inventory_request(request_id: int, db: Session = Depends(get_db)):
    """Delete an inventory request"""
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    # If request was approved, restore tool quantity
    if db_inventory_request.status == 'approved':
        tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
        if tool:
            tool.quantity += db_inventory_request.quantity
            db.commit()
    
    db.delete(db_inventory_request)
    db.commit()
    
    return {"message": "Inventory request deleted successfully", "request_id": request_id}


@router.get("/by-operator/{operator_id}", response_model=List[InventoryRequestWithDetailsSchema])
def get_inventory_requests_by_operator(operator_id: int, db: Session = Depends(get_db)):
    requests = db.query(InventoryRequest).filter(InventoryRequest.operator_id == operator_id).all()
    
    result = []
    for req in requests:
        # Get related details
        tool = db.query(ToolsList).filter(ToolsList.id == req.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == req.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == req.inventory_supervisor_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "purpose_of_use": req.purpose_of_use,
            "inventory_supervisor_id": req.inventory_supervisor_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "tool_type": tool.type if tool else None,
            "operator_name": operator.user_name if operator else None,
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        result.append(InventoryRequestWithDetailsSchema(**request_dict))
    
    return result


@router.get("/by-status/{status}", response_model=List[InventoryRequestWithDetailsSchema])
def get_inventory_requests_by_status(status: str, db: Session = Depends(get_db)):
    """Get inventory requests by status"""
    requests = db.query(InventoryRequest).filter(InventoryRequest.status == status).all()
    
    result = []
    for req in requests:
        # Get related details
        tool = db.query(ToolsList).filter(ToolsList.id == req.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == req.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == req.inventory_supervisor_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "purpose_of_use": req.purpose_of_use,
            "inventory_supervisor_id": req.inventory_supervisor_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "tool_type": tool.type if tool else None,
            "operator_name": operator.user_name if operator else None,
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        result.append(InventoryRequestWithDetailsSchema(**request_dict))
    
    return result
