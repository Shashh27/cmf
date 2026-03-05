from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Database configuration
DATABASE_URL = "postgresql://postgres:postgres@172.18.7.91:5432/CMF_DIGITIZATION"

# MinIO configuration
MINIO_ENDPOINT = "172.18.7.91:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
MINIO_BUCKET_NAME = "cmf"
MINIO_SECURE = False

# Create SQLAlchemy engine
# pool_size=20       : 20 persistent connections kept alive (handles ~20 simultaneous DB ops)
# max_overflow=30    : 30 extra connections allowed under peak load (total max = 50)
# pool_timeout=30    : wait up to 30s for a free connection before raising an error
# pool_recycle=1800  : recycle connections every 30 min to avoid stale/dropped connections
# pool_pre_ping=True : test connection health before use, auto-reconnects if DB restarted
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=20,
    max_overflow=30,
    pool_timeout=30,
    pool_recycle=1800,
    echo=False,
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