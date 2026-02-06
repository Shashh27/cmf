from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from DB.database import get_db
from DB.models.oms import Order, Product, OrderDocument
from DB.models.configuration import Customer
from DB.schemas.oms import Order as OrderResponse, OrderCreate, OrderUpdate, OrderWithCustomer, OrderWithCustomerAndProduct

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
    return db_order

@router.get("/", response_model=List[OrderWithCustomerAndProduct])
def get_orders(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all orders with company_name and product_name"""
    orders = db.query(Order).offset(skip).limit(limit).all()
    result = []
    for order in orders:
        # Get customer name
        customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
        company_name = customer.company_name if customer else None
        
        # Get product name
        product = db.query(Product).filter(Product.id == order.product_id).first()
        product_name = product.product_name if product else None
        
        # Create order dict with additional fields
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "priority": order.priority,
            "supervisor_id": order.supervisor_id,
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
    
    orders = db.query(Order).options(joinedload(Order.customer)).offset(skip).limit(limit).all()
    result = []
    for order in orders:
        order_dict = {
            "id": order.id,
            "sale_order_number": order.sale_order_number,
            "customer_id": order.customer_id,
            "product_id": order.product_id,
            "quantity": order.quantity,
            "due_date": order.due_date,
            "priority": order.priority,
            "supervisor_id": order.supervisor_id,
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

@router.get("/{order_id}", response_model=OrderWithCustomerAndProduct)
def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get a specific order by ID with company_name and product_name"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Get customer name
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    
    # Get product name
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    
    # Create order dict with additional fields
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "priority": order.priority,
        "supervisor_id": order.supervisor_id,
        "status": order.status,
        "company_name": company_name,
        "product_name": product_name
    }
    return order_dict

@router.get("/customer/{customer_id}", response_model=List[OrderResponse])
def get_orders_by_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get all orders for a specific customer"""
    orders = db.query(Order).filter(Order.customer_id == customer_id).all()
    return orders

@router.put("/{order_id}", response_model=OrderWithCustomerAndProduct)
def update_order(order_id: int, order_update: OrderUpdate, db: Session = Depends(get_db)):
    """Update an order and return with company_name and product_name"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Check if customer exists if customer_id is being updated
    if order_update.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == order_update.customer_id).first()
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check if product exists if product_id is being updated
    if order_update.product_id is not None:
        product = db.query(Product).filter(Product.id == order_update.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
    
    update_data = order_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(order, field, value)
    
    db.commit()
    db.refresh(order)
    
    # Get customer name
    customer = db.query(Customer).filter(Customer.id == order.customer_id).first()
    company_name = customer.company_name if customer else None
    
    # Get product name
    product = db.query(Product).filter(Product.id == order.product_id).first()
    product_name = product.product_name if product else None
    
    # Create order dict with additional fields
    order_dict = {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "priority": order.priority,
        "supervisor_id": order.supervisor_id,
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
    
    db.delete(order)
    db.commit()
    return {"message": "Order deleted successfully"}
