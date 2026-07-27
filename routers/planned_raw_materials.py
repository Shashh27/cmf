from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from DB.database import get_db
from DB.models.oms import DocumentExtractedData as DocumentExtractedDataModel, Part as PartModel
from DB.schemas.oms import DocumentExtractedDataUpdate
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, RawMaterialUnit as RawMaterialUnitModel
from DB.models.access_control import AccessUser as AccessUserModel
from auth.deps import get_current_user
from services.stock_recommendation_service import StockRecommendationService
from datetime import datetime

router = APIRouter(
    prefix="/planned-raw-materials",
    tags=["planned_raw_materials"]
)

class PlannedRawMaterialRequest(BaseModel):
    extracted_data_id: Optional[int] = None
    planned_form_type: Optional[str] = None
    planned_diameter: Optional[float] = None
    planned_length: Optional[float] = None
    planned_breadth: Optional[float] = None
    planned_height: Optional[float] = None
    planned_inner_diameter: Optional[float] = None
    planned_outer_diameter: Optional[float] = None
    planned_raw_material_id: Optional[int] = None
    user_id: Optional[int] = None


class ManualPlannedRawMaterialRequest(BaseModel):
    """Plan raw material for a part with no 2D document / PDF extraction."""
    part_id: int
    planned_form_type: Optional[str] = None
    planned_diameter: Optional[float] = None
    planned_length: Optional[float] = None
    planned_breadth: Optional[float] = None
    planned_height: Optional[float] = None
    planned_inner_diameter: Optional[float] = None
    planned_outer_diameter: Optional[float] = None
    planned_raw_material_id: Optional[int] = None
    user_id: Optional[int] = None

class BatchGetRequest(BaseModel):
    extracted_data_ids: List[int]

class MaterialRecommendRequest(BaseModel):
    material_name: str
    max_recommendations: int = 10


def _part_has_stock_assignment(db: Session, part_id: int) -> bool:
    """True when part is linked to general stock unit or order (procured) stock."""
    part = db.query(PartModel).filter(PartModel.id == part_id).first()
    if not part:
        return False
    if part.raw_material_unit_id:
        return True

    order_stocks = db.query(RawMaterialStockModel).filter(
        RawMaterialStockModel.source_type == "order",
        RawMaterialStockModel.part_id.isnot(None),
    ).all()
    for stock in order_stocks:
        if not stock.part_id:
            continue
        linked_part_ids = [
            int(pid.strip()) for pid in stock.part_id.split(",") if pid.strip().isdigit()
        ]
        if part_id in linked_part_ids:
            return True
    return False


def _ensure_planned_rm_editable(db: Session, extracted_entry: DocumentExtractedDataModel) -> None:
    if _part_has_stock_assignment(db, extracted_entry.part_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change planned raw material because stock is already assigned or procured. Unlink stock first.",
        )


def _apply_planned_rm_fields(
    extracted_entry: DocumentExtractedDataModel,
    request: PlannedRawMaterialRequest,
) -> None:
    """Apply planned fields and clear dimensions not used by the selected form type."""
    if request.planned_form_type is not None:
        extracted_entry.planned_form_type = request.planned_form_type

    extracted_entry.planned_diameter = None
    extracted_entry.planned_breadth = None
    extracted_entry.planned_height = None
    extracted_entry.planned_inner_diameter = None
    extracted_entry.planned_outer_diameter = None
    extracted_entry.planned_length = None

    form_type = request.planned_form_type or extracted_entry.planned_form_type
    if form_type == "Round":
        extracted_entry.planned_diameter = request.planned_diameter
        extracted_entry.planned_length = request.planned_length
    elif form_type == "Square":
        extracted_entry.planned_breadth = request.planned_breadth
        extracted_entry.planned_height = request.planned_height
        extracted_entry.planned_length = request.planned_length
    elif form_type == "Pipe":
        extracted_entry.planned_inner_diameter = request.planned_inner_diameter
        extracted_entry.planned_outer_diameter = request.planned_outer_diameter
        extracted_entry.planned_length = request.planned_length
    else:
        if request.planned_diameter is not None:
            extracted_entry.planned_diameter = request.planned_diameter
        if request.planned_length is not None:
            extracted_entry.planned_length = request.planned_length
        if request.planned_breadth is not None:
            extracted_entry.planned_breadth = request.planned_breadth
        if request.planned_height is not None:
            extracted_entry.planned_height = request.planned_height
        if request.planned_inner_diameter is not None:
            extracted_entry.planned_inner_diameter = request.planned_inner_diameter
        if request.planned_outer_diameter is not None:
            extracted_entry.planned_outer_diameter = request.planned_outer_diameter

    if request.planned_raw_material_id is not None:
        extracted_entry.planned_raw_material_id = request.planned_raw_material_id
    if request.user_id is not None:
        extracted_entry.planned_by = request.user_id


def _validate_planned_raw_material_id(db: Session, planned_raw_material_id: Optional[int]) -> RawMaterialModel:
    if planned_raw_material_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="planned_raw_material_id is required",
        )
    material = db.query(RawMaterialModel).filter(
        RawMaterialModel.id == planned_raw_material_id
    ).first()
    if not material:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw material with id {planned_raw_material_id} not found",
        )
    return material


def _planned_rm_response_data(extracted_entry: DocumentExtractedDataModel) -> dict:
    return {
        "id": extracted_entry.id,
        "part_id": extracted_entry.part_id,
        "document_id": extracted_entry.document_id,
        "material": extracted_entry.material,
        "planned_form_type": extracted_entry.planned_form_type,
        "planned_diameter": extracted_entry.planned_diameter,
        "planned_length": extracted_entry.planned_length,
        "planned_breadth": extracted_entry.planned_breadth,
        "planned_height": extracted_entry.planned_height,
        "planned_inner_diameter": extracted_entry.planned_inner_diameter,
        "planned_outer_diameter": extracted_entry.planned_outer_diameter,
        "planned_raw_material_id": extracted_entry.planned_raw_material_id,
        "planned_by": extracted_entry.planned_by,
        "updated_at": extracted_entry.updated_at.isoformat() if extracted_entry.updated_at else None,
    }

@router.post("/recommend-materials")
def recommend_materials(
    request: MaterialRecommendRequest,
    db: Session = Depends(get_db)
):
    """Recommend master raw materials for an extracted material name (fuzzy/partial match)."""
    recommendations = StockRecommendationService.find_matching_materials(
        db=db,
        extracted_material_name=request.material_name,
        max_recommendations=request.max_recommendations,
    )
    return {
        "success": True,
        "extracted_material_name": request.material_name,
        "recommendations": recommendations,
        "total": len(recommendations),
        "has_match": len(recommendations) > 0,
    }

@router.post("/batch-get")
def batch_get_planned_raw_materials(
    request: BatchGetRequest,
    db: Session = Depends(get_db)
):
    """Get planned raw material details for multiple extracted data entries with stock recommendations"""
    
    extracted_entries = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id.in_(request.extracted_data_ids)
    ).all()
    
    result = []
    for entry in extracted_entries:
        # Fetch stock recommendations using planned material when set
        recommendations = []
        material_name = entry.material if entry.material else None
        resolved_material_id = entry.planned_raw_material_id

        # Build dimension string from planned dimensions
        dimension_str = ""
        if entry.planned_form_type == "Round" and entry.planned_diameter and entry.planned_length:
            dimension_str = f"{entry.planned_diameter}x{entry.planned_length}"
        elif entry.planned_form_type == "Square" and entry.planned_breadth and entry.planned_height and entry.planned_length:
            dimension_str = f"{entry.planned_breadth}x{entry.planned_height}x{entry.planned_length}"
        elif entry.planned_form_type == "Pipe" and entry.planned_outer_diameter and entry.planned_inner_diameter and entry.planned_length:
            dimension_str = f"{entry.planned_outer_diameter}x{entry.planned_inner_diameter}x{entry.planned_length}"

        material_recommendations = []
        if material_name:
            material_recommendations = StockRecommendationService.find_matching_materials(
                db=db,
                extracted_material_name=material_name,
                max_recommendations=10,
            )

        if material_name and dimension_str:
            recommendations = StockRecommendationService.recommend_stocks(
                db=db,
                extracted_material_name=material_name,
                extracted_dimensions_str=dimension_str,
                min_score=0.3,
                max_recommendations=5,
                required_length=entry.planned_length,
                material_id=resolved_material_id,
            )

        result.append({
            "id": entry.id,
            "material": entry.material,
            "planned_raw_material_id": entry.planned_raw_material_id,
            "planned_form_type": entry.planned_form_type,
            "planned_diameter": entry.planned_diameter,
            "planned_length": entry.planned_length,
            "planned_breadth": entry.planned_breadth,
            "planned_height": entry.planned_height,
            "planned_inner_diameter": entry.planned_inner_diameter,
            "planned_outer_diameter": entry.planned_outer_diameter,
            "planned_by": entry.planned_by,
            "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
            "material_recommendations": material_recommendations,
            "recommendations": recommendations
        })
    
    return result

@router.post("/create-manual")
def create_manual_planned_raw_material(
    request: ManualPlannedRawMaterialRequest,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """
    Plan raw material for a part without a 2D document or PDF extraction.
    Creates or updates a document_extracted_data row with document_id=NULL.
    """
    if request.user_id is None:
        request.user_id = current_user.id

    part = db.query(PartModel).filter(PartModel.id == request.part_id).first()
    if not part:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Part not found")

    material = _validate_planned_raw_material_id(db, request.planned_raw_material_id)

    existing_manual = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.part_id == request.part_id,
        DocumentExtractedDataModel.document_id.is_(None),
    ).first()

    if existing_manual:
        _ensure_planned_rm_editable(db, existing_manual)
        extracted_entry = existing_manual
        extracted_entry.material = None  # keep Flow 1 distinct from Flow 3
    else:
        if _part_has_stock_assignment(db, request.part_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change planned raw material because stock is already assigned or procured. Unlink stock first.",
            )
        extracted_entry = DocumentExtractedDataModel(
            document_id=None,
            part_id=request.part_id,
            material=None,  # Flows 1–2: keep extracted material empty; planned_* holds selection
        )
        db.add(extracted_entry)
        db.flush()

    planned_request = PlannedRawMaterialRequest(
        extracted_data_id=extracted_entry.id,
        planned_form_type=request.planned_form_type,
        planned_diameter=request.planned_diameter,
        planned_length=request.planned_length,
        planned_breadth=request.planned_breadth,
        planned_height=request.planned_height,
        planned_inner_diameter=request.planned_inner_diameter,
        planned_outer_diameter=request.planned_outer_diameter,
        planned_raw_material_id=request.planned_raw_material_id,
        user_id=request.user_id,
    )
    _apply_planned_rm_fields(extracted_entry, planned_request)
    # Do not write planned material into extracted `material` (keeps Flow 1/2 vs Flow 3 distinct)
    extracted_entry.updated_at = datetime.utcnow()

    try:
        db.commit()
        db.refresh(extracted_entry)
        return {
            "success": True,
            "message": "Planned raw material saved successfully (no 2D document)",
            "data": _planned_rm_response_data(extracted_entry),
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save manual planned raw material: {str(e)}",
        )

@router.post("/create")
def create_planned_raw_material(
    request: PlannedRawMaterialRequest,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """Create a new planned raw material entry"""
    if request.user_id is None:
        request.user_id = current_user.id
    
    # Get the existing extracted data entry to verify it exists
    if not request.extracted_data_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="extracted_data_id is required",
        )

    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == request.extracted_data_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )

    _ensure_planned_rm_editable(db, extracted_entry)

    if request.planned_raw_material_id is not None:
        _validate_planned_raw_material_id(db, request.planned_raw_material_id)
        # Do not overwrite extracted `material` — that field is OCR-only (Flow 3).
        # Planned selection lives in planned_raw_material_id.

    _apply_planned_rm_fields(extracted_entry, request)
    
    # Update timestamp
    extracted_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(extracted_entry)
        
        return {
            "success": True,
            "message": "Planned raw material created successfully",
            "data": _planned_rm_response_data(extracted_entry),
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create planned raw material: {str(e)}"
        )

@router.put("/update/{extracted_data_id}")
def update_planned_raw_material(
    extracted_data_id: int,
    request: PlannedRawMaterialRequest,
    db: Session = Depends(get_db),
    current_user: AccessUserModel = Depends(get_current_user),
):
    """Update planned raw material dimensions for a specific extracted data entry"""
    if request.user_id is None:
        request.user_id = current_user.id
    
    # Get the existing extracted data entry
    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == extracted_data_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )

    _ensure_planned_rm_editable(db, extracted_entry)

    if request.planned_raw_material_id is not None:
        _validate_planned_raw_material_id(db, request.planned_raw_material_id)
        # Do not overwrite extracted `material` — OCR-only (Flow 3).
        # If this row has no stock_size, clear polluted planned name from older saves.
        if not extracted_entry.stock_size:
            extracted_entry.material = None

    _apply_planned_rm_fields(extracted_entry, request)
    
    # Update timestamp
    extracted_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(extracted_entry)
        
        return {
            "success": True,
            "message": "Planned raw material updated successfully",
            "data": _planned_rm_response_data(extracted_entry),
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update planned raw material: {str(e)}"
        )

@router.get("/{extracted_data_id}")
def get_planned_raw_material(
    extracted_data_id: int,
    db: Session = Depends(get_db)
):
    """Get planned raw material details for a specific extracted data entry"""
    
    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == extracted_data_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )
    
    return {
        "id": extracted_entry.id,
        "material": extracted_entry.material,
        "planned_raw_material_id": extracted_entry.planned_raw_material_id,
        "planned_form_type": extracted_entry.planned_form_type,
        "planned_diameter": extracted_entry.planned_diameter,
        "planned_length": extracted_entry.planned_length,
        "planned_breadth": extracted_entry.planned_breadth,
        "planned_height": extracted_entry.planned_height,
        "planned_inner_diameter": extracted_entry.planned_inner_diameter,
        "planned_outer_diameter": extracted_entry.planned_outer_diameter,
        "planned_by": extracted_entry.planned_by,
        "created_at": extracted_entry.created_at.isoformat() if extracted_entry.created_at else None,
        "updated_at": extracted_entry.updated_at.isoformat() if extracted_entry.updated_at else None
    }
