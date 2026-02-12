from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from datetime import datetime
from DB.database import get_db
from DB.models.oms import Order, Product, OrderDocument, Part, OrderPartPriority
from DB.models.configuration import Customer
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
    OrderPartPrioritySwap
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
    
    db_order = Order(**order.dict())
    db.add(db_order)
    db.commit()
    db.refresh(db_order)

    from sqlalchemy import func
    
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
def get_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all orders with company_name and product_name"""
    orders = db.query(Order).order_by(Order.id.asc()).offset(skip).limit(limit).all()
    result = []
    for order in orders:
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        company_name = customer.company_name if customer else None
        product = db.query(Product).filter(Product.id == order.product_id).first()
        product_name = product.product_name if product else None
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
            "company_name": company_name,
            "product_name": product_name
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
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "order_date": order.order_date,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "status": order.status,
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
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name,
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
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name
    }
    return order_dict

@router.get("/customer/{customer_id}", response_model=List[OrderResponse])
def get_orders_by_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get all orders for a specific customer"""
    orders = db.query(Order).filter(Order.customer_id == customer_id).order_by(Order.id.asc()).all()
    return orders

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
            
    update_data = order_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(order, field, value)
    db.commit()
    db.refresh(order)
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name
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
