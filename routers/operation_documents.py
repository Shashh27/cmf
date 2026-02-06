from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.oms import (
    OperationDocument as OperationDocumentModel,
    Operation as OperationModel
)
from DB.schemas.oms import (
    OperationDocument,
    OperationDocumentCreate,
    OperationDocumentUpdate,
    OperationDocumentWithDetails
)

router = APIRouter(
    prefix="/operation-documents",
    tags=["operation-documents"]
)


@router.post("/", response_model=OperationDocument, status_code=status.HTTP_201_CREATED)
def create_operation_document(document: OperationDocumentCreate, db: Session = Depends(get_db)):
    """Create a new operation document"""
    # Check if operation exists
    operation = db.query(OperationModel).filter(OperationModel.id == document.operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {document.operation_id} not found"
        )
    
    db_document = OperationDocumentModel(**document.model_dump())
    db.add(db_document)
    db.commit()
    db.refresh(db_document)
    return db_document


@router.get("/", response_model=List[OperationDocumentWithDetails])
def get_operation_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all operation documents with operation details"""
    documents = db.query(OperationDocumentModel).offset(skip).limit(limit).all()
    result = []
    for document in documents:
        # Get operation details
        operation = db.query(OperationModel).filter(OperationModel.id == document.operation_id).first()
        
        # Create document dict with operation details
        document_dict = {
            "id": document.id,
            "document_name": document.document_name,
            "document_url": document.document_url,
            "document_type": document.document_type,
            "document_version": document.document_version,
            "operation_id": document.operation_id,
            "operation_name": operation.operation_name if operation else None,
            "operation_number": operation.operation_number if operation else None
        }
        result.append(document_dict)
    return result


@router.get("/{document_id}", response_model=OperationDocumentWithDetails)
def get_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Get a specific operation document by ID with operation details"""
    document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    # Get operation details
    operation = db.query(OperationModel).filter(OperationModel.id == document.operation_id).first()
    
    # Create document dict with operation details
    document_dict = {
        "id": document.id,
        "document_name": document.document_name,
        "document_url": document.document_url,
        "document_type": document.document_type,
        "document_version": document.document_version,
        "operation_id": document.operation_id,
        "operation_name": operation.operation_name if operation else None,
        "operation_number": operation.operation_number if operation else None
    }
    return document_dict


@router.get("/operation/{operation_id}", response_model=List[OperationDocumentWithDetails])
def get_documents_by_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get all documents for a specific operation"""
    # Check if operation exists
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id).all()
    result = []
    for document in documents:
        # Create document dict with operation details
        document_dict = {
            "id": document.id,
            "document_name": document.document_name,
            "document_url": document.document_url,
            "document_type": document.document_type,
            "document_version": document.document_version,
            "operation_id": document.operation_id,
            "operation_name": operation.operation_name,
            "operation_number": operation.operation_number
        }
        result.append(document_dict)
    return result


@router.put("/{document_id}", response_model=OperationDocumentWithDetails)
def update_operation_document(document_id: int, document_update: OperationDocumentUpdate, db: Session = Depends(get_db)):
    """Update an operation document and return with operation details"""
    db_document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    # Check if operation exists if operation_id is being updated
    if document_update.operation_id is not None:
        operation = db.query(OperationModel).filter(OperationModel.id == document_update.operation_id).first()
        if not operation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Operation with id {document_update.operation_id} not found"
            )
    
    update_data = document_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_document, field, value)
    
    db.commit()
    db.refresh(db_document)
    
    # Get operation details
    operation = db.query(OperationModel).filter(OperationModel.id == db_document.operation_id).first()
    
    # Create document dict with operation details
    document_dict = {
        "id": db_document.id,
        "document_name": db_document.document_name,
        "document_url": db_document.document_url,
        "document_type": db_document.document_type,
        "document_version": db_document.document_version,
        "operation_id": db_document.operation_id,
        "operation_name": operation.operation_name if operation else None,
        "operation_number": operation.operation_number if operation else None
    }
    return document_dict


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Delete an operation document"""
    document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    db.delete(document)
    db.commit()
    return None


@router.delete("/operation/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_documents_by_operation(operation_id: int, db: Session = Depends(get_db)):
    """Delete all documents for a specific operation"""
    # Check if operation exists
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id).all()
    for document in documents:
        db.delete(document)
    
    db.commit()
    return None
