from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text
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
    StockQualityDocument as StockQualityDocumentModel,
)
from DB.models.access_control import AccessUser as AccessUserModel
from auth.deps import get_current_user
from auth.scope import scope_ids_from_user, apply_order_role_scope
from DB.schemas.inventory import (
    RawMaterialStock,
    RawMaterialStockCreate,
    RawMaterialStockUpdate,
    Vendors,
    OrderMaterialLinkRequest,
)
from services.raw_material_calculations import RawMaterialCalculationService
from services.stock_auto_update import StockAutoUpdateService
from services.auto_extract_service import AutoExtractService
from services.raw_material_history_service import RawMaterialHistoryService
from services.purchase_request_service import generate_purchase_request_docx

# Import models for hierarchy fetching
from DB.models.oms import (
    Product as ProductModel,
    Assembly as AssemblyModel,
    Part as PartModel,
    PartType as PartTypeModel,
    Document as DocumentModel,
    DocumentExtractedData as DocumentExtractedDataModel,
)

router = APIRouter(
    tags=["Order Raw Materials"]
)


# ==================== Order Raw Material Linking ====================

@router.post("/order-materials/link")
def link_material_to_order(
    request: OrderMaterialLinkRequest,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
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
    request.user_id = current_user.id

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
            process_type=request.process_type if hasattr(request, 'process_type') else None,
            form_type=request.form_type,
            diameter=request.diameter,
            length=request.length,
            breadth=request.breadth,
            height=request.height,
            inner_diameter=request.inner_diameter,
            outer_diameter=request.outer_diameter,
            quantity=request.quantity,
            estimated_cost=request.estimated_cost if hasattr(request, 'estimated_cost') else None,
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
        
        # Log history
        try:
            RawMaterialHistoryService.log_stock_created(
                db=db,
                stock_id=stock.id,
                user_id=request.user_id
            )
        except Exception as e:
            # Log error but don't fail the operation
            print(f"Error logging stock creation history: {e}")
        
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
def receive_order_material(stock_id: int, final_cost: Optional[float] = None, db: Session = Depends(get_db)):
    """
    Receive order material - updates unit status and links parts.

    When order is received:
    1. Stock status changes to 'available'
    2. Order status changes to 'received'
    3. Units status changes to 'available' (units created immediately on stock creation)
    4. Parts are linked to units
    5. Final cost is saved if provided
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
    
    # Check if any parts linked to this stock have active schedule status
    from DB.models.oms import Part as PartModel
    part_ids = []
    if stock.part_id:
        part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
    
    # Also check parts linked via units (raw_material_unit_id)
    units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
    unit_ids = [u.id for u in units]
    
    if unit_ids:
        parts_via_units = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
        for part in parts_via_units:
            if part.id not in part_ids:
                part_ids.append(part.id)
    
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
                detail=f"Sorry, this order material cannot be received because the following parts are currently scheduled for production: {', '.join(part_names)}. To receive this material, please inactivate the schedule status of these parts first."
            )
    
    try:
        # Update stock status
        stock.order_status = "received"
        stock.status = "available"
        
        # Save final cost if provided
        if final_cost is not None:
            stock.final_cost = final_cost
        
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
                    
                    # Log history for material linking
                    try:
                        RawMaterialHistoryService.log_material_linked(
                            db=db,
                            unit_id=unit.id,
                            part_id=part.id,
                            used_length=part.required_length,
                            user_id=user_id
                        )
                    except Exception as e:
                        # Log error but don't fail the operation
                        print(f"Error logging material linking history: {e}")
                    
                    # Update unit remaining length
                    unit.remaining_length -= part.required_length
                    if unit.remaining_length <= 0:
                        unit.status = "exhausted"
                    
                    unit_index += 1
        
        db.commit()
        
        # 🔥 Update stock status based on unit statuses
        StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
        
        # Log history for order status change
        try:
            RawMaterialHistoryService.log_order_status_changed(
                db=db,
                stock_id=stock.id,
                old_status="enquiry",
                new_status="received",
                user_id=user_id
            )
        except Exception as e:
            # Log error but don't fail the operation
            print(f"Error logging order status change history: {e}")
        
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
    
    # Check if any parts linked to this stock have active schedule status
    from DB.models.oms import Part as PartModel
    part_ids = []
    if stock.part_id:
        part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
    
    # Also check parts linked via units (raw_material_unit_id)
    units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
    unit_ids = [u.id for u in units]
    
    if unit_ids:
        parts_via_units = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
        for part in parts_via_units:
            if part.id not in part_ids:
                part_ids.append(part.id)
    
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
                detail=f"Sorry, this order material cannot be updated because the following parts are currently scheduled for production: {', '.join(part_names)}. To update this material, please inactivate the schedule status of these parts first."
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
    
    # Check if any parts linked to this stock have active schedule status
    from DB.models.oms import Part as PartModel
    part_ids = []
    if stock.part_id:
        part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
    
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
                detail=f"Sorry, this order material cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this material, please inactivate the schedule status of these parts first."
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
                # Log history for material unlinking before clearing
                if part.raw_material_unit_id:
                    try:
                        RawMaterialHistoryService.log_material_unlinked(
                            db=db,
                            unit_id=part.raw_material_unit_id,
                            part_id=part.id,
                            material_name=material.material_name if material else "Unknown",
                            user_id=user_id
                        )
                    except Exception as e:
                        # Log error but don't fail the operation
                        print(f"Error logging material unlinking history: {e}")
                
                part.required_length = None
                part.raw_material_id = None
                part.raw_material_unit_id = None
        
        # Delete units
        for unit in units:
            db.delete(unit)
        
        # Delete quality documents for this stock (cascade delete from DB and MinIO)
        from DB.minio_client import get_minio_client
        quality_docs = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock_id
        ).all()
        for doc in quality_docs:
            try:
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
        
        # Delete stock
        material_name = material.material_name if material else "Unknown"
        source_type = stock.source_type
        db.delete(stock)
        db.commit()
        
        # Log history
        try:
            RawMaterialHistoryService.log_stock_deleted(
                db=db,
                stock_id=stock_id,
                material_name=material_name,
                source_type=source_type,
                user_id=user_id
            )
        except Exception as e:
            # Log error but don't fail the operation
            print(f"Error logging stock deletion history: {e}")
        
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
    db: Session = Depends(get_db),
    manufacturing_coordinator_id: Optional[int] = Query(None),
    admin_id: Optional[int] = Query(None),
    project_coordinator_id: Optional[int] = Query(None),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """Get order-linked raw materials scoped to the JWT user's role."""
    from routers.rawmaterials import _stock_with_details

    scope = scope_ids_from_user(current_user)
    manufacturing_coordinator_id = scope["manufacturing_coordinator_id"]
    admin_id = scope["admin_id"]
    project_coordinator_id = scope["project_coordinator_id"]
    
    # Query order-type stock items
    query = db.query(RawMaterialStockModel).options(
        joinedload(RawMaterialStockModel.material),
        joinedload(RawMaterialStockModel.source_order),
        joinedload(RawMaterialStockModel.vendor),
    ).filter(RawMaterialStockModel.source_type == "order")
    
    # Filter by order association from JWT role
    if manufacturing_coordinator_id or admin_id or project_coordinator_id:
        # Get order IDs where the user is admin, PC, or manufacturing coordinator
        order_query = apply_order_role_scope(db.query(OrderModel.id), OrderModel, current_user)
        
        order_ids = [order[0] for order in order_query.all()]
        
        # Filter stock items by these order IDs only (no auto-extracted fallback)
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
    
    # Check if any parts linked to this stock have active schedule status
    from DB.models.oms import Part as PartModel
    part_ids = []
    if stock.part_id:
        part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
    
    # Also check parts linked via units (raw_material_unit_id)
    units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
    unit_ids = [u.id for u in units]
    
    if unit_ids:
        parts_via_units = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
        for part in parts_via_units:
            if part.id not in part_ids:
                part_ids.append(part.id)
    
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
                detail=f"Sorry, this order material cannot be updated because the following parts are currently scheduled for production: {', '.join(part_names)}. To update this material, please inactivate the schedule status of these parts first."
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
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """Update status for a group of order-linked stock items with full logic"""
    from routers.rawmaterials import _stock_with_details
    from DB.models.oms import Part as PartModel

    user_id = current_user.id
    
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
                
                # Check if any unlinked parts have active schedule status
                if unlinked_part_ids:
                    active_parts = db.execute(
                        text("""
                            SELECT p.id, p.part_name 
                            FROM oms.parts p
                            JOIN scheduling.part_schedule_status pss ON p.id = pss.part_id
                            WHERE p.id IN :part_ids AND pss.status = 'active'
                        """),
                        {"part_ids": tuple(unlinked_part_ids)}
                    ).fetchall()
                    
                    if active_parts:
                        part_names = [row[1] for row in active_parts]
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Sorry, parts cannot be unlinked because the following parts are currently scheduled for production: {', '.join(part_names)}. To unlink these parts, please inactivate their schedule status first."
                        )
                
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
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """Delete order-linked stock item and all related data"""
    from DB.models.oms import Part as PartModel

    user_id = current_user.id

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
    
    # Check if any parts linked to this stock have active schedule status
    part_ids = []
    if stock.part_id:
        part_ids = [int(pid.strip()) for pid in stock.part_id.split(',') if pid.strip()]
    
    # Also check parts linked via units (raw_material_unit_id)
    units = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.stock_id == stock_id).all()
    unit_ids = [u.id for u in units]
    
    if unit_ids:
        parts_via_units = db.query(PartModel).filter(PartModel.raw_material_unit_id.in_(unit_ids)).all()
        for part in parts_via_units:
            if part.id not in part_ids:
                part_ids.append(part.id)
    
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
                detail=f"Sorry, this order material cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this material, please inactivate the schedule status of these parts first."
            )
    
    # Authorization: if user_id provided, require creator or admin/MC of the associated order
    if user_id is not None and stock.user_id != user_id:
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
        
        # 6. Delete quality documents for this stock (cascade delete from DB and MinIO)
        from DB.minio_client import get_minio_client
        quality_docs = db.query(StockQualityDocumentModel).filter(
            StockQualityDocumentModel.stock_id == stock.id
        ).all()
        for doc in quality_docs:
            try:
                minio_client = get_minio_client()
                url_parts = doc.document_url.split('/')
                object_name = '/'.join(url_parts[4:])
                minio_client.delete_file(object_name)
            except Exception as e:
                print(f"Error deleting file from MinIO: {e}")
            db.delete(doc)
        
        # 7. Delete raw material history records for this stock
        from DB.models.inventory import RawMaterialHistory as RawMaterialHistoryModel
        db.query(RawMaterialHistoryModel).filter(
            RawMaterialHistoryModel.stock_id == stock.id
        ).delete()
        
        # 8. Delete stock
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


# ==================== Order Raw Material Hierarchy (Simplified) ====================

def _load_hierarchy_shared_context(db: Session):
    """Load lookup maps shared across multiple product hierarchies."""
    all_raw_materials = db.query(RawMaterialModel).all()
    raw_material_map = {rm.id: rm.material_name for rm in all_raw_materials}
    raw_material_status_map = {rm.id: "Available" for rm in all_raw_materials}

    all_units = db.query(RawMaterialUnitModel).options(
        joinedload(RawMaterialUnitModel.stock).joinedload(RawMaterialStockModel.material)
    ).all()
    unit_map = {unit.id: unit for unit in all_units}

    all_part_types = db.query(PartTypeModel).all()
    part_type_map = {pt.id: pt.type_name for pt in all_part_types}

    all_users = db.query(AccessUserModel).all()
    user_map = {u.id: u.user_name for u in all_users}

    return {
        "raw_material_map": raw_material_map,
        "raw_material_status_map": raw_material_status_map,
        "unit_map": unit_map,
        "part_type_map": part_type_map,
        "user_map": user_map,
    }


def fetch_simplified_hierarchy(db: Session, product_id: int, shared_context=None):
    """
    Fetch simplified product hierarchy for raw materials.
    Returns only: parts, assemblies, documents, extracted_data, and raw material info.
    Excludes: operations, operation_documents, tools.
    """
    if shared_context is None:
        shared_context = _load_hierarchy_shared_context(db)

    raw_material_map = shared_context["raw_material_map"]
    raw_material_status_map = shared_context["raw_material_status_map"]
    unit_map = shared_context["unit_map"]
    part_type_map = shared_context["part_type_map"]
    user_map = shared_context["user_map"]

    # Get product
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    # Get all assemblies for this product
    all_assemblies = db.query(AssemblyModel).filter(AssemblyModel.product_id == product_id).order_by(AssemblyModel.id.asc()).all()
    assembly_ids = [asm.id for asm in all_assemblies]

    # Get all parts for this product
    all_parts = db.query(PartModel).filter(PartModel.product_id == product_id).order_by(PartModel.id.asc()).all()
    
    # Create mappings for easy lookup
    assembly_map = {asm.id: asm for asm in all_assemblies}
    part_map = {part.id: part for part in all_parts}
    
    # Pre-build lookup maps
    parts_by_assembly = {}
    for part in all_parts:
        parts_by_assembly.setdefault(part.assembly_id, []).append(part)
    
    assemblies_by_parent = {}
    for asm in all_assemblies:
        assemblies_by_parent.setdefault(asm.parent_id, []).append(asm)
    
    # Get documents and extracted data for parts
    part_ids = list(part_map.keys())
    documents_by_part = {}
    extracted_by_part = {}
    documents_by_assembly = {}
    
    if part_ids:
        # Get documents for parts
        documents = db.query(DocumentModel).filter(DocumentModel.part_id.in_(part_ids)).all()
        for doc in documents:
            if doc.part_id not in documents_by_part:
                documents_by_part[doc.part_id] = []
            documents_by_part[doc.part_id].append(doc)
        
        # Get extracted data for parts
        extracted_rows = (
            db.query(DocumentExtractedDataModel)
            .filter(DocumentExtractedDataModel.part_id.in_(part_ids))
            .all()
        )
        for row in extracted_rows:
            if row.part_id not in extracted_by_part:
                extracted_by_part[row.part_id] = []
            extracted_by_part[row.part_id].append(row)
    
    # Get documents for assemblies
    if assembly_ids:
        asm_docs = db.query(DocumentModel).filter(DocumentModel.assembly_id.in_(assembly_ids)).all()
        for doc in asm_docs:
            if doc.assembly_id not in documents_by_assembly:
                documents_by_assembly[doc.assembly_id] = []
            documents_by_assembly[doc.assembly_id].append(doc)

    def create_simplified_part_details(part: PartModel):
        """Create simplified part details with only raw material relevant data"""
        part_type_name = part_type_map.get(part.type_id, "")
        
        # Raw material status
        if part.raw_material_id is None:
            raw_material_status = "N/A"
        else:
            raw_material_status = raw_material_status_map.get(part.raw_material_id, "Not Available")

        # Get unit details if part has a unit assigned
        unit_details = None
        raw_material_stock_details = None
        raw_material_stock_form_type = None
        raw_material_stock_dimensions = None
        
        if part.raw_material_unit_id and part.raw_material_unit_id in unit_map:
            unit = unit_map[part.raw_material_unit_id]
            stock = unit.stock
            # Build stock dimensions string
            stock_dimensions = None
            if stock:
                if stock.form_type == 'Round':
                    stock_dimensions = f'Ø{stock.diameter} × {stock.length}mm'
                elif stock.form_type == 'Square':
                    stock_dimensions = f'{stock.breadth} × {stock.height} × {stock.length}mm'
                elif stock.form_type == 'Pipe':
                    stock_dimensions = f'Ø{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm'
            
            unit_details = {
                'id': unit.id,
                'total_length': unit.total_length,
                'remaining_length': unit.remaining_length,
                'volume': unit.volume,
                'mass': unit.mass,
                'weight': unit.weight,
                'cost': unit.cost,
                'status': unit.status,
                'form_type': stock.form_type if stock else None,
                'material_name': stock.material.material_name if stock and stock.material else None,
                'source_type': stock.source_type if stock else None,
                'stock_dimensions': stock_dimensions,
            }
            
            # Additional stock details for raw material linking
            if stock:
                raw_material_stock_details = {
                    'id': stock.id,
                    'total_length': stock.length,
                    'remaining_length': stock.length,
                    'volume': stock.volume,
                    'mass': stock.mass,
                    'weight': stock.weight,
                    'cost': stock.cost,
                    'status': stock.status,
                    'form_type': stock.form_type,
                    'material_name': stock.material.material_name if stock.material else None,
                    'source_type': stock.source_type,
                    'stock_dimensions': stock_dimensions,
                    'order_status': stock.order_status,
                }
                raw_material_stock_form_type = stock.form_type
                raw_material_stock_dimensions = stock_dimensions

        part_dict = {
            'id': part.id,
            'part_name': part.part_name,
            'part_number': part.part_number,
            'type_id': part.type_id,
            'raw_material_id': part.raw_material_id,
            'raw_material_unit_id': part.raw_material_unit_id,
            'required_length': part.required_length,
            'part_detail': part.part_detail,
            'assembly_id': part.assembly_id,
            'product_id': part.product_id,
            'user_id': part.user_id,
            'qty': part.qty,
            'size': part.size,
            'vendor_id': part.vendor_id,
            'type_name': part_type_map.get(part.type_id),
            'raw_material_name': raw_material_map.get(part.raw_material_id),
            'raw_material_status': raw_material_status,
            'raw_material_unit_details': unit_details,
            'raw_material_stock_details': raw_material_stock_details,
            'raw_material_stock_form_type': raw_material_stock_form_type,
            'raw_material_stock_dimensions': raw_material_stock_dimensions,
            'priority': getattr(part, 'priority', None),
            'user_name': user_map.get(part.user_id) if part.user_id else None,
            'vendor_name': getattr(part.vendor, 'company_name', None) if hasattr(part, 'vendor') and part.vendor else None,
            'recycle_bin': getattr(part, 'recycle_bin', False),
            'created_at': part.created_at,
            'updated_at': part.updated_at,
        }
        
        return {
            'part': part_dict,
            'documents': documents_by_part.get(part.id, []),
            'extracted_data': extracted_by_part.get(part.id, []),
        }
    
    def build_simplified_assembly_hierarchy(assembly_id: int):
        """Recursively build simplified assembly hierarchy"""
        assembly = assembly_map[assembly_id]
        
        direct_parts = [
            create_simplified_part_details(part) 
            for part in parts_by_assembly.get(assembly_id, [])
        ]
        
        child_assemblies = [
            build_simplified_assembly_hierarchy(child.id) 
            for child in assemblies_by_parent.get(assembly_id, [])
        ]
        
        return {
            'assembly': {
                'id': assembly.id,
                'assembly_name': assembly.assembly_name,
                'assembly_number': assembly.assembly_number,
                'product_id': assembly.product_id,
                'parent_id': assembly.parent_id,
                'user_id': assembly.user_id,
                'recycle_bin': assembly.recycle_bin,
                'user_name': user_map.get(assembly.user_id) if assembly.user_id else None,
                'created_at': assembly.created_at,
                'updated_at': assembly.updated_at,
            },
            'parts': direct_parts,
            'subassemblies': child_assemblies,
            'documents': documents_by_assembly.get(assembly_id, []),
        }
    
    # Build root level assemblies
    root_assemblies = [
        build_simplified_assembly_hierarchy(asm.id) 
        for asm in assemblies_by_parent.get(None, [])
    ]
    
    # Get direct parts (parts not assigned to any assembly)
    direct_parts = [
        create_simplified_part_details(part) 
        for part in parts_by_assembly.get(None, [])
    ]
    
    return {
        'product': {
            'id': product.id,
            'product_name': product.product_name,
            'product_version': product.product_version,
            'user_id': product.user_id,
            'user_name': user_map.get(product.user_id) if product.user_id else None,
            'created_at': product.created_at,
            'updated_at': product.updated_at,
        },
        'assemblies': root_assemblies,
        'direct_parts': direct_parts
    }


def _build_order_hierarchy_response(order: OrderModel, hierarchy: dict):
    return {
        "id": order.id,
        "sale_order_number": order.sale_order_number,
        "project_name": order.project_name,
        "order_date": order.order_date,
        "customer_id": order.customer_id,
        "product_id": order.product_id,
        "user_id": order.user_id,
        "user_role": order.user.role if order.user else None,
        "project_coordinator_id": order.project_coordinator_id,
        "admin_id": order.admin_id,
        "manufacturing_coordinator_id": order.manufacturing_coordinator_id,
        "quantity": order.quantity,
        "due_date": order.due_date,
        "status": order.status,
        "approval_status": order.approval_status,
        "approval_remarks": order.approval_remarks,
        "approved_at": order.approved_at,
        "company_name": order.customer.company_name if order.customer else None,
        "product_name": order.product.product_name if order.product else None,
        "user_name": order.user.user_name if order.user else None,
        "project_coordinator_name": order.project_coordinator.user_name if order.project_coordinator else None,
        "admin_name": order.admin.user_name if order.admin else None,
        "manufacturing_coordinator_name": order.manufacturing_coordinator.user_name if order.manufacturing_coordinator else None,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "product_hierarchy": hierarchy,
    }


@router.get("/order-raw-material-hierarchies")
def get_all_order_raw_material_hierarchies(
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """
    Get all scoped orders with simplified product hierarchies in one request.
    Reuses hierarchy data when multiple orders share the same product.
    """
    order_query = (
        db.query(OrderModel)
        .options(
            joinedload(OrderModel.customer),
            joinedload(OrderModel.product),
            joinedload(OrderModel.user),
            joinedload(OrderModel.project_coordinator),
            joinedload(OrderModel.admin),
            joinedload(OrderModel.manufacturing_coordinator),
        )
        .order_by(OrderModel.id.asc())
    )
    order_query = apply_order_role_scope(order_query, OrderModel, current_user)
    orders = order_query.all()

    shared_context = _load_hierarchy_shared_context(db)
    hierarchy_by_product_id = {}
    results = []

    for order in orders:
        hierarchy = None
        if order.product_id:
            if order.product_id not in hierarchy_by_product_id:
                try:
                    hierarchy_by_product_id[order.product_id] = fetch_simplified_hierarchy(
                        db, order.product_id, shared_context
                    )
                except HTTPException:
                    hierarchy_by_product_id[order.product_id] = None
            hierarchy = hierarchy_by_product_id[order.product_id]

        results.append(_build_order_hierarchy_response(order, hierarchy))

    return results


@router.get("/order-raw-material-hierarchy/{order_id}")
def get_order_raw_material_hierarchy(order_id: int, db: Session = Depends(get_db)):
    """
    Get order with simplified product hierarchy for raw materials.
    Returns only: extracted text, part information, and assigned raw materials.
    Excludes: operations, operation documents, tools.
    """
    # Get order
    order = (
        db.query(OrderModel)
        .options(
            joinedload(OrderModel.customer),
            joinedload(OrderModel.product),
            joinedload(OrderModel.user),
            joinedload(OrderModel.project_coordinator),
            joinedload(OrderModel.admin),
            joinedload(OrderModel.manufacturing_coordinator),
        )
        .filter(OrderModel.id == order_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    hierarchy = fetch_simplified_hierarchy(db, order.product_id)
    return _build_order_hierarchy_response(order, hierarchy)


# ==================== Auto-Extract Raw Materials ====================

class AutoExtractRequest(BaseModel):
    part_id: int
    material_name: Optional[str] = None
    stock_size: Optional[str] = None
    quantity: int = 1
    required_length: Optional[float] = None
    user_id: Optional[int] = None
    process_type: Optional[str] = 'Barstocks'
    form_type: Optional[str] = None
    dimensions: Optional[dict] = None


@router.post("/auto-extract-process")
def process_auto_extract_material(
    request: AutoExtractRequest,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """
    Process extracted material for a part - creates stock in database.
    This should only be called when user clicks Procure button.
    """
    request.user_id = current_user.id

    # Get part
    part = db.query(PartModel).filter(PartModel.id == request.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")

    # Build extracted data
    extracted_data = {
        'material': request.material_name,
        'stock_size': request.stock_size or '',
        'quantity': request.quantity,
        'required_length': request.required_length,
        'process_type': request.process_type,
        'form_type': request.form_type,
        'dimensions': request.dimensions
    }

    # Process and create stock using auto-extract service
    result = AutoExtractService.process_and_create_stock(
        db=db,
        part=part,
        extracted_data=extracted_data,
        user_id=request.user_id
    )

    return result


# ==================== Group/Ungroup Orders ====================

class GroupOrdersRequest(BaseModel):
    """Request model for grouping multiple order stock items"""
    stock_ids: List[int]


class UngroupOrdersRequest(BaseModel):
    """Request model for ungrouping stock items"""
    stock_ids: List[int]


@router.post("/order-parts-raw-material-linked/group")
def group_orders(request: GroupOrdersRequest, db: Session = Depends(get_db)):
    """
    Group multiple order stock items together for bulk vendor linking.
    All selected items will share the same merge_group_id.
    """
    import uuid
    
    # Validate stock IDs
    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.id.in_(request.stock_ids)
    ).all()
    
    if len(stocks) != len(request.stock_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more stock items not found"
        )
    
    # Validate all are order-type stock
    for stock in stocks:
        if stock.source_type != "order":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock ID {stock.id} is not an order-type stock"
            )
    
    # Check if any stock is already grouped
    for stock in stocks:
        if stock.merge_group_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Stock ID {stock.id} is already grouped with merge_group_id: {stock.merge_group_id}. Please ungroup it first."
            )
    
    try:
        # Generate a sequential group number
        # Get the highest existing group number from the database
        from sqlalchemy import func
        existing_groups = db.query(RawMaterialStockModel.merge_group_id).filter(
            RawMaterialStockModel.merge_group_id.isnot(None)
        ).distinct().all()
        
        # Extract numeric group numbers (assuming format "Group #N")
        max_group_num = 0
        for (group_id,) in existing_groups:
            if group_id and group_id.startswith("Group #"):
                try:
                    num = int(group_id.replace("Group #", ""))
                    if num > max_group_num:
                        max_group_num = num
                except ValueError:
                    pass
        
        # Generate new group number
        new_group_num = max_group_num + 1
        merge_group_id = f"Group #{new_group_num}"
        
        # Set merge_group_id for all selected stocks
        for stock in stocks:
            stock.merge_group_id = merge_group_id
        
        db.commit()
        
        return {
            "message": f"Successfully grouped {len(stocks)} orders",
            "merge_group_id": merge_group_id,
            "group_number": new_group_num,
            "stock_ids": request.stock_ids
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error merging orders: {str(e)}"
        )


@router.post("/order-parts-raw-material-linked/ungroup")
def ungroup_orders(request: UngroupOrdersRequest, db: Session = Depends(get_db)):
    """
    Ungroup order stock items from their group.
    Each item will have its merge_group_id cleared.
    """
    # Validate stock IDs
    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.id.in_(request.stock_ids)
    ).all()
    
    if len(stocks) != len(request.stock_ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or more stock items not found"
        )
    
    try:
        # Clear merge_group_id for all selected stocks
        for stock in stocks:
            stock.merge_group_id = None
            db.flush()  # Ensure the change is written immediately
        
        db.commit()
        
        # Verify the changes were applied
        verification = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.id.in_(request.stock_ids)
        ).all()
        
        still_grouped = [s.id for s in verification if s.merge_group_id is not None]
        if still_grouped:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to ungroup stock IDs: {still_grouped}. merge_group_id still present."
            )
        
        return {
            "message": f"Successfully ungrouped {len(stocks)} orders",
            "stock_ids": request.stock_ids,
            "cleared_merge_group_ids": [s.id for s in stocks]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error unmerging orders: {str(e)}"
        )


@router.put("/order-parts-raw-material-linked/group/{merge_group_id}")
def update_group(
    merge_group_id: str,
    update_data: dict,
    db: Session = Depends(get_db)
):
    """
    Update all stock items in a group (bulk update for vendor linking, status change, etc.)
    """
    from routers.rawmaterials import _stock_with_details
    
    # Validate merge_group_id
    if not merge_group_id or merge_group_id.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid merge_group_id: '{merge_group_id}'. Please provide a valid group ID."
        )
    
    # Trim the merge_group_id for database query
    merge_group_id = merge_group_id.strip()
    
    # Check if it's just "Group" without a number (invalid)
    if merge_group_id == "Group":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid merge_group_id: '{merge_group_id}'. Group ID must be in format 'Group #N'."
        )
    
    # Get all stocks in the group
    stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.merge_group_id == merge_group_id
    ).all()
    
    if not stocks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No stocks found for group {merge_group_id}"
        )
    
    try:
        # Update all stocks in the group
        for stock in stocks:
            update_fields = update_data.copy()
            
            # Track vendor changes for history
            old_vendor_id = stock.received_vendor_id
            new_vendor_id = None
            
            # Handle vendor_id update (for enquiry)
            if 'vendor_id' in update_fields:
                stock.vendor_id = update_fields['vendor_id']
            
            # Handle received_vendor_id update (for PO/received)
            if 'received_vendor_id' in update_fields:
                stock.received_vendor_id = update_fields['received_vendor_id']
                new_vendor_id = update_fields['received_vendor_id']
            
            # Handle order_status update
            if 'order_status' in update_fields:
                stock.order_status = update_fields['order_status']
                
                # Update stock and units status based on order_status
                if update_fields['order_status'] == 'received':
                    stock.status = 'available'
                    units = db.query(RawMaterialUnitModel).filter(
                        RawMaterialUnitModel.stock_id == stock.id
                    ).all()
                    for unit in units:
                        unit.status = 'available'
                elif update_fields['order_status'] in ['enquiry', 'purchase_request', 'purchase_order']:
                    stock.status = 'not_available'
                    units = db.query(RawMaterialUnitModel).filter(
                        RawMaterialUnitModel.stock_id == stock.id
                    ).all()
                    for unit in units:
                        unit.status = 'not_available'
            
            # Handle final_cost update
            if 'final_cost' in update_fields:
                stock.final_cost = update_fields['final_cost']
        
        db.commit()
        
        # Log history for vendor changes
        if new_vendor_id is not None and old_vendor_id != new_vendor_id:
            for stock in stocks:
                try:
                    RawMaterialHistoryService.log_vendor_changed(
                        db=db,
                        stock_id=stock.id,
                        old_vendor_id=old_vendor_id,
                        new_vendor_id=new_vendor_id,
                        user_id=user_id
                    )
                except Exception as e:
                    print(f"Error logging vendor change history: {e}")
        
        # Update stock status based on unit statuses
        for stock in stocks:
            StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
        
        # Return updated stocks with details
        result = [_stock_with_details(stock, db) for stock in stocks]
        
        return {
            "message": f"Successfully updated {len(stocks)} items in group",
            "merge_group_id": merge_group_id,
            "updated_stocks": result
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating group: {str(e)}"
        )


# ==================== Purchase Request Download ====================

@router.post("/order-materials/{stock_id}/purchase-request")
def download_purchase_request(
    stock_id: int,
    request_data: dict,
    db: Session = Depends(get_db)
):
    """
    Download a populated Purchase Requisition .docx for order material.
    Accepts edited data from frontend and fills in the template.
    """
    from fastapi.responses import StreamingResponse
    
    try:
        template_type = request_data.get("template_type", "auto")
        data = request_data.get("data", {})
        
        # Generate document using service
        buffer, filename = generate_purchase_request_docx(
            stock_id=stock_id,
            template_type=template_type,
            data=data,
            db=db
        )
        
        return StreamingResponse(
            buffer,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating purchase request: {str(e)}"
        )
