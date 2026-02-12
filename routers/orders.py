from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime
from DB.database import get_db
from DB.models.oms import Order, Product, OrderDocument, Part
from DB.models.configuration import Customer
from DB.schemas.oms import Order as OrderResponse, OrderCreate, OrderUpdate, OrderWithCustomer, OrderWithCustomerAndProduct, Part as PartResponse

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
    orders = db.query(Order).options(joinedload(Order.customer)).offset(skip).limit(limit).all()
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
    orders = db.query(Order).filter(Order.customer_id == customer_id).all()
    return orders

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
    
    db.delete(order)
    db.commit()
    return {"message": "Order deleted successfully"}

@router.get("/sale-order/{sale_order_number}/parts", response_model=List[PartResponse])
def get_order_parts(sale_order_number: str, db: Session = Depends(get_db)):
    """
    Get all parts associated with a specific sale order.
    1. Finds the order by sale_order_number.
    2. Identifies the product associated with the order.
    3. Returns all parts linked to that product.
    """
    # 1. Find the order
    order = db.query(Order).filter(Order.sale_order_number == sale_order_number).first()
    if not order:
        raise HTTPException(
            status_code=404, 
            detail=f"Order with sale_order_number {sale_order_number} not found"
        )
    
    # 2. Get the product_id
    product_id = order.product_id
    
    # 3. Find all parts for this product
    parts = db.query(Part).filter(Part.product_id == product_id).all()
    
    return parts
