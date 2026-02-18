from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from urllib.parse import urlparse

from DB.database import get_db
from DB.minio_client import get_minio_client
from DB.models.oms import (
    Operation as OperationModel,
    OperationDocument as OperationDocumentModel,
    ToolWithPart as ToolWithPartModel
)
from DB.schemas.oms import Operation, OperationCreate, OperationUpdate

router = APIRouter(
    prefix="/operations",
    tags=["operations"]
)


@router.post("/", response_model=Operation, status_code=status.HTTP_201_CREATED)
def create_operation(operation: OperationCreate, db: Session = Depends(get_db)):
    """Create a new operation"""
    db_operation = OperationModel(**operation.model_dump())
    db.add(db_operation)
    db.commit()
    db.refresh(db_operation)
    return db_operation


@router.get("/", response_model=List[Operation])
def get_operations(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all operations with pagination"""
    operations = db.query(OperationModel).offset(skip).limit(limit).all()
    return operations


@router.get("/{operation_id}", response_model=Operation)
def get_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get a specific operation by ID"""
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    return operation


@router.get("/part/{part_id}", response_model=List[Operation])
def get_operations_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all operations for a specific part"""
    operations = db.query(OperationModel).filter(OperationModel.part_id == part_id).all()
    return operations


@router.put("/{operation_id}", response_model=Operation)
def update_operation(operation_id: int, operation: OperationUpdate, db: Session = Depends(get_db)):
    """Update an operation"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    update_data = operation.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_operation, field, value)

    db.commit()
    db.refresh(db_operation)
    return db_operation


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation(operation_id: int, db: Session = Depends(get_db)):
    """Delete an operation and all associated data (documents, tools)"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    # 1. Delete associated documents (MinIO files and DB records)
    documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id).all()
    minio_client = get_minio_client()
    
    for doc in documents:
        # Try to delete from MinIO
        try:
            # Extract object name from URL
            # URL format: http://endpoint/bucket/object_name
            if doc.document_url:
                parsed_url = urlparse(doc.document_url)
                path_parts = parsed_url.path.lstrip('/').split('/', 1)
                
                if len(path_parts) >= 2:
                    bucket_name = path_parts[0]
                    object_name = path_parts[1]
                    minio_client.client.remove_object(bucket_name, object_name)
                elif not parsed_url.netloc and '/' in doc.document_url:
                     # Assume format: bucket/object_name
                     path_parts = doc.document_url.lstrip('/').split('/', 1)
                     if len(path_parts) >= 2:
                        bucket_name = path_parts[0]
                        object_name = path_parts[1]
                        minio_client.client.remove_object(bucket_name, object_name)
        except Exception as e:
            print(f"Error deleting file from MinIO for document {doc.id}: {str(e)}")
            # Continue deleting DB record even if MinIO fails
            
        db.delete(doc)

    # 2. Delete associated tools
    tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.operation_id == operation_id).all()
    for tool in tools:
        db.delete(tool)

    # 3. Delete the operation
    db.delete(db_operation)
    db.commit()
    return None