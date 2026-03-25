from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import os
import io
import uuid
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


def _op_doc_to_dict(document: OperationDocumentModel) -> dict:
    op = document.operation
    return {
        "id": document.id,
        "document_name": document.document_name,
        "document_url": document.document_url,
        "document_type": document.document_type,
        "document_version": document.document_version,
        "operation_id": document.operation_id,
        "parent_id": document.parent_id,
        "operation_name": op.operation_name if op else None,
        "operation_number": op.operation_number if op else None,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
    }


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
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """Upload multiple documents for an operation (user_id = uploader: project_coordinator, admin, or manufacturing_coordinator)."""
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
            # Generate unique object name with timestamp and UUID
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            file_extension = get_file_extension(file.filename)
            # Structure: cmf/operation_documents/operation_{id}/{timestamp}_{unique_id}_{filename}
            object_name = f"operation_documents/operation_{operation_id}/{timestamp}_{unique_id}_{file.filename}"
            
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
            
            # Create database record (user_id = uploader)
            db_document = OperationDocumentModel(
                document_name=file.filename,
                document_url=document_url,
                document_type=effective_doc_type,
                document_version=document_version,
                operation_id=operation_id,
                parent_id=parent_id,
                user_id=user_id
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


@router.post("/upload-bulk/", response_model=List[OperationDocument], status_code=status.HTTP_201_CREATED)
async def upload_operation_documents_bulk(
    operation_id: int = Form(...),
    files: List[UploadFile] = File(...),
    document_type: List[str] = Form([]),
    document_version: List[str] = Form([]),
    document_name: List[str] = Form([]),
    parent_id: List[Optional[int]] = Form([]),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload many operation documents with per-file metadata in one request."""
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    if not files:
        return []

    uploaded_documents: List[OperationDocumentModel] = []
    minio_client = get_minio_client()

    try:
        for idx, file in enumerate(files):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            file_extension = get_file_extension(file.filename)
            object_name = f"operation_documents/operation_{operation_id}/{timestamp}_{unique_id}_{file.filename}"

            file_content = await file.read()
            file_stream = io.BytesIO(file_content)
            content_type = get_content_type_from_detection(file_content, file.filename)

            effective_type = None
            if idx < len(document_type) and document_type[idx]:
                effective_type = str(document_type[idx]).strip()
            if not effective_type:
                ext_str = file_extension.replace('.', '').upper()
                effective_type = ext_str or "Unknown"

            effective_version = None
            if idx < len(document_version) and document_version[idx]:
                effective_version = str(document_version[idx]).strip()
            if not effective_version:
                effective_version = "1.0"

            effective_name = None
            if idx < len(document_name) and document_name[idx]:
                effective_name = str(document_name[idx]).strip()
            if not effective_name:
                effective_name = file.filename

            effective_parent = None
            if idx < len(parent_id):
                pid = parent_id[idx]
                if pid not in (0, None):
                    effective_parent = pid

            document_url = minio_client.upload_file(
                file_data=file_stream,
                object_name=object_name,
                content_type=content_type,
                metadata={
                    'document_name': effective_name,
                    'document_type': effective_type,
                    'document_version': effective_version,
                    'operation_id': str(operation_id),
                    'original_filename': file.filename
                }
            )

            db_document = OperationDocumentModel(
                document_name=effective_name,
                document_url=document_url,
                document_type=effective_type,
                document_version=effective_version,
                operation_id=operation_id,
                parent_id=effective_parent,
                user_id=user_id
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


@router.post("/upload-bulk-multi/", response_model=List[OperationDocument], status_code=status.HTTP_201_CREATED)
async def upload_operation_documents_bulk_multi(
    operation_id: List[int] = Form(...),
    files: List[UploadFile] = File(...),
    document_type: List[str] = Form([]),
    document_version: List[str] = Form([]),
    document_name: List[str] = Form([]),
    parent_id: List[str] = Form([]),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Upload many operation documents across multiple operations in one request.
    Arrays must align by index: operation_id[i] belongs to files[i], document_type[i], etc.
    """
    if not files:
        return []
    if len(operation_id) != len(files):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="operation_id and files length must match"
        )

    op_ids = set(operation_id)
    existing = db.query(OperationModel.id).filter(OperationModel.id.in_(op_ids)).all()
    existing_ids = {row[0] for row in existing}
    missing = [oid for oid in op_ids if oid not in existing_ids]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation(s) not found: {missing}"
        )

    uploaded_documents: List[OperationDocumentModel] = []
    minio_client = get_minio_client()

    try:
        for idx, file in enumerate(files):
            op_id = operation_id[idx]
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            file_extension = get_file_extension(file.filename)
            object_name = f"operation_documents/operation_{op_id}/{timestamp}_{unique_id}_{file.filename}"

            file_content = await file.read()
            file_stream = io.BytesIO(file_content)
            content_type = get_content_type_from_detection(file_content, file.filename)

            effective_type = None
            if idx < len(document_type) and document_type[idx]:
                effective_type = str(document_type[idx]).strip()
            if not effective_type:
                ext_str = file_extension.replace('.', '').upper()
                effective_type = ext_str or "Unknown"

            effective_version = None
            if idx < len(document_version) and document_version[idx]:
                effective_version = str(document_version[idx]).strip()
            if not effective_version:
                effective_version = "1.0"

            effective_name = None
            if idx < len(document_name) and document_name[idx]:
                effective_name = str(document_name[idx]).strip()
            if not effective_name:
                effective_name = file.filename

            effective_parent = None
            if idx < len(parent_id):
                raw = (parent_id[idx] or "").strip()
                if raw and raw.lower() not in ("null", "none", "0"):
                    try:
                        effective_parent = int(raw)
                    except ValueError:
                        effective_parent = None

            document_url = minio_client.upload_file(
                file_data=file_stream,
                object_name=object_name,
                content_type=content_type,
                metadata={
                    'document_name': effective_name,
                    'document_type': effective_type,
                    'document_version': effective_version,
                    'operation_id': str(op_id),
                    'original_filename': file.filename
                }
            )

            db_document = OperationDocumentModel(
                document_name=effective_name,
                document_url=document_url,
                document_type=effective_type,
                document_version=effective_version,
                operation_id=op_id,
                parent_id=effective_parent,
                user_id=user_id
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
def get_operation_documents(user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all operation documents with operation details. Filter by user_id (uploader) for module-specific views."""
    query = (
        db.query(OperationDocumentModel)
        .options(joinedload(OperationDocumentModel.operation))
        .order_by(OperationDocumentModel.id.asc())
    )
    if user_id is not None:
        query = query.filter(OperationDocumentModel.user_id == user_id)
    documents = query.all()
    return [_op_doc_to_dict(d) for d in documents]


@router.get("/{document_id}", response_model=OperationDocumentWithDetails)
def get_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Get a specific operation document by ID with operation details."""
    document = (
        db.query(OperationDocumentModel)
        .options(joinedload(OperationDocumentModel.operation))
        .filter(OperationDocumentModel.id == document_id)
        .first()
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    return _op_doc_to_dict(document)


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
def get_documents_by_operation(operation_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all documents for a specific operation. Filter by user_id (uploader) for module-specific views."""
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    query = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id)
    if user_id is not None:
        query = query.filter(OperationDocumentModel.user_id == user_id)
    documents = query.all()
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

    refreshed = (
        db.query(OperationDocumentModel)
        .options(joinedload(OperationDocumentModel.operation))
        .filter(OperationDocumentModel.id == document_id)
        .first()
    )
    return _op_doc_to_dict(refreshed)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation_document(document_id: int, db: Session = Depends(get_db)):
    """Delete an operation document and its file from MinIO"""
    document = db.query(OperationDocumentModel).filter(OperationDocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation document with id {document_id} not found"
        )
    
    try:
        # Get MinIO client and path info before deleting from DB
        minio_client = get_minio_client()
        object_name = None
        try:
            parsed_url = urlparse(document.document_url)
            path_parts = parsed_url.path.lstrip('/').split('/', 1)
            
            if len(path_parts) < 2:
                if not parsed_url.netloc and '/' in document.document_url:
                    path_parts = document.document_url.lstrip('/').split('/', 1)
            
            if len(path_parts) >= 2:
                object_name = path_parts[1]
        except Exception:
            pass
            
        # Delete from database first
        db.delete(document)
        db.commit()

        # Only delete from MinIO after successful database commit
        if object_name:
            try:
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete operation document from MinIO: {str(e)}")
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )
    return None


@router.delete("/operation/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_documents_by_operation(operation_id: int, db: Session = Depends(get_db)):
    """Delete all documents for a specific operation and their files from MinIO"""
    # Check if operation exists
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    
    documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id).all()
    minio_client = get_minio_client()
    
    # Collect all object names for later deletion
    objects_to_delete = []
    for document in documents:
        try:
            parsed_url = urlparse(document.document_url)
            path_parts = parsed_url.path.lstrip('/').split('/', 1)
            if len(path_parts) < 2:
                if not parsed_url.netloc and '/' in document.document_url:
                    path_parts = document.document_url.lstrip('/').split('/', 1)
            if len(path_parts) >= 2:
                objects_to_delete.append(path_parts[1])
        except Exception:
            pass
        
        # Delete from database
        db.delete(document)
    
    try:
        # Commit all DB deletions first
        db.commit()

        # Only delete from MinIO after successful database commit
        for object_name in objects_to_delete:
            try:
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete operation document from MinIO: {str(e)}")
                
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete documents: {str(e)}"
        )
        
    return None
