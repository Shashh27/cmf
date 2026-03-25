from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from DB.database import get_db, MINIO_BUCKET_NAME
from DB.models.oms import OrderDocument, Order
from DB.minio_client import get_minio_client
from DB.schemas.oms import OrderDocument as OrderDocumentResponse, OrderDocumentCreate, OrderDocumentUpdate
import uuid
import os
from datetime import datetime, timedelta
import io

router = APIRouter(prefix="/order-documents", tags=["order-documents"])

def get_file_extension(filename: str) -> str:
    """Extract file extension from filename"""
    return os.path.splitext(filename)[1].lower()

def _can_upload_order_document(order, user_id: Optional[int]) -> bool:
    """Only project_coordinator, admin, or manufacturing_coordinator for this order can upload."""
    if user_id is None:
        return False
    return (
        order.project_coordinator_id == user_id
        or order.admin_id == user_id
        or order.manufacturing_coordinator_id == user_id
    )


# CRUD operations
@router.post("/upload/{order_id}", response_model=OrderDocumentResponse)
async def upload_order_document(
    order_id: int,
    file: UploadFile = File(...),
    document_type: str = Form(""),
    document_version: str = Form("1.0"),
    parent_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload an order document to MinIO.
    user_id must be one of the order's project_coordinator_id, admin_id, or manufacturing_coordinator_id.
    """
    # Check if order exists
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not _can_upload_order_document(order, user_id):
        raise HTTPException(
            status_code=403,
            detail="Only project coordinator, admin, or manufacturing coordinator for this order can upload order documents."
        )

    # Check if parent exists if provided
    if parent_id:
        parent = db.query(OrderDocument).filter(OrderDocument.id == parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent document not found")

    # Generate unique object name with timestamp and UUID for descriptive safety
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    unique_id = uuid.uuid4().hex[:8]
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{timestamp}_{unique_id}_{file.filename}"

    # Create folder structure: order_documents/order_id/filename
    object_name = f"order_documents/{order_id}/{unique_filename}"

    try:
        # Get MinIO client
        minio_client = get_minio_client()

        # Read file content
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)

        # Upload file to MinIO using the client wrapper
        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=file.content_type
        )

        # Save to database (user_id = uploader: project_coordinator, admin, or manufacturing_coordinator)
        db_document = OrderDocument(
            order_id=order_id,
            document_name=file.filename,
            document_url=document_url,
            document_type=document_type or file.content_type,
            document_version=document_version,
            parent_id=parent_id,
            user_id=user_id
        )

        db.add(db_document)
        db.commit()
        db.refresh(db_document)

        return db_document

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")

@router.post("/upload-bulk/{order_id}", response_model=List[OrderDocumentResponse])
async def upload_order_documents_bulk(
    order_id: int,
    files: List[UploadFile] = File(...),
    document_type: List[str] = Form([]),
    document_version: List[str] = Form([]),
    document_name: List[str] = Form([]),
    parent_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    """
    Upload multiple order documents in a single request (multipart/form-data).

    Send repeated fields (same key multiple times) to build lists, e.g.
    - files: <file1>, <file2>, ...
    - document_type: <type1>, <type2>, ...
    - document_version: <ver1>, <ver2>, ...
    - document_name: <name1>, <name2>, ...
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not _can_upload_order_document(order, user_id):
        raise HTTPException(
            status_code=403,
            detail="Only project coordinator, admin, or manufacturing coordinator for this order can upload order documents.",
        )

    if parent_id:
        parent = db.query(OrderDocument).filter(OrderDocument.id == parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent document not found")

    if not files:
        return []

    minio_client = get_minio_client()
    created_docs: List[OrderDocument] = []

    try:
        for idx, file in enumerate(files):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            file_extension = os.path.splitext(file.filename)[1]
            unique_filename = f"{timestamp}_{unique_id}_{file.filename}"
            object_name = f"order_documents/{order_id}/{unique_filename}"

            file_content = await file.read()
            file_stream = io.BytesIO(file_content)

            url = minio_client.upload_file(
                file_data=file_stream,
                object_name=object_name,
                content_type=file.content_type,
            )

            effective_type = ""
            if idx < len(document_type) and document_type[idx] is not None:
                effective_type = (document_type[idx] or "").strip()
            if not effective_type:
                effective_type = file.content_type or ""

            effective_version = "1.0"
            if idx < len(document_version) and document_version[idx]:
                effective_version = str(document_version[idx]).strip() or "1.0"

            effective_name = file.filename
            if idx < len(document_name) and document_name[idx]:
                effective_name = str(document_name[idx]).strip() or file.filename

            db_document = OrderDocument(
                order_id=order_id,
                document_name=effective_name,
                document_url=url,
                document_type=effective_type,
                document_version=effective_version,
                parent_id=parent_id,
                user_id=user_id,
            )
            db.add(db_document)
            created_docs.append(db_document)

        db.commit()
        for d in created_docs:
            db.refresh(d)
        return created_docs
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload documents: {str(e)}")

@router.put("/replace/{document_id}", response_model=OrderDocumentResponse)
async def replace_order_document(
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Replace an existing order document with a new file (only document_id and file required)"""
    # Get existing document
    existing_document = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
    if not existing_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Store old object name for later deletion
        old_object_name = None
        try:
            old_object_name = existing_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        except Exception:
            pass
        
        # Generate unique filename with timestamp and UUID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{timestamp}_{unique_id}_{file.filename}"
        
        # Create folder structure: order_documents/order_id/filename
        object_name = f"order_documents/{existing_document.order_id}/{unique_filename}"
        
        # Read new file content
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)
        
        # Upload new file to MinIO
        new_document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=file.content_type
        )
        
        # Update database record (only update file-related fields, keep existing metadata)
        existing_document.document_name = file.filename
        existing_document.document_url = new_document_url
        existing_document.document_type = file.content_type  # Auto-detect from file
        
        db.commit()
        db.refresh(existing_document)
        
        # Only delete old file after successful database commit
        if old_object_name:
            try:
                minio_client.delete_file(old_object_name)
            except Exception as e:
                print(f"Warning: Failed to delete old file from MinIO: {str(e)}")
        
        return existing_document
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to replace document: {str(e)}")

@router.delete("/{document_id}")
def delete_order_document(document_id: int, db: Session = Depends(get_db)):
    """Delete an order document and remove file from MinIO"""
    db_document = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
    if not db_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get object name before deleting from DB
        minio_client = get_minio_client()
        object_key = None
        try:
            object_key = db_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        except Exception:
            pass
            
        # Delete from database first
        db.delete(db_document)
        db.commit()

        # Only delete from MinIO after successful database commit
        if object_key:
            try:
                minio_client.delete_file(object_key)
            except Exception as e:
                print(f"Warning: Failed to delete document from MinIO: {str(e)}")
        
        return {"message": "Document deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@router.put("/replace-with-metadata/{document_id}", response_model=OrderDocumentResponse)
async def replace_order_document_with_metadata(
    document_id: int,
    file: UploadFile = File(...),
    document_type: str = "",
    document_version: str = "1.0",
    db: Session = Depends(get_db)
):
    """Replace an existing order document with custom metadata (full control)"""
    # Get existing document
    existing_document = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
    if not existing_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Store old object name for later deletion
        old_object_name = None
        try:
            old_object_name = existing_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        except Exception:
            pass
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        # Create folder structure: order_documents/order_id/filename
        object_name = f"order_documents/{existing_document.order_id}/{unique_filename}"
        
        # Read new file content
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)
        
        # Upload new file to MinIO
        new_document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=file.content_type
        )
        
        # Update database record with custom metadata
        existing_document.document_name = file.filename
        existing_document.document_url = new_document_url
        existing_document.document_type = document_type or file.content_type
        existing_document.document_version = document_version
        
        db.commit()
        db.refresh(existing_document)
        
        # Only delete old file after successful database commit
        if old_object_name:
            try:
                minio_client.delete_file(old_object_name)
            except Exception as e:
                print(f"Warning: Failed to delete old file from MinIO: {str(e)}")
        
        return existing_document
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to replace document: {str(e)}")

@router.get("/", response_model=List[OrderDocumentResponse])
def get_order_documents(user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all order documents. Filter by user_id (uploader) for module-specific views."""
    query = db.query(OrderDocument).order_by(OrderDocument.id.asc())
    if user_id is not None:
        query = query.filter(OrderDocument.user_id == user_id)
    return query.all()


@router.get("/{document_id}/preview")
async def preview_order_document(document_id: int, db: Session = Depends(get_db)):
    """Preview an order document file from MinIO (inline display)"""
    # Get document from database
    document = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Extract object key from URL
        object_key = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        
        # Download from MinIO
        file_data = minio_client.download_file(object_key)
        
        # Use detected content type or fallback
        content_type = document.document_type or "application/octet-stream"
        filename = document.document_name
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_type,
            headers={
                "Content-Disposition": f"inline; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to preview document: {str(e)}")


@router.get("/{document_id}/download")
async def download_order_document(document_id: int, db: Session = Depends(get_db)):
    """Download an order document file from MinIO"""
    # Get document from database
    document = db.query(OrderDocument).filter(OrderDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Extract object key from URL
        object_key = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        
        # Download from MinIO
        file_data = minio_client.download_file(object_key)
        
        # Use detected content type or fallback
        content_type = document.document_type or "application/octet-stream"
        filename = document.document_name
        
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download document: {str(e)}")


@router.get("/order/{order_id}", response_model=List[OrderDocumentResponse])
def get_documents_by_order(order_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all documents for a specific order. Filter by user_id (uploader) for module-specific views."""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    query = db.query(OrderDocument).filter(OrderDocument.order_id == order_id)
    if user_id is not None:
        query = query.filter(OrderDocument.user_id == user_id)
    return query.all()
