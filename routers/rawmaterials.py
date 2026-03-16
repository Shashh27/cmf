from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy.exc import IntegrityError

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel
from DB.models.oms import OrderPartsRawMaterialLinked, Order as OrderModel, Part as PartModel
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
    
    # 1) Block delete if raw material is linked to orders/parts in the linkage table
    related_linkages = (
        db.query(OrderPartsRawMaterialLinked)
        .filter(OrderPartsRawMaterialLinked.raw_material_id == raw_material_id)
        .all()
    )
    if related_linkages:
        order_ids = sorted({l.order_id for l in related_linkages if l.order_id is not None})
        part_ids = sorted({l.part_id for l in related_linkages if l.part_id is not None})

        orders = (
            db.query(OrderModel).filter(OrderModel.id.in_(order_ids)).all()
            if order_ids
            else []
        )
        parts = (
            db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            if part_ids
            else []
        )

        order_no_by_id = {o.id: o.sale_order_number for o in orders}
        part_no_by_id = {p.id: p.part_number for p in parts}

        missing_order_ids = [oid for oid in order_ids if oid not in order_no_by_id]
        missing_part_ids = [pid for pid in part_ids if pid not in part_no_by_id]

        order_labels = []
        for oid in order_ids[:10]:
            order_labels.append(order_no_by_id.get(oid) or f"order_id={oid}")
        if len(order_ids) > 10:
            order_labels.append(f"+{len(order_ids) - 10} more")

        part_labels = []
        for pid in part_ids[:10]:
            part_labels.append(part_no_by_id.get(pid) or f"part_id={pid}")
        if len(part_ids) > 10:
            part_labels.append(f"+{len(part_ids) - 10} more")

        extra = []
        if missing_order_ids:
            extra.append(f"Missing orders: {', '.join(map(str, missing_order_ids[:10]))}{' ...' if len(missing_order_ids) > 10 else ''}")
        if missing_part_ids:
            extra.append(f"Missing parts: {', '.join(map(str, missing_part_ids[:10]))}{' ...' if len(missing_part_ids) > 10 else ''}")

        extra_text = f" ({' | '.join(extra)})" if extra else ""
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Cannot delete raw material "{db_raw_material.material_name}". '
                f"It is still linked in order_parts_raw_material_linked ({len(related_linkages)} row(s)). "
                f"Orders: {', '.join(order_labels) or '-'}; Parts: {', '.join(part_labels) or '-'}."
                f"{extra_text}"
            ),
        )

    # 2) Block delete if any Part rows directly reference this raw material
    referencing_parts = (
        db.query(PartModel)
        .filter(PartModel.raw_material_id == raw_material_id)
        .order_by(PartModel.id.asc())
        .all()
    )
    if referencing_parts:
        part_numbers = [p.part_number for p in referencing_parts if p.part_number]
        part_names = [p.part_name for p in referencing_parts if p.part_name]
        # Keep message short, but informative
        pn = ", ".join(part_numbers[:10]) + (f", +{len(part_numbers) - 10} more" if len(part_numbers) > 10 else "")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Cannot delete raw material "{db_raw_material.material_name}". '
                f"It is still selected on {len(referencing_parts)} part(s) (parts.raw_material_id). "
                f"Part numbers: {pn or '-'}."
            ),
        )

    try:
        db.delete(db_raw_material)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Cannot delete raw material "{db_raw_material.material_name}". '
                "It is still referenced by other records. Remove the links/usages first and try again."
            ),
        )
    return None
