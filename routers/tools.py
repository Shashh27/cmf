from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from DB.database import get_db
from DB.models.oms import ToolWithPart as ToolWithPartModel
from DB.schemas.oms import ToolWithPart, ToolWithPartCreate, ToolWithPartUpdate

router = APIRouter(
    prefix="/tools",
    tags=["tools"]
)


@router.post("/", response_model=ToolWithPart, status_code=status.HTTP_201_CREATED)
def create_tool_with_part(tool: ToolWithPartCreate, db: Session = Depends(get_db)):
    """Create a new tool-part association"""
    db_tool = ToolWithPartModel(**tool.model_dump())
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.get("/", response_model=List[ToolWithPart])
def get_tools_with_parts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    """Get all tool-part associations with pagination"""
    tools = db.query(ToolWithPartModel).offset(skip).limit(limit).all()
    return tools


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