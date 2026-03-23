from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel

from DB.database import get_db
from DB.models.oms import ToolWithPart as ToolWithPartModel
from DB.schemas.oms import ToolWithPart, ToolWithPartCreate, ToolWithPartUpdate

router = APIRouter(
    prefix="/tools",
    tags=["tools"]
)


class BulkToolLinkRequest(BaseModel):
    part_id: int
    operation_id: int | None = None
    user_id: int | None = None
    tool_ids: List[int]


class BulkToolLinkItem(BaseModel):
    tool_id: int
    part_id: int
    operation_id: int | None = None
    user_id: int | None = None


@router.post("/", response_model=ToolWithPart, status_code=status.HTTP_201_CREATED)
def create_tool_with_part(tool: ToolWithPartCreate, db: Session = Depends(get_db)):
    """Create a new tool-part association"""
    db_tool = ToolWithPartModel(**tool.model_dump())
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.post("/bulk", response_model=List[ToolWithPart], status_code=status.HTTP_201_CREATED)
def create_tools_with_part_bulk(payload: BulkToolLinkRequest, db: Session = Depends(get_db)):
    """Create many tool-part associations in one request."""
    tool_ids = payload.tool_ids or []
    if not tool_ids:
        return []

    created: List[ToolWithPartModel] = []
    try:
        for tid in tool_ids:
            db_tool = ToolWithPartModel(
                tool_id=tid,
                part_id=payload.part_id,
                operation_id=payload.operation_id,
                user_id=payload.user_id,
            )
            db.add(db_tool)
            created.append(db_tool)

        db.commit()
        for r in created:
            db.refresh(r)
        return created
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to link tools: {str(e)}")


@router.post("/bulk-links", response_model=List[ToolWithPart], status_code=status.HTTP_201_CREATED)
def create_tools_with_part_bulk_links(payload: List[BulkToolLinkItem], db: Session = Depends(get_db)):
    """Create many tool-part associations across multiple operations in one request."""
    if not payload:
        return []

    created: List[ToolWithPartModel] = []
    try:
        for item in payload:
            db_tool = ToolWithPartModel(
                tool_id=item.tool_id,
                part_id=item.part_id,
                operation_id=item.operation_id,
                user_id=item.user_id,
            )
            db.add(db_tool)
            created.append(db_tool)

        db.commit()
        for r in created:
            db.refresh(r)
        return created
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to link tools: {str(e)}")


@router.get("/", response_model=List[ToolWithPart])
def get_tools_with_parts(db: Session = Depends(get_db)):
    """Get all tool-part associations"""
    return db.query(ToolWithPartModel).order_by(ToolWithPartModel.id.asc()).all()


@router.get("/{tool_with_part_id}", response_model=ToolWithPart)
def get_tool_with_part(tool_with_part_id: int, db: Session = Depends(get_db)):
    """Get a specific tool-part association by ID"""
    tool = db.query(ToolWithPartModel).filter(ToolWithPartModel.id == tool_with_part_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool-part association with id {tool_with_part_id} not found"
        )
    return tool


@router.get("/part/{part_id}", response_model=List[ToolWithPart])
def get_tools_by_part(part_id: int, db: Session = Depends(get_db)):
    """Get all tools for a specific part"""
    tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.part_id == part_id).all()
    return tools


@router.get("/tool/{tool_id}", response_model=List[ToolWithPart])
def get_parts_by_tool(tool_id: int, db: Session = Depends(get_db)):
    """Get all parts that use a specific tool"""
    tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.tool_id == tool_id).all()
    return tools


@router.get("/operation/{operation_id}", response_model=List[ToolWithPart])
def get_tools_by_operation(operation_id: int, db: Session = Depends(get_db)):
    """Get all tools for a specific operation"""
    tools = db.query(ToolWithPartModel).filter(ToolWithPartModel.operation_id == operation_id).all()
    return tools


@router.put("/{tool_with_part_id}", response_model=ToolWithPart)
def update_tool_with_part(tool_with_part_id: int, tool: ToolWithPartUpdate, db: Session = Depends(get_db)):
    """Update a tool-part association"""
    db_tool = db.query(ToolWithPartModel).filter(ToolWithPartModel.id == tool_with_part_id).first()
    if not db_tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool-part association with id {tool_with_part_id} not found"
        )

    update_data = tool.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_tool, field, value)

    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.delete("/{tool_with_part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tool_with_part(tool_with_part_id: int, db: Session = Depends(get_db)):
    """Delete a tool-part association"""
    db_tool = db.query(ToolWithPartModel).filter(ToolWithPartModel.id == tool_with_part_id).first()
    if not db_tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool-part association with id {tool_with_part_id} not found"
        )

    db.delete(db_tool)
    db.commit()
    return None