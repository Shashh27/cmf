from .common_documents import router as common_documents_router
from .general_documents import router as general_documents_router
from .machine_documents import router as machine_documents_router

__all__ = [
    "common_documents_router",
    "general_documents_router",
    "machine_documents_router"
]
