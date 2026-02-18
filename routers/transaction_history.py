from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from DB.database import get_db
from DB.models.inventory import InventoryRequest, InventoryReturnRequest, ToolsList
from DB.models.access_control import AccessUser
from DB.models.oms import Order, Part
from DB.schemas.inventory import (
    TransactionHistoryBase,
    TransactionHistoryResponse,
    InventoryRequestWithDetails as InventoryRequestWithDetailsSchema,
    InventoryReturnRequestWithDetails as InventoryReturnRequestWithDetailsSchema
)
from pydantic import BaseModel
from typing import List

# Schema for complete transaction history response
class CompleteTransactionHistory(BaseModel):
    inventory_request: InventoryRequestWithDetailsSchema
    return_requests: List[InventoryReturnRequestWithDetailsSchema]

class AllTransactionsResponse(BaseModel):
    transactions: List[CompleteTransactionHistory]
    total_requests: int
    total_return_requests: int

router = APIRouter(
    prefix="/transaction-history",
    tags=["Transaction History"]
)


@router.get("/", response_model=TransactionHistoryResponse)
def get_transaction_history(
    request_id: int,
    db: Session = Depends(get_db)
):
    """Get complete transaction history by request_id"""
    
    # Try to find inventory request first
    inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == request_id).first()
    
    # Try to find inventory return request
    inventory_return_request = db.query(InventoryReturnRequest).filter(InventoryReturnRequest.id == request_id).first()
    
    if not inventory_request and not inventory_return_request:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No transaction found with request_id: {request_id}"
        )
    
    result = TransactionHistoryResponse()
    
    # If inventory request found, get its details AND all related return requests
    if inventory_request:
        # Get related details for the inventory request
        tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == inventory_request.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == inventory_request.admin_id).first()
        project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
        part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
        
        inventory_request_details = {
            "id": inventory_request.id,
            "tool_id": inventory_request.tool_id,
            "operator_id": inventory_request.operator_id,
            "project_id": inventory_request.project_id,
            "part_id": inventory_request.part_id,
            "quantity": inventory_request.quantity,
            "purpose_of_use": inventory_request.purpose_of_use,
            "status": inventory_request.status,
            "created_at": inventory_request.created_at,
            "updated_at": inventory_request.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        
        result.inventory_request = InventoryRequestWithDetailsSchema(**inventory_request_details)
        
        # Get ALL return requests associated with this inventory request
        return_requests = db.query(InventoryReturnRequest).filter(
            InventoryReturnRequest.requested_id == inventory_request.id
        ).all()
        
        return_requests_details = []
        
        if return_requests:
            # Process all return requests
            for return_request in return_requests:
                operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
                admin = db.query(AccessUser).filter(AccessUser.id == return_request.admin_id).first()
                
                return_request_details = {
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
                
                return_requests_details.append(InventoryReturnRequestWithDetailsSchema(**return_request_details))
            
            result.return_requests = return_requests_details
    
    # If inventory return request found, get its details AND the original inventory request
    elif inventory_return_request:
        # Get related details for the return request
        operator = db.query(AccessUser).filter(AccessUser.id == inventory_return_request.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == inventory_return_request.admin_id).first()
        
        # Get the original inventory request details
        inventory_request_details = None
        original_inventory_request = None
        
        if inventory_return_request.requested_id:
            original_inventory_request = db.query(InventoryRequest).filter(
                InventoryRequest.id == inventory_return_request.requested_id
            ).first()
            
            if original_inventory_request:
                tool = db.query(ToolsList).filter(ToolsList.id == original_inventory_request.tool_id).first()
                inv_operator = db.query(AccessUser).filter(AccessUser.id == original_inventory_request.operator_id).first()
                inv_admin = db.query(AccessUser).filter(AccessUser.id == original_inventory_request.admin_id).first()
                project = db.query(Order).filter(Order.id == original_inventory_request.project_id).first()
                part = db.query(Part).filter(Part.id == original_inventory_request.part_id).first()
                
                inventory_request_details = {
                    "id": original_inventory_request.id,
                    "tool_id": original_inventory_request.tool_id,
                    "operator_id": original_inventory_request.operator_id,
                    "project_id": original_inventory_request.project_id,
                    "part_id": original_inventory_request.part_id,
                    "quantity": original_inventory_request.quantity,
                    "purpose_of_use": original_inventory_request.purpose_of_use,
                    "status": original_inventory_request.status,
                    "created_at": original_inventory_request.created_at,
                    "updated_at": original_inventory_request.updated_at,
                    "tool_name": tool.item_description if tool else None,
                    "operator_name": inv_operator.user_name if inv_operator else None,
                    "admin_name": inv_admin.user_name if inv_admin else None,
                    "project_name": project.sale_order_number if project else None,
                    "part_name": part.part_name if part else None
                }
        
        return_request_details = {
            "id": inventory_return_request.id,
            "requested_id": inventory_return_request.requested_id,
            "operator_id": inventory_return_request.operator_id,
            "total_requested_qty": inventory_return_request.total_requested_qty,
            "returned_qty": inventory_return_request.returned_qty,
            "remarks": inventory_return_request.remarks,
            "status": inventory_return_request.status,
            "created_at": inventory_return_request.created_at,
            "updated_at": inventory_return_request.updated_at,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "inventory_request_details": inventory_request_details
        }
        
        # Get ALL return requests associated with the original inventory request
        all_related_returns = []
        if original_inventory_request:
            all_related_returns = db.query(InventoryReturnRequest).filter(
                InventoryReturnRequest.requested_id == original_inventory_request.id
            ).all()
        
        return_requests_details = []
        
        if all_related_returns:
            for return_request in all_related_returns:
                operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
                admin = db.query(AccessUser).filter(AccessUser.id == return_request.admin_id).first()
                
                related_return_details = {
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
                
                return_requests_details.append(InventoryReturnRequestWithDetailsSchema(**related_return_details))
        
        result.return_requests = return_requests_details
        
        # Also include the original inventory request if found
        if original_inventory_request:
            result.inventory_request = InventoryRequestWithDetailsSchema(**inventory_request_details)
    
    return result


@router.get("/all", response_model=AllTransactionsResponse)
def get_all_transactions(db: Session = Depends(get_db)):
    """Get all inventory requests with their corresponding return requests"""
    
    # Get all inventory requests
    all_inventory_requests = db.query(InventoryRequest).all()
    
    transactions = []
    total_return_requests = 0
    
    for inventory_request in all_inventory_requests:
        # Get related details for the inventory request
        tool = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == inventory_request.operator_id).first()
        admin = db.query(AccessUser).filter(AccessUser.id == inventory_request.admin_id).first()
        project = db.query(Order).filter(Order.id == inventory_request.project_id).first()
        part = db.query(Part).filter(Part.id == inventory_request.part_id).first()
        
        inventory_request_details = {
            "id": inventory_request.id,
            "tool_id": inventory_request.tool_id,
            "operator_id": inventory_request.operator_id,
            "project_id": inventory_request.project_id,
            "part_id": inventory_request.part_id,
            "quantity": inventory_request.quantity,
            "purpose_of_use": inventory_request.purpose_of_use,
            "status": inventory_request.status,
            "created_at": inventory_request.created_at,
            "updated_at": inventory_request.updated_at,
            "tool_name": tool.item_description if tool else None,
            "operator_name": operator.user_name if operator else None,
            "admin_name": admin.user_name if admin else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        
        # Get ALL return requests associated with this inventory request
        return_requests = db.query(InventoryReturnRequest).filter(
            InventoryReturnRequest.requested_id == inventory_request.id
        ).all()
        
        return_requests_details = []
        
        if return_requests:
            for return_request in return_requests:
                return_operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
                return_admin = db.query(AccessUser).filter(AccessUser.id == return_request.admin_id).first()
                
                return_request_details = {
                    "id": return_request.id,
                    "requested_id": return_request.requested_id,
                    "operator_id": return_request.operator_id,
                    "total_requested_qty": return_request.total_requested_qty,
                    "returned_qty": return_request.returned_qty,
                    "remarks": return_request.remarks,
                    "status": return_request.status,
                    "created_at": return_request.created_at,
                    "updated_at": return_request.updated_at,
                    "operator_name": return_operator.user_name if return_operator else None,
                    "admin_name": return_admin.user_name if return_admin else None,
                    "inventory_request_details": inventory_request_details
                }
                
                return_requests_details.append(InventoryReturnRequestWithDetailsSchema(**return_request_details))
        
        # Create complete transaction for this inventory request
        complete_transaction = CompleteTransactionHistory(
            inventory_request=InventoryRequestWithDetailsSchema(**inventory_request_details),
            return_requests=return_requests_details
        )
        
        transactions.append(complete_transaction)
        total_return_requests += len(return_requests_details)
    
    return AllTransactionsResponse(
        transactions=transactions,
        total_requests=len(all_inventory_requests),
        total_return_requests=total_return_requests
    )
