from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, or_
from typing import List, Optional

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
    DocumentExtractedData as DocumentExtractedDataModel,
    OrderPartPriority as OrderPartPriorityModel,
    OutSourcePartStatus as OutSourcePartStatusModel,
    OrderAdditionalCost as OrderAdditionalCostModel,
)
from DB.models.configuration import (
    workcenter as workcenterModel,
    Machine as MachineModel,
   
)
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock, RawMaterialUnit, InventoryRequest, InventoryReturnRequest, Vendors as VendorModel, Category as CategoryModel, ToolsList as ToolsListModel
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
    ProductHierarchicalLightweight,
    AssemblyLightweight,
    PartLightweight,
    ToolWithPart as ToolWithPartSchema,
)
from DB.schemas.inventory import ToolsList as ToolsListSchema
from DB.minio_client import get_minio_client
from auth.roles import normalize_role

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
def get_products(
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
    role: Optional[str] = Query(None),
):
    """
    Get products with optional role-aware visibility via query params.
    If role is not provided, filter by user_id only (or return all if user_id unset).
    """
    base_query = db.query(ProductModel).options(joinedload(ProductModel.user)).order_by(ProductModel.id.asc())

    normalized_role = normalize_role(role) if role else None

    if not normalized_role:
        if user_id is not None:
            products = base_query.filter(ProductModel.user_id == user_id).all()
        else:
            products = base_query.all()
    else:
        product_ids_from_orders: list[int] = []

        if normalized_role in {"admin", "project_coordinator", "manufacturing_coordinator"}:
            order_query = db.query(OrderModel.product_id).filter(
                OrderModel.product_id.isnot(None)
            )
            if normalized_role == "admin":
                order_query = order_query.filter(OrderModel.admin_id == user_id)
            elif normalized_role == "project_coordinator":
                order_query = order_query.filter(OrderModel.project_coordinator_id == user_id)
            elif normalized_role == "manufacturing_coordinator":
                order_query = order_query.filter(OrderModel.manufacturing_coordinator_id == user_id)

            product_ids_from_orders = [row[0] for row in order_query.distinct().all()]

        if normalized_role == "admin" or normalized_role == "project_coordinator":
            conditions = [ProductModel.user_id == user_id]
            if product_ids_from_orders:
                conditions.append(ProductModel.id.in_(product_ids_from_orders))
            products = base_query.filter(or_(*conditions)).all()
        elif normalized_role == "manufacturing_coordinator":
            if product_ids_from_orders:
                products = base_query.filter(ProductModel.id.in_(product_ids_from_orders)).all()
            else:
                products = []
        else:
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

    # Get all parts for this product with vendor information
    all_parts = db.query(PartModel).options(joinedload(PartModel.vendor)).filter(PartModel.product_id == product_id).order_by(PartModel.id.asc()).all()

    # Get all work centers for mapping
    all_work_centers = db.query(workcenterModel).all()
    work_center_map = {wc.id: wc.work_center_name for wc in all_work_centers}
    # Get all machines for mapping
    all_machines = db.query(MachineModel).all()
    machine_map = {m.id: m.make for m in all_machines}

    # Get all raw materials for mapping (name only - simplified model)
    all_raw_materials = db.query(RawMaterialModel).all()
    raw_material_map = {rm.id: rm.material_name for rm in all_raw_materials}
    # Simplified raw materials don't have status - always available
    raw_material_status_map = {rm.id: "Available" for rm in all_raw_materials}
    
    # Get all raw material units for mapping (unit details including form_type)
    all_units = db.query(RawMaterialUnit).options(
        joinedload(RawMaterialUnit.stock).joinedload(RawMaterialStock.material)
    ).all()
    unit_map = {unit.id: unit for unit in all_units}
    
    # Get all part types for mapping (avoids N+1 per part in create_part_details)
    all_part_types = db.query(PartTypeModel).all()
    part_type_map = {pt.id: pt.type_name for pt in all_part_types}

    # User map for part.user_id -> user_name (hierarchy part payload)
    all_users = db.query(AccessUserModel).all()
    user_map = {u.id: u.user_name for u in all_users}

    # Category map for resolving category_name and sub_category_name in tools
    all_categories = db.query(CategoryModel).all()
    category_map = {c.id: c for c in all_categories}
    
    # Create mappings for easy lookup
    assembly_map = {asm.id: asm for asm in all_assemblies}
    part_map = {part.id: part for part in all_parts}
    
    # Pre-build lookup maps to avoid O(n²) iteration in build_assembly_hierarchy
    parts_by_assembly: dict[int | None, list] = {}
    for part in all_parts:
        parts_by_assembly.setdefault(part.assembly_id, []).append(part)
    
    assemblies_by_parent: dict[int | None, list] = {}
    for asm in all_assemblies:
        assemblies_by_parent.setdefault(asm.parent_id, []).append(asm)
    
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
            # Resolve category_name and sub_category_name from category_map
            cat_name = None
            sub_cat_name = None
            if tool.tool:
                t = tool.tool
                if t.sub_category_id and t.sub_category_id in category_map:
                    sub_cat = category_map[t.sub_category_id]
                    sub_cat_name = sub_cat.name
                    if sub_cat.parent_id and sub_cat.parent_id in category_map:
                        cat_name = category_map[sub_cat.parent_id].name
                elif t.category_id and t.category_id in category_map:
                    cat_name = category_map[t.category_id].name

            # Build enriched tool dict so Pydantic receives category_name/sub_category_name
            tool_dict = None
            if tool.tool:
                t = tool.tool
                tool_dict = ToolsListSchema(
                    id=t.id,
                    item_description=t.item_description,
                    range=t.range,
                    identification_code=t.identification_code,
                    make=t.make,
                    quantity=t.quantity,
                    total_quantity=t.total_quantity,
                    issues_qty=t.issues_qty,
                    location=t.location,
                    gauge=t.gauge,
                    remarks=t.remarks,
                    amount=t.amount,
                    ref_ledger=t.ref_ledger,
                    type=t.type,
                    category_id=t.category_id,
                    sub_category_id=t.sub_category_id,
                    category_name=cat_name,
                    sub_category_name=sub_cat_name,
                )
            enriched_tool = ToolWithPartSchema(
                id=tool.id,
                tool_id=tool.tool_id,
                part_id=tool.part_id,
                operation_id=tool.operation_id,
                user_id=tool.user_id,
                tool=tool_dict,
                created_at=getattr(tool, 'created_at', None),
                updated_at=getattr(tool, 'updated_at', None),
            )

            if tool.part_id not in tools_by_part:
                tools_by_part[tool.part_id] = []
            tools_by_part[tool.part_id].append(enriched_tool)
            
            # Also map to operation if applicable
            if tool.operation_id:
                if tool.operation_id not in tools_by_operation:
                    tools_by_operation[tool.operation_id] = []
                tools_by_operation[tool.operation_id].append(enriched_tool)
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
        
        # part_detail comes from database for out-source parts
        # For IN-House and standard parts: set to null (not applicable)
        part_type_name = part_type_map.get(part.type_id, "")
        if part_type_name and "out-source" in part_type_name.lower():
            # For out-source parts, use the stored value from database
            calculated_part_detail = part.part_detail
        else:
            # For IN-House and standard parts, part_detail is not applicable
            calculated_part_detail = None

        # Raw material status from raw_materials table only (not order-parts-raw-material-linked)
        if part.raw_material_id is None:
            raw_material_status = "N/A"
        else:
            raw_material_status = raw_material_status_map.get(part.raw_material_id, "Not Available")

        # Get unit details if part has a unit assigned
        unit_details = None
        raw_material_source_type = None
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
            raw_material_source_type = stock.source_type if stock else None

        # Create a new Part model with the type_name included (uses pre-fetched map)
        part_dict = {
            'id': part.id,
            'part_name': part.part_name,
            'part_number': part.part_number,
            'type_id': part.type_id,
            'raw_material_id': part.raw_material_id,
            'raw_material_unit_id': getattr(part, 'raw_material_unit_id', None),
            'required_length': part.required_length,
            'part_detail': calculated_part_detail,
            'assembly_id': part.assembly_id,
            'product_id': part.product_id,
            'user_id': part.user_id,
            'qty': part.qty,    # New optional quantity field
            'size': part.size,  # Size specification for the part
            'vendor_id': part.vendor_id,
            'type_name': part_type_map.get(part.type_id),
            'raw_material_name': raw_material_map.get(part.raw_material_id),
            'raw_material_status': raw_material_status,
            'raw_material_unit_details': unit_details,
            'raw_material_source_type': raw_material_source_type,  # Add source_type field
            'user_name': user_map.get(part.user_id) if part.user_id else None,
            'vendor_name': getattr(part.vendor, 'company_name', None) if part.vendor else None,
            'recycle_bin': getattr(part, 'recycle_bin', False),  # Add recycle_bin field
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
        
        # Use pre-built lookup maps instead of iterating all_parts/all_assemblies (O(1) vs O(n))
        direct_parts = [
            create_part_details(part) 
            for part in parts_by_assembly.get(assembly_id, [])
        ]
        
        child_assemblies = [
            build_assembly_hierarchy(child.id) 
            for child in assemblies_by_parent.get(assembly_id, [])
        ]
        
        # Map assembly documents to schema models
        asm_docs_schema = [DocumentSchema.model_validate(d) for d in documents_by_assembly.get(assembly_id, [])]

        return AssemblyDetails(
            assembly=assembly,
            parts=direct_parts,
            subassemblies=child_assemblies,
            documents=asm_docs_schema,
        )
    
    # Build root level assemblies (those with no parent) using lookup map
    root_assemblies = [
        build_assembly_hierarchy(asm.id) 
        for asm in assemblies_by_parent.get(None, [])
    ]
    
    # Get direct parts (parts not assigned to any assembly) using lookup map
    direct_parts = [
        create_part_details(part) 
        for part in parts_by_assembly.get(None, [])
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
        assemblies=[a for a in root_assemblies if a],
        direct_parts=direct_parts
    )


@router.get("/{product_id}/summary-data")
def get_product_summary_data(product_id: int, order_id: int = None, db: Session = Depends(get_db)):
    """
    Get minimal data for ProductSummary hours calculation.
    Only returns: parts with qty, operations with setup_time/cycle_time/machine info.
    Much faster than full hierarchical endpoint.
    
    If order_id is provided, also returns additional costs for that order.
    """
    # Get product
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    # Get all parts for this product
    all_parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    part_ids = [p.id for p in all_parts]

    # Get all operations for these parts
    operations = []
    if part_ids:
        operations = db.query(OperationModel).filter(
            OperationModel.part_id.in_(part_ids)
        ).order_by(OperationModel.id.asc()).all()

    # Get machine names + mhr rates
    all_machines = db.query(MachineModel).all()
    machine_map = {m.id: m.make for m in all_machines}
    machine_mhr_map = {m.id: (m.recommended_mhr or m.mhr or 0) for m in all_machines}

    # Get part type names
    all_part_types = db.query(PartTypeModel).all()
    part_type_map = {pt.id: pt.type_name for pt in all_part_types}

    # Build part map for quick lookup
    part_map = {p.id: p for p in all_parts}

    # Build response - flat list of parts with their operations
    parts_with_ops = []
    for part in all_parts:
        part_ops = [op for op in operations if op.part_id == part.id]
        if part_ops:  # Only include parts that have operations
            parts_with_ops.append({
                "part": {
                    "id": part.id,
                    "part_name": part.part_name,
                    "part_number": part.part_number,
                    "qty": part.qty if part.qty is not None else 1,
                },
                "operations": [
                    {
                        "id": op.id,
                        "operation_number": op.operation_number,
                        "operation_name": op.operation_name,
                        "setup_time": str(op.setup_time) if op.setup_time else "00:00:00",
                        "cycle_time": str(op.cycle_time) if op.cycle_time else "00:00:00",
                        "machine_id": op.machine_id,
                        "machine_name": machine_map.get(op.machine_id),
                        "mhr_rate": machine_mhr_map.get(op.machine_id, 0),
                        "part_type_id": op.part_type_id,
                        "part_type_name": part_type_map.get(op.part_type_id),
                    }
                    for op in part_ops
                ]
            })

    response = {
        "product": {
            "id": product.id,
            "product_name": product.product_name,
        },
        "parts": parts_with_ops,
    }

    # If order_id is provided, fetch additional costs
    if order_id:
        additional_costs = db.query(OrderAdditionalCostModel).filter(
            OrderAdditionalCostModel.order_id == order_id
        ).all()
        
        response["additional_costs"] = [
            {
                "id": cost.id,
                "cost_name": cost.cost_name,
                "cost_value": cost.cost_value,
            }
            for cost in additional_costs
        ]
        response["additional_costs_subtotal"] = sum(cost.cost_value for cost in additional_costs)
    else:
        response["additional_costs"] = []
        response["additional_costs_subtotal"] = 0

    return response


@router.get("/{product_id}/tools-data")
def get_product_tools_data(product_id: int, db: Session = Depends(get_db)):
    """
    Get minimal data for ProductToolsViewer.
    Only returns: tools linked to operations with part/operation info.
    Much faster than full hierarchical endpoint.
    """
    # Get product
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    # Get all parts for this product
    all_parts = db.query(PartModel).filter(PartModel.product_id == product_id).all()
    part_ids = [p.id for p in all_parts]
    part_map = {p.id: p for p in all_parts}

    # Get all assemblies for assembly name lookup
    all_assemblies = db.query(AssemblyModel).filter(AssemblyModel.product_id == product_id).all()
    assembly_map = {a.id: a for a in all_assemblies}

    # Get all operations for these parts
    operations = []
    if part_ids:
        operations = db.query(OperationModel).filter(
            OperationModel.part_id.in_(part_ids)
        ).order_by(OperationModel.id.asc()).all()

    operation_ids = [op.id for op in operations]
    operation_map = {op.id: op for op in operations}

    # Get tools linked to operations
    tools = []
    if operation_ids:
        tools = db.query(ToolWithPartModel).options(
            joinedload(ToolWithPartModel.tool)
        ).filter(
            ToolWithPartModel.operation_id.in_(operation_ids)
        ).all()

    # Build response - flat list of tools with part/operation info
    tools_list = []
    for tool in tools:
        operation = operation_map.get(tool.operation_id)
        part = part_map.get(tool.part_id) if tool.part_id else None
        if not part and operation:
            part = part_map.get(operation.part_id)
        
        assembly_name = None
        if part and part.assembly_id:
            assembly = assembly_map.get(part.assembly_id)
            assembly_name = assembly.assembly_name if assembly else None

        tools_list.append({
            "id": tool.id,
            "tool_id": tool.tool_id,
            "tool_number": tool.tool.identification_code if tool.tool else None,
            "tool_name": tool.tool.item_description if tool.tool else None,
            "tool_type": tool.tool.type if tool.tool else None,
            "tool_range": tool.tool.range if tool.tool else None,
            "tool_make": tool.tool.make if tool.tool else None,
            "quantity": tool.tool.quantity if tool.tool else 1,
            "part_id": part.id if part else None,
            "part_name": part.part_name if part else None,
            "part_number": part.part_number if part else None,
            "assembly_name": assembly_name,
            "operation_id": tool.operation_id,
            "operation_name": operation.operation_name if operation else None,
            "operation_number": operation.operation_number if operation else None,
            "product_name": product.product_name,
        })

    return {
        "product": {
            "id": product.id,
            "product_name": product.product_name,
        },
        "tools": tools_list,
    }


@router.get("/{product_id}/hierarchical", response_model=ProductHierarchicalData)
def get_product_hierarchical_data(product_id: int, db: Session = Depends(get_db)):
    """
    Get FULL hierarchical product data with nested structure:
    - Product information
    - Assemblies with nested subassemblies and parts
    - Direct parts (parts not assigned to any assembly)
    - Each part includes its operations, documents, and tools
    """
    return fetch_product_hierarchy(db, product_id)


@router.get("/{product_id}/hierarchical-lightweight")
def get_product_hierarchical_lightweight(product_id: int, db: Session = Depends(get_db)):
    """
    Get lightweight hierarchical product data - optimized for BOM tree display.
    Only includes: product, assemblies, parts with raw material info.
    Does NOT include: operations, documents, tools, extracted_data.
    Use individual endpoints for those details when needed.
    """
    # Get product
    product = db.query(ProductModel).filter(ProductModel.id == product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {product_id} not found"
        )

    # Get all assemblies for this product
    all_assemblies = db.query(AssemblyModel).filter(
        AssemblyModel.product_id == product_id
    ).order_by(AssemblyModel.id.asc()).all()

    # Get all parts for this product with vendor information
    all_parts = db.query(PartModel).options(
        joinedload(PartModel.vendor)
    ).filter(PartModel.product_id == product_id).order_by(PartModel.id.asc()).all()

    # Get part schedule status for all parts
    part_ids = [p.id for p in all_parts]
    part_schedule_status_map = {}
    if part_ids:
        schedule_statuses = db.execute(
            text("SELECT part_id, status FROM scheduling.part_schedule_status WHERE part_id IN :pids"),
            {"pids": tuple(part_ids)}
        ).fetchall()
        part_schedule_status_map = {row[0]: row[1] for row in schedule_statuses}

    # Get document acknowledgment status for all parts
    from DB.models.oms import Document as DocumentModel
    from DB.models.notifications import MCNotification as MCNotificationModel
    from DB.models.access_control import AccessUser
    part_document_ack_map = {}
    if part_ids:
        # Get all documents for these parts with user information
        documents = db.query(DocumentModel).outerjoin(AccessUser, DocumentModel.user_id == AccessUser.id).filter(
            DocumentModel.part_id.in_(part_ids)
        ).all()
        
        # Get MC notifications for these documents to check rejection status
        document_ids = [d.id for d in documents]
        mc_notifications = {}
        if document_ids:
            notifications = db.query(MCNotificationModel).filter(
                MCNotificationModel.document_id.in_(document_ids)
            ).all()
            mc_notifications = {notif.document_id: notif for notif in notifications}
        
        # For each part, check if it has any unacknowledged documents
        for part_id in part_ids:
            part_docs = [d for d in documents if d.part_id == part_id]
            if part_docs:
                # Part has documents - check if any are unacknowledged and not rejected (only for PC uploads)
                has_unacknowledged = False
                acknowledged_count = 0
                for doc in part_docs:
                    mc_notif = mc_notifications.get(doc.id)
                    # Only require acknowledgment for documents uploaded by PC
                    uploader_role = doc.user.role if doc.user else None
                    is_pc_upload = uploader_role and 'project_coordinator' in uploader_role.lower()
                    
                    if is_pc_upload:
                        # Document is considered "handled" if acknowledged OR rejected by MC
                        is_handled = doc.is_acknowledged or (mc_notif and mc_notif.is_rejected)
                        if is_handled:
                            acknowledged_count += 1
                        else:
                            has_unacknowledged = True
                    else:
                        # Admin/MC uploads don't require acknowledgment
                        acknowledged_count += 1
                
                part_document_ack_map[part_id] = {
                    'has_documents': True,
                    'has_unacknowledged': has_unacknowledged,
                    'total_documents': len(part_docs),
                    'acknowledged_count': acknowledged_count
                }
            else:
                part_document_ack_map[part_id] = {
                    'has_documents': False,
                    'has_unacknowledged': False,
                    'total_documents': 0,
                    'acknowledged_count': 0
                }

    # Get all raw materials for mapping (name only)
    all_raw_materials = db.query(RawMaterialModel).all()
    raw_material_map = {rm.id: rm.material_name for rm in all_raw_materials}
    raw_material_status_map = {rm.id: "Available" for rm in all_raw_materials}

    # Get all raw material units with stock for stock dimensions
    all_units = db.query(RawMaterialUnit).options(joinedload(RawMaterialUnit.stock)).all()
    unit_map = {unit.id: unit for unit in all_units}

    # Get all part types for mapping
    all_part_types = db.query(PartTypeModel).all()
    part_type_map = {pt.id: pt.type_name for pt in all_part_types}

    # User map
    all_users = db.query(AccessUserModel).all()
    user_map = {u.id: u.user_name for u in all_users}

    # Pre-build lookup maps for O(1) access
    parts_by_assembly: dict[int | None, list] = {}
    for part in all_parts:
        parts_by_assembly.setdefault(part.assembly_id, []).append(part)

    assemblies_by_parent: dict[int | None, list] = {}
    assembly_map: dict[int, any] = {}  # For O(1) assembly lookup
    for asm in all_assemblies:
        assemblies_by_parent.setdefault(asm.parent_id, []).append(asm)
        assembly_map[asm.id] = asm

    def create_part_lightweight(part: PartModel) -> dict:
        """Create lightweight part dict"""
        if part.raw_material_id is None:
            raw_material_status = "N/A"
        else:
            raw_material_status = raw_material_status_map.get(part.raw_material_id, "Not Available")

        # Get unit details if part has a unit assigned
        stock_dimensions = None
        if part.raw_material_unit_id and part.raw_material_unit_id in unit_map:
            unit = unit_map[part.raw_material_unit_id]
            stock = unit.stock
            # Build stock dimensions string
            if stock:
                if stock.form_type == 'Round':
                    stock_dimensions = f'Ø{stock.diameter} × {stock.length}mm'
                elif stock.form_type == 'Square':
                    stock_dimensions = f'{stock.breadth} × {stock.height} × {stock.length}mm'
                elif stock.form_type == 'Pipe':
                    stock_dimensions = f'Ø{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm'

        doc_ack_status = part_document_ack_map.get(part.id, {
            'has_documents': False,
            'has_unacknowledged': False,
            'total_documents': 0,
            'acknowledged_count': 0
        })

        return {
            'id': part.id,
            'part_name': part.part_name,
            'part_number': part.part_number,
            'type_id': part.type_id,
            'type_name': part_type_map.get(part.type_id),
            'assembly_id': part.assembly_id,
            'product_id': part.product_id,
            'qty': part.qty,
            'size': part.size,
            'raw_material_id': part.raw_material_id,
            'raw_material_name': raw_material_map.get(part.raw_material_id),
            'raw_material_status': raw_material_status,
            'part_detail': part.part_detail,
            'stock_dimensions': stock_dimensions,
            'schedule_status': part_schedule_status_map.get(part.id, None),
            'vendor_id': part.vendor_id,
            'vendor_name': getattr(part.vendor, 'company_name', None) if part.vendor else None,
            'user_id': part.user_id,
            'user_name': user_map.get(part.user_id) if part.user_id else None,
            'recycle_bin': getattr(part, 'recycle_bin', False),
            'created_at': part.created_at,
            'updated_at': part.updated_at,
            'has_unacknowledged_documents': doc_ack_status['has_unacknowledged'],
            'document_info': doc_ack_status,
        }

    def build_assembly_lightweight(assembly_id: int) -> dict:
        """Recursively build lightweight assembly hierarchy"""
        assembly = assembly_map.get(assembly_id)  # O(1) lookup instead of O(n)
        if not assembly:
            return None

        direct_parts = [
            create_part_lightweight(part)
            for part in parts_by_assembly.get(assembly_id, [])
        ]

        child_assemblies = [
            build_assembly_lightweight(child.id)
            for child in assemblies_by_parent.get(assembly_id, [])
        ]

        return {
            'id': assembly.id,
            'assembly_name': assembly.assembly_name,
            'assembly_number': assembly.assembly_number,
            'product_id': assembly.product_id,
            'parent_id': assembly.parent_id,
            'user_id': assembly.user_id,
            'user_name': user_map.get(assembly.user_id) if assembly.user_id else None,
            'recycle_bin': getattr(assembly, 'recycle_bin', False),
            'parts': direct_parts,
            'child_assemblies': [ca for ca in child_assemblies if ca],
            'created_at': assembly.created_at,
            'updated_at': assembly.updated_at,
        }

    # Build root level assemblies (no parent)
    root_assemblies = [
        build_assembly_lightweight(asm.id)
        for asm in assemblies_by_parent.get(None, [])
    ]

    # Get direct parts (no assembly)
    direct_parts = [
        create_part_lightweight(part)
        for part in parts_by_assembly.get(None, [])
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

    return {
        'product': product_response,
        'assemblies': [a for a in root_assemblies if a],
        'parts': direct_parts
    }