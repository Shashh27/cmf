from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from DB.database import get_db
from DB.models.oms import OutSourcePartStatus as OutSourcePartStatusModel
from DB.schemas.oms import (
    OutSourcePartStatus as OutSourcePartStatusSchema,
    OutSourcePartStatusCreate,
    OutSourcePartStatusUpdate,
)

router = APIRouter(prefix="/out-source-parts-status", tags=["out-source-parts-status"])


@router.post("/", response_model=OutSourcePartStatusSchema)
def create_out_source_part_status(payload: OutSourcePartStatusCreate, db: Session = Depends(get_db)):
    obj = OutSourcePartStatusModel(
        part_id=payload.part_id,
        order_id=payload.order_id,
        start_date=payload.start_date,
        to_date=payload.to_date,
        status=payload.status.strip().lower(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/", response_model=List[OutSourcePartStatusSchema])
def list_out_source_part_status(db: Session = Depends(get_db)):
    rows = db.query(OutSourcePartStatusModel).order_by(OutSourcePartStatusModel.id.asc()).all()
    return rows

@router.get("/order/{order_id}", response_model=List[OutSourcePartStatusSchema])
def list_out_source_part_status_by_order(order_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(OutSourcePartStatusModel)
        .filter(OutSourcePartStatusModel.order_id == order_id)
        .order_by(OutSourcePartStatusModel.id.asc())
        .all()
    )
    return rows

@router.get("/{id}", response_model=OutSourcePartStatusSchema)
def get_out_source_part_status(id: int, db: Session = Depends(get_db)):
    obj = db.query(OutSourcePartStatusModel).filter(OutSourcePartStatusModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")
    return obj


@router.put("/{id}", response_model=OutSourcePartStatusSchema)
def update_out_source_part_status(id: int, payload: OutSourcePartStatusUpdate, db: Session = Depends(get_db)):
    obj = db.query(OutSourcePartStatusModel).filter(OutSourcePartStatusModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")
    data = payload.dict(exclude_unset=True)
    if "status" in data and isinstance(data["status"], str):
        data["status"] = data["status"].strip().lower()
    for field, value in data.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{id}")
def delete_out_source_part_status(id: int, db: Session = Depends(get_db)):
    obj = db.query(OutSourcePartStatusModel).filter(OutSourcePartStatusModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Record not found")
    db.delete(obj)
    db.commit()
    return {"message": "Deleted"}

