from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import io
from urllib.parse import urlparse
from datetime import datetime

from DB.database import get_db
from DB.minio_client import get_minio_client
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


# Helper functions for file handling
def get_file_extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lower()


def detect_file_type_from_content(file_content: bytes) -> str:
    if not file_content:
        return 'application/octet-stream'
    
    if file_content.startswith(b'%PDF-'): return 'application/pdf'
    if file_content.startswith(b'\x89PNG\r\n\x1a\n'): return 'image/png'
    if file_content.startswith(b'\xFF\xD8\xFF'): return 'image/jpeg'
    if file_content.startswith(b'GIF87a') or file_content.startswith(b'GIF89a'): return 'image/gif'
    if file_content.startswith(b'BM'): return 'image/bmp'
    if file_content.startswith(b'<svg') or b'<svg' in file_content[:100]: return 'image/svg+xml'
    
    return 'application/octet-stream'


def get_content_type_from_detection(file_content: bytes, filename: str = None) -> str:
    detected_type = detect_file_type_from_content(file_content)
    if detected_type != 'application/octet-stream':
        return detected_type
    
    # Fallback to extension
    ext = get_file_extension(filename)
    content_types = {
        '.pdf': 'application/pdf',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.doc': 'application/msword',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls': 'application/vnd.ms-excel',
        '.csv': 'text/csv',
        '.txt': 'text/plain'
    }
    return content_types.get(ext, 'application/octet-stream')


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


@router.post("/upload/", response_model=List[OperationDocument], status_code=status.HTTP_201_CREATED)
async def upload_operation_documents(
    operation_id: int = Form(...),
    files: List[UploadFile] = File(...),
    document_type: str = Form("Technical"),
    document_version: str = Form("1.0"),
    parent_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload multiple documents for an operation"""
    # Check if operation exists
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    uploaded_documents = []
    minio_client = get_minio_client()
    
    try:
        for file in files:
            # Generate unique object name
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_extension = get_file_extension(file.filename)
            # Structure: cmf/operation_documents/operation_{id}/{timestamp}_{filename}
            object_name = f"operation_documents/operation_{operation_id}/{timestamp}_{file.filename}"
            
            # Read file content
            file_content = await file.read()
            file_stream = io.BytesIO(file_content)
            
            # Determine content type
            content_type = get_content_type_from_detection(file_content, file.filename)
            
            # Determine document_type if default
            effective_doc_type = document_type
            if effective_doc_type == "Technical":
                # Derive from extension (e.g. "PDF", "PNG")
                ext_str = file_extension.replace('.', '').upper()
                if ext_str:
                    effective_doc_type = ext_str
                else:
                    effective_doc_type = "Unknown"
            
            # Upload to MinIO
            document_url = minio_client.upload_file(
                file_data=file_stream,
                object_name=object_name,
                content_type=content_type,
                metadata={
                    'document_name': file.filename,
                    'document_type': effective_doc_type,
                    'document_version': document_version,
                    'operation_id': str(operation_id),
                    'original_filename': file.filename
                }
            )
            
            # Create database record
            db_document = OperationDocumentModel(
                document_name=file.filename,
                document_url=document_url,
                document_type=effective_doc_type,
                document_version=document_version,
                operation_id=operation_id,
                parent_id=parent_id
            )
            
            db.add(db_document)
            uploaded_documents.append(db_document)
            
        db.commit()
        for doc in uploaded_documents:
            db.refresh(doc)
            
        return uploaded_documents
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload documents: {str(e)}"
        )


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
            "parent_id": document.parent_id,
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
        "parent_id": document.parent_id,
        "operation_name": operation.operation_name if operation else None,
        "operation_number": operation.operation_number if operation else None
    }
    return document_dict


@router.get("/{document_id}/download")
def download_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Download an operation document"""
    document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    # Extract object name from URL
    # URL format: http://endpoint/bucket/object_name
    parsed_url = urlparse(document.document_url)
    path_parts = parsed_url.path.lstrip('/').split('/', 1)
    
    if len(path_parts) < 2:
         # Try to see if it is just a path
         if not parsed_url.netloc and '/' in document.document_url:
             # Assume format: bucket/object_name
             path_parts = document.document_url.lstrip('/').split('/', 1)
             if len(path_parts) < 2:
                 raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Invalid document URL format: {document.document_url}"
                 )
         else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid document URL format: {document.document_url}"
            )
    
    bucket_name = path_parts[0]
    object_name = path_parts[1]
    
    minio_client = get_minio_client()
    
    try:
        # Get object stream
        response = minio_client.client.get_object(bucket_name, object_name)
        
        return StreamingResponse(
            response,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{document.document_name}"'
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error downloading file: {str(e)}"
        )


@router.get("/{document_id}/preview")
def preview_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Preview an operation document (inline display)"""
    document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    # Extract object name from URL
    parsed_url = urlparse(document.document_url)
    path_parts = parsed_url.path.lstrip('/').split('/', 1)
    
    if len(path_parts) < 2:
         if not parsed_url.netloc and '/' in document.document_url:
             path_parts = document.document_url.lstrip('/').split('/', 1)
             if len(path_parts) < 2:
                 raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Invalid document URL format: {document.document_url}"
                 )
         else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Invalid document URL format: {document.document_url}"
            )
    
    bucket_name = path_parts[0]
    object_name = path_parts[1]
    
    minio_client = get_minio_client()
    
    try:
        # Get object data
        response = minio_client.client.get_object(bucket_name, object_name)
        file_data = response.read()
        
        # Determine content type
        content_type = get_content_type_from_detection(file_data, document.document_name)
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_type,
            headers={
                "Content-Disposition": f'inline; filename="{document.document_name}"'
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error previewing file: {str(e)}"
        )


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
            "parent_id": document.parent_id,
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
        "parent_id": db_document.parent_id,
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
