"""
Intelligent Scheduler allocation routes.

Mounted under /api/v1 with prefix /scheduling/unit-wise (same as plan paths).
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from DB.database import get_db
from intelligent_scheduler.schemas import QtyAllocationsPutRequest
from intelligent_scheduler.service import (
    get_allocations_for_part,
    get_unit_wise_part_operation_details,
    list_active_inhouse_parts,
    replace_allocations_for_part,
)

# Same prefix as routers.unit_wise — FastAPI merges routes from both routers.
router = APIRouter(prefix="/scheduling/unit-wise", tags=["intelligent-scheduler"])
logger = logging.getLogger(__name__)


@router.get("/active-parts")
def get_active_inhouse_parts(db: Session = Depends(get_db)):
    """Active IN-House parts available for manual qty allocation."""
    return {"parts": list_active_inhouse_parts(db)}


@router.get("/qty-machine-allocations")
def get_qty_machine_allocations(
    part_id: int = Query(..., description="Part id (active IN-House)"),
    order_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    try:
        return get_allocations_for_part(db, part_id, order_id=order_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GET qty-machine-allocations failed")
        raise HTTPException(500, f"Failed to load allocations: {e}") from e


@router.get("/part-operation-details/{sale_order_id}/{part_id}")
def get_unit_wise_part_operation_details_route(
    sale_order_id: int,
    part_id: int,
    db: Session = Depends(get_db),
):
    """
    Unit-wise part details.

    planned_* comes from planned_schedule_items. A missing window stays empty.
    actual_* comes from production logs.
    schedule_version comes from unit_schedule_items.
    """
    try:
        return get_unit_wise_part_operation_details(db, sale_order_id, part_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("GET unit-wise part-operation-details failed")
        raise HTTPException(500, f"Failed to load unit-wise part details: {e}") from e


@router.put("/qty-machine-allocations/{part_id}")
def put_qty_machine_allocations(
    part_id: int,
    body: QtyAllocationsPutRequest,
    db: Session = Depends(get_db),
):
    """
    Replace qty→machine bands for a part.

    Operations whose bands changed are replaced.
    Operations sent again with the same split keep their existing rows
    and timestamps. An operation with no saved bands yet is stored as one
    process-plan band covering units 1..qty on the routing machine.
    """
    try:
        result = replace_allocations_for_part(
            db,
            part_id,
            body.allocations or [],
            order_id=body.order_id,
            created_by=body.created_by,
            commit=True,
        )
        logger.info(
            "Qty allocations replaced",
            extra={
                "event": "qty_allocations_put",
                "part_id": part_id,
                "bands": len(body.allocations or []),
            },
        )
        return result
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.exception("PUT qty-machine-allocations failed")
        raise HTTPException(500, f"Failed to save allocations: {e}") from e
