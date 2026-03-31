from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, or_
from typing import List

from DB.database import get_db
from DB.models.oms import (
    Product as ProductModel,
    Assembly as AssemblyModel,
    Part as PartModel,
    Operation as OperationModel,
    Document as DocumentModel,
    ToolWithPart as ToolWithPartModel,
    PartType as PartTypeModel,
    Order as OrderModel,
    OperationDocument as OperationDocumentModel,
    OrderPartsRawMaterialLinked as OrderPartsRawMaterialLinkedModel,
    DocumentExtractedData as DocumentExtractedDataModel,
    OrderPartPriority as OrderPartPriorityModel,
    OutSourcePartStatus as OutSourcePartStatusModel,
)
from DB.models.configuration import (
    WorkCenter as WorkCenterModel,
    Machine as MachineModel,
    PokayokeCompletedLog,
)
from DB.models.inventory import RawMaterial as RawMaterialModel, InventoryRequest, InventoryReturnRequest
from DB.models.access_control import AccessUser as AccessUserModel
from DB.schemas.oms import (
    Product,
    ProductCreate,
    ProductUpdate,
    ProductHierarchicalData,
    PartDetails,
    AssemblyDetails,
    Part as PartSchema,
    Operation as OperationSchema,
    Document as DocumentSchema,
    DocumentExtractedData as DocumentExtractedDataSchema,
)
from DB.minio_client import get_minio_client

router = APIRouter(
    prefix="/products",
    tags=["products"]
)


# Roles allowed to create products (manufacturing_coordinator cannot)
PRODUCT_CREATOR_ROLES = ("admin", "project_coordinator")


@router.post("/", response_model=Product, status_code=status.HTTP_201_CREATED)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product. Only admin or project_coordinator can create; manufacturing_coordinator cannot."""
    creator = db.query(AccessUserModel).filter(AccessUserModel.id == product.user_id).first()
    if not creator:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if (creator.role or "").strip().lower() not in PRODUCT_CREATOR_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin or project coordinator can create products. Manufacturing coordinator cannot.",
        )

    db_product = ProductModel(**product.model_dump())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    user = db.query(AccessUserModel).filter(AccessUserModel.id == db_product.user_id).first()
    return {
        "id": db_product.id,
        "product_name": db_product.product_name,
        "product_version": db_product.product_version,
        "user_id": db_product.user_id,
        "user_name": user.user_name if user else None,
        "created_at": db_product.created_at,
        "updated_at": db_product.updated_at,
    }


@router.get("/", response_model=List[Product])
def get_products(user_id: int | None = None, db: Session = Depends(get_db)):
    """
    Get products, with role-aware visibility when user_id is provided.

    Rules:
    - When user_id is omitted: return all products.
    - When user_id is provided:
      * If user is admin:
          - Products they created (Product.user_id == admin.id), AND
          - Products linked to orders where Order.admin_id == admin.id.
      * If user is project_coordinator:
          - Products they created, AND
          - Products linked to orders where Order.project_coordinator_id == PC.id.
      * If user is manufacturing_coordinator:
          - Products linked to orders where Order.manufacturing_coordinator_id == MC.id.
      * Any other role: currently no extra filtering rules; returns products they created only.
    """
    base_query = db.query(ProductModel).options(joinedload(ProductModel.user)).order_by(ProductModel.id.asc())

    if user_id is None:
        products = base_query.all()
    else:
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
        role = (user.role or "").strip().lower() if user and user.role else ""

        product_ids_from_orders: list[int] = []

        if role in {"admin", "project_coordinator", "manufacturing_coordinator"}:
            order_query = db.query(OrderModel.product_id).filter(
                OrderModel.product_id.isnot(None)
            )
            if role == "admin":
                order_query = order_query.filter(OrderModel.admin_id == user_id)
            elif role == "project_coordinator":
                order_query = order_query.filter(OrderModel.project_coordinator_id == user_id)
            elif role == "manufacturing_coordinator":
                order_query = order_query.filter(OrderModel.manufacturing_coordinator_id == user_id)

            product_ids_from_orders = [row[0] for row in order_query.distinct().all()]

        # Build filters based on role
        if role == "admin" or role == "project_coordinator":
            conditions = [ProductModel.user_id == user_id]
            if product_ids_from_orders:
                conditions.append(ProductModel.id.in_(product_ids_from_orders))
            products = base_query.filter(or_(*conditions)).all()
        elif role == "manufacturing_coordinator":
            if product_ids_from_orders:
                products = base_query.filter(ProductModel.id.in_(product_ids_from_orders)).all()
            else:
                products = []
        else:
            # Fallback: only products explicitly created by this user
            products = base_query.filter(ProductModel.user_id == user_id).all()

    return [
        {
            "id": p.id,
            "product_name": p.product_name,
            "product_version": p.product_version,
            "user_id": p.user_id,
            "user_name": (p.user.user_name if getattr(p, "user", None) else None),
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        }
        for p in products
    ]


@router.get("/{product_id}", response_model=Product)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Get a specific product by ID"""
    product = (
        db.query(ProductModel)
        .options(joinedload(ProductModel.user))
        .filter(ProductModel.id == product_id)
        .first()
    )
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )
    return {
        "id": product.id,
        "product_name": product.product_name,
        "product_version": product.product_version,
        "user_id": product.user_id,
        "user_name": (product.user.user_name if getattr(product, "user", None) else None),
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    }


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
    user = db.query(AccessUserModel).filter(AccessUserModel.id == db_product.user_id).first()
    return {
        "id": db_product.id,
        "product_name": db_product.product_name,
        "product_version": db_product.product_version,
        "user_id": db_product.user_id,
        "user_name": user.user_name if user else None,
        "created_at": db_product.created_at,
        "updated_at": db_product.updated_at,
    }


def delete_product_cascade(db: Session, product_id: int) -> None:
    """
    Delete a product and all its related data including MinIO files.
    This includes: documents, operation documents, operations, parts, assemblies, 
    raw material links, priorities, and inventory records.
    """
    db_product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not db_product:
        return

    minio_client = get_minio_client()
    
    # Get all parts for this product
    parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    part_ids = [p.id for p in parts]

    if part_ids:
        # Delete pokayoke logs for parts
        for pid in part_ids:
            result = db.execute(
                text(
                    "SELECT id FROM configuration.pokayoke_completed_logs "
                    "WHERE part_id = :pid"
                ),
                {"pid": pid},
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
            text("DELETE FROM scheduling.part_schedule_status WHERE part_id IN :pids"),
            {"pids": tuple(part_ids)}
        )

        # Get all operations for these parts
        operations = db.query(OperationModel).filter(
            OperationModel.part_id.in_(part_ids)
        ).all()
        operation_ids = [op.id for op in operations]

        # Delete operation documents and their MinIO files
        if operation_ids:
            operation_docs = db.query(OperationDocumentModel).filter(
                OperationDocumentModel.operation_id.in_(operation_ids)
            ).all()
            
            for op_doc in operation_docs:
                # Delete from MinIO
                try:
                    object_name = op_doc.document_url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
                except Exception as e:
                    print(f"Error deleting operation document from MinIO: {e}")
                
                # Delete from database
                db.delete(op_doc)
            
            # Flush to ensure operation documents are deleted before operations
            db.flush()
        
        # Delete tools associated with these operations (must be before deleting operations)
        if operation_ids:
            # Delete from scheduling.planned_schedule_items to avoid FK violation
            db.execute(
                text("DELETE FROM scheduling.planned_schedule_items WHERE operation_id IN :op_ids"),
                {"op_ids": tuple(operation_ids)}
            )

            db.query(ToolWithPartModel).filter(
                ToolWithPartModel.operation_id.in_(operation_ids)
            ).delete(synchronize_session=False)

        # Delete operations
        if operation_ids:
            db.query(OperationModel).filter(OperationModel.id.in_(operation_ids)).delete(
                synchronize_session=False
            )

        # Delete part documents, their extracted data, and MinIO files
        part_docs = db.query(DocumentModel).filter(DocumentModel.part_id.in_(part_ids)).all()
        if part_docs:
            doc_ids = [d.id for d in part_docs]
            # First delete extracted data that references these documents to avoid FK violations
            db.query(DocumentExtractedDataModel).filter(
                DocumentExtractedDataModel.document_id.in_(doc_ids)
            ).delete(synchronize_session=False)

            for part_doc in part_docs:
                # Delete from MinIO
                try:
                    object_name = part_doc.document_url.split(f"/{minio_client.bucket_name}/")[1]
                    minio_client.delete_file(object_name)
                except Exception as e:
                    print(f"Error deleting part document from MinIO: {e}")
                
                # Delete from database
                db.delete(part_doc)
        
            # Flush to ensure part documents are deleted before parts
            db.flush()

        # Delete remaining tools with parts (tools not associated with operations)
        db.query(ToolWithPartModel).filter(ToolWithPartModel.part_id.in_(part_ids)).delete(
            synchronize_session=False
        )

        # Delete part priorities
        db.query(OrderPartPriorityModel).filter(
            OrderPartPriorityModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)

        # Delete out source part status records
        db.query(OutSourcePartStatusModel).filter(
            OutSourcePartStatusModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)

        # Delete raw material links
        db.query(OrderPartsRawMaterialLinkedModel).filter(
            OrderPartsRawMaterialLinkedModel.part_id.in_(part_ids)
        ).delete(synchronize_session=False)
        
        # Delete inventory requests related to these parts (before deleting parts).
        # Use raw SQL instead of ORM to avoid mismatches with any optional columns.
        if part_ids:
            for pid in part_ids:
                # First delete return requests that reference these inventory requests
                db.execute(
                    text(
                        """
                        DELETE FROM inventory.inventory_return_requests
                        WHERE requested_id IN (
                          SELECT id FROM inventory.inventory_requests
                          WHERE part_id = :pid
                        )
                        """
                    ),
                    {"pid": pid},
                )
                # Then delete the inventory requests themselves
                db.execute(
                    text(
                        "DELETE FROM inventory.inventory_requests WHERE part_id = :pid"
                    ),
                    {"pid": pid},
                )
            db.flush()

        # Delete component_issues records that reference these parts
        if part_ids:
            db.execute(
                text("DELETE FROM maintenance.component_issues WHERE part_id IN :pids"),
                {"pids": tuple(part_ids)}
            )

        # Delete parts
        db.query(PartModel).filter(PartModel.id.in_(part_ids)).delete(
            synchronize_session=False
        )

    # Delete assemblies recursively
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

    root_assemblies = db.query(AssemblyModel).filter(
        AssemblyModel.product_id == product_id
    ).all()
    for assembly in root_assemblies:
        delete_assembly_recursive(assembly.id)

    # Delete the product itself
    db.delete(db_product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """
    Delete a product and all its assemblies and parts (recursive cascade deletion).
    
    Cannot delete if product is linked to any orders. Must delete all related orders first.
    """
    db_product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not db_product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found",
        )

    # Check if product is linked to any orders
    related_orders = db.query(OrderModel).filter(OrderModel.product_id == product_id).all()
    if related_orders:
        order_count = len(related_orders)
        order_numbers = [order.sale_order_number for order in related_orders]
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cannot delete product '{db_product.product_name}' because it is linked to {order_count} order(s): "
                f"{', '.join(order_numbers)}. "
                "Please delete the related orders first, then this product can be deleted."
            ),
        )

    # Proceed with cascade deletion
    try:
        delete_product_cascade(db, product_id)
        db.commit()
        return None
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting product: {str(e)}"
        )


def fetch_product_hierarchy(db: Session, product_id: int) -> ProductHierarchicalData:
    """
    Helper function to fetch hierarchical product data.
    Can be used by other routers (like orders).
    """
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

    # Get all work centers for mapping
    all_work_centers = db.query(WorkCenterModel).all()
    work_center_map = {wc.id: wc.work_center_name for wc in all_work_centers}
    # Get all machines for mapping
    all_machines = db.query(MachineModel).all()
    machine_map = {m.id: m.make for m in all_machines}

    # Get all raw materials for mapping (name only - simplified model)
    all_raw_materials = db.query(RawMaterialModel).all()
    raw_material_map = {rm.id: rm.material_name for rm in all_raw_materials}
    # Simplified raw materials don't have status - always available
    raw_material_status_map = {rm.id: "Available" for rm in all_raw_materials}

    # Get all part types for mapping (avoids N+1 per part in create_part_details)
    all_part_types = db.query(PartTypeModel).all()
    part_type_map = {pt.id: pt.type_name for pt in all_part_types}

    # User map for part.user_id -> user_name (hierarchy part payload)
    all_users = db.query(AccessUserModel).all()
    user_map = {u.id: u.user_name for u in all_users}
    
    # Create mappings for easy lookup
    assembly_map = {asm.id: asm for asm in all_assemblies}
    part_map = {part.id: part for part in all_parts}
    
    # Get all related data for parts
    part_ids = list(part_map.keys())
    operations_by_part: dict[int, list[OperationModel]] = {}
    operation_documents_by_operation: dict[int, list[OperationDocumentModel]] = {}
    documents_by_part: dict[int, list[DocumentModel]] = {}
    tools_by_part: dict[int, list[ToolWithPartModel]] = {}
    tools_by_operation: dict[int, list[ToolWithPartModel]] = {}
    extracted_by_part: dict[int, list[DocumentExtractedDataModel]] = {}
    documents_by_assembly: dict[int, list[DocumentModel]] = {}
    
    if part_ids:
        # Get operations (FIFO by id)
        operations = db.query(OperationModel).filter(OperationModel.part_id.in_(part_ids)).order_by(OperationModel.id.asc()).all()
        for op in operations:
            if op.part_id not in operations_by_part:
                operations_by_part[op.part_id] = []
            operations_by_part[op.part_id].append(op)
        
        # Get operation documents
        operation_ids = [op.id for op in operations]
        if operation_ids:
            # Operation Documents
            op_docs = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id.in_(operation_ids)).all()
            for doc in op_docs:
                if doc.operation_id not in operation_documents_by_operation:
                    operation_documents_by_operation[doc.operation_id] = []
                operation_documents_by_operation[doc.operation_id].append(doc)
        
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

        # Get tools with details
        tools = db.query(ToolWithPartModel).options(joinedload(ToolWithPartModel.tool)).filter(ToolWithPartModel.part_id.in_(part_ids)).all()
        for tool in tools:
            if tool.part_id not in tools_by_part:
                tools_by_part[tool.part_id] = []
            tools_by_part[tool.part_id].append(tool)
            
            # Also map to operation if applicable
            if tool.operation_id:
                if tool.operation_id not in tools_by_operation:
                    tools_by_operation[tool.operation_id] = []
                tools_by_operation[tool.operation_id].append(tool)
    # Get documents for assemblies (if any)
    if assembly_ids:
        asm_docs = db.query(DocumentModel).filter(DocumentModel.assembly_id.in_(assembly_ids)).all()
        for doc in asm_docs:
            if doc.assembly_id not in documents_by_assembly:
                documents_by_assembly[doc.assembly_id] = []
            documents_by_assembly[doc.assembly_id].append(doc)

    def create_part_details(part: PartModel) -> PartDetails:
        """Create PartDetails with all related data"""
        part_operations_models = operations_by_part.get(part.id, [])
        
        # Enrich operations with work_center_name, machine_name, part_type_name, and tools
        part_operations = []
        for op in part_operations_models:
            op_dict = {
                "id": op.id,
                "operation_number": op.operation_number,
                "operation_name": op.operation_name,
                "part_type_id": op.part_type_id,
                "part_type_name": part_type_map.get(op.part_type_id) if op.part_type_id else None,
                "from_date": op.from_date,
                "to_date": op.to_date,
                "setup_time": op.setup_time,
                "cycle_time": op.cycle_time,
                "workcenter_id": op.workcenter_id,
                "machine_id": op.machine_id,
                "part_id": op.part_id,
                "user_id": op.user_id,
                "work_instructions": op.work_instructions,
                "notes": op.notes,
                "work_center_name": work_center_map.get(op.workcenter_id),
                "machine_name": machine_map.get(op.machine_id),
                "user_name": user_map.get(op.user_id) if op.user_id else None,
                "operation_documents": operation_documents_by_operation.get(op.id, []),
                "tools": tools_by_operation.get(op.id, []),
                "created_at": op.created_at,
                "updated_at": op.updated_at,
            }
            part_operations.append(OperationSchema(**op_dict))
        
        # Raw material status from raw_materials table only (not order-parts-raw-material-linked)
        if part.raw_material_id is None:
            raw_material_status = "N/A"
        else:
            raw_material_status = raw_material_status_map.get(part.raw_material_id, "Not Available")

        # Create a new Part model with the type_name included (uses pre-fetched map)
        part_dict = {
            'id': part.id,
            'part_name': part.part_name,
            'part_number': part.part_number,
            'type_id': part.type_id,
            'raw_material_id': part.raw_material_id,
            'part_detail': part.part_detail,
            'assembly_id': part.assembly_id,
            'product_id': part.product_id,
            'user_id': part.user_id,
            'size': part.size,  # New optional size field
            'qty': part.qty,    # New optional quantity field
            'type_name': part_type_map.get(part.type_id),
            'raw_material_name': raw_material_map.get(part.raw_material_id),
            'raw_material_status': raw_material_status,
            'user_name': user_map.get(part.user_id) if part.user_id else None,
            'created_at': part.created_at,
            'updated_at': part.updated_at,
        }
        
        part_with_type = PartSchema(**part_dict)
        
        # Map DB models to schemas
        documents_schema = [DocumentSchema.model_validate(d) for d in documents_by_part.get(part.id, [])]
        extracted_schema = [DocumentExtractedDataSchema.model_validate(e) for e in extracted_by_part.get(part.id, [])]

        return PartDetails(
            part=part_with_type,
            operations=part_operations,
            documents=documents_schema,
            tools=tools_by_part.get(part.id, []),
            extracted_data=extracted_schema,
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
        
        # Map assembly documents to schema models
        asm_docs_schema = [DocumentSchema.model_validate(d) for d in documents_by_assembly.get(assembly_id, [])]

        return AssemblyDetails(
            assembly=assembly,
            parts=direct_parts,
            subassemblies=child_assemblies,
            documents=asm_docs_schema,
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
    
    product_response = Product(
        id=product.id,
        product_name=product.product_name,
        product_version=product.product_version,
        user_id=product.user_id,
        user_name=user_map.get(product.user_id) if product.user_id else None,
        created_at=product.created_at,
        updated_at=product.updated_at,
    )
    return ProductHierarchicalData(
        product=product_response,
        assemblies=root_assemblies,
        direct_parts=direct_parts
    )


@router.get("/{product_id}/hierarchical", response_model=ProductHierarchicalData)
def get_product_hierarchical_data(product_id: int, db: Session = Depends(get_db)):
    """
    Get hierarchical product data with nested structure:
    - Product information
    - Assemblies with nested subassemblies and parts
    - Direct parts (parts not assigned to any assembly)
    - Each part includes its operations, process plans, documents, and tools
    """
    return fetch_product_hierarchy(db, product_id)