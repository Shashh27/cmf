from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import List
from datetime import datetime
from DB.database import get_db
from DB.models.oms import Order, Product, OrderDocument, Part, OrderPartPriority
from DB.models.configuration import Customer
from DB.models.access_control import AccessUser
from DB.schemas.oms import (
    Order as OrderResponse,
    OrderCreate,
    OrderUpdate,
    OrderWithCustomer,
    OrderWithCustomerAndProduct,
    OrderWithHierarchy,
    OrderPartPriority as OrderPartPrioritySchema,
    OrderPartPriorityUpdate,
    OrderPartPriorityGlobalUpdate,
    OrderPartPrioritySwap,
    OrderWisePriority,
)
from .products import fetch_product_hierarchy

router = APIRouter(prefix="/orders", tags=["orders"])

# CRUD operations
@router.post("/", response_model=OrderResponse)
def create_order(order: OrderCreate, db: Session = Depends(get_db)):
    """Create a new order"""
    # Check if customer exists
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Check if user exists
    user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Check if project coordinator exists if provided
    if order.project_coordinator_id is not None:
        project_coordinator = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first()
        if not project_coordinator:
            raise HTTPException(status_code=404, detail="Project coordinator not found")
    # Check if manufacturing coordinator exists if provided
    if order.manufacturing_coordinator_id is not None:
        manufacturing_coordinator = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first()
        if not manufacturing_coordinator:
            raise HTTPException(status_code=404, detail="Manufacturing coordinator not found")
    
    db_order = Order(**order.dict())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    # Populate default part priorities (FIFO based on creation)
    parts = db.query(Part).filter(Part.product_id == db_order.product_id).order_by(Part.id.asc()).all()
    
    # Get current max priority globally
    max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0
    
    for index, part in enumerate(parts):
        priority_entry = OrderPartPriority(
            order_id=db_order.id,
            product_id=db_order.product_id,
            part_id=part.id,
            priority=max_priority + 1 + index
        )
        db.add(priority_entry)
    
    db.commit()

    return db_order

@router.get("/", response_model=List[OrderWithCustomerAndProduct])
def get_orders(skip: int = 0, limit: int = 100, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get orders with company_name, product_name, and user_name. If user_id is provided, filter by that owner."""
    query = db.query(Order).order_by(Order.id.asc())
    if user_id is not None:
        query = query.filter(Order.user_id == user_id)
    orders = query.offset(skip).limit(limit).all()
    result = []
    for order in orders:
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        company_name = customer.company_name if customer else None
        product = db.query(Product).filter(Product.id == order.product_id).first()
        product_name = product.product_name if product else None
        user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
        user_name = user.user_name if user else None
        project_coordinator = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first() if order.project_coordinator_id else None
        manufacturing_coordinator = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first() if order.manufacturing_coordinator_id else None
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "user_id": order.user_id or 0,
            "project_coordinator_id": order.project_coordinator_id,
            "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
            "company_name": company_name,
            "product_name": product_name,
            "user_name": user_name,
            "project_coordinator_name": project_coordinator.user_name if project_coordinator else None,
            "manufacturing_coordinator_name": manufacturing_coordinator.user_name if manufacturing_coordinator else None
        }
        result.append(order_dict)
    return result

@router.get("/with-customers", response_model=List[OrderWithCustomer])
def get_orders_with_customers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all orders with customer information"""
    from sqlalchemy.orm import joinedload
    orders = db.query(Order).options(joinedload(Order.customer)).order_by(Order.id.asc()).offset(skip).limit(limit).all()
    result = []
    for order in orders:
        user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
        user_name = user.user_name if user else None
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "user_id": order.user_id or 0,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
            "user_name": user_name,
            "customer": {
                "id": order.customer.id,
                "company_name": order.customer.company_name,
                "address": order.customer.address,
                "branch": order.customer.branch,
                "email": order.customer.email,
                "contact_number": order.customer.contact_number,
                "contact_person": order.customer.contact_person
            }
        }
        result.append(order_dict)
    return result

@router.get("/{order_id}/hierarchical", response_model=OrderWithHierarchy)
def get_order_hierarchical_data(order_id: int, db: Session = Depends(get_db)):
    """Get order with full product hierarchy including tools"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
    user_name = user.user_name if user else None
    
    # Fetch hierarchy using the helper from products router
    hierarchy = fetch_product_hierarchy(db, order.product_id)
    
    # Inject priorities from OrderPartPriority
    priorities = db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).all()
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
    
    return {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "user_id": order.user_id or 0,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name,
        "user_name": user_name,
        "product_hierarchy": hierarchy
    }


@router.get("/{order_id}", response_model=OrderWithCustomerAndProduct)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get a specific order by ID with company_name and product_name"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
    user_name = user.user_name if user else None
    project_coordinator = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first() if order.project_coordinator_id else None
    manufacturing_coordinator = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first() if order.manufacturing_coordinator_id else None
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "user_id": order.user_id or 0,
        "project_coordinator_id": order.project_coordinator_id,
        "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name,
        "user_name": user_name,
        "project_coordinator_name": project_coordinator.user_name if project_coordinator else None,
        "manufacturing_coordinator_name": manufacturing_coordinator.user_name if manufacturing_coordinator else None
    }
    return order_dict

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
    parts = db.query(Part).filter(Part.product_id == order.product_id).order_by(Part.id.asc()).all()
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
    priorities = db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).order_by(OrderPartPriority.priority.asc()).all()
    
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
            "part_number": p.part.part_number if p.part else None
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
def get_all_part_priorities(db: Session = Depends(get_db)):
    """Get all part priorities globally with details"""
    priorities = db.query(OrderPartPriority).order_by(OrderPartPriority.priority.asc()).all()
    
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
            "project_name": p.order.project_name if p.order else None,
            "product_name": p.product.product_name if p.product else None
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
def get_order_wise_priorities(db: Session = Depends(get_db)):
    groups_subquery = (
        db.query(
            OrderPartPriority.order_id.label("order_id"),
            func.min(OrderPartPriority.priority).label("min_priority"),
            func.max(OrderPartPriority.priority).label("max_priority"),
            func.count(OrderPartPriority.id).label("part_count"),
        )
        .group_by(OrderPartPriority.order_id)
        .subquery()
    )

    rows = (
        db.query(
            Order.id,
            Order.sale_order_number,
            Order.project_name,
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


@router.put("/part-priorities/order-wise/reorder")
def reorder_order_wise_priorities(update: OrderWisePriorityUpdate, db: Session = Depends(get_db)):
    order_ids = update.order_ids
    if not order_ids:
        return {"message": "No changes"}

    existing_ids = {row[0] for row in db.query(OrderPartPriority.order_id).distinct().all()}
    if set(order_ids) != existing_ids:
        raise HTTPException(status_code=400, detail="Order list does not match existing priorities")

    records = db.query(OrderPartPriority).order_by(OrderPartPriority.priority.asc()).all()

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

@router.put("/{order_id}", response_model=OrderWithCustomerAndProduct)
def update_order(order_id: int, order_update: OrderUpdate, db: Session = Depends(get_db)):
    """Update an order and return with company_name and product_name"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order_update.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == order_update.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    if order_update.product_id is not None:
        product = db.query(Product).filter(Product.id == order_update.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        
        # If product is changing, update priorities
        if order.product_id != order_update.product_id:
            from sqlalchemy import func
            
            # Delete old priorities
            db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).delete()
            
            # Add new priorities
            parts = db.query(Part).filter(Part.product_id == order_update.product_id).order_by(Part.id.asc()).all()
            
            # Get current max priority globally
            max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0
            
            for index, part in enumerate(parts):
                priority_entry = OrderPartPriority(
                    order_id=order.id,
                    product_id=order_update.product_id,
                    part_id=part.id,
                    priority=max_priority + 1 + index
                )
                db.add(priority_entry)
    if order_update.project_coordinator_id is not None:
        project_coordinator = db.query(AccessUser).filter(AccessUser.id == order_update.project_coordinator_id).first()
        if not project_coordinator:
            raise HTTPException(status_code=404, detail="Project coordinator not found")
    if order_update.manufacturing_coordinator_id is not None:
        manufacturing_coordinator = db.query(AccessUser).filter(AccessUser.id == order_update.manufacturing_coordinator_id).first()
        if not manufacturing_coordinator:
            raise HTTPException(status_code=404, detail="Manufacturing coordinator not found")
            
    update_data = order_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(order, field, value)
    db.commit()
    db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    user = db.query(AccessUser).filter(AccessUser.id == order.user_id).first()
    user_name = user.user_name if user else None
    project_coordinator = db.query(AccessUser).filter(AccessUser.id == order.project_coordinator_id).first() if order.project_coordinator_id else None
    manufacturing_coordinator = db.query(AccessUser).filter(AccessUser.id == order.manufacturing_coordinator_id).first() if order.manufacturing_coordinator_id else None
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "user_id": order.user_id,
        "project_coordinator_id": order.project_coordinator_id,
        "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name,
        "user_name": user_name,
        "project_coordinator_name": project_coordinator.user_name if project_coordinator else None,
        "manufacturing_coordinator_name": manufacturing_coordinator.user_name if manufacturing_coordinator else None
    }
    return order_dict

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    """Delete an order"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if order has related customer documents
    related_documents = db.query(OrderDocument).filter(OrderDocument.order_id == order_id).all()
    if related_documents:
        document_names = [doc.document_name for doc in related_documents]
        raise HTTPException(
            status_code=400,
            detail=f"This order cannot be deleted because it has related documents: {', '.join(document_names)}. Please delete the documents first."
        )
    
    # Delete related OrderPartPriority entries first
    db.query(OrderPartPriority).filter(OrderPartPriority.order_id == order_id).delete()
    
    # Delete related inventory_requests entries (handle foreign key constraint)
    db.execute(text("DELETE FROM inventory.inventory_requests WHERE project_id = :project_id"), {"project_id": order_id})
    
    db.delete(order)
    db.commit()

    # Re-sequence remaining priorities to fill gaps while maintaining relative order
    remaining_priorities = db.query(OrderPartPriority).order_by(OrderPartPriority.priority.asc()).all()
    for index, record in enumerate(remaining_priorities):
        record.priority = index + 1
    
    db.commit()
    
    return {"message": "Order deleted successfully"}

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
