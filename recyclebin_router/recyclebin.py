from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from sqlalchemy import and_, text

from DB.database import get_db
from DB.models.oms import (
    Part as PartModel,
    Operation as OperationModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    OperationDocument as OperationDocumentModel,
    DocumentExtractedData as DocumentExtractedDataModel,
    Product as ProductModel,
    Assembly as AssemblyModel,
    Order as OrderModel,
    OrderPartPriority as OrderPartPriorityModel,
    OutSourcePartStatus as OutSourcePartStatusModel,
)
from DB.models.configuration import PokayokeCompletedLog
from DB.models.inventory import RawMaterialUnit, RawMaterialUsage
from services.stock_auto_update import StockAutoUpdateService
from services.notification_service import NotificationService
from DB.models.access_control import AccessUser
from DB.schemas.oms import Part, PartUpdate, Assembly, AssemblyUpdate

router = APIRouter(
    prefix="/recycle-bin",
    tags=["recycle-bin"]
)


def _build_part_maps(db: Session):
    """Fetch PartType, RawMaterial, AccessUser, Vendors, Product, Assembly, and Order rows once and return id→value maps."""
    from DB.models.oms import PartType
    from DB.models.inventory import RawMaterial, Vendors

    type_map = {pt.id: pt.type_name for pt in db.query(PartType).all()}
    rm_map = {rm.id: rm.material_name for rm in db.query(RawMaterial).all()}
    user_map = {u.id: u.user_name for u in db.query(AccessUser).all()}
    vendor_map = {v.id: v.company_name for v in db.query(Vendors).all()}
    product_map = {p.id: p.product_name for p in db.query(ProductModel).all()}
    assembly_map = {a.id: a for a in db.query(AssemblyModel).all()}
    order_map = {o.id: o for o in db.query(OrderModel).all()}
    return type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map


def _build_assembly_maps(db: Session):
    """Fetch Product, Assembly, and AccessUser rows once and return id→value maps."""
    product_map = {p.id: p.product_name for p in db.query(ProductModel).all()}
    parent_assembly_map = {a.id: a for a in db.query(AssemblyModel).all()}
    user_map = {u.id: u.user_name for u in db.query(AccessUser).all()}
    return product_map, parent_assembly_map, user_map


def _build_hierarchical_assemblies(assemblies: list, db: Session, product_map: dict, parent_assembly_map: dict, user_map: dict, parts: list) -> list:
    """Build hierarchical assembly structure with child_assemblies and parts"""
    # Create a map of assemblies by id
    assembly_map = {a.id: a for a in assemblies}
    
    # Group assemblies by parent_id
    children_by_parent = {}
    for assembly in assemblies:
        parent_id = assembly.parent_id or None
        if parent_id not in children_by_parent:
            children_by_parent[parent_id] = []
        children_by_parent[parent_id].append(assembly)
    
    # Group parts by assembly_id
    parts_by_assembly = {}
    for part in parts:
        assembly_id = part.assembly_id
        if assembly_id not in parts_by_assembly:
            parts_by_assembly[assembly_id] = []
        parts_by_assembly[assembly_id].append(part)
    
    # Recursive function to build hierarchy
    def build_hierarchy(assembly):
        children = children_by_parent.get(assembly.id, [])
        child_assemblies = []
        for child in children:
            child_assemblies.append(build_hierarchy(child))
        
        # Get parts for this assembly
        assembly_parts = parts_by_assembly.get(assembly.id, [])
        
        return _assembly_to_dict(assembly, product_map, parent_assembly_map, user_map, db, child_assemblies, assembly_parts)
    
    # Build hierarchy for root assemblies (parent_id is None)
    root_assemblies = children_by_parent.get(None, [])
    hierarchical_assemblies = [build_hierarchy(assembly) for assembly in root_assemblies]
    
    return hierarchical_assemblies


def _check_and_update_assembly_recycle_bin_status(assembly_id: int, db: Session):
    """
    Update the assembly's recycle_bin status when a part is restored or permanently deleted.
    When ANY part belonging to an assembly is restored or permanently deleted, 
    the assembly should be removed from recycle bin (recycle_bin = false).
    
    This function also recursively updates parent assemblies.
    
    Returns True if the assembly was updated, False otherwise.
    """
    # Check if the assembly itself is in recycle bin
    assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not assembly:
        return False
    
    # If assembly is in recycle bin, remove it immediately
    if assembly.recycle_bin:
        assembly.recycle_bin = False
        db.commit()
    
    # Recursively update parent assemblies
    if assembly.parent_id:
        parent = db.query(AssemblyModel).filter(AssemblyModel.id == assembly.parent_id).first()
        if parent and parent.recycle_bin:
            parent.recycle_bin = False
            db.commit()
            # Continue recursively up the chain
            _check_and_update_assembly_recycle_bin_status(assembly.parent_id, db)
    
    return True


def _assembly_to_dict(assembly: AssemblyModel, product_map: dict, parent_assembly_map: dict, user_map: dict, db: Session, child_assemblies=None, parts=None) -> dict:
    # Get product name
    product_name = product_map.get(assembly.product_id) if assembly.product_id else None
    
    # Get parent assembly name
    parent_assembly_name = None
    if assembly.parent_id:
        parent = parent_assembly_map.get(assembly.parent_id)
        if parent:
            parent_assembly_name = parent.assembly_name
    
    # Count parts in this assembly
    total_parts = db.query(PartModel).filter(PartModel.assembly_id == assembly.id).count()
    recycled_parts = db.query(PartModel).filter(
        PartModel.assembly_id == assembly.id,
        PartModel.recycle_bin == True
    ).count()
    
    return {
        "id": assembly.id,
        "assembly_name": assembly.assembly_name,
        "assembly_number": assembly.assembly_number,
        "product_id": assembly.product_id,
        "parent_id": assembly.parent_id,
        "user_id": assembly.user_id,
        "recycle_bin": assembly.recycle_bin,
        "product_name": product_name,
        "parent_assembly_name": parent_assembly_name,
        "user_name": user_map.get(assembly.user_id) if assembly.user_id else None,
        "total_parts": total_parts,
        "recycled_parts": recycled_parts,
        "child_assemblies": child_assemblies or [],
        "parts": parts or [],
        "created_at": assembly.created_at,
        "updated_at": assembly.updated_at,
    }


def _part_to_dict(part: PartModel, type_map: dict, rm_map: dict, user_map: dict, vendor_map: dict, product_map: dict, assembly_map: dict, order_map: dict) -> dict:
    # Get product name
    product_name = product_map.get(part.product_id) if part.product_id else None

    # Get assembly name (only the direct assembly name, not full hierarchy)
    assembly_name = None
    if part.assembly_id:
        assembly = assembly_map.get(part.assembly_id)
        if assembly:
            assembly_name = assembly.assembly_name

    # Get order information (sale order number, project name)
    sale_order_number = None
    project_name = None
    if part.product_id:
        orders = [order for order in order_map.values() if order.product_id == part.product_id]
        if orders:
            order = orders[0]
            sale_order_number = order.sale_order_number
            project_name = order.project_name
    
    return {
        "id": part.id,
        "part_name": part.part_name,
        "part_number": part.part_number,
        "type_id": part.type_id,
        "raw_material_id": part.raw_material_id,
        "raw_material_unit_id": part.raw_material_unit_id,
        "required_length": part.required_length,
        "part_detail": part.part_detail,
        "assembly_id": part.assembly_id,
        "product_id": part.product_id,
        "user_id": part.user_id,
        "qty": part.qty,
        "size": part.size,
        "vendor_id": part.vendor_id,
        "recycle_bin": part.recycle_bin,
        "type_name": type_map.get(part.type_id),
        "raw_material_name": rm_map.get(part.raw_material_id),
        "user_name": user_map.get(part.user_id) if part.user_id else None,
        "vendor_name": vendor_map.get(part.vendor_id) if part.vendor_id else None,
        "product_name": product_name,
        "assembly_name": assembly_name,
        "sale_order_number": sale_order_number,
        "project_name": project_name,
        "created_at": part.created_at,
        "updated_at": part.updated_at,
    }


@router.get("/parts")
def get_recycle_bin_parts(
    user_id: Optional[int] = None,
    admin_id: Optional[int] = None,
    project_coordinator_id: Optional[int] = None,
    manufacturing_coordinator_id: Optional[int] = None,
    order_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all parts and assemblies in the recycle bin with optional user filtering"""
    # Build query for parts
    parts_query = db.query(PartModel).filter(PartModel.recycle_bin == True)
    
    # Join with Order to filter parts by user associations
    if user_id is not None or admin_id is not None or project_coordinator_id is not None or manufacturing_coordinator_id is not None or order_id is not None:
        parts_query = parts_query.join(OrderModel, PartModel.product_id == OrderModel.product_id, isouter=True)
        
        if user_id is not None:
            parts_query = parts_query.filter(OrderModel.user_id == user_id)
        if admin_id is not None:
            parts_query = parts_query.filter(OrderModel.admin_id == admin_id)
        if project_coordinator_id is not None:
            parts_query = parts_query.filter(OrderModel.project_coordinator_id == project_coordinator_id)
        if manufacturing_coordinator_id is not None:
            parts_query = parts_query.filter(OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id)
        if order_id is not None:
            parts_query = parts_query.filter(OrderModel.id == order_id)
    
    parts = parts_query.all()
    type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map = _build_part_maps(db)
    parts_data = [_part_to_dict(part, type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map) for part in parts]
    
    # Build query for assemblies
    # Include assemblies that are in recycle bin OR have parts in recycle bin
    assemblies_query = db.query(AssemblyModel).filter(
        (AssemblyModel.recycle_bin == True) | 
        (AssemblyModel.id.in_([part.assembly_id for part in parts if part.assembly_id]))
    )
    
    # Join with Order to filter assemblies by user associations
    if user_id is not None or admin_id is not None or project_coordinator_id is not None or manufacturing_coordinator_id is not None or order_id is not None:
        assemblies_query = assemblies_query.join(OrderModel, AssemblyModel.product_id == OrderModel.product_id, isouter=True)
        
        if user_id is not None:
            assemblies_query = assemblies_query.filter(OrderModel.user_id == user_id)
        if admin_id is not None:
            assemblies_query = assemblies_query.filter(OrderModel.admin_id == admin_id)
        if project_coordinator_id is not None:
            assemblies_query = assemblies_query.filter(OrderModel.project_coordinator_id == project_coordinator_id)
        if manufacturing_coordinator_id is not None:
            assemblies_query = assemblies_query.filter(OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id)
        if order_id is not None:
            assemblies_query = assemblies_query.filter(OrderModel.id == order_id)
    
    assemblies = assemblies_query.all()
    product_map_asm, parent_assembly_map, user_map_asm = _build_assembly_maps(db)
    
    # Build hierarchical assembly structure with parts
    assemblies_data = _build_hierarchical_assemblies(assemblies, db, product_map_asm, parent_assembly_map, user_map_asm, parts)
    
    # If order_id is provided, return order info
    order_info = None
    if order_id is not None:
        order = db.query(OrderModel).filter(OrderModel.id == order_id).first()
        if order:
            order_info = {
                "id": order.id,
                "sale_order_number": order.sale_order_number,
                "product_id": order.product_id,
                "product_name": product_map.get(order.product_id) if order.product_id else None
            }
    
    return {
        "parts": parts_data,
        "assemblies": assemblies_data,
        "order_info": order_info
    }


@router.post("/parts/{part_id}/soft-delete")
def soft_delete_part(part_id: int, db: Session = Depends(get_db)):
    """Soft delete a part by setting recycle_bin=True"""
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
            detail="Sorry, this part cannot be deleted because it is currently scheduled for production. To delete this part, please inactivate the part's schedule status first."
        )

    part.recycle_bin = True
    db.commit()
    db.refresh(part)

    # Log part soft-delete for PC notifications
    user_name = None
    user_role = None
    if part.user_id:
        user = db.query(AccessUser).filter(AccessUser.id == part.user_id).first()
        user_name = user.user_name if user else None
        user_role = user.role if user else None
    
    NotificationService.log_part_change(
        db=db,
        part_id=part.id,
        action="soft_deleted",
        user_id=part.user_id,
        user_name=user_name,
        user_role=user_role,
        details={"part_name": part.part_name, "part_number": part.part_number}
    )

    type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map = _build_part_maps(db)
    return _part_to_dict(part, type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map)


@router.post("/parts/{part_id}/restore")
def restore_part(part_id: int, db: Session = Depends(get_db)):
    """Restore a part from recycle bin by setting recycle_bin=False"""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    part.recycle_bin = False
    db.commit()
    db.refresh(part)

    # Log part restore for PC notifications
    user_name = None
    user_role = None
    if part.user_id:
        user = db.query(AccessUser).filter(AccessUser.id == part.user_id).first()
        user_name = user.user_name if user else None
        user_role = user.role if user else None
    
    NotificationService.log_part_change(
        db=db,
        part_id=part.id,
        action="restored",
        user_id=part.user_id,
        user_name=user_name,
        user_role=user_role,
        details={"part_name": part.part_name, "part_number": part.part_number}
    )

    # Check if parent assembly should be removed from recycle bin
    if part.assembly_id:
        _check_and_update_assembly_recycle_bin_status(part.assembly_id, db)

    type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map = _build_part_maps(db)
    return _part_to_dict(part, type_map, rm_map, user_map, vendor_map, product_map, assembly_map, order_map)


@router.delete("/parts/{part_id}/permanent-delete")
def permanent_delete_part(part_id: int, db: Session = Depends(get_db)):
    """Permanently delete a part from recycle bin (cascade delete)"""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    if not part.recycle_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part with id {part_id} is not in recycle bin. Use soft delete first."
        )

    # Store assembly_id before deletion for later use
    assembly_id = part.assembly_id

    # Log part permanent delete for PC notifications before deletion
    user_name = None
    user_role = None
    if part.user_id:
        user = db.query(AccessUser).filter(AccessUser.id == part.user_id).first()
        user_name = user.user_name if user else None
        user_role = user.role if user else None

    NotificationService.log_part_change(
        db=db,
        part_id=part.id,
        action="deleted",
        user_id=part.user_id,
        user_name=user_name,
        user_role=user_role,
        details={"part_name": part.part_name, "part_number": part.part_number, "permanent": True}
    )
    
    try:
        # 1. Delete pokayoke logs for this part
        result = db.execute(
            text("SELECT id FROM configuration.pokayoke_completed_logs WHERE part_id = :pid"),
            {"pid": part_id}
        )
        log_ids = [row[0] for row in result]
        for log_id in log_ids:
            log_obj = db.query(PokayokeCompletedLog).filter(PokayokeCompletedLog.id == log_id).first()
            if log_obj:
                db.delete(log_obj)
        db.flush()

        # 2. Delete from scheduling.part_schedule_status
        db.execute(
            text("DELETE FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 3. Delete order part priorities
        db.query(OrderPartPriorityModel).filter(OrderPartPriorityModel.part_id == part_id).delete(
            synchronize_session=False
        )

        # 4. Delete operations and their documents/tools
        operations = db.query(OperationModel).filter(OperationModel.part_id == part_id).all()
        operation_ids = [op.id for op in operations]
        if operation_ids:
            # Delete from production_monitoring.machine_live_history
            db.execute(
                text("DELETE FROM production_monitoring.machine_live_history WHERE current_operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            # Delete from production_monitoring.machine_live_status
            db.execute(
                text("DELETE FROM production_monitoring.machine_live_status WHERE current_operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            # Delete from scheduling.production_logs
            db.execute(
                text("DELETE FROM scheduling.production_logs WHERE operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            # Delete from scheduling.rescheduling_items (by operation_id)
            db.execute(
                text("DELETE FROM scheduling.rescheduling_items WHERE operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            # Delete from scheduling.planned_schedule_items
            db.execute(
                text("DELETE FROM scheduling.planned_schedule_items WHERE operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            db.query(OperationDocumentModel).filter(
                OperationDocumentModel.operation_id.in_(operation_ids)
            ).delete(synchronize_session=False)
            
            db.query(ToolWithPartModel).filter(
                ToolWithPartModel.operation_id.in_(operation_ids)
            ).delete(synchronize_session=False)
            
            db.query(OperationModel).filter(OperationModel.id.in_(operation_ids)).delete(
                synchronize_session=False
            )

        # 5. Delete part documents and their extracted data (must delete extracted data FIRST)
        # First delete extracted data that references these documents
        documents = db.query(DocumentModel).filter(DocumentModel.part_id == part_id).all()
        if documents:
            doc_ids = [d.id for d in documents]
            db.query(DocumentExtractedDataModel).filter(
                DocumentExtractedDataModel.document_id.in_(doc_ids)
            ).delete(synchronize_session=False)

        # Now delete the documents
        db.query(DocumentModel).filter(DocumentModel.part_id == part_id).delete(
            synchronize_session=False
        )

        # 6. Delete out source part status records
        db.query(OutSourcePartStatusModel).filter(
            OutSourcePartStatusModel.part_id == part_id
        ).delete(synchronize_session=False)

        # 7. Delete from maintenance.component_issues
        db.execute(
            text("DELETE FROM maintenance.component_issues WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 8. Delete from maintenance.help_support
        db.execute(
            text("DELETE FROM maintenance.help_support WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 9. Delete tools with part (not associated with operations)
        db.query(ToolWithPartModel).filter(ToolWithPartModel.part_id == part_id).delete(
            synchronize_session=False
        )

        # 10. Delete inventory requests and return requests
        db.execute(
            text("DELETE FROM inventory.inventory_return_requests WHERE requested_id IN (SELECT id FROM inventory.inventory_requests WHERE part_id = :pid)"),
            {"pid": part_id}
        )
        db.execute(
            text("DELETE FROM inventory.inventory_requests WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 11. Deallocate raw material if this part has any allocated (RESTORE STOCK) - MUST DO BEFORE DELETING USAGE
        stock_id_to_update = None
        if part.raw_material_unit_id:
            try:
                unit = db.query(RawMaterialUnit).filter(RawMaterialUnit.id == part.raw_material_unit_id).first()
                if unit:
                    stock_id_to_update = unit.stock_id
                    usage = db.query(RawMaterialUsage).filter(
                        RawMaterialUsage.raw_material_unit_id == part.raw_material_unit_id,
                        RawMaterialUsage.part_id == part_id
                    ).first()
                    if usage:
                        # RESTORE: Add back the used length to unit's remaining length
                        unit.remaining_length += usage.used_length
                        
                        # Update unit status based on restored length
                        if unit.remaining_length == unit.total_length:
                            unit.status = "available"
                        elif unit.remaining_length > 0:
                            unit.status = "partially_used"
                        
                        # Delete the usage record NOW (after restoration)
                        db.delete(usage)
            except Exception as e:
                print(f"Warning: Could not deallocate raw material: {e}")

        # 12. Delete from notifications.inspection_notifications (by part_number)
        if part.part_number:
            db.execute(
                text("DELETE FROM notifications.inspection_notifications WHERE part_number = :pnum"),
                {"pnum": part.part_number}
            )

        # 13. Delete from quality.inspection_plan_status (by part_number)
        if part.part_number:
            db.execute(
                text("DELETE FROM quality.inspection_plan_status WHERE part_number = :pnum"),
                {"pnum": part.part_number}
            )

        # 14. Delete from quality.master_boc (part_id is character varying)
        db.execute(
            text("DELETE FROM quality.master_boc WHERE part_id = :pid"),
            {"pid": str(part_id)}
        )

        # 15. Delete from quality.notes
        db.execute(
            text("DELETE FROM quality.notes WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 16. Delete from quality.stage_inspection
        db.execute(
            text("DELETE FROM quality.stage_inspection WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 17. Delete from scheduling.machine_schedule
        db.execute(
            text("DELETE FROM scheduling.machine_schedule WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 18. Delete from scheduling.operation_status
        db.execute(
            text("DELETE FROM scheduling.operation_status WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 19. Delete from scheduling.rescheduling_items (by part_id and part_number)
        db.execute(
            text("DELETE FROM scheduling.rescheduling_items WHERE part_id = :pid"),
            {"pid": part_id}
        )
        if part.part_number:
            db.execute(
                text("DELETE FROM scheduling.rescheduling_items WHERE part_number = :pnum"),
                {"pnum": part.part_number}
            )

        # Finally, delete the part itself
        db.delete(part)
        db.commit()

        # Update stock status based on unit statuses after part deletion
        if stock_id_to_update:
            StockAutoUpdateService.update_stock_status_from_units(db, stock_id_to_update)

        # Check if parent assembly should be removed from recycle bin
        if assembly_id:
            _check_and_update_assembly_recycle_bin_status(assembly_id, db)

        return {"message": f"Part with id {part_id} permanently deleted"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error permanently deleting part: {str(e)}"
        )


# =======================
# Assembly Recycle Bin Endpoints
# =======================

@router.post("/assemblies/{assembly_id}/soft-delete")
def soft_delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Soft delete an assembly by setting recycle_bin=True and moving all its parts to recycle bin"""
    assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    # Check if any parts in this assembly or sub-assemblies have active schedule status
    def get_all_assembly_ids(parent_id):
        """Recursively get all assembly IDs including sub-assemblies"""
        assembly_ids = [parent_id]
        sub_assemblies = db.query(AssemblyModel).filter(AssemblyModel.parent_id == parent_id).all()
        for sub_asm in sub_assemblies:
            assembly_ids.extend(get_all_assembly_ids(sub_asm.id))
        return assembly_ids

    all_assembly_ids = get_all_assembly_ids(assembly_id)
    
    # Check for active parts in all assemblies
    active_parts = db.execute(
        text("""
            SELECT p.id, p.part_name 
            FROM oms.parts p
            JOIN scheduling.part_schedule_status pss ON p.id = pss.part_id
            WHERE p.assembly_id IN :assembly_ids AND pss.status = 'active'
        """),
        {"assembly_ids": tuple(all_assembly_ids)}
    ).fetchall()
    
    if active_parts:
        part_names = [row[1] for row in active_parts]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Sorry, this assembly cannot be deleted because the following parts are currently scheduled for production: {', '.join(part_names)}. To delete this assembly, please inactivate the schedule status of these parts first."
        )

    # Set assembly to recycle bin
    assembly.recycle_bin = True
    
    # Move all parts in this assembly to recycle bin (even if some are already there)
    parts = db.query(PartModel).filter(PartModel.assembly_id == assembly_id).all()
    for part in parts:
        part.recycle_bin = True
    
    # Also move all sub-assemblies and their parts to recycle bin
    def cascade_delete_sub_assemblies(parent_id):
        sub_assemblies = db.query(AssemblyModel).filter(AssemblyModel.parent_id == parent_id).all()
        for sub_asm in sub_assemblies:
            sub_asm.recycle_bin = True
            # Move parts in sub-assembly to recycle bin
            sub_parts = db.query(PartModel).filter(PartModel.assembly_id == sub_asm.id).all()
            for sub_part in sub_parts:
                sub_part.recycle_bin = True
            # Recursively process nested sub-assemblies
            cascade_delete_sub_assemblies(sub_asm.id)
    
    cascade_delete_sub_assemblies(assembly_id)
    
    db.commit()
    db.refresh(assembly)

    product_map, parent_assembly_map, user_map = _build_assembly_maps(db)
    return _assembly_to_dict(assembly, product_map, parent_assembly_map, user_map, db)


@router.post("/assemblies/{assembly_id}/restore")
def restore_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Restore an assembly from recycle bin by setting recycle_bin=False and restore all its parts"""
    assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    # Check if parent assembly is in recycle bin and block restore
    if assembly.parent_id:
        parent_assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly.parent_id).first()
        if parent_assembly and parent_assembly.recycle_bin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot restore sub-assembly '{assembly.assembly_name}' because its parent assembly '{parent_assembly.assembly_name}' is still in the recycle bin. Please restore the parent assembly first."
            )

    # Restore the assembly
    assembly.recycle_bin = False

    # Restore all parts in this assembly
    parts = db.query(PartModel).filter(PartModel.assembly_id == assembly_id).all()
    for part in parts:
        part.recycle_bin = False

    # Restore all child assemblies and their parts
    def restore_child_assemblies(parent_id):
        child_assemblies = db.query(AssemblyModel).filter(
            AssemblyModel.parent_id == parent_id,
            AssemblyModel.recycle_bin == True
        ).all()
        for child_asm in child_assemblies:
            child_asm.recycle_bin = False
            # Restore parts in child-assembly
            child_parts = db.query(PartModel).filter(PartModel.assembly_id == child_asm.id).all()
            for child_part in child_parts:
                child_part.recycle_bin = False
            # Recursively process nested child-assemblies
            restore_child_assemblies(child_asm.id)

    restore_child_assemblies(assembly_id)

    db.commit()
    db.refresh(assembly)

    # Check if parent assembly should be removed from recycle bin
    if assembly.parent_id:
        _check_and_update_assembly_recycle_bin_status(assembly.parent_id, db)

    product_map, parent_assembly_map, user_map = _build_assembly_maps(db)
    return _assembly_to_dict(assembly, product_map, parent_assembly_map, user_map, db)


@router.delete("/assemblies/{assembly_id}/permanent-delete")
def permanent_delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Permanently delete an assembly from recycle bin (cascade delete)"""
    assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    if not assembly.recycle_bin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Assembly with id {assembly_id} is not in recycle bin. Use soft delete first."
        )

    # Store parent_id before deletion for later use
    parent_id = assembly.parent_id

    # Cascade delete will handle parts, documents, sub-assemblies, etc.
    db.delete(assembly)
    db.commit()

    # Check if parent assembly should be removed from recycle bin
    if parent_id:
        _check_and_update_assembly_recycle_bin_status(parent_id, db)

    return {"message": f"Assembly with id {assembly_id} permanently deleted"}
