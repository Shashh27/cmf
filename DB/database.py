from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

# Database configuration
DATABASE_URL = "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo"

# MinIO configuration
MINIO_ENDPOINT = "172.18.7.91:9000"  # MinIO endpoint (IP:PORT)
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
MINIO_BUCKET_NAME = "cmf"
MINIO_SECURE = False  # Set to True if using HTTPS

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    echo=False  # Set to True for SQL query logging
)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()