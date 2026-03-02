from .products import router as products_router
from .assemblies import router as assemblies_router
from .part_types import router as part_types_router
from .parts import router as parts_router
from .operations import router as operations_router
from .documents import router as documents_router
from .tools import router as tools_router
from .customers import router as customers_router
from .orders import router as orders_router
from .order_documents import router as order_documents_router
from .rawmaterials import router as rawmaterials_router
from .workcenter import router as workcenter_router
from .machines import router as machines_router
from .order_parts_raw_material_linked import router as order_parts_raw_material_linked_router
from .operation_documents import router as operation_documents_router
from .tools_list import router as tools_list_router
from .access_control import router as access_control_router
from .login import router as login_router
from .inventory_requests import router as inventory_requests_router
from .inventory_return_requests import router as inventory_return_requests_router
from .transaction_history import router as transaction_history_router
from .pokayoke_checklists import router as pokayoke_checklists_router, completed_logs_router as pokayoke_completed_logs_router
from .tool_issues import router as tool_issues_router

__all__ = [
    "products_router",
    "assemblies_router",
    "part_types_router",
    "parts_router",
    "operations_router",
    "documents_router",
    "tools_router",
    "customers_router",
    "orders_router",
    "order_documents_router",
    "rawmaterials_router",
    "workcenter_router",
    "machines_router",
    "order_parts_raw_material_linked_router",
    "operation_documents_router",
    "tools_list_router",
    "access_control_router",
    "login_router",
    "inventory_requests_router",
    "inventory_return_requests_router",
    "transaction_history_router",
    "pokayoke_checklists_router",
    "pokayoke_completed_logs_router",
    "tool_issues_router"
]
