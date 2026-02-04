from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import Assembly as AssemblyModel, Part as PartModel
from DB.schemas import Assembly, AssemblyCreate, AssemblyUpdate

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
def get_assemblies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all assemblies with pagination"""
    assemblies = db.query(AssemblyModel).offset(skip).limit(limit).all()
    return assemblies


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

    def delete_assembly_recursive(assembly_id_to_delete):
        """Recursively delete assembly and all its children"""
        # First, find all child assemblies
        child_assemblies = db.query(AssemblyModel).filter(AssemblyModel.parent_id == assembly_id_to_delete).all()
        
        # Recursively delete all child assemblies
        for child_assembly in child_assemblies:
            delete_assembly_recursive(child_assembly.id)
        
        # Delete all parts that belong to this assembly
        parts_under_assembly = db.query(PartModel).filter(PartModel.assembly_id == assembly_id_to_delete).all()
        for part in parts_under_assembly:
            db.delete(part)
        
        # Delete the assembly itself
        assembly_to_delete = db.query(AssemblyModel).filter(AssemblyModel.id == assembly_id_to_delete).first()
        if assembly_to_delete:
            db.delete(assembly_to_delete)
    
    # Start the recursive deletion
    delete_assembly_recursive(assembly_id)
    
    db.commit()
    return None