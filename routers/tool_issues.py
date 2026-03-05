from fastapi import APIRouter, Depends, HTTPException, status as http_status, UploadFile, File, Form, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import uuid
import os
import io

from DB.database import get_db
from DB.models.inventory import ToolIssue as ToolIssueModel, ToolsList as ToolsListModel, InventoryRequest as InventoryRequestModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order
from DB.schemas.inventory import (
    ToolIssue as ToolIssueSchema,
    ToolIssueCreate as ToolIssueCreateSchema,
    ToolIssueUpdate as ToolIssueUpdateSchema,
    ToolIssueWithDetails as ToolIssueWithDetailsSchema
)
from DB.minio_client import get_minio_client

router = APIRouter(
    prefix="/tool-issues",
    tags=["Tool Issues"]
)

IST = timezone(timedelta(hours=5, minutes=30))


# Pydantic model for status update request
class ToolIssueStatusUpdate(BaseModel):
    admin_id: int
    status: str  # 'approved' or 'rejected'
    remarks: str  # Mandatory remarks from admin


# =======================
# Tool Issues CRUD
# =======================
@router.post(
    "/",
    response_model=ToolIssueWithDetailsSchema,
    openapi_extra={
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["tool_id", "request_id", "tool_issue_qty", "operator_id"],
                        "properties": {
                            "tool_id":         {"type": "integer"},
                            "request_id":      {"type": "integer"},
                            "tool_issue_qty":  {"type": "integer"},
                            "operator_id":     {"type": "integer"},
                            "issue_category":  {"type": "string"},
                            "description":     {"type": "string"},
                            "document": {
                                "type": "string",
                                "format": "binary",
                                "description": "Upload a document file (PDF, image, etc.)"
                            }
                        }
                    }
                }
            },
            "required": True
        }
    }
)
async def create_tool_issue(
    request: Request,
    db: Session = Depends(get_db)
):
    """Create a new tool issue (raised by operator) with optional document upload"""
    form = await request.form()

    # Extract and validate required fields
    try:
        tool_id = int(form.get("tool_id"))
        request_id = int(form.get("request_id"))
        tool_issue_qty = int(form.get("tool_issue_qty"))
        operator_id = int(form.get("operator_id"))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tool_id, request_id, tool_issue_qty, operator_id are required integers"
        )

    issue_category = form.get("issue_category") or None
    description = form.get("description") or None
    document = form.get("document")  # Will be UploadFile if a file was sent, else a string or None

    # Validate tool exists
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool with id {tool_id} not found")

    # Validate operator exists
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Operator with id {operator_id} not found")

    # Validate inventory request exists
    inv_req = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == request_id).first()
    if not inv_req:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Inventory request with id {request_id} not found")

    # Ensure tool/operator match the inventory request
    if inv_req.tool_id != tool_id or inv_req.operator_id != operator_id:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Provided tool/operator do not match the inventory request"
        )

    if inv_req.status != 'approved':
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="Tool issues can only be created for approved inventory requests"
        )

    # Calculate outstanding quantity
    existing_issues = db.query(ToolIssueModel).filter(
        ToolIssueModel.request_id == request_id,
        ToolIssueModel.status.in_(["pending", "approved"])
    ).all()
    issued_so_far = sum(t.tool_issue_qty for t in existing_issues)

    from DB.models.inventory import InventoryReturnRequest as InventoryReturnRequestModel
    existing_returns = db.query(InventoryReturnRequestModel).filter(
        InventoryReturnRequestModel.requested_id == request_id
    ).all()
    returned_so_far = sum(r.returned_qty for r in existing_returns)

    outstanding = inv_req.quantity - issued_so_far - returned_so_far
    if tool_issue_qty <= 0 or tool_issue_qty > outstanding:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"tool_issue_qty must be > 0 and <= outstanding ({outstanding})"
        )

    # Handle document upload
    # Stored in MinIO bucket 'cmf' at path: toolissues/tool_{tool_id}/{timestamp}_{uuid}{ext}
    document_url = None
    if document and hasattr(document, "filename") and document.filename:
        try:
            minio_client = get_minio_client()
            file_extension = os.path.splitext(document.filename)[1]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_filename = f"{timestamp}_{uuid.uuid4()}{file_extension}"
            object_name = f"toolissues/tool_{tool_id}/{unique_filename}"

            file_content = await document.read()
            document_url = minio_client.upload_file(
                file_data=io.BytesIO(file_content),
                object_name=object_name,
                content_type=document.content_type or "application/octet-stream"
            )
        except Exception as e:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload document: {str(e)}"
            )

    db_issue = ToolIssueModel(
        tool_id=tool_id,
        request_id=request_id,
        tool_issue_qty=tool_issue_qty,
        operator_id=operator_id,
        status="pending",
        admin_id=None,
        created_at=datetime.now(IST).replace(tzinfo=None),
        issue_category=issue_category,
        description=description,
        document_url=document_url
    )
    db.add(db_issue)
    db.commit()
    db.refresh(db_issue)
    
    # Fetch sale_order_number for the response
    sale_order_number = None
    if db_issue.request_id:
        inventory_request = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == db_issue.request_id).first()
        if inventory_request and inventory_request.project_id:
            order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
            if order:
                sale_order_number = order.sale_order_number
    
    # Get related details for the response
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == db_issue.tool_id).first()
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == db_issue.operator_id).first()
    
    return ToolIssueWithDetailsSchema(
        id=db_issue.id,
        tool_id=db_issue.tool_id,
        request_id=db_issue.request_id,
        tool_issue_qty=db_issue.tool_issue_qty,
        operator_id=db_issue.operator_id,
        admin_id=db_issue.admin_id,
        status=db_issue.status,
        created_at=db_issue.created_at,
        updated_at=db_issue.updated_at,
        issue_category=db_issue.issue_category,
        description=db_issue.description,
        remarks=db_issue.remarks,
        document_url=db_issue.document_url,
        tool_name=tool.item_description if tool else None,
        operator_name=operator.user_name if operator else None,
        admin_name=None,  # No admin assigned yet on creation
        sale_order_number=sale_order_number
    )


@router.get("/", response_model=List[ToolIssueWithDetailsSchema])
def get_all_tool_issues(db: Session = Depends(get_db)):
    issues = db.query(ToolIssueModel).all()
    results: List[ToolIssueWithDetailsSchema] = []
    for issue in issues:
        tool     = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
        operator = db.query(AccessUserModel).filter(AccessUserModel.id == issue.operator_id).first()
        admin    = db.query(AccessUserModel).filter(AccessUserModel.id == issue.admin_id).first()
        
        # Fetch sale_order_number
        sale_order_number = None
        if issue.request_id:
            inventory_request = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == issue.request_id).first()
            if inventory_request and inventory_request.project_id:
                order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
                if order:
                    sale_order_number = order.sale_order_number
        
        results.append(ToolIssueWithDetailsSchema(
            id=issue.id,
            tool_id=issue.tool_id,
            request_id=issue.request_id,
            tool_issue_qty=issue.tool_issue_qty,
            operator_id=issue.operator_id,
            admin_id=issue.admin_id,
            status=issue.status,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            issue_category=issue.issue_category,
            description=issue.description,
            remarks=issue.remarks,
            document_url=issue.document_url,
            tool_name=tool.item_description if tool else None,
            operator_name=operator.user_name if operator else None,
            admin_name=admin.user_name if admin else None,
            sale_order_number=sale_order_number
        ))
    return results


@router.get("/{issue_id}", response_model=ToolIssueWithDetailsSchema)
def get_tool_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = db.query(ToolIssueModel).filter(ToolIssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool issue with id {issue_id} not found")

    tool     = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == issue.operator_id).first()
    admin    = db.query(AccessUserModel).filter(AccessUserModel.id == issue.admin_id).first()
    
    # Fetch sale_order_number
    sale_order_number = None
    if issue.request_id:
        inventory_request = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == issue.request_id).first()
        if inventory_request and inventory_request.project_id:
            order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
            if order:
                sale_order_number = order.sale_order_number
    
    return ToolIssueWithDetailsSchema(
        id=issue.id,
        tool_id=issue.tool_id,
        request_id=issue.request_id,
        tool_issue_qty=issue.tool_issue_qty,
        operator_id=issue.operator_id,
        admin_id=issue.admin_id,
        status=issue.status,
        created_at=issue.created_at,
        updated_at=issue.updated_at,
        issue_category=issue.issue_category,
        description=issue.description,
        remarks=issue.remarks,
        document_url=issue.document_url,
        tool_name=tool.item_description if tool else None,
        operator_name=operator.user_name if operator else None,
        admin_name=admin.user_name if admin else None,
        sale_order_number=sale_order_number
    )


@router.put(
    "/{issue_id}",
    response_model=ToolIssueSchema,
    openapi_extra={
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "properties": {
                            "tool_id":        {"type": "integer"},
                            "request_id":     {"type": "integer"},
                            "tool_issue_qty": {"type": "integer"},
                            "operator_id":    {"type": "integer"},
                            "issue_category": {"type": "string"},
                            "description":    {"type": "string"},
                            "remarks":        {"type": "string"},
                            "document": {
                                "type": "string",
                                "format": "binary",
                                "description": "Upload a replacement document file"
                            }
                        }
                    }
                }
            },
            "required": True
        }
    }
)
async def update_tool_issue(
    issue_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    """Update a tool issue fields and/or replace its document"""
    issue = db.query(ToolIssueModel).filter(ToolIssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool issue with id {issue_id} not found")

    form = await request.form()

    # Optional int fields
    tool_id_raw       = form.get("tool_id")
    request_id_raw    = form.get("request_id")
    tool_issue_qty_raw = form.get("tool_issue_qty")
    operator_id_raw   = form.get("operator_id")

    tool_id        = int(tool_id_raw)        if tool_id_raw        else None
    request_id     = int(request_id_raw)     if request_id_raw     else None
    tool_issue_qty = int(tool_issue_qty_raw) if tool_issue_qty_raw else None
    operator_id    = int(operator_id_raw)    if operator_id_raw    else None

    issue_category = form.get("issue_category") or None
    description    = form.get("description")    or None
    remarks        = form.get("remarks")        or None
    document       = form.get("document")

    # FK validations
    if tool_id is not None:
        tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
        if not tool:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool with id {tool_id} not found")
        issue.tool_id = tool_id

    if request_id is not None:
        inv_req = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == request_id).first()
        if not inv_req:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Inventory request with id {request_id} not found")
        issue.request_id = request_id

    if operator_id is not None:
        operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
        if not operator:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Operator with id {operator_id} not found")
        issue.operator_id = operator_id

    if tool_issue_qty is not None:
        if tool_issue_qty <= 0:
            raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="tool_issue_qty must be greater than 0")
        issue.tool_issue_qty = tool_issue_qty

    if issue_category is not None:
        issue.issue_category = issue_category
    if description is not None:
        issue.description = description
    if remarks is not None:
        issue.remarks = remarks

    # Handle replacement document upload
    # Stored in MinIO bucket 'cmf' at path: toolissues/tool_{tool_id}/{timestamp}_{uuid}{ext}
    if document and hasattr(document, "filename") and document.filename:
        try:
            minio_client = get_minio_client()
            current_tool_id = tool_id if tool_id is not None else issue.tool_id
            file_extension  = os.path.splitext(document.filename)[1]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_filename = f"{timestamp}_{uuid.uuid4()}{file_extension}"
            object_name     = f"toolissues/tool_{current_tool_id}/{unique_filename}"

            file_content = await document.read()
            document_url = minio_client.upload_file(
                file_data=io.BytesIO(file_content),
                object_name=object_name,
                content_type=document.content_type or "application/octet-stream"
            )
            issue.document_url = document_url
        except Exception as e:
            raise HTTPException(
                status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload document: {str(e)}"
            )

    issue.updated_at = datetime.now(IST).replace(tzinfo=None)
    db.commit()
    db.refresh(issue)
    return issue


@router.put("/{issue_id}/status")
def update_tool_issue_status(
    issue_id: int,
    status_update: ToolIssueStatusUpdate,
    db: Session = Depends(get_db)
):
    """Approve or reject a tool issue. On approval, update issues_qty and decrease available quantity."""
    if status_update.status not in ['approved', 'rejected']:
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Status must be either 'approved' or 'rejected'")

    # Validate remarks is provided and not empty
    if not status_update.remarks or status_update.remarks.strip() == "":
        raise HTTPException(status_code=http_status.HTTP_400_BAD_REQUEST, detail="Remarks are mandatory and cannot be empty")

    issue = db.query(ToolIssueModel).filter(ToolIssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool issue with id {issue_id} not found")

    admin = db.query(AccessUserModel).filter(AccessUserModel.id == status_update.admin_id).first()
    if not admin:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Admin with id {status_update.admin_id} not found")

    tool = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
    if not tool:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool with id {issue.tool_id} not found")

    if issue.status != 'pending':
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot {status_update.status} an issue that is already '{issue.status}'. Only pending issues can be updated."
        )

    if status_update.status == 'approved':
        # Update issues_qty to track total approved issues
        tool.issues_qty = (tool.issues_qty or 0) + issue.tool_issue_qty
        
        # Note: We do NOT modify tool.quantity here
        # The available quantity is calculated dynamically in transaction_history endpoint
        # tool.quantity remains unchanged - it represents the physical available stock

    issue.admin_id   = status_update.admin_id
    issue.status     = status_update.status
    issue.remarks    = status_update.remarks  # Save the mandatory remarks
    issue.updated_at = datetime.now(IST).replace(tzinfo=None)

    db.commit()
    db.refresh(issue)
    return {"message": f"Tool issue {status_update.status} successfully", "issue": issue}


@router.delete("/{issue_id}")
def delete_tool_issue(issue_id: int, db: Session = Depends(get_db)):
    issue = db.query(ToolIssueModel).filter(ToolIssueModel.id == issue_id).first()
    if not issue:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail=f"Tool issue with id {issue_id} not found")

    if issue.status == 'approved':
        tool = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
        if tool:
            # Decrease issues_qty
            tool.issues_qty = max(0, (tool.issues_qty or 0) - issue.tool_issue_qty)
            
            # Note: We do NOT modify tool.quantity here
            # The available quantity is calculated dynamically in transaction_history endpoint
            
            db.commit()

    db.delete(issue)
    db.commit()
    return {"message": "Tool issue deleted successfully", "issue_id": issue_id}


@router.get("/by-operator/{operator_id}", response_model=List[ToolIssueWithDetailsSchema])
def get_tool_issues_by_operator(operator_id: int, db: Session = Depends(get_db)):
    issues = db.query(ToolIssueModel).filter(ToolIssueModel.operator_id == operator_id).all()
    results: List[ToolIssueWithDetailsSchema] = []
    for issue in issues:
        tool     = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
        operator = db.query(AccessUserModel).filter(AccessUserModel.id == issue.operator_id).first()
        admin    = db.query(AccessUserModel).filter(AccessUserModel.id == issue.admin_id).first()
        # Fetch sale_order_number for operator-specific listing
        sale_order_number = None
        if issue.request_id:
            inventory_request = db.query(InventoryRequestModel).filter(InventoryRequestModel.id == issue.request_id).first()
            if inventory_request and inventory_request.project_id:
                order = db.query(Order).filter(Order.id == inventory_request.project_id).first()
                if order:
                    sale_order_number = order.sale_order_number
        results.append(ToolIssueWithDetailsSchema(
            id=issue.id,
            tool_id=issue.tool_id,
            request_id=issue.request_id,
            tool_issue_qty=issue.tool_issue_qty,
            operator_id=issue.operator_id,
            admin_id=issue.admin_id,
            status=issue.status,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            issue_category=issue.issue_category,
            description=issue.description,
            remarks=issue.remarks,
            document_url=issue.document_url,
            tool_name=tool.item_description if tool else None,
            operator_name=operator.user_name if operator else None,
            admin_name=admin.user_name if admin else None,
            sale_order_number=sale_order_number
        ))
    return results


@router.get("/by-status/{status}", response_model=List[ToolIssueWithDetailsSchema])
def get_tool_issues_by_status(status: str, db: Session = Depends(get_db)):
    issues = db.query(ToolIssueModel).filter(ToolIssueModel.status == status).all()
    results: List[ToolIssueWithDetailsSchema] = []
    for issue in issues:
        tool     = db.query(ToolsListModel).filter(ToolsListModel.id == issue.tool_id).first()
        operator = db.query(AccessUserModel).filter(AccessUserModel.id == issue.operator_id).first()
        admin    = db.query(AccessUserModel).filter(AccessUserModel.id == issue.admin_id).first()
        results.append(ToolIssueWithDetailsSchema(
            id=issue.id,
            tool_id=issue.tool_id,
            request_id=issue.request_id,
            tool_issue_qty=issue.tool_issue_qty,
            operator_id=issue.operator_id,
            admin_id=issue.admin_id,
            status=issue.status,
            created_at=issue.created_at,
            updated_at=issue.updated_at,
            issue_category=issue.issue_category,
            description=issue.description,
            remarks=issue.remarks,
            document_url=issue.document_url,
            tool_name=tool.item_description if tool else None,
            operator_name=operator.user_name if operator else None,
            admin_name=admin.user_name if admin else None
        ))
    return results
