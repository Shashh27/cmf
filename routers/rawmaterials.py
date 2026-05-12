from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from sqlalchemy.exc import IntegrityError

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, Vendors as VendorsModel, RawMaterialUnit as RawMaterialUnitModel, RawMaterialUsage as RawMaterialUsageModel
from DB.models.oms import Order as OrderModel, Part as PartModel
from DB.models.inventory import RawMaterial, RawMaterialStock, Vendors
from DB.schemas.inventory import (
    RawMaterial, RawMaterialCreate, RawMaterialUpdate,
    RawMaterialStock, RawMaterialStockCreate, RawMaterialStockUpdate, RawMaterialStockWithDetails,
    Vendors, VendorsCreate, VendorsUpdate,
    RawMaterialUnit, RawMaterialUnitCreate, RawMaterialUnitUpdate, RawMaterialUnitWithDetails,
    RawMaterialUsage, RawMaterialUsageCreate, RawMaterialUsageUpdate, RawMaterialUsageWithDetails
)
from services.raw_material_calculations import RawMaterialCalculationService

router = APIRouter(
    prefix="/rawmaterials",
    tags=["rawmaterials"]
)


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
        
        # Calculate stock status
        available_stock_count = len([stock for stock in stock_items if stock.status == 'available'])
        total_stock_quantity = sum(stock.quantity for stock in stock_items)
        has_available_stock = available_stock_count > 0
        
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


# =======================
# VENDOR ENDPOINTS
# =======================

@router.get("/vendors")
def get_vendors(db: Session = Depends(get_db)):
    """Get all vendors"""
    vendors = db.query(VendorsModel).order_by(VendorsModel.company_name.asc()).all()
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
def create_vendor(vendor: VendorsCreate, db: Session = Depends(get_db)):
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
def update_vendor(vendor_id: int, vendor_update: VendorsUpdate, db: Session = Depends(get_db)):
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
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Delete a vendor"""
    vendor = db.query(VendorsModel).filter(VendorsModel.id == vendor_id).first()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vendor not found"
        )
    
    db.delete(vendor)
    db.commit()
    return {"message": "Vendor deleted successfully"}


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
        print(f"🔥 Created {db_stock.quantity} units for stock ID {db_stock.id}")
    
    # Frontend handles allocation directly via /rawmaterials/tracking/allocate API
    # No auto-allocation needed here
    
    # Return with details
    return _stock_with_details(db_stock, db)


@router.get("/stock/", response_model=List[RawMaterialStockWithDetails])
def get_raw_material_stock(
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
            detail=f"Stock item with id {stock_id} not found"
        )
    
    return _stock_with_details(stock, db)


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


def _stock_with_details(stock: RawMaterialStockModel, db: Session) -> dict:
    """Helper function to add details to stock item"""
    
    # Determine the actual status based on source type and order status
    def get_stock_status(stock_item):
        if stock_item.source_type == "general":
            # For general stock: available only if available_quantity > 0
            return "available" if stock_item.available_quantity > 0 else "exhausted"
        elif stock_item.source_type == "order":
            # For order stock: available only if order_status = "received" AND available_quantity > 0
            if stock_item.available_quantity <= 0:
                return "exhausted"
            elif stock_item.order_status == "received":
                return "available"
            else:
                return stock_item.order_status or "pending"  # Show order status if not received
        else:
            return stock_item.status  # Fallback to stored status
    
    result = {
        "id": stock.id,
        "material_id": stock.material_id,
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
        "source_type": stock.source_type,
        "source_order_id": stock.source_order_id,
        "order_status": stock.order_status,
        "part_id": stock.part_id,
        "vendor_id": stock.vendor_id,  # Comma-separated vendor IDs for enquiry
        "received_vendor_id": stock.received_vendor_id,  # Final vendor who received the order
        "user_id": stock.user_id,
        "status": stock.calculated_status,  # Use calculated status property
        "created_at": stock.created_at,
        "updated_at": stock.updated_at,
    }
    
    # Add material name
    if stock.material:
        result["material_name"] = stock.material.material_name
    
    # Add source order details
    if stock.source_order_id:
        # Always fetch manually to ensure we get the order details
        order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
        if order:
            result["source_order_number"] = order.sale_order_number
        else:
            result["source_order_number"] = f"Order #{stock.source_order_id} (Not Found)"
    
    # Add part details (handle comma-separated part IDs)
    if stock.part_id:
        try:
            # Split comma-separated part IDs and fetch part details
            part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
            parts = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            if parts:
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
    if units:
        unit_ids = [u.id for u in units]
        usages = db.query(RawMaterialUsage).filter(RawMaterialUsage.raw_material_unit_id.in_(unit_ids)).all()
        if usages:
            linked_part_ids = [usage.part_id for usage in usages]
            linked_parts = db.query(PartModel).filter(PartModel.id.in_(linked_part_ids)).all()
            if linked_parts:
                existing_part_numbers = result.get("part_numbers", [])
                existing_part_names = result.get("part_names", [])
                existing_part_ids = result.get("part_ids", "")
                
                result["part_numbers"] = existing_part_numbers + [part.part_number for part in linked_parts]
                result["part_names"] = existing_part_names + [f"{part.part_number} - {part.part_name}" for part in linked_parts]
                
                # Handle part_ids concatenation properly
                new_part_ids = ",".join([str(part.id) for part in linked_parts])
                if existing_part_ids:
                    result["part_ids"] = existing_part_ids + "," + new_part_ids
                else:
                    result["part_ids"] = new_part_ids
                
                # 🔥 NEW: Fetch order information from linked parts
                product_ids = [part.product_id for part in linked_parts if part.product_id]
                if product_ids:
                    orders = db.query(OrderModel).filter(OrderModel.product_id.in_(product_ids)).all()
                    if orders:
                        existing_order_numbers = result.get("source_order_number", "")
                        new_order_numbers = ", ".join([order.sale_order_number for order in orders])
                        if existing_order_numbers:
                            result["source_order_number"] = existing_order_numbers + "," + new_order_numbers
                        else:
                            result["source_order_number"] = new_order_numbers
    
    # Add vendor details (handle both comma-separated vendor IDs and received vendor)
    if stock.received_vendor_id:
        # Show the final vendor who received the order
        received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
        if received_vendor:
            result["vendor_name"] = received_vendor.company_name
            result["received_vendor_name"] = received_vendor.company_name
    elif stock.vendor_id:
        # Handle comma-separated vendor IDs for enquiry phase
        try:
            vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
            vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
            if vendors:
                result["vendor_names"] = [vendor.company_name for vendor in vendors]
                result["vendor_name"] = ", ".join([vendor.company_name for vendor in vendors])
                result["enquiry_vendor_count"] = len(vendors)
        except (ValueError, AttributeError):
            result["vendor_name"] = stock.vendor_id  # Keep as string if invalid format
    
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
                "diameter": unit.stock.diameter,
                "length": unit.stock.length,
                "breadth": unit.stock.breadth,
                "height": unit.stock.height,
                "quantity": unit.stock.quantity
            } if unit.stock else None
        }
        result.append(unit_dict)
    
    return result


@router.post("/assign-material/", response_model=RawMaterialUsageWithDetails, status_code=status.HTTP_201_CREATED)
def assign_material_to_part(
    unit_id: int,
    part_id: int,
    required_length: float,
    db: Session = Depends(get_db)
):
    """Assign material unit to a part and track usage"""
    
    # Get unit
    unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
    if not unit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unit with id {unit_id} not found"
        )
    
    # Get part
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
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
            used_length=required_length
        )
        db.add(usage)
        # Set required_length to new value for new assignment
        part.required_length = required_length
    
    # 🔥 IMPORTANT: Update part with unit tracking information
    part.raw_material_unit_id = unit_id  # Store the specific unit
    part.raw_material_id = unit.stock.material_id  # Store the material ID
    
    db.commit()
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
