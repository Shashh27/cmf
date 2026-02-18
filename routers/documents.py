from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io
import mimetypes

from DB.database import get_db
from DB.models.oms import Document as DocumentModel
from DB.schemas.oms import Document, DocumentUpdate
from DB.minio_client import get_minio_client
from .step_converter import StepConverter

router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.csv', '.xlsx', '.doc', '.xls', '.txt', '.stl', '.step', '.stp', '.png', '.jpg', '.jpeg', '.gif', '.svg'}


def get_file_extension(filename: str) -> str:
    """Extract file extension from filename"""
    return os.path.splitext(filename)[1].lower()


def is_allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return get_file_extension(filename) in ALLOWED_EXTENSIONS


def detect_file_type_from_content(file_content: bytes, filename: str | None = None) -> str:
    """Detect file type from file content (magic bytes)"""
    if not file_content:
        return 'application/octet-stream'
    
    # PDF files start with %PDF-
    if file_content.startswith(b'%PDF-'):
        return 'application/pdf'
    
    # PNG files start with PNG signature
    if file_content.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    
    # JPEG files start with FF D8 FF
    if file_content.startswith(b'\xFF\xD8\xFF'):
        return 'image/jpeg'
    
    # GIF files start with GIF87a or GIF89a
    if file_content.startswith(b'GIF87a') or file_content.startswith(b'GIF89a'):
        return 'image/gif'
    
    # BMP files start with BM
    if file_content.startswith(b'BM'):
        return 'image/bmp'
    
    # SVG files start with <svg
    if file_content.startswith(b'<svg') or b'<svg' in file_content[:100]:
        return 'image/svg+xml'
    
    # WebP files start with RIFF....WEBP
    if (file_content.startswith(b'RIFF') and 
        len(file_content) > 12 and 
        file_content[8:12] == b'WEBP'):
        return 'image/webp'
    
    # DOCX files are ZIP archives with specific structure
    if (file_content.startswith(b'PK\x03\x04') and 
        b'word/' in file_content[:1000]):
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    
    # DOC files start with D0 CF 11 E0 (OLE header)
    if file_content.startswith(b'\xD0\xCF\x11\xE0'):
        return 'application/msword'
    
    # XLSX files are ZIP archives with specific structure
    if (file_content.startswith(b'PK\x03\x04') and 
        b'xl/' in file_content[:1000]):
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    
    # XLS files start with D0 CF 11 E0 (OLE header) but different from DOC
    if (file_content.startswith(b'\xD0\xCF\x11\xE0') and 
        b'Workbook' in file_content[:2000]):
        return 'application/vnd.ms-excel'
    
    # CSV files - check if content looks like comma-separated values
    try:
        text_content = file_content[:1000].decode('utf-8')
        lines = text_content.split('\n')
        if len(lines) > 1 and ',' in lines[0]:
            return 'text/csv'
    except UnicodeDecodeError:
        pass
    
    # TXT files - check if content is plain text
    try:
        file_content[:1000].decode('utf-8')
        return 'text/plain'
    except UnicodeDecodeError:
        pass

    if filename:
        ext = get_file_extension(filename)
        if ext == '.stl':
            return 'application/sla'
        if ext in ['.step', '.stp']:
            return 'application/step'

    return 'application/octet-stream'


def get_content_type_from_detection(file_content: bytes, filename: str = None) -> str:
    """Get content type by detecting from file content first, then fallback to extension"""
    detected_type = detect_file_type_from_content(file_content, filename)
    if detected_type != 'application/octet-stream':
        return detected_type
    
    # Fallback to extension-based detection
    if filename:
        return get_content_type(filename)
    
    return 'application/octet-stream'


def get_file_type_category(content_type: str) -> str:
    """Get file type category (pdf, image, document, spreadsheet, text, other)"""
    if content_type == 'application/pdf':
        return 'pdf'
    elif content_type.startswith('image/'):
        return 'image'
    elif content_type in ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']:
        return 'document'
    elif content_type in ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']:
        return 'spreadsheet'
    elif content_type == 'text/plain':
        return 'text'
    else:
        return 'other'


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
        '.txt': 'text/plain',
        '.stl': 'application/sla',
        '.step': 'application/step',
        '.stp': 'application/step',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml'
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

        # Determine content type using content detection first
        content_type = get_content_type_from_detection(file_content, file.filename)

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


@router.get("/{document_id}/preview")
async def preview_document(document_id: int, db: Session = Depends(get_db)):
    """Preview document file from MinIO (inline display)"""
    from fastapi.responses import StreamingResponse

    # Get document from database
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    try:
        # Extract object name and extension from URL
        # URL format: http://172.18.7.91:9000/cmf/documents/part_1/...
        minio_client = get_minio_client()
        object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        file_extension = get_file_extension(object_name)

        # Download from MinIO
        file_data = minio_client.download_file(object_name)

        # Determine content type using content detection first
        detected_content_type = get_content_type_from_detection(file_data, object_name)
        filename = f"{document.document_name}{file_extension}"

        # Return file as streaming response for inline preview
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=detected_content_type,
            headers={
                "Content-Disposition": f"inline; filename={filename}"
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview document: {str(e)}"
        )


@router.get("/{document_id}/3d")
async def preview_document_3d(document_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import StreamingResponse

    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    try:
        minio_client = get_minio_client()
        object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        file_extension = get_file_extension(object_name)

        file_data = minio_client.download_file(object_name)

        if file_extension in [".step", ".stp"]:
            glb_data = StepConverter.convert_step_to_glb(file_data)
        elif file_extension == ".stl":
            glb_data = StepConverter.convert_stl_to_glb(file_data)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="3D preview is only available for STEP/STL files"
            )

        if not glb_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to convert 3D model to GLB"
            )

        filename = f"{document.document_name}.glb"

        return StreamingResponse(
            io.BytesIO(glb_data),
            media_type="model/gltf-binary",
            headers={
                "Content-Disposition": f"inline; filename={filename}"
            }
        )

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate 3D preview: {str(e)}"
        )


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
        # Extract object name and extension from URL
        # URL format: http://172.18.7.91:9000/cmf/documents/part_1/...
        minio_client = get_minio_client()
        object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        file_extension = get_file_extension(object_name)

        # Download from MinIO
        file_data = minio_client.download_file(object_name)

        # Determine content type using content detection first
        detected_content_type = get_content_type_from_detection(file_data, object_name)
        filename = f"{document.document_name}{file_extension}"

        # Return file as streaming response
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=detected_content_type,
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
