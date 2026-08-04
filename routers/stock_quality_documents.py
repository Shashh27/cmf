from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import io

from DB.database import get_db
from DB.models.access_control import AccessUser
from DB.models.inventory import StockQualityDocument as StockQualityDocumentModel
from auth.deps import get_current_user
from DB.schemas.inventory import (
    StockQualityDocument,
    StockQualityDocumentCreate,
    StockQualityDocumentUpdate,
    StockQualityDocumentWithVersions,
    StockQualityDocumentVersionResponse
)
from services.stock_quality_document_service import StockQualityDocumentService
from routers.documents import get_content_type_from_detection, is_allowed_file


router = APIRouter(
    prefix="/stock-quality-documents",
    tags=["stock-quality-documents"]
)


@router.post("/upload", response_model=StockQualityDocument)
async def upload_quality_document(
    stock_id: int = Form(...),
    file: UploadFile = File(...),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Upload a quality document for a stock item
    
    - stock_id: ID of the stock item
    - file: The file to upload
    - user_id: Legacy optional field; identity is taken from JWT
    """
    user_id = current_user.id
    # Validate file
    if not is_allowed_file(file.filename):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: .pdf, .docx, .csv, .xlsx, .doc, .xls, .txt, .png, .jpg, .jpeg, .gif, .svg"
        )
    
    # Read file content
    file_content = await file.read()
    
    # Detect content type
    content_type = get_content_type_from_detection(file_content, file.filename)
    
    try:
        document = StockQualityDocumentService.upload_document(
            db=db,
            stock_id=stock_id,
            file_name=file.filename,
            file_content=file_content,
            content_type=content_type,
            user_id=user_id
        )
        return document
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error uploading document: {str(e)}"
        )


@router.post("/upload-bulk", response_model=List[StockQualityDocument])
async def upload_quality_documents_bulk(
    stock_id: int = Form(...),
    files: List[UploadFile] = File(...),
    user_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Upload multiple quality documents for a stock item in a single request
    
    - stock_id: ID of the stock item
    - files: List of files to upload
    - user_id: Legacy optional field; identity is taken from JWT
    """
    user_id = current_user.id
    uploaded_documents = []
    failed_files = []
    
    for file in files:
        # Validate file
        if not is_allowed_file(file.filename):
            failed_files.append(f"{file.filename}: File type not allowed")
            continue
        
        try:
            # Read file content
            file_content = await file.read()
            
            # Detect content type
            content_type = get_content_type_from_detection(file_content, file.filename)
            
            # Upload document
            document = StockQualityDocumentService.upload_document(
                db=db,
                stock_id=stock_id,
                file_name=file.filename,
                file_content=file_content,
                content_type=content_type,
                user_id=user_id
            )
            uploaded_documents.append(document)
            
        except ValueError as e:
            failed_files.append(f"{file.filename}: {str(e)}")
        except Exception as e:
            failed_files.append(f"{file.filename}: {str(e)}")
    
    if failed_files:
        raise HTTPException(
            status_code=status.HTTP_207_MULTI_STATUS,
            detail={
                "uploaded": len(uploaded_documents),
                "failed": len(failed_files),
                "failed_files": failed_files,
                "documents": uploaded_documents
            }
        )
    
    return uploaded_documents


@router.get("/stock/{stock_id}", response_model=List[StockQualityDocument])
def get_documents_by_stock(
    stock_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Get all quality documents for a stock item
    
    - stock_id: ID of the stock item
    """
    documents = StockQualityDocumentService.get_documents_by_stock(db, stock_id)
    return documents


@router.get("/{document_id}", response_model=StockQualityDocumentWithVersions)
def get_document_with_versions(
    document_id: int,
    db: Session = Depends(get_db)
):
    """
    Get a document with all its versions
    
    - document_id: ID of the document
    """
    document = StockQualityDocumentService.get_document_with_versions(db, document_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    return document


@router.get("/stock/{stock_id}/latest", response_model=Optional[StockQualityDocument])
def get_latest_document(
    stock_id: int,
    db: Session = Depends(get_db)
):
    """
    Get the latest version of a document for a stock item
    
    - stock_id: ID of the stock item
    """
    document = StockQualityDocumentService.get_latest_document(db, stock_id)
    return document


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: AccessUser = Depends(get_current_user),
):
    """
    Delete a quality document
    
    - document_id: ID of the document to delete
    """
    try:
        success = StockQualityDocumentService.delete_document(db, document_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        return {"message": "Document deleted successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{document_id}", response_model=StockQualityDocument)
def update_document(
    document_id: int,
    update_data: StockQualityDocumentUpdate,
    db: Session = Depends(get_db)
):
    """
    Update document metadata
    
    - document_id: ID of the document to update
    """
    document = StockQualityDocumentService.update_document(db, document_id, update_data)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
        )
    return document


@router.get("/{document_id}/versions", response_model=List[StockQualityDocumentVersionResponse])
def get_document_versions(
    document_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all versions of a document
    
    - document_id: ID of the document
    """
    document = StockQualityDocumentService.get_document_with_versions(db, document_id)
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found"
    )
    
    # Return all versions including the current one
    versions = []
    current = document
    while current:
        versions.append(StockQualityDocumentVersionResponse(
            id=current.id,
            document_name=current.document_name,
            document_url=current.document_url,
            version=current.version,
            created_at=current.created_at,
            parent_id=current.parent_id
        ))
        current = current.parent
    
    return versions
