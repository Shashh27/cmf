from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import RawMaterial as RawMaterialModel
from DB.schemas import RawMaterial, RawMaterialCreate, RawMaterialUpdate

router = APIRouter(
    prefix="/rawmaterials",
    tags=["rawmaterials"]
)


@router.post("/", response_model=RawMaterial, status_code=status.HTTP_201_CREATED)
def create_raw_material(raw_material: RawMaterialCreate, db: Session = Depends(get_db)):
    """Create a new raw material"""
    db_raw_material = RawMaterialModel(**raw_material.model_dump())
    db.add(db_raw_material)
    db.commit()
    db.refresh(db_raw_material)
    return db_raw_material


@router.get("/", response_model=List[RawMaterial])
def get_raw_materials(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all raw materials with pagination"""
    raw_materials = db.query(RawMaterialModel).offset(skip).limit(limit).all()
    return raw_materials


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

    db.delete(db_raw_material)
    db.commit()
    return None
