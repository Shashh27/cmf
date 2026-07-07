"""
Stock Auto-Update Service

Automatically updates stock quantities and statuses when part requirements change
"""

from sqlalchemy.orm import Session
from typing import Dict, Any
from DB.models.inventory import RawMaterialStock, RawMaterialUnit
from DB.models.oms import Part
from .raw_material_calculations import RawMaterialCalculationService
from .raw_material_history_service import RawMaterialHistoryService


class StockAutoUpdateService:
    """Service for automatic stock quantity updates based on part requirements"""
    
    @staticmethod
    def update_stock_quantities_on_part_change(db: Session, part_id: int) -> Dict[str, Any]:
        """
        Update stock quantities when a part's required quantity changes
        
        Args:
            db: Database session
            part_id: Part ID that was updated
            
        Returns:
            Dictionary with update results
        """
        try:
            # Get the updated part
            part = db.query(Part).filter(Part.id == part_id).first()
            if not part or not part.raw_material_stock_id:
                return {"success": False, "message": "No stock assigned to part"}
            
            # Get the stock
            stock = db.query(RawMaterialStock).filter(
                RawMaterialStock.id == part.raw_material_stock_id
            ).first()
            
            if not stock:
                return {"success": False, "message": "Stock not found"}
            
            # Get all parts linked to this stock
            if stock.part_id:
                part_ids = [pid.strip() for pid in stock.part_id.split(',') if pid.strip()]
                linked_parts = db.query(Part).filter(Part.id.in_(part_ids)).all()
            else:
                linked_parts = [part]
            
            # Calculate total required quantity from all linked parts
            total_required = sum(p.required_length or 0 for p in linked_parts)
            
            # Update stock quantities based on part requirements
            old_allocated = stock.allocated_quantity
            stock.allocated_quantity = int(total_required)
            stock.available_quantity = int(stock.quantity - total_required)
            
            # Recalculate properties based on original quantity
            RawMaterialCalculationService.update_stock_calculations(db, stock)
            
            db.commit()
            
            return {
                "success": True,
                "stock_id": stock.id,
                "material_name": stock.material.material_name if stock.material else "Unknown",
                "form_type": stock.form_type,
                "old_allocated": old_allocated,
                "new_allocated": stock.allocated_quantity,
                "available_quantity": stock.available_quantity,
                "total_required": total_required,
                "original_quantity": stock.quantity,
                "linked_parts_count": len(linked_parts),
                "message": f"Stock quantities updated based on {len(linked_parts)} linked parts"
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def update_all_stock_quantities(db: Session) -> Dict[str, Any]:
        """
        Update all stock quantities based on current part requirements
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with update results for all stocks
        """
        try:
            # Get all stocks with linked parts
            stocks_with_parts = db.query(RawMaterialStock).filter(
                RawMaterialStock.part_id.isnot(None),
                RawMaterialStock.part_id != ''
            ).all()
            
            updated_stocks = 0
            results = []
            
            for stock in stocks_with_parts:
                # Parse part IDs from comma-separated string
                part_ids = []
                if stock.part_id:
                    part_ids = [pid.strip() for pid in stock.part_id.split(',') if pid.strip()]
                
                if not part_ids:
                    continue
                
                # Get all parts linked to this stock
                linked_parts = db.query(Part).filter(Part.id.in_(part_ids)).all()
                
                # Calculate total required quantity from all linked parts
                total_required = sum(p.required_length or 0 for p in linked_parts)
                
                # Update stock quantities
                old_allocated = stock.allocated_quantity
                stock.allocated_quantity = int(total_required)
                stock.available_quantity = int(stock.quantity - total_required)
                
                # Recalculate properties
                RawMaterialCalculationService.update_stock_calculations(db, stock)
                
                updated_stocks += 1
                
                result = {
                    "stock_id": stock.id,
                    "material_name": stock.material.material_name if stock.material else "Unknown",
                    "form_type": stock.form_type,
                    "original_quantity": stock.quantity,
                    "old_allocated": old_allocated,
                    "new_allocated": stock.allocated_quantity,
                    "available_quantity": stock.available_quantity,
                    "total_required": total_required,
                    "linked_parts_count": len(linked_parts)
                }
                results.append(result)
            
            db.commit()
            
            return {
                "success": True,
                "updated_stocks": updated_stocks,
                "results": results,
                "message": f"Updated {updated_stocks} stock items based on current part requirements"
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def get_stock_summary(db: Session) -> Dict[str, Any]:
        """
        Get summary of all stock quantities
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with stock summary
        """
        try:
            from sqlalchemy import text
            
            summary = db.execute(text("""
                SELECT 
                    COUNT(*) as total_stocks,
                    SUM(quantity) as total_quantity,
                    SUM(allocated_quantity) as total_allocated,
                    SUM(available_quantity) as total_available,
                    COUNT(CASE WHEN allocated_quantity > 0 THEN 1 END) as stocks_with_allocation
                FROM inventory.raw_material_stock
            """)).fetchone()
            
            return {
                "success": True,
                "total_stocks": summary.total_stocks,
                "total_quantity": summary.total_quantity,
                "total_allocated": summary.total_allocated,
                "total_available": summary.total_available,
                "stocks_with_allocation": summary.stocks_with_allocation,
                "stocks_without_allocation": summary.total_stocks - summary.stocks_with_allocation
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def validate_stock_part_consistency(db: Session) -> Dict[str, Any]:
        """
        Validate consistency between stock quantities and part requirements
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with validation results
        """
        try:
            # Get all stocks with linked parts
            stocks_with_parts = db.query(RawMaterialStock).filter(
                RawMaterialStock.part_id.isnot(None),
                RawMaterialStock.part_id != ''
            ).all()
            
            inconsistencies = []
            consistent_stocks = 0
            
            for stock in stocks_with_parts:
                # Parse part IDs
                part_ids = []
                if stock.part_id:
                    part_ids = [pid.strip() for pid in stock.part_id.split(',') if pid.strip()]
                
                if not part_ids:
                    continue
                
                # Get linked parts
                linked_parts = db.query(Part).filter(Part.id.in_(part_ids)).all()
                
                # Calculate total required from parts
                total_required = sum(p.required_length or 0 for p in linked_parts)
                
                # Check if quantities match expected formula
                expected_available = stock.quantity - total_required
                is_consistent = (
                    stock.allocated_quantity == total_required and
                    stock.available_quantity == expected_available
                )
                
                if is_consistent:
                    consistent_stocks += 1
                else:
                    inconsistencies.append({
                        "stock_id": stock.id,
                        "material_name": stock.material.material_name if stock.material else "Unknown",
                        "original_quantity": stock.quantity,
                        "allocated_quantity": stock.allocated_quantity,
                        "available_quantity": stock.available_quantity,
                        "total_required": total_required,
                        "expected_available": expected_available,
                        "is_consistent": is_consistent,
                        "issue": "Quantity mismatch" if not is_consistent else None
                    })
            
            return {
                "success": True,
                "total_stocks_checked": len(stocks_with_parts),
                "consistent_stocks": consistent_stocks,
                "inconsistencies": inconsistencies,
                "consistency_rate": (consistent_stocks / len(stocks_with_parts)) * 100 if stocks_with_parts else 100,
                "message": f"Found {len(inconsistencies)} inconsistencies out of {len(stocks_with_parts)} stocks"
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def update_stock_status_from_units(db: Session, stock_id: int) -> Dict[str, Any]:
        """
        Update stock status based on the actual unit statuses in the units table.
        
        Logic:
        - If ANY unit has status 'available' or 'partially_used' → stock status = 'available'
        - If ALL units have status 'exhausted' or 'not_available' → stock status = 'exhausted' (for general) or 'not available' (for order)
        
        Args:
            db: Database session
            stock_id: Stock ID to update
            
        Returns:
            Dictionary with update results
        """
        try:
            # Get the stock
            stock = db.query(RawMaterialStock).filter(
                RawMaterialStock.id == stock_id
            ).first()
            
            if not stock:
                return {"success": False, "message": "Stock not found"}
            
            # Get all units for this stock
            units = db.query(RawMaterialUnit).filter(
                RawMaterialUnit.stock_id == stock_id
            ).all()
            
            if not units:
                # No units exist, use available_quantity as fallback
                if stock.available_quantity > 0:
                    if stock.source_type == "general":
                        new_status = "available"
                    elif stock.source_type == "order":
                        new_status = "available" if stock.order_status == "received" else "not_available"
                    else:
                        new_status = "available"
                else:
                    # No available quantity
                    if stock.source_type == "order":
                        new_status = "not_available"
                    else:
                        new_status = "exhausted"
            else:
                # Check unit statuses
                available_units = [u for u in units if u.status in ['available', 'partially_used']]
                exhausted_units = [u for u in units if u.status in ['exhausted', 'not_available']]
                
                if available_units:
                    # At least one unit is available
                    if stock.source_type == "general":
                        new_status = "available"
                    elif stock.source_type == "order":
                        # For order stock, only available if order_status is received
                        new_status = "available" if stock.order_status == "received" else "not_available"
                    else:
                        new_status = "available"
                else:
                    # All units are exhausted or not_available
                    if stock.source_type == "general":
                        new_status = "exhausted"
                    elif stock.source_type == "order":
                        # For order stock, always return not_available (order_status shown separately)
                        new_status = "not_available"
                    else:
                        new_status = "exhausted"
            
            # Update stock status
            old_status = stock.status
            stock.status = new_status
            
            # Also update available_quantity based on unit statuses
            available_count = len([u for u in units if u.status in ['available', 'partially_used']])
            stock.available_quantity = available_count
            
            db.commit()
            
            # Log history for stock status change if it changed
            if old_status != new_status:
                try:
                    RawMaterialHistoryService.log_stock_status_changed(
                        db=db,
                        stock_id=stock_id,
                        old_status=old_status,
                        new_status=new_status,
                        user_id=None
                    )
                except Exception as e:
                    print(f"Error logging stock status change history: {e}")
            
            return {
                "success": True,
                "stock_id": stock_id,
                "old_status": old_status,
                "new_status": new_status,
                "total_units": len(units),
                "available_units": available_count,
                "message": f"Stock status updated from '{old_status}' to '{new_status}' based on {available_count} available units"
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def update_all_stock_statuses_from_units(db: Session) -> Dict[str, Any]:
        """
        Update all stock statuses based on their unit statuses.
        
        Args:
            db: Database session
            
        Returns:
            Dictionary with update results for all stocks
        """
        try:
            # Get all stocks
            stocks = db.query(RawMaterialStock).all()
            
            updated_stocks = 0
            results = []
            
            for stock in stocks:
                result = StockAutoUpdateService.update_stock_status_from_units(db, stock.id)
                if result.get("success"):
                    updated_stocks += 1
                    results.append({
                        "stock_id": stock.id,
                        "old_status": result.get("old_status"),
                        "new_status": result.get("new_status"),
                        "available_units": result.get("available_units")
                    })
            
            return {
                "success": True,
                "updated_stocks": updated_stocks,
                "results": results,
                "message": f"Updated {updated_stocks} stock statuses based on unit statuses"
            }
            
        except Exception as e:
            db.rollback()
            return {"success": False, "error": str(e)}
    
    @staticmethod
    def update_raw_material_status_from_stocks(db: Session, material_id: int) -> Dict[str, Any]:
        """
        Update raw material availability status based on all its stocks and units.
        
        Logic:
        - If ANY stock has ANY available unit → raw material is available
        - If ALL stocks have ALL units exhausted → raw material is not available
        
        Args:
            db: Database session
            material_id: Raw material ID to update
            
        Returns:
            Dictionary with update results
        """
        try:
            from DB.models.inventory import RawMaterial
            
            # Get the raw material
            material = db.query(RawMaterial).filter(
                RawMaterial.id == material_id
            ).first()
            
            if not material:
                return {"success": False, "message": "Raw material not found"}
            
            # Get all stocks for this material
            stocks = db.query(RawMaterialStock).filter(
                RawMaterialStock.material_id == material_id
            ).all()
            
            if not stocks:
                # No stocks exist, material is not available
                has_available = False
                total_units = 0
                total_available_units = 0
            else:
                # Check all stocks and their units
                total_available_units = 0
                total_units = 0
                
                for stock in stocks:
                    units = db.query(RawMaterialUnit).filter(
                        RawMaterialUnit.stock_id == stock.id
                    ).all()
                    
                    total_units += len(units)
                    total_available_units += len([u for u in units if u.status in ['available', 'partially_used']])
                
                # Material is available if at least one unit is available
                has_available = total_available_units > 0
            
            # Note: RawMaterial model doesn't have a status field in the database
            # The status is calculated dynamically in the GET endpoint
            # This function just returns the calculated status for reference
            
            return {
                "success": True,
                "material_id": material_id,
                "material_name": material.material_name,
                "has_available_stock": has_available,
                "total_stocks": len(stocks),
                "total_units": total_units,
                "total_available_units": total_available_units,
                "status": "available" if has_available else "not available",
                "message": f"Raw material '{material.material_name}' is {'available' if has_available else 'not available'} ({total_available_units}/{total_units} units available)"
            }
            
        except Exception as e:
            return {"success": False, "error": str(e)}
