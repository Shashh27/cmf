from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io

from DB.database import get_db
from DB.models import Document as DocumentModel
from DB.schemas import Document, DocumentUpdate
from DB.minio_client import get_minio_client

router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.csv', '.xlsx', '.doc', '.xls', '.txt'}


def get_file_extension(filename: str) -> str:
    """Extract file extension from filename"""
    return os.path.splitext(filename)[1].lower()


def is_allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return get_file_extension(filename) in ALLOWED_EXTENSIONS


def get_content_type(filename: str) -> str:
    """Determine content type based on file extension"""
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


@router.post("/", response_model=Document, status_code=status.HTTP_201_CREATED)
async def create_document(
        file: UploadFile = File(...),
        document_name: str = Form(...),
        document_type: str = Form(...),
        document_version: str = Form(...),
        part_id: int = Form(...),
        parent_id: Optional[int] = Form(None),
        db: Session = Depends(get_db)
):
    """
    Create a new document with file upload to MinIO

    Args:
        file: File to upload (PDF, DOCX, CSV, XLSX)
        document_name: Name of the document
        document_type: Type/category of document
        document_version: Version of the document
        part_id: ID of the associated part
        parent_id: Optional parent document ID
    """
    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        # Get MinIO client
        minio_client = get_minio_client()

        # Generate unique object name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/part_{part_id}/{timestamp}_{document_name}{file_extension}"

        # Read file content
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)

        # Determine content type
        content_type = get_content_type(file.filename)

        # Upload to MinIO
        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=content_type,
            metadata={
                'document_name': document_name,
                'document_type': document_type,
                'document_version': document_version,
                'part_id': str(part_id),
                'original_filename': file.filename
            }
        )

        # Create database record
        processed_parent_id = None if parent_id in (0, None) else parent_id
        db_document = DocumentModel(
            document_name=document_name,
            document_url=document_url,
            document_type=document_type,
            document_version=document_version,
            part_id=part_id,
            parent_id=processed_parent_id
        )

        db.add(db_document)
        db.commit()
        db.refresh(db_document)

        return db_document

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )


@router.get("/", response_model=List[Document])
def get_documents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all documents with pagination"""
    documents = db.query(DocumentModel).offset(skip).limit(limit).all()
    return documents


@router.get("/{document_id}", response_model=Document)
def get_document(document_id: int, db: Session = Depends(get_db)):
    """Get a specific document by ID"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    return document


@router.get("/{document_id}/download")
async def download_document(document_id: int, db: Session = Depends(get_db)):
    """Download document file from MinIO"""
    from fastapi.responses import StreamingResponse

    # Get document from database
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    try:
        # Extract object name from URL
        # URL format: http://172.18.7.91:9000/cmf/documents/part_1/...
        minio_client = get_minio_client()
        object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]

        # Download from MinIO
        file_data = minio_client.download_file(object_name)

        # Determine content type and filename
        file_extension = get_file_extension(document.document_name)
        content_type = get_content_type(document.document_name)
        filename = f"{document.document_name}{file_extension}"

        # Return file as streaming response
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=content_type,
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download document: {str(e)}"
        )


@router.get("/part/{part_id}", response_model=List[Document])
def get_documents_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all documents for a specific part"""
    documents = db.query(DocumentModel).filter(DocumentModel.part_id == part_id).all()
    return documents


@router.get("/parent/{parent_id}", response_model=List[Document])
def get_child_documents(parent_id: int, db: Session = Depends(get_db)):
    """Get all child documents for a parent document"""
    documents = db.query(DocumentModel).filter(DocumentModel.parent_id == parent_id).all()
    return documents


@router.put("/{document_id}", response_model=Document)
def update_document(document_id: int, document: DocumentUpdate, db: Session = Depends(get_db)):
    """
    Update document metadata (not the file itself)
    To update the file, delete and create a new document
    """
    db_document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    update_data = document.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_document, field, value)

    db.commit()
    db.refresh(db_document)
    return db_document


@router.put("/{document_id}/replace-file")
async def replace_document_file(
        document_id: int,
        file: UploadFile = File(...),
        db: Session = Depends(get_db)
):
    """
    Replace the file of an existing document
    """
    # Get existing document
    db_document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        minio_client = get_minio_client()

        # Delete old file from MinIO
        old_object_name = db_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        minio_client.delete_file(old_object_name)

        # Generate new object name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/part_{db_document.part_id}/{timestamp}_{db_document.document_name}{file_extension}"

        # Read and upload new file
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)
        content_type = get_content_type(file.filename)

        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=content_type,
            metadata={
                'document_name': db_document.document_name,
                'document_type': db_document.document_type,
                'document_version': db_document.document_version,
                'part_id': str(db_document.part_id),
                'original_filename': file.filename
            }
        )

        # Update document URL
        db_document.document_url = document_url
        db.commit()
        db.refresh(db_document)

        return {
            "message": "Document file replaced successfully",
            "document": db_document
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to replace document file: {str(e)}"
        )


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a document (removes from database and MinIO)"""
    db_document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    try:
        # Delete file from MinIO
        minio_client = get_minio_client()
        object_name = db_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        minio_client.delete_file(object_name)

        # Delete from database
        db.delete(db_document)
        db.commit()

        return None

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )