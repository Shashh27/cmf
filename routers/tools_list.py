from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
import pandas as pd
import io

from DB.database import get_db
from DB.models.inventory import ToolsList as ToolsListModel, Category as CategoryModel
from DB.schemas.inventory import (
    ToolsList,
    ToolsListCreate,
    ToolsListUpdate,
    ToolsListBulkDelete,
    ItemNode,
    SubCategoryNode,
    CategoryTree,
)

router = APIRouter(prefix="/tools-list", tags=["tools-list"])


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def safe_str(value, default=None):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    val = str(value).strip()
    return None if val.lower() in ['nan', 'none', 'null', ''] else val

def safe_int(value, default=0):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    try:
        return int(float(str(value).strip()))
    except Exception:
        return default

def safe_float(value, default=None):
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return default
    try:
        return float(str(value).strip())
    except Exception:
        return default

def find_col(df, possible_names):
    cols = {str(c).lower().strip(): c for c in df.columns}
    for p in possible_names:
        if p.lower() in cols:
            return cols[p.lower()]
    for p in possible_names:
        for c_lower, original in cols.items():
            if p.lower() in c_lower:
                return original
    return None


# ─────────────────────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/", response_model=ToolsList, status_code=status.HTTP_201_CREATED)
def create_tool(tool: ToolsListCreate, db: Session = Depends(get_db)):
    existing = db.query(ToolsListModel).filter(
        ToolsListModel.identification_code == tool.identification_code
    ).first()
    if existing:
        raise HTTPException(status_code=400,
            detail=f"Tool with identification code '{tool.identification_code}' already exists")

    tool_data = tool.model_dump()
    
    # Resolve category and sub-category
    category_name = tool_data.get("category")
    sub_category_name = tool_data.get("sub_category")
    
    # Accept both string names and IDs
    # If category_id is already provided (integer), use it directly
    if tool_data.get("category_id") and isinstance(tool_data["category_id"], int):
        category = db.query(CategoryModel).filter(CategoryModel.id == tool_data["category_id"]).first()
        if not category:
            raise HTTPException(status_code=400, detail=f"Category with ID {tool_data['category_id']} not found")
    elif category_name:
        # Resolve category name to ID
        category = db.query(CategoryModel).filter(
            func.lower(CategoryModel.name) == category_name.lower()
        ).first()
        if not category:
            category = CategoryModel(name=category_name, parent_id=None)
            db.add(category)
            db.flush()
    else:
        raise HTTPException(status_code=400, detail="Category is required. Please select a category from the dropdown.")
    
    # Handle sub-category
    sub_category = None
    if tool_data.get("sub_category_id") and isinstance(tool_data["sub_category_id"], int):
        # sub_category_id is provided directly
        sub_category = db.query(CategoryModel).filter(CategoryModel.id == tool_data["sub_category_id"]).first()
        if not sub_category:
            raise HTTPException(status_code=400, detail=f"Sub-category with ID {tool_data['sub_category_id']} not found")
    elif sub_category_name:
        # Resolve sub-category name to ID
        sub_category = db.query(CategoryModel).filter(
            func.lower(CategoryModel.name) == sub_category_name.lower(),
            CategoryModel.parent_id == category.id
        ).first()
        if not sub_category:
            # Create sub-category if it doesn't exist
            sub_category = CategoryModel(name=sub_category_name, parent_id=category.id)
            db.add(sub_category)
            db.flush()
    
    # Set category_id and sub_category_id (mutually exclusive)
    # If sub-category exists, use sub_category_id (category_id will be NULL)
    # If only category exists, use category_id
    if sub_category:
        tool_data["category_id"] = None
        tool_data["sub_category_id"] = sub_category.id
    else:
        tool_data["category_id"] = category.id
        tool_data["sub_category_id"] = None
    # Remove string fields
    tool_data.pop("category", None)
    tool_data.pop("sub_category", None)
    
    if tool_data.get("total_quantity") is None:
        tool_data["total_quantity"] = tool_data.get("quantity", 0)

    db_tool = ToolsListModel(**tool_data)
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool


# ─────────────────────────────────────────────────────────────────────────────
# BULK UPLOAD
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/upload-excel", response_model=List[ToolsList], status_code=status.HTTP_201_CREATED)
async def upload_tools_excel(
    file: UploadFile = File(...),
    category: Optional[str] = None,
    sub_category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    if not (file.filename.endswith(".xlsx") or file.filename.endswith(".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx / .xls files allowed")

    try:
        contents = await file.read()
        try:
            df_inspect = pd.read_excel(io.BytesIO(contents), header=None, nrows=10)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid Excel file: {e}")

        header_keywords = [
            'item description', 'identification code', 'item_description',
            'identification_code', 'id code', 'range', 'description', 'make',
            'category', 'sub_category', 'sub category'
        ]
        header_row_idx = 0
        for i in range(len(df_inspect)):
            row_values = [str(v).lower().strip() for v in df_inspect.iloc[i].values if not pd.isna(v)]
            if sum(1 for kw in header_keywords if any(kw in v for v in row_values)) >= 2:
                header_row_idx = i
                break

        df = pd.read_excel(io.BytesIO(contents), header=header_row_idx)

        col = {
            'item_description':    find_col(df, ['item description', 'item_description', 'description']),
            'range':               find_col(df, ['range', 'range in mm', 'range / size']),
            'identification_code': find_col(df, ['identification code', 'identification_code', 'id code', 'code']),
            'make':                find_col(df, ['make', 'brand', 'manufacturer']),
            'quantity':            find_col(df, ['quantity', 'qty', 'stock', 'available']),
            'location':            find_col(df, ['location', 'rack', 'bin']),
            'gauge':               find_col(df, ['gauge', 'size']),
            'remarks':             find_col(df, ['remarks', 'remark', 'note']),
            'amount':              find_col(df, ['amount', 'price', 'cost']),
            'ref_ledger':          find_col(df, ['ref ledger', 'ref_ledger', 'reference']),
            'type':                find_col(df, ['type', 'TYPE', 'category type']),
            'category':            find_col(df, ['category']),
            'sub_category':        find_col(df, ['sub category', 'sub_category']),
        }

        if not col['item_description']:
            raise HTTPException(status_code=400, detail="Could not find 'Item Description' column.")

        processed = 0
        for _, row in df.iterrows():
            item_desc  = safe_str(row.get(col['item_description']))
            ident_code = safe_str(row.get(col['identification_code'])) if col['identification_code'] else None

            qty = safe_int(row.get(col['quantity']), 0) if col['quantity'] else 0

            cat_from_file = safe_str(row.get(col['category'])) if col['category'] else None
            sub_from_file = safe_str(row.get(col['sub_category'])) if col['sub_category'] else None
            
            # If query parameters are provided, use ONLY those and ignore file columns
            if category or sub_category:
                category_name = category
                sub_category_name = sub_category
            else:
                # Otherwise, use values from the file
                category_name = cat_from_file
                sub_category_name = sub_from_file

            # Find or create category (if category_name is provided)
            if category_name:
                cat = db.query(CategoryModel).filter(
                    func.lower(CategoryModel.name) == category_name.lower()
                ).first()
                if not cat:
                    cat = CategoryModel(name=category_name, parent_id=None)
                    db.add(cat)
                    db.flush()
            else:
                # If no category in file, skip this row for now
                continue

            # Find or create sub-category
            sub_cat = None
            if sub_category_name:
                sub_cat = db.query(CategoryModel).filter(
                    func.lower(CategoryModel.name) == sub_category_name.lower(),
                    CategoryModel.parent_id == cat.id
                ).first()
                if not sub_cat:
                    sub_cat = CategoryModel(name=sub_category_name, parent_id=cat.id)
                    db.add(sub_cat)
                    db.flush()

            tool_data = {
                'item_description': item_desc,
                'range':            safe_str(row.get(col['range'])) if col['range'] else None,
                'make':             safe_str(row.get(col['make'])) if col['make'] else None,
                'quantity':         qty,
                'total_quantity':   qty,
                'location':         safe_str(row.get(col['location'])) if col['location'] else None,
                'gauge':            safe_str(row.get(col['gauge'])) if col['gauge'] else None,
                'remarks':          safe_str(row.get(col['remarks'])) if col['remarks'] else None,
                'amount':           safe_float(row.get(col['amount'])) if col['amount'] else None,
                'ref_ledger':       safe_str(row.get(col['ref_ledger'])) if col['ref_ledger'] else None,
                'type':             safe_str(row.get(col['type']), "NON-CONSUMABLES") if col['type'] else "NON-CONSUMABLES",
                'category_id':      cat.id if not sub_cat else None,  # Only set category_id if no sub-category
                'sub_category_id':  sub_cat.id if sub_cat else None,
            }

            db.add(ToolsListModel(identification_code=ident_code, **tool_data))

            processed += 1
            if processed % 50 == 0:
                db.flush()

        db.commit()
        return db.query(ToolsListModel).order_by(ToolsListModel.id.desc()).limit(processed).all()

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing Excel: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# BULK DELETE
# ─────────────────────────────────────────────────────────────────────────────

@router.delete("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_tools(request: ToolsListBulkDelete, db: Session = Depends(get_db)):
    """Bulk delete tools by IDs, filters, or all tools"""
    query = db.query(ToolsListModel)
    
    # If specific IDs are provided, use those
    if request.tool_ids:
        if not request.tool_ids:
            raise HTTPException(status_code=400, detail="No tool IDs provided")
        query = query.filter(ToolsListModel.id.in_(request.tool_ids))
    
    # If delete_all is True, delete all tools
    elif request.delete_all:
        pass  # No filter needed, will delete all
    
    # Otherwise, apply filters
    else:
        if not any([request.category, request.sub_category, request.type]):
            raise HTTPException(
                status_code=400, 
                detail="Either tool_ids, delete_all, or at least one filter (category, sub_category, type) must be provided"
            )
        
        if request.category:
            query = query.filter(func.lower(ToolsListModel.category) == request.category.lower())
        if request.sub_category:
            query = query.filter(func.lower(ToolsListModel.sub_category) == request.sub_category.lower())
        if request.type:
            query = query.filter(ToolsListModel.type == request.type)
    
    # Get tools to delete
    tools_to_delete = query.all()
    
    if not tools_to_delete:
        raise HTTPException(status_code=404, detail="No tools found matching the criteria")

    deleted_count = 0
    deleted_ids = []
    
    for tool in tools_to_delete:
        deleted_ids.append(tool.id)
        db.delete(tool)
        deleted_count += 1

    db.commit()

    return {
        "message": f"Successfully deleted {deleted_count} tool(s)",
        "deleted_count": deleted_count,
        "deleted_ids": deleted_ids
    }


# ─────────────────────────────────────────────────────────────────────────────
# CATEGORY & SUB-CATEGORY MANAGEMENT
# ─────────────────────────────────────────────────────────────────────────────

class CategoryCreate(BaseModel):
    category: str

class SubCategoryCreate(BaseModel):
    category: str
    sub_category: str

@router.post("/categories", status_code=status.HTTP_201_CREATED)
def create_category(request: CategoryCreate, db: Session = Depends(get_db)):
    """Create a new category"""
    # Check if category already exists
    existing = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.category.lower()
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    # Create the category in the Category table
    category = CategoryModel(name=request.category, parent_id=None)
    db.add(category)
    db.commit()
    db.refresh(category)
    
    return {"message": f"Category '{request.category}' created successfully", "id": category.id}

@router.post("/sub-categories", status_code=status.HTTP_201_CREATED)
def create_sub_category(request: SubCategoryCreate, db: Session = Depends(get_db)):
    """Create a new sub-category under a category"""
    # Find the parent category by name
    parent_category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.category.lower()
    ).first()
    
    if not parent_category:
        raise HTTPException(status_code=404, detail=f"Parent category '{request.category}' not found")
    
    # Check if sub-category already exists under this parent
    existing = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.sub_category.lower(),
        CategoryModel.parent_id == parent_category.id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Sub-category already exists under this category")
    
    # Create the sub-category in the Category table
    sub_category = CategoryModel(name=request.sub_category, parent_id=parent_category.id)
    db.add(sub_category)
    db.commit()
    db.refresh(sub_category)
    
    return {"message": f"Sub-category '{request.sub_category}' created under '{request.category}' successfully", "id": sub_category.id}


class CategoryUpdate(BaseModel):
    old_name: str
    new_name: str

@router.put("/categories", status_code=status.HTTP_200_OK)
def update_category(request: CategoryUpdate, db: Session = Depends(get_db)):
    """Update a category name"""
    category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.old_name.lower()
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail=f"Category '{request.old_name}' not found")
    
    # Check if new name already exists
    existing = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.new_name.lower()
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{request.new_name}' already exists")
    
    category.name = request.new_name
    db.commit()
    
    return {"message": f"Category renamed from '{request.old_name}' to '{request.new_name}' successfully"}


class SubCategoryUpdate(BaseModel):
    category: str
    old_name: str
    new_name: str

@router.put("/sub-categories", status_code=status.HTTP_200_OK)
def update_sub_category(request: SubCategoryUpdate, db: Session = Depends(get_db)):
    """Update a sub-category name"""
    # Find the parent category
    parent_category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.category.lower()
    ).first()
    
    if not parent_category:
        raise HTTPException(status_code=404, detail=f"Parent category '{request.category}' not found")
    
    # Find the sub-category
    sub_category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.old_name.lower(),
        CategoryModel.parent_id == parent_category.id
    ).first()
    
    if not sub_category:
        raise HTTPException(status_code=404, detail=f"Sub-category '{request.old_name}' not found under '{request.category}'")
    
    # Check if new name already exists under this parent
    existing = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == request.new_name.lower(),
        CategoryModel.parent_id == parent_category.id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail=f"Sub-category '{request.new_name}' already exists under '{request.category}'")
    
    sub_category.name = request.new_name
    db.commit()
    
    return {"message": f"Sub-category renamed from '{request.old_name}' to '{request.new_name}' successfully"}


@router.delete("/categories/{category_name}", status_code=status.HTTP_200_OK)
def delete_category(category_name: str, db: Session = Depends(get_db)):
    """Delete a category and all its sub-categories and tools"""
    category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == category_name.lower()
    ).first()
    
    if not category:
        raise HTTPException(status_code=404, detail=f"Category '{category_name}' not found")
    
    # Get all sub-categories of this category
    sub_categories = db.query(CategoryModel).filter(CategoryModel.parent_id == category.id).all()
    sub_category_ids = [sub.id for sub in sub_categories]
    
    # Delete tools directly under this category
    tools_direct = db.query(ToolsListModel).filter(ToolsListModel.category_id == category.id).all()
    for tool in tools_direct:
        db.delete(tool)
    
    # Delete tools under all sub-categories
    if sub_category_ids:
        tools_sub = db.query(ToolsListModel).filter(ToolsListModel.sub_category_id.in_(sub_category_ids)).all()
        for tool in tools_sub:
            db.delete(tool)
    
    # Flush to ensure tools are deleted before deleting categories
    db.flush()
    
    # Delete all sub-categories
    for sub in sub_categories:
        db.delete(sub)
    
    # Delete the category
    db.delete(category)
    db.commit()
    
    return {"message": f"Category '{category_name}' and all its sub-categories and tools deleted successfully"}


@router.delete("/sub-categories/{category_name}/{sub_category_name}", status_code=status.HTTP_200_OK)
def delete_sub_category(category_name: str, sub_category_name: str, db: Session = Depends(get_db)):
    """Delete a sub-category and all its tools"""
    # Find the parent category
    parent_category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == category_name.lower()
    ).first()
    
    if not parent_category:
        raise HTTPException(status_code=404, detail=f"Parent category '{category_name}' not found")
    
    # Find the sub-category
    sub_category = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == sub_category_name.lower(),
        CategoryModel.parent_id == parent_category.id
    ).first()
    
    if not sub_category:
        raise HTTPException(status_code=404, detail=f"Sub-category '{sub_category_name}' not found under '{category_name}'")
    
    # Delete all tools under this sub-category
    tools = db.query(ToolsListModel).filter(ToolsListModel.sub_category_id == sub_category.id).all()
    for tool in tools:
        db.delete(tool)
    
    # Flush to ensure tools are deleted before deleting the sub-category
    db.flush()
    
    # Delete the sub-category
    db.delete(sub_category)
    db.commit()
    
    return {"message": f"Sub-category '{sub_category_name}' and all its tools deleted successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# 3-LEVEL TREE  ←  SIDEBAR ENDPOINT
#
# Structure returned:
# [
#   {
#     "category": "Tools",
#     "total_count": 2355,
#     "sub_categories": [
#       {
#         "sub_category": "Keys & Wrenches",
#         "count": 237,
#         "items": [
#           { "item_description": "Allen Key",   "count": 36 },
#           { "item_description": "Box Spanner", "count": 32 },
#           ...
#         ]
#       }
#     ]
#   }
# ]
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/categories/tree", response_model=List[CategoryTree])
def get_category_tree(db: Session = Depends(get_db)):
    # Get all categories from Category table
    categories = db.query(CategoryModel).filter(CategoryModel.parent_id == None).all()
    
    # Get all tools with category info for counts
    tools = db.query(
        ToolsListModel.category_id,
        ToolsListModel.sub_category_id,
        func.count(ToolsListModel.id).label("count")
    ).group_by(
        ToolsListModel.category_id,
        ToolsListModel.sub_category_id
    ).all()
    
    # Build a lookup for tool counts
    tool_counts = {}
    for tool in tools:
        # Tools directly under category (category_id set, sub_category_id NULL)
        if tool.category_id and not tool.sub_category_id:
            key = f"{tool.category_id}_direct"
            tool_counts[key] = tool.count
        # Tools under sub-category (sub_category_id set)
        elif tool.sub_category_id:
            key = f"{tool.sub_category_id}"
            tool_counts[key] = tool.count
    
    tree = []
    
    for category in categories:
        # Get sub-categories
        sub_categories = db.query(CategoryModel).filter(CategoryModel.parent_id == category.id).all()
        
        sub_category_list = []
        total_count = 0
        
        for sub in sub_categories:
            # Count tools in this sub-category
            count = tool_counts.get(f"{sub.id}", 0)
            total_count += count
            
            sub_category_list.append({
                "sub_category": sub.name,
                "count": count,
                "items": []  # Can be populated if needed
            })
        
        # Also count tools directly under this category (without sub-category)
        direct_count = tool_counts.get(f"{category.id}_direct", 0)
        total_count += direct_count
        
        tree.append({
            "category": category.name,
            "total_count": total_count,
            "sub_categories": sub_category_list
        })
    
    return tree


# ─────────────────────────────────────────────────────────────────────────────
# FETCH BY ITEM DESCRIPTION  ←  fills the table when user clicks a leaf node
# GET /tools-list/by-item?item_description=Allen Key
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/item/{item_description}", response_model=List[ToolsList])
def get_tools_by_item_description(item_description: str, db: Session = Depends(get_db)):
    """
    Called when user clicks e.g. 'Allen Key' in the sidebar.
    Returns all 36 Allen Key rows.
    """
    return (
        db.query(ToolsListModel)
        .filter(func.lower(ToolsListModel.item_description) == item_description.strip().lower())
        .order_by(ToolsListModel.id)
        .all()
    )


# ─────────────────────────────────────────────────────────────────────────────
# FETCH BY SUB-CATEGORY  (all items in a group, optional)
# GET /tools-list/category/Tools/sub/Keys & Wrenches
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/category/{category}/sub/{sub_category}", response_model=List[ToolsList])
def get_tools_by_sub_category(category: str, sub_category: str, db: Session = Depends(get_db)):
    # Find sub-category by name (it will have parent_id pointing to category)
    sub = db.query(CategoryModel).filter(
        func.lower(CategoryModel.name) == sub_category.lower()
    ).first()
    
    if not sub:
        return []
    
    # Verify the sub-category belongs to the specified category
    cat = db.query(CategoryModel).filter(CategoryModel.id == sub.parent_id).first()
    if not cat or cat.name.lower() != category.lower():
        return []
    
    # Filter by sub_category_id only (category_id will be NULL for sub-category tools)
    results = (
        db.query(ToolsListModel)
        .filter(ToolsListModel.sub_category_id == sub.id)
        .order_by(ToolsListModel.item_description, ToolsListModel.id)
        .all()
    )
    
    # Build response with category_name and sub_category_name
    tools_list = []
    for tool in results:
        tool_dict = {
            'id': tool.id,
            'item_description': tool.item_description,
            'range': tool.range,
            'identification_code': tool.identification_code,
            'make': tool.make,
            'quantity': tool.quantity,
            'total_quantity': tool.total_quantity,
            'issues_qty': tool.issues_qty,
            'location': tool.location,
            'gauge': tool.gauge,
            'remarks': tool.remarks,
            'amount': tool.amount,
            'ref_ledger': tool.ref_ledger,
            'type': tool.type,
            'category_id': tool.category_id,
            'sub_category_id': tool.sub_category_id,
            'category_name': cat.name if cat else None,
            'sub_category_name': sub.name if sub else None,
        }
        tools_list.append(ToolsList(**tool_dict))
    
    return tools_list


# ─────────────────────────────────────────────────────────────────────────────
# STANDARD CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[ToolsList])
def get_tools(
    category:     Optional[str] = None,
    sub_category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(ToolsListModel)
    
    if category and not sub_category:
        # Find category by name - get tools directly under this category OR under its sub-categories
        cat = db.query(CategoryModel).filter(func.lower(CategoryModel.name) == category.lower()).first()
        if cat:
            # Get all sub-categories of this category
            sub_cats = db.query(CategoryModel.id).filter(CategoryModel.parent_id == cat.id).all()
            sub_cat_ids = [s[0] for s in sub_cats]
            # Filter: tools directly under category OR under any of its sub-categories
            query = query.filter(
                (ToolsListModel.category_id == cat.id) | 
                (ToolsListModel.sub_category_id.in_(sub_cat_ids))
            )
    
    if sub_category:
        # Find sub-category by name
        sub = db.query(CategoryModel).filter(func.lower(CategoryModel.name) == sub_category.lower()).first()
        if sub:
            query = query.filter(ToolsListModel.sub_category_id == sub.id)
    
    results = query.all()
    
    # Build response with category_name and sub_category_name
    tools_list = []
    for tool in results:
        tool_dict = {
            'id': tool.id,
            'item_description': tool.item_description,
            'range': tool.range,
            'identification_code': tool.identification_code,
            'make': tool.make,
            'quantity': tool.quantity,
            'total_quantity': tool.total_quantity,
            'issues_qty': tool.issues_qty,
            'location': tool.location,
            'gauge': tool.gauge,
            'remarks': tool.remarks,
            'amount': tool.amount,
            'ref_ledger': tool.ref_ledger,
            'type': tool.type,
            'category_id': tool.category_id,
            'sub_category_id': tool.sub_category_id,
            'category_name': None,
            'sub_category_name': None,
        }
        
        # Get category name if category_id is set
        if tool.category_id:
            cat = db.query(CategoryModel).filter(CategoryModel.id == tool.category_id).first()
            if cat:
                tool_dict['category_name'] = cat.name
        
        # Get sub-category name if sub_category_id is set
        if tool.sub_category_id:
            sub_cat = db.query(CategoryModel).filter(CategoryModel.id == tool.sub_category_id).first()
            if sub_cat:
                tool_dict['sub_category_name'] = sub_cat.name
                # Get parent category name
                if sub_cat.parent_id:
                    parent_cat = db.query(CategoryModel).filter(CategoryModel.id == sub_cat.parent_id).first()
                    if parent_cat:
                        tool_dict['category_name'] = parent_cat.name
        
        tools_list.append(ToolsList(**tool_dict))
    
    return tools_list


@router.get("/type/{tool_type}", response_model=List[ToolsList])
def get_tools_by_type(tool_type: str, db: Session = Depends(get_db)):
    return db.query(ToolsListModel).filter(ToolsListModel.type == tool_type).all()


@router.get("/location/{location}", response_model=List[ToolsList])
def get_tools_by_location(location: str, db: Session = Depends(get_db)):
    return db.query(ToolsListModel).filter(ToolsListModel.location == location).all()


@router.get("/identification/{identification_code}", response_model=ToolsList)
def get_tool_by_identification_code(identification_code: str, db: Session = Depends(get_db)):
    tool = db.query(ToolsListModel).filter(
        ToolsListModel.identification_code == identification_code
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool '{identification_code}' not found")
    return tool


@router.get("/{tool_id}", response_model=ToolsList)
def get_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool id {tool_id} not found")
    return tool


@router.put("/{tool_id}", response_model=ToolsList)
def update_tool(tool_id: int, tool_update: ToolsListUpdate, db: Session = Depends(get_db)):
    db_tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not db_tool:
        raise HTTPException(status_code=404, detail=f"Tool id {tool_id} not found")

    if (tool_update.identification_code is not None
            and tool_update.identification_code != db_tool.identification_code):
        clash = db.query(ToolsListModel).filter(
            ToolsListModel.identification_code == tool_update.identification_code
        ).first()
        if clash:
            raise HTTPException(status_code=400, detail="Identification code already exists")

    update_data = tool_update.model_dump(exclude_unset=True)
    # Don't auto-resolve category on update - require explicit category if needed

    for field, value in update_data.items():
        setattr(db_tool, field, value)

    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tool(tool_id: int, db: Session = Depends(get_db)):
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not tool:
        raise HTTPException(status_code=404, detail=f"Tool id {tool_id} not found")
    db.delete(tool)
    db.commit()


# @router.post("/migrate-total-quantity", response_model=dict)
# def migrate_total_quantity(db: Session = Depends(get_db)):
#     tools = db.query(ToolsListModel).filter(ToolsListModel.total_quantity.is_(None)).all()
#     for t in tools:
#         t.total_quantity = t.quantity or 0
#     db.commit()
#     return {"message": f"Migrated {len(tools)} records", "updated_count": len(tools)}


# @router.post("/migrate-categories", response_model=dict)
# def migrate_categories(db: Session = Depends(get_db)):
#     tools = db.query(ToolsListModel).filter(ToolsListModel.category.is_(None)).all()
#     updated = 0
#     for t in tools:
#         cat, sub = resolve_category(t.item_description or "")
#         t.category     = cat
#         t.sub_category = sub
#         updated += 1
#     db.commit()
#     return {"message": f"Categorised {updated} records", "updated_count": updated}
