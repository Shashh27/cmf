from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from DB.database import get_db
from DB.models.oms import DocumentExtractedData as DocumentExtractedDataModel
from DB.schemas.oms import DocumentExtractedDataUpdate
from DB.models.inventory import RawMaterial as RawMaterialModel, RawMaterialStock as RawMaterialStockModel, RawMaterialUnit as RawMaterialUnitModel
from services.stock_recommendation_service import StockRecommendationService
from datetime import datetime

router = APIRouter(
    prefix="/planned-raw-materials",
    tags=["planned_raw_materials"]
)

class PlannedRawMaterialRequest(BaseModel):
    extracted_data_id: int
    planned_form_type: Optional[str] = None
    planned_diameter: Optional[float] = None
    planned_length: Optional[float] = None
    planned_breadth: Optional[float] = None
    planned_height: Optional[float] = None
    planned_inner_diameter: Optional[float] = None
    planned_outer_diameter: Optional[float] = None
    user_id: int

class BatchGetRequest(BaseModel):
    extracted_data_ids: List[int]

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
        # Get material name from the entry
        material_name = entry.material if entry.material else None
        
        # Build dimension string from planned dimensions
        dimension_str = ""
        if entry.planned_form_type == "Round" and entry.planned_diameter and entry.planned_length:
            dimension_str = f"{entry.planned_diameter}x{entry.planned_length}"
        elif entry.planned_form_type == "Square" and entry.planned_breadth and entry.planned_height and entry.planned_length:
            dimension_str = f"{entry.planned_breadth}x{entry.planned_height}x{entry.planned_length}"
        elif entry.planned_form_type == "Pipe" and entry.planned_outer_diameter and entry.planned_inner_diameter and entry.planned_length:
            dimension_str = f"{entry.planned_outer_diameter}x{entry.planned_inner_diameter}x{entry.planned_length}"
        
        # Fetch stock recommendations
        recommendations = []
        if material_name and dimension_str:
            recommendations = StockRecommendationService.recommend_stocks(
                db=db,
                extracted_material_name=material_name,
                extracted_dimensions_str=dimension_str,
                min_score=0.3,
                max_recommendations=5
            )
        
        result.append({
            "id": entry.id,
            "planned_form_type": entry.planned_form_type,
            "planned_diameter": entry.planned_diameter,
            "planned_length": entry.planned_length,
            "planned_breadth": entry.planned_breadth,
            "planned_height": entry.planned_height,
            "planned_inner_diameter": entry.planned_inner_diameter,
            "planned_outer_diameter": entry.planned_outer_diameter,
            "planned_by": entry.planned_by,
            "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
            "recommendations": recommendations
        })
    
    return result

@router.post("/create")
def create_planned_raw_material(
    request: PlannedRawMaterialRequest,
    db: Session = Depends(get_db)
):
    """Create a new planned raw material entry"""
    
    # Get the existing extracted data entry to verify it exists
    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == request.extracted_data_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )
    
    # Update the extracted data entry with planned raw material fields
    if request.planned_form_type is not None:
        extracted_entry.planned_form_type = request.planned_form_type
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
    if request.user_id is not None:
        extracted_entry.planned_by = request.user_id
    
    # Update timestamp
    extracted_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(extracted_entry)
        
        return {
            "success": True,
            "message": "Planned raw material created successfully",
            "data": {
                "id": extracted_entry.id,
                "planned_form_type": extracted_entry.planned_form_type,
                "planned_diameter": extracted_entry.planned_diameter,
                "planned_length": extracted_entry.planned_length,
                "planned_breadth": extracted_entry.planned_breadth,
                "planned_height": extracted_entry.planned_height,
                "planned_inner_diameter": extracted_entry.planned_inner_diameter,
                "planned_outer_diameter": extracted_entry.planned_outer_diameter,
                "planned_by": extracted_entry.planned_by,
                "updated_at": extracted_entry.updated_at.isoformat() if extracted_entry.updated_at else None
            }
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
    db: Session = Depends(get_db)
):
    """Update planned raw material dimensions for a specific extracted data entry"""
    
    # Get the existing extracted data entry
    extracted_entry = db.query(DocumentExtractedDataModel).filter(
        DocumentExtractedDataModel.id == extracted_data_id
    ).first()
    
    if not extracted_entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Extracted data entry not found"
        )
    
    # Update planned raw material fields
    if request.planned_form_type is not None:
        extracted_entry.planned_form_type = request.planned_form_type
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
    if request.user_id is not None:
        extracted_entry.planned_by = request.user_id
    
    # Update timestamp
    extracted_entry.updated_at = datetime.utcnow()
    
    try:
        db.commit()
        db.refresh(extracted_entry)
        
        return {
            "success": True,
            "message": "Planned raw material updated successfully",
            "data": {
                "id": extracted_entry.id,
                "planned_form_type": extracted_entry.planned_form_type,
                "planned_diameter": extracted_entry.planned_diameter,
                "planned_length": extracted_entry.planned_length,
                "planned_breadth": extracted_entry.planned_breadth,
                "planned_height": extracted_entry.planned_height,
                "planned_inner_diameter": extracted_entry.planned_inner_diameter,
                "planned_outer_diameter": extracted_entry.planned_outer_diameter,
                "planned_by": extracted_entry.planned_by,
                "updated_at": extracted_entry.updated_at.isoformat() if extracted_entry.updated_at else None
            }
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
