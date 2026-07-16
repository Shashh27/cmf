import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from DB.database import engine, MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_SECURE
from DB.models import Base, scheduling
from DB.models import oms
from DB.minio_client import init_minio_client
from routers.machine_scheduling import router as machine_scheduling_router
# Import all routers
from routers import (
    machine_status, 
    machines, 
    shift_hours,
    capacity_planning,
    machine_scheduling,
    production_logs,
    operator_leaves,
    notifications,
    order_tracking,
)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Scheduling Microservice API",
    description="APIs for managing machine scheduling",
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
app.include_router(capacity_planning.router, prefix="/api/v1")
app.include_router(machine_scheduling_router, prefix="/api/v1")
app.include_router(production_logs.router, prefix="/api/v1")
app.include_router(operator_leaves.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(order_tracking.router, prefix="/api/v1")
# app.include_router(machine_scheduling_engine_router, prefix="/api/v1")


@app.on_event("startup")
async def startup_event():
    """
    Startup event handler
    - Creates database tables
    - Initializes MinIO client
    """
    logger.info("Starting CMF Backend API")

    # Create database tables
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created or verified")
    except Exception as e:
        logger.exception("Error creating database tables")

    # Initialize MinIO client
    try:
        init_minio_client(
            endpoint=MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            bucket_name=MINIO_BUCKET_NAME,
            secure=MINIO_SECURE
        )
        logger.info(
            "MinIO client initialized",
            extra={
                "event": "minio_initialized",
                "minio_endpoint": MINIO_ENDPOINT,
                "minio_bucket": MINIO_BUCKET_NAME,
            },
        )
    except Exception as e:
        logger.exception("Error initializing MinIO client")
        logger.warning("Document upload functionality may not work")

    logger.info("CMF Backend API is ready")
    logger.info("Documentation available at /docs")







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
        port=8989,
        log_level="info"
    )