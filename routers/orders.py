from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func, literal
from typing import List, Optional
from datetime import datetime
from DB.database import get_db
from DB.models.oms import (
    Order,
    Product,
    OrderDocument,
    Part,
    OrderPartPriority,
    OrderPartsRawMaterialLinked,
    PartType,
)
from DB.models.configuration import Customer, PokayokeCompletedLog
from DB.models.inventory import InventoryRequest, InventoryReturnRequest
from DB.models.access_control import AccessUser
from DB.schemas.oms import (
    Order as OrderResponse,
    OrderCreate,
    OrderUpdate,
    OrderAssign,
    OrderWithCustomer,
    OrderWithCustomerAndProduct,
    OrderWithHierarchy,
    OrderPartPriority as OrderPartPrioritySchema,
    OrderPartPriorityUpdate,
    OrderPartPriorityGlobalUpdate,
    OrderPartPrioritySwap,
    OrderWisePriority,
)
from .products import fetch_product_hierarchy, delete_product_cascade
from DB.minio_client import get_minio_client

router = APIRouter(prefix="/orders", tags=["orders"])

# CRUD operations
def _order_to_response(order, db: Session):
    """Build order response dict with customer, product, and role user names."""
    return {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "user_id": order.user_id or 0,
        "project_coordinator_id": order.project_coordinator_id,
        "admin_id": order.admin_id,
        "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": order.customer.company_name if order.customer else None,
        "product_name": order.product.product_name if order.product else None,
        "user_name": order.user.user_name if order.user else None,
        "project_coordinator_name": order.project_coordinator.user_name if order.project_coordinator else None,
        "admin_name": order.admin.user_name if order.admin else None,
        "manufacturing_coordinator_name": order.manufacturing_coordinator.user_name if order.manufacturing_coordinator else None,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }


@router.post("/", response_model=OrderResponse)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    """
    Create a new order.
    Can be created by project_coordinator or admin.
    project_coordinator_id is optional (no PC when admin creates directly).
    admin_id is required. manufacturing_coordinator_id is set when admin assigns later.
    """
    # Trim and normalize case for the sale_order_number
    order.sale_order_number = order.sale_order_number.strip().upper() if order.sale_order_number else order.sale_order_number

    # Case-insensitive check if sale_order_number already exists
    existing_order = (
        db.query(Order)
        .filter(func.lower(Order.sale_order_number) == order.sale_order_number.lower())
        .first()
    )
    if existing_order:
        raise HTTPException(
            status_code=400,
            detail=f"Order with Project Number '{order.sale_order_number}' already exists."
        )

    # Check if customer exists
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Validate admin_id (required)
    admin_user = db.query(AccessUser).filter(AccessUser.id == order.admin_id).first()
    if not admin_user:
        raise HTTPException(status_code=404, detail="Admin user not found")
    if order.project_coordinator_id is not None:
        pc_user = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first()
        if not pc_user:
            raise HTTPException(status_code=404, detail="Project coordinator user not found")
    if order.manufacturing_coordinator_id is not None:
        mc_user = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first()
        if not mc_user:
            raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")
    if order.user_id is not None:
        creator = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
        if not creator:
            raise HTTPException(status_code=404, detail="Creator user not found")

    # Exclude legacy project_name field (column dropped, property is read-only)
    data = order.model_dump(exclude={"project_name"})
    db_order = Order(**data)
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    # Reload with relationships for response
    order_with_relations = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == db_order.id)
        .first()
    )
    return _order_to_response(order_with_relations, db)

@router.get("/", response_model=List[OrderWithCustomerAndProduct])
def get_orders(
    user_id: int | None = None,
    admin_id: int | None = None,
    project_coordinator_id: int | None = None,
    manufacturing_coordinator_id: int | None = None,
    db: Session = Depends(get_db),
):
    """
    Get all orders with company_name, product_name, and role user names.
    Filter by user_id (creator), admin_id, project_coordinator_id, or manufacturing_coordinator_id
    for module-specific views (admin / project coordinator / manufacturing coordinator).
    """
    from sqlalchemy.orm import joinedload
    query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .order_by(Order.id.asc())
    )
    if user_id is not None:
        query = query.filter(Order.user_id == user_id)
    if admin_id is not None:
        query = query.filter(Order.admin_id == admin_id)
    if project_coordinator_id is not None:
        query = query.filter(Order.project_coordinator_id == project_coordinator_id)
    if manufacturing_coordinator_id is not None:
        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)
    orders = query.all()
    return [_order_to_response(order, db) for order in orders]

@router.get("/with-customers", response_model=List[OrderWithCustomer])
def get_orders_with_customers(
    user_id: int | None = None,
    admin_id: int | None = None,
    project_coordinator_id: int | None = None,
    manufacturing_coordinator_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Get all orders with customer information. Filter by user_id, admin_id, project_coordinator_id, or manufacturing_coordinator_id."""
    from sqlalchemy.orm import joinedload
    query = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .order_by(Order.id.asc())
    )
    if user_id is not None:
        query = query.filter(Order.user_id == user_id)
    if admin_id is not None:
        query = query.filter(Order.admin_id == admin_id)
    if project_coordinator_id is not None:
        query = query.filter(Order.project_coordinator_id == project_coordinator_id)
    if manufacturing_coordinator_id is not None:
        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)
    orders = query.all()
    result = []
    for order in orders:
        result.append({
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "user_id": order.user_id or 0,
            "project_coordinator_id": order.project_coordinator_id,
            "admin_id": order.admin_id,
            "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
            "user_name": order.user.user_name if order.user else None,
            "customer": {
                "id": order.customer.id,
                "company_name": order.customer.company_name,
                "address": order.customer.address,
                "branch": order.customer.branch,
                "email": order.customer.email,
                "contact_number": order.customer.contact_number,
                "contact_person": order.customer.contact_person,
            } if order.customer else None,
        })
    return result

@router.get("/{order_id}/hierarchical", response_model=OrderWithHierarchy)
def get_order_hierarchical_data(order_id: int, db: Session = Depends(get_db)):
    """Get order with full product hierarchy including tools"""
    from sqlalchemy.orm import joinedload
    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    hierarchy = fetch_product_hierarchy(db, order.product_id)

    priorities = (
        db.query(OrderPartPriority)
        .join(Part, OrderPartPriority.part_id == Part.id)
        .join(PartType, Part.type_id == PartType.id)
        .filter(
            OrderPartPriority.order_id == order_id,
            func.lower(PartType.type_name) == "in-house",
        )
        .all()
    )
    priority_map = {p.part_id: p.priority for p in priorities}

    def inject_priority(part_details_list):
        for pd in part_details_list:
            if pd.part.id in priority_map:
                pd.part.priority = priority_map[pd.part.id]

    def inject_priority_recursive(assemblies):
        for asm in assemblies:
            inject_priority(asm.parts)
            inject_priority_recursive(asm.subassemblies)

    inject_priority(hierarchy.direct_parts)
    inject_priority_recursive(hierarchy.assemblies)

    out = _order_to_response(order, db)
    out["product_hierarchy"] = hierarchy
    return out


@router.get("/{order_id}", response_model=OrderWithCustomerAndProduct)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get a specific order by ID with company_name, product_name, and role names"""
    from sqlalchemy.orm import joinedload
    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_to_response(order, db)

@router.get("/customer/{customer_id}", response_model=List[OrderResponse])
def get_orders_by_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get all orders for a specific customer"""
    orders = db.query(Order).filter(Order.customer_id == customer_id).order_by(Order.id.asc()).all()
    return orders

@router.get("/sale-order/{sale_order_number}/parts")
def get_parts_by_sale_order(sale_order_number: str, db: Session = Depends(get_db)):
    """Get parts for the product associated with a given sale_order_number"""
    order = db.query(Order).filter(Order.sale_order_number == sale_order_number).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    parts = (
        db.query(Part)
        .join(PartType, Part.type_id == PartType.id)
        .filter(
            Part.product_id == order.product_id,
            func.lower(PartType.type_name) == "in-house",
        )
        .order_by(Part.id.asc())
        .all()
    )
    return [
        {
            "id": p.id,
            "part_name": p.part_name,
            "part_number": p.part_number,
            "assembly_id": p.assembly_id,
            "product_id": p.product_id,
        }
        for p in parts
    ]

@router.get("/{order_id}/part-priorities", response_model=List[OrderPartPrioritySchema])
def get_order_part_priorities(order_id: int, db: Session = Depends(get_db)):
    """Get part priorities for an order"""
    priorities = (
        db.query(OrderPartPriority)
        .join(Part, OrderPartPriority.part_id == Part.id)
        .join(PartType, Part.type_id == PartType.id)
        .filter(
            OrderPartPriority.order_id == order_id,
            func.lower(PartType.type_name) == "in-house",
        )
        .order_by(OrderPartPriority.priority.asc())
        .all()
    )
    
    # Enrich with part details
    result = []
    for p in priorities:
        p_data = {
            "id": p.id,
            "order_id": p.order_id,
            "product_id": p.product_id,
            "part_id": p.part_id,
            "priority": p.priority,
            "part_name": p.part.part_name if p.part else None,
            "part_number": p.part.part_number if p.part else None,
            "part_type_name": p.part.type.type_name if p.part and p.part.type else None,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        result.append(p_data)
    return result

@router.put("/{order_id}/part-priorities", response_model=List[OrderPartPrioritySchema])
def update_order_part_priorities(order_id: int, priorities: List[OrderPartPriorityUpdate], db: Session = Depends(get_db)):
    """Update part priorities for an order"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    for item in priorities:
        if item.part_id is not None and item.priority is not None:
            record = db.query(OrderPartPriority).filter(
                OrderPartPriority.order_id == order_id,
                OrderPartPriority.part_id == item.part_id
            ).first()
            
            if record:
                record.priority = item.priority
    
    db.commit()
    return get_order_part_priorities(order_id, db)

@router.get("/part-priorities/all", response_model=List[OrderPartPrioritySchema])
def get_all_part_priorities(
    admin_id: Optional[int] = Query(None, description="Filter part priorities by admin who owns the order"),
    manufacturing_coordinator_id: Optional[int] = Query(
        None, description="Filter part priorities by manufacturing coordinator who owns the order"
    ),
    db: Session = Depends(get_db),
):
    """Get all part priorities globally with details.

    - If admin_id is provided, filter by Order.admin_id.
    - If manufacturing_coordinator_id is provided, filter by Order.manufacturing_coordinator_id.
    - If both are omitted, return priorities for all orders.
    """
    query = (
        db.query(OrderPartPriority)
        .join(Part, OrderPartPriority.part_id == Part.id)
        .join(PartType, Part.type_id == PartType.id)
        .join(Order, OrderPartPriority.order_id == Order.id)
        .filter(func.lower(PartType.type_name) == "in-house")
    )
    if admin_id is not None:
        query = query.filter(Order.admin_id == admin_id)
    if manufacturing_coordinator_id is not None:
        query = query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

    priorities = query.order_by(OrderPartPriority.priority.asc()).all()

    result = []
    for p in priorities:
        p_data = {
            "id": p.id,
            "order_id": p.order_id,
            "product_id": p.product_id,
            "part_id": p.part_id,
            "priority": p.priority,
            "part_name": p.part.part_name if p.part else None,
            "part_number": p.part.part_number if p.part else None,
            "sale_order_number": p.order.sale_order_number if p.order else None,
            "project_name": None,
            "product_name": p.product.product_name if p.product else None,
            "part_type_name": p.part.type.type_name if p.part and p.part.type else None,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        result.append(p_data)
    return result

@router.put("/part-priorities/update-global")
def update_global_priority(update: OrderPartPriorityGlobalUpdate, db: Session = Depends(get_db)):
    """Update priority of a specific part globally, shifting others to maintain sequence"""
    # Fetch target record
    record = db.query(OrderPartPriority).filter(OrderPartPriority.id == update.id).with_for_update().first()
    if not record:
        raise HTTPException(status_code=404, detail="Priority record not found")
    
    old_priority = record.priority
    new_priority = update.priority
    
    if old_priority == new_priority:
        return {"message": "No change needed"}
    
    # Validation: Check if new_priority is within valid range (1 to Max Priority)
    from sqlalchemy import func
    max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0
    
    if new_priority < 1 or new_priority > max_priority:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid priority: {new_priority}. Must be between 1 and {max_priority}."
        )
    
    # Logic to shift priorities
    if new_priority > old_priority:
        # Moving down (increasing priority value)
        # Shift items in (old_priority + 1, new_priority) down by 1 (value - 1)
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority > old_priority,
            OrderPartPriority.priority <= new_priority
        ).update({OrderPartPriority.priority: OrderPartPriority.priority - 1}, synchronize_session=False)
    else:
        # Moving up (decreasing priority value)
        # Shift items in (new_priority, old_priority - 1) up by 1 (value + 1)
        db.query(OrderPartPriority).filter(
            OrderPartPriority.priority >= new_priority,
            OrderPartPriority.priority < old_priority
        ).update({OrderPartPriority.priority: OrderPartPriority.priority + 1}, synchronize_session=False)
        
    # Set the new priority for the target record
    record.priority = new_priority
    db.commit()
    
    return {"message": "Priority updated successfully"}

@router.put("/part-priorities/swap")
def swap_part_priorities(swap: OrderPartPrioritySwap, db: Session = Depends(get_db)):
    """Swap priorities between two part priority records"""
    record1 = db.query(OrderPartPriority).filter(OrderPartPriority.id == swap.id1).first()
    record2 = db.query(OrderPartPriority).filter(OrderPartPriority.id == swap.id2).first()
    
    if not record1 or not record2:
        raise HTTPException(status_code=404, detail="One or both priority records not found")
        
    # Swap priorities
    temp_priority = record1.priority
    record1.priority = record2.priority
    record2.priority = temp_priority
    
    db.commit()
    
    return {"message": "Priorities swapped successfully"}


@router.get("/part-priorities/order-wise", response_model=List[OrderWisePriority])
def get_order_wise_priorities(
    admin_id: Optional[int] = Query(None, description="Filter by admin_id owning the order"),
    manufacturing_coordinator_id: Optional[int] = Query(
        None, description="Filter by manufacturing_coordinator_id owning the order"
    ),
    db: Session = Depends(get_db),
):
    groups_query = (
        db.query(
            OrderPartPriority.order_id.label("order_id"),
            func.min(OrderPartPriority.priority).label("min_priority"),
            func.max(OrderPartPriority.priority).label("max_priority"),
            func.count(OrderPartPriority.id).label("part_count"),
        )
        .join(Part, OrderPartPriority.part_id == Part.id)
        .join(PartType, Part.type_id == PartType.id)
        .join(Order, OrderPartPriority.order_id == Order.id)
        .filter(func.lower(PartType.type_name) == "in-house")
    )
    if admin_id is not None:
        groups_query = groups_query.filter(Order.admin_id == admin_id)
    if manufacturing_coordinator_id is not None:
        groups_query = groups_query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)

    groups_subquery = groups_query.group_by(OrderPartPriority.order_id).subquery()

    rows = (
        db.query(
            Order.id,
            Order.sale_order_number,
            literal(None).label("project_name"),
            Product.product_name,
            groups_subquery.c.min_priority,
            groups_subquery.c.max_priority,
            groups_subquery.c.part_count,
        )
        .join(groups_subquery, Order.id == groups_subquery.c.order_id)
        .join(Product, Product.id == Order.product_id)
        .order_by(groups_subquery.c.min_priority.asc())
        .all()
    )

    result = []
    for row in rows:
        result.append(
            {
                "order_id": row.id,
                "sale_order_number": row.sale_order_number,
                "project_name": row.project_name,
                "product_name": row.product_name,
                "min_priority": row.min_priority,
                "max_priority": row.max_priority,
                "part_count": row.part_count,
            }
        )
    return result


class OrderWisePriorityUpdate(BaseModel):
    order_ids: List[int]
    admin_id: Optional[int] = None
    manufacturing_coordinator_id: Optional[int] = None


@router.put("/part-priorities/order-wise/reorder")
def reorder_order_wise_priorities(update: OrderWisePriorityUpdate, db: Session = Depends(get_db)):
    order_ids = update.order_ids
    admin_id = update.admin_id
    manufacturing_coordinator_id = update.manufacturing_coordinator_id
    if not order_ids:
        return {"message": "No changes"}

    # Limit existing IDs to those belonging to this admin / manufacturing coordinator, if provided
    existing_query = db.query(OrderPartPriority.order_id).join(Order, OrderPartPriority.order_id == Order.id)
    if admin_id is not None:
        existing_query = existing_query.filter(Order.admin_id == admin_id)
    if manufacturing_coordinator_id is not None:
        existing_query = existing_query.filter(Order.manufacturing_coordinator_id == manufacturing_coordinator_id)
    existing_ids = {row[0] for row in existing_query.distinct().all()}

    if set(order_ids) != existing_ids:
        raise HTTPException(status_code=400, detail="Order list does not match existing priorities for this admin")

    records_query = db.query(OrderPartPriority).join(Order, OrderPartPriority.order_id == Order.id)
    if admin_id is not None:
        records_query = records_query.filter(Order.admin_id == admin_id)
    records = records_query.order_by(OrderPartPriority.priority.asc()).all()

    grouped = {}
    for record in records:
        if record.order_id not in grouped:
            grouped[record.order_id] = []
        grouped[record.order_id].append(record)

    new_priority = 1
    for order_id in order_ids:
        items = grouped.get(order_id, [])
        items.sort(key=lambda r: r.priority)
        for item in items:
            item.priority = new_priority
            new_priority += 1

    db.commit()
    return {"message": "Order-wise priorities updated successfully"}

@router.put("/{order_id}/assign", response_model=OrderWithCustomerAndProduct)
def assign_order_to_manufacturing(
    order_id: int, payload: OrderAssign, db: Session = Depends(get_db)
):
    """
    Assign the order to a manufacturing coordinator.
    Typically called by admin after order creation.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    mc_user = db.query(AccessUser).filter(AccessUser.id == payload.manufacturing_coordinator_id).first()
    if not mc_user:
        raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")
    order.manufacturing_coordinator_id = payload.manufacturing_coordinator_id
    db.commit()
    from sqlalchemy.orm import joinedload
    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == order_id)
        .first()
    )
    return _order_to_response(order, db)


@router.put("/{order_id}", response_model=OrderWithCustomerAndProduct)
def update_order(order_id: int, order_update: OrderUpdate, db: Session = Depends(get_db)):
    """Update an order and return with company_name, product_name, and role names"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Trim and normalize the sale_order_number if it is being updated
    if order_update.sale_order_number is not None:
        order_update.sale_order_number = order_update.sale_order_number.strip().upper()

    # Case-insensitive check if new sale_order_number already exists for a different order
    if order_update.sale_order_number is not None and order_update.sale_order_number != order.sale_order_number:
        existing_order = (
            db.query(Order)
            .filter(
                func.lower(Order.sale_order_number) == order_update.sale_order_number.lower(),
                Order.id != order_id
            )
            .first()
        )
        if existing_order:
            raise HTTPException(
                status_code=400,
                detail=f"Order with Project Number '{order_update.sale_order_number}' already exists."
            )

    if order_update.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == order_update.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    if order_update.product_id is not None:
        product = db.query(Product).filter(Product.id == order_update.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
    if order_update.admin_id is not None:
        admin_user = db.query(AccessUser).filter(AccessUser.id == order_update.admin_id).first()
        if not admin_user:
            raise HTTPException(status_code=404, detail="Admin user not found")
    if order_update.project_coordinator_id is not None:
        pc_user = db.query(AccessUser).filter(AccessUser.id == order_update.project_coordinator_id).first()
        if not pc_user:
            raise HTTPException(status_code=404, detail="Project coordinator user not found")
    if order_update.manufacturing_coordinator_id is not None:
        mc_user = db.query(AccessUser).filter(AccessUser.id == order_update.manufacturing_coordinator_id).first()
        if not mc_user:
            raise HTTPException(status_code=404, detail="Manufacturing coordinator user not found")

    # Exclude legacy project_name field (column dropped, property is read-only)
    update_data = order_update.model_dump(exclude_unset=True, exclude={"project_name"})
    for field, value in update_data.items():
        setattr(order, field, value)
    db.commit()
    from sqlalchemy.orm import joinedload
    order = (
        db.query(Order)
        .options(
            joinedload(Order.customer),
            joinedload(Order.product),
            joinedload(Order.user),
            joinedload(Order.project_coordinator),
            joinedload(Order.admin),
            joinedload(Order.manufacturing_coordinator),
        )
        .filter(Order.id == order_id)
        .first()
    )
    return _order_to_response(order, db)

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """
    Delete an order and all its related data.
    
    If the product linked to this order has no other orders, 
    the product and all its related data will also be deleted (cascade).
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    product_id = order.product_id
    sale_order_number = order.sale_order_number
    other_orders_count = 0

    # Try to get MinIO client; if not initialized, skip MinIO deletion but still clean DB.
    try:
        minio_client = get_minio_client()
    except RuntimeError as e:
        print(f"Warning: {e}. Skipping MinIO file deletions for order {order_id}.")
        minio_client = None

    # Main deletion transaction: remove all related data and the order itself.
    # This block should either fully succeed or fully roll back.
    try:
        # Delete part_schedule_status records using a savepoint to avoid transaction abort
        # This table exists in the scheduling schema and uses sale_order_id (order_id)
        savepoint = db.begin_nested()
        try:
            db.execute(
                text("DELETE FROM scheduling.part_schedule_status WHERE sale_order_id = :order_id"),
                {"order_id": order_id}
            )
            savepoint.commit()
        except Exception as e:
            savepoint.rollback()
            print(f"Note: Could not delete from part_schedule_status (table may not exist or no records): {e}")
        
        # Delete component_issues records using a savepoint
        # This table exists in the maintenance schema
        savepoint = db.begin_nested()
        try:
            db.execute(
                text("DELETE FROM maintenance.component_issues WHERE production_order_id = :order_id"),
                {"order_id": order_id}
            )
            savepoint.commit()
        except Exception as e:
            savepoint.rollback()
            print(f"Note: Could not delete from component_issues (table may not exist or no records): {e}")
        
        # Delete order documents and their MinIO files
        order_docs = db.query(OrderDocument).filter(OrderDocument.order_id == order_id).all()
        for order_doc in order_docs:
            # Best-effort MinIO delete when client is available
            if minio_client:
                try:
                    object_name = order_doc.document_url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
                except Exception as e:
                    print(f"Error deleting order document from MinIO: {e}")
            db.delete(order_doc)

        # Delete order part priorities
        db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).delete()

        # Delete order-parts raw material links
        db.query(OrderPartsRawMaterialLinked).filter(
            OrderPartsRawMaterialLinked.order_id == order_id
        ).delete()

        # Delete inventory-related records using raw SQL to respect FK relationships
        # 1) Delete tool issues that reference inventory requests for this order
        db.execute(
            text(
                """
                DELETE FROM inventory.tool_issues
                WHERE request_id IN (
                    SELECT id FROM inventory.inventory_requests
                    WHERE project_id = :order_id
                )
                """
            ),
            {"order_id": order_id},
        )

        # 2) Delete return requests that reference inventory requests for this order
        db.execute(
            text(
                """
                DELETE FROM inventory.inventory_return_requests
                WHERE requested_id IN (
                    SELECT id FROM inventory.inventory_requests
                    WHERE project_id = :order_id
                )
                """
            ),
            {"order_id": order_id},
        )

        # 3) Delete the inventory requests themselves
        db.execute(
            text(
                """
                DELETE FROM inventory.inventory_requests
                WHERE project_id = :order_id
                """
            ),
            {"order_id": order_id},
        )

        # Delete out source part status records linked to this order
        db.execute(
            text(
                """
                DELETE FROM oms.out_source_parts_status
                WHERE order_id = :order_id
                """
            ),
            {"order_id": order_id},
        )

        # Delete order-level schedule status records (scheduling.order_schedule_status)
        # to satisfy FK constraint order_schedule_status_order_id_fkey
        db.execute(
            text(
                """
                DELETE FROM scheduling.order_schedule_status
                WHERE order_id = :order_id
                """
            ),
            {"order_id": order_id},
        )

        # Delete pokayoke logs
        pokayoke_logs = (
            db.query(PokayokeCompletedLog)
            .filter(PokayokeCompletedLog.production_order_id == order_id)
            .all()
        )
        for log in pokayoke_logs:
            db.delete(log)

        db.flush()

        # Check if product has other orders
        other_orders_count = (
            db.query(Order)
            .filter(Order.product_id == product_id, Order.id != order_id)
            .count()
        )

        # Delete the order
        db.delete(order)
        db.flush()

        # Always delete the product and all related data when an order is deleted (Scenario 3)
        delete_product_cascade(db, product_id)

        db.commit()

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting order: {str(e)}"
        )

    # Best-effort resequencing of remaining priorities.
    # If this fails for any reason, the order deletion should still be considered successful.
    try:
        remaining_priorities = (
            db.query(OrderPartPriority)
            .order_by(OrderPartPriority.priority.asc())
            .all()
        )
        for index, record in enumerate(remaining_priorities):
            record.priority = index + 1

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Warning: could not resequence order priorities after deleting order {order_id}: {e}")

    return {
        "message": "Order deleted successfully",
        "product_also_deleted": True,
    }

# @router.get("/sale-order/{sale_order_number}/parts", response_model=List[PartResponse])
# def get_order_parts(sale_order_number: str, db: Session = Depends(get_db)):
#     """
#     Get all parts associated with a specific sale order.
#     1. Finds the order by sale_order_number.
#     2. Identifies the product associated with the order.
#     3. Returns all parts linked to that product.
#     """
#     # 1. Find the order
#     order = db.query(Order).filter(Order.sale_order_number == sale_order_number).first()
#     if not order:
#         raise HTTPException(
#             status_code=404, 
#             detail=f"Order with sale_order_number {sale_order_number} not found"
#         )
    
#     # 2. Get the product_id
#     product_id = order.product_id
    
#     # 3. Find all parts for this product
#     parts = db.query(Part).filter(Part.product_id == product_id).all()
    
#     return parts
