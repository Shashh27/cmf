from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from typing import List, Optional, Dict
from pydantic import BaseModel
import uuid

from DB.database import get_db
from DB.models.oms import OrderPartsRawMaterialLinked, Part, Order
from DB.models.inventory import RawMaterial
from DB.schemas.oms import (
    OrderPartsRawMaterialLinked as OrderPartsRawMaterialLinkedResponse,
    OrderPartsRawMaterialLinkedCreate,
    OrderPartsRawMaterialLinkedUpdate,
    OrderPartsRawMaterialLinkedWithDetails
)


def _linkage_to_dict(linkage: OrderPartsRawMaterialLinked) -> dict:
    """Convert a linkage ORM object (with relationships loaded) to response dict."""
    rm = linkage.raw_material
    pt = linkage.part
    od = linkage.order
    product = od.product if od is not None else None
    return {
        "id": linkage.id,
        "raw_material_id": linkage.raw_material_id,
        "part_id": linkage.part_id,
        "order_id": linkage.order_id,
        "created_at": linkage.created_at,
        "updated_at": linkage.updated_at,
        "linkage_group_id": linkage.linkage_group_id,
        "material_name": rm.material_name if rm else None,
        "part_name": pt.part_name if pt else None,
        "part_number": pt.part_number if pt else None,
        "order_quantity": linkage.order_quantity if linkage.order_quantity is not None else (rm.quantity if rm else None),
        "mass": linkage.mass if linkage.mass is not None else (rm.mass if rm else None),
        "sale_order_number": od.sale_order_number if od else None,
        "product_name": product.product_name if product else None,
        "product_number": product.product_number if product else None,
        "material_status": linkage.material_status if linkage.material_status is not None else (rm.status if rm else None),
    }


def _load_linkages(query):
    """Apply joinedload to a linkage query so all related data is fetched in one SQL call."""
    return query.options(
        joinedload(OrderPartsRawMaterialLinked.raw_material),
        joinedload(OrderPartsRawMaterialLinked.part),
        joinedload(OrderPartsRawMaterialLinked.order).joinedload(Order.product),
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
    order_quantities: Optional[Dict[int, int]] = None
    order_masses: Optional[Dict[int, float]] = None
    linkage_group_id: Optional[str] = None  # If provided, same ID used for all orders in one Submit
    user_id: Optional[int] = None  # creator/owner of these linkages


class BulkStatusUpdateRequest(BaseModel):
    material_status: str
    # Optional: allow updating batch quantity and mass in the same request
    order_quantity: Optional[int] = None
    mass: Optional[float] = None


class GroupQuantitiesUpdateRequest(BaseModel):
    order_quantity: Optional[int] = None
    mass: Optional[float] = None



@router.post("/bulk", response_model=List[OrderPartsRawMaterialLinkedWithDetails], status_code=status.HTTP_201_CREATED)
def create_bulk_linkages(request: BulkCreateRequest, db: Session = Depends(get_db)):
    """Create bulk order-parts-raw-material linkages (1:1, 1:n, n:1 only)."""
    order = db.query(Order).filter(Order.id == request.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if len(request.raw_material_ids) > 1 and len(request.part_ids) > 1:
        raise HTTPException(
            status_code=400,
            detail="n:n relationship is not supported. Use 1:n or n:1 only.",
        )

    # Pre-fetch all referenced raw materials and parts in two queries
    raw_materials_map = {
        rm.id: rm
        for rm in db.query(RawMaterial).filter(RawMaterial.id.in_(request.raw_material_ids)).all()
    }
    parts_map = {
        p.id: p
        for p in db.query(Part).filter(Part.id.in_(request.part_ids)).all()
    }

    for rm_id in request.raw_material_ids:
        if rm_id not in raw_materials_map:
            raise HTTPException(status_code=404, detail=f"Raw material with id {rm_id} not found")
    for p_id in request.part_ids:
        if p_id not in parts_map:
            raise HTTPException(status_code=404, detail=f"Part with id {p_id} not found")

    qty_map = request.order_quantities or {}
    mass_map = request.order_masses or {}

    linkage_group_id = request.linkage_group_id or uuid.uuid4().hex

    # Only skip if same (order, raw_material, part, batch) already exists - allow same part/order/material in a new batch
    existing_set = {
        (l.raw_material_id, l.part_id, (l.linkage_group_id or ""))
        for l in db.query(
            OrderPartsRawMaterialLinked.raw_material_id,
            OrderPartsRawMaterialLinked.part_id,
            OrderPartsRawMaterialLinked.linkage_group_id,
        ).filter(OrderPartsRawMaterialLinked.order_id == request.order_id).all()
    }

    new_linkages = []
    for raw_material_id in request.raw_material_ids:
        for part_id in request.part_ids:
            if (raw_material_id, part_id, linkage_group_id) in existing_set:
                continue
            rm = raw_materials_map[raw_material_id]
            db_linkage = OrderPartsRawMaterialLinked(
                raw_material_id=raw_material_id,
                part_id=part_id,
                order_id=request.order_id,
                order_quantity=qty_map.get(raw_material_id, rm.quantity),
                mass=mass_map.get(raw_material_id, rm.mass),
                material_status="purchase request",
                linkage_group_id=linkage_group_id,
                user_id=request.user_id,
            )
            db.add(db_linkage)
            new_linkages.append(db_linkage)

    db.commit()
    for lnk in new_linkages:
        db.refresh(lnk)

    result = []
    for lnk in new_linkages:
        rm = raw_materials_map[lnk.raw_material_id]
        pt = parts_map[lnk.part_id]
        result.append({
            "id": lnk.id,
            "raw_material_id": lnk.raw_material_id,
            "part_id": lnk.part_id,
            "order_id": lnk.order_id,
            "created_at": lnk.created_at.isoformat() if lnk.created_at else None,
            "linkage_group_id": lnk.linkage_group_id,
            "material_name": rm.material_name,
            "part_name": pt.part_name,
            "part_number": pt.part_number,
            "order_quantity": lnk.order_quantity,
            "mass": lnk.mass,
            "sale_order_number": order.sale_order_number,
            "project_name": order.project_name,
            "material_status": lnk.material_status,
        })
    return result


@router.get("/", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_all_linkages(
    user_id: Optional[int] = Query(None, description="Filter by linkage user_id"),
    admin_id: Optional[int] = Query(
        None,
        description="Filter by admin / coordinator related to the order "
        "(matches Order.admin_id, Order.manufacturing_coordinator_id, or Order.project_coordinator_id)",
    ),
    db: Session = Depends(get_db),
):
    """Get all order-parts-raw-material linkages with details (single JOIN query).

    - If user_id is provided, filter by linkage.user_id (who created it).
    - If admin_id is provided, filter by orders where this user is admin, project coordinator,
      or manufacturing coordinator.
    - If both are provided, both filters are applied (AND).
    """
    query = db.query(OrderPartsRawMaterialLinked)
    if user_id is not None:
        query = query.filter(OrderPartsRawMaterialLinked.user_id == user_id)
    if admin_id is not None:
        query = (
            query.join(Order, Order.id == OrderPartsRawMaterialLinked.order_id)
            .filter(
                or_(
                    Order.admin_id == admin_id,
                    Order.manufacturing_coordinator_id == admin_id,
                    Order.project_coordinator_id == admin_id,
                )
            )
        )
    linkages = _load_linkages(query.order_by(OrderPartsRawMaterialLinked.id.asc())).all()
    return [_linkage_to_dict(l) for l in linkages]


@router.get("/{linkage_id}", response_model=OrderPartsRawMaterialLinkedWithDetails)
def get_linkage(linkage_id: int, db: Session = Depends(get_db)):
    """Get a specific order-parts-raw-material linkage by ID."""
    linkage = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id)
    ).first()
    if not linkage:
        raise HTTPException(status_code=404, detail="Linkage not found")
    return _linkage_to_dict(linkage)


@router.get("/order/{order_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_order(order_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific order."""
    if not db.query(Order).filter(Order.id == order_id).first():
        raise HTTPException(status_code=404, detail="Order not found")
    linkages = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.order_id == order_id)
    ).all()
    return [_linkage_to_dict(l) for l in linkages]


@router.get("/part/{part_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific part."""
    if not db.query(Part).filter(Part.id == part_id).first():
        raise HTTPException(status_code=404, detail="Part not found")
    linkages = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.part_id == part_id)
    ).all()
    return [_linkage_to_dict(l) for l in linkages]


@router.get("/raw-material/{raw_material_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_linkages_by_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Get all linkages for a specific raw material."""
    if not db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first():
        raise HTTPException(status_code=404, detail="Raw material not found")
    linkages = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.raw_material_id == raw_material_id)
    ).all()
    return [_linkage_to_dict(l) for l in linkages]


@router.put("/{linkage_id}", response_model=OrderPartsRawMaterialLinkedWithDetails)
def update_linkage(linkage_id: int, linkage_update: OrderPartsRawMaterialLinkedUpdate, db: Session = Depends(get_db)):
    """Update an order-parts-raw-material linkage."""
    linkage = db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id).first()
    if not linkage:
        raise HTTPException(status_code=404, detail="Linkage not found")

    previous_status = (linkage.material_status or "").lower()

    update_data = linkage_update.model_dump(exclude_unset=True)

    if "raw_material_id" in update_data:
        if not db.query(RawMaterial).filter(RawMaterial.id == update_data["raw_material_id"]).first():
            raise HTTPException(status_code=404, detail="Raw material not found")
    if "part_id" in update_data:
        if not db.query(Part).filter(Part.id == update_data["part_id"]).first():
            raise HTTPException(status_code=404, detail="Part not found")
    if "order_id" in update_data:
        if not db.query(Order).filter(Order.id == update_data["order_id"]).first():
            raise HTTPException(status_code=404, detail="Order not found")

    new_status = (update_data.get("material_status") or "").lower() if "material_status" in update_data else None
    for field, value in update_data.items():
        setattr(linkage, field, value)

    raw_material = db.query(RawMaterial).filter(RawMaterial.id == linkage.raw_material_id).first()
    if raw_material and new_status:
        if new_status == "available" and previous_status != "available":
            raw_material.quantity = (raw_material.quantity or 0) + (linkage.order_quantity or 0)
            raw_material.mass = (raw_material.mass or 0) + (linkage.mass or 0)
        elif previous_status == "available" and new_status != "available":
            raw_material.quantity = max(0, (raw_material.quantity or 0) - (linkage.order_quantity or 0))
            raw_material.mass = max(0.0, (raw_material.mass or 0) - (linkage.mass or 0))
        raw_material.status = "AVAILABLE" if (raw_material.quantity or 0) > 0 else "NOT AVAILABLE"

    db.commit()

    refreshed = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(OrderPartsRawMaterialLinked.id == linkage_id)
    ).first()
    return _linkage_to_dict(refreshed)


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
def delete_bulk_linkages(
    linkage_ids: List[int] = Query(...), db: Session = Depends(get_db)
):
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


@router.put("/status/order/{order_id}/raw-material/{raw_material_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def update_status_by_order_and_material(order_id: int, raw_material_id: int, payload: BulkStatusUpdateRequest, db: Session = Depends(get_db)):
    linkages = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(
            OrderPartsRawMaterialLinked.order_id == order_id,
            OrderPartsRawMaterialLinked.raw_material_id == raw_material_id,
        )
    ).all()

    if not linkages:
        raise HTTPException(status_code=404, detail="No linkages found for given order and raw material")

    raw_material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
    if not raw_material:
        raise HTTPException(status_code=404, detail="Raw material not found")

    new_status = payload.material_status.lower()
    had_available_before = any((l.material_status or "").lower() == "available" for l in linkages)

    for linkage in linkages:
        linkage.material_status = payload.material_status

    # Batch total is stored on each linkage (same for all parts); use first linkage only (do not sum).
    first_link = linkages[0]
    group_order_qty = first_link.order_quantity or 0
    group_order_mass = first_link.mass or 0

    if new_status == "available" and not had_available_before:
        raw_material.quantity = (raw_material.quantity or 0) + group_order_qty
        raw_material.mass = (raw_material.mass or 0) + group_order_mass
    elif new_status != "available" and had_available_before:
        raw_material.quantity = max(0, (raw_material.quantity or 0) - group_order_qty)
        raw_material.mass = max(0.0, (raw_material.mass or 0) - group_order_mass)

    raw_material.status = "AVAILABLE" if (raw_material.quantity or 0) > 0 else "NOT AVAILABLE"
    db.commit()

    return [_linkage_to_dict(l) for l in linkages]


@router.put("/status/group/{linkage_group_id}", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def update_status_by_group(linkage_group_id: str, payload: BulkStatusUpdateRequest, db: Session = Depends(get_db)):
    """Update material status for all linkages in a demand batch (group)."""
    linkages = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(
            OrderPartsRawMaterialLinked.linkage_group_id == linkage_group_id,
        )
    ).all()

    if not linkages:
        raise HTTPException(status_code=404, detail="No linkages found for this group")

    new_status = payload.material_status.lower()
    had_available_before = any((l.material_status or "").lower() == "available" for l in linkages)

    # Update linkage status and, if provided, batch quantities
    for linkage in linkages:
        linkage.material_status = payload.material_status
        if payload.order_quantity is not None:
            linkage.order_quantity = payload.order_quantity
        if payload.mass is not None:
            linkage.mass = payload.mass

    # Batch total is same on every linkage (one Order Kg/Qty per material per submit);
    # use first per raw_material after applying any new qty/kg.
    by_raw_material: Dict[int, tuple] = {}
    for l in linkages:
        rm_id = l.raw_material_id
        if rm_id not in by_raw_material:
            by_raw_material[rm_id] = (l.order_quantity or 0, (l.mass or 0))

    for raw_material_id, (group_qty, group_mass) in by_raw_material.items():
        raw_material = db.query(RawMaterial).filter(RawMaterial.id == raw_material_id).first()
        if not raw_material:
            continue
        if new_status == "available" and not had_available_before:
            raw_material.quantity = (raw_material.quantity or 0) + group_qty
            raw_material.mass = (raw_material.mass or 0) + group_mass
        elif new_status != "available" and had_available_before:
            raw_material.quantity = max(0, (raw_material.quantity or 0) - group_qty)
            raw_material.mass = max(0.0, (raw_material.mass or 0) - group_mass)
        raw_material.status = "AVAILABLE" if (raw_material.quantity or 0) > 0 else "NOT AVAILABLE"

    db.commit()
    return [_linkage_to_dict(l) for l in linkages]


@router.put("/group/{linkage_group_id}/quantities", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def update_group_quantities(linkage_group_id: str, payload: GroupQuantitiesUpdateRequest, db: Session = Depends(get_db)):
    """Update order_quantity and mass for all linkages in a batch (group). Uses this batch's linkage_group_id only."""
    linkages = db.query(OrderPartsRawMaterialLinked).filter(
        OrderPartsRawMaterialLinked.linkage_group_id == linkage_group_id,
    ).all()
    if not linkages:
        raise HTTPException(status_code=404, detail="No linkages found for this group")
    for l in linkages:
        if payload.order_quantity is not None:
            l.order_quantity = payload.order_quantity
        if payload.mass is not None:
            l.mass = payload.mass
    db.commit()
    refreshed = _load_linkages(
        db.query(OrderPartsRawMaterialLinked).filter(
            OrderPartsRawMaterialLinked.linkage_group_id == linkage_group_id,
        )
    ).all()
    return [_linkage_to_dict(l) for l in refreshed]
