from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import os
from datetime import datetime
import io
import mimetypes

from DB.database import get_db
from DB.models.documents import MachineFolder, MachineDocument
from DB.models.configuration import Machine as MachineModel
from DB.schemas.documents import (
    MachineFolder as MachineFolderSchema,
    MachineDocument as MachineDocumentSchema,
    MachineFolderCreate,
    MachineDocumentCreate,
    MachineFolderUpdate,
    MachineDocumentUpdate,
    MachineFolderWithChildren,
    MachineDocumentWithVersions,
    MachineFolderTreeResponse,
    MachineDocumentVersionResponse,
    MachineWithFolders
)
from DB.minio_client import get_minio_client

router = APIRouter(
    prefix="/machine-documents",
    tags=["machine-documents"]
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
    latest_version = db.query(MachineDocument).filter(
        (MachineDocument.id == parent_id) | (MachineDocument.parent_id == parent_id)
    ).order_by(MachineDocument.version.desc()).first()
    
    if latest_version:
        return round(latest_version.version + 1.0, 1)
    else:
        return 2.0  # If parent exists but no versions yet, this is the first update

def build_machine_folder_tree(db: Session, parent_id: Optional[int] = None, machine_id: Optional[int] = None) -> List[MachineFolderTreeResponse]:
    """Build hierarchical tree structure for machine folders"""
    query = db.query(MachineFolder).filter(MachineFolder.parent_id == parent_id)
    
    if machine_id:
        query = query.filter(MachineFolder.machine_id == machine_id)
    
    folders = query.all()
    
    tree = []
    for folder in folders:
        # Count documents in this folder and its subfolders
        document_count = db.query(MachineDocument).filter(
            MachineDocument.machine_folder_id == folder.id
        ).count()
        
        # Recursively get children
        children = build_machine_folder_tree(db, folder.id, machine_id)
        
        # Add documents from subfolders to count
        for child in children:
            document_count += child.document_count
        
        tree.append(MachineFolderTreeResponse(
            id=folder.id,
            folder_name=folder.folder_name,
            machine_id=folder.machine_id,
            parent_id=folder.parent_id,
            children=children,
            document_count=document_count
        ))
    
    return tree

# =======================
# MACHINE FOLDER MANAGEMENT
# =======================

def format_machine_display_name(machine: MachineModel) -> str:
    """Build a display name from make/model since Machine has no machine_name column."""
    make = (machine.make or '').strip()
    model = (machine.model or '').strip()
    if make and model:
        return f"{make} {model}"
    if make:
        return make
    if model:
        return model
    machine_type = (machine.type or '').strip()
    return machine_type or f"Machine {machine.id}"

@router.get("/machines", response_model=List[MachineWithFolders])
async def get_machines_with_folders(db: Session = Depends(get_db)):
    """Get all machines with their folder structures"""
    # Get all machines from configuration schema
    machines = db.query(MachineModel).all()
    
    result = []
    for machine in machines:
        # Get folders for this machine
        machine_folders = build_machine_folder_tree(db, parent_id=None, machine_id=machine.id)
        
        result.append(MachineWithFolders(
            id=machine.id,
            machine_name=format_machine_display_name(machine),
            machine_code=getattr(machine, 'machine_code', None) or machine.type,
            folders=machine_folders
        ))
    
    return result

@router.post("/folders", response_model=MachineFolderSchema, status_code=status.HTTP_201_CREATED)
async def create_machine_folder(
    folder: MachineFolderCreate,
    db: Session = Depends(get_db)
):
    """Create a new machine folder"""
    # Validate machine exists from configuration schema
    machine = db.query(MachineModel).filter(MachineModel.id == folder.machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {folder.machine_id} not found"
        )
    
    # Validate parent folder exists if parent_id is provided
    if folder.parent_id:
        parent = db.query(MachineFolder).filter(MachineFolder.id == folder.parent_id).first()
        if not parent:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent folder with id {folder.parent_id} not found"
            )
    
    # Check if folder name already exists under the same parent and machine
    existing = db.query(MachineFolder).filter(
        MachineFolder.folder_name == folder.folder_name,
        MachineFolder.parent_id == folder.parent_id,
        MachineFolder.machine_id == folder.machine_id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder with this name already exists under the specified parent"
        )
    
    db_folder = MachineFolder(**folder.model_dump())
    db.add(db_folder)
    db.commit()
    db.refresh(db_folder)
    
    return db_folder

@router.get("/folders/tree", response_model=List[MachineFolderTreeResponse])
async def get_machine_folders_tree(db: Session = Depends(get_db)):
    """Get hierarchical tree structure of all machine folders"""
    return build_machine_folder_tree(db)

@router.get("/machines/{machine_id}/folders", response_model=List[MachineFolderTreeResponse])
async def get_machine_folders_by_machine(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """Get folders for a specific machine"""
    # Validate machine exists from configuration schema
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    return build_machine_folder_tree(db, parent_id=None, machine_id=machine_id)

@router.get("/folders/{folder_id}", response_model=MachineFolderWithChildren)
async def get_machine_folder(
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific machine folder with its children and documents"""
    folder = db.query(MachineFolder).filter(MachineFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Get child folders
    children = db.query(MachineFolder).filter(
        MachineFolder.parent_id == folder_id
    ).all()
    
    # Get documents in this folder
    documents = db.query(MachineDocument).filter(
        MachineDocument.machine_folder_id == folder_id
    ).all()
    
    return MachineFolderWithChildren(
        id=folder.id,
        folder_name=folder.folder_name,
        machine_id=folder.machine_id,
        parent_id=folder.parent_id,
        user_id=folder.user_id,
        created_at=folder.created_at,
        updated_at=folder.updated_at,
        children=children,
        machine_documents=documents
    )

@router.put("/folders/{folder_id}", response_model=MachineFolderSchema)
async def update_machine_folder(
    folder_id: int,
    folder_update: MachineFolderUpdate,
    db: Session = Depends(get_db)
):
    """Update a machine folder"""
    folder = db.query(MachineFolder).filter(MachineFolder.id == folder_id).first()
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
            parent = db.query(MachineFolder).filter(MachineFolder.id == folder_update.parent_id).first()
            if not parent:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Parent folder with id {folder_update.parent_id} not found"
                )
    
    # Check for duplicate folder name if name is being updated
    if folder_update.folder_name and folder_update.folder_name != folder.folder_name:
        existing = db.query(MachineFolder).filter(
            MachineFolder.folder_name == folder_update.folder_name,
            MachineFolder.parent_id == (folder_update.parent_id if folder_update.parent_id is not None else folder.parent_id),
            MachineFolder.id != folder_id
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
async def delete_machine_folder(
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Delete a machine folder (only if empty)"""
    folder = db.query(MachineFolder).filter(MachineFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Check if folder has children
    children = db.query(MachineFolder).filter(MachineFolder.parent_id == folder_id).count()
    if children > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete folder with subfolders. Please delete subfolders first."
        )
    
    # Check if folder has documents
    documents = db.query(MachineDocument).filter(MachineDocument.machine_folder_id == folder_id).count()
    if documents > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete folder with documents. Please delete documents first."
        )
    
    db.delete(folder)
    db.commit()

# =======================
# MACHINE DOCUMENT MANAGEMENT
# =======================

@router.post("/upload", response_model=List[MachineDocumentSchema], status_code=status.HTTP_201_CREATED)
async def upload_machine_document(
    files: List[UploadFile] = File(...),
    folder_id: Optional[int] = Form(None),
    machine_id: Optional[int] = Form(None),
    parent_id: Optional[int] = Form(None),
    document_type: Optional[str] = Form(None),
    user_id: int = Form(...),
    db: Session = Depends(get_db)
):
    """
    Upload multiple machine documents with automatic versioning
    - If parent_id is None, creates new documents with version 1.0
    - If parent_id is provided, creates new versions (auto-incremented) for each file
    - Document name is automatically extracted from each uploaded file
    - Either folder_id or machine_id must be provided (but not both)
    - document_type: 'maintenance' for maintenance docs, None for general docs
    """
    # Validate that either folder_id or machine_id is provided, but not both
    if folder_id is None and machine_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either folder_id or machine_id must be provided"
        )
    
    if folder_id is not None and machine_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot provide both folder_id and machine_id. Use one or the other."
        )
    
    # If folder_id is provided, validate folder exists
    if folder_id is not None:
        folder = db.query(MachineFolder).filter(MachineFolder.id == folder_id).first()
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Folder with id {folder_id} not found"
            )
    
    # If machine_id is provided, validate machine exists
    if machine_id is not None:
        machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
        if not machine:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Machine with id {machine_id} not found"
            )
    
    # Validate all file extensions
    for file in files:
        if not is_allowed_file(file.filename):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not allowed for {file.filename}. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
    
    uploaded_documents = []
    
    try:
        # Get MinIO client
        minio_client = get_minio_client()
        
        # Process each file
        for file in files:
            # Extract document name from uploaded file (remove extension)
            original_filename = file.filename
            document_name = os.path.splitext(original_filename)[0]  # Remove extension
            
            # Determine version and document_type
            version = get_next_version(db, parent_id)
            
            # If this is a new version (parent_id provided), inherit document_type from parent
            final_document_type = document_type
            if parent_id is not None and document_type is None:
                # Get the parent document to inherit its document_type
                parent_doc = db.query(MachineDocument).filter(MachineDocument.id == parent_id).first()
                if parent_doc:
                    final_document_type = parent_doc.document_type
            
            # Generate unique object name for MinIO
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_extension = get_file_extension(file.filename)
            
            # Use folder_id or machine_id for the path
            if folder_id is not None:
                object_name = f"machine_documents/{folder_id}/{timestamp}_{document_name}_{version}{file_extension}"
            else:
                object_name = f"machine_documents/machine_{machine_id}/{timestamp}_{document_name}_{version}{file_extension}"
            
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
                    'folder_id': str(folder_id) if folder_id else '',
                    'machine_id': str(machine_id) if machine_id else '',
                    'version': str(version),
                    'parent_id': str(parent_id) if parent_id else '',
                    'original_filename': original_filename
                }
            )
            
            # Create database record
            db_document = MachineDocument(
                document_name=document_name,
                document_url=document_url,
                version=version,
                machine_folder_id=folder_id,
                machine_id=machine_id,
                parent_id=parent_id,
                document_type=final_document_type,
                user_id=user_id
            )
            
            db.add(db_document)
            db.commit()
            db.refresh(db_document)
            
            uploaded_documents.append(db_document)
        
        return uploaded_documents
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload document: {str(e)}"
        )

@router.get("/machines/{machine_id}/maintenance-documents", response_model=List[MachineDocumentWithVersions])
async def get_machine_maintenance_documents(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """Get all maintenance documents for a specific machine with their versions"""
    # Validate machine exists from configuration schema
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    # Get all maintenance documents for this machine (document_type = 'maintenance')
    documents = db.query(MachineDocument).filter(
        MachineDocument.machine_id == machine_id,
        MachineDocument.document_type == 'maintenance'
    ).all()
    
    # Group documents by family and add versions
    result = []
    processed_families = set()
    
    for doc in documents:
        family_id = doc.parent_id or doc.id
        if family_id not in processed_families:
            # Get all versions of this document family
            versions = db.query(MachineDocument).filter(
                (MachineDocument.id == family_id) | (MachineDocument.parent_id == family_id)
            ).order_by(MachineDocument.version.desc()).all()
            
            # Use the latest version as the main document
            latest_doc = versions[0] if versions else doc
            result.append(MachineDocumentWithVersions(
                id=latest_doc.id,
                document_name=latest_doc.document_name,
                document_url=latest_doc.document_url,
                version=latest_doc.version,
                machine_folder_id=latest_doc.machine_folder_id,
                parent_id=latest_doc.parent_id,
                created_at=latest_doc.created_at,
                updated_at=latest_doc.updated_at,
                user_id=latest_doc.user_id,
                versions=versions
            ))
            
            processed_families.add(family_id)
    
    return result

@router.get("/machines/{machine_id}/general-documents", response_model=List[MachineDocumentWithVersions])
async def get_machine_general_documents(
    machine_id: int,
    db: Session = Depends(get_db)
):
    """Get all general documents (non-maintenance) for a specific machine with their versions"""
    # Validate machine exists from configuration schema
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    # Get all general documents for this machine (document_type is null)
    documents = db.query(MachineDocument).filter(
        MachineDocument.machine_id == machine_id,
        MachineDocument.document_type.is_(None)
    ).all()
    
    # Group documents by family and add versions
    result = []
    processed_families = set()
    
    for doc in documents:
        family_id = doc.parent_id or doc.id
        if family_id not in processed_families:
            # Get all versions of this document family
            versions = db.query(MachineDocument).filter(
                (MachineDocument.id == family_id) | (MachineDocument.parent_id == family_id)
            ).order_by(MachineDocument.version.desc()).all()
            
            # Use the latest version as the main document
            latest_doc = versions[0] if versions else doc
            result.append(MachineDocumentWithVersions(
                id=latest_doc.id,
                document_name=latest_doc.document_name,
                document_url=latest_doc.document_url,
                version=latest_doc.version,
                machine_folder_id=latest_doc.machine_folder_id,
                parent_id=latest_doc.parent_id,
                created_at=latest_doc.created_at,
                updated_at=latest_doc.updated_at,
                user_id=latest_doc.user_id,
                versions=versions
            ))
            
            processed_families.add(family_id)
    
    return result

@router.get("/machines/{machine_id}/documents", response_model=List[MachineDocumentWithVersions])
async def get_machine_documents(
    machine_id: int,
    document_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get documents for a specific machine with their versions, optionally filtered by document_type"""
    # Validate machine exists from configuration schema
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    
    # Build query based on document_type filter
    query = db.query(MachineDocument).filter(
        MachineDocument.machine_folder_id.is_(None),
        MachineDocument.machine_id == machine_id
    )
    
    if document_type:
        if document_type.lower() == 'general':
            # Filter for general documents (document_type is null)
            query = query.filter(MachineDocument.document_type.is_(None))
        else:
            # Filter for specific document type
            query = query.filter(MachineDocument.document_type == document_type.lower())
    
    documents = query.all()
    
    # Group documents by family and add versions
    result = []
    processed_families = set()
    
    for doc in documents:
        family_id = doc.parent_id or doc.id
        if family_id not in processed_families:
            # Get all versions of this document family
            versions = db.query(MachineDocument).filter(
                (MachineDocument.id == family_id) | (MachineDocument.parent_id == family_id)
            ).order_by(MachineDocument.version.desc()).all()
            
            # Use the latest version as the main document
            latest_doc = versions[0] if versions else doc
            result.append(MachineDocumentWithVersions(
                id=latest_doc.id,
                document_name=latest_doc.document_name,
                document_url=latest_doc.document_url,
                version=latest_doc.version,
                machine_folder_id=latest_doc.machine_folder_id,
                parent_id=latest_doc.parent_id,
                created_at=latest_doc.created_at,
                updated_at=latest_doc.updated_at,
                user_id=latest_doc.user_id,
                versions=versions
            ))
            
            processed_families.add(family_id)
    
    return result

@router.get("/folders/{folder_id}/documents", response_model=List[MachineDocumentWithVersions])
async def get_folder_documents(
    folder_id: int,
    db: Session = Depends(get_db)
):
    """Get all documents in a machine folder with their versions"""
    # Validate folder exists
    folder = db.query(MachineFolder).filter(MachineFolder.id == folder_id).first()
    if not folder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Folder with id {folder_id} not found"
        )
    
    # Get all documents in the folder
    documents = db.query(MachineDocument).filter(
        MachineDocument.machine_folder_id == folder_id
    ).all()
    
    # Group documents by family and add versions
    result = []
    processed_families = set()
    
    for doc in documents:
        family_id = doc.parent_id or doc.id
        if family_id not in processed_families:
            # Get all versions of this document family
            versions = db.query(MachineDocument).filter(
                (MachineDocument.id == family_id) | (MachineDocument.parent_id == family_id)
            ).order_by(MachineDocument.version.desc()).all()
            
            # Use the latest version as the main document
            latest_doc = versions[0] if versions else doc
            result.append(MachineDocumentWithVersions(
                id=latest_doc.id,
                document_name=latest_doc.document_name,
                document_url=latest_doc.document_url,
                version=latest_doc.version,
                machine_folder_id=latest_doc.machine_folder_id,
                parent_id=latest_doc.parent_id,
                created_at=latest_doc.created_at,
                updated_at=latest_doc.updated_at,
                user_id=latest_doc.user_id,
                versions=versions
            ))
            
            processed_families.add(family_id)
    
    return result

@router.get("/documents/{document_id}", response_model=MachineDocumentWithVersions)
async def get_machine_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific machine document with all its versions"""
    document = db.query(MachineDocument).filter(MachineDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Get all versions of this document family
    family_id = document.parent_id or document.id
    versions = db.query(MachineDocument).filter(
        (MachineDocument.id == family_id) | (MachineDocument.parent_id == family_id)
    ).order_by(MachineDocument.version.desc()).all()
    
    return MachineDocumentWithVersions(
        id=document.id,
        document_name=document.document_name,
        document_url=document.document_url,
        version=document.version,
        machine_folder_id=document.machine_folder_id,
        parent_id=document.parent_id,
        created_at=document.created_at,
        updated_at=document.updated_at,
        user_id=document.user_id,
        versions=versions
    )

@router.put("/documents/{document_id}", response_model=MachineDocumentSchema)
async def update_machine_document(
    document_id: int,
    document_update: MachineDocumentUpdate,
    db: Session = Depends(get_db)
):
    """Update a machine document (metadata only, not file)"""
    document = db.query(MachineDocument).filter(MachineDocument.id == document_id).first()
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with id {document_id} not found"
        )
    
    # Validate folder exists if machine_folder_id is being updated
    if document_update.machine_folder_id is not None:
        folder = db.query(MachineFolder).filter(MachineFolder.id == document_update.machine_folder_id).first()
        if not folder:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Folder with id {document_update.machine_folder_id} not found"
            )
    
    # Update document
    update_data = document_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(document, field, value)
    
    db.commit()
    db.refresh(document)
    
    return document

@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_machine_document(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Delete a machine document (specific version or all versions if root document)"""
    document = db.query(MachineDocument).filter(MachineDocument.id == document_id).first()
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
            all_versions = db.query(MachineDocument).filter(
                MachineDocument.parent_id == document_id
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
