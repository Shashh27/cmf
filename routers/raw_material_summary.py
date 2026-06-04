"""
Raw Material Summary Router
File: routers/raw_material_summary.py

Add to main.py:
    from routers.raw_material_summary import router as raw_material_summary_router
    app.include_router(raw_material_summary_router, prefix="/api")

⚠️  IMPORTANT — Find your ExtractedData model name:
    Search your codebase for the model that has fields: part_id, material, stock_size
    Common names: ExtractedData, PartExtractedData, PartDocumentExtractedData
    Then update the import + _get_extracted_data() function below (marked with ⚙️)
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, text
from typing import List, Optional
from pydantic import BaseModel

from DB.database import get_db
from DB.models.oms import Order as OrderModel, Part as PartModel, Product as ProductModel
from DB.models.inventory import (
    RawMaterial as RawMaterialModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
    RawMaterialUsage as RawMaterialUsageModel,
    Vendors as VendorsModel,
)

# ⚙️  UPDATE THIS IMPORT to match your actual ExtractedData model
# Option A — if you have the model:
#   from DB.models.oms import ExtractedData as ExtractedDataModel
# Option B — leave as None and the router uses raw SQL fallback
ExtractedDataModel = None

router = APIRouter(
    prefix="/raw-material-summary",
    tags=["Raw Material Summary"],
)


# ─────────────────────────── Pydantic response models ────────────────────────

class PartSummary(BaseModel):
    part_id: int
    part_number: str
    part_name: str
    assembly_name: Optional[str] = None
    extracted_material: Optional[str] = None   # from part's extracted_data docs
    extracted_stock_size: Optional[str] = None
    assigned_unit_id: Optional[int] = None
    assigned_material_name: Optional[str] = None
    assigned_form_type: Optional[str] = None
    assigned_required_length: Optional[float] = None
    assigned_stock_source: Optional[str] = None  # "general" | "order"
    assigned_status: Optional[str] = None        # "assigned" | "pending"

    class Config:
        from_attributes = True


class MaterialRow(BaseModel):
    material_id: int
    material_name: str
    form_type: Optional[str] = None
    process_type: Optional[str] = None
    dimensions: Optional[str] = None
    total_stock_qty: int = 0
    available_qty: int = 0
    used_qty: int = 0
    estimated_cost: Optional[float] = None
    final_cost: Optional[float] = None
    order_status: Optional[str] = None
    source_type: str = "general"
    stock_id: Optional[int] = None
    vendor_names: Optional[str] = None
    received_vendor_name: Optional[str] = None
    stock_size: Optional[str] = None
    stock_size_kg: Optional[float] = None
    net_wt_kg: Optional[float] = None
    parts: List[PartSummary] = []

    class Config:
        from_attributes = True


class OrderSummary(BaseModel):
    order_id: int
    order_number: str
    customer_name: Optional[str] = None
    product_name: Optional[str] = None
    order_status: Optional[str] = None
    total_parts: int = 0
    parts_with_material: int = 0
    parts_pending_material: int = 0
    materials: List[MaterialRow] = []
    unassigned_parts: List[PartSummary] = []

    class Config:
        from_attributes = True


class SummaryStats(BaseModel):
    total_orders: int = 0
    total_materials_assigned: int = 0
    total_materials_pending: int = 0
    total_parts: int = 0
    total_purchased_cost: float = 0.0


class RawMaterialSummaryResponse(BaseModel):
    stats: SummaryStats
    orders: List[OrderSummary]


# ─────────────────────────── Extracted data helper ───────────────────────────

# Cache to avoid hitting bad table names repeatedly
_extracted_data_table: Optional[str] = None
_extracted_data_checked: bool = False


def _get_extracted_data_for_parts(part_ids: List[int], db: Session) -> dict:
    """
    Returns dict: { part_id: { "material": str, "stock_size": str } }

    Strategy:
    1. If ExtractedDataModel is set (you imported it above), use ORM query
    2. Otherwise try common raw-SQL table names as fallback
    3. If nothing found, return empty dict (extracted columns show as blank)
    """
    if not part_ids:
        return {}

    result = {}

    # ── Strategy 1: ORM (set ExtractedDataModel above) ──────────────────────
    if ExtractedDataModel is not None:
        try:
            rows = (
                db.query(ExtractedDataModel)
                .filter(ExtractedDataModel.part_id.in_(part_ids))
                .order_by(ExtractedDataModel.created_at.desc())
                .all()
            )
            for row in rows:
                pid = row.part_id
                if pid not in result:   # keep latest only (already sorted desc)
                    result[pid] = {
                        "material": getattr(row, "material", None),
                        "stock_size": getattr(row, "stock_size", None),
                    }
            return result
        except Exception:
            pass  # fall through to raw SQL

    # ── Strategy 2: raw SQL — try common table names ─────────────────────────
    global _extracted_data_table, _extracted_data_checked

    candidate_tables = [
        # schema.table  or  just table  — add your own if different
        "oms.document_extracted_data",
        "oms.extracted_data",
        "oms.part_extracted_data",
        "oms.part_document_extracted_data",
        "public.extracted_data",
        "public.part_extracted_data",
        "extracted_data",
        "part_extracted_data",
    ]

    if not _extracted_data_checked:
        for tbl in candidate_tables:
            try:
                db.execute(text(f"SELECT 1 FROM {tbl} LIMIT 1"))
                _extracted_data_table = tbl
                break
            except Exception:
                pass
        _extracted_data_checked = True

    if _extracted_data_table:
        try:
            ids_str = ",".join(str(i) for i in part_ids)
            rows = db.execute(
                text(
                    f"""
                    SELECT DISTINCT ON (part_id)
                        part_id,
                        material,
                        stock_size
                    FROM {_extracted_data_table}
                    WHERE part_id IN ({ids_str})
                    ORDER BY part_id, created_at DESC
                    """
                )
            ).fetchall()
            for row in rows:
                result[row[0]] = {
                    "material": row[1],
                    "stock_size": row[2],
                }
        except Exception:
            pass

    return result


# ─────────────────────────── Other helpers ───────────────────────────────────

def _dimensions_str(stock: RawMaterialStockModel) -> str:
    if stock.form_type == "Round":
        return f"⌀{stock.diameter} × {stock.length}mm" if stock.diameter and stock.length else ""
    elif stock.form_type == "Square":
        return f"{stock.breadth} × {stock.height} × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
    elif stock.form_type == "Pipe":
        return f"⌀{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
    return ""


def _get_vendor_names(stock: RawMaterialStockModel, db: Session):
    enquiry_names, received_name = None, None
    if stock.vendor_id:
        try:
            ids = [int(v.strip()) for v in stock.vendor_id.split(",") if v.strip()]
            vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(ids)).all()
            enquiry_names = ", ".join(v.company_name for v in vendors) if vendors else None
        except Exception:
            pass
    if stock.received_vendor_id:
        rv = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
        received_name = rv.company_name if rv else None
    return enquiry_names, received_name


# ─────────────────────────── Main endpoint ───────────────────────────────────

@router.get("/", response_model=RawMaterialSummaryResponse)
def get_raw_material_summary(
    admin_id: Optional[int] = None,
    manufacturing_coordinator_id: Optional[int] = None,
    order_id: Optional[int] = None,
    material_id: Optional[int] = None,
    order_status: Optional[str] = None,
    rm_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    # ── 1. Fetch orders ───────────────────────────────────────────────────────
    order_query = db.query(OrderModel).options(joinedload(OrderModel.product))
    if admin_id:
        order_query = order_query.filter(OrderModel.admin_id == admin_id)
    if manufacturing_coordinator_id:
        order_query = order_query.filter(
            OrderModel.manufacturing_coordinator_id == manufacturing_coordinator_id
        )
    if order_id:
        order_query = order_query.filter(OrderModel.id == order_id)
    # Note: order_status and approval_status filters removed to display ALL orders
    # if order_status:
    #     order_query = order_query.filter(OrderModel.status == order_status)
    # if approval_status:
    #     order_query = order_query.filter(OrderModel.approval_status == approval_status)

    # FIFO order based on ID (ascending - oldest first)
    orders = order_query.order_by(OrderModel.id.asc()).all()

    summary_orders: List[OrderSummary] = []
    stats = SummaryStats()
    stats.total_orders = len(orders)

    for order in orders:
        # ── 2. Get all parts for this order ──────────────────────────────────
        try:
            all_parts = db.query(PartModel).filter(
                PartModel.product_id == order.product_id
            ).all()
        except Exception:
            all_parts = []

        # Filter out STANDARD and Out-Source WITHOUT_RAW_MATERIAL
        eligible_parts = []
        for p in all_parts:
            type_name = (p.type.type_name or "").upper() if p.type else ""
            is_standard = type_name == "STANDARD"
            is_outsource_no_rm = type_name == "OUT-SOURCE" and (p.part_detail or "") == "WITHOUT_RAW_MATERIAL"
            if not (is_standard or is_outsource_no_rm):
                eligible_parts.append(p)

        # Note: Removed the continue statement to show ALL orders regardless of eligible parts
        # if not eligible_parts:
        #     continue

        stats.total_parts += len(eligible_parts)

        # ── 3. Bulk-fetch extracted data for ALL eligible parts at once ───────
        all_part_ids = [p.id for p in eligible_parts]
        extracted_map = _get_extracted_data_for_parts(all_part_ids, db)
        # extracted_map = { part_id: { "material": "...", "stock_size": "..." } }

        # ── 4. Order-procured stocks ──────────────────────────────────────────
        order_stocks = (
            db.query(RawMaterialStockModel)
            .filter(
                RawMaterialStockModel.source_order_id == order.id,
                RawMaterialStockModel.source_type == "order",
            )
            .options(joinedload(RawMaterialStockModel.material))
            .all()
        )

        material_rows: List[MaterialRow] = []

        for stock in order_stocks:
            if not stock.material:
                continue

            vendor_enquiry, vendor_received = _get_vendor_names(stock, db)

            units = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.stock_id == stock.id
            ).all()
            unit_ids = [u.id for u in units]
            total_qty = len(units)
            available_qty = len([u for u in units if u.status in ("available", "partially_used")])
            used_qty = len([u for u in units if u.status == "exhausted"])

            # Parts linked to this stock via stock.part_id (comma-separated)
            stock_part_ids = []
            if stock.part_id:
                try:
                    stock_part_ids = [int(p.strip()) for p in stock.part_id.split(",") if p.strip()]
                except Exception:
                    pass

            # Parts linked via usage records
            usage_part_ids = []
            if unit_ids:
                usages = db.query(RawMaterialUsageModel).filter(
                    RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids)
                ).all()
                usage_part_ids = list({u.part_id for u in usages})

            all_linked_ids = list(set(stock_part_ids + usage_part_ids))

            part_summaries: List[PartSummary] = []
            for pid in all_linked_ids:
                part = db.query(PartModel).filter(PartModel.id == pid).first()
                if not part:
                    continue

                # ✅ Extracted data from bulk-fetched map
                ext = extracted_map.get(pid, {})
                ext_material = ext.get("material")
                ext_stock_size = ext.get("stock_size")

                # Find usage record for required length
                usage = None
                if unit_ids:
                    usage = (
                        db.query(RawMaterialUsageModel)
                        .filter(
                            RawMaterialUsageModel.part_id == pid,
                            RawMaterialUsageModel.raw_material_unit_id.in_(unit_ids),
                        )
                        .first()
                    )

                part_summaries.append(
                    PartSummary(
                        part_id=part.id,
                        part_number=part.part_number or "",
                        part_name=part.part_name or "",
                        extracted_material=ext_material,
                        extracted_stock_size=ext_stock_size,
                        assigned_unit_id=part.raw_material_unit_id,
                        assigned_material_name=stock.material.material_name,
                        assigned_form_type=stock.form_type,
                        assigned_required_length=(
                            usage.used_length if usage else part.required_length
                        ),
                        assigned_stock_source="order",
                        assigned_status="assigned" if part.raw_material_unit_id else "pending",
                    )
                )

            material_rows.append(
                MaterialRow(
                    material_id=stock.material_id,
                    material_name=stock.material.material_name,
                    form_type=stock.form_type,
                    process_type=stock.process_type,
                    dimensions=_dimensions_str(stock),
                    total_stock_qty=total_qty,
                    available_qty=available_qty,
                    used_qty=used_qty,
                    estimated_cost=stock.estimated_cost,
                    final_cost=stock.final_cost,
                    order_status=stock.order_status,
                    source_type="order",
                    stock_id=stock.id,
                    vendor_names=vendor_enquiry,
                    received_vendor_name=vendor_received,
                    stock_size=_dimensions_str(stock),
                    stock_size_kg=stock.mass * total_qty if stock.mass else None,
                    net_wt_kg=stock.weight * total_qty if stock.weight else None,
                    parts=part_summaries,
                )
            )

        # ── 5. General-stock-linked parts ─────────────────────────────────────
        general_linked_parts = [
            p for p in eligible_parts if p.raw_material_unit_id is not None
        ]

        general_stock_map: dict = {}  # stock_id -> list of parts
        for p in general_linked_parts:
            unit = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.id == p.raw_material_unit_id
            ).first()
            if not unit:
                continue
            gstock = db.query(RawMaterialStockModel).filter(
                RawMaterialStockModel.id == unit.stock_id,
                RawMaterialStockModel.source_type == "general",
            ).first()
            if not gstock:
                continue
            if gstock.id not in general_stock_map:
                general_stock_map[gstock.id] = {"stock": gstock, "parts": []}
            general_stock_map[gstock.id]["parts"].append(p)

        for gstock_id, info in general_stock_map.items():
            if any(mr.stock_id == gstock_id for mr in material_rows):
                continue  # already listed as order stock

            gstock = info["stock"]
            if not gstock.material:
                continue

            g_units = db.query(RawMaterialUnitModel).filter(
                RawMaterialUnitModel.stock_id == gstock_id
            ).all()
            g_unit_ids = [u.id for u in g_units]

            g_parts: List[PartSummary] = []
            for p in info["parts"]:
                ext = extracted_map.get(p.id, {})
                usage = (
                    db.query(RawMaterialUsageModel)
                    .filter(
                        RawMaterialUsageModel.part_id == p.id,
                        RawMaterialUsageModel.raw_material_unit_id.in_(g_unit_ids),
                    )
                    .first()
                )
                g_parts.append(
                    PartSummary(
                        part_id=p.id,
                        part_number=p.part_number or "",
                        part_name=p.part_name or "",
                        extracted_material=ext.get("material"),
                        extracted_stock_size=ext.get("stock_size"),
                        assigned_unit_id=p.raw_material_unit_id,
                        assigned_material_name=gstock.material.material_name,
                        assigned_form_type=gstock.form_type,
                        assigned_required_length=(
                            usage.used_length if usage else p.required_length
                        ),
                        assigned_stock_source="general",
                        assigned_status="assigned",
                    )
                )

            material_rows.append(
                MaterialRow(
                    material_id=gstock.material_id,
                    material_name=gstock.material.material_name,
                    form_type=gstock.form_type,
                    process_type=gstock.process_type,
                    dimensions=_dimensions_str(gstock),
                    total_stock_qty=len(g_units),
                    available_qty=len([u for u in g_units if u.status in ("available", "partially_used")]),
                    used_qty=len([u for u in g_units if u.status == "exhausted"]),
                    source_type="general",
                    stock_id=gstock_id,
                    stock_size=_dimensions_str(gstock),
                    stock_size_kg=sum(u.mass for u in g_units if u.mass) if g_units else None,
                    net_wt_kg=sum(u.weight for u in g_units if u.weight) if g_units else None,
                    parts=g_parts,
                )
            )

        # ── 6. Parts with NO material assigned yet ────────────────────────────
        assigned_part_ids = {ps.part_id for mr in material_rows for ps in mr.parts}
        pending_parts = [p for p in eligible_parts if p.id not in assigned_part_ids]

        unassigned_part_summaries = []
        if pending_parts:
            for p in pending_parts:
                ext = extracted_map.get(p.id, {})
                unassigned_part_summaries.append(
                    PartSummary(
                        part_id=p.id,
                        part_number=p.part_number or "",
                        part_name=p.part_name or "",
                        extracted_material=ext.get("material"),
                        extracted_stock_size=ext.get("stock_size"),
                        assigned_status="pending",
                    )
                )

        if pending_parts:
            pending_summaries = []
            for p in pending_parts:
                ext = extracted_map.get(p.id, {})
                pending_summaries.append(
                    PartSummary(
                        part_id=p.id,
                        part_number=p.part_number or "",
                        part_name=p.part_name or "",
                        extracted_material=ext.get("material"),     # ✅ shows even for pending
                        extracted_stock_size=ext.get("stock_size"), # ✅ shows even for pending
                        assigned_status="pending",
                    )
                )
            material_rows.append(
                MaterialRow(
                    material_id=0,
                    material_name="⚠ Not Assigned",
                    source_type="none",
                    parts=pending_summaries,
                )
            )

        # ── 7. Apply filters ──────────────────────────────────────────────────
        if rm_status == "assigned":
            material_rows = [mr for mr in material_rows if mr.material_id != 0]
        elif rm_status == "pending":
            material_rows = [mr for mr in material_rows if mr.material_id == 0]
        if material_id:
            material_rows = [mr for mr in material_rows if mr.material_id == material_id]

        # ── 8. Per-order counts ───────────────────────────────────────────────
        all_ps = [ps for mr in material_rows for ps in mr.parts]
        parts_assigned = sum(1 for ps in all_ps if ps.assigned_status == "assigned")
        parts_pending  = sum(1 for ps in all_ps if ps.assigned_status == "pending")

        stats.total_materials_assigned += parts_assigned
        stats.total_materials_pending  += parts_pending
        stats.total_purchased_cost += sum(
            (mr.final_cost or mr.estimated_cost or 0)
            for mr in material_rows if mr.source_type == "order"
        )

        # Customer / product names
        customer_name, product_name = None, None
        try:
            if hasattr(order, "customer") and order.customer:
                customer_name = order.customer.company_name
            elif hasattr(order, "company_name"):
                customer_name = order.company_name
        except Exception:
            pass
        try:
            if order.product:
                product_name = order.product.product_name
        except Exception:
            pass

        summary_orders.append(
            OrderSummary(
                order_id=order.id,
                order_number=order.sale_order_number,
                customer_name=customer_name,
                product_name=product_name,
                order_status=order.status,
                total_parts=len(eligible_parts),
                parts_with_material=parts_assigned,
                parts_pending_material=parts_pending,
                materials=material_rows,
                unassigned_parts=unassigned_part_summaries,
            )
        )

    return RawMaterialSummaryResponse(stats=stats, orders=summary_orders)


@router.get("/{order_id_param}", response_model=OrderSummary)
def get_order_raw_material_summary(
    order_id_param: int,
    db: Session = Depends(get_db),
):
    result = get_raw_material_summary(order_id=order_id_param, db=db)
    if not result.orders:
        raise HTTPException(status_code=404, detail=f"Order {order_id_param} not found")
    return result.orders[0]