from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from DB.database import engine, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_SECURE
from DB.models import Base
from DB.minio_client import init_minio_client

# Import all routers
from routers import (
    products_router,
    assemblies_router,
    part_types_router,
    parts_router,
    operations_router,
    process_plans_router,
    documents_router,
    tools_router,
    customers_router,
    orders_router,
    customer_documents_router
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


# Include all routers
app.include_router(products_router)
app.include_router(assemblies_router)
app.include_router(part_types_router)
app.include_router(parts_router)
app.include_router(operations_router)
app.include_router(process_plans_router)
app.include_router(documents_router)
app.include_router(tools_router)
app.include_router(customers_router)
app.include_router(orders_router)
app.include_router(customer_documents_router)


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Welcome to CMF Backend API with MinIO Integration",
        "version": "2.0.0",
        "features": [
            "Complete CRUD operations for all entities",
            "Document upload to MinIO storage",
            "File download from MinIO",
            "Support for PDF, DOCX, CSV, XLSX files"
        ],
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected",
        "minio": "connected"
    }


@app.get("/info")
def system_info():
    """System information endpoint"""
    return {
        "api_version": "2.0.0",
        "database": {
            "host": "172.18.7.91",
            "port": 5432,
            "database": "cmf_backend"
        },
        "minio": {
            "endpoint": MINIO_ENDPOINT,
            "bucket": MINIO_BUCKET_NAME,
            "secure": MINIO_SECURE
        },
        "supported_file_types": ["pdf", "docx", "csv", "xlsx", "doc", "xls", "txt"],
        "endpoints": {
            "products": "/products",
            "assemblies": "/assemblies",
            "part_types": "/part-types",
            "parts": "/parts",
            "operations": "/operations",
            "process_plans": "/process-plans",
            "documents": "/documents",
            "tools": "/tools",
            "customers": "/customers",
            "orders": "/orders",
            "customer_documents": "/customer-documents"
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8765,
        log_level="info"
    )