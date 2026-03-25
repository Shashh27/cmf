from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from DB.database import get_db
from DB.models.maintenance import OEEIssue as OEEIssueModel, MachineBreakdown as MachineBreakdownModel, ComponentIssue as ComponentIssueModel
from DB.models.configuration import Machine as MachineModel
from DB.models.access_control import AccessUser as AccessUserModel
from DB.models.oms import Order as OrderModel, Part as PartModel
from DB.models.notifications import MachineNotification as MachineNotificationModel, ComponentIssuesNotification as ComponentIssuesNotificationModel
from DB.schemas.maintenance import (
    OEEIssue as OEEIssueSchema,
    OEEIssueCreate,
    OEEIssueUpdate,
    MachineBreakdown as MachineBreakdownSchema,
    MachineBreakdownCreate,
    MachineBreakdownUpdate,
    ComponentIssue as ComponentIssueSchema,
    ComponentIssueCreate,
    ComponentIssueUpdate,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

def _machine_label(m):
    if not m:
        return None
    if m.make and m.model:
        return f"{m.make} {m.model}"
    return m.make or m.type or f"Machine {m.id}"

def _maps_for_enrichment(db: Session):
    machines = {m.id: _machine_label(m) for m in db.query(MachineModel).all()}
    users    = {u.id: (u.user_name or str(u.id)) for u in db.query(AccessUserModel).all()}
    orders   = {o.id: (o.sale_order_number or o.project_name or str(o.id)) for o in db.query(OrderModel).all()}
    parts    = {p.id: (p.part_name or p.part_number or str(p.id)) for p in db.query(PartModel).all()}
    return machines, users, orders, parts

@router.post("/oee-issues", response_model=OEEIssueSchema)
def create_oee_issue(payload: OEEIssueCreate, db: Session = Depends(get_db)):
    issue_reason_str = "|".join(payload.issue_reason)
    cat = payload.issue_category.strip().lower().capitalize()
    obj = OEEIssueModel(
        machine_id=payload.machine_id,
        reported_by=payload.reported_by,
        issue_category=cat,
        issue_reason=issue_reason_str,
        start_time=payload.start_time,
        end_time=payload.end_time,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "start_time": obj.start_time,
        "end_time": obj.end_time,
    }

@router.get("/oee-issues", response_model=List[OEEIssueSchema])
def list_oee_issues(db: Session = Depends(get_db)):
    rows = db.query(OEEIssueModel).order_by(OEEIssueModel.id.asc()).all()
    m_map, u_map, _, _ = _maps_for_enrichment(db)
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "machine_id": r.machine_id,
            "machine_name": m_map.get(r.machine_id),
            "reported_by": r.reported_by,
            "operator_name": u_map.get(r.reported_by),
            "issue_category": r.issue_category,
            "issue_reason": r.issue_reason.split("|") if r.issue_reason else [],
            "start_time": r.start_time,
            "end_time": r.end_time,
        })
    return out

@router.get("/oee-issues/{id}", response_model=OEEIssueSchema)
def get_oee_issue(id: int, db: Session = Depends(get_db)):
    obj = db.query(OEEIssueModel).filter(OEEIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="OEE issue not found")
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "start_time": obj.start_time,
        "end_time": obj.end_time,
    }

@router.put("/oee-issues/{id}", response_model=OEEIssueSchema)
def update_oee_issue(id: int, payload: OEEIssueUpdate, db: Session = Depends(get_db)):
    obj = db.query(OEEIssueModel).filter(OEEIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="OEE issue not found")
    data = payload.dict(exclude_unset=True)
    if "issue_reason" in data and isinstance(data["issue_reason"], list):
        data["issue_reason"] = "|".join(data["issue_reason"])
    if "issue_category" in data and isinstance(data["issue_category"], str):
        data["issue_category"] = data["issue_category"].strip().lower().capitalize()
    for field, value in data.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "start_time": obj.start_time,
        "end_time": obj.end_time,
    }

@router.delete("/oee-issues/{id}")
def delete_oee_issue(id: int, db: Session = Depends(get_db)):
    obj = db.query(OEEIssueModel).filter(OEEIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="OEE issue not found")
    db.delete(obj)
    db.commit()
    return {"message": "OEE issue deleted"}

@router.post("/machine-breakdown", response_model=MachineBreakdownSchema)
def create_machine_breakdown(payload: MachineBreakdownCreate, db: Session = Depends(get_db)):
    issue_reason_str = "|".join(payload.issue_reason)
    cat = payload.issue_category.strip().lower().capitalize()
    obj = MachineBreakdownModel(
        machine_id=payload.machine_id,
        reported_by=payload.reported_by,
        issue_category=cat,
        machine_status=payload.machine_status,
        issue_reason=issue_reason_str,
        additional_reason=payload.additional_reason,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    # Trigger notification only if creator is operator
    try:
        creator = db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first()
        role = (creator.role or "").strip().lower() if creator and creator.role else ""
        if "operator" in role:
            notif = MachineNotificationModel(machine_breakdown_id=obj.id, is_ack=False)
            db.add(notif)
            db.commit()
    except Exception:
        db.rollback()
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "machine_status": obj.machine_status,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "additional_reason": obj.additional_reason,
    }

@router.get("/machine-breakdown", response_model=List[MachineBreakdownSchema])
def list_machine_breakdown(db: Session = Depends(get_db)):
    rows = db.query(MachineBreakdownModel).order_by(MachineBreakdownModel.id.asc()).all()
    m_map, u_map, _, _ = _maps_for_enrichment(db)
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "machine_id": r.machine_id,
            "machine_name": m_map.get(r.machine_id),
            "reported_by": r.reported_by,
            "operator_name": u_map.get(r.reported_by),
            "issue_category": r.issue_category,
            "machine_status": r.machine_status,
            "issue_reason": r.issue_reason.split("|") if r.issue_reason else [],
            "additional_reason": r.additional_reason,
        })
    return out

@router.get("/machine-breakdown/{id}", response_model=MachineBreakdownSchema)
def get_machine_breakdown(id: int, db: Session = Depends(get_db)):
    obj = db.query(MachineBreakdownModel).filter(MachineBreakdownModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Machine breakdown not found")
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "machine_status": obj.machine_status,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "additional_reason": obj.additional_reason,
    }

@router.put("/machine-breakdown/{id}", response_model=MachineBreakdownSchema)
def update_machine_breakdown(id: int, payload: MachineBreakdownUpdate, db: Session = Depends(get_db)):
    obj = db.query(MachineBreakdownModel).filter(MachineBreakdownModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Machine breakdown not found")
    data = payload.dict(exclude_unset=True)
    if "issue_reason" in data and isinstance(data["issue_reason"], list):
        data["issue_reason"] = "|".join(data["issue_reason"])
    if "issue_category" in data and isinstance(data["issue_category"], str):
        data["issue_category"] = data["issue_category"].strip().lower().capitalize()
    for field, value in data.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "issue_category": obj.issue_category,
        "machine_status": obj.machine_status,
        "issue_reason": obj.issue_reason.split("|") if obj.issue_reason else [],
        "additional_reason": obj.additional_reason,
    }

@router.delete("/machine-breakdown/{id}")
def delete_machine_breakdown(id: int, db: Session = Depends(get_db)):
    obj = db.query(MachineBreakdownModel).filter(MachineBreakdownModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Machine breakdown not found")
    db.delete(obj)
    db.commit()
    return {"message": "Machine breakdown deleted"}

@router.post("/component-issues", response_model=ComponentIssueSchema)
def create_component_issue(payload: ComponentIssueCreate, db: Session = Depends(get_db)):
    status = payload.component_status.strip()
    obj = ComponentIssueModel(
        machine_id=payload.machine_id,
        reported_by=payload.reported_by,
        component_status=status,
        production_order_id=payload.production_order_id,
        part_id=payload.part_id,
        description=payload.description,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    # Trigger notification only if creator is operator
    try:
        creator = db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first()
        role = (creator.role or "").strip().lower() if creator and creator.role else ""
        if "operator" in role:
            notif = ComponentIssuesNotificationModel(comp_issues_id=obj.id, is_ack=False)
            db.add(notif)
            db.commit()
    except Exception:
        db.rollback()
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "component_status": obj.component_status,
        "production_order_id": obj.production_order_id,
        "order_name": db.query(OrderModel).filter(OrderModel.id == obj.production_order_id).first().sale_order_number if obj.production_order_id else None,
        "part_id": obj.part_id,
        "part_name": db.query(PartModel).filter(PartModel.id == obj.part_id).first().part_name if obj.part_id else None,
        "description": obj.description,
    }

@router.get("/component-issues", response_model=List[ComponentIssueSchema])
def list_component_issues(db: Session = Depends(get_db)):
    rows = db.query(ComponentIssueModel).order_by(ComponentIssueModel.id.asc()).all()
    m_map, u_map, o_map, p_map = _maps_for_enrichment(db)
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "machine_id": r.machine_id,
            "machine_name": m_map.get(r.machine_id),
            "reported_by": r.reported_by,
            "operator_name": u_map.get(r.reported_by),
            "component_status": r.component_status,
            "production_order_id": r.production_order_id,
            "order_name": o_map.get(r.production_order_id),
            "part_id": r.part_id,
            "part_name": p_map.get(r.part_id),
            "description": r.description,
        })
    return out

@router.get("/component-issues/{id}", response_model=ComponentIssueSchema)
def get_component_issue(id: int, db: Session = Depends(get_db)):
    obj = db.query(ComponentIssueModel).filter(ComponentIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Component issue not found")
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "component_status": obj.component_status,
        "production_order_id": obj.production_order_id,
        "order_name": db.query(OrderModel).filter(OrderModel.id == obj.production_order_id).first().sale_order_number if obj.production_order_id else None,
        "part_id": obj.part_id,
        "part_name": db.query(PartModel).filter(PartModel.id == obj.part_id).first().part_name if obj.part_id else None,
        "description": obj.description,
    }

@router.put("/component-issues/{id}", response_model=ComponentIssueSchema)
def update_component_issue(id: int, payload: ComponentIssueUpdate, db: Session = Depends(get_db)):
    obj = db.query(ComponentIssueModel).filter(ComponentIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Component issue not found")
    data = payload.dict(exclude_unset=True)
    if "component_status" in data and isinstance(data["component_status"], str):
        data["component_status"] = data["component_status"].strip()
    for field, value in data.items():
        setattr(obj, field, value)
    db.commit()
    db.refresh(obj)
    return {
        "id": obj.id,
        "machine_id": obj.machine_id,
        "machine_name": _machine_label(db.query(MachineModel).filter(MachineModel.id == obj.machine_id).first()),
        "reported_by": obj.reported_by,
        "operator_name": db.query(AccessUserModel).filter(AccessUserModel.id == obj.reported_by).first().user_name if obj.reported_by else None,
        "component_status": obj.component_status,
        "production_order_id": obj.production_order_id,
        "order_name": db.query(OrderModel).filter(OrderModel.id == obj.production_order_id).first().sale_order_number if obj.production_order_id else None,
        "part_id": obj.part_id,
        "part_name": db.query(PartModel).filter(PartModel.id == obj.part_id).first().part_name if obj.part_id else None,
        "description": obj.description,
    }

@router.delete("/component-issues/{id}")
def delete_component_issue(id: int, db: Session = Depends(get_db)):
    obj = db.query(ComponentIssueModel).filter(ComponentIssueModel.id == id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Component issue not found")
    db.delete(obj)
    db.commit()
    return {"message": "Component issue deleted"}
