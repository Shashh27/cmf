"""
Raw Material Tracking Service

Handles real-time tracking of raw material allocation and usage with parts:
- Step 1: Subtract quantity with automatic calculations (volume, mass, weight, cost)
- Step 2: Prevent linking when raw material stock unavailable
- Step 3: Add required quantity field for order-linked parts
"""

from typing import Optional, Dict, List
from sqlalchemy.orm import Session
from sqlalchemy import text

from DB.models.inventory import RawMaterialStock, RawMaterial
from DB.models.oms import Part
from .raw_material_calculations import RawMaterialCalculationService


class RawMaterialTrackingService:
    """Service for real-time raw material tracking with parts"""
    
    @staticmethod
    def allocate_raw_material_to_part(
        db: Session, 
        part_id: int, 
        stock_id: int, 
        required_quantity: float,
        user_id: int
    ) -> Dict[str, any]:
        """
        Allocate raw material stock to a part (Step 1)
        
        Args:
            db: Database session
            part_id: Part ID to allocate material to
            stock_id: Raw material stock ID to allocate from
            required_quantity: Quantity of raw material required for this part
            user_id: User making the allocation
            
        Returns:
            Dictionary with allocation result and updated stock details
        """
        # Get the stock item
        stock = db.query(RawMaterialStock).filter(
            RawMaterialStock.id == stock_id
        ).first()
        
        if not stock:
            raise ValueError(f"Stock item with id {stock_id} not found")
        
        # Check if enough material is available
        if stock.available_quantity < required_quantity:
            raise ValueError(
                f"Insufficient material. Available: {stock.available_quantity}, "
                f"Required: {required_quantity}"
            )
        
        # Get the part
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            raise ValueError(f"Part with id {part_id} not found")
        
        # Update stock quantities
        stock.allocated_quantity += int(required_quantity)
        stock.available_quantity -= int(required_quantity)
        # quantity remains unchanged (original amount)
        
        # Update part with required quantity and stock reference
        part.raw_material_required_quantity = required_quantity
        part.raw_material_stock_id = stock_id
        
        # Recalculate stock properties based on new quantity
        RawMaterialCalculationService.update_stock_calculations(db, stock)
        
        # Update part linking in stock (add part ID to comma-separated list)
        if stock.part_id:
            part_ids = stock.part_id.split(',') if stock.part_id else []
            if str(part_id) not in part_ids:
                part_ids.append(str(part_id))
                stock.part_id = ','.join(part_ids)
        else:
            stock.part_id = str(part_id)
        
        db.commit()
        
        return {
            "success": True,
            "stock_id": stock_id,
            "allocated_quantity": required_quantity,
            "remaining_quantity": stock.available_quantity,
            "updated_calculations": {
                "volume": stock.volume,
                "mass": stock.mass,
                "weight": stock.weight,
                "cost": stock.cost
            }
        }
    
    @staticmethod
    def check_material_availability(
        db: Session, 
        material_id: int, 
        required_quantity: float,
        form_type: Optional[str] = None
    ) -> Dict[str, any]:
        """
        Check if raw material is available for allocation (Step 2)
        
        Args:
            db: Database session
            material_id: Raw material ID to check
            required_quantity: Quantity needed
            form_type: Optional form type filter
            
        Returns:
            Dictionary with availability status and available stock items
        """
        # Build query
        query = db.query(RawMaterialStock).filter(
            RawMaterialStock.material_id == material_id,
            RawMaterialStock.available_quantity >= required_quantity
        )
        
        # Add form type filter if specified
        if form_type:
            query = query.filter(RawMaterialStock.form_type == form_type)
        
        # Only include available stock (received for order-type, any for general-type)
        available_stock = query.filter(
            (RawMaterialStock.source_type == 'general') | 
            (RawMaterialStock.order_status == 'received')
        ).all()
        
        total_available = sum(stock.available_quantity for stock in available_stock)
        
        return {
            "material_id": material_id,
            "required_quantity": required_quantity,
            "total_available": total_available,
            "is_available": total_available >= required_quantity,
            "available_stock_items": [
                {
                    "stock_id": stock.id,
                    "form_type": stock.form_type,
                    "quantity": stock.quantity,
                    "available_quantity": stock.available_quantity,
                    "dimensions": RawMaterialTrackingService._format_dimensions(stock)
                }
                for stock in available_stock
            ]
        }
    
    @staticmethod
    def deallocate_raw_material_from_part(
        db: Session, 
        part_id: int, 
        stock_id: int,
        user_id: int
    ) -> Dict[str, any]:
        """
        Deallocate raw material from a part (return quantity to available stock)
        
        Args:
            db: Database session
            part_id: Part ID to deallocate material from
            stock_id: Stock ID to return quantity to
            user_id: User making the deallocation
            
        Returns:
            Dictionary with deallocation result
        """
        # Get the part
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            raise ValueError(f"Part with id {part_id} not found")
        
        if not part.raw_material_stock_id or not part.raw_material_required_quantity:
            return {"success": True, "message": "No raw material allocated to this part"}
        
        # Get the stock item using the provided stock_id
        stock = db.query(RawMaterialStock).filter(
            RawMaterialStock.id == stock_id
        ).first()
        
        if not stock:
            raise ValueError(f"Stock item with id {stock_id} not found")
        
        # Return quantity to available stock
        returned_quantity = part.raw_material_required_quantity
        stock.allocated_quantity -= int(returned_quantity)
        stock.available_quantity += int(returned_quantity)
        # quantity remains unchanged (original amount)
        
        # Recalculate stock properties
        RawMaterialCalculationService.update_stock_calculations(db, stock)
        
        # Remove part from stock linking
        if stock.part_id:
            part_ids = stock.part_id.split(',') if stock.part_id else []
            if str(part_id) in part_ids:
                part_ids.remove(str(part_id))
                stock.part_id = ','.join(part_ids) if part_ids else None
        
        # Clear part allocation
        part.raw_material_required_quantity = None
        part.raw_material_stock_id = None
        
        db.commit()
        
        return {
            "success": True,
            "stock_id": stock.id,
            "returned_quantity": returned_quantity,
            "remaining_available": stock.available_quantity
        }
    
    @staticmethod
    def update_raw_material_allocation(
        db: Session, 
        part_id: int, 
        stock_id: int, 
        new_required_quantity: float,
        user_id: int
    ) -> Dict[str, any]:
        """
        Update raw material allocation for a part (handle partial deallocation/allocation)
        
        Args:
            db: Database session
            part_id: Part ID to update allocation for
            stock_id: Stock ID to allocate from
            new_required_quantity: New required quantity
            user_id: User making the update
            
        Returns:
            Dictionary with update result
        """
        # Get the part
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            raise ValueError(f"Part with id {part_id} not found")
        
        # Get the stock item
        stock = db.query(RawMaterialStock).filter(
            RawMaterialStock.id == stock_id
        ).first()
        
        if not stock:
            raise ValueError(f"Stock item with id {stock_id} not found")
        
        old_quantity = part.raw_material_required_quantity or 0
        quantity_difference = new_required_quantity - old_quantity
        
        if quantity_difference > 0:
            # Need to allocate more material
            if stock.available_quantity < quantity_difference:
                raise ValueError(
                    f"Insufficient material. Available: {stock.available_quantity}, "
                    f"Additional required: {quantity_difference}"
                )
            
            stock.allocated_quantity += int(quantity_difference)
            stock.available_quantity -= int(quantity_difference)
            
        elif quantity_difference < 0:
            # Need to deallocate some material (return to available)
            return_quantity = abs(quantity_difference)
            stock.allocated_quantity -= int(return_quantity)
            stock.available_quantity += int(return_quantity)
        
        # Update part with new quantity
        part.raw_material_required_quantity = new_required_quantity
        part.raw_material_stock_id = stock_id
        
        # Recalculate stock properties
        RawMaterialCalculationService.update_stock_calculations(db, stock)
        
        db.commit()
        
        return {
            "success": True,
            "stock_id": stock_id,
            "old_quantity": old_quantity,
            "new_quantity": new_required_quantity,
            "quantity_difference": quantity_difference,
            "allocated_quantity": stock.allocated_quantity,
            "available_quantity": stock.available_quantity
        }
    
    @staticmethod
    def get_part_material_requirements(
        db: Session, 
        order_id: Optional[int] = None
    ) -> List[Dict[str, any]]:
        """
        Get material requirements for parts (Step 3)
        
        Args:
            db: Database session
            order_id: Optional order ID to filter parts
            
        Returns:
            List of parts with their material requirements
        """
        query = db.query(Part).filter(
            Part.raw_material_required_quantity.isnot(None),
            Part.raw_material_stock_id.isnot(None)
        )
        
        # Add order filter if specified
        if order_id:
            query = query.filter(Part.product_id == order_id)
        
        parts = query.all()
        
        result = []
        for part in parts:
            stock = db.query(RawMaterialStock).filter(
                RawMaterialStock.id == part.raw_material_stock_id
            ).first()
            
            material = db.query(RawMaterial).filter(
                RawMaterial.id == stock.material_id
            ).first() if stock else None
            
            result.append({
                "part_id": part.id,
                "part_number": part.part_number,
                "part_name": part.part_name,
                "required_quantity": part.raw_material_required_quantity,
                "stock_id": part.raw_material_stock_id,
                "material_name": material.material_name if material else None,
                "form_type": stock.form_type if stock else None,
                "dimensions": RawMaterialTrackingService._format_dimensions(stock) if stock else None,
                "stock_status": stock.status if stock else None
            })
        
        return result
    
    @staticmethod
    def _format_dimensions(stock: RawMaterialStock) -> str:
        """Format stock dimensions for display"""
        if not stock:
            return "N/A"
        
        if stock.form_type == 'Round':
            return f"⌀{stock.diameter} × {stock.length}mm"
        elif stock.form_type == 'Square':
            return f"{stock.breadth} × {stock.height} × {stock.length}mm"
        elif stock.form_type == 'Pipe':
            return f"⌀{stock.outer_diameter}/{stock.inner_diameter} × {stock.length}mm"
        else:
            return "Custom"
    
    @staticmethod
    def validate_part_material_link(
        db: Session, 
        part_id: int, 
        stock_id: int, 
        required_quantity: float
    ) -> Dict[str, any]:
        """
        Validate if a part can be linked to raw material stock
        
        Args:
            db: Database session
            part_id: Part ID to validate
            stock_id: Stock ID to validate
            required_quantity: Required quantity
            
        Returns:
            Dictionary with validation result
        """
        # Check if part exists
        part = db.query(Part).filter(Part.id == part_id).first()
        if not part:
            return {"valid": False, "error": "Part not found"}
        
        # Check if stock exists and is available
        stock = db.query(RawMaterialStock).filter(
            RawMaterialStock.id == stock_id
        ).first()
        
        if not stock:
            return {"valid": False, "error": "Stock not found"}
        
        # Check if stock has enough available quantity
        if stock.available_quantity < required_quantity:
            return {
                "valid": False,
                "error": f"Insufficient stock. Available: {stock.available_quantity}, Required: {required_quantity}"
            }
        
        # Check if stock is in available status
        if stock.source_type == 'order' and stock.order_status != 'received':
            return {
                "valid": False,
                "error": f"Stock not available. Order status: {stock.order_status}"
            }
        
        return {"valid": True, "stock": stock, "part": part}
