from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import os
import uuid
from datetime import datetime
import io
import mimetypes

from DB.database import get_db, SessionLocal
from DB.models.oms import Document as DocumentModel, DocumentExtractedData as DocumentExtractedDataModel, Part, Order
from DB.models.access_control import AccessUser
from DB.models.notifications import MCNotification
from DB.schemas.oms import Document, DocumentUpdate, ExtractedDataUpdate
from DB.minio_client import get_minio_client
from .step_converter import StepConverter
from .rawmaterial_extract import extract_pdf_data
from services.notification_service import NotificationService
from DB.models.oms import Assembly as AssemblyModel
from auth.deps import get_current_user


router = APIRouter(
    prefix="/documents",
    tags=["documents"]
)


def _check_assembly_recycle_bin_recursive(assembly_id: int, db: Session) -> Optional[str]:
    """
    Check if the assembly or any of its parent assemblies are in the recycle bin.
    Returns the name of the first assembly found in recycle bin, or None if none are.
    """
    current_assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not current_assembly:
        return None
    
    # Check current assembly
    if current_assembly.recycle_bin:
        return current_assembly.assembly_name
    
    # Recursively check parent
    if current_assembly.parent_id:
        return _check_assembly_recycle_bin_recursive(current_assembly.parent_id, db)
    
    return None

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


def _extract_pdf_background(extraction_jobs):
    """
    Background task to extract data from PDFs and save to DB.
    Each job is a dict with: document_id, part_id, file_content, effective_type, file_extension
    """
    db = SessionLocal()
    try:
        for job in extraction_jobs:
            part_id = job["part_id"]
            file_extension = job["file_extension"]
            effective_type = job["effective_type"]
            file_content = job["file_content"]
            document_id = job["document_id"]

            if (
                part_id is not None
                and file_extension.lower() == '.pdf'
                and str(effective_type).lower() in ['2d', '2d drawing', 'drawing']
            ):
                try:
                    extracted = extract_pdf_data(file_content)
                    if extracted:
                        db.add(DocumentExtractedDataModel(
                            document_id=document_id,
                            part_id=part_id,
                            note=extracted.get("Note"),
                            title=extracted.get("Title"),
                            stock_size=extracted.get("Stock Size"),
                            material=extracted.get("Material"),
                            stocksize_kg=extracted.get("Stocksize KG"),
                            net_wt_kg=extracted.get("Net WT KG"),
                        ))
                except Exception as extract_error:
                    print(f"Error extracting data from PDF: {str(extract_error)}")
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Background PDF extraction failed: {str(e)}")
    finally:
        db.close()


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
        background_tasks: BackgroundTasks = None,
        db: Session = Depends(get_db),
        current_user: AccessUser = Depends(get_current_user),
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
    user_id = current_user.id

    # Ensure at least one of part_id or assembly_id is provided
    if part_id is None and assembly_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either part_id or assembly_id must be provided"
        )

    # Check if assembly or any parent assembly is in recycle bin - only for assembly documents
    if assembly_id:
        recycle_bin_assembly = _check_assembly_recycle_bin_recursive(assembly_id, db)
        if recycle_bin_assembly:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sorry, documents cannot be added because the assembly '{recycle_bin_assembly}' (or a parent assembly) is in the recycle bin. To add documents, please restore the assembly from the recycle bin first."
            )

    # Check if part is scheduled (status is "active") - only for part documents
    if part_id:
        schedule_status = db.execute(
            text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": part_id}
        ).fetchone()
        
        if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sorry, this document cannot be uploaded/modified/deleted because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
            )

    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Check for duplicate revision within the same document group
    processed_parent_id = None if parent_id in (0, None) else parent_id
    if processed_parent_id:
        # Check if the parent or any of its siblings have the same version
        existing_version = db.query(DocumentModel).filter(
            (DocumentModel.id == processed_parent_id) | (DocumentModel.parent_id == processed_parent_id),
            DocumentModel.document_version == document_version
        ).first()
        
        if existing_version:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Revision {document_version} already exists for this document."
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

        # Generate unique object name with timestamp and UUID for descriptive safety
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/{owner_prefix}_{owner_id}/{timestamp}_{unique_id}_{file.filename}"

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
            user_id=user_id,
            is_acknowledged=False
        )

        db.add(db_document)
        db.commit()
        db.refresh(db_document)

        # Log document creation for PC notifications
        user_name = None
        user_role = None
        if user_id:
            user = db.query(AccessUser).filter(AccessUser.id == user_id).first()
            user_name = user.user_name if user else None
            user_role = user.role if user else None
        
        NotificationService.log_document_change(
            db=db,
            document_id=db_document.id,
            action="created",
            user_id=user_id,
            user_name=user_name,
            user_role=user_role,
            details={"document_name": db_document.document_name, "document_type": db_document.document_type}
        )

        # Create MC notification if uploaded by PC for a part document
        if part_id and user_role and 'project_coordinator' in user_role.lower():
            # Get the part to find the order
            part = db.query(Part).filter(Part.id == part_id).first()
            if part and part.product_id:
                # Get the order for this product
                order = db.query(Order).filter(Order.product_id == part.product_id).first()
                if order and order.manufacturing_coordinator_id:
                    # Create MC notification for all PC uploads (first document and revisions)
                    mc_notification = MCNotification(
                        document_id=db_document.id,
                        mc_user_id=order.manufacturing_coordinator_id,
                        is_acknowledged=False,
                        is_rejected=False
                    )
                    db.add(mc_notification)
                    db.commit()
                    print(f"MC notification created for document {db_document.id} for MC user {order.manufacturing_coordinator_id}")
                else:
                    print(f"MC notification NOT created: order={order.id if order else None}, mc_id={order.manufacturing_coordinator_id if order else None}")
            else:
                print(f"MC notification NOT created: part={part.id if part else None}, product_id={part.product_id if part else None}")
        else:
            print(f"MC notification NOT created: part_id={part_id}, user_role={user_role}")

        # Extract data from PDF if applicable (2D files) - currently only for part documents
        if (
            part_id is not None
            and file_extension.lower() == '.pdf'
            and document_type.lower() in ['2d', '2d drawing', 'drawing']
        ):
            background_tasks.add_task(
                _extract_pdf_background,
                [{
                    "document_id": db_document.id,
                    "part_id": part_id,
                    "file_content": file_content,
                    "effective_type": document_type,
                    "file_extension": file_extension,
                }]
            )

        return db_document

    except HTTPException:
        # Re-raise HTTPException as-is (includes our active status check)
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )


@router.post("/bulk", response_model=List[Document], status_code=status.HTTP_201_CREATED)
async def create_documents_bulk(
        files: List[UploadFile] = File(...),
        document_name: List[str] = Form([]),
        document_type: List[str] = Form([]),
        document_version: List[str] = Form([]),
        parent_id: List[Optional[int]] = Form([]),
        part_id: Optional[int] = Form(None),
        assembly_id: Optional[int] = Form(None),
        user_id: Optional[int] = Form(None),
        background_tasks: BackgroundTasks = None,
        db: Session = Depends(get_db),
        current_user: AccessUser = Depends(get_current_user),
):
    """
    Bulk create documents with file upload to MinIO (multipart/form-data).

    Send repeated form fields (same key multiple times) to build lists:
    - files: <file1>, <file2>, ...
    - document_name: <name1>, <name2>, ...
    - document_type: <type1>, <type2>, ...
    - document_version: <ver1>, <ver2>, ...
    - parent_id: <pid1>, <pid2>, ... (optional per file)
    """
    user_id = current_user.id

    # Ensure at least one of part_id or assembly_id is provided
    if part_id is None and assembly_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either part_id or assembly_id must be provided"
        )

    # Check if assembly or any parent assembly is in recycle bin - only for assembly documents
    if assembly_id:
        recycle_bin_assembly = _check_assembly_recycle_bin_recursive(assembly_id, db)
        if recycle_bin_assembly:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sorry, documents cannot be added because the assembly '{recycle_bin_assembly}' (or a parent assembly) is in the recycle bin. To add documents, please restore the assembly from the recycle bin first."
            )

    # Check if part is scheduled (status is "active") - only for part documents
    if part_id:
        schedule_status = db.execute(
            text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": part_id}
        ).fetchone()
        
        if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sorry, this document cannot be uploaded/modified/deleted because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
            )

    if not files:
        return []

    # Validate file extensions
    for f in files:
        if not is_allowed_file(f.filename):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )

    minio_client = get_minio_client()

    # Determine owning entity (part or assembly) for storage path
    owner_prefix = "part"
    owner_id = part_id
    if part_id is None and assembly_id is not None:
        owner_prefix = "assembly"
        owner_id = assembly_id

    created_docs: List[DocumentModel] = []
    extraction_jobs = []

    try:
        for idx, file in enumerate(files):
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            unique_id = uuid.uuid4().hex[:8]
            file_extension = get_file_extension(file.filename)

            effective_name = None
            if idx < len(document_name) and document_name[idx]:
                effective_name = str(document_name[idx]).strip()
            if not effective_name:
                effective_name = os.path.splitext(file.filename)[0]

            effective_type = None
            if idx < len(document_type) and document_type[idx]:
                effective_type = str(document_type[idx]).strip()
            if not effective_type:
                effective_type = "Document"

            effective_version = ""
            if idx < len(document_version) and document_version[idx]:
                effective_version = str(document_version[idx]).strip()
            if not effective_version:
                # If no version provided, we'll try to use whatever the user entered or stay empty
                # Raise error if version is absolutely required by backend
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Revision is required for document '{effective_name}'."
                )

            effective_parent = None
            if idx < len(parent_id):
                pid = parent_id[idx]
                if pid not in (0, None):
                    effective_parent = pid

            # Check for duplicate revision within the same document group
            if effective_parent:
                existing_version = db.query(DocumentModel).filter(
                    (DocumentModel.id == effective_parent) | (DocumentModel.parent_id == effective_parent),
                    DocumentModel.document_version == effective_version
                ).first()
                
                if existing_version:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Revision {effective_version} already exists for document '{effective_name}'."
                    )

            object_name = f"documents/{owner_prefix}_{owner_id}/{ts}_{unique_id}_{file.filename}"

            file_content = await file.read()
            file_stream = io.BytesIO(file_content)

            content_type = get_content_type_from_detection(file_content, file.filename)

            document_url = minio_client.upload_file(
                file_data=file_stream,
                object_name=object_name,
                content_type=content_type,
                metadata={
                    'document_name': effective_name,
                    'document_type': effective_type,
                    'document_version': effective_version,
                    'part_id': str(part_id) if part_id is not None else '',
                    'assembly_id': str(assembly_id) if assembly_id is not None else '',
                    'original_filename': file.filename
                }
            )

            db_document = DocumentModel(
                document_name=effective_name,
                document_url=document_url,
                document_type=effective_type,
                document_version=effective_version,
                part_id=part_id,
                assembly_id=assembly_id,
                parent_id=effective_parent,
                user_id=user_id,
                is_acknowledged=False
            )
            db.add(db_document)
            # Ensure db_document.id is available for extracted-data insert
            db.flush()
            created_docs.append(db_document)

            # Extract data from PDF if applicable (2D files) - currently only for part documents
            if (
                part_id is not None
                and file_extension.lower() == '.pdf'
                and str(effective_type).lower() in ['2d', '2d drawing', 'drawing']
            ):
                extraction_jobs.append({
                    "document_id": db_document.id,
                    "part_id": part_id,
                    "file_content": file_content,
                    "effective_type": effective_type,
                    "file_extension": file_extension,
                })

        db.commit()
        for d in created_docs:
            db.refresh(d)

        # Create MC notifications for PC uploads in bulk
        user_name = None
        user_role = None
        if user_id:
            user = db.query(AccessUser).filter(AccessUser.id == user_id).first()
            user_name = user.user_name if user else None
            user_role = user.role if user else None
        
        if part_id and user_role and 'project_coordinator' in user_role.lower():
            # Get the part to find the order
            part = db.query(Part).filter(Part.id == part_id).first()
            if part and part.product_id:
                # Get the order for this product
                order = db.query(Order).filter(Order.product_id == part.product_id).first()
                if order and order.manufacturing_coordinator_id:
                    # Create MC notification for each document
                    for doc in created_docs:
                        mc_notification = MCNotification(
                            document_id=doc.id,
                            mc_user_id=order.manufacturing_coordinator_id,
                            is_acknowledged=False,
                            is_rejected=False
                        )
                        db.add(mc_notification)
                    db.commit()
                    print(f"MC notifications created for {len(created_docs)} documents for MC user {order.manufacturing_coordinator_id}")
                else:
                    print(f"MC notifications NOT created: order={order.id if order else None}, mc_id={order.manufacturing_coordinator_id if order else None}")
            else:
                print(f"MC notifications NOT created: part={part.id if part else None}, product_id={part.product_id if part else None}")
        else:
            print(f"MC notifications NOT created: part_id={part_id}, user_role={user_role}")

        if extraction_jobs and background_tasks:
            background_tasks.add_task(_extract_pdf_background, extraction_jobs)

        return created_docs

    except HTTPException:
        # Re-raise HTTPException as-is (includes our active status check)
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload documents: {str(e)}"
        )


@router.get("/", response_model=List[Document])
def get_documents(
    user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """Get documents for the authenticated uploader (client user_id ignored)."""
    user_id = current_user.id
    query = db.query(DocumentModel).order_by(DocumentModel.id.asc())
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
            glb_data, error_detail = StepConverter.convert_step_to_glb(file_data)
        elif file_extension == ".stl":
            glb_data, error_detail = StepConverter.convert_stl_to_glb(file_data)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="3D preview is not available for this document type (only STEP/STL supported)"
            )

        if not glb_data:
            # Clean up the error message for display (remove emoji prefixes)
            clean_error = error_detail or "No 3D geometry in file or conversion failed"
            if clean_error.startswith("❌ "):
                clean_error = clean_error[2:]  # Remove the ❌ prefix (emoji + space = 2 chars)
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=clean_error
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
def get_documents_by_part(
    part_id: int,
    user_id: int | None = None,
    acknowledged_only: bool = False,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """Get all documents for a specific part. Client user_id ignored (JWT required for auth)."""
    _ = current_user  # auth via Depends
    # Ignore client-supplied user_id for scoping (IDOR prevention); list by part only
    user_id = None
    query = db.query(DocumentModel).outerjoin(AccessUser, DocumentModel.user_id == AccessUser.id).filter(DocumentModel.part_id == part_id)
    if user_id is not None:
        query = query.filter(DocumentModel.user_id == user_id)
    
    # Filter by acknowledgment status if requested (for MC view)
    if acknowledged_only:
        query = query.filter(DocumentModel.is_acknowledged == True)
    
    # Add user_name to each document
    documents = query.all()
    
    # Get MC notification data for these documents
    document_ids = [doc.id for doc in documents]
    mc_notifications = {}
    if document_ids:
        notifications = db.query(MCNotification).filter(MCNotification.document_id.in_(document_ids)).all()
        mc_notifications = {notif.document_id: notif for notif in notifications}
    
    for doc in documents:
        if doc.user and hasattr(doc.user, 'user_name'):
            doc.user_name = doc.user.user_name
        else:
            doc.user_name = None
        
        if doc.user and hasattr(doc.user, 'role'):
            doc.user_role = doc.user.role
        else:
            doc.user_role = None
        
        # Add MC notification remarks if available
        if doc.id in mc_notifications:
            notif = mc_notifications[doc.id]
            doc.mc_ack_remarks = notif.ack_remarks
            doc.mc_reject_remarks = notif.reject_remarks
            doc.mc_is_rejected = notif.is_rejected
        else:
            doc.mc_ack_remarks = None
            doc.mc_reject_remarks = None
            doc.mc_is_rejected = False
    
    return documents


@router.get("/assembly/{assembly_id}", response_model=List[Document])
def get_documents_by_assembly(
    assembly_id: int,
    user_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """Get all documents for a specific assembly. Client user_id ignored (JWT required for auth)."""
    _ = current_user  # auth via Depends
    user_id = None
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

    # Check if assembly or any parent assembly is in recycle bin - only for assembly documents
    if db_document.assembly_id:
        recycle_bin_assembly = _check_assembly_recycle_bin_recursive(db_document.assembly_id, db)
        if recycle_bin_assembly:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sorry, this document cannot be modified because the assembly '{recycle_bin_assembly}' (or a parent assembly) is in the recycle bin. To modify documents, please restore the assembly from the recycle bin first."
            )

    # Check if part is scheduled (status is "active") - only for part documents
    if db_document.part_id:
        schedule_status = db.execute(
            text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": db_document.part_id}
        ).fetchone()
        
        if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sorry, this document cannot be uploaded/modified/deleted because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
            )

    update_data = document.model_dump(exclude_unset=True)
    
    # Capture old values before updating
    old_values = {}
    for field in update_data.keys():
        old_values[field] = getattr(db_document, field, None)
    
    for field, value in update_data.items():
        setattr(db_document, field, value)

    db.commit()
    
    # Log document update for PC notifications
    user_name = None
    user_role = None
    if db_document.user_id:
        user = db.query(AccessUser).filter(AccessUser.id == db_document.user_id).first()
        user_name = user.user_name if user else None
        user_role = user.role if user else None
    
    # Capture changes with old and new values
    changes = {}
    for field in update_data.keys():
        old_value = old_values[field]
        new_value = update_data[field]
        
        # Convert time/datetime objects to strings for JSON serialization
        if old_value is not None and hasattr(old_value, 'isoformat'):
            old_value = old_value.isoformat()
        elif hasattr(old_value, '__str__') and not isinstance(old_value, (str, int, float, bool)):
            old_value = str(old_value)
        
        if new_value is not None and hasattr(new_value, 'isoformat'):
            new_value = new_value.isoformat()
        elif hasattr(new_value, '__str__') and not isinstance(new_value, (str, int, float, bool)):
            new_value = str(new_value)
        
        changes[field] = {"old": old_value, "new": new_value}
    
    NotificationService.log_document_change(
        db=db,
        document_id=db_document.id,
        action="updated",
        user_id=db_document.user_id,
        user_name=user_name,
        user_role=user_role,
        details={"document_name": db_document.document_name, "document_type": db_document.document_type, "changes": changes}
    )
    
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

    # Check if assembly or any parent assembly is in recycle bin - only for assembly documents
    if db_document.assembly_id:
        recycle_bin_assembly = _check_assembly_recycle_bin_recursive(db_document.assembly_id, db)
        if recycle_bin_assembly:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sorry, this document cannot be modified because the assembly '{recycle_bin_assembly}' (or a parent assembly) is in the recycle bin. To modify documents, please restore the assembly from the recycle bin first."
            )

    # Check if part is scheduled (status is "active") - only for part documents
    if db_document.part_id:
        schedule_status = db.execute(
            text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": db_document.part_id}
        ).fetchone()
        
        if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sorry, this document cannot be uploaded/modified/deleted because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
            )

    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        minio_client = get_minio_client()

        # Determine owning entity (part or assembly) for storage path
        owner_prefix = "part"
        owner_id = db_document.part_id
        if db_document.part_id is None and db_document.assembly_id is not None:
            owner_prefix = "assembly"
            owner_id = db_document.assembly_id

        # Generate new object name with timestamp and UUID for descriptive safety
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_id = uuid.uuid4().hex[:8]
        file_extension = get_file_extension(file.filename)
        object_name = f"documents/{owner_prefix}_{owner_id}/{timestamp}_{unique_id}_{file.filename}"

        # Read and upload new file
        file_content = await file.read()
        file_stream = io.BytesIO(file_content)
        content_type = get_content_type(file.filename)

        # Store old object name for deletion after successful DB update
        old_object_name = None
        try:
            old_object_name = db_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        except Exception:
            pass

        # Upload new file to MinIO
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

        # Update document URL in database
        db_document.document_url = document_url
        db.commit()
        db.refresh(db_document)

        # Only delete old file after successful database commit
        if old_object_name:
            try:
                minio_client.delete_file(old_object_name)
            except Exception as e:
                print(f"Warning: Failed to delete old file from MinIO: {str(e)}")

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


@router.put("/{document_id}/acknowledge", response_model=Document)
def acknowledge_document(document_id: int, is_acknowledged: bool, db: Session = Depends(get_db)):
    """Update document acknowledgment status"""
    db_document = db.query(DocumentModel).filter(DocumentModel.id == document_id).first()
    if not db_document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )

    try:
        db_document.is_acknowledged = is_acknowledged
        db.commit()
        db.refresh(db_document)
        return db_document
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update document acknowledgment: {str(e)}"
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

    # Check if document has child documents (revisions) - prevent deletion of parent
    child_documents = db.query(DocumentModel).filter(DocumentModel.parent_id == document_id).all()
    if child_documents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sorry, this document cannot be deleted because it has child revisions. Please delete the child revisions first."
        )

    # Delete associated MC notification if exists
    mc_notification = db.query(MCNotification).filter(MCNotification.document_id == document_id).first()
    if mc_notification:
        db.delete(mc_notification)

    # Check if assembly or any parent assembly is in recycle bin - only for assembly documents
    if db_document.assembly_id:
        recycle_bin_assembly = _check_assembly_recycle_bin_recursive(db_document.assembly_id, db)
        if recycle_bin_assembly:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Sorry, this document cannot be deleted because the assembly '{recycle_bin_assembly}' (or a parent assembly) is in the recycle bin. To delete documents, please restore the assembly from the recycle bin first."
            )

    # Check if part is scheduled (status is "active") - only for part documents
    if db_document.part_id:
        schedule_status = db.execute(
            text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": db_document.part_id}
        ).fetchone()
        
        if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sorry, this document cannot be uploaded/modified/deleted because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
            )

    # Log document deletion for PC notifications before deletion
    user_name = None
    user_role = None
    if db_document.user_id:
        user = db.query(AccessUser).filter(AccessUser.id == db_document.user_id).first()
        user_name = user.user_name if user else None
        user_role = user.role if user else None
    
    NotificationService.log_document_change(
        db=db,
        document_id=db_document.id,
        action="deleted",
        user_id=db_document.user_id,
        user_name=user_name,
        user_role=user_role,
        details={"document_name": db_document.document_name, "document_type": db_document.document_type}
    )

    try:
        # Get object name before deleting from database
        minio_client = get_minio_client()
        object_name = None
        try:
            object_name = db_document.document_url.split(f"/{minio_client.bucket_name}/")[1]
        except Exception:
            pass

        # Delete extracted data if exists
        db.query(DocumentExtractedDataModel).filter(
            DocumentExtractedDataModel.document_id == document_id
        ).delete()

        # Delete from database first
        db.delete(db_document)
        db.commit()

        # Only delete from MinIO after successful database commit
        if object_name:
            try:
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete file from MinIO: {str(e)}")

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


@router.put("/extracted-data/{extracted_id}")
def update_extracted_data(
    extracted_id: int,
    update_data: ExtractedDataUpdate,
    db: Session = Depends(get_db)
):
    """Update extracted data for a specific entry"""
    
    # Get the existing extracted data entry
    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == extracted_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )
    
    # Update fields if provided
    if update_data.material is not None:
        extracted_entry.material = update_data.material
    if update_data.stock_size is not None:
        extracted_entry.stock_size = update_data.stock_size
    if update_data.stocksize_kg is not None:
        extracted_entry.stocksize_kg = update_data.stocksize_kg
    if update_data.net_wt_kg is not None:
        extracted_entry.net_wt_kg = update_data.net_wt_kg
    if update_data.note is not None:
        extracted_entry.note = update_data.note
    if update_data.title is not None:
        extracted_entry.title = update_data.title
    
    # Update timestamp
    extracted_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(extracted_entry)
        
        # Return the updated entry with document details
        document = db.query(DocumentModel).filter(
            DocumentModel.id == extracted_entry.document_id
        ).first()
        
        return {
            "id": extracted_entry.id,
            "document_id": extracted_entry.document_id,
            "part_id": extracted_entry.part_id,
            "note": extracted_entry.note,
            "title": extracted_entry.title,
            "stock_size": extracted_entry.stock_size,
            "material": extracted_entry.material,
            "stocksize_kg": extracted_entry.stocksize_kg,
            "net_wt_kg": extracted_entry.net_wt_kg,
            "created_at": extracted_entry.created_at.isoformat() if extracted_entry.created_at else None,
            "updated_at": extracted_entry.updated_at.isoformat() if extracted_entry.updated_at else None,
            "document_name": document.document_name if document else "N/A",
            "document_version": document.document_version if document else "N/A",
            "document_type": document.document_type if document else "N/A"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update extracted data: {str(e)}"
        )
