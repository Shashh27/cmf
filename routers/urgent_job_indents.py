import io
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_, text
from sqlalchemy.orm import Session
from typing import List, Optional

from DB.database import get_db
from DB.minio_client import get_minio_client
from DB.models.maintenance import (
    UrgentJobIndent as IndentModel,
    UrgentJobIndentAttachment as AttachmentModel,
    get_ist_time,
)
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order as OrderModel, Part as PartModel, Operation as OperationModel
from DB.models.configuration import Machine as MachineModel, workcenter as WorkcenterModel
from DB.schemas.maintenance import (
    UrgentJobIndent as IndentSchema,
    UrgentJobIndentAttachment as AttachmentSchema,
    UrgentJobIndentCreate,
    UrgentJobIndentUpdate,
    UrgentJobIndentReview,
    UrgentJobIndentAssign,
    UrgentJobIndentAcknowledge,
    UrgentJobIndentCompletionReview,
    UrgentJobIndentProgress,
)

router = APIRouter(prefix="/urgent-job-indents", tags=["urgent-job-indents"])

_table_ready = False


def _ensure_table(db: Session):
    global _table_ready
    if _table_ready:
        return
    db.execute(text("CREATE SCHEMA IF NOT EXISTS maintenance"))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS maintenance.urgent_job_indents (
            id SERIAL PRIMARY KEY,
            created_by INTEGER NOT NULL REFERENCES accesscontrol.access_users(id),
            order_id INTEGER REFERENCES oms.orders(id),
            project_no VARCHAR,
            project_name VARCHAR,
            part_id INTEGER REFERENCES oms.parts(id),
            operation_id INTEGER REFERENCES oms.operations(id),
            description TEXT NOT NULL,
            status VARCHAR NOT NULL DEFAULT 'pending',
            mc_id INTEGER REFERENCES accesscontrol.access_users(id),
            mc_remark TEXT,
            reviewed_at TIMESTAMP,
            operator_id INTEGER REFERENCES accesscontrol.access_users(id),
            workcenter_id INTEGER REFERENCES configuration.work_centers(id),
            machine_id INTEGER REFERENCES configuration.machines(id),
            assigned_at TIMESTAMP,
            activated_at TIMESTAMP,
            completed_at TIMESTAMP,
            operator_ack BOOLEAN NOT NULL DEFAULT FALSE,
            operator_ack_at TIMESTAMP,
            mc_ack BOOLEAN NOT NULL DEFAULT FALSE,
            mc_ack_at TIMESTAMP,
            from_dept VARCHAR,
            to_dept VARCHAR,
            created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_maint_urgent_job_indents_status
                CHECK (status IN ('pending', 'accepted', 'rejected', 'assigned'))
        )
    """))
    db.execute(text(
        """
        ALTER TABLE maintenance.urgent_job_indents
            ADD COLUMN IF NOT EXISTS project_no VARCHAR,
            ADD COLUMN IF NOT EXISTS project_name VARCHAR,
            ADD COLUMN IF NOT EXISTS from_dept VARCHAR,
            ADD COLUMN IF NOT EXISTS to_dept VARCHAR,
            ADD COLUMN IF NOT EXISTS mc_ack BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS mc_ack_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS mc_ack_by VARCHAR,
            ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS supervisor_ack BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS supervisor_ack_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS supervisor_decision VARCHAR,
            ADD COLUMN IF NOT EXISTS supervisor_decision_remark TEXT,
            ADD COLUMN IF NOT EXISTS supervisor_decision_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS supervisor_decision_by VARCHAR,
            ADD COLUMN IF NOT EXISTS mc_completion_ack BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS mc_completion_ack_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS mc_decision VARCHAR,
            ADD COLUMN IF NOT EXISTS mc_decision_remark TEXT,
            ADD COLUMN IF NOT EXISTS mc_decision_at TIMESTAMP,
            ADD COLUMN IF NOT EXISTS mc_decision_by VARCHAR,
            ADD COLUMN IF NOT EXISTS from_name VARCHAR
        """
    ))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_maint_urgent_job_indents_status ON maintenance.urgent_job_indents (status)"
    ))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_maint_urgent_job_indents_operator ON maintenance.urgent_job_indents (operator_id, status)"
    ))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS maintenance.urgent_job_indent_attachments (
            id SERIAL PRIMARY KEY,
            indent_id INTEGER NOT NULL REFERENCES maintenance.urgent_job_indents(id) ON DELETE CASCADE,
            kind VARCHAR NOT NULL,
            file_name VARCHAR NOT NULL,
            file_type VARCHAR NOT NULL,
            file_size INTEGER NOT NULL,
            minio_url VARCHAR NOT NULL,
            uploaded_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC' + INTERVAL '5 hours 30 minutes'),
            CONSTRAINT ck_maint_urgent_job_indent_attachments_kind
                CHECK (kind IN ('2d', '3d'))
        )
    """))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_maint_urgent_job_indent_attachments_indent ON maintenance.urgent_job_indent_attachments (indent_id)"
    ))
    db.commit()
    _table_ready = True


def _machine_label(machine):
    if not machine:
        return None
    if machine.make and machine.model:
        return f"({machine.make}) {machine.model}"
    return machine.make or machine.model or machine.type or f"Machine {machine.id}"


def _user_name(db: Session, user_id: Optional[int]):
    if not user_id:
        return None
    user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first()
    return user.user_name if user else None


def _resolve_assignment(db: Session, operator_id: int, workcenter_id: Optional[int], machine_id: int):
    operator = db.query(AccessUserModel).filter(AccessUserModel.id == operator_id).first()
    if not operator:
        raise HTTPException(status_code=404, detail="Operator not found")
    machine = db.query(MachineModel).filter(MachineModel.id == machine_id).first()
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    resolved_workcenter_id = workcenter_id or machine.work_center_id
    if resolved_workcenter_id:
        workcenter = db.query(WorkcenterModel).filter(WorkcenterModel.id == resolved_workcenter_id).first()
        if not workcenter:
            raise HTTPException(status_code=404, detail="Work center not found")
        if machine.work_center_id and machine.work_center_id != resolved_workcenter_id:
            raise HTTPException(status_code=400, detail="Selected machine does not belong to this work center")
    return machine, resolved_workcenter_id


ALLOWED_2D = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".dwg", ".dxf"}
ALLOWED_3D = {".stl", ".step", ".stp", ".obj"}


def _file_ext(name: Optional[str]) -> str:
    if not name or "." not in name:
        return ""
    return "." + name.rsplit(".", 1)[-1].lower()


def _serialize_attachment(att: AttachmentModel) -> dict:
    return {
        "id": att.id,
        "indent_id": att.indent_id,
        "kind": att.kind,
        "file_name": att.file_name,
        "file_type": att.file_type,
        "file_size": att.file_size,
        "minio_url": att.minio_url,
        "uploaded_at": att.uploaded_at,
    }


def _serialize(obj: IndentModel, db: Session) -> dict:
    order = db.query(OrderModel).filter(OrderModel.id == obj.order_id).first() if obj.order_id else None
    part = db.query(PartModel).filter(PartModel.id == obj.part_id).first() if obj.part_id else None
    operation = db.query(OperationModel).filter(OperationModel.id == obj.operation_id).first() if obj.operation_id else None
    machine = db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first() if obj.machine_id else None
    workcenter = db.query(WorkcenterModel).filter(WorkcenterModel.id == obj.workcenter_id).first() if obj.workcenter_id else None
    attachments = (
        db.query(AttachmentModel)
        .filter(AttachmentModel.indent_id == obj.id)
        .order_by(AttachmentModel.id.asc())
        .all()
    )
    return {
        "id": obj.id,
        "created_by": obj.created_by,
        "created_by_name": _user_name(db, obj.created_by),
        "order_id": obj.order_id,
        "order_no": obj.project_no or (order.sale_order_number if order else None),
        "project_name": obj.project_name or (order.project_name if order else None),
        "part_id": obj.part_id,
        "part_no": part.part_number if part else None,
        "part_name": part.part_name if part else None,
        "operation_id": obj.operation_id,
        "operation_name": operation.operation_name if operation else None,
        "description": obj.description,
        "status": obj.status,
        "mc_id": obj.mc_id,
        "mc_name": _user_name(db, obj.mc_id),
        "mc_remark": obj.mc_remark,
        "reviewed_at": obj.reviewed_at,
        "operator_id": obj.operator_id,
        "operator_name": _user_name(db, obj.operator_id),
        "workcenter_id": obj.workcenter_id,
        "workcenter_name": workcenter.work_center_name if workcenter else None,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(machine),
        "assigned_at": obj.assigned_at,
        "activated_at": getattr(obj, "activated_at", None),
        "completed_at": getattr(obj, "completed_at", None),
        "supervisor_ack": bool(getattr(obj, "supervisor_ack", False)),
        "supervisor_ack_at": getattr(obj, "supervisor_ack_at", None),
        "supervisor_decision": getattr(obj, "supervisor_decision", None),
        "supervisor_decision_remark": getattr(obj, "supervisor_decision_remark", None),
        "supervisor_decision_at": getattr(obj, "supervisor_decision_at", None),
        "supervisor_decision_by": getattr(obj, "supervisor_decision_by", None),
        "mc_completion_ack": bool(getattr(obj, "mc_completion_ack", False)),
        "mc_completion_ack_at": getattr(obj, "mc_completion_ack_at", None),
        "mc_decision": getattr(obj, "mc_decision", None),
        "mc_decision_remark": getattr(obj, "mc_decision_remark", None),
        "mc_decision_at": getattr(obj, "mc_decision_at", None),
        "mc_decision_by": getattr(obj, "mc_decision_by", None),
        "operator_ack": bool(obj.operator_ack),
        "operator_ack_at": obj.operator_ack_at,
        "mc_ack": bool(getattr(obj, "mc_ack", False)),
        "mc_ack_at": getattr(obj, "mc_ack_at", None),
        "mc_ack_by": getattr(obj, "mc_ack_by", None) or (
            _user_name(db, obj.mc_id) if getattr(obj, "mc_ack", False) else None
        ),
        "from_dept": obj.from_dept,
        "from_name": getattr(obj, "from_name", None),
        "to_dept": obj.to_dept,
        "attachments": [_serialize_attachment(att) for att in attachments],
        "created_at": obj.created_at,
    }


def _get_or_404(db: Session, indent_id: int) -> IndentModel:
    obj = db.query(IndentModel).filter(IndentModel.id == indent_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Urgent indent not found")
    return obj


@router.post("/", response_model=IndentSchema)
def create_indent(payload: UrgentJobIndentCreate, db: Session = Depends(get_db)):
    _ensure_table(db)
    creator = db.query(AccessUserModel).filter(AccessUserModel.id == payload.created_by).first()
    if not creator:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.order_id:
        order = db.query(OrderModel).filter(OrderModel.id == payload.order_id).first()
        if not order:
            raise HTTPException(status_code=404, detail="Project not found")
    if payload.part_id:
        part = db.query(PartModel).filter(PartModel.id == payload.part_id).first()
        if not part:
            raise HTTPException(status_code=404, detail="Part not found")
    status = "pending"
    assigned_at = None
    reviewed_at = None
    activated_at = None
    completed_at = None
    mc_id = None
    operator_id = payload.operator_id
    payload_workcenter_id = payload.workcenter_id
    if payload.work_done:
        if not payload.machine_id:
            raise HTTPException(status_code=400, detail="Machine is required")
        _machine, payload_workcenter_id = _resolve_assignment(
            db, payload.created_by, payload.workcenter_id, payload.machine_id
        )
        now = get_ist_time()
        status = "assigned"
        operator_id = payload.created_by
        assigned_at = now
        reviewed_at = now
        activated_at = payload.activated_at or now
        completed_at = payload.completed_at or now
        if completed_at < activated_at:
            raise HTTPException(status_code=400, detail="Duration To must be after Duration From")
    elif payload.operator_id:
        if not payload.machine_id:
            raise HTTPException(status_code=400, detail="Operator and machine are required when assigning")
        _machine, payload_workcenter_id = _resolve_assignment(
            db, payload.operator_id, payload.workcenter_id, payload.machine_id
        )
        status = "assigned"
        assigned_at = get_ist_time()
        reviewed_at = assigned_at
        mc_id = payload.created_by
    obj = IndentModel(
        created_by=payload.created_by,
        order_id=payload.order_id,
        project_no=payload.project_no,
        project_name=payload.project_name,
        part_id=payload.part_id,
        operation_id=payload.operation_id,
        description=payload.description,
        from_dept=payload.from_dept,
        from_name=payload.from_name,
        to_dept=payload.to_dept,
        operator_id=operator_id,
        workcenter_id=payload_workcenter_id,
        machine_id=payload.machine_id,
        status=status,
        assigned_at=assigned_at,
        reviewed_at=reviewed_at,
        activated_at=activated_at,
        completed_at=completed_at,
        mc_id=mc_id,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _serialize(obj, db)


@router.get("/", response_model=List[IndentSchema])
def list_indents(
    created_by: Optional[int] = None,
    operator_id: Optional[int] = None,
    status: Optional[str] = None,
    for_mc_id: Optional[int] = None,
    mc_id: Optional[int] = None,
    completed: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    query = db.query(IndentModel)
    if created_by is not None:
        query = query.filter(IndentModel.created_by == created_by)
    if operator_id is not None:
        query = query.filter(IndentModel.operator_id == operator_id)
    if mc_id is not None:
        query = query.filter(IndentModel.mc_id == mc_id)
    if completed is True:
        query = query.filter(IndentModel.completed_at.isnot(None))
    elif completed is False:
        query = query.filter(IndentModel.completed_at.is_(None))
    if status:
        query = query.filter(IndentModel.status == status.strip().lower())
    if for_mc_id is not None:
        # PC-sent jobs stay visible to every MC. Jobs an MC created stay on that MC only.
        query = query.filter(
            or_(
                IndentModel.created_by == for_mc_id,
                IndentModel.mc_id.is_(None),
                IndentModel.created_by != IndentModel.mc_id,
            )
        )
    rows = query.order_by(IndentModel.id.desc()).all()
    return [_serialize(row, db) for row in rows]


@router.put("/{indent_id}/review", response_model=IndentSchema)
def review_indent(indent_id: int, payload: UrgentJobIndentReview, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    if (obj.status or "").lower() != "pending":
        raise HTTPException(status_code=400, detail="This indent has already been reviewed")

    mc = db.query(AccessUserModel).filter(AccessUserModel.id == payload.mc_id).first()
    if not mc:
        raise HTTPException(status_code=404, detail="Manufacturing coordinator not found")

    if payload.status == "rejected" and not payload.remark:
        raise HTTPException(status_code=400, detail="Remarks are required to reject")

    workcenter = None
    machine = None
    if payload.status == "accepted":
        if not payload.operator_id or not payload.machine_id:
            raise HTTPException(status_code=400, detail="Operator and machine are required to accept")
        machine, resolved_workcenter_id = _resolve_assignment(
            db, payload.operator_id, payload.workcenter_id, payload.machine_id
        )
        workcenter = (
            db.query(WorkcenterModel).filter(WorkcenterModel.id == resolved_workcenter_id).first()
            if resolved_workcenter_id else None
        )
        obj.operator_id = payload.operator_id
        obj.workcenter_id = resolved_workcenter_id
        obj.machine_id = payload.machine_id
        obj.assigned_at = get_ist_time()
        obj.status = "accepted"
        obj.operator_ack = False
        obj.operator_ack_at = None
    else:
        obj.status = "rejected"

    obj.mc_id = payload.mc_id
    obj.mc_remark = payload.remark
    obj.reviewed_at = get_ist_time()
    db.commit()
    db.refresh(obj)

    from services.notification_service import NotificationService
    NotificationService.log_right_now_job_review(
        db=db,
        indent_id=obj.id,
        pc_user_id=obj.created_by,
        status=obj.status,
        user_id=mc.id,
        user_name=mc.user_name,
        user_role=mc.role,
        details={
            "project_no": obj.project_no,
            "project_name": obj.project_name,
            "description": obj.description,
            "status": obj.status,
            "remark": obj.mc_remark,
            "operator_name": _user_name(db, obj.operator_id),
            "workcenter_name": workcenter.work_center_name if workcenter else None,
            "machine_name": _machine_label(machine) if payload.status == "accepted" else None,
        },
    )
    return _serialize(obj, db)


@router.put("/{indent_id}/assign", response_model=IndentSchema)
def assign_indent(indent_id: int, payload: UrgentJobIndentAssign, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    current = (obj.status or "").lower()
    if current not in ("accepted", "assigned"):
        raise HTTPException(status_code=400, detail="Accept the indent before assigning")

    _machine, resolved_workcenter_id = _resolve_assignment(
        db, payload.operator_id, payload.workcenter_id, payload.machine_id
    )

    obj.mc_id = payload.mc_id
    obj.operator_id = payload.operator_id
    obj.workcenter_id = resolved_workcenter_id
    obj.machine_id = payload.machine_id
    obj.assigned_at = get_ist_time()
    obj.status = "assigned"
    obj.operator_ack = False
    obj.operator_ack_at = None
    db.commit()
    db.refresh(obj)
    return _serialize(obj, db)


def _require_assigned_operator(obj: IndentModel, operator_id: int) -> None:
    if obj.operator_id != operator_id:
        raise HTTPException(status_code=403, detail="This job is not assigned to you")
    if (obj.status or "").lower() not in ("assigned", "accepted"):
        raise HTTPException(status_code=400, detail="This job has not been assigned yet")


@router.put("/{indent_id}/activate", response_model=IndentSchema)
def activate_indent(indent_id: int, payload: UrgentJobIndentProgress, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    _require_assigned_operator(obj, payload.operator_id)
    if obj.completed_at:
        raise HTTPException(status_code=400, detail="This job is already completed")
    if not obj.activated_at:
        obj.activated_at = get_ist_time()
        db.commit()
        db.refresh(obj)
    return _serialize(obj, db)


@router.put("/{indent_id}/complete", response_model=IndentSchema)
def complete_indent(indent_id: int, payload: UrgentJobIndentProgress, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    _require_assigned_operator(obj, payload.operator_id)
    if not obj.activated_at:
        raise HTTPException(status_code=400, detail="Activate the job before completing it")
    if not obj.completed_at:
        obj.completed_at = get_ist_time()
        db.commit()
        db.refresh(obj)
    return _serialize(obj, db)


def _assert_editable_before_activation(obj: IndentModel, action: str = "edited") -> None:
    status = (obj.status or "").lower()
    if status == "rejected":
        raise HTTPException(status_code=400, detail=f"Rejected jobs cannot be {action}")
    if getattr(obj, "activated_at", None) or getattr(obj, "completed_at", None):
        raise HTTPException(
            status_code=400,
            detail=f"Job cannot be {action} after the operator has activated it",
        )
    if status not in ("pending", "accepted", "assigned"):
        raise HTTPException(status_code=400, detail=f"Only unactivated jobs can be {action}")


@router.put("/{indent_id}", response_model=IndentSchema)
def update_indent(indent_id: int, payload: UrgentJobIndentUpdate, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    _assert_editable_before_activation(obj, "edited")
    if payload.description is not None:
        if not payload.description:
            raise HTTPException(status_code=400, detail="Description is required")
        obj.description = payload.description
    if payload.project_no is not None:
        obj.project_no = payload.project_no
    if payload.project_name is not None:
        obj.project_name = payload.project_name
    if payload.from_dept is not None:
        obj.from_dept = payload.from_dept
    if payload.to_dept is not None:
        obj.to_dept = payload.to_dept
    next_operator_id = payload.operator_id if payload.operator_id is not None else obj.operator_id
    next_machine_id = payload.machine_id if payload.machine_id is not None else obj.machine_id
    next_workcenter_id = payload.workcenter_id if payload.workcenter_id is not None else obj.workcenter_id
    if payload.operator_id is not None or payload.machine_id is not None or payload.workcenter_id is not None:
        if next_operator_id and next_machine_id:
            _machine, next_workcenter_id = _resolve_assignment(
                db, next_operator_id, next_workcenter_id, next_machine_id
            )
        if payload.operator_id is not None:
            operator = db.query(AccessUserModel).filter(AccessUserModel.id == payload.operator_id).first()
            if not operator:
                raise HTTPException(status_code=404, detail="Operator not found")
            obj.operator_id = payload.operator_id
        if payload.machine_id is not None:
            obj.machine_id = payload.machine_id
        if next_workcenter_id is not None:
            obj.workcenter_id = next_workcenter_id
        # Keep assigned/accepted jobs in assigned state when MC updates operator/machine
        if (obj.status or "").lower() in ("accepted", "assigned") and obj.operator_id and obj.machine_id:
            obj.status = "assigned"
            if not obj.assigned_at:
                obj.assigned_at = get_ist_time()
    db.commit()
    db.refresh(obj)
    return _serialize(obj, db)


@router.delete("/{indent_id}")
def delete_indent(indent_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    _assert_editable_before_activation(obj, "deleted")
    db.query(AttachmentModel).filter(AttachmentModel.indent_id == indent_id).delete()
    db.delete(obj)
    db.commit()
    return {"ok": True}


@router.put("/{indent_id}/completion-review", response_model=IndentSchema)
def review_completion(indent_id: int, payload: UrgentJobIndentCompletionReview, db: Session = Depends(get_db)):
    """Supervisor or MC approve/reject a completed work log (including operator-submitted logs)."""
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    if not obj.completed_at:
        raise HTTPException(status_code=400, detail="This job is not completed yet")
    if payload.status == "rejected" and not payload.remark:
        raise HTTPException(status_code=400, detail="Remarks are required to reject")

    user = db.query(AccessUserModel).filter(AccessUserModel.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if getattr(obj, "supervisor_decision", None) or getattr(obj, "mc_decision", None):
        raise HTTPException(status_code=400, detail="This log has already been reviewed")

    now = get_ist_time()
    if payload.as_role == "supervisor":
        obj.supervisor_decision = payload.status
        obj.supervisor_decision_remark = payload.remark
        obj.supervisor_decision_at = now
        obj.supervisor_decision_by = user.user_name
        obj.supervisor_ack = True
        obj.supervisor_ack_at = now
        # One approval is enough — clear MC pending review as well
        obj.mc_completion_ack = True
        obj.mc_completion_ack_at = now
        if obj.mc_id is None:
            obj.mc_ack = True
            obj.mc_ack_at = now
            obj.mc_ack_by = user.user_name
    else:
        if obj.mc_id is not None and obj.mc_id != payload.user_id:
            raise HTTPException(
                status_code=403,
                detail="Only the assigned manufacturing coordinator can review this completion",
            )
        obj.mc_decision = payload.status
        obj.mc_decision_remark = payload.remark
        obj.mc_decision_at = now
        obj.mc_decision_by = user.user_name
        obj.mc_completion_ack = True
        obj.mc_completion_ack_at = now
        obj.supervisor_ack = True
        obj.supervisor_ack_at = now
        # Operator-submitted logs (mc_id null) also clear the generic MC notification ack
        if obj.mc_id is None:
            obj.mc_ack = True
            obj.mc_ack_at = now
            obj.mc_ack_by = user.user_name

    db.commit()
    db.refresh(obj)
    return _serialize(obj, db)


@router.put("/{indent_id}/acknowledge", response_model=IndentSchema)
def acknowledge_indent(indent_id: int, payload: UrgentJobIndentAcknowledge, db: Session = Depends(get_db)):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    role = (payload.as_role or "").strip().lower()
    if role == "supervisor":
        if not obj.completed_at:
            raise HTTPException(status_code=400, detail="This job is not completed yet")
        if not obj.supervisor_ack:
            obj.supervisor_ack = True
            obj.supervisor_ack_at = get_ist_time()
            db.commit()
            db.refresh(obj)
        return _serialize(obj, db)
    if role == "mc_completion":
        if obj.mc_id is not None and obj.mc_id != payload.user_id:
            raise HTTPException(status_code=403, detail="Only the assigned manufacturing coordinator can acknowledge this completion")
        if not obj.completed_at:
            raise HTTPException(status_code=400, detail="This job is not completed yet")
        if not obj.mc_completion_ack:
            obj.mc_completion_ack = True
            obj.mc_completion_ack_at = get_ist_time()
            db.commit()
            db.refresh(obj)
        return _serialize(obj, db)
    if role == "mc" or (role != "operator" and obj.operator_id != payload.user_id):
        if not obj.mc_ack:
            acker = db.query(AccessUserModel).filter(AccessUserModel.id == payload.user_id).first()
            obj.mc_ack = True
            obj.mc_ack_at = get_ist_time()
            obj.mc_ack_by = acker.user_name if acker else None
            db.commit()
            db.refresh(obj)
        return _serialize(obj, db)

    if obj.operator_id != payload.user_id:
        raise HTTPException(status_code=403, detail="You can only acknowledge jobs assigned to you")
    if (obj.status or "").lower() not in ("assigned", "accepted"):
        raise HTTPException(status_code=400, detail="This job has not been assigned yet")
    if not obj.operator_ack:
        obj.operator_ack = True
        obj.operator_ack_at = get_ist_time()
        db.commit()
        db.refresh(obj)
    return _serialize(obj, db)


@router.post("/{indent_id}/attachments", response_model=AttachmentSchema)
def upload_attachment(
    indent_id: int,
    kind: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _ensure_table(db)
    obj = _get_or_404(db, indent_id)
    kind_value = (kind or "").strip().lower()
    if kind_value not in ("2d", "3d"):
        raise HTTPException(status_code=400, detail="File kind must be 2d or 3d")

    filename = file.filename or "file"
    ext = _file_ext(filename)
    allowed = ALLOWED_2D if kind_value == "2d" else ALLOWED_3D
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported {kind_value.upper()} file type. Allowed: {', '.join(sorted(allowed))}",
        )

    content_type = file.content_type or "application/octet-stream"
    file_content = file.file.read()
    if not file_content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    object_name = f"urgent_job_indents/{obj.id}/{kind_value}/{uuid.uuid4()}{ext}"
    minio_client = get_minio_client()
    minio_url = minio_client.upload_file(
        file_data=io.BytesIO(file_content),
        object_name=object_name,
        content_type=content_type,
    )

    attachment = AttachmentModel(
        indent_id=obj.id,
        kind=kind_value,
        file_name=filename,
        file_type=content_type,
        file_size=len(file_content),
        minio_url=minio_url,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return _serialize_attachment(attachment)


@router.get("/{indent_id}/attachments", response_model=List[AttachmentSchema])
def list_attachments(indent_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    _get_or_404(db, indent_id)
    attachments = (
        db.query(AttachmentModel)
        .filter(AttachmentModel.indent_id == indent_id)
        .order_by(AttachmentModel.id.asc())
        .all()
    )
    return [_serialize_attachment(att) for att in attachments]


def _attachment_object_name(attachment) -> str:
    url = attachment.minio_url or ""
    parts = url.split("/")
    if "urgent_job_indents" in parts:
        return "/".join(parts[parts.index("urgent_job_indents"):])
    return parts[-1] if parts else ""


@router.get("/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int, db: Session = Depends(get_db)):
    from urllib.parse import quote
    from fastapi.responses import StreamingResponse

    _ensure_table(db)
    attachment = db.query(AttachmentModel).filter(AttachmentModel.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    try:
        minio_client = get_minio_client()
        file_data = minio_client.download_file(_attachment_object_name(attachment))
        filename = (attachment.file_name or "file").replace('"', "").replace("\r", "").replace("\n", "")
        encoded = quote(filename)
        return StreamingResponse(
            io.BytesIO(file_data),
            media_type=attachment.file_type or "application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{encoded}",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to download file: {exc}")


@router.get("/attachments/{attachment_id}/3d")
def preview_attachment_3d(attachment_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import StreamingResponse
    from routers.step_converter import StepConverter

    _ensure_table(db)
    attachment = db.query(AttachmentModel).filter(AttachmentModel.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    ext = _file_ext(attachment.file_name)
    if ext not in {".stl", ".step", ".stp"}:
        raise HTTPException(status_code=404, detail="3D preview is only available for STEP and STL files")
    try:
        minio_client = get_minio_client()
        object_name = _attachment_object_name(attachment)
        file_data = minio_client.download_file(object_name)
        if ext in {".step", ".stp"}:
            glb_data, error_detail = StepConverter.convert_step_to_glb(file_data)
        else:
            glb_data, error_detail = StepConverter.convert_stl_to_glb(file_data)
        if not glb_data:
            raise HTTPException(status_code=404, detail=error_detail or "Failed to convert 3D file")
        return StreamingResponse(
            io.BytesIO(glb_data),
            media_type="model/gltf-binary",
            headers={"Content-Disposition": f'inline; filename="{attachment.file_name}.glb"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate 3D preview: {exc}")


@router.delete("/attachments/{attachment_id}")
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)):
    _ensure_table(db)
    attachment = db.query(AttachmentModel).filter(AttachmentModel.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    try:
        minio_client = get_minio_client()
        object_name = _attachment_object_name(attachment)
        if object_name:
            minio_client.delete_file(object_name)
    except Exception as exc:
        print(f"Error deleting urgent job attachment from MinIO: {exc}")
    db.delete(attachment)
    db.commit()
    return {"ok": True}
