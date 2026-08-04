from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import os
from datetime import datetime
import io
import hashlib
import mimetypes

from DB.database import get_db
from DB.models.documents import GeneralFolder, GeneralDocument
from DB.schemas.documents import (
    GeneralFolder as GeneralFolderSchema,
    GeneralDocument as GeneralDocumentSchema,
    GeneralFolderCreate,
    GeneralDocumentCreate,
    GeneralFolderUpdate,
    GeneralDocumentUpdate,
    GeneralFolderWithChildren,
    GeneralDocumentWithVersions,
    FolderTreeResponse,
    DocumentVersionResponse
)
from DB.minio_client import get_minio_client
from auth.deps import get_current_user
from DB.models.access_control import AccessUser

router = APIRouter(
    prefix="/general-documents",
    tags=["general-documents"]
)

# Allowed file extensions
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.csv', '.xlsx', '.doc', '.xls', '.txt', '.jpg', '.jpeg', '.png', '.gif'}

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
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif'
    }
    return content_types.get(ext, 'application/octet-stream')

def get_next_version(db: Session, parent_id: Optional[int]) -> float:
    """Get the next version number for a document"""
    if parent_id is None:
        return 1.0
    
    # Get the latest version of this document family
    latest_version = db.query(GeneralDocument).filter(
        (GeneralDocument.id == parent_id) | (GeneralDocument.parent_id == parent_id)
    ).order_by(GeneralDocument.version.desc()).first()
    
    if latest_version:
        return round(latest_version.version + 1.0, 1)
    else:
        return 2.0  # If parent exists but no versions yet, this is the first update

def build_folder_tree(db: Session, parent_id: Optional[int] = None) -> List[FolderTreeResponse]:
    """Build hierarchical folder tree structure"""
    folders = db.query(GeneralFolder).filter(
        GeneralFolder.parent_id == parent_id
    ).all()
    
    tree = []
    for folder in folders:
        # Count documents in this folder (including subfolders)
        doc_count = db.query(GeneralDocument).filter(
            GeneralDocument.general_folder_id == folder.id
        ).count()
        
        folder_node = FolderTreeResponse(
            id=folder.id,
            folder_name=folder.folder_name,
            parent_id=folder.parent_id,
            children=build_folder_tree(db, folder.id),
            document_count=doc_count
        )
        tree.append(folder_node)
    
    return tree

# =======================
# FOLDER MANAGEMENT
# =======================

@router.post("/folders", response_model=GeneralFolderSchema, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder: GeneralFolderCreate,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """Create a new folder (user_id from JWT)."""
    # Validate parent folder exists if specified
    if folder.parent_id:
        parent_folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder.parent_id).first()
        if not parent_folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder with id {folder.parent_id} not found"
            )

    payload = folder.model_dump()
    payload["user_id"] = current_user.id
    db_folder = GeneralFolder(**payload)
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    return db_folder

@router.get("/folders", response_model=List[GeneralFolderSchema])
def get_folders(db: Session = Depends(get_db)):
    """Get all folders"""
    folders = db.query(GeneralFolder).all()
    return folders

@router.get("/folders/tree", response_model=List[FolderTreeResponse])
def get_folder_tree(db: Session = Depends(get_db)):
    """Get complete folder tree structure"""
    return build_folder_tree(db)


@router.get("/folders/{folder_id}", response_model=GeneralFolderWithChildren)
def get_folder(folder_id: int, db: Session = Depends(get_db)):
    """Get a specific folder with its children and documents"""
    folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Get child folders
    children = db.query(GeneralFolder).filter(GeneralFolder.parent_id == folder_id).all()
    
    # Get documents in this folder
    documents = db.query(GeneralDocument).filter(
        GeneralDocument.general_folder_id == folder_id,
        GeneralDocument.parent_id.is_(None)  # Only get latest versions
    ).all()
    
    return GeneralFolderWithChildren(
        id=folder.id,
        folder_name=folder.folder_name,
        parent_id=folder.parent_id,
        user_id=folder.user_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        children=children,
        documents=documents
    )

@router.put("/folders/{folder_id}", response_model=GeneralFolderSchema)
def update_folder(folder_id: int, folder_update: GeneralFolderUpdate, db: Session = Depends(get_db)):
    """Update folder details"""
    db_folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_id).first()
    if not db_folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Validate new parent folder if specified
    if folder_update.parent_id and folder_update.parent_id != db_folder.parent_id:
        if folder_update.parent_id == folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder cannot be its own parent"
            )
        
        parent_folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_update.parent_id).first()
        if not parent_folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder with id {folder_update.parent_id} not found"
            )
    
    update_data = folder_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_folder, field, value)
    
    db.commit()
    db.refresh(db_folder)
    return db_folder

def has_subfolders_recursive(folder_id: int, db: Session) -> bool:
    """Check if folder has any subfolders (recursively)"""
    # Check direct children
    children = db.query(GeneralFolder).filter(GeneralFolder.parent_id == folder_id).all()
    if children:
        return True
    
    # If no direct children, no need to check further
    return False

@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    """Delete a folder (allowed if it has documents but not subfolders)"""
    folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Check if folder has any subfolders (direct children only)
    # If it has subfolders, it cannot be deleted
    if has_subfolders_recursive(folder_id, db):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete folder with subfolders. Delete subfolders first."
        )
    
    # Documents are allowed - folder can be deleted even with documents
    # The documents will be deleted along with the folder due to cascade delete
    # or we can delete them explicitly here
    
    # Delete all documents in this folder (optional, as cascade might handle this)
    documents = db.query(GeneralDocument).filter(GeneralDocument.general_folder_id == folder_id).all()
    for doc in documents:
        # Delete document file from MinIO
        try:
            from DB.minio_client import get_minio_client
            minio_client = get_minio_client()
            
            # Extract object name from URL
            object_name = doc.url.split(f"/{minio_client.bucket_name}/")[1]
            minio_client.delete_file(object_name)
        except Exception as e:
            print(f"Warning: Failed to delete document file from MinIO: {str(e)}")
        
        db.delete(doc)
    
    # Delete the folder
    db.delete(folder)
    db.commit()
    return None


# =======================
# DOCUMENT MANAGEMENT
# =======================

def build_download_filename(file_name: str, version: float) -> str:
    """Build a download filename without duplicating the extension."""
    base, ext = os.path.splitext(file_name)
    if not ext:
        return f"{file_name}_v{version}"
    return f"{base}_v{version}{ext}"

def compute_content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

def get_family_root_id(db: Session, parent_id: int) -> int:
    parent_doc = db.query(GeneralDocument).filter(GeneralDocument.id == parent_id).first()
    if not parent_doc:
        return parent_id
    return parent_doc.parent_id or parent_doc.id

def get_existing_content_hash(doc: GeneralDocument, minio_client) -> Optional[str]:
    if getattr(doc, 'content_hash', None):
        return doc.content_hash
    try:
        object_name = doc.url.split(f"/{minio_client.bucket_name}/")[1]
        existing_data = minio_client.download_file(object_name)
        return compute_content_hash(existing_data)
    except Exception:
        return None

def assert_unique_file_content(
    db: Session,
    minio_client,
    folder_id: int,
    file_content: bytes,
    parent_id: Optional[int],
) -> None:
    content_hash = compute_content_hash(file_content)

    if parent_id is None:
        folder_docs = db.query(GeneralDocument).filter(
            GeneralDocument.general_folder_id == folder_id,
        ).all()
        for doc in folder_docs:
            existing_hash = doc.content_hash or get_existing_content_hash(doc, minio_client)
            if existing_hash and existing_hash == content_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "This file already exists in this folder. "
                        "Use 'Upload New Version' to add a new revision."
                    ),
                )
        return

    root_id = get_family_root_id(db, parent_id)
    family_docs = db.query(GeneralDocument).filter(
        (GeneralDocument.id == root_id) | (GeneralDocument.parent_id == root_id),
    ).all()
    for doc in family_docs:
        existing_hash = doc.content_hash or get_existing_content_hash(doc, minio_client)
        if existing_hash and existing_hash == content_hash:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This file is identical to an existing version (v{doc.version}). "
                    "Upload a modified file for the new version."
                ),
            )

@router.post("/upload", response_model=GeneralDocumentSchema, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    folder_id: int = Form(...),
    file_name: str = Form(...),
    parent_id: Optional[int] = Form(None),
    user_id: Optional[int] = Form(None),
    document_type: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Upload a new document with automatic versioning
    - If parent_id is None, creates a new document with version 1.0
    - If parent_id is provided, creates a new version (auto-incremented)
    """
    user_id = current_user.id
    # Validate folder exists
    folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Validate file extension
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Prevent duplicate uploads in the same folder (new documents only)
    if parent_id is None:
        existing = db.query(GeneralDocument).filter(
            GeneralDocument.general_folder_id == folder_id,
            GeneralDocument.parent_id.is_(None),
            func.lower(GeneralDocument.file_name) == file.filename.lower(),
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A document with this filename already exists in this folder. "
                    "Use 'Upload New Version' to add a new revision."
                ),
            )
    else:
        parent_doc = db.query(GeneralDocument).filter(GeneralDocument.id == parent_id).first()
        if not parent_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent document with id {parent_id} not found",
            )
        if parent_doc.general_folder_id != folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent document does not belong to the selected folder",
            )
    
    try:
        minio_client = get_minio_client()

        # Read file content once for hash check and upload
        file_content = await file.read()
        assert_unique_file_content(db, minio_client, folder_id, file_content, parent_id)
        content_hash = compute_content_hash(file_content)

        # Determine version
        version = get_next_version(db, parent_id)
        
        # Generate unique object name for MinIO
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"general_documents/{folder_id}/{timestamp}_{file_name}_{version}{file_extension}"
        
        file_stream = io.BytesIO(file_content)
        
        # Determine content type
        content_type = get_content_type(file.filename)
        
        # Upload to MinIO
        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=content_type,
            metadata={
                'file_name': file_name,
                'folder_id': str(folder_id),
                'version': str(version),
                'parent_id': str(parent_id) if parent_id else '',
                'original_filename': file.filename
            }
        )
        
        # Create database record
        # Use the actual uploaded file's filename for storage, not the form file_name parameter
        # The file_name parameter is used for MinIO object naming, but file.filename is the real file name
        db_document = GeneralDocument(
            file_name=file.filename,
            url=document_url,
            version=version,
            general_folder_id=folder_id,
            parent_id=parent_id,
            user_id=user_id,
            document_type=document_type or 'General',
            content_hash=content_hash,
        )
        
        db.add(db_document)
        db.commit()
        db.refresh(db_document)
        
        return db_document
        
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )

@router.get("/documents", response_model=List[GeneralDocumentSchema])
def get_documents(db: Session = Depends(get_db)):
    """Get all documents (latest versions only)"""
    documents = db.query(GeneralDocument).filter(
        GeneralDocument.parent_id.is_(None)
    ).all()
    return documents

@router.get("/documents/{document_id}", response_model=GeneralDocumentWithVersions)
def get_document(document_id: int, db: Session = Depends(get_db)):
    """Get a specific document with all its versions"""
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Get all versions of this document
    if document.parent_id is None:
        # This is a root document, get all versions where parent_id = this document's id
        versions = db.query(GeneralDocument).filter(
            GeneralDocument.parent_id == document_id
        ).order_by(GeneralDocument.version.desc()).all()
    else:
        # This is a version, get the root and all versions
        root_doc = db.query(GeneralDocument).filter(GeneralDocument.id == document.parent_id).first()
        versions = db.query(GeneralDocument).filter(
            GeneralDocument.parent_id == document.parent_id
        ).order_by(GeneralDocument.version.desc()).all() if root_doc else []
        # Include the root document as well
        if root_doc:
            versions.insert(0, root_doc)
    
    return GeneralDocumentWithVersions(
        id=document.id,
        file_name=document.file_name,
        url=document.url,
        version=document.version,
        general_folder_id=document.general_folder_id,
        parent_id=document.parent_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        versions=versions
    )

@router.get("/folders/{folder_id}/documents", response_model=List[GeneralDocumentSchema])
def get_documents_by_folder(folder_id: int, db: Session = Depends(get_db)):
    """Get all documents in a specific folder (including all versions)"""
    # Validate folder exists
    folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Get all documents in the folder (including versions)
    documents = db.query(GeneralDocument).filter(
        GeneralDocument.general_folder_id == folder_id
    ).order_by(GeneralDocument.created_at.asc()).all()
    
    return documents

@router.get("/documents/{document_id}/versions", response_model=List[DocumentVersionResponse])
def get_document_versions(document_id: int, db: Session = Depends(get_db)):
    """Get all versions of a specific document"""
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Find the root document
    if document.parent_id is None:
        root_id = document.id
    else:
        root_id = document.parent_id
    
    # Get all versions
    versions = db.query(GeneralDocument).filter(
        (GeneralDocument.id == root_id) | (GeneralDocument.parent_id == root_id)
    ).order_by(GeneralDocument.version.asc()).all()
    
    return [
        DocumentVersionResponse(
            id=v.id,
            file_name=v.file_name,
            url=v.url,
            version=v.version,
            created_at=v.created_at,
            parent_id=v.parent_id
        ) for v in versions
    ]

@router.get("/documents/{document_id}/preview")
async def preview_document(document_id: int, db: Session = Depends(get_db)):
    """Preview document file from MinIO"""
    from fastapi.responses import StreamingResponse
    
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    try:
        # Extract object name from URL
        minio_client = get_minio_client()
        object_name = document.url.split(f"/{minio_client.bucket_name}/")[1]
        
        # Download from MinIO
        file_data = minio_client.download_file(object_name)
        
        # Return file as streaming response for preview
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=get_content_type(document.file_name)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview document: {str(e)}"
        )

@router.get("/documents/{document_id}/download")
async def download_document(document_id: int, db: Session = Depends(get_db)):
    """Download document file from MinIO"""
    from fastapi.responses import StreamingResponse
    
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    try:
        # Extract object name from URL
        minio_client = get_minio_client()
        object_name = document.url.split(f"/{minio_client.bucket_name}/")[1]
        
        # Download from MinIO
        file_data = minio_client.download_file(object_name)
        
        # Get file extension for proper filename
        filename = build_download_filename(document.file_name, document.version)
        
        # Return file as streaming response
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=get_content_type(document.file_name),
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to download document: {str(e)}"
        )

@router.put("/documents/{document_id}", response_model=GeneralDocumentSchema)
def update_document(document_id: int, document_update: GeneralDocumentUpdate, db: Session = Depends(get_db)):
    """Update document details"""
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    update_data = document_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)
    
    db.commit()
    db.refresh(document)
    return document

@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Delete a document and all its versions"""
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    try:
        minio_client = get_minio_client()
        
        if document.parent_id is None:
            # This is a root document, delete all versions
            versions = db.query(GeneralDocument).filter(
                GeneralDocument.parent_id == document_id
            ).all()
            
            # Delete all files from MinIO
            for version in versions:
                try:
                    object_name = version.url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
                except Exception as e:
                    print(f"Warning: Failed to delete file from MinIO: {str(e)}")
                db.delete(version)
            
            # Delete root document file
            try:
                object_name = document.url.split(f"/{minio_client.bucket_name}/")[1]
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete file from MinIO: {str(e)}")
        else:
            # This is a version, delete only this version
            try:
                object_name = document.url.split(f"/{minio_client.bucket_name}/")[1]
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete file from MinIO: {str(e)}")
        
        db.delete(document)
        db.commit()
        return None
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )
