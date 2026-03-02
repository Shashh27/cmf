from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta, timezone
from DB.database import get_db
from DB.models.inventory import InventoryReturnRequest, InventoryRequest, ToolIssue
from DB.models.access_control import AccessUser
from DB.schemas.inventory import (
    InventoryReturnRequest as InventoryReturnRequestSchema,
    InventoryReturnRequestCreate as InventoryReturnRequestCreateSchema,
    InventoryReturnRequestUpdate as InventoryReturnRequestUpdateSchema,
    InventoryReturnRequestWithDetails as InventoryReturnRequestWithDetailsSchema
)

router = APIRouter(
    prefix="/inventory-return-requests",
    tags=["Inventory Return Requests"]
)

IST = timezone(timedelta(hours=5, minutes=30))



# =======================
# Inventory Return Requests CRUD
# =======================

@router.post("/", response_model=InventoryReturnRequestSchema)
def create_inventory_return_request(
    return_request: InventoryReturnRequestCreateSchema, 
    db: Session = Depends(get_db)
):
    """Create a new inventory return request"""
    # Verify inventory request exists
    inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == return_request.requested_id).first()
    if not inventory_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory request with id {return_request.requested_id} not found"
        )
    
    # Verify inventory request is approved (can only return approved items)
    if inventory_request.status != 'approved':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only create return request for approved inventory requests"
        )
    
    # Verify operator exists
    operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
    if not operator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operator with id {return_request.operator_id} not found"
        )
    
    # Auto-populate total_requested_qty from the original inventory request
    total_requested_qty = inventory_request.quantity
    
    # Get all existing return requests for this inventory request
    existing_returns = db.query(InventoryReturnRequest).filter(
        InventoryReturnRequest.requested_id == return_request.requested_id
    ).all()
    
    # Calculate total already returned and total marked as issue (pending or approved)
    total_returned_so_far = sum(r.returned_qty for r in existing_returns)
    total_issues = db.query(ToolIssue).filter(
        ToolIssue.request_id == return_request.requested_id,
        ToolIssue.status.in_(["pending", "approved"])
    ).all()
    total_issued_as_issue = sum(t.tool_issue_qty for t in total_issues)
    remaining_qty = total_requested_qty - total_returned_so_far - total_issued_as_issue
    
    # Validate the new return quantity
    if return_request.returned_qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Returned quantity must be greater than 0"
        )
    
    if return_request.returned_qty > remaining_qty:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot return {return_request.returned_qty} items. Only {remaining_qty} items remaining to be returned"
        )
    
    # Validate status - allow "pending" or "collected" for initial creation
    if return_request.status not in ['pending', 'collected']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be either 'pending' or 'collected' for initial return request"
        )
    
    # Create the return request
    from datetime import datetime
    db_return_request = InventoryReturnRequest(
        requested_id=return_request.requested_id,
        operator_id=return_request.operator_id,
        total_requested_qty=total_requested_qty,  # Auto-populated from inventory request
        returned_qty=return_request.returned_qty,  # This is just for this specific return
        remarks=return_request.remarks,  # Optional remarks field
        status=return_request.status,  # Allow pending or collected initially
        admin_id=None,  # admin_id will be set when status is updated to collected
        created_at=datetime.now(IST).replace(tzinfo=None),
        updated_at=None
    )
    
    db.add(db_return_request)
    db.commit()
    db.refresh(db_return_request)
    
    return db_return_request

@router.get("/", response_model=List[InventoryReturnRequestWithDetailsSchema])
def get_all_inventory_return_requests(db: Session = Depends(get_db)):
    """Get all inventory return requests with details"""
    return_requests = db.query(InventoryReturnRequest).all()
    
    result = []
    for ret_req in return_requests:
        # Get related details
        inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == ret_req.requested_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == ret_req.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == ret_req.admin_id).first()
        
        # Get inventory request details
        inventory_request_details = None
        if inventory_request:
            from DB.models.inventory import ToolsList
            from DB.models.oms import Order, Part
            from DB.models.access_control import AccessUser as AdminUser
            
            tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
            inv_operator = db.query(AdminUser).filter(AdminUser.id == inventory_request.operator_id).first()
            inventory_admin = db.query(AdminUser).filter(AdminUser.id == inventory_request.admin_id).first()
            project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
            part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
            
            inventory_request_details = {
                "id": inventory_request.id,
                "tool_id": inventory_request.tool_id,
                "operator_id": inventory_request.operator_id,
                "project_id": inventory_request.project_id,
                "part_id": inventory_request.part_id,
                "quantity": inventory_request.quantity,
                "admin_id": inventory_request.admin_id,
                "status": inventory_request.status,
                "created_at": inventory_request.created_at,
                "updated_at": inventory_request.updated_at,
                "tool_name": tool.item_description if tool else None,
                "operator_name": inv_operator.user_name if inv_operator else None,
                "admin_name": admin.user_name if admin else None,
                "project_name": project.sale_order_number if project else None,
                "part_name": part.part_name if part else None
            }
        
        request_dict = {
            "id": ret_req.id,
            "requested_id": ret_req.requested_id,
            "operator_id": ret_req.operator_id,
            "total_requested_qty": ret_req.total_requested_qty,
            "returned_qty": ret_req.returned_qty,
            "remarks": ret_req.remarks,
            "status": ret_req.status,
            "created_at": ret_req.created_at,
            "updated_at": ret_req.updated_at,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "inventory_request_details": inventory_request_details
        }
        result.append(InventoryReturnRequestWithDetailsSchema(**request_dict))
    
    return result


@router.get("/{return_request_id}", response_model=InventoryReturnRequestWithDetailsSchema)
def get_inventory_return_request(return_request_id: int, db: Session = Depends(get_db)):
    """Get a specific inventory return request by ID"""
    return_request = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.id == return_request_id).first()
    if not return_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory return request with id {return_request_id} not found"
        )
    
    # Get related details
    inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == return_request.requested_id).first()
    operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
    admin = db.query(AccessUser).filter(AccessUser.id == return_request.admin_id).first()
    
    # Get inventory request details
    inventory_request_details = None
    if inventory_request:
        from DB.models.inventory import ToolsList
        from DB.models.oms import Order, Part
        from DB.models.access_control import AccessUser as AdminUser
        
        tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
        inv_operator = db.query(AdminUser).filter(AdminUser.id == inventory_request.operator_id).first()
        inventory_admin = db.query(AdminUser).filter(AdminUser.id == inventory_request.admin_id).first()
        project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
        part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
        
        inventory_request_details = {
            "id": inventory_request.id,
            "tool_id": inventory_request.tool_id,
            "operator_id": inventory_request.operator_id,
            "project_id": inventory_request.project_id,
            "part_id": inventory_request.part_id,
            "quantity": inventory_request.quantity,
            "admin_id": inventory_request.admin_id,
            "status": inventory_request.status,
            "created_at": inventory_request.created_at,
            "updated_at": inventory_request.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": inv_operator.user_name if inv_operator else None,
            "admin_name": admin.user_name if admin else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
    
    request_dict = {
        "id": return_request.id,
        "requested_id": return_request.requested_id,
        "operator_id": return_request.operator_id,
        "total_requested_qty": return_request.total_requested_qty,
        "returned_qty": return_request.returned_qty,
        "remarks": return_request.remarks,
        "status": return_request.status,
        "created_at": return_request.created_at,
        "updated_at": return_request.updated_at,
        "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
        "inventory_request_details": inventory_request_details
    }
    
    return InventoryReturnRequestWithDetailsSchema(**request_dict)


@router.put("/{return_request_id}", response_model=InventoryReturnRequestSchema)
def update_inventory_return_request(
    return_request_id: int, 
    return_request: InventoryReturnRequestUpdateSchema, 
    db: Session = Depends(get_db)
):
    """Update an inventory return request"""
    db_return_request = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.id == return_request_id).first()
    if not db_return_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory return request with id {return_request_id} not found"
        )
    
    update_data = return_request.dict(exclude_unset=True)
    
    # If status is being updated to 'collected', restore tool quantity
    if 'status' in update_data and update_data['status'] == 'collected':
        if db_return_request.status != 'collected':  # Only process if it wasn't already collected
            # Get the original inventory request to find the tool
            inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == db_return_request.requested_id).first()
            if inventory_request:
                from DB.models.inventory import ToolsList
                tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
                if tool:
                    # Restore the returned quantity to the tool
                    tool.quantity += db_return_request.returned_qty
                    db.commit()
    
    # If status is being changed from 'collected' to 'pending', subtract the returned quantity
    elif 'status' in update_data and update_data['status'] == 'pending' and db_return_request.status == 'collected':
        inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == db_return_request.requested_id).first()
        if inventory_request:
            from DB.models.inventory import ToolsList
            tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
            if tool and tool.quantity >= db_return_request.returned_qty:
                tool.quantity -= db_return_request.returned_qty
                db.commit()
    
    # Validate returned_qty doesn't exceed total_requested_qty
    if 'returned_qty' in update_data:
        if update_data['returned_qty'] > db_return_request.total_requested_qty:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Returned quantity cannot exceed total requested quantity. Max: {db_return_request.total_requested_qty}"
            )
    
    for key, value in update_data.items():
        setattr(db_return_request, key, value)
    
    db.commit()
    db.refresh(db_return_request)
    return db_return_request


@router.put("/{return_request_id}/status")
def update_inventory_return_request_status(
    return_request_id: int,
    admin_id: int,  # This will come from authentication/session
    status: str,    # "pending" or "collected"
    table_id: int = None,  # Additional parameter to track table ID
    db: Session = Depends(get_db)
):
    """Update inventory return request status (admin action)"""
    # Validate status
    if status not in ['pending', 'collected']:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be either 'pending' or 'collected'"
        )
    
    # Verify return request exists
    db_return_request = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.id == return_request_id).first()
    if not db_return_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory return request with id {return_request_id} not found"
        )
    
    # Verify request can be updated (pending or collected)
    # Allow toggling between pending and collected
    if db_return_request.status not in ['pending', 'collected'] and db_return_request.status != status:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot {status} return request with status '{db_return_request.status}'"
        )
    
    # Verify admin exists
    admin = db.query(AccessUser).filter(AccessUser.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Admin with id {admin_id} not found"
        )
    
    # Get the original inventory request to find the tool
    inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == db_return_request.requested_id).first()
    if inventory_request:
        from DB.models.inventory import ToolsList
        tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
        if tool:
            
            # Handle inventory quantity based on status change - ONE-WAY LOGIC
            if status == 'collected':
                # Can only mark as collected from pending status
                if db_return_request.status != 'pending':
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot mark return request as collected that is already {db_return_request.status}. Status can only change from pending to collected."
                    )
                # Restore tool quantity when collected
                print(f"DEBUG: Adding {db_return_request.returned_qty} to tool quantity for Return Request {db_return_request.id}")
                tool.quantity += db_return_request.returned_qty
                print(f"DEBUG: New tool quantity after adding: {tool.quantity}")
            
            elif status == 'pending':
                # Cannot change back to pending once collected
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change collected return request back to pending. Status change is one-way only: pending → collected."
                )
            
            db.commit()
            print(f"DEBUG: Final tool quantity after commit: {tool.quantity}")
    
    # Update the return request with admin_id, status, and updated_at
    if status == 'collected':
        db_return_request.admin_id = admin_id
    db_return_request.status = status
    db_return_request.updated_at = datetime.now(IST).replace(tzinfo=None)
    
    db.commit()
    db.refresh(db_return_request)
    
    # Get admin name for response
    admin_name = None
    if admin_id:
        admin_user = db.query(AccessUser).filter(AccessUser.id == admin_id).first()
        admin_name = admin_user.user_name if admin_user else None
    
    action = "collected" if status == 'collected' else "marked as pending"
    return {
        "message": f"Inventory return request {action} successfully", 
        "request": db_return_request,
        "admin_name": admin_name
    }


@router.delete("/{return_request_id}")
def delete_inventory_return_request(return_request_id: int, db: Session = Depends(get_db)):
    """Delete an inventory return request"""
    db_return_request = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.id == return_request_id).first()
    if not db_return_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inventory return request with id {return_request_id} not found"
        )
    
    # If return request was collected, subtract the returned quantity from tool
    if db_return_request.status == 'collected':
        inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == db_return_request.requested_id).first()
        if inventory_request:
            from DB.models.inventory import ToolsList
            tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
            if tool and tool.quantity >= db_return_request.returned_qty:
                tool.quantity -= db_return_request.returned_qty
                db.commit()
    
    db.delete(db_return_request)
    db.commit()
    return {"message": "Inventory return request deleted successfully"}


@router.get("/by-operator/{operator_id}", response_model=List[InventoryReturnRequestWithDetailsSchema])
def get_inventory_return_requests_by_operator(operator_id: int, db: Session = Depends(get_db)):
    """Get inventory return requests by operator ID"""
    return_requests = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.operator_id == operator_id).all()
    
    result = []
    for ret_req in return_requests:
        # Get related details
        inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == ret_req.requested_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == ret_req.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == ret_req.admin_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == ret_req.admin_id).first()
        
        # Get inventory request details
        inventory_request_details = None
        if inventory_request:
            from DB.models.inventory import ToolsList
            from DB.models.oms import Order, Part
            from DB.models.access_control import AccessUser as AdminUser
            
            tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
            inv_operator = db.query(AdminUser).filter(AdminUser.id == inventory_request.operator_id).first()
            admin = db.query(AdminUser).filter(AdminUser.id == inventory_request.admin_id).first()
            project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
            part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
            
            inventory_request_details = {
                "id": inventory_request.id,
                "tool_id": inventory_request.tool_id,
                "operator_id": inventory_request.operator_id,
                "project_id": inventory_request.project_id,
                "part_id": inventory_request.part_id,
                "quantity": inventory_request.quantity,
                "admin_id": inventory_request.admin_id,
                "status": inventory_request.status,
                "created_at": inventory_request.created_at,
                "updated_at": inventory_request.updated_at,
                "tool_name": tool.item_description if tool else None,
                "operator_name": inv_operator.user_name if inv_operator else None,
                "admin_name": admin.user_name if admin else None,
                "project_name": project.sale_order_number if project else None,
                "part_name": part.part_name if part else None
            }
        
        request_dict = {
            "id": ret_req.id,
            "requested_id": ret_req.requested_id,
            "operator_id": ret_req.operator_id,
            "total_requested_qty": ret_req.total_requested_qty,
            "returned_qty": ret_req.returned_qty,
            "remarks": ret_req.remarks,
            "status": ret_req.status,
            "created_at": ret_req.created_at,
            "updated_at": ret_req.updated_at,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "inventory_request_details": inventory_request_details
        }
        result.append(InventoryReturnRequestWithDetailsSchema(**request_dict))
    
    return result


@router.get("/by-status/{status}", response_model=List[InventoryReturnRequestWithDetailsSchema])
def get_inventory_return_requests_by_status(status: str, db: Session = Depends(get_db)):
    """Get inventory return requests by status"""
    return_requests = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.status == status).all()
    
    result = []
    for ret_req in return_requests:
        # Get related details
        inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == ret_req.requested_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == ret_req.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == ret_req.admin_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == ret_req.admin_id).first()
        
        # Get inventory request details
        inventory_request_details = None
        if inventory_request:
            from DB.models.inventory import ToolsList
            from DB.models.oms import Order, Part
            from DB.models.access_control import AccessUser as AdminUser
            
            tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
            inv_operator = db.query(AdminUser).filter(AdminUser.id == inventory_request.operator_id).first()
            admin = db.query(AdminUser).filter(AdminUser.id == inventory_request.admin_id).first()
            project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
            part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
            
            inventory_request_details = {
                "id": inventory_request.id,
                "tool_id": inventory_request.tool_id,
                "operator_id": inventory_request.operator_id,
                "project_id": inventory_request.project_id,
                "part_id": inventory_request.part_id,
                "quantity": inventory_request.quantity,
                "admin_id": inventory_request.admin_id,
                "status": inventory_request.status,
                "created_at": inventory_request.created_at,
                "updated_at": inventory_request.updated_at,
                "tool_name": tool.item_description if tool else None,
                "operator_name": inv_operator.user_name if inv_operator else None,
                "admin_name": admin.user_name if admin else None,
                "project_name": project.sale_order_number if project else None,
                "part_name": part.part_name if part else None
            }
        
        request_dict = {
            "id": ret_req.id,
            "requested_id": ret_req.requested_id,
            "operator_id": ret_req.operator_id,
            "total_requested_qty": ret_req.total_requested_qty,
            "returned_qty": ret_req.returned_qty,
            "remarks": ret_req.remarks,
            "status": ret_req.status,
            "created_at": ret_req.created_at,
            "updated_at": ret_req.updated_at,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "inventory_request_details": inventory_request_details
        }
        result.append(InventoryReturnRequestWithDetailsSchema(**request_dict))
    
    return result
