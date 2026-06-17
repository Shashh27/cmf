from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import pandas as pd
import io

from DB.database import get_db
from DB.models.inventory import ToolsList as ToolsListModel
from DB.schemas.inventory import (
    ToolsList,
    ToolsListCreate,
    ToolsListUpdate,
    ItemNode,
    SubCategoryNode,
    CategoryTree,
)
from DB.utils.category_map import resolve_category

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
    if not tool_data.get("category"):
        cat, sub = resolve_category(tool_data.get("item_description", ""))
        tool_data["category"]     = cat
        tool_data["sub_category"] = sub
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
            if cat_from_file:
                category     = cat_from_file
                sub_category = sub_from_file or resolve_category(item_desc or "")
            else:
                category, sub_category = resolve_category(item_desc or "")

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
                'category':         category,
                'sub_category':     sub_category,
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
    rows = (
        db.query(
            ToolsListModel.category,
            ToolsListModel.sub_category,
            ToolsListModel.item_description,
            ToolsListModel.range,
            ToolsListModel.identification_code,
            func.count(ToolsListModel.id).label("count"),
        )
        .group_by(
            ToolsListModel.category,
            ToolsListModel.sub_category,
            ToolsListModel.item_description,
            ToolsListModel.range,
            ToolsListModel.identification_code,
        )
        .order_by(
            ToolsListModel.category,
            ToolsListModel.sub_category,
            ToolsListModel.item_description,
        )
        .all()
    )

    tree: dict[str, dict] = {}

    for row in rows:
        cat  = row.category         or "Misc"
        sub  = row.sub_category     or "General"
        item = row.item_description or "Unknown"
        rng  = row.range
        id_code = row.identification_code
        cnt  = row.count

        if cat not in tree:
            tree[cat] = {"category": cat, "total_count": 0, "sub_categories": {}}

        if sub not in tree[cat]["sub_categories"]:
            tree[cat]["sub_categories"][sub] = {
                "sub_category": sub,
                "count": 0,
                "items": [],
            }

        tree[cat]["sub_categories"][sub]["items"].append(
            ItemNode(item_description=item, count=cnt, range=rng, identification_code=id_code)
        )
        tree[cat]["sub_categories"][sub]["count"] += cnt
        tree[cat]["total_count"] += cnt

    display_order = ["Tools", "Instruments", "Misc"]
    result = []
    for cat_key in sorted(tree.keys(), key=lambda x: display_order.index(x) if x in display_order else 99):
        d = tree[cat_key]
        result.append(CategoryTree(
            category=d["category"],
            total_count=d["total_count"],
            sub_categories=[SubCategoryNode(**s) for s in d["sub_categories"].values()],
        ))
    return result


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
    return (
        db.query(ToolsListModel)
        .filter(
            func.lower(ToolsListModel.category)     == category.lower(),
            func.lower(ToolsListModel.sub_category) == sub_category.lower(),
        )
        .order_by(ToolsListModel.item_description, ToolsListModel.id)
        .all()
    )


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
    if category:
        query = query.filter(func.lower(ToolsListModel.category) == category.lower())
    if sub_category:
        query = query.filter(func.lower(ToolsListModel.sub_category) == sub_category.lower())
    return query.all()


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
    if "item_description" in update_data and "category" not in update_data:
        cat, sub = resolve_category(update_data["item_description"])
        update_data["category"]     = cat
        update_data["sub_category"] = sub

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
