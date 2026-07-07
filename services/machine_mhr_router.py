from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone
from typing import List

from DB.database import get_db
from DB.models.configuration import Machine as MachineModel
from DB.models.machine_mhr import MachineMhrParameter as MachineMhrParameterModel
from DB.schemas.machine_mhr import (
    MachineMhrParameter,
    MachineMhrParametersUpdate,
    MachineMhrResponse,
    MachineMhrCalculationResult,
    MachineMhrBreakdown,
)

router = APIRouter(
    prefix="/machines",
    tags=["machine-mhr"]
)

# Codes that must always come in a pair, or not at all.
# If one is applicable, the other must be too, otherwise the formula silently
# drops power charges without the user realizing why.
PAIRED_CODES = [
    ("power_kw", "power_rate"),
]


def _get_machine_or_404(machine_id: int, db: Session) -> MachineModel:
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Machine with id {machine_id} not found"
        )
    return machine


def _validate_rows(rows: List[dict]) -> None:
    """Raise 400 on duplicate codes or half-filled paired parameters."""
    codes_seen = {}
    for row in rows:
        code = row.get("code")
        if not code:
            continue
        if code in codes_seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Duplicate parameter code '{code}' — each parameter must be unique per machine"
            )
        codes_seen[code] = row

    for code_a, code_b in PAIRED_CODES:
        a = codes_seen.get(code_a)
        b = codes_seen.get(code_b)
        a_on = a is not None and a.get("is_applicable", True)
        b_on = b is not None and b.get("is_applicable", True)
        if a_on != b_on:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"'{code_a}' and '{code_b}' must both be applicable together, or both turned off"
            )


@router.get("/{machine_id}/mhr", response_model=MachineMhrResponse)
def get_machine_mhr(machine_id: int, db: Session = Depends(get_db)):
    """Return a machine's MHR parameter rows plus the last cached MHR value."""
    machine = _get_machine_or_404(machine_id, db)

    parameters = (
        db.query(MachineMhrParameterModel)
        .filter(MachineMhrParameterModel.machine_id == machine_id)
        .order_by(MachineMhrParameterModel.sequence_number.asc())
        .all()
    )

    return MachineMhrResponse(
        machine_id=machine.id,
        mhr=machine.mhr,
        mhr_calculated_at=machine.mhr_calculated_at,
        parameters=parameters,
    )


@router.put("/{machine_id}/mhr/parameters", response_model=List[MachineMhrParameter])
def update_machine_mhr_parameters(
    machine_id: int,
    payload: MachineMhrParametersUpdate,
    db: Session = Depends(get_db)
):
    """
    Full upsert of parameter rows for one machine:
    - rows WITH an id -> updated
    - rows WITHOUT an id -> inserted
    - existing rows NOT included in the payload -> deleted
    """
    _get_machine_or_404(machine_id, db)

    _validate_rows([row.model_dump(exclude_unset=True) for row in payload.parameters])

    existing_rows = (
        db.query(MachineMhrParameterModel)
        .filter(MachineMhrParameterModel.machine_id == machine_id)
        .all()
    )
    existing_by_id = {row.id: row for row in existing_rows}
    incoming_ids = set()

    try:
        for row_data in payload.parameters:
            # Only accept an id that actually belongs to THIS machine.
            # An id from another machine is silently treated as a new row —
            # never lets one machine's payload edit another machine's data.
            if row_data.id and row_data.id in existing_by_id:
                db_row = existing_by_id[row_data.id]
                update_fields = row_data.model_dump(exclude_unset=True, exclude={"id"})
                for field, value in update_fields.items():
                    setattr(db_row, field, value)
                incoming_ids.add(row_data.id)
            else:
                if not row_data.code or not row_data.label:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="New parameter rows require both code and label"
                    )
                new_row = MachineMhrParameterModel(
                    machine_id=machine_id,
                    code=row_data.code,
                    label=row_data.label,
                    unit=row_data.unit,
                    value=row_data.value,
                    is_applicable=row_data.is_applicable if row_data.is_applicable is not None else True,
                    sequence_number=row_data.sequence_number or 0,
                )
                db.add(new_row)

        for row_id, row in existing_by_id.items():
            if row_id not in incoming_ids:
                db.delete(row)

        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Two parameters with the same code cannot exist on the same machine. "
                   "Reload and try again — someone may have just saved a conflicting change."
        )
    except HTTPException:
        db.rollback()
        raise

    result = (
        db.query(MachineMhrParameterModel)
        .filter(MachineMhrParameterModel.machine_id == machine_id)
        .order_by(MachineMhrParameterModel.sequence_number.asc())
        .all()
    )
    return result


@router.post("/{machine_id}/mhr/calculate", response_model=MachineMhrCalculationResult)
def calculate_machine_mhr(machine_id: int, db: Session = Depends(get_db)):
    """
    Applies the Annexure-4 "Methodology for Estimation" formula, using only
    parameter rows where is_applicable = True:

        P (power charges)        = power_kw * power_rate           (0 if power not applicable)
        U (utilization hours)    = available_hours - (downtime_pct/100 * available_hours)
        M (machine utilization)  = (investment_cost * 0.10 / U) + P
        B (machine hour rate)    = M * 1.05                        (5% maintenance)
        C (wage rate)            = wage_monthly / 200               (0 if wage not applicable)
        MHR                      = B + C   (C omitted entirely if wage row not applicable)
    """
    machine = _get_machine_or_404(machine_id, db)

    rows = (
        db.query(MachineMhrParameterModel)
        .filter(
            MachineMhrParameterModel.machine_id == machine_id,
            MachineMhrParameterModel.is_applicable == True,  # noqa: E712
        )
        .all()
    )
    values = {row.code: row.value for row in rows}

    investment_cost = values.get("investment_cost")
    available_hours = values.get("available_hours")
    downtime_pct = values.get("downtime_pct") or 0
    power_kw = values.get("power_kw")
    power_rate = values.get("power_rate")
    wage_monthly = values.get("wage_monthly")

    missing = []
    if investment_cost is None:
        missing.append("investment_cost")
    if available_hours is None:
        missing.append("available_hours")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required applicable parameter(s): {', '.join(missing)}"
        )

    if not (0 <= downtime_pct < 100):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="downtime_pct must be between 0 and 100"
        )

    utilization_hours = available_hours - (downtime_pct / 100 * available_hours)
    if not utilization_hours or utilization_hours <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Utilization hours computed as zero or negative — check available_hours / downtime_pct"
        )

    # power_kw / power_rate are enforced as a pair at save-time (_validate_rows),
    # but guard here too in case rows were edited directly via migration/seed data.
    power_charges = 0.0
    if power_kw is not None and power_rate is not None:
        power_charges = power_kw * power_rate
    elif power_kw is not None or power_rate is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both power_kw and power_rate must be applicable together"
        )

    machine_utilization_cost = (investment_cost * 0.10 / utilization_hours) + power_charges
    machine_hour_rate = machine_utilization_cost * 1.05

    wage_rate = None
    if wage_monthly is not None:
        wage_rate = wage_monthly / 200

    final_mhr = machine_hour_rate + (wage_rate or 0)

    now = datetime.now(timezone.utc)
    machine.mhr = round(final_mhr, 2)
    machine.mhr_calculated_at = now
    db.commit()
    db.refresh(machine)

    breakdown = MachineMhrBreakdown(
        power_charges=round(power_charges, 2),
        utilization_hours=round(utilization_hours, 2),
        machine_utilization_cost=round(machine_utilization_cost, 2),
        machine_hour_rate=round(machine_hour_rate, 2),
        wage_rate=round(wage_rate, 2) if wage_rate is not None else None,
        mhr=round(final_mhr, 2),
    )

    return MachineMhrCalculationResult(
        mhr=machine.mhr,
        breakdown=breakdown,
        calculated_at=now,
    )


# =======================================================================
# 1. Register in your main FastAPI app alongside the existing machines router:
#      from routers import machine_mhr
#      app.include_router(machine_mhr.router)
#
# 2. In your EXISTING delete_machine() (routers/machines.py), add cleanup
#    BEFORE db.delete(db_machine), same pattern as the machine_status cleanup
#    already there — needed because that endpoint uses raw text() deletes
#    elsewhere, which bypass the ORM cascade:
#
#      try:
#          with db.begin_nested():
#              db.execute(
#                  text("DELETE FROM configuration.machine_mhr_parameters WHERE machine_id = :id"),
#                  {"id": machine_id}
#              )
#      except Exception as e:
#          print(f"Warning: Could not delete machine_mhr_parameters: {e}")
# =======================================================================