from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel
from DB.models.oms import OrderPartsRawMaterialLinked
from DB.schemas.inventory import RawMaterial, RawMaterialCreate, RawMaterialUpdate

router = APIRouter(
    prefix="/rawmaterials",
    tags=["rawmaterials"]
)


@router.post("/", response_model=RawMaterial, status_code=status.HTTP_201_CREATED)
def create_raw_material(raw_material: RawMaterialCreate, db: Session = Depends(get_db)):
    """Create a new raw material"""
    data = raw_material.model_dump()
    qty = data.get("quantity") or 0
    data["quantity"] = qty
    data["status"] = "AVAILABLE" if qty > 0 else "NOT AVAILABLE"
    db_raw_material = RawMaterialModel(**data)
    db.add(db_raw_material)
    db.commit()
    db.refresh(db_raw_material)
    return db_raw_material


@router.get("/", response_model=List[RawMaterial])
def get_raw_materials(db: Session = Depends(get_db)):
    """Get all raw materials"""
    return db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()


@router.get("/{raw_material_id}", response_model=RawMaterial)
def get_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Get a specific raw material by ID"""
    raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )
    return raw_material


@router.put("/{raw_material_id}", response_model=RawMaterial)
def update_raw_material(raw_material_id: int, raw_material: RawMaterialUpdate, db: Session = Depends(get_db)):
    """Update a raw material"""
    db_raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not db_raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )

    update_data = raw_material.model_dump(exclude_unset=True)

    if "quantity" in update_data:
        qty = update_data.get("quantity") or 0
        update_data["quantity"] = qty
        update_data["status"] = "AVAILABLE" if qty > 0 else "NOT AVAILABLE"

    for field, value in update_data.items():
        setattr(db_raw_material, field, value)

    db.commit()
    db.refresh(db_raw_material)
    return db_raw_material


@router.delete("/{raw_material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Delete a raw material"""
    db_raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not db_raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )
    
    # Check if raw material is used in order_parts_raw_material_linked table
    related_linkages = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.raw_material_id == raw_material_id).all()
    if related_linkages:
        # Get order numbers for related linkages
        order_ids = [linkage.order_id for linkage in related_linkages]
        from DB.models import Order
        orders = db.query(Order).filter(Order.id.in_(order_ids)).all()
        order_numbers = [order.sale_order_number for order in orders]
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This rawmaterial cannot be deleted because it is linked to existing orders: {', '.join(order_numbers)}. Please remove or update the related orders first."
        )

    db.delete(db_raw_material)
    db.commit()
    return None
