from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io
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
def create_folder(folder: GeneralFolderCreate, db: Session = Depends(get_db)):
    """Create a new folder"""
    # Validate parent folder exists if specified
    if folder.parent_id:
        parent_folder = db.query(GeneralFolder).filter(GeneralFolder.id == folder.parent_id).first()
        if not parent_folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder with id {folder.parent_id} not found"
            )
    
    db_folder = GeneralFolder(**folder.model_dump())
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

@router.post("/upload", response_model=GeneralDocumentSchema, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    folder_id: int = Form(...),
    file_name: str = Form(...),
    parent_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    """
    Upload a new document with automatic versioning
    - If parent_id is None, creates a new document with version 1.0
    - If parent_id is provided, creates a new version (auto-incremented)
    """
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
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Determine version
        version = get_next_version(db, parent_id)
        
        # Generate unique object name for MinIO
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        object_name = f"general_documents/{folder_id}/{timestamp}_{file_name}_{version}{file_extension}"
        
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
                'file_name': file_name,
                'folder_id': str(folder_id),
                'version': str(version),
                'parent_id': str(parent_id) if parent_id else '',
                'original_filename': file.filename
            }
        )
        
        # Create database record
        db_document = GeneralDocument(
            file_name=file_name,
            url=document_url,
            version=version,
            general_folder_id=folder_id,
            parent_id=parent_id
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
        file_extension = get_file_extension(document.file_name)
        filename = f"{document.file_name}_v{document.version}{file_extension}"
        
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

@router.patch("/documents/{document_id}", response_model=GeneralDocumentSchema)
def update_document(document_id: int, document_update: dict, db: Session = Depends(get_db)):
    """Update document details (currently only file_name)"""
    document = db.query(GeneralDocument).filter(GeneralDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Update allowed fields
    if 'file_name' in document_update:
        document.file_name = document_update['file_name']
    
    # Update timestamp
    from datetime import datetime, timezone, timedelta
    IST = timezone(timedelta(hours=5, minutes=30))
    document.updated_at = datetime.now(IST)
    
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

