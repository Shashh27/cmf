from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.oms import (
    Assembly as AssemblyModel,
    Part as PartModel,
    Operation as OperationModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    OrderPartsRawMaterialLinked as OrderPartsRawMaterialLinkedModel,
    OrderPartPriority as OrderPartPriorityModel,
    Order as OrderModel,
    OperationDocument as OperationDocumentModel,
)
from DB.schemas.oms import Assembly, AssemblyCreate, AssemblyUpdate

router = APIRouter(
    prefix="/assemblies",
    tags=["assemblies"]
)


@router.post("/", response_model=Assembly, status_code=status.HTTP_201_CREATED)
def create_assembly(assembly: AssemblyCreate, db: Session = Depends(get_db)):
    """Create a new assembly"""
    db_assembly = AssemblyModel(**assembly.model_dump())
    db.add(db_assembly)
    db.commit()
    db.refresh(db_assembly)
    return db_assembly


@router.get("/", response_model=List[Assembly])
def get_assemblies(db: Session = Depends(get_db)):
    """Get all assemblies"""
    return db.query(AssemblyModel).order_by(AssemblyModel.id.asc()).all()


@router.get("/{assembly_id}", response_model=Assembly)
def get_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Get a specific assembly by ID"""
    assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )
    return assembly


@router.get("/product/{product_id}", response_model=List[Assembly])
def get_assemblies_by_product(product_id: int, db: Session = Depends(get_db)):
    """Get all assemblies for a specific product"""
    assemblies = db.query(AssemblyModel).filter(AssemblyModel.product_id == product_id).all()
    return assemblies


@router.get("/parent/{parent_id}", response_model=List[Assembly])
def get_child_assemblies(parent_id: int, db: Session = Depends(get_db)):
    """Get all child assemblies for a parent assembly"""
    assemblies = db.query(AssemblyModel).filter(AssemblyModel.parent_id == parent_id).all()
    return assemblies


@router.put("/{assembly_id}", response_model=Assembly)
def update_assembly(assembly_id: int, assembly: AssemblyUpdate, db: Session = Depends(get_db)):
    """Update an assembly"""
    db_assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not db_assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    update_data = assembly.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_assembly, field, value)

    db.commit()
    db.refresh(db_assembly)
    return db_assembly


@router.delete("/{assembly_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Delete an assembly and all its parts and sub-assemblies (recursive cascade deletion)"""
    db_assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not db_assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    assembly_ids: list[int] = []

    def collect_assembly_ids(assembly_id_to_collect: int) -> None:
        assembly_ids.append(assembly_id_to_collect)
        child_assemblies = (
            db.query(AssemblyModel)
            .filter(AssemblyModel.parent_id == assembly_id_to_collect)
            .all()
        )
        for child in child_assemblies:
            collect_assembly_ids(child.id)

    collect_assembly_ids(assembly_id)

    parts_under_assemblies = []
    if assembly_ids:
        parts_under_assemblies = (
            db.query(PartModel)
            .filter(PartModel.assembly_id.in_(assembly_ids))
            .all()
        )
    part_ids = [p.id for p in parts_under_assemblies]

    if part_ids:
        linked_priorities = (
            db.query(OrderPartPriorityModel)
            .filter(OrderPartPriorityModel.part_id.in_(part_ids))
            .all()
        )
        if linked_priorities:
            order_ids = {p.order_id for p in linked_priorities}
            orders = db.query(OrderModel).filter(OrderModel.id.in_(order_ids)).all()
            order_numbers = [o.sale_order_number for o in orders]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "This assembly cannot be deleted because its parts are linked to "
                    f"orders: {', '.join(order_numbers)}. Please delete or update the "
                    "related orders first."
                ),
            )

    if part_ids:
        operations = (
            db.query(OperationModel)
            .filter(OperationModel.part_id.in_(part_ids))
            .all()
        )
        operation_ids = [op.id for op in operations]

        if operation_ids:
            db.query(OperationDocumentModel).filter(
                OperationDocumentModel.operation_id.in_(operation_ids)
            ).delete(synchronize_session=False)

        if operation_ids:
            db.query(OperationModel).filter(
                OperationModel.id.in_(operation_ids)
            ).delete(synchronize_session=False)

        db.query(DocumentModel).filter(
            DocumentModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)

        db.query(ToolWithPartModel).filter(
            ToolWithPartModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)

        db.query(OrderPartsRawMaterialLinkedModel).filter(
            OrderPartsRawMaterialLinkedModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)

        db.query(PartModel).filter(PartModel.id.in_(part_ids)).delete(
            synchronize_session=False
        )

    def delete_assembly_recursive(assembly_id_to_delete: int) -> None:
        child_assemblies = (
            db.query(AssemblyModel)
            .filter(AssemblyModel.parent_id == assembly_id_to_delete)
            .all()
        )
        for child_assembly in child_assemblies:
            delete_assembly_recursive(child_assembly.id)

        assembly_to_delete = (
            db.query(AssemblyModel)
            .filter(AssemblyModel.id == assembly_id_to_delete)
            .first()
        )
        if assembly_to_delete:
            db.delete(assembly_to_delete)

    delete_assembly_recursive(assembly_id)

    db.commit()
    return None
