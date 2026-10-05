"""
Stock Quality Document Service

This service handles uploading, managing, and versioning quality documents
for raw material stock items and optionally individual units.
Documents are stored in MinIO and metadata is stored in the database with
version tracking.

Semantics:
- unit_id IS NULL  → stock-level document (applies to whole stock)
- unit_id IS set   → unit-level document (applies to that unit only)
"""

from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
import io

from DB.models.inventory import (
    StockQualityDocument as StockQualityDocumentModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
)
from DB.models.access_control import AccessUser
from DB.schemas.inventory import StockQualityDocumentUpdate
from DB.minio_client import get_minio_client


class StockQualityDocumentService:
    """Service for managing stock / unit quality documents"""

    @staticmethod
    def _version_query(db: Session, stock_id: int, unit_id: Optional[int]):
        """Latest-version query scoped to stock-level or a specific unit."""
        q = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        )
        if unit_id is None:
            q = q.filter(StockQualityDocumentModel.unit_id.is_(None))
        else:
            q = q.filter(StockQualityDocumentModel.unit_id == unit_id)
        return q

    @staticmethod
    def upload_document(
        db: Session,
        stock_id: int,
        file_name: str,
        file_content: bytes,
        content_type: str,
        user_id: int,
        unit_id: Optional[int] = None,
        remarks: Optional[str] = None,
    ) -> StockQualityDocumentModel:
        """
        Upload a quality document for a stock item (and optionally a unit).

        Args:
            db: Database session
            stock_id: ID of the stock item
            file_name: Name of the file
            file_content: File content as bytes
            content_type: MIME type of the file
            user_id: ID of the user uploading
            unit_id: Optional unit id for unit-level documents
            remarks: Optional remarks / notes for the document

        Returns:
            StockQualityDocumentModel: Created document record
        """
        stock = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.id == stock_id
        ).first()
        if not stock:
            raise ValueError(f"Stock with id {stock_id} not found")

        if unit_id is not None:
            unit = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.id == unit_id
            ).first()
            if not unit:
                raise ValueError(f"Unit with id {unit_id} not found")
            if unit.stock_id != stock_id:
                raise ValueError(
                    f"Unit {unit_id} does not belong to stock {stock_id}"
                )

        latest_doc = (
            StockQualityDocumentService._version_query(db, stock_id, unit_id)
            .order_by(StockQualityDocumentModel.version.desc())
            .first()
        )

        if latest_doc:
            new_version = latest_doc.version + 1.0
            parent_id = latest_doc.id
        else:
            new_version = 1.0
            parent_id = None

        unit_folder = f"unit-{unit_id}" if unit_id is not None else "stock"
        object_name = f"stock-quality/{stock_id}/{unit_folder}/{new_version}_{file_name}"

        minio_client = get_minio_client()
        file_stream = io.BytesIO(file_content)
        document_url = minio_client.upload_file(
            file_data=file_stream,
            object_name=object_name,
            content_type=content_type,
        )

        cleaned_remarks = (remarks or "").strip() or None

        document = StockQualityDocumentModel(
            stock_id=stock_id,
            unit_id=unit_id,
            document_name=file_name,
            document_url=document_url,
            remarks=cleaned_remarks,
            version=new_version,
            parent_id=parent_id,
            user_id=user_id,
        )

        db.add(document)
        db.commit()
        db.refresh(document)
        if document.user_id:
            user = db.query(AccessUser).filter(AccessUser.id == document.user_id).first()
            document.user_name = user.user_name if user else None
        else:
            document.user_name = None

        return document

    @staticmethod
    def get_documents_by_stock(
        db: Session,
        stock_id: int,
        unit_id: Optional[int] = None,
        stock_level_only: bool = False,
    ) -> List[StockQualityDocumentModel]:
        """
        Get quality documents for a stock item.

        - unit_id set → that unit's documents only
        - stock_level_only=True → stock-level documents only (unit_id IS NULL)
        - otherwise → all documents for the stock (stock + unit level)
        """
        q = db.query(StockQualityDocumentModel).options(
            joinedload(StockQualityDocumentModel.user)
        ).filter(
            StockQualityDocumentModel.stock_id == stock_id
        )
        if unit_id is not None:
            q = q.filter(StockQualityDocumentModel.unit_id == unit_id)
        elif stock_level_only:
            q = q.filter(StockQualityDocumentModel.unit_id.is_(None))

        docs = q.order_by(StockQualityDocumentModel.version.desc()).all()
        for doc in docs:
            doc.user_name = doc.user.user_name if doc.user else None
        return docs

    @staticmethod
    def get_document_with_versions(
        db: Session,
        document_id: int,
    ) -> Optional[StockQualityDocumentModel]:
        return db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()

    @staticmethod
    def get_latest_document(
        db: Session,
        stock_id: int,
        unit_id: Optional[int] = None,
        stock_level_only: bool = False,
    ) -> Optional[StockQualityDocumentModel]:
        docs = StockQualityDocumentService.get_documents_by_stock(
            db, stock_id, unit_id=unit_id, stock_level_only=stock_level_only
        )
        return docs[0] if docs else None

    @staticmethod
    def delete_document(
        db: Session,
        document_id: int,
    ) -> bool:
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()

        if not document:
            return False

        has_children = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.parent_id == document_id
        ).first()

        if has_children:
            raise ValueError(
                "Cannot delete this document because it has newer versions. "
                "Please delete the latest version first."
            )

        try:
            minio_client = get_minio_client()
            url_parts = document.document_url.split('/')
            object_name = '/'.join(url_parts[4:])
            minio_client.delete_file(object_name)
        except Exception as e:
            print(f"Error deleting file from MinIO: {e}")

        db.delete(document)
        db.commit()

        return True

    @staticmethod
    def update_document(
        db: Session,
        document_id: int,
        update_data: StockQualityDocumentUpdate,
    ) -> Optional[StockQualityDocumentModel]:
        document = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.id == document_id
        ).first()

        if not document:
            return None

        if update_data.document_name is not None:
            document.document_name = update_data.document_name
        if update_data.document_url is not None:
            document.document_url = update_data.document_url
        if update_data.remarks is not None:
            cleaned = update_data.remarks.strip()
            document.remarks = cleaned or None

        db.commit()
        db.refresh(document)

        return document
