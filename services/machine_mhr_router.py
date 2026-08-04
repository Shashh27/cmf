# services/machine_mhr_router.py
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel, MHRParticular, MachineMHRValue
from DB.schemas.configuration import (
    MachineMHRResponse,
    MHRValueUpdate,
    MHRRecalculationResponse,
    MachineMHRValueWithDetails,
    MHRParticular as MHRParticularSchema,
)
from .machine_mhr_service import recalculate_machine_mhr

router = APIRouter(prefix="/machines/{machine_id}/mhr", tags=["machine-mhr"])


@router.get("", response_model=MachineMHRResponse)
@router.get("/", response_model=MachineMHRResponse, include_in_schema=False)
def get_machine_mhr(machine_id: int, db: Session = Depends(get_db)):
    """Returns only the particulars/rows that apply to this machine, in order."""
    # Check machine exists
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Get applicable values with particulars
    rows = db.execute(text("""
        SELECT mv.id, mv.machine_id, mv.particular_id, mv.is_applicable,
               mv.sequence_override, mv.input_value, mv.computed_value,
               mv.updated_by, mv.updated_at,
               p.id as particular_id, p.code, p.name, p.is_input, p.formula,
               p.default_sequence, p.unit, p.is_active, p.created_by, p.created_at
        FROM configuration.machine_mhr_values mv
        JOIN configuration.mhr_particulars p ON p.id = mv.particular_id
        WHERE mv.machine_id = :mid AND mv.is_applicable = true
        ORDER BY COALESCE(mv.sequence_override, p.default_sequence)
    """), {"mid": machine_id}).mappings().all()

    values = []
    for row in rows:
        particular_data = {
            "id": row["particular_id"],
            "code": row["code"],

            "name": row["name"],
            "is_input": row["is_input"],
            "formula": row["formula"],
            "default_sequence": row["default_sequence"],
            "unit": row["unit"],
            "is_active": row["is_active"],
            "created_by": row["created_by"],
            "created_at": row["created_at"],
        }
        value_data = {
            "id": row["id"],
            "machine_id": row["machine_id"],
            "particular_id": row["particular_id"],
            "is_applicable": row["is_applicable"],
            "sequence_override": row["sequence_override"],
            "input_value": row["input_value"],
            "computed_value": row["computed_value"],
            "updated_by": row["updated_by"],
            "updated_at": row["updated_at"],
            "particular": MHRParticularSchema(**particular_data),
        }
        values.append(MachineMHRValueWithDetails(**value_data))

    return MachineMHRResponse(
        machine_id=machine_id,
        values=values,
        final_mhr=machine.mhr,
        recommended_mhr=machine.recommended_mhr,
        mhr_calculated_at=machine.mhr_calculated_at,
    )


@router.put("/values", response_model=MHRRecalculationResponse)
def upsert_mhr_values(
    machine_id: int,
    payload: List[MHRValueUpdate],
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    """Bulk update input_value for one or more particulars, then recalculate."""
    # Check machine exists
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    for item in payload:
        db.execute(text("""
            INSERT INTO configuration.machine_mhr_values 
            (machine_id, particular_id, input_value, updated_by, is_applicable)
            VALUES (:mid, :pid, :val, :uid, true)
            ON CONFLICT (machine_id, particular_id)
            DO UPDATE SET input_value = :val, updated_by = :uid, updated_at = now()
        """), {"mid": machine_id, "pid": item.particular_id, "val": item.value, "uid": user_id})
    db.commit()
    result = recalculate_machine_mhr(db, machine_id, user_id)
    return {"context": result, "final_mhr": result.get("MHR")}


@router.post("/particulars/{particular_id}/toggle")
def toggle_applicable(
    machine_id: int,
    particular_id: int,
    is_applicable: bool,
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    """Turn a row on/off for this specific machine."""
    # Check machine exists
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Check particular exists
    particular = db.query(MHRParticular).filter(MHRParticular.id == particular_id).first()
    if not particular:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Particular with id {particular_id} not found"
        )

    # Check if assignment exists
    existing = db.query(MachineMHRValue).filter(
        MachineMHRValue.machine_id == machine_id,
        MachineMHRValue.particular_id == particular_id
    ).first()

    if existing:
        existing.is_applicable = is_applicable
        existing.updated_by = user_id
    else:
        new_value = MachineMHRValue(
            machine_id=machine_id,
            particular_id=particular_id,
            is_applicable=is_applicable,
            updated_by=user_id
        )
        db.add(new_value)

    db.commit()
    return {"message": "Particular applicability updated successfully"}


@router.post("/particulars/{particular_id}")
def add_particular_to_machine(
    machine_id: int,
    particular_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    """Add a particular to a machine."""
    # Check machine exists
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Check particular exists
    particular = db.query(MHRParticular).filter(MHRParticular.id == particular_id).first()
    if not particular:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Particular with id {particular_id} not found"
        )

    # Check if already exists
    existing = db.query(MachineMHRValue).filter(
        MachineMHRValue.machine_id == machine_id,
        MachineMHRValue.particular_id == particular_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Particular already assigned to this machine"
        )

    new_value = MachineMHRValue(
        machine_id=machine_id,
        particular_id=particular_id,
        is_applicable=True,
        updated_by=user_id
    )
    db.add(new_value)
    db.commit()
    return {"message": "Particular added to machine successfully"}


@router.delete("/particulars/{particular_id}")
def remove_particular_from_machine(
    machine_id: int,
    particular_id: int,
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    """Remove a particular from a machine."""
    # Check machine exists
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    # Check if assignment exists
    existing = db.query(MachineMHRValue).filter(
        MachineMHRValue.machine_id == machine_id,
        MachineMHRValue.particular_id == particular_id
    ).first()

    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Particular not assigned to this machine"
        )

    db.delete(existing)
    db.commit()
    return {"message": "Particular removed from machine successfully"}


@router.get("/available-particulars", response_model=List[MHRParticularSchema])
def get_available_particulars(machine_id: int, db: Session = Depends(get_db)):
    """Get all particulars that are NOT assigned to this machine."""
    # Get all active particulars
    all_particulars = db.query(MHRParticular).filter(MHRParticular.is_active == True).all()
    
    # Get assigned particular IDs for this machine
    assigned_ids = db.execute(text("""
        SELECT particular_id FROM configuration.machine_mhr_values
        WHERE machine_id = :mid
    """), {"mid": machine_id}).scalars().all()
    
    # Filter out assigned ones
    available = [p for p in all_particulars if p.id not in assigned_ids]
    
    return available


@router.put("/recommended-mhr")
def update_recommended_mhr(
    machine_id: int,
    recommended_mhr: int,
    db: Session = Depends(get_db),
    user_id: Optional[int] = Query(None),
):
    """Update the human-adjusted recommended MHR."""
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )

    machine.recommended_mhr = recommended_mhr
    machine.mhr_updated_by = user_id
    db.commit()
    return {"message": "Recommended MHR updated successfully", "recommended_mhr": recommended_mhr}
