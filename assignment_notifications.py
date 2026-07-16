from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from DB import AccessUser as AccessUserModel, Machine
from DB.models.notifications import MachineOperatorAssignmentNotification


def _machine_label(machine: Optional[Machine]) -> str:
    if not machine:
        return "Unknown machine"
    parts = [machine.make or "", machine.model or ""]
    label = " ".join(p for p in parts if p).strip()
    return label or f"Machine #{machine.id}"


ASSIGNER_ROLES = ("admin", "manufacturing_coordinator")


def _resolve_assigned_by(db: Session, assigned_by_id: Optional[int]):
    if not assigned_by_id:
        return None, None
    user = db.query(AccessUserModel).filter(AccessUserModel.id == assigned_by_id).first()
    if not user or user.role not in ASSIGNER_ROLES:
        return None, None
    return user.id, user.user_name


def _build_message(
    action: str,
    machine_label: str,
    shift_date: date,
    old_machine_label: Optional[str] = None,
    assigned_by_name: Optional[str] = None,
) -> str:
    date_str = shift_date.strftime("%d %b %Y")
    by_clause = f" by {assigned_by_name}" if assigned_by_name else ""

    if action == "assigned":
        return f"You have been assigned to {machine_label} on {date_str}{by_clause}."
    if action == "updated" and old_machine_label:
        return (
            f"Your machine assignment for {date_str} was changed from "
            f"{old_machine_label} to {machine_label}{by_clause}."
        )
    if action == "removed":
        return f"Your assignment to {machine_label} on {date_str} has been removed{by_clause}."
    return f"Your machine assignment on {date_str} was updated{by_clause}."


def notify_operator_assignment(
    db: Session,
    *,
    operator_id: int,
    machine_id: int,
    shift_date: date,
    action: str,
    assignment_id: Optional[int] = None,
    assigned_by_id: Optional[int] = None,
    old_machine_id: Optional[int] = None,
) -> Optional[MachineOperatorAssignmentNotification]:
    """Persist an in-app notification for the operator. Failures are logged, not raised."""
    try:
        machine = db.query(Machine).filter(Machine.id == machine_id).first()
        old_machine = (
            db.query(Machine).filter(Machine.id == old_machine_id).first()
            if old_machine_id
            else None
        )
        valid_assigned_by_id, assigned_by_name = _resolve_assigned_by(db, assigned_by_id)
        message = _build_message(
            action=action,
            machine_label=_machine_label(machine),
            shift_date=shift_date,
            old_machine_label=_machine_label(old_machine) if old_machine else None,
            assigned_by_name=assigned_by_name,
        )

        notification = MachineOperatorAssignmentNotification(
            operator_id=operator_id,
            machine_id=machine_id,
            assignment_id=assignment_id,
            shift_date=shift_date,
            action=action,
            message=message,
            assigned_by_id=valid_assigned_by_id,
            is_read=False,
        )
        db.add(notification)
        db.commit()
        db.refresh(notification)
        return notification
    except Exception as exc:
        db.rollback()
        print(f"[assignment-notification] Failed to notify operator {operator_id}: {exc}")
        return None
