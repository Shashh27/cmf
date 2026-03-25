import os
import sys

# Add the backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from DB.database import SessionLocal, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_SECURE
from DB.models.oms import Document, OrderDocument, OperationDocument, DocumentExtractedData
from DB.minio_client import init_minio_client, get_minio_client
from minio.error import S3Error

def cleanup_missing_files():
    # 1. Initialize MinIO
    init_minio_client(MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_SECURE)
    minio_client = get_minio_client()
    db: Session = SessionLocal()

    print(f"--- Starting Cleanup Migration ---")
    print(f"Checking for missing files in MinIO bucket: {MINIO_BUCKET_NAME}\n")

    tables = [
        {"model": Document, "name": "Part/Assembly Documents"},
        {"model": OrderDocument, "name": "Order Documents"},
        {"model": OperationDocument, "name": "Operation Documents"}
    ]

    for table in tables:
        model = table["model"]
        table_name = table["name"]
        print(f"Scanning {table_name}...")
        
        records = db.query(model).all()
        deleted_count = 0
        
        for record in records:
            try:
                # Extract object name from URL
                # URL format: http://endpoint/bucket/object_name
                url = record.document_url
                object_name = url.split(f"/{MINIO_BUCKET_NAME}/")[1]
                
                # Check if file exists in MinIO
                if not minio_client.file_exists(object_name):
                    print(f"  [MISSING] ID {record.id}: File '{object_name}' not found. Deleting from DB.")
                    
                    # Handle Foreign Key constraint for Part Documents
                    if model == Document:
                        db.query(DocumentExtractedData).filter(DocumentExtractedData.document_id == record.id).delete()
                        
                    db.delete(record)
                    deleted_count += 1
            except Exception as e:
                print(f"  [ERROR] ID {record.id}: Could not check file. Error: {str(e)}")
        
        db.commit()
        print(f"Finished {table_name}. Records deleted: {deleted_count}\n")

    db.close()
    print("--- Cleanup Migration Finished ---")

if __name__ == "__main__":
    cleanup_missing_files()