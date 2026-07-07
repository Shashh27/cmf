from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List

from DB.database import get_db
from DB.models.oms import Order as OrderModel, OrderAdditionalCost as OrderAdditionalCostModel
from DB.schemas.oms import (
    OrderAdditionalCost as OrderAdditionalCostSchema,
    OrderAdditionalCostCreate,
    OrderAdditionalCostUpdate,
)

router = APIRouter(
    prefix="/orders/{order_id}/additional-costs",
    tags=["order_additional_costs"]
)


@router.get("/", response_model=List[OrderAdditionalCostSchema])
def get_order_additional_costs(order_id: int, db: Session = Depends(get_db)):
    """
    Get all additional cost fields for a specific order.
    """
    # Verify order exists
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Get all additional costs for this order
    costs = db.query(OrderAdditionalCostModel).filter(
        OrderAdditionalCostModel.order_id == order_id
    ).all()
    
    return costs


@router.post("/", response_model=OrderAdditionalCostSchema, status_code=status.HTTP_201_CREATED)
def create_order_additional_cost(
    order_id: int, 
    cost: OrderAdditionalCostCreate, 
    db: Session = Depends(get_db)
):
    """
    Add a new cost field to an order.
    """
    # Verify order exists
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Validate cost_name is not empty
    if not cost.cost_name or cost.cost_name.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cost name cannot be empty"
        )
    
    # Validate cost_value is positive
    if cost.cost_value < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cost value cannot be negative"
        )
    
    # Create new cost record
    db_cost = OrderAdditionalCostModel(
        order_id=order_id,
        cost_name=cost.cost_name.strip(),
        cost_value=cost.cost_value,
        user_id=cost.user_id
    )
    
    db.add(db_cost)
    db.commit()
    db.refresh(db_cost)
    
    return db_cost


@router.put("/{cost_id}", response_model=OrderAdditionalCostSchema)
def update_order_additional_cost(
    order_id: int,
    cost_id: int,
    cost: OrderAdditionalCostUpdate,
    db: Session = Depends(get_db)
):
    """
    Update an existing cost field for an order.
    """
    # Verify order exists
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Get the cost record
    db_cost = db.query(OrderAdditionalCostModel).filter(
        OrderAdditionalCostModel.id == cost_id,
        OrderAdditionalCostModel.order_id == order_id
    ).first()
    
    if not db_cost:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cost record with id {cost_id} not found for order {order_id}"
        )
    
    # Validate cost_name if provided
    if cost.cost_name is not None:
        if cost.cost_name.strip() == "":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cost name cannot be empty"
            )
        db_cost.cost_name = cost.cost_name.strip()
    
    # Validate cost_value if provided
    if cost.cost_value is not None:
        if cost.cost_value < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cost value cannot be negative"
            )
        db_cost.cost_value = cost.cost_value
    
    # Update user_id if provided
    if cost.user_id is not None:
        db_cost.user_id = cost.user_id
    
    db.commit()
    db.refresh(db_cost)
    
    return db_cost


@router.delete("/{cost_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order_additional_cost(
    order_id: int,
    cost_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a cost field from an order.
    """
    # Verify order exists
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Get the cost record
    db_cost = db.query(OrderAdditionalCostModel).filter(
        OrderAdditionalCostModel.id == cost_id,
        OrderAdditionalCostModel.order_id == order_id
    ).first()
    
    if not db_cost:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cost record with id {cost_id} not found for order {order_id}"
        )
    
    db.delete(db_cost)
    db.commit()
    
    return None


@router.get("/summary", response_model=dict)
def get_order_costs_summary(order_id: int, db: Session = Depends(get_db)):
    """
    Get summary of additional costs for an order including subtotal.
    """
    # Verify order exists
    order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {order_id} not found"
        )
    
    # Get all additional costs for this order
    costs = db.query(OrderAdditionalCostModel).filter(
        OrderAdditionalCostModel.order_id == order_id
    ).all()
    
    # Calculate subtotal
    subtotal = sum(cost.cost_value for cost in costs)
    
    return {
        "order_id": order_id,
        "costs": [
            {
                "id": cost.id,
                "cost_name": cost.cost_name,
                "cost_value": cost.cost_value
            }
            for cost in costs
        ],
        "subtotal": subtotal,
        "total_cost_fields": len(costs)
    }


@router.get("/all-cost-names", response_model=List[str])
def get_all_cost_names(db: Session = Depends(get_db)):
    """
    Get all unique cost names across all orders.
    Useful for showing available cost types.
    """
    # Get distinct cost names from all cost records
    cost_names = db.query(OrderAdditionalCostModel.cost_name).distinct().all()
    
    # Extract names from tuples and return as list
    return [name[0] for name in cost_names if name[0]]
