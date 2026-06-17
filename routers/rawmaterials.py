from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, Vendors as VendorsModel, RawMaterialUnit as RawMaterialUnitModel, RawMaterialUsage as RawMaterialUsageModel
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

router = APIRouter(
    prefix="/rawmaterials",
    tags=["rawmaterials"]
)


class StockRecommendationRequest(BaseModel):
    material_name: str
    dimensions_str: str
    min_score: float = 0.3
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
    return db_raw_material


@router.get("/", response_model=List[RawMaterial])
def get_raw_materials(
    user_id: int = None,
    manufacturing_coordinator_id: int = None,
    db: Session = Depends(get_db)
):
    """Get all raw materials with stock status, optionally filtered by user or manufacturing coordinator"""
    materials = db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()
    
    # For manufacturing coordinator, show all raw materials (not just order-linked ones)
    # This allows them to see and work with general materials too
    if manufacturing_coordinator_id is not None:
        # Manufacturing coordinators can see all raw materials
        # No filtering applied - they get full access to materials catalog
        pass
    # If no specific filter, return all materials (default behavior)
    
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
def get_inventory_view(db: Session = Depends(get_db)):
    """
    Single endpoint returning full inventory hierarchy:
    materials -> stocks (general + order) -> units (with usages).
    Replaces multiple /stock/ and /stock/{id}/units calls.
    """
    from DB.models.inventory import RawMaterialUnit, RawMaterialUsage
    from sqlalchemy.orm import joinedload

    # 1. All materials
    materials = db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()
    material_ids = [m.id for m in materials]

    if not material_ids:
        return []

    # 2. All stocks for all materials (bulk)
    stocks = (
        db.query(RawMaterialStockModel)
        .filter(RawMaterialStockModel.material_id.in_(material_ids))
        .order_by(RawMaterialStockModel.material_id.asc(), RawMaterialStockModel.id.asc())
        .all()
    )
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
    admin_id: int = None,  # Filter by admin ID
    manufacturing_coordinator_id: int = None,  # Filter by manufacturing coordinator ID
    source_type: str = None,  # "general" or "order"
    order_id: int = None,
    material_id: int = None,
    activity_type: str = None,  # "stock_created", "material_linked", "order_status_changed", "stock_updated", "material_unlinked"
    db: Session = Depends(get_db)
):
    """
    Get comprehensive raw material history with date filtering.
    
    Aggregates all raw material activities including:
    - Stock creation events
    - Material linking to parts
    - Order status changes
    - Stock updates
    - Material unlinking
    
    Date filtering options:
    - start_date and end_date: Range filter (YYYY-MM-DD format)
    - year, month, day: Specific date filter
    
    User filtering:
    - admin_id: Filter by admin's orders
    - manufacturing_coordinator_id: Filter by manufacturing coordinator's orders
    """
    from datetime import datetime
    from sqlalchemy import and_, or_
    
    history_items = []
    
    # Date filter logic
    date_filter = None
    if start_date and end_date:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        date_filter = and_(
            RawMaterialStockModel.created_at >= start_dt,
            RawMaterialStockModel.created_at <= end_dt
        )
    elif year:
        if month:
            if day:
                # Specific day
                date_filter = and_(
                    RawMaterialStockModel.created_at >= datetime(year, month, day),
                    RawMaterialStockModel.created_at < datetime(year, month, day + 1)
                )
            else:
                # Specific month
                date_filter = and_(
                    RawMaterialStockModel.created_at >= datetime(year, month, 1),
                    RawMaterialStockModel.created_at < datetime(year, month + 1, 1) if month < 12 else datetime(year + 1, 1, 1)
                )
        else:
            # Specific year
            date_filter = and_(
                RawMaterialStockModel.created_at >= datetime(year, 1, 1),
                RawMaterialStockModel.created_at < datetime(year + 1, 1, 1)
            )
    
    # 1. Get stock creation events
    stock_query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
        joinedload(RawMaterialStockModel.creator)
    )
    
    if date_filter:
        stock_query = stock_query.filter(date_filter)
    if source_type:
        stock_query = stock_query.filter(RawMaterialStockModel.source_type == source_type)
    if order_id:
        stock_query = stock_query.filter(RawMaterialStockModel.source_order_id == order_id)
    if material_id:
        stock_query = stock_query.filter(RawMaterialStockModel.material_id == material_id)
    
    # Note: No user filtering - both Admin and MC see all history data
    
    stocks = stock_query.all()
    
    for stock in stocks:
        # Format dimensions string
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Add vendor information for stock creation
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        vendor_name = None
        
        # For order source, get all vendor names from comma-separated vendor_id
        if stock.source_type == "order" and stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name  # Use all vendor names for stock creation
            except (ValueError, AttributeError):
                pass
        
        # Get received vendor name if available
        if stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                # If no vendor_name set yet, use received vendor name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        # For general source, use the vendor relationship
        if stock.source_type == "general" and stock.vendor:
            vendor_name = stock.vendor.company_name
        
        history_item = RawMaterialHistoryItem(
            id=stock.id,
            activity_type="stock_created",
            timestamp=stock.created_at,
            user_id=stock.user_id,
            user_name=stock.creator.user_name if stock.creator else None,
            user_role=stock.creator.role if stock.creator else None,
            material_id=stock.material_id,
            material_name=stock.material.material_name if stock.material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            order_id=stock.source_order_id,
            order_number=stock.source_order.sale_order_number if stock.source_order else None,
            order_status=stock.order_status,
            quantity=stock.quantity,
            form_type=stock.form_type,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            description=f"Stock created: {stock.quantity} units of {stock.material.material_name if stock.material else 'Unknown'}"
        )
        history_items.append(history_item)
    
    # 2. Get material linking events (usage records)
    usage_query = db.query(RawMaterialUsageModel).options(
        joinedload(RawMaterialUsageModel.unit).joinedload(RawMaterialUnitModel.stock).joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialUsageModel.unit).joinedload(RawMaterialUnitModel.stock).joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialUsageModel.part),
        joinedload(RawMaterialUsageModel.user)
    )
    
    # Apply date filter to usage records
    if date_filter:
        usage_query = usage_query.filter(date_filter)
    
    usages = usage_query.all()
    
    for usage in usages:
        if usage.unit and usage.unit.stock:
            stock = usage.unit.stock
            
            # Filter by source_type if specified
            if source_type and stock.source_type != source_type:
                continue
            # Filter by order_id if specified
            if order_id and stock.source_order_id != order_id:
                continue
            # Filter by material_id if specified
            if material_id and stock.material_id != material_id:
                continue
            
            # Note: No user filtering - both Admin and MC see all history data
            # For material linked events, show the unit's dimensions that were consumed
            if usage.unit:
                unit = usage.unit
                # Use stock's form_type and dimensions, but show consumed length from unit
                if stock.form_type == "Round":
                    dimensions = f"Ø{stock.diameter}mm × {unit.total_length}mm" if stock.diameter and unit.total_length else ""
                elif stock.form_type == "Square":
                    dimensions = f"{stock.breadth}mm × {stock.height}mm × {unit.total_length}mm" if stock.breadth and stock.height and unit.total_length else ""
                elif stock.form_type == "Pipe":
                    dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {unit.total_length}mm" if stock.outer_diameter and stock.inner_diameter and unit.total_length else ""
                elif stock.form_type == "Sheet":
                    dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
            
            # Get part's order details - always check if part has an order
            part_order_id = stock.source_order_id
            part_order_number = stock.source_order.sale_order_number if stock.source_order else None
            part_order_status = stock.order_status
            
            # Always check if part has an order through OutSourcePartStatus
            if usage.part:
                # First try OutSourcePartStatus
                part_order_query = db.query(OutSourcePartStatus).filter(
                    OutSourcePartStatus.part_id == usage.part_id
                ).first()
                
                if part_order_query and part_order_query.order:
                    # Use part's order details (override stock order if stock has no order)
                    if not stock.source_order:
                        part_order_id = part_order_query.order_id
                        part_order_number = part_order_query.order.sale_order_number
                        part_order_status = part_order_query.order.status
                else:
                    # Try to get order through part's product
                    if usage.part.product:
                        # Get the first order for this product
                        product_order = db.query(OrderModel).filter(
                            OrderModel.product_id == usage.part.product_id
                        ).first()
                        if product_order:
                            if not stock.source_order:
                                part_order_id = product_order.id
                                part_order_number = product_order.sale_order_number
                                part_order_status = product_order.status
            
            history_item = RawMaterialHistoryItem(
                id=usage.id,
                activity_type="material_linked",
                timestamp=usage.created_at,
                user_id=usage.user_id,
                user_name=usage.user.user_name if usage.user else None,
                user_role=usage.user.role if usage.user else None,
                material_id=stock.material_id,
                material_name=stock.material.material_name if stock.material else None,
                stock_id=stock.id,
                source_type=stock.source_type,
                order_id=part_order_id,
                order_number=part_order_number,
                order_status=part_order_status,
                form_type=stock.form_type,
                dimensions=dimensions,
                part_id=usage.part_id,
                part_name=usage.part.part_name if usage.part else None,
                part_number=usage.part.part_number if usage.part else None,
                used_length=usage.used_length,
                unit_id=usage.raw_material_unit_id,
                total_length=usage.unit.total_length if usage.unit else None,
                remaining_length=usage.unit.remaining_length if usage.unit else None,
                description=f"Material linked: {usage.part.part_name if usage.part else 'Unknown'} used {usage.used_length}mm"
            )
            history_items.append(history_item)
    
    # 3. Get order status change events (track actual status changes)
    # We'll create history events for each stock that has a non-enquiry status
    # This represents when the status was changed from enquiry to current status
    stock_status_query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
        joinedload(RawMaterialStockModel.creator)
    )
    
    if date_filter:
        stock_status_query = stock_status_query.filter(date_filter)
    if source_type:
        stock_status_query = stock_status_query.filter(RawMaterialStockModel.source_type == source_type)
    if order_id:
        stock_status_query = stock_status_query.filter(RawMaterialStockModel.source_order_id == order_id)
    if material_id:
        stock_status_query = stock_status_query.filter(RawMaterialStockModel.material_id == material_id)
    
    # Note: No user filtering - both Admin and MC see all history data
    
    # Only include stocks that have order_status and are not enquiry
    stock_status_items = stock_status_query.filter(
        RawMaterialStockModel.order_status.isnot(None),
        RawMaterialStockModel.order_status != 'enquiry'
    ).all()
    
    for stock in stock_status_items:
        # Create a history event for the status change
        # Use updated_at as the timestamp when status was changed
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Create only one status change event - the actual transition that happened
        # enquiry is the same as purchase_request
        status_progression = ['enquiry', 'purchase_order', 'received']
        
        # Only create events if current status is in our progression
        if stock.order_status in status_progression and stock.order_status != 'enquiry':
            current_status = stock.order_status
            current_status_index = status_progression.index(current_status)
            previous_status = status_progression[current_status_index - 1]
            
            # Display previous status as "purchase_request" if it's "enquiry"
            display_previous_status = 'purchase_request' if previous_status == 'enquiry' else previous_status
            
            # Create unique ID for this specific status change event
            status_change_id = stock.id + 2000000
            
            # Use updated_at as the timestamp when status was changed
            status_timestamp = stock.updated_at
            
            # Add vendor information
            enquiry_vendor_name = None
            enquiry_vendor_count = 0
            received_vendor_name = None
            
            # Get enquiry vendor names from comma-separated vendor_id
            if stock.vendor_id:
                try:
                    vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                    vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                    if vendors:
                        enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                        enquiry_vendor_count = len(vendors)
                except (ValueError, AttributeError):
                    pass
            
            # Get received vendor name
            if stock.received_vendor_id:
                received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
                if received_vendor:
                    received_vendor_name = received_vendor.company_name
            
            history_item = RawMaterialHistoryItem(
                id=status_change_id,
                activity_type="order_status_changed",
                timestamp=status_timestamp,
                user_id=stock.user_id,
                user_name=stock.creator.user_name if stock.creator else None,
                user_role=stock.creator.role if stock.creator else None,
                material_id=stock.material_id,
                material_name=stock.material.material_name if stock.material else None,
                stock_id=stock.id,
                source_type=stock.source_type,
                order_id=stock.source_order_id,
                order_number=stock.source_order.sale_order_number if stock.source_order else None,
                order_status=current_status,
                quantity=stock.quantity,
                form_type=stock.form_type,
                dimensions=dimensions,
                vendor_id=stock.received_vendor_id,
                vendor_name=stock.vendor.company_name if stock.vendor else None,
                enquiry_vendor_name=enquiry_vendor_name,
                enquiry_vendor_count=enquiry_vendor_count,
                received_vendor_name=received_vendor_name,
                description=f"{display_previous_status} → {current_status}"
            )
            history_items.append(history_item)
    
    # Sort history items by timestamp (newest first)
    history_items.sort(key=lambda x: x.timestamp, reverse=True)
    
    # Filter by activity_type if specified
    if activity_type:
        history_items = [item for item in history_items if item.activity_type == activity_type]
    
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

    for field, value in update_data.items():
        setattr(db_raw_material, field, value)

    db.commit()
    db.refresh(db_raw_material)
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
        
        # Step 7: Delete the raw material itself
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
        # Normalize material name by removing spaces to match variations like "EN8", "EN 8", "EN+8"
        normalized_material_name = material_name.replace(" ", "").replace("+", "").replace("-", "").replace("_", "").lower()
        
        # Get all materials and filter by normalized name
        all_materials = db.query(RawMaterialModel).all()
        matching_material_ids = []
        
        for material in all_materials:
            normalized_db_name = material.material_name.replace(" ", "").replace("-", "").replace("_", "").lower()
            if normalized_material_name in normalized_db_name or normalized_db_name in normalized_material_name:
                matching_material_ids.append(material.id)
        
        if matching_material_ids:
            query = query.filter(RawMaterialStockModel.material_id.in_(matching_material_ids))
        else:
            # Fallback to original ilike if no matches found
            query = query.join(RawMaterialModel).filter(
                RawMaterialModel.material_name.ilike(f"%{material_name}%")
            )
    
    if material_id is not None:
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
        max_recommendations=request.max_recommendations
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
            max_recommendations=req.max_recommendations
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

    all_materials = db.query(RawMaterialModel).all()
    matching_materials = []
    for material in all_materials:
        if StockRecommendationService.normalize_material_name(material.material_name) == normalized_name:
            matching_materials.append({
                "id": material.id,
                "material_name": material.material_name,
                "normalized": StockRecommendationService.normalize_material_name(material.material_name)
            })

    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.material_id.in_([m["id"] for m in matching_materials]),
        RawMaterialStockModel.source_type == "general"
    ).all()

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
        
        # Delete the stock item
        db.delete(db_stock)
        
        # Commit all changes
        db.commit()
        
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
        # Decrement stock total quantity
        stock_item = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if stock_item and stock_item.quantity > 0:
            stock_item.quantity -= 1
        # Delete unit
        db.delete(unit)
        db.commit()
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
        else:
            result["source_order_number"] = f"Order #{stock.source_order_id} (Not Found)"
    
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
def unlink_material_from_part(part_id: int, db: Session = Depends(get_db)):
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
    
    # Clear part details
    part.raw_material_unit_id = None
    part.raw_material_id = None
    part.required_length = None
    
    db.commit()
    
    # 🔥 Update stock status based on unit statuses
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
