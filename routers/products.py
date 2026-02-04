from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models import (
    Product as ProductModel, 
    Assembly as AssemblyModel, 
    Part as PartModel,
    Operation as OperationModel,
    ProcessPlan as ProcessPlanModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    PartType as PartTypeModel
)
from DB.schemas import Product, ProductCreate, ProductUpdate, ProductHierarchicalData, PartDetails, AssemblyDetails, Part as PartSchema

router = APIRouter(
    prefix="/products",
    tags=["products"]
)


@router.post("/", response_model=Product, status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product"""
    db_product = db.query(ProductModel).filter(ProductModel.product_number == product.product_number).first()
    if db_product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product with number {product.product_number} already exists"
        )

    db_product = ProductModel(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.get("/", response_model=List[Product])
def get_products(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all products with pagination"""
    products = db.query(ProductModel).offset(skip).limit(limit).all()
    return products


@router.get("/{product_id}", response_model=Product)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Get a specific product by ID"""
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )
    return product


@router.put("/{product_id}", response_model=Product)
def update_product(product_id: int, product: ProductUpdate, db: Session = Depends(get_db)):
    """Update a product"""
    db_product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not db_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    update_data = product.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_product, field, value)

    db.commit()
    db.refresh(db_product)
    return db_product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Delete a product and all its assemblies and parts (recursive cascade deletion)"""
    db_product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not db_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
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

    # First, delete all parts that belong to this product directly
    parts_direct = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    for part in parts_direct:
        db.delete(part)
    
    # Then, delete all assemblies that belong to this product (recursively)
    root_assemblies = db.query(AssemblyModel).filter(AssemblyModel.product_id == product_id).all()
    for assembly in root_assemblies:
        delete_assembly_recursive(assembly.id)
    
    # Finally, delete the product
    db.delete(db_product)
    db.commit()
    return None


@router.get("/{product_id}/hierarchical", response_model=ProductHierarchicalData)
def get_product_hierarchical_data(product_id: int, db: Session = Depends(get_db)):
    """
    Get hierarchical product data with nested structure:
    - Product information
    - Assemblies with nested subassemblies and parts
    - Direct parts (parts not assigned to any assembly)
    - Each part includes its operations, process plans, documents, and tools
    """
    # Get product
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    # Get all assemblies for this product
    all_assemblies = db.query(AssemblyModel).filter(AssemblyModel.product_id == product_id).all()
    
    # Get all parts for this product
    all_parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    
    # Create mappings for easy lookup
    assembly_map = {asm.id: asm for asm in all_assemblies}
    part_map = {part.id: part for part in all_parts}
    
    # Get all related data for parts
    part_ids = list(part_map.keys())
    operations_by_part = {}
    process_plans_by_operation = {}
    documents_by_part = {}
    tools_by_part = {}
    
    if part_ids:
        # Get operations
        operations = db.query(OperationModel).filter(OperationModel.part_id.in_(part_ids)).all()
        for op in operations:
            if op.part_id not in operations_by_part:
                operations_by_part[op.part_id] = []
            operations_by_part[op.part_id].append(op)
        
        # Get process plans
        operation_ids = [op.id for op in operations]
        if operation_ids:
            process_plans = db.query(ProcessPlanModel).filter(ProcessPlanModel.operation_id.in_(operation_ids)).all()
            for pp in process_plans:
                if pp.operation_id not in process_plans_by_operation:
                    process_plans_by_operation[pp.operation_id] = []
                process_plans_by_operation[pp.operation_id].append(pp)
        
        # Get documents
        documents = db.query(DocumentModel).filter(DocumentModel.part_id.in_(part_ids)).all()
        for doc in documents:
            if doc.part_id not in documents_by_part:
                documents_by_part[doc.part_id] = []
            documents_by_part[doc.part_id].append(doc)
        
        # Get tools
        tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.part_id.in_(part_ids)).all()
        for tool in tools:
            if tool.part_id not in tools_by_part:
                tools_by_part[tool.part_id] = []
            tools_by_part[tool.part_id].append(tool)
    
    def create_part_details(part: PartModel) -> PartDetails:
        """Create PartDetails with all related data"""
        part_operations = operations_by_part.get(part.id, [])
        
        # Get process plans for this part's operations
        part_process_plans = []
        for op in part_operations:
            part_process_plans.extend(process_plans_by_operation.get(op.id, []))
        
        # Get the part type
        part_type = db.query(PartTypeModel).filter(PartTypeModel.id == part.type_id).first()
        
        # Create a new Part model with the type_name included
        part_dict = {
            'id': part.id,
            'part_name': part.part_name,
            'part_number': part.part_number,
            'type_id': part.type_id,
            'raw_material_id': part.raw_material_id,
            'assembly_id': part.assembly_id,
            'product_id': part.product_id,
            'type_name': part_type.type_name if part_type else None
        }
        
        part_with_type = PartSchema(**part_dict)
        
        return PartDetails(
            part=part_with_type,
            operations=part_operations,
            process_plans=part_process_plans,
            documents=documents_by_part.get(part.id, []),
            tools=tools_by_part.get(part.id, [])
        )
    
    def build_assembly_hierarchy(assembly_id: int) -> AssemblyDetails:
        """Recursively build assembly hierarchy"""
        assembly = assembly_map[assembly_id]
        
        # Find parts directly belonging to this assembly
        direct_parts = [
            create_part_details(part) 
            for part in all_parts 
            if part.assembly_id == assembly_id
        ]
        
        # Find child assemblies
        child_assemblies = [
            build_assembly_hierarchy(child.id) 
            for child in all_assemblies 
            if child.parent_id == assembly_id
        ]
        
        return AssemblyDetails(
            assembly=assembly,
            parts=direct_parts,
            subassemblies=child_assemblies
        )
    
    # Build root level assemblies (those with no parent)
    root_assemblies = [
        build_assembly_hierarchy(asm.id) 
        for asm in all_assemblies 
        if asm.parent_id is None
    ]
    
    # Get direct parts (parts not assigned to any assembly)
    direct_parts = [
        create_part_details(part) 
        for part in all_parts 
        if part.assembly_id is None
    ]
    
    return ProductHierarchicalData(
        product=product,
        assemblies=root_assemblies,
        direct_parts=direct_parts
    )