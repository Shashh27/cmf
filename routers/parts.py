from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, text

from DB.database import get_db
from DB.models.oms import (
    Part as PartModel, 
    PartType, 
    Order, 
    OrderPartPriority,
    Operation as OperationModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    OrderPartsRawMaterialLinked as OrderPartsRawMaterialLinkedModel,
    OperationDocument as OperationDocumentModel,
    OutSourcePartStatus as OutSourcePartStatusModel,
)
from DB.models.configuration import PokayokeCompletedLog
from DB.models.inventory import RawMaterial
from DB.models.access_control import AccessUser
from DB.schemas.oms import Part, PartCreate, PartUpdate

router = APIRouter(
    prefix="/parts",
    tags=["parts"]
)


def _build_part_maps(db: Session):
    """Fetch PartType, RawMaterial, and AccessUser rows once and return id→value maps."""
    type_map = {pt.id: pt.type_name for pt in db.query(PartType).all()}
    rm_map = {rm.id: rm.material_name for rm in db.query(RawMaterial).all()}
    user_map = {u.id: u.user_name for u in db.query(AccessUser).all()}
    return type_map, rm_map, user_map


def _part_to_dict(part: PartModel, type_map: dict, rm_map: dict, user_map: dict) -> dict:
    return {
        "id": part.id,
        "part_name": part.part_name,
        "part_number": part.part_number,
        "type_id": part.type_id,
        "raw_material_id": part.raw_material_id,
        "part_detail": part.part_detail,
        "assembly_id": part.assembly_id,
        "product_id": part.product_id,
        "user_id": part.user_id,
        "type_name": type_map.get(part.type_id),
        "raw_material_name": rm_map.get(part.raw_material_id),
        "user_name": user_map.get(part.user_id) if part.user_id else None,
        "created_at": part.created_at,
        "updated_at": part.updated_at,
    }


@router.post("/", response_model=Part, status_code=status.HTTP_201_CREATED)
def create_part(part: PartCreate, db: Session = Depends(get_db)):
    """Create a new part"""
    db_part = db.query(PartModel).filter(PartModel.part_number == part.part_number).first()
    if db_part:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Part with number {part.part_number} already exists"
        )

    db_part = PartModel(**part.model_dump())
    db.add(db_part)
    db.commit()
    db.refresh(db_part)

    # Automatic OrderPartPriority creation disabled
    # if db_part.product_id and db_part.type_id:
    #     part_type = db.query(PartType).filter(PartType.id == db_part.type_id).first()
    #     if part_type and part_type.type_name and part_type.type_name.lower() == "in-house":
    #         orders = db.query(Order).filter(Order.product_id == db_part.product_id).all()
    #         max_priority = db.query(func.max(OrderPartPriority.priority)).scalar() or 0
    #         for index, order in enumerate(orders):
    #             priority_entry = OrderPartPriority(
    #                 order_id=order.id,
    #                 product_id=db_part.product_id,
    #                 part_id=db_part.id,
    #                 priority=max_priority + 1 + index,
    #             )
    #             db.add(priority_entry)
    #         db.commit()

    type_map, rm_map, user_map = _build_part_maps(db)
    return _part_to_dict(db_part, type_map, rm_map, user_map)


@router.get("/", response_model=List[Part])
def get_parts(user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all parts with type, raw material, and user names. Filter by user_id for module-specific views."""
    query = db.query(PartModel).order_by(PartModel.id.asc())
    if user_id is not None:
        query = query.filter(PartModel.user_id == user_id)
    parts = query.all()
    type_map, rm_map, user_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map, user_map) for p in parts]


@router.get("/{part_id}", response_model=Part)
def get_part(part_id: int, db: Session = Depends(get_db)):
    """Get a specific part by ID with type, raw_material, and user names."""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )
    type_map, rm_map, user_map = _build_part_maps(db)
    return _part_to_dict(part, type_map, rm_map, user_map)


@router.get("/product/{product_id}", response_model=List[Part])
def get_parts_by_product(product_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all parts for a specific product. Filter by user_id for module-specific views."""
    query = db.query(PartModel).filter(PartModel.product_id == product_id)
    if user_id is not None:
        query = query.filter(PartModel.user_id == user_id)
    parts = query.all()
    type_map, rm_map, user_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map, user_map) for p in parts]


@router.get("/assembly/{assembly_id}", response_model=List[Part])
def get_parts_by_assembly(assembly_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all parts for a specific assembly. Filter by user_id for module-specific views."""
    query = db.query(PartModel).filter(PartModel.assembly_id == assembly_id)
    if user_id is not None:
        query = query.filter(PartModel.user_id == user_id)
    parts = query.all()
    type_map, rm_map, user_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map, user_map) for p in parts]


@router.get("/type/{type_id}", response_model=List[Part])
def get_parts_by_type(type_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all parts of a specific type. Filter by user_id for module-specific views."""
    query = db.query(PartModel).filter(PartModel.type_id == type_id)
    if user_id is not None:
        query = query.filter(PartModel.user_id == user_id)
    parts = query.all()
    type_map, rm_map, user_map = _build_part_maps(db)
    return [_part_to_dict(p, type_map, rm_map, user_map) for p in parts]


@router.put("/{part_id}", response_model=Part)
def update_part(part_id: int, part: PartUpdate, db: Session = Depends(get_db)):
    """Update a part"""
    db_part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    update_data = part.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_part, field, value)

    db.commit()
    db.refresh(db_part)
    type_map, rm_map, user_map = _build_part_maps(db)
    return _part_to_dict(db_part, type_map, rm_map, user_map)


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_part(part_id: int, db: Session = Depends(get_db)):
    """Delete a part and all its related data (priorities, pokayoke logs, operations, documents, etc.)."""
    db_part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not db_part:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Part with id {part_id} not found"
        )

    try:
        # 1. Delete pokayoke logs for this part
        result = db.execute(
            text(
                "SELECT id FROM configuration.pokayoke_completed_logs "
                "WHERE part_id = :pid"
            ),
            {"pid": part_id},
        )
        log_ids = [row[0] for row in result]
        for log_id in log_ids:
            log_obj = (
                db.query(PokayokeCompletedLog)
                .filter(PokayokeCompletedLog.id == log_id)
                .first()
            )
            if log_obj:
                db.delete(log_obj)
        db.flush()

        # Delete from scheduling.part_schedule_status to avoid FK violation
        db.execute(
            text("DELETE FROM scheduling.part_schedule_status WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 2. Delete order part priorities
        db.query(OrderPartPriority).filter(OrderPartPriority.part_id == part_id).delete(
            synchronize_session=False
        )

        # 3. Delete operations and their documents/tools
        operations = db.query(OperationModel).filter(OperationModel.part_id == part_id).all()
        operation_ids = [op.id for op in operations]
        if operation_ids:
            # Delete from scheduling.planned_schedule_items to avoid FK violation
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

        # 4. Delete part documents
        db.query(DocumentModel).filter(DocumentModel.part_id == part_id).delete(
            synchronize_session=False
        )

        # 5. Delete out source part status records
        db.query(OutSourcePartStatusModel).filter(
            OutSourcePartStatusModel.part_id == part_id
        ).delete(synchronize_session=False)

        # 6. Delete raw material links
        db.query(OrderPartsRawMaterialLinkedModel).filter(
            OrderPartsRawMaterialLinkedModel.part_id == part_id
        ).delete(synchronize_session=False)

        # 7. Delete component_issues records that reference this part
        db.execute(
            text("DELETE FROM maintenance.component_issues WHERE part_id = :pid"),
            {"pid": part_id}
        )

        # 8. Delete tools with part (that are not associated with operations)
        db.query(ToolWithPartModel).filter(ToolWithPartModel.part_id == part_id).delete(
            synchronize_session=False
        )

        # Finally, delete the part itself
        db.delete(db_part)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting part: {str(e)}"
        )
    return None
