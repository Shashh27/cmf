from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from typing import List
from DB.database import get_db
from DB.models.configuration import Customer
from DB.models.oms import Order as OrderModel
from DB.schemas.configuration import Customer as CustomerResponse, CustomerCreate, CustomerUpdate

router = APIRouter(prefix="/customers", tags=["customers"])

# CRUD operations
@router.post("/", response_model=CustomerResponse)
def create_customer(customer: CustomerCreate, db: Session = Depends(get_db)):
    """Create a new customer"""
    db_customer = Customer(**customer.dict())
    db.add(db_customer)
    db.commit()
    db.refresh(db_customer)
    return db_customer

@router.get("/", response_model=List[CustomerResponse])
def get_customers(db: Session = Depends(get_db)):
    """Get all customers"""
    customers = db.query(Customer).order_by(Customer.id.asc()).all()
    return customers

@router.get("/{customer_id}", response_model=CustomerResponse)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    """Get a specific customer by ID"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer

@router.put("/{customer_id}", response_model=CustomerResponse)
def update_customer(customer_id: int, customer_update: CustomerUpdate, db: Session = Depends(get_db)):
    """Update a customer"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    update_data = customer_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    
    db.commit()
    db.refresh(customer)
    return customer

@router.delete("/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    """Delete a customer"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    # Check if customer has existing orders
    existing_orders = db.query(OrderModel).filter(
        OrderModel.customer_id == customer_id
    ).first()
    if existing_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete customer '{customer.company_name}' — they have existing orders. "
                   "Remove or reassign those orders first."
        )
    
    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted successfully"}
