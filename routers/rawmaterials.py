from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy.exc import IntegrityError

from DB.database import get_db
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, Vendors as VendorsModel
from DB.models.oms import OrderPartsRawMaterialLinked, Order as OrderModel, Part as PartModel
from DB.schemas.inventory import (
    RawMaterial, RawMaterialCreate, RawMaterialUpdate,
    RawMaterialStock, RawMaterialStockCreate, RawMaterialStockUpdate, RawMaterialStockWithDetails,
    Vendors, VendorsCreate, VendorsUpdate
)
from DB.schemas.oms import OrderPartsRawMaterialLinkedCreate, OrderPartsRawMaterialLinkedUpdate, OrderPartsRawMaterialLinkedWithDetails
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
def get_raw_materials(db: Session = Depends(get_db)):
    """Get all raw materials"""
    return db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()


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


@router.delete("/{raw_material_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_raw_material(raw_material_id: int, db: Session = Depends(get_db)):
    """Delete a raw material"""
    db_raw_material = db.query(RawMaterialModel).filter(RawMaterialModel.id == raw_material_id).first()
    if not db_raw_material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {raw_material_id} not found"
        )
    
    # Check if material has stock items
    stock_items = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.material_id == raw_material_id
    ).all()
    if stock_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete raw material '{db_raw_material.material_name}'. It has {len(stock_items)} stock item(s). Delete stock items first."
        )
    
    # Check if material is referenced by parts (legacy check)
    referencing_parts = (
        db.query(PartModel)
        .filter(PartModel.raw_material_id == raw_material_id)
        .order_by(PartModel.id.asc())
        .all()
    )
    if referencing_parts:
        part_numbers = [p.part_number for p in referencing_parts if p.part_number]
        pn = ", ".join(part_numbers[:10]) + (f", +{len(part_numbers) - 10} more" if len(part_numbers) > 10 else "")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f'Cannot delete raw material "{db_raw_material.material_name}". '
                f"It is still selected on {len(referencing_parts)} part(s). "
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
    
    db_stock = RawMaterialStockModel(**stock_data)
    db.add(db_stock)
    db.commit()
    db.refresh(db_stock)
    
    # Return with details
    return _stock_with_details(db_stock, db)


@router.get("/stock/", response_model=List[RawMaterialStockWithDetails])
def get_raw_material_stock(
    material_id: int | None = None,
    source_type: str | None = None,
    db: Session = Depends(get_db)
):
    """Get raw material stock items with optional filtering"""
    query = db.query(RawMaterialStockModel)
    
    if material_id is not None:
        query = query.filter(RawMaterialStockModel.material_id == material_id)
    
    if source_type is not None:
        query = query.filter(RawMaterialStockModel.source_type == source_type)
    
    stock_items = query.order_by(RawMaterialStockModel.id.asc()).all()
    return [_stock_with_details(item, db) for item in stock_items]


@router.get("/stock/{stock_id}", response_model=RawMaterialStockWithDetails)
def get_raw_material_stock_item(stock_id: int, db: Session = Depends(get_db)):
    """Get a specific raw material stock item by ID"""
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
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


@router.delete("/stock/{stock_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_raw_material_stock(stock_id: int, db: Session = Depends(get_db)):
    """Delete a raw material stock item"""
    db_stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not db_stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock item with id {stock_id} not found"
        )
    
    # Check if stock item is linked to any parts
    linked_items = db.query(OrderPartsRawMaterialLinked).filter(
        OrderPartsRawMaterialLinked.stock_id == stock_id
    ).all()
    if linked_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete stock item. It is linked to {len(linked_items)} part(s). Remove links first."
        )
    
    try:
        db.delete(db_stock)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete stock item. It is still referenced by other records."
        )
    return None


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
    
    # Update status based on remaining quantity
    db_stock.status = "available" if db_stock.quantity > 0 else "exhausted"
    
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
        "volume": stock.volume,
        "mass": stock.mass,
        "weight": stock.weight,
        "cost": stock.cost,
        "source_type": stock.source_type,
        "source_order_id": stock.source_order_id,
        "status": stock.status,
        "created_at": stock.created_at,
        "updated_at": stock.updated_at,
    }
    
    # Add material name
    if stock.material:
        result["material_name"] = stock.material.material_name
    
    # Add source order number
    if stock.source_order:
        result["source_order_number"] = stock.source_order.sale_order_number
    
    # Calculate totals
    if stock.volume:
        result["total_volume"] = round(stock.volume * stock.quantity, 6)
    if stock.mass:
        result["total_mass"] = round(stock.mass, 3)
    if stock.weight:
        result["total_weight"] = round(stock.weight * stock.quantity, 3)
    if stock.cost:
        result["total_cost"] = round(stock.cost * stock.quantity, 2)
    
    return result


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


# =======================
# PROCUREMENT ENDPOINTS
# =======================

@router.post("/procurement", response_model=OrderPartsRawMaterialLinkedWithDetails, status_code=status.HTTP_201_CREATED)
def create_procurement_request(procurement: OrderPartsRawMaterialLinkedCreate, db: Session = Depends(get_db)):
    """Create a procurement request for raw materials"""
    # Validate part exists
    part = db.query(PartModel).filter(PartModel.id == procurement.part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Part not found"
        )
    
    # Validate order exists
    order = db.query(OrderModel).filter(OrderModel.id == procurement.order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Validate vendor if provided
    if procurement.vendor_id:
        vendor = db.query(VendorsModel).filter(VendorsModel.id == procurement.vendor_id).first()
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
    
    # Set procurement flag
    procurement.is_procurement = True
    
    # Create procurement record (stock_id can be null for procurement)
    db_procurement = OrderPartsRawMaterialLinked(**procurement.model_dump())
    db.add(db_procurement)
    db.commit()
    db.refresh(db_procurement)
    
    # Get details for response
    result = _procurement_with_details(db_procurement, db)
    return result


@router.get("/procurement", response_model=List[OrderPartsRawMaterialLinkedWithDetails])
def get_procurement_requests(order_id: int = None, status: str = None, db: Session = Depends(get_db)):
    """Get procurement requests with optional filters"""
    query = db.query(OrderPartsRawMaterialLinked).filter(
        OrderPartsRawMaterialLinked.is_procurement == True
    )
    
    if order_id:
        query = query.filter(OrderPartsRawMaterialLinked.order_id == order_id)
    
    if status:
        query = query.filter(OrderPartsRawMaterialLinked.procurement_status == status)
    
    procurements = query.order_by(OrderPartsRawMaterialLinked.created_at.desc()).all()
    
    results = []
    for procurement in procurements:
        results.append(_procurement_with_details(procurement, db))
    
    return results


@router.put("/procurement/{procurement_id}", response_model=OrderPartsRawMaterialLinkedWithDetails)
def update_procurement_request(
    procurement_id: int, 
    procurement_update: OrderPartsRawMaterialLinkedUpdate, 
    db: Session = Depends(get_db)
):
    """Update a procurement request"""
    procurement = db.query(OrderPartsRawMaterialLinked).filter(
        OrderPartsRawMaterialLinked.id == procurement_id,
        OrderPartsRawMaterialLinked.is_procurement == True
    ).first()
    
    if not procurement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Procurement request not found"
        )
    
    # Validate vendor if provided
    if procurement_update.vendor_id:
        vendor = db.query(VendorsModel).filter(VendorsModel.id == procurement_update.vendor_id).first()
        if not vendor:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Vendor not found"
            )
    
    update_data = procurement_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(procurement, field, value)
    
    db.commit()
    db.refresh(procurement)
    
    # Get details for response
    result = _procurement_with_details(procurement, db)
    return result


@router.post("/procurement/{procurement_id}/receive")
def receive_procurement(procurement_id: int, db: Session = Depends(get_db)):
    """Mark procurement as received and create stock entry"""
    procurement = db.query(OrderPartsRawMaterialLinked).filter(
        OrderPartsRawMaterialLinked.id == procurement_id,
        OrderPartsRawMaterialLinked.is_procurement == True
    ).first()
    
    if not procurement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Procurement request not found"
        )
    
    if procurement.procurement_status != "ordered":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Procurement must be ordered before receiving"
        )
    
    # Create stock entry for received materials
    # Note: This is a simplified version - you might need to add more details
    stock_data = {
        "material_id": procurement.stock.material_id if procurement.stock else 1,  # Default to material 1 if no stock
        "form_type": "Round",  # Default - you might want to store this in procurement
        "diameter": 20,  # Default - you might want to store this in procurement
        "length": 1000,  # Default - you might want to store this in procurement
        "quantity": procurement.procurement_quantity or 1,
        "source_type": "order",
        "source_order_id": procurement.order_id,
        "status": "available"
    }
    
    # Create stock
    new_stock = RawMaterialStockModel(**stock_data)
    db.add(new_stock)
    db.flush()
    
    # Update procurement status
    procurement.procurement_status = "received"
    procurement.stock_id = new_stock.id
    
    db.commit()
    
    return {"message": "Procurement received and stock created successfully", "stock_id": new_stock.id}


def _procurement_with_details(procurement: OrderPartsRawMaterialLinked, db: Session) -> dict:
    """Helper function to add details to procurement"""
    result = {
        "id": procurement.id,
        "stock_id": procurement.stock_id,
        "part_id": procurement.part_id,
        "order_id": procurement.order_id,
        "used_quantity": procurement.used_quantity,
        "linkage_group_id": procurement.linkage_group_id,
        "is_procurement": procurement.is_procurement,
        "procurement_quantity": procurement.procurement_quantity,
        "procurement_weight": procurement.procurement_weight,
        "vendor_id": procurement.vendor_id,
        "procurement_status": procurement.procurement_status,
        "user_id": procurement.user_id,
        "created_at": procurement.created_at,
        "updated_at": procurement.updated_at,
    }
    
    # Add part details
    if procurement.part:
        result["part_name"] = procurement.part.part_name
        result["part_number"] = procurement.part.part_number
    
    # Add order details
    if procurement.order:
        result["sale_order_number"] = procurement.order.sale_order_number
    
    # Add vendor details
    if procurement.vendor:
        result["vendor_name"] = procurement.vendor.company_name
    
    # Add material details if stock exists
    if procurement.stock and procurement.stock.material:
        result["material_name"] = procurement.stock.material.material_name
        result["form_type"] = procurement.stock.form_type
    
    return result
