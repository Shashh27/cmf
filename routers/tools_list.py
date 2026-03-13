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
        
        # Detect if it's a valid Excel file
        try:
            # Read first few rows to inspect structure
            df_inspect = pd.read_excel(io.BytesIO(contents), header=None, nrows=10)
        except Exception as excel_err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid Excel file: {str(excel_err)}"
            )
        
        # Header detection logic
        header_row_idx = 0
        header_keywords = ['item description', 'identification code', 'item_description', 'identification_code', 'id code', 'range', 'description', 'make']
        
        for i in range(len(df_inspect)):
            row_values = [str(val).lower().strip() for val in df_inspect.iloc[i].values if not pd.isna(val)]
            # Check if this row contains at least two of our keywords
            matches = sum(1 for kw in header_keywords if any(kw in val for val in row_values))
            if matches >= 2:
                header_row_idx = i
                break
        
        # Read the actual data
        df = pd.read_excel(io.BytesIO(contents), header=header_row_idx)
        
        # Data conversion helpers
        def safe_str(value, default=None):
            if value is None or pd.isna(value): return default
            val = str(value).strip()
            return None if val.lower() in ['nan', 'none', 'null', ''] else val
            
        def safe_int(value, default=0):
            if value is None or pd.isna(value): return default
            try: return int(float(str(value).strip()))
            except: return default
            
        def safe_float(value, default=None):
            if value is None or pd.isna(value): return default
            try: return float(str(value).strip())
            except: return default

        # Improved column mapping
        def find_col(possible_names):
            cols = {str(c).lower().strip(): c for c in df.columns}
            # Try exact match first
            for p in possible_names:
                if p.lower() in cols: return cols[p.lower()]
            # Try partial match
            for p in possible_names:
                for c_lower, original in cols.items():
                    if p.lower() in c_lower: return original
            return None

        # Map all columns
        col_map = {
            'item_description': find_col(['item description', 'item_description', 'item', 'description']),
            'range': find_col(['range', 'range in mm']),
            'identification_code': find_col(['identification code', 'identification_code', 'id code', 'code', 'id']),
            'make': find_col(['make', 'brand', 'manufacturer']),
            'quantity': find_col(['quantity', 'qty', 'stock', 'available']),
            'location': find_col(['location', 'rack', 'bin']),
            'gauge': find_col(['gauge', 'size']),
            'remarks': find_col(['remarks', 'remark', 'note']),
            'amount': find_col(['amount', 'price', 'cost']),
            'ref_ledger': find_col(['ref ledger', 'ref_ledger', 'reference']),
            'type': find_col(['type', 'category'])
        }

        if not col_map['item_description']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not find 'Item Description' column. Please check your Excel headers."
            )

        processed_count = 0
        for _, row in df.iterrows():
            item_desc = safe_str(row.get(col_map['item_description']))
            ident_code = safe_str(row.get(col_map['identification_code']))
            
            if not item_desc and not ident_code: continue
            
            # Use item_desc as ident_code if missing, or vice versa
            if not ident_code: ident_code = item_desc
            if not item_desc: item_desc = ident_code

            quantity_val = safe_int(row.get(col_map['quantity']), 0)
            
            # Check for existing
            existing = db.query(ToolsListModel).filter(
                ToolsListModel.identification_code == ident_code
            ).first()
            
            tool_data = {
                'item_description': item_desc,
                'range': safe_str(row.get(col_map['range'])),
                'make': safe_str(row.get(col_map['make'])),
                'quantity': quantity_val,
                'total_quantity': quantity_val,
                'location': safe_str(row.get(col_map['location'])),
                'gauge': safe_str(row.get(col_map['gauge'])),
                'remarks': safe_str(row.get(col_map['remarks'])),
                'amount': safe_float(row.get(col_map['amount'])),
                'ref_ledger': safe_str(row.get(col_map['ref_ledger'])),
                'type': safe_str(row.get(col_map['type']), "NON-CONSUMABLES")
            }
            
            if existing:
                for key, value in tool_data.items():
                    setattr(existing, key, value)
            else:
                new_tool = ToolsListModel(identification_code=ident_code, **tool_data)
                db.add(new_tool)
            
            processed_count += 1
            if processed_count % 50 == 0:
                db.flush() # Flush every 50 rows for performance and consistency

        db.commit()
        return db.query(ToolsListModel).order_by(ToolsListModel.id.desc()).limit(processed_count).all()
        
    except HTTPException: raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Error processing Excel file: {str(e)}")

        
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