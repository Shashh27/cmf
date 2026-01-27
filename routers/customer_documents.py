from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from DB.database import get_db, MINIO_BUCKET_NAME
from DB.models import CustomerDocument, Order
from DB.minio_client import get_minio_client
from DB.schemas import CustomerDocument as CustomerDocumentResponse, CustomerDocumentCreate, CustomerDocumentUpdate
from pydantic import BaseModel
import uuid
import os
from datetime import datetime, timedelta
import io

router = APIRouter(prefix="/customer-documents", tags=["customer-documents"])

# CRUD operations
@router.post("/upload/{order_id}", response_model=CustomerDocumentResponse)
async def upload_customer_document(
    order_id: int,
    file: UploadFile = File(...),
    document_type: str = "",
    document_version: str = "1.0",
    db: Session = Depends(get_db)
):
    """Upload a customer document to MinIO"""
    # Check if order exists
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Generate unique filename
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    
    # Create folder structure: customer_documents/order_id/filename
    object_name = f"customer_documents/{order_id}/{unique_filename}"
    
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
        
        # Save to database
        db_document = CustomerDocument(
            order_id=order_id,
            document_name=file.filename,
            document_url=document_url,
            document_type=document_type or file.content_type,
            document_version=document_version
        )
        
        db.add(db_document)
        db.commit()
        db.refresh(db_document)
        
        return db_document
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to upload document: {str(e)}")

@router.put("/replace/{document_id}", response_model=CustomerDocumentResponse)
async def replace_customer_document(
    document_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Replace an existing customer document with a new file (only document_id and file required)"""
    # Get existing document
    existing_document = db.query(CustomerDocument).filter(CustomerDocument.id == document_id).first()
    if not existing_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Delete old file from MinIO
        old_object_name = existing_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        try:
            minio_client.delete_file(old_object_name)
        except Exception as e:
            print(f"Warning: Failed to delete old file from MinIO: {str(e)}")
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        # Create folder structure: customer_documents/order_id/filename
        object_name = f"customer_documents/{existing_document.order_id}/{unique_filename}"
        
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
        # Keep existing document_version unchanged
        
        db.commit()
        db.refresh(existing_document)
        
        return existing_document
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to replace document: {str(e)}")

@router.put("/replace-with-metadata/{document_id}", response_model=CustomerDocumentResponse)
async def replace_customer_document_with_metadata(
    document_id: int,
    file: UploadFile = File(...),
    document_type: str = "",
    document_version: str = "1.0",
    db: Session = Depends(get_db)
):
    """Replace an existing customer document with custom metadata (full control)"""
    # Get existing document
    existing_document = db.query(CustomerDocument).filter(CustomerDocument.id == document_id).first()
    if not existing_document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Delete old file from MinIO
        old_object_name = existing_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        try:
            minio_client.delete_file(old_object_name)
        except Exception as e:
            print(f"Warning: Failed to delete old file from MinIO: {str(e)}")
        
        # Generate unique filename
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        
        # Create folder structure: customer_documents/order_id/filename
        object_name = f"customer_documents/{existing_document.order_id}/{unique_filename}"
        
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
        
        return existing_document
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to replace document: {str(e)}")

@router.get("/", response_model=List[CustomerDocumentResponse])
def get_customer_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all customer documents"""
    documents = db.query(CustomerDocument).offset(skip).limit(limit).all()
    return documents

@router.get("/order/{order_id}", response_model=List[CustomerDocumentResponse])
def get_documents_by_order(order_id: int, db: Session = Depends(get_db)):
    """Get all documents for a specific order"""
    # Check if order exists
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    documents = db.query(CustomerDocument).filter(CustomerDocument.order_id == order_id).all()
    return documents

@router.get("/{document_id}", response_model=CustomerDocumentResponse)
def get_customer_document(document_id: int, db: Session = Depends(get_db)):
    """Get a specific customer document by ID"""
    document = db.query(CustomerDocument).filter(CustomerDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document



@router.delete("/{document_id}")
def delete_customer_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a customer document"""
    document = db.query(CustomerDocument).filter(CustomerDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Delete from MinIO using the client wrapper
        object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        minio_client.delete_file(object_name)
    except Exception as e:
        print(f"Warning: Failed to delete file from MinIO: {str(e)}")
    
    # Delete from database
    db.delete(document)
    db.commit()
    
    return {"message": "Customer document deleted successfully"}

@router.get("/download/{document_id}")
def download_customer_document(document_id: int, db: Session = Depends(get_db)):
    """Generate download URL for a customer document"""
    document = db.query(CustomerDocument).filter(CustomerDocument.id == document_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Debug: Print the document URL to understand the format
        print(f"Document URL: {document.document_url}")
        print(f"Bucket name: {minio_client.bucket_name}")
        
        # Try different ways to extract object name
        if f"/{minio_client.bucket_name}/" in document.document_url:
            object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        elif document.document_url.startswith(f"{minio_client.bucket_name}/"):
            object_name = document.document_url.replace(f"{minio_client.bucket_name}/", "")
        else:
            # If it's just the object name, use it directly
            object_name = document.document_url
        
        print(f"Extracted object name: {object_name}")
        
        download_url = minio_client.get_presigned_url(object_name, expires=timedelta(hours=1))
        
        return {
            "download_url": download_url,
            "document_name": document.document_name,
            "document_type": document.document_type
        }
        
    except Exception as e:
        print(f"Error in download: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate download URL: {str(e)}")
