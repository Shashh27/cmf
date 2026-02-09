from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
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
    
    # Verify admin exists
    admin = db.query(AccessUser).filter(AccessUser.id == request_data.admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Admin with id {request_data.admin_id} not found"
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
    
    # Force status to be "pending" on creation and don't set updated_at
    create_data = request_data.dict()
    create_data['status'] = 'pending'
    
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
        admin = db.query(AccessUser).filter(AccessUser.id == req.admin_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "admin_id": req.admin_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
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
    admin = db.query(AccessUser).filter(AccessUser.id == request.admin_id).first()
    project = db.query(Order).filter(Order.id == request.project_id).first()
    part = db.query(Part).filter(Part.id == request.part_id).first()
    
    request_dict = {
        "id": request.id,
        "tool_id": request.tool_id,
        "operator_id": request.operator_id,
        "project_id": request.project_id,
        "part_id": request.part_id,
        "quantity": request.quantity,
        "admin_id": request.admin_id,
        "status": request.status,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "tool_name": tool.item_description if tool else None,
        "operator_name": operator.user_name if operator else None,
        "admin_name": admin.user_name if admin else None,
        "project_name": project.sale_order_number if project else None,
        "part_name": part.part_name if part else None
    }
    
    return InventoryRequestWithDetailsSchema(**request_dict)


@router.put("/{request_id}", response_model=InventoryRequestSchema)
def update_inventory_request(
    request_id: int, 
    update_data_schema: InventoryRequestUpdateSchema, 
    db: Session = Depends(get_db)
):
    """Update an inventory request (only for admin approval/rejection)"""
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    update_data = update_data_schema.dict(exclude_unset=True)
    
    # Only allow status updates (admin approval/rejection)
    if 'status' in update_data:
        new_status = update_data['status']
        if new_status not in ['approved', 'rejected']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Status can only be updated to 'approved' or 'rejected'"
            )
        
        # If status is being updated to 'approved', check tool availability and update quantity
        if new_status == 'approved' and db_inventory_request.status != 'approved':
            tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
            if not tool:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Tool with id {db_inventory_request.tool_id} not found"
                )
            
            if tool.quantity < db_inventory_request.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient quantity. Available: {tool.quantity}, Requested: {db_inventory_request.quantity}"
                )
            
            # Reduce tool quantity
            tool.quantity -= db_inventory_request.quantity
            db.commit()
        
        # If status is being updated from 'approved' to something else, restore quantity
        elif new_status != 'approved' and db_inventory_request.status == 'approved':
            tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
            if tool:
                tool.quantity += db_inventory_request.quantity
                db.commit()
        
        # Update the status - this will trigger the updated_at timestamp
        setattr(db_inventory_request, 'status', new_status)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only status field can be updated for inventory requests"
        )
    
    db.commit()
    db.refresh(db_inventory_request)
    return db_inventory_request


@router.post("/{request_id}/approve")
def approve_inventory_request(request_id: int, db: Session = Depends(get_db)):
    """Approve an inventory request (admin action)"""
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    if db_inventory_request.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve request with status '{db_inventory_request.status}'"
        )
    
    # Check tool availability
    tool = db.query(ToolsList).filter(ToolsList.id == db_inventory_request.tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {db_inventory_request.tool_id} not found"
        )
    
    if tool.quantity < db_inventory_request.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient quantity. Available: {tool.quantity}, Requested: {db_inventory_request.quantity}"
        )
    
    # Update status and reduce tool quantity
    db_inventory_request.status = 'approved'
    tool.quantity -= db_inventory_request.quantity
    db.commit()
    db.refresh(db_inventory_request)
    
    return {"message": "Inventory request approved successfully", "request": db_inventory_request}


@router.post("/{request_id}/reject")
def reject_inventory_request(request_id: int, db: Session = Depends(get_db)):
    """Reject an inventory request (admin action)"""
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {request_id} not found"
        )
    
    if db_inventory_request.status != 'pending':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject request with status '{db_inventory_request.status}'"
        )
    
    # Update status (no quantity changes for rejection)
    db_inventory_request.status = 'rejected'
    db.commit()
    db.refresh(db_inventory_request)
    
    return {"message": "Inventory request rejected successfully", "request": db_inventory_request}


@router.delete("/{request_id}")
def delete_inventory_request(request_id: int, db: Session = Depends(get_db)):
    """Delete an inventory request"""
    db_inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    if not db_inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
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
    return {"message": "Inventory request deleted successfully"}


@router.get("/by-operator/{operator_id}", response_model=List[InventoryRequestWithDetailsSchema])
def get_inventory_requests_by_operator(operator_id: int, db: Session = Depends(get_db)):
    """Get inventory requests by operator ID"""
    requests = db.query(InventoryRequest).filter(InventoryRequest.operator_id == operator_id).all()
    
    result = []
    for req in requests:
        # Get related details
        tool = db.query(ToolsList).filter(ToolsList.id == req.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == req.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == req.admin_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "admin_id": req.admin_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
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
        admin = db.query(AccessUser).filter(AccessUser.id == req.admin_id).first()
        project = db.query(Order).filter(Order.id == req.project_id).first()
        part = db.query(Part).filter(Part.id == req.part_id).first()
        
        request_dict = {
            "id": req.id,
            "tool_id": req.tool_id,
            "operator_id": req.operator_id,
            "project_id": req.project_id,
            "part_id": req.part_id,
            "quantity": req.quantity,
            "admin_id": req.admin_id,
            "status": req.status,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        result.append(InventoryRequestWithDetailsSchema(**request_dict))
    
    return result