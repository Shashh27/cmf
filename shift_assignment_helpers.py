from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from DB import AccessUser as AccessUserModel, Machine
from DB.models.scheduling import MachineOperatorShiftAssignment, ShiftHoursConfiguration
from DB.schemas.machine_operator_shift_pydantic import (
    AssignedByInfo,
    MachineOperatorShiftAssignmentResponse,
    ShiftConfigDetails,
    ShiftTimingInfo,
)

ASSIGNER_ROLES = ("admin", "manufacturing_coordinator")


def format_machine_label(machine: Machine) -> str:
    make = (machine.make or "").strip()
    model = (machine.model or "").strip()
    if make and model:
        return f"{make} and {model}"
    if make:
        return make
    if model:
        return model
    return f"Machine #{machine.id}"


def format_shift_date(shift_date: date) -> str:
    return shift_date.strftime("%d/%m/%Y")


def duplicate_assignment_detail(
    machine: Machine,
    operator: AccessUserModel,
    shift_config: ShiftHoursConfiguration,
    existing: MachineOperatorShiftAssignment,
    db: Session,
) -> str:
    assigner_name = "another user"
    if existing.assigned_by_id:
        existing_assigner = (
            existing.assigner
            if existing.assigner is not None
            else db.query(AccessUserModel).filter(AccessUserModel.id == existing.assigned_by_id).first()
        )
        if existing_assigner:
            assigner_name = existing_assigner.user_name

    return (
        f"{format_machine_label(machine)} already assigned by {assigner_name} "
        f"for operator {operator.user_name} on shift {format_shift_date(shift_config.date)}"
    )


def _validate_assigner_role(
    db: Session,
    user_id: Optional[int],
    *,
    field_name: str,
    action_label: str,
) -> AccessUserModel:
    if user_id is None:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} is required. Must be an admin or manufacturing_coordinator user.",
        )

    user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail=f"User {user_id} not found")

    if user.role not in ASSIGNER_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"Only admin or manufacturing_coordinator can {action_label}",
        )

    return user


def validate_assigned_by(db: Session, assigned_by_id: Optional[int]) -> AccessUserModel:
    """Only admin or manufacturing_coordinator may assign machines to operators."""
    return _validate_assigner_role(
        db,
        assigned_by_id,
        field_name="assigned_by_id",
        action_label="assign machines to operators",
    )


def validate_priority_changed_by(
    db: Session, priority_changed_by_id: Optional[int]
) -> AccessUserModel:
    """Only admin or manufacturing_coordinator may swap part priorities."""
    return _validate_assigner_role(
        db,
        priority_changed_by_id,
        field_name="priority_changed_by_id",
        action_label="swap part priorities",
    )


def priority_changed_by_audit(user: AccessUserModel) -> dict:
    """Audit fields returned after a successful priority swap."""
    return {
        "user_id": user.id,
        "priority_changed_by": user.role,
        "name": user.user_name,
        "priority_changed_at": datetime.now(timezone.utc).isoformat(),
    }


def assigned_by_info(user: Optional[AccessUserModel]) -> Optional[AssignedByInfo]:
    if not user:
        return None
    return AssignedByInfo(id=user.id, user_name=user.user_name, role=user.role)


def build_assignment_response(
    assignment: MachineOperatorShiftAssignment,
    shift_config: ShiftHoursConfiguration,
    assigner: Optional[AccessUserModel] = None,
) -> MachineOperatorShiftAssignmentResponse:
    shift_timing_infos = [
        ShiftTimingInfo(
            shift_code=timing.shift_code,
            shift_start=timing.shift_start,
            shift_end=timing.shift_end,
            custom_start=timing.custom_start,
            custom_end=timing.custom_end,
        )
        for timing in sorted(shift_config.shift_timings, key=lambda t: t.shift_start)
    ]

    shift_config_details = ShiftConfigDetails(
        id=shift_config.id,
        date=shift_config.date,
        working_day=shift_config.working_day,
        number_of_shifts=shift_config.number_of_shifts,
        shift_timings=shift_timing_infos,
    )

    return MachineOperatorShiftAssignmentResponse(
        id=assignment.id,
        machine_id=assignment.machine_id,
        operator_id=assignment.operator_id,
        shift_config=shift_config_details,
        assigned_by=assigned_by_info(assigner),
        created_at=assignment.created_at,
        updated_at=assignment.updated_at,
    )
