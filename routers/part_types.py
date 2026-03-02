from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.oms import PartType as PartTypeModel
from DB.schemas.oms import PartType, PartTypeCreate, PartTypeUpdate

router = APIRouter(
    prefix="/part-types",
    tags=["part-types"]
)


@router.post("/", response_model=PartType, status_code=status.HTTP_201_CREATED)
def create_part_type(part_type: PartTypeCreate, db: Session = Depends(get_db)):
    """Create a new part type"""
    db_part_type = PartTypeModel(**part_type.model_dump())
    db.add(db_part_type)
    db.commit()
    db.refresh(db_part_type)
    return db_part_type


@router.get("/", response_model=List[PartType])
def get_part_types(db: Session = Depends(get_db)):
    """Get all part types"""
    return db.query(PartTypeModel).order_by(PartTypeModel.id.asc()).all()


@router.get("/{part_type_id}", response_model=PartType)
def get_part_type(part_type_id: int, db: Session = Depends(get_db)):
    """Get a specific part type by ID"""
    part_type = db.query(PartTypeModel).filter(PartTypeModel.id == part_type_id).first()
    if not part_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part type with id {part_type_id} not found"
        )
    return part_type


@router.put("/{part_type_id}", response_model=PartType)
def update_part_type(part_type_id: int, part_type: PartTypeUpdate, db: Session = Depends(get_db)):
    """Update a part type"""
    db_part_type = db.query(PartTypeModel).filter(PartTypeModel.id == part_type_id).first()
    if not db_part_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part type with id {part_type_id} not found"
        )

    update_data = part_type.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_part_type, field, value)

    db.commit()
    db.refresh(db_part_type)
    return db_part_type


@router.delete("/{part_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_part_type(part_type_id: int, db: Session = Depends(get_db)):
    """Delete a part type"""
    db_part_type = db.query(PartTypeModel).filter(PartTypeModel.id == part_type_id).first()
    if not db_part_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part type with id {part_type_id} not found"
        )

    db.delete(db_part_type)
    db.commit()
    return None