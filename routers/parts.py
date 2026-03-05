from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.oms import Part as PartModel, PartType, Order, OrderPartPriority
from DB.models.inventory import RawMaterial
from DB.schemas.oms import Part, PartCreate, PartUpdate
from sqlalchemy import func

router = APIRouter(
    prefix="/parts",
    tags=["parts"]
)


def _build_part_maps(db: Session):
    """Fetch all PartType and RawMaterial rows once and return id→value maps."""
    type_map = {pt.id: pt.type_name for pt in db.query(PartType).all()}
    rm_map = {rm.id: rm.material_name for rm in db.query(RawMaterial).all()}
    return type_map, rm_map


def _part_to_dict(part: PartModel, type_map: dict, rm_map: dict) -> dict:
    return {
        "id": part.id,
        "part_name": part.part_name,
        "part_number": part.part_number,
        "type_id": part.type_id,
        "raw_material_id": part.raw_material_id,
        "assembly_id": part.assembly_id,
        "product_id": part.product_id,
        "type_name": type_map.get(part.type_id),
        "raw_material_name": rm_map.get(part.raw_material_id),
        "created_at": part.created_at,
        "updated_at": part.updated_at,
    }


@router.post("/", response_model=Part, status_code=status.HTTP_201_CREATED)
def create_part(part: PartCreate, db: Session = Depends(get_db)):
    """Create a new part"""
    db_part = db.query(PartModel).filter(PartModel.part_number == part.part_number).first()
    if db_part:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part with number {part.part_number} already exists"
        )

    db_part = PartModel(**part.model_dump())
    db.add(db_part)
    db.commit()
    db.refresh(db_part)

    if db_part.product_id and db_part.type_id:
        part_type = db.query(PartType).filter(PartType.id == db_part.type_id).first()
        if part_type and part_type.type_name and part_type.type_name.lower() == "in-house":
            orders = db.query(Order).filter(Order.product_id == db_part.product_id).all()
            max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0
            for index, order in enumerate(orders):
                priority_entry = OrderPartPriority(
                    order_id=order.id,
                    product_id=db_part.product_id,
                    part_id=db_part.id,
                    priority=max_priority + 1 + index,
                )
                db.add(priority_entry)
            db.commit()

    return db_part


@router.get("/", response_model=List[Part])
def get_parts(db: Session = Depends(get_db)):
    """Get all parts with type and raw material names (single query per lookup table)."""
    parts = db.query(PartModel).order_by(PartModel.id.asc()).all()
    type_map, rm_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map) for p in parts]


@router.get("/{part_id}", response_model=Part)
def get_part(part_id: int, db: Session = Depends(get_db)):
    """Get a specific part by ID with raw_material_name."""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    type_map, rm_map = _build_part_maps(db)
    return _part_to_dict(part, type_map, rm_map)


@router.get("/product/{product_id}", response_model=List[Part])
def get_parts_by_product(product_id: int, db: Session = Depends(get_db)):
    """Get all parts for a specific product with type and raw material names."""
    parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    type_map, rm_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map) for p in parts]


@router.get("/assembly/{assembly_id}", response_model=List[Part])
def get_parts_by_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Get all parts for a specific assembly with type and raw material names."""
    parts = db.query(PartModel).filter(PartModel.assembly_id == assembly_id).all()
    type_map, rm_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map) for p in parts]


@router.get("/type/{type_id}", response_model=List[Part])
def get_parts_by_type(type_id: int, db: Session = Depends(get_db)):
    """Get all parts of a specific type with type and raw material names."""
    parts = db.query(PartModel).filter(PartModel.type_id == type_id).all()
    type_map, rm_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map) for p in parts]


@router.put("/{part_id}", response_model=Part)
def update_part(part_id: int, part: PartUpdate, db: Session = Depends(get_db)):
    """Update a part"""
    db_part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    update_data = part.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_part, field, value)

    db.commit()
    db.refresh(db_part)
    return db_part


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_part(part_id: int, db: Session = Depends(get_db)):
    """Delete a part"""
    db_part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    db.delete(db_part)
    db.commit()
    return None
