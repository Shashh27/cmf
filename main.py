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

    documents_router,
    tools_router,
    customers_router,
    orders_router,
    order_documents_router,
    rawmaterials_router,
    workcenter_router,
    machines_router,
    order_parts_raw_material_linked_router,
    operation_documents_router,
    tools_list_router,
    access_control_router,
    login_router,
    inventory_requests_router,
    inventory_return_requests_router,
    transaction_history_router,
    tool_issues_router,
    out_source_parts_status_router,
    maintenance_router,
)

# Import Pokayoke checklists router
from routers.pokayoke_checklists import router as pokayoke_checklists_router, completed_logs_router as pokayoke_completed_logs_router

# Import general documents router
from document_routers.general_documents import router as general_documents_router

# Import machine documents router
from document_routers.machine_documents import router as machine_documents_router

# Import common documents router
from document_routers.common_documents import router as common_documents_router
from notification_routers.order_notifications import router as order_notifications_router
from notification_routers.machine_notifications import router as machine_notifications_router
from notification_routers.tool_issues_notification import router as tool_issues_notifications_router
from notification_routers.component_issues_notification import router as component_issues_notifications_router
from notification_routers.machine_calibration_notification import router as machine_calibration_notifications_router

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
        # Ensure notifications schema exists
        try:
            from sqlalchemy import text
            engine.execute(text("CREATE SCHEMA IF NOT EXISTS notifications"))
        except Exception:
            pass
        Base.metadata.create_all(bind=engine)
        print("SUCCESS: Database tables created/verified")
    except Exception as e:
        print(f"ERROR: Error creating database tables: {e}")

    # Initialize MinIO client
    try:
        init_minio_client(
            endpoint=MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            bucket_name=MINIO_BUCKET_NAME,
            secure=MINIO_SECURE
        )
        print("SUCCESS: MinIO client initialized")
        print(f"  - Endpoint: {MINIO_ENDPOINT}")
        print(f"  - Bucket: {MINIO_BUCKET_NAME}")
    except Exception as e:
        print(f"ERROR: Error initializing MinIO client: {e}")
        print("  Warning: Document upload functionality may not work")

    print("=" * 60)
    print("CMF Backend API is ready!")
    print(f"Documentation available at: http://localhost:8765/docs")
    print("=" * 60)


# Include all routers with api/v1 prefix
app.include_router(products_router, prefix="/api/v1")
app.include_router(assemblies_router, prefix="/api/v1")
app.include_router(part_types_router, prefix="/api/v1")
app.include_router(parts_router, prefix="/api/v1")
app.include_router(operations_router, prefix="/api/v1")

app.include_router(documents_router, prefix="/api/v1")
app.include_router(tools_router, prefix="/api/v1")
app.include_router(customers_router, prefix="/api/v1")
app.include_router(orders_router, prefix="/api/v1")
app.include_router(order_documents_router, prefix="/api/v1")
app.include_router(rawmaterials_router, prefix="/api/v1")
app.include_router(workcenter_router, prefix="/api/v1")
app.include_router(general_documents_router)
app.include_router(machine_documents_router)
app.include_router(common_documents_router)
app.include_router(access_control_router, prefix="/api/v1")
app.include_router(login_router, prefix="/api/v1")
app.include_router(machines_router, prefix="/api/v1")
app.include_router(order_parts_raw_material_linked_router, prefix="/api/v1")
app.include_router(operation_documents_router, prefix="/api/v1")
app.include_router(tools_list_router, prefix="/api/v1")
app.include_router(inventory_requests_router, prefix="/api/v1")
app.include_router(inventory_return_requests_router, prefix="/api/v1")
app.include_router(transaction_history_router, prefix="/api/v1")
app.include_router(pokayoke_checklists_router, prefix="/api/v1")
app.include_router(order_notifications_router, prefix="/api/v1")
app.include_router(machine_notifications_router, prefix="/api/v1")
app.include_router(tool_issues_notifications_router, prefix="/api/v1")
app.include_router(component_issues_notifications_router, prefix="/api/v1")
app.include_router(machine_calibration_notifications_router, prefix="/api/v1")
app.include_router(pokayoke_completed_logs_router, prefix="/api/v1")
app.include_router(tool_issues_router, prefix="/api/v1")
app.include_router(out_source_parts_status_router, prefix="/api/v1")
app.include_router(maintenance_router, prefix="/api/v1")


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
            "Support for PDF, DOCX, CSV, XLSX, and image files",
            "General documents with folder structure and versioning",
            "Machine documents with folder structure and versioning"
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
        "supported_file_types": ["pdf", "docx", "csv", "xlsx", "doc", "xls", "txt", "jpg", "jpeg", "png", "gif"],
        "endpoints": {
            "products": "/api/v1/products",
            "assemblies": "/api/v1/assemblies",
            "part_types": "/api/v1/part-types",
            "parts": "/api/v1/parts",
            "operations": "/api/v1/operations",
           
            "documents": "/api/v1/documents",
            "tools": "/api/v1/tools",
            "customers": "/api/v1/customers",
            "orders": "/api/v1/orders",
            "order_documents": "/api/v1/order-documents",
            "raw_materials": "/api/v1/rawmaterials",
            "work_centers": "/api/v1/workcenters",
            "machines": "/api/v1/machines",
            "order_parts_raw_material_linked": "/api/v1/order-parts-raw-material-linked",
            "operation_documents": "/api/v1/operation-documents",
            "tools_list": "/api/v1/tools-list",
            "inventory_requests": "/api/v1/inventory-requests",
            "inventory_return_requests": "/api/v1/inventory-return-requests",
            "tool_issues": "/api/v1/tool-issues",
            "general_documents": "/general-documents",
            "maintenance": "/api/v1/maintenance"
        }
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info"
    )












#  uvicorn main:app --reload --host 172.18.7.86 --port 8000


# python -m uvicorn main:app --reload --host 172.18.100.76 --port 8000
