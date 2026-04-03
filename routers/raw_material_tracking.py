"""
Raw Material Tracking API Routes

Provides endpoints for real-time raw material tracking with parts:
- Step 1: Allocate/deallocate raw materials to parts with automatic calculations
- Step 2: Check material availability before linking
- Step 3: Manage part material requirements
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from DB.database import get_db
from DB.schemas.inventory import RawMaterialStockUpdate
from DB.schemas.oms import PartUpdate
from services.raw_material_tracking import RawMaterialTrackingService
from services.stock_auto_update import StockAutoUpdateService
# from ..auth import get_current_user  # May need to adjust based on your auth structure

router = APIRouter(prefix="/rawmaterials/tracking", tags=["raw-material-tracking"])


@router.post("/allocate")
async def allocate_raw_material_to_part(
    part_id: int,
    stock_id: int,
    required_quantity: float,
    user_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Allocate raw material stock to a part
    
    - Subtracts quantity from stock available_quantity
    - Adds to allocated_quantity
    - Recalculates volume, mass, weight, cost automatically
    - Updates part with required quantity and stock reference
    """
    try:
        result = RawMaterialTrackingService.allocate_raw_material_to_part(
            db, part_id, stock_id, required_quantity, user_id
        )
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Allocation failed: {str(e)}"
        )


@router.post("/allocate/bulk")
async def allocate_raw_material_to_parts_bulk(
    allocations: List[Dict[str, Any]],
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Bulk allocate raw material stock to multiple parts
    
    Expected format:
    [
        {
            "part_id": 1403,
            "stock_id": 171,
            "required_quantity": 5.0,
            "user_id": 16
        },
        {
            "part_id": 1404,
            "stock_id": 171,
            "required_quantity": 5.0,
            "user_id": 16
        }
    ]
    """
    results = []
    failed_allocations = []
    
    for allocation in allocations:
        try:
            result = RawMaterialTrackingService.allocate_raw_material_to_part(
                db, 
                allocation["part_id"], 
                allocation["stock_id"], 
                allocation["required_quantity"], 
                allocation["user_id"]
            )
            results.append({
                "part_id": allocation["part_id"],
                "success": True,
                "result": result
            })
        except Exception as e:
            failed_allocations.append({
                "part_id": allocation["part_id"],
                "success": False,
                "error": str(e)
            })
    
    return {
        "success": len(failed_allocations) == 0,
        "total_allocations": len(allocations),
        "successful_allocations": len(results),
        "failed_allocations": len(failed_allocations),
        "results": results,
        "failed_allocations": failed_allocations
    }
