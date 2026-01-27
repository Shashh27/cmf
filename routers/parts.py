from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import Part as PartModel
from DB.schemas import Part, PartCreate, PartUpdate

router = APIRouter(
    prefix="/parts",
    tags=["parts"]
)


@router.post("/", response_model=Part, status_code=status.HTTP_201_CREATED)
def create_part(part: PartCreate, db: Session = Depends(get_db)):
    """Create a new part"""
    # Check if part_number already exists
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
    return db_part


@router.get("/", response_model=List[Part])
def get_parts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all parts with pagination"""
    parts = db.query(PartModel).offset(skip).limit(limit).all()
    return parts


@router.get("/{part_id}", response_model=Part)
def get_part(part_id: int, db: Session = Depends(get_db)):
    """Get a specific part by ID"""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    return part


@router.get("/product/{product_id}", response_model=List[Part])
def get_parts_by_product(product_id: int, db: Session = Depends(get_db)):
    """Get all parts for a specific product"""
    parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    return parts


@router.get("/assembly/{assembly_id}", response_model=List[Part])
def get_parts_by_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Get all parts for a specific assembly"""
    parts = db.query(PartModel).filter(PartModel.assembly_id == assembly_id).all()
    return parts


@router.get("/type/{type_id}", response_model=List[Part])
def get_parts_by_type(type_id: int, db: Session = Depends(get_db)):
    """Get all parts of a specific type"""
    parts = db.query(PartModel).filter(PartModel.type_id == type_id).all()
    return parts


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