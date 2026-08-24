from fastapi import FastAPI, APIRouter, Depends

from dotenv import load_dotenv

load_dotenv()

from fastapi.middleware.cors import CORSMiddleware

import os

from DB.database import (
    engine,
    verify_database_connection,
    ensure_app_schemas,
    MINIO_ENDPOINT,
    MINIO_ACCESS_KEY,
    MINIO_SECRET_KEY,
    MINIO_BUCKET_NAME,
    MINIO_SECURE,
)

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

    order_raw_materials_router,

    workcenter_router,

    machines_router,



    operation_documents_router,

    tools_list_router,

    access_control_router,

    login_router,

    auth_router,

    inventory_requests_router,

    inventory_return_requests_router,

    transaction_history_router,

    tool_issues_router,

    out_source_parts_status_router,

    maintenance_router,
    order_tracking_router,
    monitoring_router,
    production_analytics_router,
    order_additional_costs_router,
    pm_router,
    operation_checklists_router,
)

# Import planned raw materials router
from routers.planned_raw_materials import router as planned_raw_materials_router

# Import stock quality documents router
from routers.stock_quality_documents import router as stock_quality_documents_router

# Import recycle bin router
from recyclebin_router.recyclebin import router as recycle_bin_router

# Import chatbot router
from chatbot.chatbot import router as chatbot_router

# Import order chatbox router (human messaging, not LLM)
from chatbox.chatbox import router as chatbox_router

# Import scheduling router

# from scheduling_routers.production_logs import router as production_logs_router


# Import notification routers

from notification_routers import (

    component_issues_notification_router,

    machine_calibration_notification_router,

    machine_notifications_router,

    order_notifications_router,

    tool_issues_notification_router,

    pc_notifications_router,

    mc_notifications_router,

    admin_document_notifications_router,

)




from routers.ems import router as ems_router

# Import MHR router
from services.machine_mhr_router import router as machine_mhr_router


# Import document routers

from document_routers import (
    common_documents_router,
    general_documents_router,
    machine_documents_router
)

from scheduler_service import start_scheduler, stop_scheduler

# Initialize FastAPI app

app = FastAPI(

    title="CMF Backend API",

    description="Configuration Management Framework Backend System with MinIO Integration",

    version="2.0.0",

    docs_url="/docs",

    redoc_url="/redoc"

)



from auth.deps import jwt_auth_http_middleware
from auth.migrate_refresh_tokens import ensure_refresh_tokens_schema
from auth.openapi import configure_openapi_jwt

configure_openapi_jwt(app)

# Open CORS — allow all origins (no credentials; Bearer JWT in Authorization header)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.middleware("http")(jwt_auth_http_middleware)





@app.on_event("startup")

async def startup_event():

    """

    Startup event handler

    - Verifies database connectivity (no DDL as cmf_app)

    - Optionally bootstraps schema if ALLOW_AUTO_SCHEMA=true (local only)

    - Initializes MinIO client

    - Starts the scheduler for automated notifications

    """

    print("=" * 60)

    print("Starting CMF Backend API...")

    print("=" * 60)



    # Schema DDL is owned by cmf_owner via Alembic — not the runtime app role.
    # ALLOW_AUTO_SCHEMA=true keeps old create_all behaviour for local bootstrap only.
    try:
        allow_auto = os.getenv("ALLOW_AUTO_SCHEMA", "false").lower() in ("1", "true", "yes")
        if allow_auto:
            ensure_app_schemas()
            Base.metadata.create_all(bind=engine)
            ensure_refresh_tokens_schema()
            print("SUCCESS: Database tables created/verified (ALLOW_AUTO_SCHEMA)")
        else:
            verify_database_connection()
            ensure_refresh_tokens_schema()
            print("SUCCESS: Database connection verified (schema managed by Alembic)")
    except Exception as e:
        print(f"ERROR: Database startup check failed: {e}")



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



    # Start the scheduler for automated notifications
    try:
        start_scheduler()
    except Exception as e:
        print(f"ERROR: Error starting scheduler: {e}")


    print("=" * 60)

    print("CMF Backend API is ready!")

    print(f"Documentation available at: http://localhost:8765/docs")

    print("=" * 60)


@app.on_event("shutdown")
async def shutdown_event():
    """
    Shutdown event handler
    - Stops the scheduler
    """
    try:
        stop_scheduler()
    except Exception as e:
        print(f"ERROR: Error stopping scheduler: {e}")





# Unified API router — JWT enforced via HTTP middleware (WebSockets exempt)
api_router = APIRouter()

# Include all routers in the unified router
api_router.include_router(products_router)
api_router.include_router(assemblies_router)
api_router.include_router(part_types_router)
api_router.include_router(parts_router)
api_router.include_router(operations_router)
api_router.include_router(documents_router)
api_router.include_router(tools_router)
api_router.include_router(customers_router)
api_router.include_router(orders_router)
api_router.include_router(order_documents_router)
api_router.include_router(order_raw_materials_router, prefix="/rawmaterials")
api_router.include_router(rawmaterials_router)
api_router.include_router(workcenter_router)
api_router.include_router(general_documents_router)
api_router.include_router(machine_documents_router)
api_router.include_router(common_documents_router)
api_router.include_router(access_control_router)
api_router.include_router(login_router)
api_router.include_router(auth_router)
api_router.include_router(machines_router)
api_router.include_router(operation_documents_router)
api_router.include_router(tools_list_router)
api_router.include_router(inventory_requests_router)
api_router.include_router(inventory_return_requests_router)
api_router.include_router(transaction_history_router)
api_router.include_router(tool_issues_router)
api_router.include_router(out_source_parts_status_router)
api_router.include_router(maintenance_router)
api_router.include_router(ems_router)
api_router.include_router(order_tracking_router)
api_router.include_router(monitoring_router)
api_router.include_router(production_analytics_router)
api_router.include_router(order_additional_costs_router)
api_router.include_router(stock_quality_documents_router)
api_router.include_router(pm_router)
api_router.include_router(operation_checklists_router)
api_router.include_router(machine_mhr_router)
api_router.include_router(recycle_bin_router)
api_router.include_router(planned_raw_materials_router)
api_router.include_router(chatbox_router)

# Include notification routers
api_router.include_router(component_issues_notification_router)
api_router.include_router(machine_calibration_notification_router)
api_router.include_router(machine_notifications_router)
api_router.include_router(order_notifications_router)
api_router.include_router(tool_issues_notification_router)
api_router.include_router(pc_notifications_router)
api_router.include_router(mc_notifications_router)
api_router.include_router(admin_document_notifications_router)

# Include unified router with single prefix
app.include_router(api_router, prefix="/api/v1")

# Include chatbot router separately (JWT via HTTP middleware + get_current_user on routes)
app.include_router(chatbot_router, prefix="/api/chatbot")

# app.include_router(production_logs_router, prefix="/api/v1")




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

            "configured": bool(os.getenv("DATABASE_URL")),

            "note": "Connection details are not exposed; use env DATABASE_URL (cmf_app role)",

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

            "operation_documents": "/api/v1/operation-documents",

            "tools_list": "/api/v1/tools-list",

            "inventory_requests": "/api/v1/inventory-requests",

            "inventory_return_requests": "/api/v1/inventory-return-requests",

            "tool_issues": "/api/v1/tool-issues",

            "general_documents": "/api/v1/general-documents",

            "maintenance": "/api/v1/maintenance",

            "order_tracking": "/api/v1/order-tracking",

        }

    }




if __name__ == "__main__":

    import uvicorn



    uvicorn.run(

        app,

        host="0.0.0.0",

        port=3000,

        log_level="info"

    )





















# localsystem



#  uvicorn main:app --reload --host 172.18.7.91 --port 8000



#  uvicorn main:app --reload --host 172.18.7.89 --port 8000



# python -m uvicorn main:app --reload --host 172.18.7.91 --port 8000



# python -m uvicorn main:app --reload --host 172.18.100.76 --port 8000



# server:

# uvicorn main:app --reload --host 172.18.7.91 --port 3000

#  uvicorn main:app --reload --host 172.18.7.86 --port 8000

