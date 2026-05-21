from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel

from DB.database import get_db
from DB.models.oms import Order as OrderModel
from DB.models.inventory import (
    RawMaterial as RawMaterialModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
    RawMaterialUsage as RawMaterialUsageModel,
    Vendors as VendorsModel,
)
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.inventory import (
    RawMaterialStock,
    RawMaterialStockCreate,
    RawMaterialStockUpdate,
    Vendors,
    OrderMaterialLinkRequest,
)
from services.raw_material_calculations import RawMaterialCalculationService
from services.stock_auto_update import StockAutoUpdateService

router = APIRouter(
    tags=["Order Raw Materials"]
)


# ==================== Order Raw Material Linking ====================

@router.post("/order-materials/link")
def link_material_to_order(request: OrderMaterialLinkRequest, db: Session = Depends(get_db)):
    """
    Link raw material to an order with parts and required lengths.
    
    This creates:
    1. Raw material stock entry with status='not_available' and order_status='enquiry'
    2. Raw material units (will be created when order is received)
    3. Part references with required lengths
    
    When order status changes to 'received':
    - Stock status changes to 'available'
    - Units are created with status='available'
    """
    # Validate raw material
    material = db.query(RawMaterialModel).filter(RawMaterialModel.id == request.raw_material_id).first()
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {request.raw_material_id} not found"
        )
    
    # Validate order
    order = db.query(OrderModel).filter(OrderModel.id == request.order_id).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order with id {request.order_id} not found"
        )
    
    # Validate parts
    from DB.models.oms import Part as PartModel
    parts = db.query(PartModel).filter(PartModel.id.in_(request.part_ids)).all()
    if len(parts) != len(request.part_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Some part IDs not found"
        )
    
    # Validate required lengths against dimension length
    for part_id, required_length in zip(request.part_ids, request.required_lengths):
        if required_length > request.length:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Required length {required_length}mm for part {part_id} exceeds dimension length {request.length}mm"
            )
    
    # Validate vendors if provided
    if request.vendor_id:
        vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(request.vendor_id)).all()
        if len(vendors) != len(request.vendor_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"One or more vendors not found"
            )
    
    try:
        # Create temporary stock data for calculation
        temp_stock = RawMaterialStockCreate(
            material_id=request.raw_material_id,
            form_type=request.form_type,
            diameter=request.diameter,
            length=request.length,
            breadth=request.breadth,
            height=request.height,
            inner_diameter=request.inner_diameter,
            outer_diameter=request.outer_diameter,
            quantity=request.quantity
        )
        
        # Calculate properties using the service (returns overall values for stock)
        properties = RawMaterialCalculationService.calculate_stock_item_properties(
            material, temp_stock
        )
        
        # Create stock entry with status='not_available' and order_status='enquiry'
        stock = RawMaterialStockModel(
            material_id=request.raw_material_id,
            form_type=request.form_type,
            diameter=request.diameter,
            length=request.length,
            breadth=request.breadth,
            height=request.height,
            inner_diameter=request.inner_diameter,
            outer_diameter=request.outer_diameter,
            quantity=request.quantity,
            source_type="order",
            source_order_id=request.order_id,
            order_status="enquiry",  # Initial status
            part_id=",".join([str(pid) for pid in request.part_ids]),
            vendor_id=",".join([str(vid) for vid in request.vendor_id]) if request.vendor_id else None,  # Multiple vendors for enquiry
            received_vendor_id=None,  # Will be set when final vendor is selected
            user_id=request.user_id,
            status="not_available",  # Initial status
            allocated_quantity=0,
            available_quantity=request.quantity,
            volume=properties['volume'],  # Overall volume for all units
            mass=properties['mass'],  # Overall mass for all units
            weight=properties['weight'],  # Overall weight for all units
            cost=properties['cost'],  # Overall cost for all units
        )
        db.add(stock)
        db.flush()
        
        # Create units immediately for the quantity with per-unit values
        per_unit_volume = properties['volume'] / request.quantity if properties['volume'] else None
        per_unit_mass = properties['mass'] / request.quantity if properties['mass'] else None
        per_unit_weight = properties['weight'] / request.quantity if properties['weight'] else None
        per_unit_cost = properties['cost'] / request.quantity if properties['cost'] else None
        
        for i in range(request.quantity):
            unit = RawMaterialUnitModel(
                stock_id=stock.id,
                total_length=request.length,
                remaining_length=request.length,
                volume=per_unit_volume,  # Per-unit volume
                mass=per_unit_mass,  # Per-unit mass
                weight=per_unit_weight,  # Per-unit weight
                cost=per_unit_cost,  # Per-unit cost
                status="not_available",  # Units not available until order is received
            )
            db.add(unit)
        
        db.flush()
        
        # Update parts with required lengths
        for part, required_length in zip(parts, request.required_lengths):
            part.required_length = required_length
            part.raw_material_id = request.raw_material_id
            # Note: raw_material_unit_id will be set when order is received
        
        db.commit()
        
        return {
            "message": "Material linked to order successfully",
            "stock_id": stock.id,
            "order_id": request.order_id,
            "status": "enquiry",
            "units_created": request.quantity,
            "note": "Units will be available when order status changes to 'received'"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error linking material to order: {str(e)}"
        )


@router.put("/order-materials/{stock_id}/receive")
def receive_order_material(stock_id: int, db: Session = Depends(get_db)):
    """
    Receive order material - updates unit status and links parts.
    
    When order is received:
    1. Stock status changes to 'available'
    2. Order status changes to 'received'
    3. Units status changes to 'available' (units created immediately on stock creation)
    4. Parts are linked to units
    """
    # Get stock
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    if stock.source_type != "order":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only order stock can be received"
        )
    
    if stock.order_status == "received":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order material already received"
        )
    
    try:
        # Update stock status
        stock.order_status = "received"
        stock.status = "available"
        
        # Check if units already exist
        existing_units = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id == stock.id
        ).all()
        
        if existing_units:
            # Units already exist, just update their status to 'available'
            for unit in existing_units:
                unit.status = "available"
        else:
            # Units don't exist (backward compatibility), create them now
            # Create temporary stock data for calculation
            temp_stock = RawMaterialStockCreate(
                material_id=stock.material_id,
                form_type=stock.form_type,
                diameter=stock.diameter,
                length=stock.length,
                breadth=stock.breadth,
                height=stock.height,
                inner_diameter=stock.inner_diameter,
                outer_diameter=stock.outer_diameter,
                quantity=stock.quantity
            )
            
            # Calculate properties using the service
            properties = RawMaterialCalculationService.calculate_stock_item_properties(
                material, temp_stock
            )
            
            # Calculate per-unit values
            per_unit_volume = properties['volume'] / stock.quantity if properties['volume'] else None
            per_unit_mass = properties['mass'] / stock.quantity if properties['mass'] else None
            per_unit_weight = properties['weight'] / stock.quantity if properties['weight'] else None
            per_unit_cost = properties['cost'] / stock.quantity if properties['cost'] else None
            
            for i in range(stock.quantity):
                unit = RawMaterialUnitModel(
                    stock_id=stock.id,
                    total_length=stock.length,
                    remaining_length=stock.length,
                    volume=per_unit_volume,
                    mass=per_unit_mass,
                    weight=per_unit_weight,
                    cost=per_unit_cost,
                    status="available",
                )
                db.add(unit)
        
        db.flush()
        
        # Link parts to units
        from DB.models.oms import Part as PartModel
        if stock.part_id:
            part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
            parts = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            
            # Get all units for this stock
            units = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.stock_id == stock.id
            ).order_by(RawMaterialUnitModel.id.asc()).all()
            
            # Assign units to parts based on required lengths
            unit_index = 0
            for part in parts:
                if part.required_length and unit_index < len(units):
                    unit = units[unit_index]
                    part.raw_material_unit_id = unit.id
                    
                    # Create usage record
                    usage = RawMaterialUsageModel(
                        raw_material_unit_id=unit.id,
                        part_id=part.id,
                        used_length=part.required_length,
                        remaining_length=unit.remaining_length - part.required_length,
                        usage_date=stock.updated_at,
                        user_id=user_id  # Store the user who linked the material
                    )
                    db.add(usage)
                    
                    # Update unit remaining length
                    unit.remaining_length -= part.required_length
                    if unit.remaining_length <= 0:
                        unit.status = "exhausted"
                    
                    unit_index += 1
        
        db.commit()
        
        # 🔥 Update stock status based on unit statuses
        StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
        
        return {
            "message": "Order material received successfully",
            "stock_id": stock.id,
            "units_updated": len(existing_units) if existing_units else stock.quantity,
            "status": "available"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error receiving order material: {str(e)}"
        )


@router.get("/order-materials/")
def get_order_materials(
    order_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get order-linked raw materials"""
    query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
    ).filter(RawMaterialStockModel.source_type == "order")
    
    if order_id:
        query = query.filter(RawMaterialStockModel.source_order_id == order_id)
    
    if status:
        query = query.filter(RawMaterialStockModel.order_status == status)
    
    stock_items = query.order_by(RawMaterialStockModel.id.asc()).all()
    
    # Use the _stock_with_details helper from rawmaterials.py
    # Import it here to avoid circular dependency
    from routers.rawmaterials import _stock_with_details
    result = [_stock_with_details(item, db) for item in stock_items]
    
    return result


@router.put("/order-materials/{stock_id}")
def update_order_material(
    stock_id: int,
    stock_update: RawMaterialStockUpdate,
    db: Session = Depends(get_db)
):
    """Update order material (add/remove parts, change dimensions)"""
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    if stock.source_type != "order":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only order stock can be updated"
        )
    
    if stock.order_status == "received":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update received order material"
        )
    
    try:
        # Update stock fields
        update_data = stock_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(stock, field, value)
        
        db.commit()
        
        from routers.rawmaterials import _stock_with_details
        return _stock_with_details(stock, db)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating order material: {str(e)}"
        )


@router.delete("/order-materials/{stock_id}")
def delete_order_material(stock_id: int, db: Session = Depends(get_db)):
    """Delete order material and clear part references"""
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    if stock.source_type != "order":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only order stock can be deleted"
        )
    
    try:
        # Get all units for this stock
        units = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id == stock.id
        ).all()
        
        unit_ids = [u.id for u in units]
        
        # Clear part references via raw_material_unit_id
        if unit_ids:
            parts_via_unit = db.query(PartModel).filter(
                PartModel.raw_material_unit_id.in_(unit_ids)
            ).all()
            for part in parts_via_unit:
                part.required_length = None
                part.raw_material_id = None
                part.raw_material_unit_id = None
        
        # Clear part references via stock.part_id
        from DB.models.oms import Part as PartModel
        if stock.part_id:
            part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
            parts = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            for part in parts:
                part.required_length = None
                part.raw_material_id = None
                part.raw_material_unit_id = None
        
        # Delete units
        for unit in units:
            db.delete(unit)
        
        # Delete stock
        db.delete(stock)
        db.commit()
        
        return {"message": "Order material deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting order material: {str(e)}"
        )


# ==================== Order Parts Raw Material Linked Endpoints ====================

@router.get("/order-parts-raw-material-linked/")
def get_order_parts_raw_material_linked(
    manufacturing_coordinator_id: Optional[int] = None,
    admin_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get order-linked raw materials filtered by order association (admin or MC involved in order)"""
    from routers.rawmaterials import _stock_with_details
    
    # Query order-type stock items
    query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
    ).filter(RawMaterialStockModel.source_type == "order")
    
    # Filter by order association: get orders where user is admin or manufacturing coordinator
    if manufacturing_coordinator_id or admin_id:
        # Get order IDs where the user is either admin or manufacturing coordinator
        order_query = db.query(OrderModel.id)
        
        if manufacturing_coordinator_id:
            order_query = order_query.filter(OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id)
        
        if admin_id:
            order_query = order_query.filter(OrderModel.admin_id == admin_id)
        
        order_ids = [order[0] for order in order_query.all()]
        
        # Filter stock items by these order IDs
        if order_ids:
            query = query.filter(RawMaterialStockModel.source_order_id.in_(order_ids))
        else:
            # If no orders found, return empty result
            return []
    
    stock_items = query.order_by(RawMaterialStockModel.id.asc()).all()
    
    # Use the _stock_with_details helper from rawmaterials.py
    result = [_stock_with_details(item, db) for item in stock_items]
    
    return result


@router.put("/order-parts-raw-material-linked/{stock_id}")
def update_order_parts_raw_material_linked(
    stock_id: int,
    stock_update: RawMaterialStockUpdate,
    db: Session = Depends(get_db)
):
    """Update individual order-linked stock item"""
    from routers.rawmaterials import _stock_with_details
    
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    if stock.source_type != "order":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only order stock can be updated"
        )
    
    try:
        from services.raw_material_calculations import RawMaterialCalculationService
        
        # Update stock fields
        update_data = stock_update.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(stock, field, value)
        
        # Recalculate volume, mass, weight, cost if dimensions or quantity changed
        if any(field in update_data for field in ['quantity', 'diameter', 'length', 'breadth', 'height', 'inner_diameter', 'outer_diameter']):
            RawMaterialCalculationService.update_stock_calculations(db, stock)
            
            # Recalculate total_length and remaining_length for all units when dimensions change
            if any(field in update_data for field in ['diameter', 'length', 'breadth', 'height', 'inner_diameter', 'outer_diameter']):
                units = db.query(RawMaterialUnitModel).filter(
                    RawMaterialUnitModel.stock_id == stock.id
                ).all()
                for unit in units:
                    # Get parts linked to this unit
                    from DB.models.oms import Part
                    from DB.models.inventory import RawMaterialUsage
                    
                    usages = db.query(RawMaterialUsage).filter(
                        RawMaterialUsage.raw_material_unit_id == unit.id
                    ).all()
                    
                    if usages:
                        # Unit is linked to parts - recalculate based on total used length
                        total_used_length = sum(u.used_length for u in usages)
                        old_total_length = unit.total_length
                        new_total_length = stock.length or 0
                        
                        unit.total_length = new_total_length
                        
                        # Scale the used lengths proportionally
                        for usage in usages:
                            if old_total_length > 0:
                                # Scale proportionally: new_used = old_used * (new_total / old_total)
                                new_used_length = round(usage.used_length * (new_total_length / old_total_length), 2)
                                usage.used_length = new_used_length
                                
                                # Update part's required_length
                                part = db.query(Part).filter(Part.id == usage.part_id).first()
                                if part:
                                    part.required_length = new_used_length
                        
                        # Recalculate remaining_length after updating usages
                        total_used_length = sum(u.used_length for u in usages)
                        unit.remaining_length = max(0, unit.total_length - total_used_length)
                    else:
                        # Unit is not linked - update both lengths
                        unit.total_length = stock.length or 0
                        unit.remaining_length = stock.length or 0
        
        # Manage units based on quantity changes
        if 'quantity' in update_data:
            new_quantity = update_data['quantity']
            existing_units = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.stock_id == stock.id
            ).all()
            
            existing_count = len(existing_units)
            
            if new_quantity > existing_count:
                # Add new units for the increase
                units_to_add = new_quantity - existing_count
                for i in range(units_to_add):
                    new_unit = RawMaterialUnitModel(
                        stock_id=stock.id,
                        total_length=stock.length or 0,
                        remaining_length=stock.length or 0,
                        status='not_available' if stock.source_type == 'order' else 'available',
                        volume=stock.volume,
                        mass=stock.mass / new_quantity if new_quantity > 0 else 0,
                        weight=stock.weight / new_quantity if new_quantity > 0 else 0,
                        cost=stock.cost / new_quantity if new_quantity > 0 else 0
                    )
                    db.add(new_unit)
            elif new_quantity < existing_count:
                # Remove unused units for the decrease
                units_to_remove = existing_count - new_quantity
                # Get units that are NOT linked to any parts (safe to delete)
                from DB.models.oms import Part as PartModel
                linked_unit_ids = db.query(PartModel.raw_material_unit_id).filter(
                    PartModel.raw_material_unit_id.isnot(None),
                    PartModel.raw_material_unit_id.in_([u.id for u in existing_units])
                ).all()
                linked_unit_ids = set([u[0] for u in linked_unit_ids])
                
                # Find units that are not linked to any parts
                units_to_delete = [u for u in existing_units if u.id not in linked_unit_ids]
                
                # Delete the required number of unused units (oldest first)
                if len(units_to_delete) >= units_to_remove:
                    for i in range(units_to_remove):
                        db.delete(units_to_delete[i])
                else:
                    # Not enough unused units - raise error
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Cannot reduce quantity to {new_quantity}. {len(units_to_delete)} unused units available, but need to remove {units_to_remove} units. Some units are linked to parts."
                    )
        
        # Update stock and units status based on order_status
        if 'order_status' in update_data:
            new_order_status = update_data['order_status']
            stock.order_status = new_order_status
            
            if new_order_status == 'received':
                stock.status = 'available'
                units = db.query(RawMaterialUnitModel).filter(
                    RawMaterialUnitModel.stock_id == stock.id
                ).all()
                for unit in units:
                    unit.status = 'available'
            elif new_order_status in ['enquiry', 'purchase_request', 'purchase_order']:
                stock.status = 'not_available'
                units = db.query(RawMaterialUnitModel).filter(
                    RawMaterialUnitModel.stock_id == stock.id
                ).all()
                for unit in units:
                    unit.status = 'not_available'
        
        db.commit()
        
        # 🔥 Update stock status based on unit statuses (this will respect order_status logic)
        StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
        
        return _stock_with_details(stock, db)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating stock: {str(e)}"
        )


@router.put("/order-parts-raw-material-linked/status/group/{group_id}")
def update_order_parts_status_group(
    group_id: str,
    update_data: dict,
    user_id: int = None,
    db: Session = Depends(get_db)
):
    """Update status for a group of order-linked stock items with full logic"""
    from routers.rawmaterials import _stock_with_details
    from DB.models.oms import Part as PartModel
    
    # Parse group_id (might be comma-separated)
    stock_ids = [int(id.strip()) for id in group_id.split(',') if id.strip()]
    
    # Get all stocks in the group
    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.id.in_(stock_ids)
    ).all()
    
    if not stocks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No stocks found for group {group_id}"
        )
    
    try:
        for stock in stocks:
            # Handle order_status change
            if 'order_status' in update_data:
                new_order_status = update_data['order_status']
                stock.order_status = new_order_status
                
                # Rule 1: Update stock and units status based on order_status
                if new_order_status == 'received':
                    stock.status = 'available'
                    # Update all units for this stock to 'available'
                    units = db.query(RawMaterialUnitModel).filter(
                        RawMaterialUnitModel.stock_id == stock.id
                    ).all()
                    for unit in units:
                        unit.status = 'available'
                elif new_order_status in ['enquiry', 'purchase_request', 'purchase_order']:
                    stock.status = 'not_available'
                    # Update all units for this stock to 'not_available'
                    units = db.query(RawMaterialUnitModel).filter(
                        RawMaterialUnitModel.stock_id == stock.id
                    ).all()
                    for unit in units:
                        unit.status = 'not_available'
            
            # Handle order_quantity update
            if 'order_quantity' in update_data:
                stock.quantity = update_data['order_quantity']
            
            # Handle received_vendor_id
            if 'received_vendor_id' in update_data:
                stock.received_vendor_id = update_data['received_vendor_id']
            
            # Handle part_ids update (link/unlink)
            if 'part_ids' in update_data:
                new_part_ids_str = update_data['part_ids']
                old_part_ids = [int(pid.strip()) for pid in (stock.part_id or '').split(',') if pid.strip()] if stock.part_id else []
                new_part_ids = [int(pid.strip()) for pid in new_part_ids_str.split(',') if pid.strip()] if new_part_ids_str else []
                
                # Find unlinked parts (parts that were in old but not in new)
                unlinked_part_ids = set(old_part_ids) - set(new_part_ids)
                
                # Rule 3: If parts are unlinked, clear their raw material references
                if unlinked_part_ids:
                    unlinked_parts = db.query(PartModel).filter(PartModel.id.in_(unlinked_part_ids)).all()
                    for part in unlinked_parts:
                        # Clear raw material references
                        part.raw_material_id = None
                        part.raw_material_unit_id = None
                        part.required_length = None
                        
                        # Delete usage records for this part
                        db.query(RawMaterialUsageModel).filter(
                            RawMaterialUsageModel.part_id == part.id
                        ).delete()
                    
                    # Recalculate unit remaining lengths for this stock
                    units = db.query(RawMaterialUnitModel).filter(
                        RawMaterialUnitModel.stock_id == stock.id
                    ).all()
                    for unit in units:
                        # Get total used length from usage records
                        total_used = db.query(func.sum(RawMaterialUsageModel.used_length)).filter(
                            RawMaterialUsageModel.raw_material_unit_id == unit.id
                        ).scalar() or 0
                        unit.remaining_length = unit.total_length - total_used
                        if unit.remaining_length <= 0:
                            unit.status = 'exhausted'
                        elif stock.order_status == 'received':
                            unit.status = 'available'
                        else:
                            unit.status = 'not_available'
                    
                    # 🔥 Update stock status based on unit statuses after unlinking parts
                    StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
                
                stock.part_id = new_part_ids_str
            
            # Handle part_quantities (for future use)
            if 'part_quantities' in update_data:
                pass  # Would need separate storage
            
            # Handle part_raw_material_units (unit selection)
            if 'part_raw_material_units' in update_data:
                part_units = update_data['part_raw_material_units']
                part_ids = [int(pid.strip()) for pid in (stock.part_id or '').split(',') if pid.strip()] if stock.part_id else []
                
                for part_id in part_ids:
                    if str(part_id) in part_units:
                        unit_id = part_units[str(part_id)]
                        part = db.query(PartModel).filter(PartModel.id == part_id).first()
                        if part:
                            # Validate unit belongs to this stock
                            unit = db.query(RawMaterialUnitModel).filter(
                                RawMaterialUnitModel.id == unit_id,
                                RawMaterialUnitModel.stock_id == stock.id
                            ).first()
                            if unit:
                                part.raw_material_unit_id = unit_id
            
            # Handle required_lengths
            if 'required_lengths' in update_data:
                required_lengths = update_data['required_lengths']
                part_ids = [int(pid.strip()) for pid in (stock.part_id or '').split(',') if pid.strip()] if stock.part_id else []
                
                for part_id in part_ids:
                    if str(part_id) in required_lengths:
                        required_length = required_lengths[str(part_id)]
                        part = db.query(PartModel).filter(PartModel.id == part_id).first()
                        unit = None
                        
                        if part and part.raw_material_unit_id:
                            unit = db.query(RawMaterialUnitModel).filter(
                                RawMaterialUnitModel.id == part.raw_material_unit_id
                            ).first()
                        
                        # Rule 2: Validate required_length <= available_length
                        if unit and required_length:
                            if required_length > unit.remaining_length:
                                raise HTTPException(
                                    status_code=status.HTTP_400_BAD_REQUEST,
                                    detail=f"Required length {required_length}mm for part {part_id} exceeds available length {unit.remaining_length}mm"
                                )
                        
                        if part:
                            part.required_length = required_length
                            
                            # Update usage record
                            if unit and required_length:
                                # Delete old usage record for this part
                                db.query(RawMaterialUsageModel).filter(
                                    RawMaterialUsageModel.raw_material_unit_id == unit.id,
                                    RawMaterialUsageModel.part_id == part_id
                                ).delete()
                                
                                # Create new usage record
                                usage = RawMaterialUsageModel(
                                    raw_material_unit_id=unit.id,
                                    part_id=part_id,
                                    used_length=required_length,
                                    remaining_length=unit.remaining_length - required_length
                                )
                                db.add(usage)
                                
                                # Update unit remaining length
                                unit.remaining_length -= required_length
                                if unit.remaining_length <= 0:
                                    unit.status = 'exhausted'
        
        db.commit()
        
        # 🔥 Update stock status based on unit statuses for all stocks in the group
        for stock in stocks:
            StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
        
        # Return updated stocks
        result = [_stock_with_details(stock, db) for stock in stocks]
        return result[0] if len(result) == 1 else result
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating group status: {str(e)}"
        )


@router.post("/order-parts-raw-material-linked/bulk")
def bulk_create_order_parts_raw_material_linked(
    data: dict,
    db: Session = Depends(get_db)
):
    """Bulk create order-linked stock items"""
    # Placeholder for bulk operations
    return {"message": "Bulk operations not yet implemented"}


@router.delete("/order-parts-raw-material-linked/{stock_id}")
def delete_order_parts_raw_material_linked(
    stock_id: int,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Delete order-linked stock item and all related data"""
    from DB.models.oms import Part as PartModel
    
    stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
    if not stock:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Stock with id {stock_id} not found"
        )
    
    if stock.source_type != "order":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only order stock can be deleted"
        )
    
    # Optional user authorization verification
    # User can delete if: 1) They created the stock, OR 2) They are admin or MC of the associated order
    if user_id:
        if stock.user_id != user_id:
            # Check if user is admin or manufacturing_coordinator of the order
            if stock.source_order_id:
                order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
                if order and order.admin_id != user_id and order.manufacturing_coordinator_id != user_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Not authorized to delete this stock item"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Not authorized to delete this stock item"
                )
    
    try:
        # Rule 3: Delete all related data
        
        # 1. Get all units for this stock
        units = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id == stock.id
        ).all()
        
        # 2. Delete all usage records for these units
        unit_ids = [unit.id for unit in units]
        if unit_ids:
            db.query(RawMaterialUsageModel).filter(
                RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)
            ).delete()
        
        # 3. Clear part references via raw_material_unit_id
        if unit_ids:
            parts_via_unit = db.query(PartModel).filter(
                PartModel.raw_material_unit_id.in_(unit_ids)
            ).all()
            for part in parts_via_unit:
                part.required_length = None
                part.raw_material_id = None
                part.raw_material_unit_id = None
        
        # 4. Clear part references via stock.part_id
        if stock.part_id:
            part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
            parts = db.query(PartModel).filter(PartModel.id.in_(part_ids)).all()
            for part in parts:
                part.required_length = None
                part.raw_material_id = None
                part.raw_material_unit_id = None
        
        # 5. Delete all units (cascade should handle this, but explicit is safer)
        for unit in units:
            db.delete(unit)
        
        # 6. Delete stock
        db.delete(stock)
        
        db.commit()
        
        return {"message": "Order-linked stock and all related data deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting stock: {str(e)}"
        )


# ==================== Helper Functions ====================
