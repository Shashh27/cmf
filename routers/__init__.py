from .products import router as products_router
from .assemblies import router as assemblies_router
from .part_types import router as part_types_router
from .parts import router as parts_router
from .operations import router as operations_router
from .process_plans import router as process_plans_router
from .documents import router as documents_router
from .tools import router as tools_router
from .customers import router as customers_router
from .orders import router as orders_router
from .customer_documents import router as customer_documents_router
from .rawmaterials import router as rawmaterials_router
from .workcenter import router as workcenter_router
from .machines import router as machines_router
from .order_parts_raw_material_linked import router as order_parts_raw_material_linked_router

__all__ = [
    "products_router",
    "assemblies_router",
    "part_types_router",
    "parts_router",
    "operations_router",
    "process_plans_router",
    "documents_router",
    "tools_router",
    "customers_router",
    "orders_router",
    "customer_documents_router",
    "rawmaterials_router",
    "workcenter_router",
    "machines_router",
    "order_parts_raw_material_linked_router"
]