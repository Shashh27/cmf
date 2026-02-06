from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from DB.database import get_db
from DB.models.oms import OrderPartsRawMaterialLinked, Part, Order
from DB.models.inventory import RawMaterial
from DB.schemas.oms import (
    OrderPartsRawMaterialLinked as OrderPartsRawMaterialLinkedResponse,
    OrderPartsRawMaterialLinkedCreate,
    OrderPartsRawMaterialLinkedUpdate,
    OrderPartsRawMaterialLinkedWithDetails
)

router = APIRouter(
    prefix="/order-parts-raw-material-linked",
    tags=["order-parts-raw-material-linked"]
)


# Helper schemas for bulk operations
class BulkCreateRequest(BaseModel):
    raw_material_ids: List[int]
    part_ids: List[int]
    order_id: int



@router.post("/bulk", response_model=List[OrderPartsRawMaterialLinkedWithDetails], status_code=status.HTTP_201_CREATED)
def create_bulk_linkages(request: BulkCreateRequest, db: Session = Depends(get_db)):
    """Create bulk order-parts-raw-material linkages (1:1, 1:n, n:1 only)"""
    # Validate order
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Validate that we don't have n:n relationship (both arrays with multiple items)
    if len(request.raw_material_ids) > 1 and len(request.part_ids) > 1:
        raise HTTPException(
            status_code=400, 
            detail="n:n relationship is not supported. Please use either 1:n (one raw material, multiple parts) or n:1 (multiple raw materials, one part)."
        )
    
    created_linkages = []
    
    # Create linkages for valid combinations
    for raw_material_id in request.raw_material_ids:
        for part_id in request.part_ids:
            # Validate raw material
            raw_material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
            if not raw_material:
                raise HTTPException(status_code=404, detail=f"Raw material with id {raw_material_id} not found")
            
            # Validate part
            part = db.query(Part).filter(Part.id == part_id).first()
            if not part:
                raise HTTPException(status_code=404, detail=f"Part with id {part_id} not found")
            
            # Check if linkage already exists
            existing = db.query(OrderPartsRawMaterialLinked).filter(
                OrderPartsRawMaterialLinked.raw_material_id == raw_material_id,
                OrderPartsRawMaterialLinked.part_id == part_id,
                OrderPartsRawMaterialLinked.order_id == request.order_id
            ).first()
            if existing:
                continue  # Skip existing linkages
            
            # Create new linkage
            db_linkage = OrderPartsRawMaterialLinked(
                raw_material_id=raw_material_id,
                part_id=part_id,
                order_id=request.order_id
            )
            db.add(db_linkage)
            db.commit()
            db.refresh(db_linkage)
            
            # Create response dict
            response_dict = {
                "id": db_linkage.id,
                "raw_material_id": db_linkage.raw_material_id,
                "part_id": db_linkage.part_id,
                "order_id": db_linkage.order_id,
                "created_at": db_linkage.created_at.isoformat() if db_linkage.created_at else None,
                "material_name": raw_material.material_name,
                "part_name": part.part_name,
                "sale_order_number": order.sale_order_number
            }
            created_linkages.append(response_dict)
    
    return created_linkages


@router.get("/", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_all_linkages(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all order-parts-raw-material linkages with details"""
    linkages = db.query(OrderPartsRawMaterialLinked).offset(skip).limit(limit).all()
    result = []
    
    for linkage in linkages:
        # Get related data
        raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
        part = db.query(Part).filter(Part.id == linkage.part_id).first()
        order = db.query(Order).filter(Order.id == linkage.order_id).first()
        
        response_dict = {
            "id": linkage.id,
            "raw_material_id": linkage.raw_material_id,
            "part_id": linkage.part_id,
            "order_id": linkage.order_id,
            "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
            "material_name": raw_material.material_name if raw_material else None,
            "part_name": part.part_name if part else None,
            "sale_order_number": order.sale_order_number if order else None
        }
        result.append(response_dict)
    
    return result


@router.get("/{linkage_id}", response_model=OrderPartsRawMaterialLinkedWithDetails)
def get_linkage(linkage_id: int, db: Session = Depends(get_db)):
    """Get a specific order-parts-raw-material linkage by ID"""
    linkage = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id).first()
    if not linkage:
        raise HTTPException(status_code=404, detail="Linkage not found")
    
    # Get related data
    raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
    part = db.query(Part).filter(Part.id == linkage.part_id).first()
    order = db.query(Order).filter(Order.id == linkage.order_id).first()
    
    response_dict = {
        "id": linkage.id,
        "raw_material_id": linkage.raw_material_id,
        "part_id": linkage.part_id,
        "order_id": linkage.order_id,
        "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
        "material_name": raw_material.material_name if raw_material else None,
        "part_name": part.part_name if part else None,
        "sale_order_number": order.sale_order_number if order else None
    }
    return response_dict


@router.get("/order/{order_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_order(order_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific order"""
    # Validate order exists
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    linkages = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.order_id == order_id).all()
    result = []
    
    for linkage in linkages:
        # Get related data
        raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
        part = db.query(Part).filter(Part.id == linkage.part_id).first()
        
        response_dict = {
            "id": linkage.id,
            "raw_material_id": linkage.raw_material_id,
            "part_id": linkage.part_id,
            "order_id": linkage.order_id,
            "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
            "material_name": raw_material.material_name if raw_material else None,
            "part_name": part.part_name if part else None,
            "sale_order_number": order.sale_order_number
        }
        result.append(response_dict)
    
    return result


@router.get("/part/{part_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific part"""
    # Validate part exists
    part = db.query(Part).filter(Part.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    
    linkages = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.part_id == part_id).all()
    result = []
    
    for linkage in linkages:
        # Get related data
        raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
        order = db.query(Order).filter(Order.id == linkage.order_id).first()
        
        response_dict = {
            "id": linkage.id,
            "raw_material_id": linkage.raw_material_id,
            "part_id": linkage.part_id,
            "order_id": linkage.order_id,
            "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
            "material_name": raw_material.material_name if raw_material else None,
            "part_name": part.part_name,
            "sale_order_number": order.sale_order_number if order else None
        }
        result.append(response_dict)
    
    return result


@router.get("/raw-material/{raw_material_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific raw material"""
    # Validate raw material exists
    raw_material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
    if not raw_material:
        raise HTTPException(status_code=404, detail="Raw material not found")
    
    linkages = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.raw_material_id == raw_material_id).all()
    result = []
    
    for linkage in linkages:
        # Get related data
        part = db.query(Part).filter(Part.id == linkage.part_id).first()
        order = db.query(Order).filter(Order.id == linkage.order_id).first()
        
        response_dict = {
            "id": linkage.id,
            "raw_material_id": linkage.raw_material_id,
            "part_id": linkage.part_id,
            "order_id": linkage.order_id,
            "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
            "material_name": raw_material.material_name,
            "part_name": part.part_name if part else None,
            "sale_order_number": order.sale_order_number if order else None
        }
        result.append(response_dict)
    
    return result


@router.put("/{linkage_id}", response_model=OrderPartsRawMaterialLinkedWithDetails)
def update_linkage(linkage_id: int, linkage_update: OrderPartsRawMaterialLinkedUpdate, db: Session = Depends(get_db)):
    """Update an order-parts-raw-material linkage"""
    linkage = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id).first()
    if not linkage:
        raise HTTPException(status_code=404, detail="Linkage not found")
    
    # Validate foreign keys if they are being updated
    if linkage_update.raw_material_id is not None:
        raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage_update.raw_material_id).first()
        if not raw_material:
            raise HTTPException(status_code=404, detail="Raw material not found")
    
    if linkage_update.part_id is not None:
        part = db.query(Part).filter(Part.id == linkage_update.part_id).first()
        if not part:
            raise HTTPException(status_code=404, detail="Part not found")
    
    if linkage_update.order_id is not None:
        order = db.query(Order).filter(Order.id == linkage_update.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
    
    # Update fields
    update_data = linkage_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(linkage, field, value)
    
    db.commit()
    db.refresh(linkage)
    
    # Get updated related data
    raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
    part = db.query(Part).filter(Part.id == linkage.part_id).first()
    order = db.query(Order).filter(Order.id == linkage.order_id).first()
    
    response_dict = {
        "id": linkage.id,
        "raw_material_id": linkage.raw_material_id,
        "part_id": linkage.part_id,
        "order_id": linkage.order_id,
        "created_at": linkage.created_at.isoformat() if linkage.created_at else None,
        "material_name": raw_material.material_name if raw_material else None,
        "part_name": part.part_name if part else None,
        "sale_order_number": order.sale_order_number if order else None
    }
    return response_dict


@router.delete("/{linkage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_linkage(linkage_id: int, db: Session = Depends(get_db)):
    """Delete an order-parts-raw-material linkage"""
    linkage = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id).first()
    if not linkage:
        raise HTTPException(status_code=404, detail="Linkage not found")
    
    db.delete(linkage)
    db.commit()
    return None


@router.delete("/bulk", status_code=status.HTTP_204_NO_CONTENT)
def delete_bulk_linkages(linkage_ids: List[int], db: Session = Depends(get_db)):
    """Delete multiple order-parts-raw-material linkages"""
    if not linkage_ids:
        raise HTTPException(status_code=400, detail="No linkage IDs provided")
    
    # Find all linkages to delete
    linkages = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id.in_(linkage_ids)).all()
    
    if not linkages:
        raise HTTPException(status_code=404, detail="No linkages found with provided IDs")
    
    for linkage in linkages:
        db.delete(linkage)
    
    db.commit()
    return None
