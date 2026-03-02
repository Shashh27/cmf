from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from urllib.parse import urlparse
import os
import io
import csv
from pydantic import BaseModel
import pdfplumber
from docx import Document as DocxDocument

from DB.database import get_db
from DB.minio_client import get_minio_client
from DB.models.oms import (
    Operation as OperationModel,
    OperationDocument as OperationDocumentModel,
    ToolWithPart as ToolWithPartModel,
    PartType as PartTypeModel
)
from DB.models.configuration import WorkCenter as WorkCenterModel, Machine as MachineModel
from DB.schemas.oms import Operation, OperationCreate, OperationUpdate

router = APIRouter(
    prefix="/operations",
    tags=["operations"]
)


class OperationPreview(BaseModel):
    operation_number: str
    operation_name: str
    setup_time: Optional[str] = None
    cycle_time: Optional[str] = None
    work_instructions: Optional[str] = None
    notes: Optional[str] = None


def _normalize_header(name: str) -> str:
    return name.strip().lower().replace("\n", " ").replace("\r", " ")


def _match_column(header: str) -> Optional[str]:
    h = _normalize_header(header)
    if "op" in h and "number" in h:
        return "operation_number"
    if "operation" in h and "name" in h:
        return "operation_name"
    if "setup" in h:
        return "setup_time"
    if "cycle" in h:
        return "cycle_time"
    if "instruction" in h:
        return "work_instructions"
    if "note" in h:
        return "notes"
    return None


def _parse_rows(rows):
    if not rows:
        return []
    header = rows[0]
    header_map = {}
    for idx, name in enumerate(header):
        key = _match_column(name or "")
        if key:
            header_map[key] = idx
    if "operation_number" not in header_map or "operation_name" not in header_map:
        return []
    result: List[OperationPreview] = []
    for row in rows[1:]:
        cells = [(c or "").strip() for c in row]
        if not "".join(cells).strip():
            continue
        data = {
            "operation_number": cells[header_map["operation_number"]],
            "operation_name": cells[header_map["operation_name"]],
            "setup_time": cells[header_map["setup_time"]] if "setup_time" in header_map else None,
            "cycle_time": cells[header_map["cycle_time"]] if "cycle_time" in header_map else None,
            "work_instructions": cells[header_map["work_instructions"]] if "work_instructions" in header_map else None,
            "notes": cells[header_map["notes"]] if "notes" in header_map else None,
        }
        result.append(OperationPreview(**data))
    return result


def _parse_csv(content: bytes):
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if any((cell or "").strip() for cell in row)]
    return _parse_rows(rows)


def _parse_docx(content: bytes):
    doc = DocxDocument(io.BytesIO(content))
    for table in doc.tables:
        rows = []
        for row in table.rows:
            rows.append([cell.text for cell in row.cells])
        parsed = _parse_rows(rows)
        if parsed:
            return parsed
    return []


def _parse_pdf(content: bytes):
    operations: List[OperationPreview] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                parsed = _parse_rows(table)
                if parsed:
                    operations.extend(parsed)
            if operations:
                break
    return operations


@router.post("/", response_model=Operation, status_code=status.HTTP_201_CREATED)
def create_operation(operation: OperationCreate, db: Session = Depends(get_db)):
    """Create a new operation"""
    data = operation.model_dump()
    part_type_id = data.get("part_type_id") or 1
    data["part_type_id"] = part_type_id
    # Out-Source (part_type_id=2) requires from_date and to_date
    if part_type_id == 2:
        if not data.get("from_date") or not data.get("to_date"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Outsource operations require from_date and to_date",
            )
    db_operation = OperationModel(**data)
    db.add(db_operation)
    db.commit()
    db.refresh(db_operation)
    # Attach part_type_name for response
    pt = db.query(PartTypeModel).filter(PartTypeModel.id == db_operation.part_type_id).first()
    db_operation.part_type_name = pt.type_name if pt else None
    return db_operation


@router.get("/", response_model=List[Operation])
def get_operations(db: Session = Depends(get_db)):
    """Get all operations"""
    operations = db.query(OperationModel).order_by(OperationModel.id.asc()).all()

    work_center_ids = {op.workcenter_id for op in operations if op.workcenter_id is not None}
    machine_ids = {op.machine_id for op in operations if op.machine_id is not None}
    part_type_ids = {op.part_type_id for op in operations if op.part_type_id is not None}
    work_center_map = {}
    machine_map = {}
    part_type_map = {}
    if work_center_ids:
        work_centers = db.query(WorkCenterModel).filter(WorkCenterModel.id.in_(work_center_ids)).all()
        work_center_map = {wc.id: wc.work_center_name for wc in work_centers}
    if machine_ids:
        machines = db.query(MachineModel).filter(MachineModel.id.in_(machine_ids)).all()
        machine_map = {m.id: m.make for m in machines}
    if part_type_ids:
        part_types = db.query(PartTypeModel).filter(PartTypeModel.id.in_(part_type_ids)).all()
        part_type_map = {pt.id: pt.type_name for pt in part_types}

    for op in operations:
        op.work_center_name = work_center_map.get(op.workcenter_id)
        op.machine_name = machine_map.get(op.machine_id)
        op.part_type_name = part_type_map.get(op.part_type_id)

    return operations


@router.get("/{operation_id}", response_model=Operation)
def get_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get a specific operation by ID"""
    operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )
    work_center = None
    if operation.workcenter_id is not None:
        work_center = db.query(WorkCenterModel).filter(WorkCenterModel.id == operation.workcenter_id).first()
    machine = None
    if operation.machine_id is not None:
        machine = db.query(MachineModel).filter(MachineModel.id == operation.machine_id).first()
    part_type = None
    if operation.part_type_id is not None:
        part_type = db.query(PartTypeModel).filter(PartTypeModel.id == operation.part_type_id).first()
    if work_center:
        operation.work_center_name = work_center.work_center_name
    else:
        operation.work_center_name = None
    if machine:
        operation.machine_name = machine.make
    else:
        operation.machine_name = None
    operation.part_type_name = part_type.type_name if part_type else None
    return operation


@router.get("/part/{part_id}", response_model=List[Operation])
def get_operations_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all operations for a specific part (FIFO by id)"""
    operations = db.query(OperationModel).filter(OperationModel.part_id == part_id).order_by(OperationModel.id.asc()).all()

    work_center_ids = {op.workcenter_id for op in operations if op.workcenter_id is not None}
    machine_ids = {op.machine_id for op in operations if op.machine_id is not None}
    part_type_ids = {op.part_type_id for op in operations if op.part_type_id is not None}
    work_center_map = {}
    machine_map = {}
    part_type_map = {}
    if work_center_ids:
        work_centers = db.query(WorkCenterModel).filter(WorkCenterModel.id.in_(work_center_ids)).all()
        work_center_map = {wc.id: wc.work_center_name for wc in work_centers}
    if machine_ids:
        machines = db.query(MachineModel).filter(MachineModel.id.in_(machine_ids)).all()
        machine_map = {m.id: m.make for m in machines}
    if part_type_ids:
        part_types = db.query(PartTypeModel).filter(PartTypeModel.id.in_(part_type_ids)).all()
        part_type_map = {pt.id: pt.type_name for pt in part_types}

    for op in operations:
        op.work_center_name = work_center_map.get(op.workcenter_id)
        op.machine_name = machine_map.get(op.machine_id)
        op.part_type_name = part_type_map.get(op.part_type_id)

    return operations


@router.put("/{operation_id}", response_model=Operation)
def update_operation(operation_id: int, operation: OperationUpdate, db: Session = Depends(get_db)):
    """Update an operation"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    update_data = operation.model_dump(exclude_unset=True)
    part_type_id = update_data.get("part_type_id") if "part_type_id" in update_data else db_operation.part_type_id
    if part_type_id == 2:
        from_date = update_data.get("from_date") if "from_date" in update_data else db_operation.from_date
        to_date = update_data.get("to_date") if "to_date" in update_data else db_operation.to_date
        if not from_date or not to_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Outsource operations require from_date and to_date",
            )
    for field, value in update_data.items():
        setattr(db_operation, field, value)

    db.commit()
    db.refresh(db_operation)
    pt = db.query(PartTypeModel).filter(PartTypeModel.id == db_operation.part_type_id).first()
    db_operation.part_type_name = pt.type_name if pt else None
    return db_operation


@router.delete("/{operation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_operation(operation_id: int, db: Session = Depends(get_db)):
    """Delete an operation and all associated data (documents, tools)"""
    db_operation = db.query(OperationModel).filter(OperationModel.id == operation_id).first()
    if not db_operation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation with id {operation_id} not found"
        )

    # 1. Delete associated documents (MinIO files and DB records)
    documents = db.query(OperationDocumentModel).filter(OperationDocumentModel.operation_id == operation_id).all()
    minio_client = get_minio_client()
    
    for doc in documents:
        # Try to delete from MinIO
        try:
            # Extract object name from URL
            # URL format: http://endpoint/bucket/object_name
            if doc.document_url:
                parsed_url = urlparse(doc.document_url)
                path_parts = parsed_url.path.lstrip('/').split('/', 1)
                
                if len(path_parts) >= 2:
                    bucket_name = path_parts[0]
                    object_name = path_parts[1]
                    minio_client.client.remove_object(bucket_name, object_name)
                elif not parsed_url.netloc and '/' in doc.document_url:
                     # Assume format: bucket/object_name
                     path_parts = doc.document_url.lstrip('/').split('/', 1)
                     if len(path_parts) >= 2:
                        bucket_name = path_parts[0]
                        object_name = path_parts[1]
                        minio_client.client.remove_object(bucket_name, object_name)
        except Exception as e:
            print(f"Error deleting file from MinIO for document {doc.id}: {str(e)}")
            # Continue deleting DB record even if MinIO fails
            
        db.delete(doc)

    # 2. Delete associated tools
    tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.operation_id == operation_id).all()
    for tool in tools:
        db.delete(tool)

    # 3. Delete the operation
    db.delete(db_operation)
    db.commit()
    return None


@router.post("/parse-mpp", response_model=List[OperationPreview])
async def parse_mpp_file(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext == ".csv":
        operations = _parse_csv(content)
    elif ext == ".docx":
        operations = _parse_docx(content)
    elif ext == ".pdf":
        operations = _parse_pdf(content)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Use DOCX, CSV, or PDF.",
        )
    if not operations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract operations from file",
        )
    return operations
