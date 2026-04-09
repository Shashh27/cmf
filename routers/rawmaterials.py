from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List
from sqlalchemy.exc import IntegrityError

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, Vendors as VendorsModel
from DB.models.oms import Order as OrderModel, Part as PartModel
from DB.models.inventory import RawMaterial, RawMaterialStock, Vendors
from DB.schemas.inventory import (
    RawMaterial, RawMaterialCreate, RawMaterialUpdate,
    RawMaterialStock, RawMaterialStockCreate, RawMaterialStockUpdate, RawMaterialStockWithDetails,
    Vendors, VendorsCreate, VendorsUpdate
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


@router.get("/order-parts-raw-material-linked/")
def get_order_parts_raw_material_linked(
    admin_id: int = None, 
    manufacturing_coordinator_id: int = None,
    db: Session = Depends(get_db)
):
    """Get order-linked raw materials filtered by user ID or manufacturing coordinator"""
    # Query raw material stock items that are order-linked
    query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
        joinedload(RawMaterialStockModel.creator)
    ).filter(RawMaterialStockModel.source_type == "order")
    
    # Filter by combined criteria: show materials where user is either admin OR manufacturing coordinator
    if admin_id is not None or manufacturing_coordinator_id is not None:
        # Get order IDs where user is admin (if admin_id provided)
        admin_order_ids = []
        if admin_id is not None:
            admin_order_ids = db.query(OrderModel.id).filter(
                OrderModel.admin_id == admin_id
            ).all()
            admin_order_ids = [oid[0] for oid in admin_order_ids]
        
        # Get order IDs where user is manufacturing coordinator (if manufacturing_coordinator_id provided)
        mc_order_ids = []
        if manufacturing_coordinator_id is not None:
            mc_order_ids = db.query(OrderModel.id).filter(
                OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id
            ).all()
            mc_order_ids = [oid[0] for oid in mc_order_ids]
        
        # Combine both sets of order IDs (union - no duplicates)
        all_order_ids = list(set(admin_order_ids + mc_order_ids))
        
        # Filter stock items to only those from these orders
        if all_order_ids:
            query = query.filter(RawMaterialStockModel.source_order_id.in_(all_order_ids))
        else:
            # No orders found for this user in any role, return empty
            return []
    
    stock_items = query.order_by(RawMaterialStockModel.id.desc()).all()
    
    # Transform the data to match expected format
    result = []
    for stock in stock_items:
        stock_details = _stock_with_details(stock, db)
        
        # Transform to the format expected by frontend
        transformed_item = {
            "id": stock_details["id"],
            "material_id": stock_details["material_id"],
            "material_name": stock_details.get("material_name", ""),
            "form_type": stock_details["form_type"],
            "diameter": stock_details["diameter"],
            "length": stock_details["length"],
            "breadth": stock_details["breadth"],
            "height": stock_details["height"],
            "inner_diameter": stock_details["inner_diameter"],
            "outer_diameter": stock_details["outer_diameter"],
            "quantity": stock_details["quantity"],
            "allocated_quantity": stock_details.get("allocated_quantity", 0),
            "available_quantity": stock_details.get("available_quantity", 0),
            "mass": stock_details["mass"],
            "weight": stock_details["weight"],
            "cost": stock_details["cost"],
            "source_type": stock_details["source_type"],
            "source_order_id": stock_details["source_order_id"],
            "order_status": stock_details.get("order_status"),
            "vendor_id": stock_details["vendor_id"],
            "vendor_name": stock_details.get("vendor_name"),
            "received_vendor_id": stock_details.get("received_vendor_id"),
            "received_vendor_name": stock_details.get("received_vendor_name"),
            "enquiry_vendor_count": stock_details.get("enquiry_vendor_count"),
            "user_id": stock_details["user_id"],
            "creator_name": stock_details.get("creator_name"),
            "status": stock_details["status"],
            "material_status": stock_details["status"], # Alias for compatibility
            "created_at": stock_details["created_at"],
            "updated_at": stock_details["updated_at"],
            # Additional fields for compatibility
            "order_id": stock_details["source_order_id"],
            "part_ids": stock_details.get("part_ids", []),
            "part_numbers": stock_details.get("part_numbers", []),
            "part_names": stock_details.get("part_names", []),
            "part_required_quantities": stock_details.get("part_required_quantities", []),
            "source_order_number": stock_details.get("source_order_number"),
            "linkage_ids": [stock_details["id"]], # Single item array for compatibility
            "linkage_group_id": stock_details["id"],
            "order_quantity": stock_details["quantity"],
        }
        
        # Calculate status based on business logic
        calculated_status = "not available"
        if stock_details["source_type"] == "general":
            # For general stock, status depends only on quantity
            if stock_details["quantity"] > 0:
                calculated_status = "available"
        elif stock_details["source_type"] == "order":
            # For order stock, status depends on order_status
            if stock_details.get("order_status") == "received" and stock_details["quantity"] > 0:
                calculated_status = "available"
        
        # Update the status in the transformed item
        transformed_item["status"] = calculated_status
        
        result.append(transformed_item)
    
    return result


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
    """Delete a raw material and clean up all references"""
    db_raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not db_raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )
    
    try:
        # Step 1: Find all parts that reference this material
        referencing_parts = (
            db.query(PartModel)
            .filter(
                (PartModel.raw_material_id == raw_material_id) |
                (PartModel.raw_material_stock_id.in_(
                    db.query(RawMaterialStockModel.id)
                    .filter(RawMaterialStockModel.material_id == raw_material_id)
                ))
            )
            .all()
        )
        
        # Step 2: Clear all part references
        for part in referencing_parts:
            part.raw_material_id = None
            part.raw_material_stock_id = None
            part.raw_material_required_quantity = None
        
        # Step 3: Find and delete all stock items for this material
        stock_items = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.material_id == raw_material_id
        ).all()
        
        for stock in stock_items:
            # Deallocate any allocated materials before deleting stock
            if stock.allocated_quantity > 0:
                stock.allocated_quantity = 0
                stock.available_quantity = stock.quantity
            db.delete(stock)
        
        # Step 4: Delete the raw material itself
        db.delete(db_raw_material)
        
        # Commit all changes
        db.commit()
        
        return {
            "message": f"Raw material '{db_raw_material.material_name}' deleted successfully",
            "parts_updated": len(referencing_parts),
            "stock_items_deleted": len(stock_items)
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting raw material: {str(e)}"
        )
    return None


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
    
    # If dimensions or quantity changed, recalculate properties
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
    
    # Apply updates
    for field, value in update_data.items():
        setattr(db_stock, field, value)
    
    db.commit()
    db.refresh(db_stock)
    
    return _stock_with_details(db_stock, db)


@router.delete("/stock/{stock_id}", status_code=status.HTTP_200_OK)
def delete_raw_material_stock(stock_id: int, db: Session = Depends(get_db)):
    """Delete a raw material stock item and clean up part references"""
    db_stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not db_stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock item with id {stock_id} not found"
        )
    
    try:
        # Find all parts that reference this stock item
        referencing_parts = (
            db.query(PartModel)
            .filter(PartModel.raw_material_stock_id == stock_id)
            .all()
        )
        
        # Clear all part references to this stock
        for part in referencing_parts:
            part.raw_material_stock_id = None
            part.raw_material_required_quantity = None
            # Keep raw_material_id if it exists, as the material might still be available
        
        # Delete the stock item
        db.delete(db_stock)
        
        # Commit all changes
        db.commit()
        
        return {
            "message": f"Stock item deleted successfully",
            "parts_updated": len(referencing_parts)
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
                
                # Add part required quantities
                part_required_quantities = []
                for part in parts:
                    if part.raw_material_required_quantity:
                        part_required_quantities.append(str(part.raw_material_required_quantity))
                    else:
                        part_required_quantities.append("0")
                result["part_required_quantities"] = part_required_quantities
        except (ValueError, AttributeError):
            # If part_id is not valid comma-separated integers, just store as is
            result["part_ids"] = stock.part_id
            result["part_required_quantities"] = []
    
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


@router.put("/order-parts-raw-material-linked/{stock_id}")
def update_order_parts_raw_material_linked(stock_id: int, stock_update: RawMaterialStockUpdate, db: Session = Depends(get_db)):
    """Update order-linked raw material stock"""
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock item not found"
        )
    
    update_data = stock_update.model_dump(exclude_unset=True)
    
    # Check if dimensions are being updated for automatic recalculation
    dimensions_changed = False
    if stock.form_type == "Round":
        if ('diameter' in update_data and update_data['diameter'] != stock.diameter) or \
           ('length' in update_data and update_data['length'] != stock.length):
            dimensions_changed = True
    
    elif stock.form_type == "Square":
        if ('length' in update_data and update_data['length'] != stock.length) or \
           ('breadth' in update_data and update_data['breadth'] != stock.breadth) or \
           ('height' in update_data and update_data['height'] != stock.height):
            dimensions_changed = True
    
    elif stock.form_type == "Pipe":
        if ('outer_diameter' in update_data and update_data['outer_diameter'] != stock.outer_diameter) or \
           ('inner_diameter' in update_data and update_data['inner_diameter'] != stock.inner_diameter) or \
           ('length' in update_data and update_data['length'] != stock.length):
            dimensions_changed = True
    
    # Update fields first
    for field, value in update_data.items():
        # For order-linked stock, map material_status to order_status
        if stock.source_type == "order" and field == "material_status":
            setattr(stock, "order_status", value)
        else:
            setattr(stock, field, value)
    
    # Recalculate if dimensions changed
    if dimensions_changed:
        # Build dimensions dict for calculation
        dimensions = {
            'diameter': stock.diameter,
            'length': stock.length,
            'breadth': stock.breadth,
            'height': stock.height,
            'inner_diameter': stock.inner_diameter,
            'outer_diameter': stock.outer_diameter
        }
        
        # Calculate new values
        new_volume = RawMaterialCalculationService.calculate_volume(stock.form_type, **dimensions)
        new_mass = RawMaterialCalculationService.calculate_mass(stock.material.density, new_volume, stock.quantity)
        new_cost = RawMaterialCalculationService.calculate_cost(new_mass, stock.material.cost_per_kg)
        
        # Update stock with calculated values
        stock.volume = new_volume
        stock.mass = new_mass
        stock.cost = new_cost
    
    db.commit()
    db.refresh(stock)
    return _stock_with_details(stock, db)


@router.put("/order-parts-raw-material-linked/status/group/{group_id}")
def update_order_parts_status_group(group_id: int, status_data: dict, db: Session = Depends(get_db)):
    """Update status and properties for a group of order-linked stock items"""
    
    # Query the specific stock item by ID (since linkage_group_id doesn't exist)
    stock = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.id == group_id
    ).first()
    
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock item not found"
        )
    
    # Update order_status if provided
    if 'order_status' in status_data:
        stock.order_status = status_data['order_status']
        
        # Recalculate status based on new order_status
        if stock.source_type == "order":
            if stock.order_status == "received" and stock.quantity > 0:
                stock.status = "available"
            else:
                stock.status = "not available"
    
    # Update received_vendor_id if provided
    if 'received_vendor_id' in status_data:
        stock.received_vendor_id = status_data['received_vendor_id']
    
    # Update part_ids if provided
    if 'part_ids' in status_data:
        from DB.models.oms import Part
        old_part_ids = set()
        new_part_ids = set()
        
        # Get old part IDs before update
        if stock.part_id:
            old_part_ids = set(pid.strip() for pid in stock.part_id.split(',') if pid.strip())
        
        # Get new part IDs from update
        if status_data['part_ids']:
            new_part_ids = set(pid.strip() for pid in status_data['part_ids'].split(',') if pid.strip())
        
        # Update stock part_ids
        stock.part_id = status_data['part_ids']
        
        # Handle removed parts - set their fields to NULL
        removed_part_ids = old_part_ids - new_part_ids
        if removed_part_ids:
            for part_id_str in removed_part_ids:
                try:
                    part_id = int(part_id_str)
                    part = db.query(Part).filter(Part.id == part_id).first()
                    if part:
                        part.raw_material_stock_id = None
                        part.raw_material_required_quantity = None
                except (ValueError, TypeError):
                    continue
        
        # Update quantity if provided
    if 'order_quantity' in status_data:
        new_quantity = status_data['order_quantity']
        
        # Validate that new quantity is not less than allocated quantity
        if stock.allocated_quantity and new_quantity < stock.allocated_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reduce quantity to {new_quantity}. Already allocated quantity is {stock.allocated_quantity}. Please remove parts or reduce part quantities first."
            )
        
        stock.quantity = new_quantity
        
        # Recalculate available quantity after quantity update
        stock.available_quantity = stock.quantity - stock.allocated_quantity
    
    # Update part quantities if provided
    if 'part_quantities' in status_data:
        part_quantities = status_data['part_quantities']
        
        if stock.part_id and part_quantities:
            part_ids = [pid.strip() for pid in stock.part_id.split(',') if pid.strip()]
            
            # Validate total required quantity doesn't exceed available quantity
            total_required = 0
            for part_id_str in part_ids:
                if str(part_id_str) in part_quantities:
                    try:
                        total_required += float(part_quantities[str(part_id_str)])
                    except (ValueError, TypeError):
                        continue
            
            if total_required > stock.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Total required quantity ({total_required}) exceeds available stock quantity ({stock.quantity}). Please increase stock quantity or reduce part quantities."
                )
            
            for part_id_str in part_ids:
                try:
                    part_id = int(part_id_str)
                    part = db.query(Part).filter(Part.id == part_id).first()
                    if part and str(part_id) in part_quantities:
                        part.raw_material_required_quantity = float(part_quantities[str(part_id)])
                        # Also update the stock_id reference
                        part.raw_material_stock_id = stock.id
                except (ValueError, TypeError):
                    continue
        
        # Recalculate stock quantities based on current parts
        if new_part_ids:
            total_allocated = 0
            for part_id_str in new_part_ids:
                try:
                    part_id = int(part_id_str)
                    part = db.query(Part).filter(Part.id == part_id).first()
                    if part and part.raw_material_required_quantity:
                        total_allocated += float(part.raw_material_required_quantity)
                except (ValueError, TypeError):
                    continue
            
            stock.allocated_quantity = total_allocated
            stock.available_quantity = stock.quantity - total_allocated
        else:
            # No parts linked
            stock.allocated_quantity = 0
            stock.available_quantity = stock.quantity
    
    # Update quantity if provided
    if 'order_quantity' in status_data:
        new_quantity = status_data['order_quantity']
        
        # Validate that new quantity is not less than allocated quantity
        if stock.allocated_quantity and new_quantity < stock.allocated_quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot reduce quantity to {new_quantity}. Already allocated quantity is {stock.allocated_quantity}. Please remove parts or reduce part quantities first."
            )
        
        stock.quantity = new_quantity
        
        # Recalculate available quantity after quantity update
        stock.available_quantity = stock.quantity - stock.allocated_quantity
    
    # Update form_type if provided
    if 'form_type' in status_data:
        old_form_type = stock.form_type
        new_form_type = status_data['form_type']
        stock.form_type = new_form_type
        
        # Clear irrelevant dimensions when form type changes
        if old_form_type != new_form_type:
            # Clear all dimensions first
            stock.diameter = None
            stock.breadth = None
            stock.height = None
            stock.inner_diameter = None
            stock.outer_diameter = None
            
            # Then set the provided dimensions for the new form type
            if new_form_type == 'Round':
                if 'diameter' in status_data:
                    stock.diameter = status_data['diameter']
                if 'length' in status_data:
                    stock.length = status_data['length']
                    
            elif new_form_type == 'Square':
                if 'length' in status_data:
                    stock.length = status_data['length']
                if 'breadth' in status_data:
                    stock.breadth = status_data['breadth']
                if 'height' in status_data:
                    stock.height = status_data['height']
                    
            elif new_form_type == 'Pipe':
                if 'inner_diameter' in status_data:
                    stock.inner_diameter = status_data['inner_diameter']
                if 'outer_diameter' in status_data:
                    stock.outer_diameter = status_data['outer_diameter']
                if 'length' in status_data:
                    stock.length = status_data['length']
    
    # Update dimensions if provided (only if form_type didn't change)
    elif 'diameter' in status_data:
        stock.diameter = status_data['diameter']
    elif 'length' in status_data:
        stock.length = status_data['length']
    elif 'breadth' in status_data:
        stock.breadth = status_data['breadth']
    elif 'height' in status_data:
        stock.height = status_data['height']
    elif 'inner_diameter' in status_data:
        stock.inner_diameter = status_data['inner_diameter']
    elif 'outer_diameter' in status_data:
        stock.outer_diameter = status_data['outer_diameter']
    
    # Update user_id if provided
    if 'user_id' in status_data:
        stock.user_id = status_data['user_id']
    
    # Recalculate properties if dimensions, form_type, or quantity changed
    recalc_keys = ['form_type', 'diameter', 'length', 'breadth', 'height', 'inner_diameter', 'outer_diameter', 'quantity']
    should_recalc = any(key in status_data for key in recalc_keys)
    
    if should_recalc:
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        if material:
            try:
                properties = RawMaterialCalculationService.calculate_stock_item_properties(material, stock)
                stock.volume = properties['volume']
                stock.mass = properties['mass']
                stock.weight = properties['weight']
                stock.cost = properties['cost']
            except ValueError:
                # If calculation fails, continue with existing values
                pass
    
    db.commit()
    
    # Return the updated stock details
    result = _stock_with_details(stock, db)
    return result


@router.post("/order-parts-raw-material-linked/bulk")
def bulk_create_order_parts_raw_material_linked(bulk_data: dict, db: Session = Depends(get_db)):
    """Bulk create order-linked raw material stock items"""
    # This is a placeholder - in a real implementation, you would create multiple stock items
    return {"message": "Bulk operation completed", "created_count": 0}


@router.delete("/order-parts-raw-material-linked/{stock_id}")
def delete_order_parts_raw_material_linked(stock_id: int, db: Session = Depends(get_db)):
    """Delete order-linked raw material stock and clear part references"""
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock item not found"
        )
    
    # Step 1: Clear part references before deleting stock
    if stock.part_id:
        from DB.models.oms import Part as PartModel
        part_ids = [pid.strip() for pid in stock.part_id.split(',') if pid.strip()]
        
        for part_id in part_ids:
            try:
                part = db.query(PartModel).filter(PartModel.id == int(part_id)).first()
                if part and part.raw_material_stock_id == stock_id:
                    # Clear the raw material references
                    part.raw_material_stock_id = None
                    part.raw_material_required_quantity = None
            except Exception:
                pass  # Silently ignore errors
    
    # Step 2: Delete the stock
    db.delete(stock)
    db.commit()
    return {"message": "Stock item deleted successfully"}
