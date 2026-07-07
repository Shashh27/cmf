"""
Stock Quality Document Service

This service handles uploading, managing, and versioning quality documents
for raw material stock items. Documents are stored in MinIO and metadata
is stored in the database with version tracking.
"""

from sqlalchemy.orm import Session
from typing import Optional, List
import io
from datetime import datetime

from DB.models.inventory import (
    StockQualityDocument as StockQualityDocumentModel,
    RawMaterialStock as RawMaterialStockModel
)
from DB.schemas.inventory import (
    StockQualityDocumentCreate,
    StockQualityDocumentUpdate
)
from DB.minio_client import get_minio_client


class StockQualityDocumentService:
    """Service for managing stock quality documents"""
    
    @staticmethod
    def upload_document(
        db: Session,
        stock_id: int,
        file_name: str,
        file_content: bytes,
        content_type: str,
        user_id: int
    ) -> StockQualityDocumentModel:
        """
        Upload a quality document for a stock item
        
        Args:
            db: Database session
            stock_id: ID of the stock item
            file_name: Name of the file
            file_content: File content as bytes
            content_type: MIME type of the file
            user_id: ID of the user uploading
            
        Returns:
            StockQualityDocumentModel: Created document record
        """
        # Verify stock exists
        stock = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.id == stock_id
        ).first()
        if not stock:
            raise ValueError(f"Stock with id {stock_id} not found")
        
        # Get latest version for this stock (if any)
        latest_doc = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        ).order_by(StockQualityDocumentModel.version.desc()).first()
        
        # Calculate new version
        if latest_doc:
            new_version = latest_doc.version + 1.0
            parent_id = latest_doc.id
        else:
            new_version = 1.0
            parent_id = None
        
        # Upload to MinIO
        minio_client = get_minio_client()
        object_name = f"stock-quality/{stock_id}/{new_version}_{file_name}"
        
        file_stream = io.BytesIO(file_content)
        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=content_type
        )
        
        # Create database record
        document = StockQualityDocumentModel(
            stock_id=stock_id,
            document_name=file_name,
            document_url=document_url,
            version=new_version,
            parent_id=parent_id,
            user_id=user_id
        )
        
        db.add(document)
        db.commit()
        db.refresh(document)
        
        return document
    
    @staticmethod
    def get_documents_by_stock(
        db: Session,
        stock_id: int
    ) -> List[StockQualityDocumentModel]:
        """
        Get all documents for a stock item
        
        Args:
            db: Database session
            stock_id: ID of the stock item
            
        Returns:
            List of StockQualityDocumentModel
        """
        documents = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        ).order_by(StockQualityDocumentModel.version.desc()).all()
        
        return documents
    
    @staticmethod
    def get_document_with_versions(
        db: Session,
        document_id: int
    ) -> Optional[StockQualityDocumentModel]:
        """
        Get a document with all its versions
        
        Args:
            db: Database session
            document_id: ID of the document
            
        Returns:
            StockQualityDocumentModel with versions loaded
        """
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()
        
        return document
    
    @staticmethod
    def get_latest_document(
        db: Session,
        stock_id: int
    ) -> Optional[StockQualityDocumentModel]:
        """
        Get the latest version of a document for a stock item
        
        Args:
            db: Database session
            stock_id: ID of the stock item
            
        Returns:
            StockQualityDocumentModel or None
        """
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        ).order_by(StockQualityDocumentModel.version.desc()).first()
        
        return document
    
    @staticmethod
    def delete_document(
        db: Session,
        document_id: int
    ) -> bool:
        """
        Delete a document from both MinIO and database
        
        Args:
            db: Database session
            document_id: ID of the document to delete
            
        Returns:
            bool: True if deleted successfully
            
        Raises:
            ValueError: If document has child versions (cannot delete parent with children)
        """
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()
        
        if not document:
            return False
        
        # Check if this document has child versions
        has_children = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.parent_id == document_id
        ).first()
        
        if has_children:
            raise ValueError(
                "Cannot delete this document because it has newer versions. "
                "Please delete the latest version first."
            )
        
        # Delete from MinIO
        try:
            minio_client = get_minio_client()
            # Extract object name from URL
            # URL format: http://endpoint/bucket_name/object_name
            url_parts = document.document_url.split('/')
            object_name = '/'.join(url_parts[4:])  # Get everything after bucket_name
            minio_client.delete_file(object_name)
        except Exception as e:
            print(f"Error deleting file from MinIO: {e}")
            # Still delete from DB even if MinIO fails, but log the error
            # This prevents orphaned DB records if MinIO is unavailable
        
        # Delete from database
        db.delete(document)
        db.commit()
        
        return True
    
    @staticmethod
    def update_document(
        db: Session,
        document_id: int,
        update_data: StockQualityDocumentUpdate
    ) -> Optional[StockQualityDocumentModel]:
        """
        Update document metadata
        
        Args:
            db: Database session
            document_id: ID of the document to update
            update_data: Update data
            
        Returns:
            Updated StockQualityDocumentModel or None
        """
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()
        
        if not document:
            return None
        
        if update_data.document_name is not None:
            document.document_name = update_data.document_name
        if update_data.document_url is not None:
            document.document_url = update_data.document_url
        
        db.commit()
        db.refresh(document)
        
        return document
