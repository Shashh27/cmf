from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io
import mimetypes

from DB.database import get_db
from DB.models.documents import CommonFolder, CommonDocument
from DB.schemas.documents import (
    CommonFolder as CommonFolderSchema,
    CommonDocument as CommonDocumentSchema,
    CommonFolderCreate,
    CommonDocumentCreate,
    CommonFolderUpdate,
    CommonDocumentUpdate,
    CommonFolderWithChildren,
    CommonDocumentWithVersions,
    CommonFolderTreeResponse,
    CommonDocumentVersionResponse
)
from DB.minio_client import get_minio_client

router = APIRouter(
    prefix="/common-documents",
    tags=["common-documents"]
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
    """Get the next version number for a common document (1.0, 2.0, 3.0, ...)"""
    if parent_id is None:
        return 1.0
    
    # Get the latest version of this document family
    latest_version = db.query(CommonDocument).filter(
        (CommonDocument.id == parent_id) | (CommonDocument.parent_id == parent_id)
    ).order_by(CommonDocument.version.desc()).first()
    
    if latest_version:
        # Increment major version by 1.0, same as general and machine documents
        return round(latest_version.version + 1.0, 1)
    else:
        # If parent exists but no versions yet, this is the first update
        return 2.0

def build_common_folder_tree(db: Session, parent_id: Optional[int] = None) -> List[CommonFolderTreeResponse]:
    """Build hierarchical tree structure of common folders"""
    folders = db.query(CommonFolder).filter(CommonFolder.parent_id == parent_id).all()
    
    result = []
    for folder in folders:
        # Count documents in this folder (including subfolders)
        document_count = db.query(CommonDocument).filter(CommonDocument.folder_id == folder.id).count()
        
        # Recursively get children
        children = build_common_folder_tree(db, folder.id)
        
        # Add document count from children
        for child in children:
            document_count += child.document_count
        
        result.append(CommonFolderTreeResponse(
            id=folder.id,
            folder_name=folder.folder_name,
            parent_id=folder.parent_id,
            children=children,
            document_count=document_count
        ))
    
    return result

# =======================
# COMMON FOLDER MANAGEMENT
# =======================

@router.get("/folders/tree", response_model=List[CommonFolderTreeResponse])
async def get_common_folders_tree(db: Session = Depends(get_db)):
    """Get hierarchical tree structure of all common folders"""
    return build_common_folder_tree(db)

@router.post("/folders", response_model=CommonFolderSchema, status_code=status.HTTP_201_CREATED)
async def create_common_folder(
    folder: CommonFolderCreate,
    db: Session = Depends(get_db)
):
    """Create a new common folder"""
    # Validate parent folder exists if parent_id is provided
    if folder.parent_id:
        parent = db.query(CommonFolder).filter(CommonFolder.id == folder.parent_id).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder with id {folder.parent_id} not found"
            )
    
    # Check if folder name already exists under the same parent
    existing = db.query(CommonFolder).filter(
        CommonFolder.folder_name == folder.folder_name,
        CommonFolder.parent_id == folder.parent_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder with this name already exists under the specified parent"
        )
    
    db_folder = CommonFolder(**folder.model_dump())
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    
    return db_folder

@router.get("/folders/{folder_id}", response_model=CommonFolderWithChildren)
async def get_common_folder(
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific common folder with its children and documents"""
    folder = db.query(CommonFolder).filter(CommonFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Get child folders
    children = db.query(CommonFolder).filter(
        CommonFolder.parent_id == folder_id
    ).all()
    
    # Get documents in this folder
    documents = db.query(CommonDocument).filter(
        CommonDocument.folder_id == folder_id
    ).all()
    
    return CommonFolderWithChildren(
        id=folder.id,
        folder_name=folder.folder_name,
        parent_id=folder.parent_id,
        user_id=folder.user_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        children=children,
        documents=documents
    )

@router.put("/folders/{folder_id}", response_model=CommonFolderSchema)
async def update_common_folder(
    folder_id: int,
    folder_update: CommonFolderUpdate,
    db: Session = Depends(get_db)
):
    """Update a common folder"""
    folder = db.query(CommonFolder).filter(CommonFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Validate parent folder exists if parent_id is being updated
    if folder_update.parent_id is not None:
        if folder_update.parent_id == folder_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder cannot be its own parent"
            )
        
        if folder_update.parent_id:
            parent = db.query(CommonFolder).filter(CommonFolder.id == folder_update.parent_id).first()
            if not parent:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Parent folder with id {folder_update.parent_id} not found"
                )
    
    # Check for duplicate folder name if name is being updated
    if folder_update.folder_name and folder_update.folder_name != folder.folder_name:
        existing = db.query(CommonFolder).filter(
            CommonFolder.folder_name == folder_update.folder_name,
            CommonFolder.parent_id == (folder_update.parent_id if folder_update.parent_id is not None else folder.parent_id),
            CommonFolder.id != folder_id
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Folder with this name already exists under the specified parent"
            )
    
    # Update folder
    update_data = folder_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(folder, field, value)
    
    db.commit()
    db.refresh(folder)
    
    return folder

@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_common_folder(
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Delete a common folder (only if empty)"""
    folder = db.query(CommonFolder).filter(CommonFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Check if folder has children
    children = db.query(CommonFolder).filter(CommonFolder.parent_id == folder_id).count()
    if children > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete folder with subfolders. Please delete subfolders first."
        )
    
    # Check if folder has documents
    documents = db.query(CommonDocument).filter(CommonDocument.folder_id == folder_id).count()
    if documents > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete folder with documents. Please delete documents first."
        )
    
    db.delete(folder)
    db.commit()

# =======================
# COMMON DOCUMENT MANAGEMENT
# =======================

@router.post("/upload", response_model=CommonDocumentSchema, status_code=status.HTTP_201_CREATED)
async def upload_common_document(
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    parent_id: Optional[int] = Form(None),
    user_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload a new common document with automatic versioning
    - If folder_id is None, document is stored without a folder (root level)
    - If parent_id is None, creates a new document with version 1.0
    - If parent_id is provided, creates a new version (auto-incremented)
    """
    if folder_id is not None:
        folder = db.query(CommonFolder).filter(CommonFolder.id == folder_id).first()
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
        
        original_filename = file.filename
        document_name = os.path.splitext(original_filename)[0]  # Remove extension
        
        version = get_next_version(db, parent_id)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_extension = get_file_extension(file.filename)
        base_path = f"common_documents/{folder_id}" if folder_id is not None else "common_documents/root"
        object_name = f"{base_path}/{timestamp}_{document_name}_{version}{file_extension}"
        
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
                'folder_id': str(folder_id),
                'version': str(version),
                'parent_id': str(parent_id) if parent_id else '',
                'original_filename': original_filename
            }
        )
        
        # Create database record
        db_document = CommonDocument(
            document_name=document_name,
            document_url=document_url,
            version=version,
            folder_id=folder_id,
            parent_id=parent_id,
            user_id=user_id
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

def _get_common_documents_with_versions(
    documents: List[CommonDocument],
    db: Session
) -> List[CommonDocumentWithVersions]:
    result = []
    processed_families = set()

    for doc in documents:
        family_id = doc.parent_id or doc.id
        if family_id not in processed_families:
            versions = db.query(CommonDocument).filter(
                (CommonDocument.id == family_id) | (CommonDocument.parent_id == family_id)
            ).order_by(CommonDocument.version.desc()).all()

            latest_doc = versions[0] if versions else doc
            result.append(CommonDocumentWithVersions(
                id=latest_doc.id,
                document_name=latest_doc.document_name,
                document_url=latest_doc.document_url,
                version=latest_doc.version,
                folder_id=latest_doc.folder_id,
                parent_id=latest_doc.parent_id,
                created_at=latest_doc.created_at,
                updated_at=latest_doc.updated_at,
                user_id=latest_doc.user_id,
                versions=versions
            ))

            processed_families.add(family_id)

    return result


@router.get("/folders/{folder_id}/documents", response_model=List[CommonDocumentWithVersions])
async def get_folder_documents(
    folder_id: int,
    db: Session = Depends(get_db)
):
    folder = db.query(CommonFolder).filter(CommonFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )

    documents = db.query(CommonDocument).filter(
        CommonDocument.folder_id == folder_id
    ).all()

    return _get_common_documents_with_versions(documents, db)


@router.get("/root/documents", response_model=List[CommonDocumentWithVersions])
async def get_root_documents(
    db: Session = Depends(get_db)
):
    documents = db.query(CommonDocument).filter(CommonDocument.folder_id.is_(None)).all()
    return _get_common_documents_with_versions(documents, db)


@router.get("/all/documents", response_model=List[CommonDocumentWithVersions])
async def get_all_common_documents(
    db: Session = Depends(get_db)
):
    """Get all common documents across all folders (including root) with their versions"""
    documents = db.query(CommonDocument).all()
    return _get_common_documents_with_versions(documents, db)

@router.get("/documents/{document_id}", response_model=CommonDocumentWithVersions)
async def get_common_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific common document with all its versions"""
    document = db.query(CommonDocument).filter(CommonDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Get all versions of this document family
    family_id = document.parent_id or document.id
    versions = db.query(CommonDocument).filter(
        (CommonDocument.id == family_id) | (CommonDocument.parent_id == family_id)
    ).order_by(CommonDocument.version.desc()).all()
    
    return CommonDocumentWithVersions(
        id=document.id,
        document_name=document.document_name,
        document_url=document.document_url,
        version=document.version,
        folder_id=document.folder_id,
        parent_id=document.parent_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        user_id=document.user_id,
        versions=versions
    )

@router.put("/documents/{document_id}", response_model=CommonDocumentSchema)
async def update_common_document(
    document_id: int,
    document_update: CommonDocumentUpdate,
    db: Session = Depends(get_db)
):
    """Update a common document (metadata only, not file)"""
    document = db.query(CommonDocument).filter(CommonDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Validate folder exists if folder_id is being updated
    if document_update.folder_id is not None:
        folder = db.query(CommonFolder).filter(CommonFolder.id == document_update.folder_id).first()
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Folder with id {document_update.folder_id} not found"
            )
    
    # Update document
    update_data = document_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)
    
    db.commit()
    db.refresh(document)
    
    return document

@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_common_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Delete a common document (specific version or all versions if root document)"""
    document = db.query(CommonDocument).filter(CommonDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        if document.parent_id is None:
            # This is a root document, delete all versions
            all_versions = db.query(CommonDocument).filter(
                CommonDocument.parent_id == document_id
            ).all()
            
            # Delete all version files from MinIO
            for version_doc in all_versions:
                try:
                    if version_doc.document_url and f"/{minio_client.bucket_name}/" in version_doc.document_url:
                        object_name = version_doc.document_url.split(f"/{minio_client.bucket_name}/")[1]
                        minio_client.delete_file(object_name)
                except Exception as e:
                    print(f"Warning: Failed to delete version file from MinIO: {str(e)}")
                db.delete(version_doc)
            
            # Delete root document file from MinIO
            try:
                if document.document_url and f"/{minio_client.bucket_name}/" in document.document_url:
                    object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete root document file from MinIO: {str(e)}")
        else:
            # This is a version, delete only this version
            try:
                if document.document_url and f"/{minio_client.bucket_name}/" in document.document_url:
                    object_name = document.document_url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Warning: Failed to delete version file from MinIO: {str(e)}")
        
        # Delete the document itself
        db.delete(document)
        db.commit()
        return None
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete document: {str(e)}"
        )
