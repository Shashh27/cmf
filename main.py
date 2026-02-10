from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from DB.database import engine, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_SECURE
from DB.models import Base, scheduling
from DB.minio_client import init_minio_client

# Import all routers
from routers import (
    machine_status, 
    machines, 
    shift_hours
)


# Initialize FastAPI app
app = FastAPI(
    title="CMF Backend API",
    description="Configuration Management Framework Backend System with MinIO Integration",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this with your frontend URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(machine_status.router, prefix="/api/v1")
app.include_router(machines.router, prefix="/api/v1")
app.include_router(shift_hours.router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """
    Startup event handler
    - Creates database tables
    - Initializes MinIO client
    """
    print("=" * 60)
    print("Starting CMF Backend API...")
    print("=" * 60)

    # Create database tables
    try:
        Base.metadata.create_all(bind=engine)
        print("✓ Database tables created/verified")
    except Exception as e:
        print(f"✗ Error creating database tables: {e}")

    # Initialize MinIO client
    try:
        init_minio_client(
            endpoint=MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            bucket_name=MINIO_BUCKET_NAME,
            secure=MINIO_SECURE
        )
        print("✓ MinIO client initialized")
        print(f"  - Endpoint: {MINIO_ENDPOINT}")
        print(f"  - Bucket: {MINIO_BUCKET_NAME}")
    except Exception as e:
        print(f"✗ Error initializing MinIO client: {e}")
        print("  Warning: Document upload functionality may not work")

    print("=" * 60)
    print("CMF Backend API is ready!")
    print(f"Documentation available at: http://localhost:8765/docs")
    print("=" * 60)







@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected",
        "minio": "connected"
    }




if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )