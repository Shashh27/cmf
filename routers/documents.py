from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io
import mimetypes

from DB.database import get_db
from DB.models.oms import Document as DocumentModel, DocumentExtractedData as DocumentExtractedDataModel
from DB.schemas.oms import Document, DocumentUpdate
from DB.minio_client import get_minio_client
from .step_converter import StepConverter
from .rawmaterial_extract import extract_pdf_data

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
        part_id: Optional[int] = Form(None),
        assembly_id: Optional[int] = Form(None),
        parent_id: Optional[int] = Form(None),
        user_id: Optional[int] = Form(None),
        db: Session = Depends(get_db)
):
    """
    Create a new document with file upload to MinIO
    Automatically extracts data from PDF files and stores in database

    Args:
        file: File to upload (PDF, DOCX, CSV, XLSX, images, 3D)
        document_name: Name of the document
        document_type: Type/category of document
        document_version: Version of the document
        part_id: ID of the associated part (optional)
        assembly_id: ID of the associated assembly (optional)
        parent_id: Optional parent document ID
    """
    # Ensure at least one of part_id or assembly_id is provided
    if part_id is None and assembly_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either part_id or assembly_id must be provided"
        )

    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        # Get MinIO client
        minio_client = get_minio_client()

        # Determine owning entity (part or assembly) for storage path
        owner_prefix = "part"
        owner_id = part_id
        if part_id is None and assembly_id is not None:
            owner_prefix = "assembly"
            owner_id = assembly_id

        # Generate unique object name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/{owner_prefix}_{owner_id}/{timestamp}_{document_name}{file_extension}"

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
                'part_id': str(part_id) if part_id is not None else '',
                'assembly_id': str(assembly_id) if assembly_id is not None else '',
                'original_filename': file.filename
            }
        )

        # Create database record (user_id = uploader: project_coordinator, admin, or manufacturing_coordinator)
        processed_parent_id = None if parent_id in (0, None) else parent_id
        db_document = DocumentModel(
            document_name=document_name,
            document_url=document_url,
            document_type=document_type,
            document_version=document_version,
            part_id=part_id,
            assembly_id=assembly_id,
            parent_id=processed_parent_id,
            user_id=user_id
        )

        db.add(db_document)
        db.commit()
        db.refresh(db_document)

        # Extract data from PDF if applicable (2D files) - currently only for part documents
        if (
            part_id is not None
            and file_extension.lower() == '.pdf'
            and document_type.lower() in ['2d', '2d drawing', 'drawing']
        ):
            try:
                extracted = extract_pdf_data(file_content)
                if extracted:
                    record = DocumentExtractedDataModel(
                        document_id=db_document.id,
                        part_id=part_id,
                        note=extracted.get("Note"),
                        title=extracted.get("Title"),
                        stock_size=extracted.get("Stock Size"),
                        material=extracted.get("Material"),
                        stocksize_kg=extracted.get("Stocksize KG"),
                        net_wt_kg=extracted.get("Net WT KG"),
                    )
                    db.add(record)
                    db.commit()
            except Exception as extract_error:
                print(f"Error extracting data from PDF: {str(extract_error)}")

        return db_document

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )


@router.get("/", response_model=List[Document])
def get_documents(user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all documents. Filter by user_id (uploader) for module-specific views."""
    query = db.query(DocumentModel).order_by(DocumentModel.id.asc())
    if user_id is not None:
        query = query.filter(DocumentModel.user_id == user_id)
    return query.all()


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

        error_detail = None

        if file_extension in [".step", ".stp"]:
            glb_data = StepConverter.convert_step_to_glb(file_data)
            error_detail = "STEP file contains no 3D geometry (empty mesh) or cannot be converted"
        elif file_extension == ".stl":
            glb_data = StepConverter.convert_stl_to_glb(file_data)
            error_detail = "STL file is empty or invalid (empty mesh)"
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="3D preview is not available for this document type (only STEP/STL supported)"
            )

        if not glb_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=error_detail or "No 3D geometry in file or conversion failed"
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
def get_documents_by_part(part_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all documents for a specific part. Filter by user_id (uploader) for module-specific views."""
    query = db.query(DocumentModel).filter(DocumentModel.part_id == part_id)
    if user_id is not None:
        query = query.filter(DocumentModel.user_id == user_id)
    return query.all()


@router.get("/assembly/{assembly_id}", response_model=List[Document])
def get_documents_by_assembly(assembly_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all documents for a specific assembly. Filter by user_id (uploader) for module-specific views."""
    query = db.query(DocumentModel).filter(DocumentModel.assembly_id == assembly_id)
    if user_id is not None:
        query = query.filter(DocumentModel.user_id == user_id)
    return query.all()


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

        # Determine owning entity (part or assembly) for storage path
        owner_prefix = "part"
        owner_id = db_document.part_id
        if db_document.part_id is None and db_document.assembly_id is not None:
            owner_prefix = "assembly"
            owner_id = db_document.assembly_id

        # Generate new object name
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/{owner_prefix}_{owner_id}/{timestamp}_{db_document.document_name}{file_extension}"

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
                'part_id': str(db_document.part_id) if db_document.part_id is not None else '',
                'assembly_id': str(db_document.assembly_id) if db_document.assembly_id is not None else '',
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

        # Delete extracted data if exists
        db.query(DocumentExtractedDataModel).filter(
            DocumentExtractedDataModel.document_id == document_id
        ).delete()

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


@router.get("/{document_id}/extracted-data")
def get_document_extracted_data(document_id: int, db: Session = Depends(get_db)):
    """Get extracted data for a specific document"""
    document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    rows = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.document_id == document_id
    ).all()

    return [
        {
            "id": r.id,
            "document_id": r.document_id,
            "part_id": r.part_id,
            "note": r.note,
            "title": r.title,
            "stock_size": r.stock_size,
            "material": r.material,
            "stocksize_kg": r.stocksize_kg,
            "net_wt_kg": r.net_wt_kg,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/part/{part_id}/extracted-data")
def get_part_extracted_data(part_id: int, db: Session = Depends(get_db)):
    """Get all extracted data for a specific part with document details"""
    results = db.query(
        DocumentExtractedDataModel,
        DocumentModel.document_name,
        DocumentModel.document_version,
        DocumentModel.document_type
    ).join(
        DocumentModel,
        DocumentExtractedDataModel.document_id == DocumentModel.id
    ).filter(
        DocumentExtractedDataModel.part_id == part_id
    ).all()
    
    # Format the response to include document details and new fields
    extracted_data = []
    for extracted, doc_name, doc_version, doc_type in results:
        extracted_data.append({
            "id": extracted.id,
            "document_id": extracted.document_id,
            "part_id": extracted.part_id,
            "note": extracted.note,
            "title": extracted.title,
            "stock_size": extracted.stock_size,
            "material": extracted.material,
            "stocksize_kg": extracted.stocksize_kg,
            "net_wt_kg": extracted.net_wt_kg,
            "created_at": extracted.created_at.isoformat() if extracted.created_at else None,
            "document_name": doc_name,
            "document_version": doc_version,
            "document_type": doc_type
        })
    
    return extracted_data
