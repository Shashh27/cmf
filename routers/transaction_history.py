from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from DB.database import get_db
from DB.models.inventory import InventoryRequest, InventoryReturnRequest, ToolsList, ToolIssue
from DB.models.access_control import AccessUser
from DB.models.oms import Order, Part
from DB.schemas.inventory import (
    TransactionHistoryBase,
    TransactionHistoryResponse,
    InventoryRequestWithDetails as InventoryRequestWithDetailsSchema,
    InventoryReturnRequestWithDetails as InventoryReturnRequestWithDetailsSchema,
    ToolIssueWithDetails as ToolIssueWithDetailsSchema
)
from pydantic import BaseModel
from typing import List

# Schema for complete transaction history response
class CompleteTransactionHistory(BaseModel):
    inventory_request: InventoryRequestWithDetailsSchema
    return_requests: List[InventoryReturnRequestWithDetailsSchema]

class ToolQuantities(BaseModel):
    total_qty: int
    available_qty: int
    in_use_qty: int
    issues_qty: int
    requested_qty: int
    returned_qty: int

class ReturnInfo(BaseModel):
    submitted_date: str | None
    collected_date: str | None
    qty: int
    status: str
    remarks: str | None
    inventory_supervisor_name: str | None

class IssueInfo(BaseModel):
    date: str | None
    qty: int
    approved_by: str | None
    remarks: str | None

class GroupedRequest(BaseModel):
    request_id: int
    project_name: str | None
    part_name: str | None
    operator_name: str | None
    requested_qty: int
    requested_date: str | None
    approved_date: str | None
    status: str
    returns: List[ReturnInfo]
    issues: List[IssueInfo]
    total_returned_qty: int
    total_issue_qty: int
    in_use_qty: int

class AllTransactionsResponse(BaseModel):
    transactions: List[CompleteTransactionHistory]
    total_requests: int
    total_return_requests: int
    tool_issues_approved: List[ToolIssueWithDetailsSchema]
    tool_issues_pending: List[ToolIssueWithDetailsSchema]
    quantities: ToolQuantities
    grouped_requests: List[GroupedRequest] = []

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
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == inventory_request.inventory_supervisor_id).first()
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
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
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
                inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == return_request.inventory_supervisor_id).first()
                
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
                    "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
                    "inventory_request_details": inventory_request_details
                }
                
                return_requests_details.append(InventoryReturnRequestWithDetailsSchema(**return_request_details))
            
            result.return_requests = return_requests_details
    
    # If inventory return request found, get its details AND the original inventory request
    elif inventory_return_request:
        # Get related details for the return request
        operator = db.query(AccessUser).filter(AccessUser.id == inventory_return_request.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == inventory_return_request.inventory_supervisor_id).first()
        
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
                inv_req_supervisor = db.query(AccessUser).filter(AccessUser.id == original_inventory_request.inventory_supervisor_id).first()
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
                    "inventory_supervisor_name": inv_req_supervisor.user_name if inv_req_supervisor else None,
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
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
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
                inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == return_request.inventory_supervisor_id).first()
                
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
                    "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
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
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == inventory_request.inventory_supervisor_id).first()
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
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
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
                return_inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == return_request.inventory_supervisor_id).first()
                
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
                    "inventory_supervisor_name": return_inventory_supervisor.user_name if return_inventory_supervisor else None,
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
    
    # Fetch all tool issues
    all_tool_issues = db.query(ToolIssue).all()
    
    tool_issues_approved = []
    tool_issues_pending = []
    # Aggregate quantities across all tools/requests
    total_qty = 0
    available_qty = 0
    total_requested_approved_qty = 0
    total_returned_qty = 0
    issues_qty = 0
    
    # Compute total and available across the entire tools list
    all_tools = db.query(ToolsList).all()
    for t in all_tools:
        total_qty += (t.total_quantity or t.quantity or 0)
        available_qty += (t.quantity or 0)
    
    # Sum approved requested quantities across all inventory requests
    for req in all_inventory_requests:
        if (req.status or '').lower() == 'approved':
            total_requested_approved_qty += (req.quantity or 0)
    
    # Sum all returned quantities
    all_returns = db.query(InventoryReturnRequest).all()
    for ret in all_returns:
        total_returned_qty += (ret.returned_qty or 0)
    
    for issue in all_tool_issues:
        # Get related details
        tool_detail = db.query(ToolsList).filter(ToolsList.id == issue.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == issue.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == issue.inventory_supervisor_id).first()
        
        # Fetch sale_order_number
        sale_order_number = None
        if issue.request_id:
            inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == issue.request_id).first()
            if inventory_request and inventory_request.project_id:
                order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
                if order:
                    sale_order_number = order.sale_order_number
        
        issue_details = ToolIssueWithDetailsSchema(
            id=issue.id,
            tool_id=issue.tool_id,
            request_id=issue.request_id,
            tool_issue_qty=issue.tool_issue_qty,
            operator_id=issue.operator_id,
            inventory_supervisor_id=issue.inventory_supervisor_id,
            status=issue.status,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            issue_category=issue.issue_category,
            description=issue.description,
            remarks=issue.remarks,
            document_url=issue.document_url,
            tool_name=tool_detail.item_description if tool_detail else None,
            operator_name=operator.user_name if operator else None,
            inventory_supervisor_name=inventory_supervisor.user_name if inventory_supervisor else None,
            sale_order_number=sale_order_number
        )
        
        if issue.status == 'approved':
            tool_issues_approved.append(issue_details)
            issues_qty += (issue.tool_issue_qty or 0)
        elif issue.status == 'pending':
            tool_issues_pending.append(issue_details)
    
    # Calculate in-use qty across all tools: approved requests - returned - issues
    in_use_qty = max(0, total_requested_approved_qty - total_returned_qty - issues_qty)
    
    quantities = ToolQuantities(
        total_qty=total_qty,
        available_qty=available_qty,
        in_use_qty=in_use_qty,
        issues_qty=issues_qty,
        requested_qty=total_requested_approved_qty,
        returned_qty=total_returned_qty
    )
    
    return AllTransactionsResponse(
        transactions=transactions,
        total_requests=len(all_inventory_requests),
        total_return_requests=total_return_requests,
        tool_issues_approved=tool_issues_approved,
        tool_issues_pending=tool_issues_pending,
        quantities=quantities
    )


@router.get("/by-tool/{tool_id}", response_model=AllTransactionsResponse)
def get_transactions_by_tool(tool_id: int, db: Session = Depends(get_db)):
    # Get tool details
    tool = db.query(ToolsList).filter(ToolsList.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tool with id {tool_id} not found")
    
    # Get tool total quantity (remains constant)
    total_qty = tool.total_quantity or tool.quantity or 0
    
    inventory_requests = db.query(InventoryRequest).filter(InventoryRequest.tool_id == tool_id).all()
    
    transactions = []
    total_return_requests = 0
    
    # Quantity calculations
    total_requested_qty = 0
    total_returned_qty = 0
    total_requested_approved_qty = 0
    in_use_qty = 0
    
    for inventory_request in inventory_requests:
        tool_detail = db.query(ToolsList).filter(ToolsList.id == inventory_request.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == inventory_request.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == inventory_request.inventory_supervisor_id).first()
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
            "tool_name": tool_detail.item_description if tool_detail else None,
            "operator_name": operator.user_name if operator else None,
            "inventory_supervisor_name": inventory_supervisor.user_name if inventory_supervisor else None,
            "project_name": project.sale_order_number if project else None,
            "part_name": part.part_name if part else None
        }
        
        return_requests = db.query(InventoryReturnRequest).filter(
            InventoryReturnRequest.requested_id == inventory_request.id
        ).all()
        
        return_requests_details = []
        
        if return_requests:
            for return_request in return_requests:
                return_operator = db.query(AccessUser).filter(AccessUser.id == return_request.operator_id).first()
                return_inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == return_request.inventory_supervisor_id).first()
                
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
                    "inventory_supervisor_name": return_inventory_supervisor.user_name if return_inventory_supervisor else None,
                    "inventory_request_details": inventory_request_details
                }
                
                return_requests_details.append(InventoryReturnRequestWithDetailsSchema(**return_request_details))
        
        complete_transaction = CompleteTransactionHistory(
            inventory_request=InventoryRequestWithDetailsSchema(**inventory_request_details),
            return_requests=return_requests_details
        )
        
        transactions.append(complete_transaction)
        total_return_requests += len(return_requests_details)
        
        # Calculate quantities for this request
        qty = inventory_request.quantity or 0
        returned_sum = sum(rr.returned_qty or 0 for rr in return_requests)
        
        total_requested_qty += qty
        total_returned_qty += returned_sum
        
        if (inventory_request.status or '').lower() == 'approved':
            total_requested_approved_qty += qty
            
            # Calculate outstanding (in use) for approved requests
            outstanding = max(0, qty - returned_sum)
            in_use_qty += outstanding
    
    # Fetch tool issues for this tool
    tool_issues = db.query(ToolIssue).filter(ToolIssue.tool_id == tool_id).all()
    
    tool_issues_approved = []
    tool_issues_pending = []
    issues_qty = 0
    
    for issue in tool_issues:
        # Get related details
        tool_detail = db.query(ToolsList).filter(ToolsList.id == issue.tool_id).first()
        operator = db.query(AccessUser).filter(AccessUser.id == issue.operator_id).first()
        inventory_supervisor = db.query(AccessUser).filter(AccessUser.id == issue.inventory_supervisor_id).first()
        
        # Fetch sale_order_number
        sale_order_number = None
        if issue.request_id:
            inventory_request = db.query(InventoryRequest).filter(InventoryRequest.id == issue.request_id).first()
            if inventory_request and inventory_request.project_id:
                order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
                if order:
                    sale_order_number = order.sale_order_number
        
        issue_details = ToolIssueWithDetailsSchema(
            id=issue.id,
            tool_id=issue.tool_id,
            request_id=issue.request_id,
            tool_issue_qty=issue.tool_issue_qty,
            operator_id=issue.operator_id,
            inventory_supervisor_id=issue.inventory_supervisor_id,
            status=issue.status,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            issue_category=issue.issue_category,
            description=issue.description,
            remarks=issue.remarks,
            document_url=issue.document_url,
            tool_name=tool_detail.item_description if tool_detail else None,
            operator_name=operator.user_name if operator else None,
            inventory_supervisor_name=inventory_supervisor.user_name if inventory_supervisor else None,
            sale_order_number=sale_order_number
        )
        
        if issue.status == 'approved':
            tool_issues_approved.append(issue_details)
            issues_qty += issue.tool_issue_qty or 0
        elif issue.status == 'pending':
            tool_issues_pending.append(issue_details)
    
    # Calculate available quantity: Total - In Use - Issues
    # Note: issues_qty is stored separately but also deducted from in_use
    in_use_qty = max(0, in_use_qty - issues_qty)
    available_qty = max(0, total_qty - in_use_qty - issues_qty)
    
    # Create quantities object
    quantities = ToolQuantities(
        total_qty=total_qty,
        available_qty=available_qty,
        in_use_qty=in_use_qty,
        issues_qty=issues_qty,
        requested_qty=total_requested_approved_qty,  # Only approved requests
        returned_qty=total_returned_qty
    )
    
    # Build grouped requests with all calculations
    grouped_requests = []
    for transaction in transactions:
        inv_req = transaction.inventory_request
        returns_data = transaction.return_requests
        request_id = inv_req.id
        
        # Find issues related to this request
        related_issues = [issue for issue in tool_issues_approved if issue.request_id == request_id]
        total_issue_qty = sum(issue.tool_issue_qty or 0 for issue in related_issues)
        
        # Calculate returned quantity
        total_returned_qty_req = sum(ret.returned_qty or 0 for ret in returns_data)
        
        # Calculate in-use (only for approved requests)
        requested_qty = inv_req.quantity or 0
        is_approved = (inv_req.status or '').lower() == 'approved'
        in_use_qty_req = max(0, requested_qty - total_returned_qty_req - total_issue_qty) if is_approved else 0
        
        grouped_requests.append(GroupedRequest(
            request_id=request_id,
            project_name=inv_req.project_name,
            part_name=inv_req.part_name,
            operator_name=inv_req.operator_name,
            requested_qty=requested_qty,
            requested_date=str(inv_req.created_at) if inv_req.created_at else None,
            approved_date=str(inv_req.updated_at) if is_approved and inv_req.updated_at else None,
            status=inv_req.status or 'PENDING',
            returns=[ReturnInfo(
                submitted_date=str(ret.created_at) if ret.created_at else None,
                collected_date=str(ret.updated_at) if ret.updated_at and (ret.status or '').lower() == 'collected' else None,
                qty=ret.returned_qty or 0,
                status=ret.status or '-',
                remarks=ret.remarks,
                supervisor_name=ret.supervisor_name
            ) for ret in returns_data],
            issues=[IssueInfo(
                date=str(issue.created_at) if issue.created_at else None,
                qty=issue.tool_issue_qty or 0,
                approved_by=issue.supervisor_name,
                remarks=issue.remarks
            ) for issue in related_issues],
            total_returned_qty=total_returned_qty_req,
            total_issue_qty=total_issue_qty,
            in_use_qty=in_use_qty_req
        ))
    
    return AllTransactionsResponse(
        transactions=transactions,
        total_requests=len(inventory_requests),
        total_return_requests=total_return_requests,
        tool_issues_approved=tool_issues_approved,
        tool_issues_pending=tool_issues_pending,
        quantities=quantities,
        grouped_requests=grouped_requests
    )
