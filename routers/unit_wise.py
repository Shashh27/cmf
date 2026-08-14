"""Unit-wise schedule API — NSGA-II + Policy Engine."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from DB.database import get_db
from unit_wise_compare import compare_order_schedules, compare_part_schedules
from unit_wise_scheduler import (
    list_unit_schedule,
    rebuild_unit_schedule,
    unit_item_to_dict,
    unit_wise_enabled,
)

router = APIRouter(prefix="/scheduling/unit-wise", tags=["unit-wise-scheduling"])
logger = logging.getLogger(__name__)


class UnitWiseRebuildRequest(BaseModel):
    part_id: Optional[int] = Field(None, description="Limit rebuild to one part")
    order_id: Optional[int] = Field(None, description="Limit rebuild to one order")
    optimizer: Optional[str] = Field(
        None,
        description='optimizer: "greedy" | "nsga2" (default: greedy)',
    )
    policy: Optional[str] = Field(
        "balanced",
        description=(
            "Policy Engine selection policy. "
            'Options: "balanced" | "throughput" | "minimum_setup" | '
            '"minimum_makespan" | "rush_order" | "energy_efficient". '
            "Default: balanced"
        ),
    )
    debug: Optional[bool] = Field(
        False,
        description=(
            "Developer mode: attach optimizer profiling metrics to the response. "
            "Must NOT be used in production API calls."
        ),
    )
    quick: Optional[bool] = Field(
        False,
        description=(
            "Shop-floor quick GA: smaller population/generations/runs "
            "(16×20×1). Ignored for greedy."
        ),
    )
    population: Optional[int] = Field(None, ge=4, le=200, description="NSGA-II population size")
    generations: Optional[int] = Field(None, ge=1, le=500, description="NSGA-II generations")
    runs: Optional[int] = Field(None, ge=1, le=10, description="Independent NSGA-II runs")


def _require_enabled():
    if not unit_wise_enabled():
        raise HTTPException(
            status_code=503,
            detail="Unit-wise scheduling is disabled. Set UNIT_WISE_SCHEDULE_ENABLED=true.",
        )


@router.post("/rebuild")
def rebuild_unit_wise_schedule(
    body: Optional[UnitWiseRebuildRequest] = None,
    db: Session = Depends(get_db),
):
    """
    Generate / refresh unit-wise production schedule.

    Optimization path: Greedy → NSGA-II → Pareto Front → Policy Engine → Final Schedule

    - **greedy** — list scheduling / earliest start (no GA)
    - **nsga2** — NSGA-II multi-objective optimizer with Policy Engine selection

    The `policy` field controls how the Policy Engine selects one schedule from
    the NSGA-II Pareto front. The default policy is `balanced`.

    The production response contains business-relevant fields only.
    Set `debug=true` to include optimizer profiling metrics (dev mode).
    """
    _require_enabled()
    body = body or UnitWiseRebuildRequest()
    optimizer = (body.optimizer or "greedy").lower().strip()
    if optimizer not in ("greedy", "nsga2", "ga", "ga_research"):
        raise HTTPException(400, 'optimizer must be "greedy" or "nsga2"')
    policy = (body.policy or "balanced").lower().strip()
    ga_overrides = {}
    if body.quick:
        ga_overrides.update({"population": 16, "generations": 20, "runs": 1})
    if body.population is not None:
        ga_overrides["population"] = int(body.population)
    if body.generations is not None:
        ga_overrides["generations"] = int(body.generations)
    if body.runs is not None:
        ga_overrides["runs"] = int(body.runs)
    try:
        result = rebuild_unit_schedule(
            db,
            part_id=body.part_id,
            order_id=body.order_id,
            commit=True,
            optimizer=optimizer,
            policy=policy,
            debug=bool(body.debug),
            ga_overrides=ga_overrides or None,
        )
        logger.info(
            "Unit-wise rebuild API",
            extra={
                "event": "unit_wise_rebuild_api",
                "part_id": body.part_id,
                "order_id": body.order_id,
                "optimizer": result.get("optimizer"),
                "policy": result.get("policy"),
                "selected": result.get("selected"),
                "improved": result.get("improved"),
                "source": result.get("source"),
                "rows_inserted": result.get("rows_inserted"),
                "schedule_version": result.get("schedule_version"),
                "makespan_hours": result.get("makespan_hours"),
            },
        )
        return result
    except Exception as e:
        db.rollback()
        logger.exception(
            "Unit-wise rebuild failed",
            extra={"event": "unit_wise_rebuild_failed"},
        )
        raise HTTPException(500, f"Unit-wise rebuild failed: {e}") from e


@router.get("/compare")
def compare_batch_vs_unit_wise(
    part_id: Optional[int] = Query(None),
    order_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Side-by-side KPIs for batch dynamic vs unit-wise (greedy or NSGA-II plan).
    Provide part_id and/or order_id.
    """
    _require_enabled()
    if part_id is None and order_id is None:
        raise HTTPException(
            400, "Provide part_id and/or order_id for comparison."
        )
    try:
        if order_id is not None and part_id is None:
            result = compare_order_schedules(db, order_id)
        else:
            result = compare_part_schedules(db, part_id)
            if order_id is not None:
                result["order_id_filter"] = order_id
        logger.info(
            "Unit-wise compare",
            extra={
                "event": "unit_wise_compare",
                "part_id": part_id,
                "order_id": order_id,
            },
        )
        return result
    except Exception as e:
        logger.exception(
            "Unit-wise compare failed",
            extra={"event": "unit_wise_compare_failed"},
        )
        raise HTTPException(500, f"Compare failed: {e}") from e


@router.get("")
def get_unit_wise_schedule(
    part_id: Optional[int] = Query(None),
    order_id: Optional[int] = Query(None),
    machine_id: Optional[int] = Query(None),
    latest_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    """List unit-wise schedule segments (default: latest schedule_version)."""
    _require_enabled()
    rows = list_unit_schedule(
        db,
        part_id=part_id,
        order_id=order_id,
        machine_id=machine_id,
        latest_only=latest_only,
    )
    items = [unit_item_to_dict(r) for r in rows]
    version = max((i["schedule_version"] for i in items if i.get("schedule_version") is not None), default=None)
    sources = sorted({str(i.get("source") or "greedy") for i in items})
    return {
        "total": len(items),
        "schedule_version": version,
        "source": sources[0] if len(sources) == 1 else (sources or ["greedy"])[0],
        "sources": sources,
        "items": items,
    }


@router.get("/machines/{machine_id}")
def get_unit_wise_for_machine(machine_id: int, db: Session = Depends(get_db)):
    _require_enabled()
    rows = list_unit_schedule(db, machine_id=machine_id, latest_only=True)
    return {
        "machine_id": machine_id,
        "total": len(rows),
        "items": [unit_item_to_dict(r) for r in rows],
    }


@router.get("/parts/{part_id}")
def get_unit_wise_for_part(part_id: int, db: Session = Depends(get_db)):
    _require_enabled()
    rows = list_unit_schedule(db, part_id=part_id, latest_only=True)
    return {
        "part_id": part_id,
        "total": len(rows),
        "items": [unit_item_to_dict(r) for r in rows],
    }
