from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text
from typing import List

from DB.database import get_db
from DB.models.oms import (
    Assembly as AssemblyModel,
    Part as PartModel,
    Operation as OperationModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    OrderPartPriority as OrderPartPriorityModel,
    Order as OrderModel,
    OperationDocument as OperationDocumentModel,
    OutSourcePartStatus as OutSourcePartStatusModel,
)
from DB.models.configuration import PokayokeCompletedLog
from DB.schemas.oms import Assembly, AssemblyCreate, AssemblyUpdate

router = APIRouter(
    prefix="/assemblies",
    tags=["assemblies"]
)


@router.post("/", response_model=Assembly, status_code=status.HTTP_201_CREATED)
def create_assembly(assembly: AssemblyCreate, db: Session = Depends(get_db)):
    """Create a new assembly (user_id = project_coordinator, admin, or manufacturing_coordinator)."""
    db_assembly = AssemblyModel(**assembly.model_dump())
    db.add(db_assembly)
    db.commit()
    db.refresh(db_assembly)
    # Reload with user for user_name in response
    db_assembly = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .filter(AssemblyModel.id == db_assembly.id)
        .first()
    )
    return db_assembly


@router.get("/", response_model=List[Assembly])
def get_assemblies(user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all assemblies with user_name. Filter by user_id for module-specific views."""
    query = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .order_by(AssemblyModel.id.asc())
    )
    if user_id is not None:
        query = query.filter(AssemblyModel.user_id == user_id)
    return query.all()


@router.get("/{assembly_id}", response_model=Assembly)
def get_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Get a specific assembly by ID with user_name."""
    assembly = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .filter(AssemblyModel.id == assembly_id)
        .first()
    )
    if not assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )
    return assembly


@router.get("/product/{product_id}", response_model=List[Assembly])
def get_assemblies_by_product(product_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all assemblies for a specific product with user_name. Filter by user_id for module-specific views."""
    query = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .filter(AssemblyModel.product_id == product_id)
    )
    if user_id is not None:
        query = query.filter(AssemblyModel.user_id == user_id)
    return query.all()


@router.get("/parent/{parent_id}", response_model=List[Assembly])
def get_child_assemblies(parent_id: int, user_id: int | None = None, db: Session = Depends(get_db)):
    """Get all child assemblies for a parent assembly with user_name. Filter by user_id for module-specific views."""
    query = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .filter(AssemblyModel.parent_id == parent_id)
    )
    if user_id is not None:
        query = query.filter(AssemblyModel.user_id == user_id)
    return query.all()


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
    db_assembly = (
        db.query(AssemblyModel)
        .options(joinedload(AssemblyModel.user))
        .filter(AssemblyModel.id == assembly_id)
        .first()
    )
    return db_assembly


@router.delete("/{assembly_id}")
def delete_assembly(assembly_id: int, db: Session = Depends(get_db)):
    """Soft delete an assembly by moving it to recycle bin (parts will also be moved to recycle bin)"""
    db_assembly = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id).first()
    if not db_assembly:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Assembly with id {assembly_id} not found"
        )

    # Use soft delete via recycle bin router logic
    db_assembly.recycle_bin = True
    
    # Move all parts in this assembly to recycle bin
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
    return None
