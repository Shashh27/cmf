from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
import pandas as pd
import io

from DB.database import get_db
from DB.models.inventory import ToolsList as ToolsListModel
from DB.schemas.inventory import ToolsList, ToolsListCreate, ToolsListUpdate

router = APIRouter(
    prefix="/tools-list",
    tags=["tools-list"]
)


@router.post("/", response_model=ToolsList, status_code=status.HTTP_201_CREATED)
def create_tool(tool: ToolsListCreate, db: Session = Depends(get_db)):
    """Create a new tool"""
    existing_tool = db.query(ToolsListModel).filter(
        ToolsListModel.identification_code == tool.identification_code
    ).first()
    if existing_tool:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tool with identification code {tool.identification_code} already exists"
        )
    
    # Ensure total_quantity is set to quantity if not provided
    tool_data = tool.model_dump()
    if tool_data.get('total_quantity') is None:
        tool_data['total_quantity'] = tool_data.get('quantity', 0)
    
    db_tool = ToolsListModel(**tool_data)
    db.add(db_tool)
    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.post("/upload-excel", response_model=List[ToolsList], status_code=status.HTTP_201_CREATED)
async def upload_tools_excel(
    file: UploadFile = File(..., description="Excel file containing tools data"),
    db: Session = Depends(get_db)
):
    """Upload tools data from Excel file - accepts ANY data, uses defaults for missing required fields"""
    
    if not (file.filename.endswith('.xlsx') or file.filename.endswith('.xls')):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Excel files (.xlsx, .xls) are allowed"
        )
    
    try:
        contents = await file.read()
        
        # Read Excel - headers in row 2 (index 1), row 1 has serial numbers
        df = pd.read_excel(io.BytesIO(contents), header=1)
        
        # Helper functions to safely extract and convert any value
        def safe_str(value, default=""):
            """Convert any value to string, return default if empty/NaN"""
            if value is None or pd.isna(value):
                return default
            str_val = str(value).strip()
            if str_val.lower() == 'nan' or str_val == '':
                return default
            return str_val
        
        def safe_int(value, default=0):
            """Convert any value to int, return default if not possible"""
            if value is None or pd.isna(value):
                return default
            try:
                if isinstance(value, str):
                    cleaned = value.strip().strip("'\"")
                    if cleaned in ['-', '--', '---', '', 'nan', 'NaN']:
                        return default
                    return int(float(cleaned))
                return int(float(value))
            except (ValueError, TypeError):
                return default
        
        def safe_float(value, default=None):
            """Convert any value to float, return default if not possible"""
            if value is None or pd.isna(value):
                return default
            try:
                if isinstance(value, str):
                    cleaned = value.strip().strip("'\"")
                    if cleaned in ['-', '--', '---', '', 'nan', 'NaN']:
                        return default
                    return float(cleaned)
                return float(value)
            except (ValueError, TypeError):
                return default
        
        def is_row_empty(row_dict):
            """Check if entire row is empty (all values are NaN/None)"""
            return all(pd.isna(v) or v is None or str(v).strip() == '' for v in row_dict.values())
        
        # Map column names (case-insensitive matching)
        def find_column(df_columns, possible_names):
            """Find actual column name from possible alternatives"""
            df_cols_lower = {str(col).strip().lower(): col for col in df_columns}
            for possible in possible_names:
                if possible.lower() in df_cols_lower:
                    return df_cols_lower[possible.lower()]
            return None
        
        # Find actual column names in DataFrame
        col_item_desc = find_column(df.columns, ['item description', 'item_description', 'item'])
        col_range = find_column(df.columns, ['range in mm', 'range', 'range_in_mm'])
        col_ident_code = find_column(df.columns, ['identification code', 'identification_code', 'id code', 'code'])
        col_make = find_column(df.columns, ['make'])
        col_quantity = find_column(df.columns, ['quantity', 'qty'])
        col_location = find_column(df.columns, ['location'])
        col_gauge = find_column(df.columns, ['gauge'])
        col_remarks = find_column(df.columns, ['remarks', 'remark'])
        col_amount = find_column(df.columns, ['amount'])
        col_ref_ledger = find_column(df.columns, ['ref ledger', 'ref_ledger', 'reference'])
        col_type = find_column(df.columns, ['type', 'TYPE'])
        
        # Verify essential columns exist
        if not col_item_desc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Column 'Item Description' not found in Excel file"
            )
        if not col_ident_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Column 'Identification Code' not found in Excel file"
            )
        
        # Process rows
        created_tools = []
        
        for idx, row in df.iterrows():
            # Skip completely empty rows
            if is_row_empty(row.to_dict()):
                continue
            
            # Extract all values with safe conversion
            item_desc = safe_str(row.get(col_item_desc) if col_item_desc else None, None)
            ident_code = safe_str(row.get(col_ident_code) if col_ident_code else None, None)
            range_val = safe_str(row.get(col_range) if col_range else None, None)
            make_val = safe_str(row.get(col_make) if col_make else None, None)
            quantity_val = safe_int(row.get(col_quantity) if col_quantity else None, 0)
            location_val = safe_str(row.get(col_location) if col_location else None, None)
            gauge_val = safe_str(row.get(col_gauge) if col_gauge else None, None)
            remarks_val = safe_str(row.get(col_remarks) if col_remarks else None, None)
            amount_val = safe_float(row.get(col_amount) if col_amount else None, None)
            ref_ledger_val = safe_str(row.get(col_ref_ledger) if col_ref_ledger else None, None)
            type_val = safe_str(row.get(col_type) if col_type else None, None)
            
            # Check for duplicate identification code (only if ident_code is not None)
            if ident_code:
                existing_tool = db.query(ToolsListModel).filter(
                    ToolsListModel.identification_code == ident_code
                ).first()
                if existing_tool:
                    continue
            
            # Create tool record
            tool_data = {
                'item_description': item_desc,
                'identification_code': ident_code,
                'range': range_val,
                'make': make_val,
                'quantity': quantity_val,
                'total_quantity': quantity_val,  # Set total_quantity = quantity initially
                'location': location_val,
                'gauge': gauge_val,
                'remarks': remarks_val,
                'amount': amount_val,
                'ref_ledger': ref_ledger_val,
                'type': type_val
            }
            
            db_tool = ToolsListModel(**tool_data)
            db.add(db_tool)
            created_tools.append(db_tool)
        
        # Commit all changes
        db.commit()
        
        # Refresh all created tools
        for tool in created_tools:
            db.refresh(tool)
        
        return created_tools
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error processing Excel file: {str(e)}"
        )


@router.get("/", response_model=List[ToolsList])
def get_tools(db: Session = Depends(get_db)):
    """Get all tools"""
    tools = db.query(ToolsListModel).all()
    return tools


@router.get("/{tool_id}", response_model=ToolsList)
def get_tool(tool_id: int, db: Session = Depends(get_db)):
    """Get a specific tool by ID"""
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {tool_id} not found"
        )
    return tool


@router.get("/identification/{identification_code}", response_model=ToolsList)
def get_tool_by_identification_code(identification_code: str, db: Session = Depends(get_db)):
    """Get a tool by identification code"""
    tool = db.query(ToolsListModel).filter(
        ToolsListModel.identification_code == identification_code
    ).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with identification code {identification_code} not found"
        )
    return tool


@router.put("/{tool_id}", response_model=ToolsList)
def update_tool(tool_id: int, tool_update: ToolsListUpdate, db: Session = Depends(get_db)):
    """Update a tool"""
    db_tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not db_tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {tool_id} not found"
        )
    
    if tool_update.identification_code is not None and tool_update.identification_code != db_tool.identification_code:
        existing_tool = db.query(ToolsListModel).filter(
            ToolsListModel.identification_code == tool_update.identification_code
        ).first()
        if existing_tool:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tool with identification code {tool_update.identification_code} already exists"
            )
    
    update_data = tool_update.model_dump(exclude_unset=True)
    
    # Handle total_quantity logic
    if 'quantity' in update_data and 'total_quantity' not in update_data:
        # If quantity is being updated but total_quantity is not provided, keep existing total_quantity
        pass  # Don't modify total_quantity
    elif 'total_quantity' in update_data:
        # If total_quantity is explicitly provided, use it
        pass  # Use the provided total_quantity
    
    for field, value in update_data.items():
        setattr(db_tool, field, value)
    
    db.commit()
    db.refresh(db_tool)
    return db_tool


@router.delete("/{tool_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tool(tool_id: int, db: Session = Depends(get_db)):
    """Delete a tool"""
    tool = db.query(ToolsListModel).filter(ToolsListModel.id == tool_id).first()
    if not tool:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tool with id {tool_id} not found"
        )
    
    db.delete(tool)
    db.commit()
    return None


@router.get("/type/{tool_type}", response_model=List[ToolsList])
def get_tools_by_type(tool_type: str, db: Session = Depends(get_db)):
    """Get all tools by type"""
    tools = db.query(ToolsListModel).filter(ToolsListModel.type == tool_type).all()
    return tools


@router.post("/migrate-total-quantity", response_model=dict)
def migrate_total_quantity(db: Session = Depends(get_db)):
    """Migrate existing tools to set total_quantity = quantity for null values"""
    tools_to_update = db.query(ToolsListModel).filter(
        ToolsListModel.total_quantity.is_(None)
    ).all()
    
    updated_count = 0
    for tool in tools_to_update:
        tool.total_quantity = tool.quantity if tool.quantity is not None else 0
        updated_count += 1
    
    db.commit()
    
    return {
        "message": f"Successfully migrated {updated_count} tools",
        "updated_count": updated_count
    }


@router.get("/location/{location}", response_model=List[ToolsList])
def get_tools_by_location(location: str, db: Session = Depends(get_db)):
    """Get all tools by location"""
    tools = db.query(ToolsListModel).filter(ToolsListModel.location == location).all()
    return tools