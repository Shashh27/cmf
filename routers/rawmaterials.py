from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List, Optional
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, Vendors as VendorsModel, RawMaterialUnit as RawMaterialUnitModel, RawMaterialUsage as RawMaterialUsageModel, RawMaterialHistory as RawMaterialHistoryModel, StockQualityDocument as StockQualityDocumentModel
from DB.models.oms import Order as OrderModel, Part as PartModel, OutSourcePartStatus, Product as ProductModel
from DB.models.inventory import RawMaterial, RawMaterialStock, Vendors
from DB.schemas.inventory import (
    RawMaterial, RawMaterialCreate, RawMaterialUpdate,
    RawMaterialStock, RawMaterialStockCreate, RawMaterialStockUpdate, RawMaterialStockWithDetails,
    Vendors, VendorsCreate, VendorsUpdate,
    RawMaterialUnit, RawMaterialUnitCreate, RawMaterialUnitUpdate, RawMaterialUnitWithDetails,
    RawMaterialUsage, RawMaterialUsageCreate, RawMaterialUsageUpdate, RawMaterialUsageWithDetails,
    RawMaterialHistoryItem, RawMaterialHistoryResponse
)
from services.raw_material_calculations import RawMaterialCalculationService
from services.stock_auto_update import StockAutoUpdateService
from services.stock_recommendation_service import StockRecommendationService
from services.raw_material_history_service import RawMaterialHistoryService

# Valid unit statuses
VALID_UNIT_STATUSES = ["available", "partially_used", "exhausted", "not_available"]

def validate_unit_status(status: str) -> str:
    """Validate unit status and return valid status or raise error"""
    if status not in VALID_UNIT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid unit status '{status}'. Must be one of: {', '.join(VALID_UNIT_STATUSES)}"
        )
    return status

router = APIRouter(
    prefix="/rawmaterials",
    tags=["rawmaterials"]
)


class StockRecommendationRequest(BaseModel):
    material_name: str
    dimensions_str: str
    min_score: float = 0.3
    max_recommendations: int = 10
    required_length: Optional[float] = None
    material_id: Optional[int] = None


class MaterialRecommendRequest(BaseModel):
    material_name: str
    max_recommendations: int = 10


class BatchStockRecommendationRequest(BaseModel):
    requests: List[StockRecommendationRequest]


@router.post("/", response_model=RawMaterial, status_code=status.HTTP_201_CREATED)
def create_raw_material(raw_material: RawMaterialCreate, db: Session = Depends(get_db)):
    """Create a new raw material"""
    # Check if material name already exists
    existing = db.query(RawMaterialModel).filter(
        RawMaterialModel.material_name == raw_material.material_name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Raw material '{raw_material.material_name}' already exists"
        )
    
    db_raw_material = RawMaterialModel(**raw_material.model_dump())
    db.add(db_raw_material)
    db.commit()
    db.refresh(db_raw_material)
    
    # Log history
    try:
        RawMaterialHistoryService.log_material_created(
            db=db,
            material_id=db_raw_material.id,
            user_id=raw_material.user_id
        )
    except Exception as e:
        # Log error but don't fail the operation
        print(f"Error logging material creation history: {e}")
    
    return db_raw_material


@router.get("/", response_model=List[RawMaterial])
def get_raw_materials(
    db: Session = Depends(get_db),
):
    """Get all raw materials with stock status."""
    materials = db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()
    
    # Add stock status to each material
    materials_with_status = []
    for material in materials:
        # Get stock items for this material
        stock_items = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.material_id == material.id
        ).all()
        
        # Calculate stock status based on unit statuses
        total_available_units = 0
        total_units = 0
        available_stock_count = 0
        total_stock_quantity = sum(stock.quantity for stock in stock_items)
        
        for stock in stock_items:
            # Get units for this stock
            from DB.models.inventory import RawMaterialUnit
            units = db.query(RawMaterialUnit).filter(RawMaterialUnit.stock_id == stock.id).all()
            
            total_units += len(units)
            total_available_units += len([u for u in units if u.status in ['available', 'partially_used']])
            
            # Count available stocks (at least one available unit)
            if len([u for u in units if u.status in ['available', 'partially_used']]) > 0:
                available_stock_count += 1
        
        # Material is available if at least one unit is available across all stocks
        has_available_stock = total_available_units > 0
        
        # Create material dict with stock status
        material_dict = {
            "id": material.id,
            "material_name": material.material_name,
            "density": material.density,
            "cost_per_kg": material.cost_per_kg,
            "user_id": material.user_id,
            "created_at": material.created_at,
            "updated_at": material.updated_at,
            "has_available_stock": has_available_stock,
            "total_stock_quantity": total_stock_quantity,
            "available_stock_count": available_stock_count
        }
        materials_with_status.append(material_dict)
    
    return materials_with_status


@router.get("/inventory-view")
def get_inventory_view(
    db: Session = Depends(get_db),
    admin_id: Optional[int] = Query(None),
    manufacturing_coordinator_id: Optional[int] = Query(None),
):
    """
    Single endpoint returning full inventory hierarchy:
    materials -> stocks (general + order) -> units (with usages).
    Optional admin_id / manufacturing_coordinator_id query params scope order stocks.
    """
    from DB.models.inventory import RawMaterialUnit, RawMaterialUsage
    from sqlalchemy.orm import joinedload

    # 1. All materials
    materials = db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()
    material_ids = [m.id for m in materials]

    if not material_ids:
        return []

    # 2. Build stock query with role-based filtering
    stock_query = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.material_id.in_(material_ids)
    )
    
    # Apply role-based filtering for order-related stocks
    if admin_id is not None or manufacturing_coordinator_id is not None:
        # Always include general stocks (source_type = 'general')
        from sqlalchemy import or_
        
        # Build conditions for order stocks
        order_stock_conditions = []
        
        if admin_id is not None:
            # Admin sees order stocks where they are the admin
            order_stock_conditions.append(
                (RawMaterialStockModel.source_type == 'order') & 
                (RawMaterialStockModel.source_order_id.in_(
                    db.query(OrderModel.id).filter(OrderModel.admin_id == admin_id)
                ))
            )
        
        if manufacturing_coordinator_id is not None:
            # MC sees order stocks where they are the manufacturing coordinator
            order_stock_conditions.append(
                (RawMaterialStockModel.source_type == 'order') & 
                (RawMaterialStockModel.source_order_id.in_(
                    db.query(OrderModel.id).filter(OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id)
                ))
            )
        
        # Combine conditions: general stocks OR (order stocks matching role)
        if order_stock_conditions:
            stock_query = stock_query.filter(
                or_(
                    RawMaterialStockModel.source_type == 'general',
                    *order_stock_conditions
                )
            )
    
    stocks = stock_query.order_by(
        RawMaterialStockModel.material_id.asc(), 
        RawMaterialStockModel.id.asc()
    ).all()
    stock_ids = [s.id for s in stocks]

    # 3. All units for all stocks (bulk)
    units = []
    if stock_ids:
        units = (
            db.query(RawMaterialUnit)
            .filter(RawMaterialUnit.stock_id.in_(stock_ids))
            .order_by(RawMaterialUnit.stock_id.asc(), RawMaterialUnit.id.asc())
            .all()
        )

    unit_ids = [u.id for u in units]

    # 4. All usages for all units (bulk)
    usages_by_unit = {}
    if unit_ids:
        usages = (
            db.query(RawMaterialUsage)
            .options(joinedload(RawMaterialUsage.part))
            .filter(RawMaterialUsage.raw_material_unit_id.in_(unit_ids))
            .all()
        )
        for usage in usages:
            uid = usage.raw_material_unit_id
            if uid not in usages_by_unit:
                usages_by_unit[uid] = []
            usages_by_unit[uid].append({
                "id": usage.id,
                "part_id": usage.part_id,
                "used_length": usage.used_length,
                "part_number": usage.part.part_number if usage.part else None,
                "part_name": usage.part.part_name if usage.part else None,
            })

    # 5. All orders needed for source_order_number (bulk)
    source_order_ids = list({s.source_order_id for s in stocks if s.source_order_id})
    order_map = {}
    if source_order_ids:
        orders = db.query(OrderModel).filter(OrderModel.id.in_(source_order_ids)).all()
        order_map = {o.id: o.sale_order_number for o in orders}

    # 6. All parts needed for part_numbers (bulk)
    all_part_id_strs = set()
    for s in stocks:
        if s.part_id:
            for pid in s.part_id.split(","):
                pid = pid.strip()
                if pid.isdigit():
                    all_part_id_strs.add(int(pid))
    part_map = {}
    if all_part_id_strs:
        parts = db.query(PartModel).filter(PartModel.id.in_(all_part_id_strs)).all()
        part_map = {p.id: p for p in parts}

    # 7. Quality document counts for all stocks (bulk)
    doc_counts_by_stock = {}
    if stock_ids:
        doc_counts = (
            db.query(StockQualityDocumentModel.stock_id, StockQualityDocumentModel.id)
            .filter(StockQualityDocumentModel.stock_id.in_(stock_ids))
            .all()
        )
        for stock_id, _ in doc_counts:
            doc_counts_by_stock[stock_id] = doc_counts_by_stock.get(stock_id, 0) + 1

    # Build units by stock map
    units_by_stock = {}
    for u in units:
        units_by_stock.setdefault(u.stock_id, []).append({
            "id": u.id,
            "status": u.status,
            "total_length": u.total_length,
            "remaining_length": u.remaining_length,
            "volume": u.volume,
            "mass": u.mass,
            "weight": u.weight,
            "cost": u.cost,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "usages": usages_by_unit.get(u.id, []),
        })

    # Build stocks by material map
    stocks_by_material = {}
    for s in stocks:
        # Resolve part numbers
        part_numbers = []
        if s.part_id:
            for pid in s.part_id.split(","):
                pid = pid.strip()
                if pid.isdigit():
                    part = part_map.get(int(pid))
                    if part:
                        part_numbers.append(part.part_number)

        # Determine status from units
        stock_units = units_by_stock.get(s.id, [])
        if stock_units:
            has_avail = any(u["status"] in ("available", "partially_used") for u in stock_units)
            if s.source_type == "order":
                computed_status = "available" if (has_avail and s.order_status == "received") else "not_available"
            else:
                computed_status = "available" if has_avail else "exhausted"
        else:
            if s.source_type == "general":
                computed_status = "available" if s.available_quantity > 0 else "exhausted"
            else:
                computed_status = "available" if (s.available_quantity > 0 and s.order_status == "received") else "not_available"

        # Dimensions string
        if s.form_type == "Round":
            dims = f"⌀{s.diameter} × {s.length}mm"
        elif s.form_type == "Square":
            dims = f"{s.breadth} × {s.height} × {s.length}mm"
        elif s.form_type == "Pipe":
            dims = f"⌀{s.outer_diameter}/{s.inner_diameter} × {s.length}mm"
        else:
            dims = None

        stocks_by_material.setdefault(s.material_id, []).append({
            "id": s.id,
            "process_type": s.process_type,
            "form_type": s.form_type,
            "diameter": s.diameter,
            "length": s.length,
            "breadth": s.breadth,
            "height": s.height,
            "inner_diameter": s.inner_diameter,
            "outer_diameter": s.outer_diameter,
            "dimensions": dims,
            "quantity": s.quantity,
            "available_quantity": s.available_quantity,
            "mass": s.mass,
            "volume": s.volume,
            "cost": s.cost,
            "source_type": s.source_type,
            "order_status": s.order_status,
            "source_order_number": order_map.get(s.source_order_id) if s.source_order_id else None,
            "part_numbers": part_numbers,
            "status": computed_status,
            "quality_document_count": doc_counts_by_stock.get(s.id, 0),
            "created_at": s.created_at.isoformat() if s.created_at else None,
            "units": stock_units,
        })

    # Build final result
    result = []
    for m in materials:
        result.append({
            "id": m.id,
            "material_name": m.material_name,
            "density": m.density,
            "cost_per_kg": m.cost_per_kg,
            "stocks": stocks_by_material.get(m.id, []),
        })

    return result


# =======================
# VENDOR ENDPOINTS
# =======================

@router.get("/vendors")
def get_vendors(user_id: int = None, db: Session = Depends(get_db)):
    """Get all vendors - FIFO order by ID"""
    vendors = db.query(VendorsModel).order_by(VendorsModel.id.asc()).all()
    return [
        {
            "id": v.id,
            "company_name": v.company_name,
            "created_at": v.created_at.isoformat() if v.created_at else None,
            "updated_at": v.updated_at.isoformat() if v.updated_at else None
        }
        for v in vendors
    ]


@router.post("/vendors", response_model=Vendors, status_code=status.HTTP_201_CREATED)
def create_vendor(vendor: VendorsCreate, user_id: int = None, db: Session = Depends(get_db)):
    """Create a new vendor"""
    # Check if vendor already exists
    existing = db.query(VendorsModel).filter(
        VendorsModel.company_name == vendor.company_name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Vendor '{vendor.company_name}' already exists"
        )
    
    db_vendor = VendorsModel(**vendor.model_dump())
    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


@router.get("/vendors/{vendor_id}", response_model=Vendors)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Get a specific vendor by ID"""
    vendor = db.query(VendorsModel).filter(VendorsModel.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    return vendor


@router.put("/vendors/{vendor_id}", response_model=Vendors)
def update_vendor(vendor_id: int, vendor_update: VendorsUpdate, user_id: int = None, db: Session = Depends(get_db)):
    """Update a vendor"""
    vendor = db.query(VendorsModel).filter(VendorsModel.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    update_data = vendor_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vendor, field, value)
    
    db.commit()
    db.refresh(vendor)
    return vendor


@router.delete("/vendors/{vendor_id}")
def delete_vendor(vendor_id: int, user_id: int = None, db: Session = Depends(get_db)):
    """Delete a vendor"""
    vendor = db.query(VendorsModel).filter(VendorsModel.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    # Check if vendor is referenced in raw_material_stock
    from DB.models.inventory import RawMaterialStock as RawMaterialStockModel
    # vendor_id is String (comma-separated IDs), received_vendor_id is Integer
    stock_references = db.query(RawMaterialStockModel).filter(
        (RawMaterialStockModel.vendor_id.like(f'%{vendor_id}%')) | 
        (RawMaterialStockModel.received_vendor_id == vendor_id)
    ).count()
    
    if stock_references > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete vendor '{vendor.company_name}' because it is referenced by {stock_references} raw material stock record(s). Please remove or update these stock records first."
        )
    
    try:
        db.delete(vendor)
        db.commit()
        return {"message": "Vendor deleted successfully"}
    except Exception as e:
        db.rollback()
        # Handle any other foreign key constraints
        if "foreign key constraint" in str(e).lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete vendor '{vendor.company_name}' because it is referenced by other records. Please remove all references before deleting."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="An error occurred while deleting the vendor"
            )


@router.get("/history", response_model=RawMaterialHistoryResponse)
def get_raw_material_history(
    start_date: str = None,  # Format: YYYY-MM-DD
    end_date: str = None,    # Format: YYYY-MM-DD
    year: int = None,
    month: int = None,
    day: int = None,
    source_type: str = None,  # "general" or "order"
    order_id: int = None,
    material_id: int = None,
    activity_type: str = None,  # "stock_created", "material_linked", "order_status_changed", "stock_updated", "material_unlinked"
    admin_id: Optional[int] = Query(None),
    manufacturing_coordinator_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Get comprehensive raw material history.
    Optional admin_id / manufacturing_coordinator_id accepted for API compatibility (unused in filter).
    """
    from datetime import datetime
    from sqlalchemy import and_, or_

    # Note: admin_id / manufacturing_coordinator_id currently unused — both Admin and MC see all history
    _ = (admin_id, manufacturing_coordinator_id)
    
    # Build query with joins
    history_query = db.query(RawMaterialHistoryModel).options(
        joinedload(RawMaterialHistoryModel.user),
        joinedload(RawMaterialHistoryModel.material),
        joinedload(RawMaterialHistoryModel.stock),
        joinedload(RawMaterialHistoryModel.unit),
        joinedload(RawMaterialHistoryModel.part),
        joinedload(RawMaterialHistoryModel.order),
        joinedload(RawMaterialHistoryModel.vendor)
    )
    
    # Date filter logic
    if start_date and end_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        history_query = history_query.filter(
            and_(
                RawMaterialHistoryModel.timestamp >= start_dt,
                RawMaterialHistoryModel.timestamp <= end_dt
            )
        )
    elif year:
        if month:
            if day:
                # Specific day
                history_query = history_query.filter(
                    and_(
                        RawMaterialHistoryModel.timestamp >= datetime(year, month, day),
                        RawMaterialHistoryModel.timestamp < datetime(year, month, day + 1)
                    )
                )
            else:
                # Specific month
                history_query = history_query.filter(
                    and_(
                        RawMaterialHistoryModel.timestamp >= datetime(year, month, 1),
                        RawMaterialHistoryModel.timestamp < datetime(year, month + 1, 1) if month < 12 else datetime(year + 1, 1, 1)
                    )
                )
        else:
            # Specific year
            history_query = history_query.filter(
                and_(
                    RawMaterialHistoryModel.timestamp >= datetime(year, 1, 1),
                    RawMaterialHistoryModel.timestamp < datetime(year + 1, 1, 1)
                )
            )
    
    # Apply filters
    if source_type:
        history_query = history_query.filter(RawMaterialHistoryModel.source_type == source_type)
    if order_id:
        history_query = history_query.filter(RawMaterialHistoryModel.order_id == order_id)
    if material_id:
        history_query = history_query.filter(RawMaterialHistoryModel.material_id == material_id)
    if activity_type:
        history_query = history_query.filter(RawMaterialHistoryModel.activity_type == activity_type)
    
    # Note: No user filtering - both Admin and MC see all history data
    
    # Order by timestamp descending (most recent first)
    history_records = history_query.order_by(RawMaterialHistoryModel.timestamp.desc()).all()
    
    # Convert to response format
    history_items = []
    for record in history_records:
        # Get order number from relationship
        order_number = record.order.sale_order_number if record.order else None
        
        history_item = RawMaterialHistoryItem(
            id=record.id,
            activity_type=record.activity_type,
            timestamp=record.timestamp,
            user_id=record.user_id,
            user_name=record.user.user_name if record.user else None,
            user_role=record.user_role,
            material_id=record.material_id,
            material_name=record.material_name,
            stock_id=record.stock_id,
            source_type=record.source_type,
            order_id=record.order_id,
            order_number=order_number,
            order_status=record.order_status,
            quantity=record.quantity,
            form_type=record.form_type,
            dimensions=record.dimensions,
            part_id=record.part_id,
            part_name=record.part_name,
            part_number=record.part_number,
            used_length=record.used_length,
            unit_id=record.unit_id,
            total_length=record.total_length,
            remaining_length=record.remaining_length,
            vendor_id=record.vendor_id,
            vendor_name=record.vendor_name,
            enquiry_vendor_name=record.enquiry_vendor_name,
            enquiry_vendor_count=record.enquiry_vendor_count,
            received_vendor_name=record.received_vendor_name,
            description=record.description
        )
        history_items.append(history_item)
    
    return RawMaterialHistoryResponse(
        history=history_items,
        total_count=len(history_items),
        filtered_count=len(history_items)
    )


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

    # Check if material name already exists (if being updated)
    if "material_name" in update_data:
        existing = db.query(RawMaterialModel).filter(
            RawMaterialModel.material_name == update_data["material_name"],
            RawMaterialModel.id != raw_material_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Raw material '{update_data['material_name']}' already exists"
            )

    # Store old values for history
    old_values = {}
    for field in update_data.keys():
        old_values[field] = getattr(db_raw_material, field, None)

    for field, value in update_data.items():
        setattr(db_raw_material, field, value)

    db.commit()
    db.refresh(db_raw_material)
    
    # Log history for material update
    try:
        RawMaterialHistoryService.log_material_updated(
            db=db,
            material_id=raw_material_id,
            old_values=old_values,
            new_values=update_data,
            user_id=raw_material.user_id
        )
    except Exception as e:
        print(f"Error logging material update history: {e}")
    
    return db_raw_material


@router.delete("/{raw_material_id}", status_code=status.HTTP_200_OK)
def delete_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Delete a raw material with cascade deletion (stock, units, usage, parts)"""
    db_raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not db_raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )
    
    # Check if any parts linked to this material's stocks have active schedule status
    stock_items = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.material_id == raw_material_id
    ).all()
    
    stock_ids = [s.id for s in stock_items]
    
    if stock_ids:
        units = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id.in_(stock_ids)
        ).all()
        unit_ids = [u.id for u in units]
        
        if unit_ids:
            referencing_parts = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
            part_ids = [p.id for p in referencing_parts]
            
            if part_ids:
                active_parts = db.execute(
                    text("""
                        SELECT p.id, p.part_name 
                        FROM oms.parts p
                        JOIN scheduling.part_schedule_status pss ON p.id = pss.part_id
                        WHERE p.id IN :part_ids AND pss.status = 'active'
                    """),
                    {"part_ids": tuple(part_ids)}
                ).fetchall()
                
                if active_parts:
                    part_names = [row[1] for row in active_parts]
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Sorry, this raw material cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this material, please inactivate the schedule status of these parts first."
                    )
    
    try:
        # Store material name for history before deletion
        material_name = db_raw_material.material_name
        
        # Step 1: Find all stock items for this material
        stock_items = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.material_id == raw_material_id
        ).all()
        
        stock_ids = [s.id for s in stock_items]
        
        # Step 2: Get all units for these stocks
        if stock_ids:
            units = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.stock_id.in_(stock_ids)
            ).all()
            unit_ids = [u.id for u in units]
            
            # Step 3: Find all parts that reference these units
            if unit_ids:
                referencing_parts = (
                    db.query(PartModel)
                    .filter(PartModel.raw_material_unit_id.in_(unit_ids))
                    .all()
                )
                
                # Clear all part references to these units
                for part in referencing_parts:
                    part.raw_material_unit_id = None
                    part.raw_material_id = None
                    part.required_length = None
            
            # Step 4: Delete all usage records for these units
            if unit_ids:
                db.query(RawMaterialUsageModel).filter(
                    RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)
                ).delete(synchronize_session=False)
            
            # Step 5: Delete all units for these stocks
            if stock_ids:
                db.query(RawMaterialUnitModel).filter(
                    RawMaterialUnitModel.stock_id.in_(stock_ids)
                ).delete(synchronize_session=False)
        
        # Step 6: Delete all stock items
        for stock in stock_items:
            db.delete(stock)
        
        # Step 7: Delete history records for this material
        db.query(RawMaterialHistoryModel).filter(
            RawMaterialHistoryModel.material_id == raw_material_id
        ).delete(synchronize_session=False)
        
        # Step 8: Delete the raw material itself
        db.delete(db_raw_material)
        
        # Commit all changes
        db.commit()
        
        return {
            "message": f"Raw material '{db_raw_material.material_name}' deleted successfully",
            "stocks_deleted": len(stock_items),
            "units_deleted": len(units) if stock_ids else 0,
            "parts_updated": len(referencing_parts) if stock_ids and unit_ids else 0
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting raw material: {str(e)}"
        )


# =======================
# Raw Material Stock Endpoints
# =======================

@router.post("/stock/", response_model=RawMaterialStockWithDetails, status_code=status.HTTP_201_CREATED)
def create_raw_material_stock(stock: RawMaterialStockCreate, db: Session = Depends(get_db)):
    """Create a new raw material stock item"""
    # Get material
    material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Material with id {stock.material_id} not found"
        )
    
    # Validate source_type and source_order_id combination
    if stock.source_type == "order" and not stock.source_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_order_id is required when source_type is 'order'"
        )
    
    if stock.source_type == "general" and stock.source_order_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="source_order_id should be None when source_type is 'general'"
        )
    
    # If source_type is 'order', validate order exists
    if stock.source_order_id:
        order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Order with id {stock.source_order_id} not found"
            )
    
    # Calculate properties
    try:
        properties = RawMaterialCalculationService.calculate_stock_item_properties(material, stock)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    
    # Create stock item with calculated properties
    stock_data = stock.model_dump()
    stock_data.update(properties)
    
    # Set initial quantities for new stock
    stock_data["allocated_quantity"] = 0  # Start with no allocations
    stock_data["available_quantity"] = stock_data.get("quantity", 0)  # All quantity is initially available
    
    # Set default order_status for order type
    if stock_data.get("source_type") == "order" and not stock_data.get("order_status"):
        stock_data["order_status"] = "enquiry"  # Default status for new orders
    
    # Set status based on order_status for order-type stock
    if stock_data.get("source_type") == "order":
        if stock_data.get("order_status") == "received":
            stock_data["status"] = "available"
        else:
            stock_data["status"] = "not available"
    else:
        # For general stock, use available if available_quantity > 0
        stock_data["status"] = "available" if stock_data.get("available_quantity", 0) > 0 else "not available"
    
    db_stock = RawMaterialStockModel(**stock_data)
    db.add(db_stock)
    db.commit()
    db.refresh(db_stock)
    
    # 🔥 AUTO-CREATE UNITS ON STOCK CREATION
    if db_stock.quantity > 0 and db_stock.length:
        # Calculate per-unit values (divide by quantity)
        per_unit_volume = db_stock.volume / db_stock.quantity if db_stock.volume else None
        per_unit_mass = db_stock.mass / db_stock.quantity if db_stock.mass else None
        per_unit_weight = db_stock.weight / db_stock.quantity if db_stock.weight else None
        per_unit_cost = db_stock.cost / db_stock.quantity if db_stock.cost else None
        
        for i in range(db_stock.quantity):
            unit = RawMaterialUnitModel(
                stock_id=db_stock.id,
                total_length=db_stock.length,
                remaining_length=db_stock.length,
                volume=per_unit_volume,
                mass=per_unit_mass,
                weight=per_unit_weight,
                cost=per_unit_cost,
                status="available"
            )
            db.add(unit)
        
        db.commit()
  
    
    # Frontend handles allocation directly via /rawmaterials/tracking/allocate API
    # No auto-allocation needed here
    
    # Return with details
    return _stock_with_details(db_stock, db)


@router.get("/stock/", response_model=List[RawMaterialStockWithDetails])
def get_raw_material_stock(
    material_name: str | None = None,
    material_id: int | None = None,
    source_type: str | None = None,
    db: Session = Depends(get_db)
):
    """Get raw material stock items with optional filtering"""
    query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
        joinedload(RawMaterialStockModel.creator)
    )
    
    if material_name is not None:
        matching_material_ids = StockRecommendationService.find_matching_material_ids(
            db, material_name, material_id=material_id
        )

        if matching_material_ids:
            query = query.filter(RawMaterialStockModel.material_id.in_(matching_material_ids))
        else:
            query = query.join(RawMaterialModel).filter(
                RawMaterialModel.material_name.ilike(f"%{material_name}%")
            )

    if material_id is not None and material_name is None:
        query = query.filter(RawMaterialStockModel.material_id == material_id)
    
    if source_type is not None:
        query = query.filter(RawMaterialStockModel.source_type == source_type)
    
    stock_items = query.order_by(RawMaterialStockModel.id.asc()).all()
    return [_stock_with_details(item, db) for item in stock_items]


@router.get("/stock/{stock_id}", response_model=RawMaterialStockWithDetails)
def get_raw_material_stock_item(stock_id: int, db: Session = Depends(get_db)):
    """Get a specific raw material stock item"""
    stock = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
        joinedload(RawMaterialStockModel.creator)
    ).filter(RawMaterialStockModel.id == stock_id).first()
    
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    return _stock_with_details(stock, db)


@router.post("/recommend-materials")
def recommend_materials(request: MaterialRecommendRequest, db: Session = Depends(get_db)):
    """
    Recommend master raw materials for an extracted material name.
    Uses fuzzy/partial matching — e.g. '20MnCr5' matches '20MnCr5 - DIN 17210'.
    """
    recommendations = StockRecommendationService.find_matching_materials(
        db=db,
        extracted_material_name=request.material_name,
        max_recommendations=request.max_recommendations,
    )
    return {
        "success": True,
        "extracted_material_name": request.material_name,
        "recommendations": recommendations,
        "total": len(recommendations),
        "has_match": len(recommendations) > 0,
    }


@router.post("/recommend-stocks")
def recommend_stocks(request: StockRecommendationRequest, db: Session = Depends(get_db)):
    """
    Recommend stocks based on extracted raw material dimensions.

    Returns a list of recommended general stocks that match the material name
    and have dimensions close to the extracted dimensions.
    """
    recommendations = StockRecommendationService.recommend_stocks(
        db=db,
        extracted_material_name=request.material_name,
        extracted_dimensions_str=request.dimensions_str,
        min_score=request.min_score,
        max_recommendations=request.max_recommendations,
        required_length=request.required_length,
        material_id=request.material_id,
    )

    return {
        "success": True,
        "recommendations": recommendations,
        "total": len(recommendations)
    }


@router.post("/recommend-stocks/batch")
def recommend_stocks_batch(request: BatchStockRecommendationRequest, db: Session = Depends(get_db)):
    """
    Batch recommend stocks for multiple extracted raw materials.

    Returns a dictionary with recommendations for each request.
    """
    results = {}
    for idx, req in enumerate(request.requests):
        recommendations = StockRecommendationService.recommend_stocks(
            db=db,
            extracted_material_name=req.material_name,
            extracted_dimensions_str=req.dimensions_str,
            min_score=req.min_score,
            max_recommendations=req.max_recommendations,
            required_length=req.required_length,
            material_id=req.material_id,
        )
        results[idx] = {
            "success": True,
            "recommendations": recommendations,
            "total": len(recommendations)
        }

    return {
        "success": True,
        "results": results
    }


@router.get("/debug/stock/{stock_id}")
def debug_stock(stock_id: int, db: Session = Depends(get_db)):
    """Debug endpoint to check stock details"""
    stock = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material)
    ).filter(RawMaterialStockModel.id == stock_id).first()

    if not stock:
        raise HTTPException(status_code=404, detail="Stock not found")

    stock_dims = StockRecommendationService.get_stock_dimensions(stock)

    return {
        "stock_id": stock.id,
        "material_id": stock.material_id,
        "material_name": stock.material.material_name if stock.material else "",
        "source_type": stock.source_type,
        "status": stock.status,
        "form_type": stock.form_type,
        "dimensions": stock_dims,
        "available_quantity": stock.available_quantity
    }


@router.post("/debug/recommend")
def debug_recommend(request: StockRecommendationRequest, db: Session = Depends(get_db)):
    """Debug endpoint to show recommendation details"""
    normalized_name = StockRecommendationService.normalize_material_name(request.material_name)
    extracted_dims, form_type = StockRecommendationService.parse_extracted_dimensions(request.dimensions_str)

    matching_materials = StockRecommendationService.find_matching_materials(
        db, request.material_name, max_recommendations=20
    )

    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.material_id.in_([m["id"] for m in matching_materials]),
        RawMaterialStockModel.source_type == "general"
    ).all() if matching_materials else []

    stock_details = []
    for stock in stocks:
        stock_dims = StockRecommendationService.get_stock_dimensions(stock)
        score = StockRecommendationService.calculate_dimension_match_score(extracted_dims, stock_dims, form_type)
        stock_details.append({
            "stock_id": stock.id,
            "material_name": stock.material.material_name if stock.material else "",
            "form_type": stock.form_type,
            "dimensions": stock_dims,
            "match_score": score,
            "status": stock.status
        })

    return {
        "extracted_material_name": request.material_name,
        "normalized_extracted_name": normalized_name,
        "extracted_dimensions_str": request.dimensions_str,
        "extracted_dims": extracted_dims,
        "detected_form_type": form_type,
        "matching_materials": matching_materials,
        "stocks_found": len(stocks),
        "stock_details": stock_details
    }


@router.put("/stock/{stock_id}", response_model=RawMaterialStockWithDetails)
def update_raw_material_stock(stock_id: int, stock: RawMaterialStockUpdate, db: Session = Depends(get_db)):
    """Update a raw material stock item"""
    db_stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not db_stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock item with id {stock_id} not found"
        )
    
    update_data = stock.model_dump(exclude_unset=True)
    
    # Validate source_type and source_order_id combination if being updated
    if "source_type" in update_data or "source_order_id" in update_data:
        source_type = update_data.get("source_type", db_stock.source_type)
        source_order_id = update_data.get("source_order_id", db_stock.source_order_id)
        
        if source_type == "order" and not source_order_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="source_order_id is required when source_type is 'order'"
            )
        
        if source_type == "general" and source_order_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="source_order_id should be None when source_type is 'general'"
            )
        
        # If source_order_id is being set/updated, validate order exists
        if source_order_id:
            order = db.query(OrderModel).filter(OrderModel.id == source_order_id).first()
            if not order:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Order with id {source_order_id} not found"
                )
    
    # If dimensions or quantity changed, recalculate properties and recreate units
    recalculate = any(key in update_data for key in [
        "form_type", "diameter", "length", "breadth", "height", 
        "inner_diameter", "outer_diameter", "quantity"
    ])
    
    if recalculate:
        # Get material
        material = db.query(RawMaterialModel).filter(
            RawMaterialModel.id == update_data.get("material_id", db_stock.material_id)
        ).first()
        if not material:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Material not found"
            )
        
        # Create temporary stock data for calculation
        temp_stock = RawMaterialStockUpdate(
            form_type=update_data.get("form_type", db_stock.form_type),
            diameter=update_data.get("diameter", db_stock.diameter),
            length=update_data.get("length", db_stock.length),
            breadth=update_data.get("breadth", db_stock.breadth),
            height=update_data.get("height", db_stock.height),
            inner_diameter=update_data.get("inner_diameter", db_stock.inner_diameter),
            outer_diameter=update_data.get("outer_diameter", db_stock.outer_diameter),
            quantity=update_data.get("quantity", db_stock.quantity)
        )
        
        try:
            properties = RawMaterialCalculationService.calculate_stock_item_properties(material, temp_stock)
            update_data.update(properties)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        
        # Delete old units and create new ones
        old_units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
        unit_ids = [u.id for u in old_units]
        
        # Clear part references to old units
        if unit_ids:
            referencing_parts = (
                db.query(PartModel)
                .filter(PartModel.raw_material_unit_id.in_(unit_ids))
                .all()
            )
            for part in referencing_parts:
                part.raw_material_unit_id = None
                part.raw_material_id = None
                part.required_length = None
        
        # Delete old usage records
        if unit_ids:
            db.query(RawMaterialUsageModel).filter(
                RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)
            ).delete(synchronize_session=False)
        
        # Delete old units
        db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).delete(
            synchronize_session=False
        )
        
        # Create new units with updated values
        new_quantity = update_data.get("quantity", db_stock.quantity)
        new_length = update_data.get("length", db_stock.length)
        
        if new_quantity > 0 and new_length:
            # Calculate per-unit values
            per_unit_volume = properties.get("volume") / new_quantity if properties.get("volume") else None
            per_unit_mass = properties.get("mass") / new_quantity if properties.get("mass") else None
            per_unit_weight = properties.get("weight") / new_quantity if properties.get("weight") else None
            per_unit_cost = properties.get("cost") / new_quantity if properties.get("cost") else None
            
            for i in range(new_quantity):
                unit = RawMaterialUnitModel(
                    stock_id=stock_id,
                    total_length=new_length,
                    remaining_length=new_length,
                    volume=per_unit_volume,
                    mass=per_unit_mass,
                    weight=per_unit_weight,
                    cost=per_unit_cost,
                    status="available"
                )
                db.add(unit)
                db.flush()  # Flush to get the unit ID
                
                # Log history for unit creation
                try:
                    RawMaterialHistoryService.log_unit_created(
                        db=db,
                        unit_id=unit.id,
                        user_id=stock.user_id if hasattr(stock, 'user_id') else None
                    )
                except Exception as e:
                    print(f"Error logging unit creation history: {e}")
    
    # Apply updates
    for field, value in update_data.items():
        setattr(db_stock, field, value)
    
    # Clear unrelated dimension fields based on new form_type
    new_form_type = update_data.get("form_type", db_stock.form_type)
    if new_form_type == "Round":
        db_stock.breadth = None
        db_stock.height = None
        db_stock.inner_diameter = None
        db_stock.outer_diameter = None
    elif new_form_type == "Square":
        db_stock.diameter = None
        db_stock.inner_diameter = None
        db_stock.outer_diameter = None
    elif new_form_type == "Pipe":
        db_stock.diameter = None
        db_stock.breadth = None
        db_stock.height = None
    
    db.commit()
    db.refresh(db_stock)
    
    # Log history for stock update
    try:
        RawMaterialHistoryService.log_stock_updated(
            db=db,
            stock_id=stock_id,
            old_values={},
            new_values=update_data,
            user_id=stock.user_id if hasattr(stock, 'user_id') else None
        )
    except Exception as e:
        print(f"Error logging stock update history: {e}")
    
    return _stock_with_details(db_stock, db)


@router.delete("/stock/{stock_id}", status_code=status.HTTP_200_OK)
def delete_raw_material_stock(stock_id: int, db: Session = Depends(get_db)):
    """Delete a raw material stock item with cascade deletion (units, usage, parts)"""
    db_stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not db_stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock item with id {stock_id} not found"
        )
    
    # Check if any parts linked to this stock have active schedule status
    units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
    unit_ids = [u.id for u in units]
    
    if unit_ids:
        referencing_parts = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
        part_ids = [p.id for p in referencing_parts]
        
        if part_ids:
            active_parts = db.execute(
                text("""
                    SELECT p.id, p.part_name 
                    FROM oms.parts p
                    JOIN scheduling.part_schedule_status pss ON p.id = pss.part_id
                    WHERE p.id IN :part_ids AND pss.status = 'active'
                """),
                {"part_ids": tuple(part_ids)}
            ).fetchall()
            
            if active_parts:
                part_names = [row[1] for row in active_parts]
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sorry, this stock cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this stock, please inactivate the schedule status of these parts first."
                )
    
    try:
        # Store material name and source type for history before deletion
        material_name = db_stock.material.material_name if db_stock.material else "Unknown"
        source_type = db_stock.source_type
        
        # Get all units for this stock
        units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
        unit_ids = [u.id for u in units]
        
        # Find all parts that reference these units
        if unit_ids:
            referencing_parts = (
                db.query(PartModel)
                .filter(PartModel.raw_material_unit_id.in_(unit_ids))
                .all()
            )
            
            # Clear all part references to these units
            for part in referencing_parts:
                part.raw_material_unit_id = None
                part.raw_material_id = None
                part.required_length = None
            
            # Flush to ensure part references are cleared before deleting units
            db.flush()
        
        # Delete all usage records for these units
        if unit_ids:
            db.query(RawMaterialUsageModel).filter(
                RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)
            ).delete(synchronize_session=False)
        
        # Delete all units for this stock
        db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).delete(
            synchronize_session=False
        )
        
        # Delete quality documents for this stock (cascade delete from DB and MinIO)
        quality_docs = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        ).all()
        for doc in quality_docs:
            try:
                from DB.minio_client import get_minio_client
                minio_client = get_minio_client()
                url_parts = doc.document_url.split('/')
                object_name = '/'.join(url_parts[4:])
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Error deleting file from MinIO: {e}")
            db.delete(doc)
        
        # Delete history records for this stock
        db.query(RawMaterialHistoryModel).filter(
            RawMaterialHistoryModel.stock_id == stock_id
        ).delete(synchronize_session=False)
        
        # Delete the stock item
        db.delete(db_stock)
        
        # Commit all changes
        db.commit()
        
        # Log history for stock deletion
        try:
            RawMaterialHistoryService.log_stock_deleted(
                db=db,
                stock_id=stock_id,
                material_name=material_name,
                source_type=source_type,
                user_id=None
            )
        except Exception as e:
            print(f"Error logging stock deletion history: {e}")
        
        return {
            "message": f"Stock item deleted successfully",
            "units_deleted": len(units),
            "parts_updated": len(referencing_parts) if unit_ids else 0
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting stock item: {str(e)}"
        )


@router.delete("/stock/units/{unit_id}", status_code=status.HTTP_200_OK)
def delete_raw_material_unit(unit_id: int, db: Session = Depends(get_db)):
    """Delete a single raw material unit with cascade cleanup of usages and part references"""
    unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unit {unit_id} not found")
    try:
        stock_id = unit.stock_id
        # Store material name for history before deletion
        material_name = unit.stock.material.material_name if unit.stock and unit.stock.material else "Unknown"
        
        # Clear part references
        referencing_parts = db.query(PartModel).filter(PartModel.raw_material_unit_id == unit_id).all()
        for part in referencing_parts:
            part.raw_material_unit_id = None
            part.raw_material_id = None
            part.required_length = None
        db.flush()
        # Delete usages
        db.query(RawMaterialUsageModel).filter(
            RawMaterialUsageModel.raw_material_unit_id == unit_id
        ).delete(synchronize_session=False)
        
        # Delete history records for this unit
        db.query(RawMaterialHistoryModel).filter(
            RawMaterialHistoryModel.unit_id == unit_id
        ).delete(synchronize_session=False)
        
        # Decrement stock total quantity
        stock_item = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if stock_item and stock_item.quantity > 0:
            stock_item.quantity -= 1
        # Delete unit
        db.delete(unit)
        db.commit()
        
        # Log history for unit deletion
        try:
            RawMaterialHistoryService.log_unit_deleted(
                db=db,
                unit_id=unit_id,
                material_name=material_name,
                user_id=None
            )
        except Exception as e:
            print(f"Error logging unit deletion history: {e}")
        
        # Update stock status and available_quantity from remaining units
        StockAutoUpdateService.update_stock_status_from_units(db, stock_id)
        return {"message": f"Unit {unit_id} deleted successfully", "parts_updated": len(referencing_parts)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Error deleting unit: {str(e)}")


@router.post("/stock/{stock_id}/use", status_code=status.HTTP_200_OK)
def use_raw_material_stock(stock_id: int, used_quantity: int, db: Session = Depends(get_db)):
    """Deduct quantity from stock item"""
    db_stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not db_stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock item with id {stock_id} not found"
        )
    
    if used_quantity <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="used_quantity must be positive"
        )
    
    if db_stock.quantity < used_quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Available: {db_stock.quantity}, Requested: {used_quantity}"
        )
    
    # Deduct quantity
    db_stock.quantity -= used_quantity
    
    # Update status based on new logic
    if db_stock.source_type == "general":
        # For general stock: available if available_quantity > 0
        db_stock.status = "available" if db_stock.available_quantity > 0 else "exhausted"
    elif db_stock.source_type == "order":
        # For order stock: available only if order_status = "received" AND available_quantity > 0
        if db_stock.available_quantity <= 0:
            db_stock.status = "exhausted"
        elif db_stock.order_status == "received":
            db_stock.status = "available"
        else:
            db_stock.status = db_stock.order_status or "pending"
    
    # Recalculate mass and total values
    material = db.query(RawMaterialModel).filter(RawMaterialModel.id == db_stock.material_id).first()
    if material and db_stock.volume:
        db_stock.mass = RawMaterialCalculationService.calculate_mass(
            material.density, db_stock.volume, db_stock.quantity
        )
    
    db.commit()
    db.refresh(db_stock)
    
    return {
        "message": f"Successfully used {used_quantity} units from stock item {stock_id}",
        "remaining_quantity": db_stock.quantity,
        "status": db_stock.status
    }


@router.post("/sync-stock-statuses", status_code=status.HTTP_200_OK)
def sync_all_stock_statuses(db: Session = Depends(get_db)):
    """
    Manually trigger stock status synchronization based on unit statuses.
    This endpoint updates all stock statuses to reflect the actual unit statuses.
    Useful for fixing data inconsistencies.
    """
    result = StockAutoUpdateService.update_all_stock_statuses_from_units(db)
    return result


def _stock_with_details(stock: RawMaterialStockModel, db: Session) -> dict:
    """Helper function to add details to stock item"""
    
    # Determine the actual status based on unit statuses
    def get_stock_status(stock_item):
        # Get all units for this stock
        from DB.models.inventory import RawMaterialUnit
        units = db.query(RawMaterialUnit).filter(RawMaterialUnit.stock_id == stock_item.id).all()
        
        if not units:
            # No units exist, use available_quantity as fallback
            if stock_item.source_type == "general":
                return "available" if stock_item.available_quantity > 0 else "exhausted"
            elif stock_item.source_type == "order":
                if stock_item.available_quantity > 0:
                    if stock_item.order_status == "received":
                        return "available"
                    else:
                        return "not_available"
                else:
                    # No available quantity
                    return "not_available"
            else:
                return stock_item.status
        
        # Check unit statuses
        available_units = [u for u in units if u.status in ['available', 'partially_used']]
        
        if available_units:
            # At least one unit is available
            if stock_item.source_type == "general":
                return "available"
            elif stock_item.source_type == "order":
                # For order stock, only available if order_status is received
                return "available" if stock_item.order_status == "received" else "not_available"
            else:
                return "available"
        else:
            # All units are exhausted or not_available
            if stock_item.source_type == "order":
                # For order stock, always return not_available (order_status shown separately)
                return "not_available"
            else:
                return "exhausted"
    
    # Update available_quantity based on unit statuses
    from DB.models.inventory import RawMaterialUnit
    units = db.query(RawMaterialUnit).filter(RawMaterialUnit.stock_id == stock.id).all()
    if units:
        available_count = len([u for u in units if u.status in ['available', 'partially_used']])
        stock.available_quantity = available_count
    
    result = {
        "id": stock.id,
        "material_id": stock.material_id,
        "process_type": stock.process_type,
        "form_type": stock.form_type,
        "diameter": stock.diameter,
        "length": stock.length,
        "breadth": stock.breadth,
        "height": stock.height,
        "inner_diameter": stock.inner_diameter,
        "outer_diameter": stock.outer_diameter,
        "quantity": stock.quantity,
        "allocated_quantity": stock.allocated_quantity,
        "available_quantity": stock.available_quantity,
        "volume": stock.volume,
        "mass": stock.mass,
        "weight": stock.weight,
        "cost": stock.cost,
        "estimated_cost": stock.estimated_cost,
        "final_cost": stock.final_cost,
        "source_type": stock.source_type,
        "source_order_id": stock.source_order_id,
        "order_status": stock.order_status,
        "part_id": stock.part_id,
        "vendor_id": stock.vendor_id,  # Comma-separated vendor IDs for enquiry
        "received_vendor_id": stock.received_vendor_id,  # Final vendor who received the order
        "user_id": stock.user_id,
        "merge_group_id": stock.merge_group_id,  # UUID to track merged orders for bulk vendor linking
        "status": get_stock_status(stock),  # Calculate status based on unit statuses
        "created_at": stock.created_at,
        "updated_at": stock.updated_at,
        "creation_source": stock.creation_source,  # Identify auto-extracted materials
    }
    
    # Add material name
    if stock.material:
        result["material_name"] = stock.material.material_name
    
    # Build stock dimensions string
    stock_dimensions = None
    if stock.form_type:
        if stock.form_type == 'Round':
            stock_dimensions = f'Ø{stock.diameter} × {stock.length}mm'
        elif stock.form_type == 'Square':
            stock_dimensions = f'{stock.breadth} × {stock.height} × {stock.length}mm'
        elif stock.form_type == 'Pipe':
            stock_dimensions = f'Ø{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm'
    result["stock_dimensions"] = stock_dimensions
    
    # Add source order details
    if stock.source_order_id:
        # Always fetch manually to ensure we get the order details
        order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
        if order:
            result["source_order_number"] = order.sale_order_number
            # Add product name (project name)
            if order.product_id:
                from DB.models.oms import Product as ProductModel
                product = db.query(ProductModel).filter(ProductModel.id == order.product_id).first()
                if product:
                    result["product_name"] = product.product_name
                else:
                    result["product_name"] = ""
        else:
            result["source_order_number"] = f"Order #{stock.source_order_id} (Not Found)"
            result["product_name"] = ""
    
    # Add part details (handle comma-separated part IDs)
    all_parts = []
    if stock.part_id:
        try:
            # Split comma-separated part IDs and fetch part details
            part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
            parts = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            if parts:
                all_parts.extend(parts)
                result["part_numbers"] = [part.part_number for part in parts]
                result["part_names"] = [f"{part.part_number} - {part.part_name}" for part in parts]
                result["part_ids"] = stock.part_id  # Keep original string format
                
                # Add part required lengths
                part_required_lengths = []
                for part in parts:
                    if part.required_length:
                        part_required_lengths.append(str(part.required_length))
                    else:
                        part_required_lengths.append("0")
                result["part_required_lengths"] = part_required_lengths
        except (ValueError, AttributeError):
            # If part_id is not valid comma-separated integers, just store as is
            result["part_ids"] = stock.part_id
            result["part_required_lengths"] = []
    
    # 🔥 NEW: Add part information from usage records for general stock
    # Fetch parts linked through unit-based tracking
    from DB.models.inventory import RawMaterialUnit, RawMaterialUsage
    units = db.query(RawMaterialUnit).filter(RawMaterialUnit.stock_id == stock.id).all()
    
    # Create order-to-part mapping
    order_parts_mapping = {}
    
    if units:
        unit_ids = [u.id for u in units]
        usages = db.query(RawMaterialUsage).filter(RawMaterialUsage.raw_material_unit_id.in_(unit_ids)).all()
        if usages:
            linked_part_ids = [usage.part_id for usage in usages]
            linked_parts = db.query(PartModel).filter(PartModel.id.in_(linked_part_ids)).all()
            if linked_parts:
                all_parts.extend(linked_parts)
                existing_part_numbers = result.get("part_numbers", [])
                existing_part_names = result.get("part_names", [])
                existing_part_ids = result.get("part_ids", "")
                
                # Remove duplicates by checking part IDs
                existing_part_ids_set = set()
                if existing_part_ids:
                    existing_part_ids_set = set(int(pid.strip()) for pid in existing_part_ids.split(',') if pid.strip())
                
                # Only add parts that don't already exist
                new_part_numbers = []
                new_part_names = []
                new_part_ids = []
                for part in linked_parts:
                    if part.id not in existing_part_ids_set:
                        new_part_numbers.append(part.part_number)
                        new_part_names.append(f"{part.part_number} - {part.part_name}")
                        new_part_ids.append(str(part.id))
                        existing_part_ids_set.add(part.id)
                
                result["part_numbers"] = existing_part_numbers + new_part_numbers
                result["part_names"] = existing_part_names + new_part_names
                
                # Handle part_ids concatenation properly with deduplication
                if new_part_ids:
                    if existing_part_ids:
                        result["part_ids"] = existing_part_ids + "," + ",".join(new_part_ids)
                    else:
                        result["part_ids"] = ",".join(new_part_ids)
                
                # 🔥 NEW: Fetch order information from linked parts and build order-to-part mapping
                for part in linked_parts:
                    if part.product_id:
                        # Get orders for this part's product
                        orders = db.query(OrderModel).filter(OrderModel.product_id == part.product_id).all()
                        for order in orders:
                            order_number = order.sale_order_number
                            if order_number not in order_parts_mapping:
                                order_parts_mapping[order_number] = []
                            order_parts_mapping[order_number].append(part.part_number)
                
                # Build source_order_number from the mapping
                if order_parts_mapping:
                    result["source_order_number"] = ", ".join(sorted(order_parts_mapping.keys()))
    
    # Add order-to-part mapping to result
    result["order_parts_mapping"] = order_parts_mapping
    
    # Add vendor details (handle both comma-separated vendor IDs and received vendor)
    # Always handle comma-separated vendor IDs for enquiry phase (all vendors)
    if stock.vendor_id:
        try:
            vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
            vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
            if vendors:
                result["vendor_name"] = ", ".join([vendor.company_name for vendor in vendors])
        except (ValueError, AttributeError):
            result["vendor_name"] = stock.vendor_id  # Keep as string if invalid format
    
    # Add received vendor name separately if available
    if stock.received_vendor_id:
        received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
        if received_vendor:
            result["received_vendor_name"] = received_vendor.company_name
    
    # Add creator name
    if stock.creator:
        result["creator_name"] = stock.creator.user_name
    
    # Calculate totals
    if stock.volume:
        result["total_volume"] = round(stock.volume * stock.quantity, 6)
    if stock.mass:
        result["total_mass"] = round(stock.mass * stock.quantity, 3)
    if stock.weight:
        result["total_weight"] = round(stock.weight * stock.quantity, 3)
    if stock.cost:
        result["total_cost"] = round(stock.cost * stock.quantity, 2)
    
    return result


# =======================
# 🔥 UNIT-BASED TRACKING ENDPOINTS
# =======================

@router.get("/units/", response_model=List[RawMaterialUnitWithDetails])
def get_raw_material_units(
    stock_id: int = None,
    unit_id: int = None,
    status: str = None,
    db: Session = Depends(get_db)
):
    """Get raw material units with optional filtering"""
    query = db.query(RawMaterialUnitModel).options(
        joinedload(RawMaterialUnitModel.stock).joinedload(RawMaterialStockModel.material)
    )
    
    if unit_id is not None:
        query = query.filter(RawMaterialUnitModel.id == unit_id)
    
    if stock_id is not None:
        query = query.filter(RawMaterialUnitModel.stock_id == stock_id)
    
    if status is not None:
        query = query.filter(RawMaterialUnitModel.status == status)
    
    units = query.order_by(RawMaterialUnitModel.stock_id.asc(), RawMaterialUnitModel.id.asc()).all()
    
    # Get all unit IDs
    unit_ids = [unit.id for unit in units]
    
    # Fetch usage data for all units in one query
    usages_by_unit = {}
    if unit_ids:
        usages = db.query(RawMaterialUsageModel).options(
            joinedload(RawMaterialUsageModel.part)
        ).filter(RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)).all()
        
        for usage in usages:
            if usage.raw_material_unit_id not in usages_by_unit:
                usages_by_unit[usage.raw_material_unit_id] = []
            usages_by_unit[usage.raw_material_unit_id].append({
                "id": usage.id,
                "part_id": usage.part_id,
                "used_length": usage.used_length,
                "created_at": usage.created_at,
                "part_name": usage.part.part_name if usage.part else None,
                "part_number": usage.part.part_number if usage.part else None,
                "part": {
                    "product_id": usage.part.product_id if usage.part else None
                } if usage.part else None
            })
    
    result = []
    for unit in units:
        unit_dict = {
            "id": unit.id,
            "stock_id": unit.stock_id,
            "total_length": unit.total_length,
            "remaining_length": unit.remaining_length,
            "volume": unit.volume,
            "mass": unit.mass,
            "weight": unit.weight,
            "cost": unit.cost,
            "status": unit.status,
            "created_at": unit.created_at,
            "updated_at": unit.updated_at,
            "material_name": unit.stock.material.material_name if unit.stock and unit.stock.material else None,
            "stock_details": {
                "form_type": unit.stock.form_type,
                "process_type": unit.stock.process_type,
                "diameter": unit.stock.diameter,
                "length": unit.stock.length,
                "breadth": unit.stock.breadth,
                "height": unit.stock.height,
                "inner_diameter": unit.stock.inner_diameter,
                "outer_diameter": unit.stock.outer_diameter,
                "quantity": unit.stock.quantity,
                "estimated_cost": unit.stock.estimated_cost,
                "final_cost": unit.stock.final_cost
            } if unit.stock else None,
            "usages": usages_by_unit.get(unit.id, [])
        }
        result.append(unit_dict)
    
    return result


@router.post("/assign-material/", response_model=RawMaterialUsageWithDetails, status_code=status.HTTP_201_CREATED)
def assign_material_to_part(
    unit_id: int,
    part_id: int,
    required_length: float,
    user_id: int = None,
    db: Session = Depends(get_db)
):
    """Assign material unit to a part and track usage"""
    
    # Get part first to check schedule status
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    
    # Check if part is scheduled (status is "active")
    schedule_status = db.execute(
        text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
        {"pid": part_id}
    ).fetchone()
    
    if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sorry, this part's raw material cannot be changed because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
        )
    
    # Get unit
    unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unit with id {unit_id} not found"
        )
    
    # Check if part already has a different unit assigned
    if part.raw_material_unit_id and part.raw_material_unit_id != unit_id:
        # Remove old assignment
        old_unit = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.id == part.raw_material_unit_id
        ).first()
        
        if old_unit:
            # Restore old unit's remaining length
            old_usage = db.query(RawMaterialUsageModel).filter(
                RawMaterialUsageModel.raw_material_unit_id == part.raw_material_unit_id,
                RawMaterialUsageModel.part_id == part_id
            ).first()
            
            if old_usage:
                # Restore length
                old_unit.remaining_length += old_usage.used_length
                
                # Update old unit status - BUT only for general stock
                # For order stock, status is controlled by order_status, not by assignment
                if old_unit.stock and old_unit.stock.source_type == 'general':
                    if old_unit.remaining_length == old_unit.total_length:
                        old_unit.status = "available"
                    elif old_unit.remaining_length > 0:
                        old_unit.status = "partially_used"
                elif old_unit.stock and old_unit.stock.source_type == 'order':
                    # For order stock, status is controlled by order_status
                    # Don't change status here - let the order status update handle it
                    # Keep the status based on the stock's order_status
                    if old_unit.stock.order_status == 'received':
                        if old_unit.remaining_length == old_unit.total_length:
                            old_unit.status = "available"
                        elif old_unit.remaining_length > 0:
                            old_unit.status = "partially_used"
                        else:
                            old_unit.status = "exhausted"
                    else:
                        # For non-received order status, keep as not_available
                        old_unit.status = "not_available"
                
                # Delete old usage record
                db.delete(old_usage)
    
    # Validate remaining length
    if unit.remaining_length < required_length:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Not enough length. Required: {required_length}, Available: {unit.remaining_length}"
        )
    
    # Update unit remaining length
    unit.remaining_length -= required_length
    
    # Track old status for history
    old_unit_status = unit.status
    
    # Update unit status if exhausted - BUT only for general stock
    # For order stock, status is controlled by order_status, not by assignment
    if unit.stock and unit.stock.source_type == 'general':
        if unit.remaining_length == 0:
            unit.status = "exhausted"
        elif unit.remaining_length < unit.total_length:
            unit.status = "partially_used"
    elif unit.stock and unit.stock.source_type == 'order':
        # For order stock, status is controlled by order_status
        # Keep the status based on the stock's order_status
        if unit.stock.order_status == 'received':
            if unit.remaining_length == 0:
                unit.status = "exhausted"
            elif unit.remaining_length < unit.total_length:
                unit.status = "partially_used"
            else:
                unit.status = "available"
        else:
            # For non-received order status, keep as not_available
            unit.status = "not_available"
    
    # Log history for unit status change if it changed
    if old_unit_status != unit.status:
        try:
            RawMaterialHistoryService.log_unit_status_changed(
                db=db,
                unit_id=unit_id,
                old_status=old_unit_status,
                new_status=unit.status,
                user_id=user_id
            )
        except Exception as e:
            print(f"Error logging unit status change history: {e}")
    
    # Check if usage record already exists for this part and unit
    existing_usage = db.query(RawMaterialUsageModel).filter(
        RawMaterialUsageModel.raw_material_unit_id == unit_id,
        RawMaterialUsageModel.part_id == part_id
    ).first()
    
    if existing_usage:
        # Update existing usage record instead of creating new one
        existing_usage.used_length += required_length
        usage = existing_usage
        db.add(usage)
        # Accumulate required_length in parts table for total
        part.required_length += required_length
    else:
        # Create new usage record
        usage = RawMaterialUsageModel(
            raw_material_unit_id=unit_id,
            part_id=part_id,
            used_length=required_length,
            user_id=user_id  # Store the user who linked the material
        )
        db.add(usage)
        # Set required_length to new value for new assignment
        part.required_length = required_length
    
    # 🔥 IMPORTANT: Update part with unit tracking information
    part.raw_material_unit_id = unit_id  # Store the specific unit
    part.raw_material_id = unit.stock.material_id  # Store the material ID
    
    db.commit()
    
    # Log history for material assignment
    try:
        RawMaterialHistoryService.log_material_linked(
            db=db,
            unit_id=unit_id,
            part_id=part_id,
            used_length=required_length,
            user_id=user_id
        )
    except Exception as e:
        # Log error but don't fail the operation
        print(f"Error logging material assignment history: {e}")
    
    # 🔥 Update stock status based on unit statuses
    StockAutoUpdateService.update_stock_status_from_units(db, unit.stock_id)
    
    db.refresh(usage)
    
    # Return with details
    result = {
        "id": usage.id,
        "raw_material_unit_id": usage.raw_material_unit_id,
        "part_id": usage.part_id,
        "used_length": usage.used_length,
        "created_at": usage.created_at,
        "part_name": part.part_name,
        "part_number": part.part_number,
        "unit_details": {
            "id": unit.id,
            "stock_id": unit.stock_id,
            "total_length": unit.total_length,
            "remaining_length": unit.remaining_length,
            "status": unit.status,
            "material_name": unit.stock.material.material_name if unit.stock and unit.stock.material else None
        }
    }
    
    return result


@router.delete("/parts/{part_id}/unlink-material")
def unlink_material_from_part(part_id: int, user_id: int = None, db: Session = Depends(get_db)):
    """Unlink material from part - restore unit length and delete part/usage details"""
    # Get part
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    
    # Check if part is scheduled (status is "active")
    schedule_status = db.execute(
        text("SELECT status FROM scheduling.part_schedule_status WHERE part_id = :pid"),
        {"pid": part_id}
    ).fetchone()
    
    if schedule_status and schedule_status[0] and schedule_status[0].lower() == "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sorry, this part's raw material cannot be changed because the part is currently scheduled for production. To make changes, please inactivate the part's schedule status first."
        )
    
    if not part.raw_material_unit_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part {part_id} has no material assigned"
        )
    
    # Get the unit
    unit = db.query(RawMaterialUnitModel).filter(
        RawMaterialUnitModel.id == part.raw_material_unit_id
    ).first()
    
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unit {part.raw_material_unit_id} not found"
        )
    
    # Get usage record
    usage = db.query(RawMaterialUsageModel).filter(
        RawMaterialUsageModel.raw_material_unit_id == part.raw_material_unit_id,
        RawMaterialUsageModel.part_id == part_id
    ).first()
    
    if usage:
        # Restore unit's remaining length
        unit.remaining_length += usage.used_length
        
        # Update unit status - BUT only for general stock
        # For order stock, status is controlled by order_status, not by unlink
        if unit.stock and unit.stock.source_type == 'general':
            if unit.remaining_length == unit.total_length:
                unit.status = "available"
            elif unit.remaining_length > 0:
                unit.status = "partially_used"
        elif unit.stock and unit.stock.source_type == 'order':
            # For order stock, status is controlled by order_status
            # Keep the status based on the stock's order_status
            if unit.stock.order_status == 'received':
                if unit.remaining_length == unit.total_length:
                    unit.status = "available"
                elif unit.remaining_length > 0:
                    unit.status = "partially_used"
                else:
                    unit.status = "exhausted"
            else:
                # For non-received order status, keep as not_available
                unit.status = "not_available"
        
        # Delete usage record
        db.delete(usage)
    
    # Store material name for history before clearing
    material_name = unit.stock.material.material_name if unit.stock and unit.stock.material else "Unknown"
    unit_id_for_history = part.raw_material_unit_id
    
    # Clear part details
    part.raw_material_unit_id = None
    part.raw_material_id = None
    part.required_length = None
    
    db.commit()
    
    # Log history for material unlinking
    try:
        RawMaterialHistoryService.log_material_unlinked(
            db=db,
            unit_id=unit_id_for_history,
            part_id=part_id,
            material_name=material_name,
            user_id=user_id
        )
    except Exception as e:
        # Log error but don't fail the operation
        print(f"Error logging material unlinking history: {e}")
    
    # 🔥 Update stock status based on unit statuses
    if unit.stock:
        StockAutoUpdateService.update_stock_status_from_units(db, unit.stock_id)
    
    return {"message": f"Material unlinked from part {part_id} successfully"}


@router.get("/usage/", response_model=List[RawMaterialUsageWithDetails])
def get_material_usage(
    part_id: int = None,
    unit_id: int = None,
    db: Session = Depends(get_db)
):
    """Get material usage records with optional filtering"""
    query = db.query(RawMaterialUsageModel).options(
        joinedload(RawMaterialUsageModel.unit).joinedload(RawMaterialUnitModel.stock).joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialUsageModel.part)
    )
    
    if part_id is not None:
        query = query.filter(RawMaterialUsageModel.part_id == part_id)
    
    if unit_id is not None:
        query = query.filter(RawMaterialUsageModel.raw_material_unit_id == unit_id)
    
    usages = query.order_by(RawMaterialUsageModel.created_at.desc()).all()
    
    result = []
    for usage in usages:
        usage_dict = {
            "id": usage.id,
            "raw_material_unit_id": usage.raw_material_unit_id,
            "part_id": usage.part_id,
            "used_length": usage.used_length,
            "created_at": usage.created_at,
            "part_name": usage.part.part_name if usage.part else None,
            "part_number": usage.part.part_number if usage.part else None,
            "unit_details": {
                "id": usage.unit.id,
                "stock_id": usage.unit.stock_id,
                "total_length": usage.unit.total_length,
                "remaining_length": usage.unit.remaining_length,
                "status": usage.unit.status,
                "material_name": usage.unit.stock.material.material_name if usage.unit.stock and usage.unit.stock.material else None
            } if usage.unit else None
        }
        result.append(usage_dict)
    
    return result


@router.get("/parts/{part_id}/material-usage", response_model=List[RawMaterialUsageWithDetails])
def get_part_material_usage(part_id: int, db: Session = Depends(get_db)):
    """Get all material usage for a specific part"""
    return get_material_usage(part_id=part_id, db=db)


@router.get("/stock/{stock_id}/available-units", response_model=List[RawMaterialUnitWithDetails])
def get_available_units_for_stock(stock_id: int, db: Session = Depends(get_db)):
    """Get available units for a specific stock item (backward compatibility)"""
    return get_raw_material_units(stock_id=stock_id, status="available", db=db)


@router.get("/stock/{stock_id}/units", response_model=List[RawMaterialUnitWithDetails])
def get_all_units_for_stock(stock_id: int, status: str = None, db: Session = Depends(get_db)):
    """Get all units for a specific stock item (optional status filter)"""
    return get_raw_material_units(stock_id=stock_id, status=status, db=db)


@router.get("/units/{unit_id}", response_model=RawMaterialUnitWithDetails)
def get_unit_by_id(unit_id: int, db: Session = Depends(get_db)):
    """Get a specific unit by ID"""
    units = get_raw_material_units(unit_id=unit_id, db=db)
    if not units:
        raise HTTPException(status_code=404, detail=f"Unit {unit_id} not found")
    return units[0]
