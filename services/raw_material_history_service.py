"""
Raw Material History Service

This service provides functions to log all raw material related activities to the database.
It tracks:
- Material creation, updates, deletion
- Stock creation, updates, deletion
- Unit creation, deletion
- Material linking/unlinking to parts
- Order status changes
- Vendor changes
"""

from sqlalchemy.orm import Session
from typing import Optional, Dict, Any
import json
from datetime import datetime

from DB.models.inventory import (
    RawMaterialHistory as RawMaterialHistoryModel,
    RawMaterial as RawMaterialModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
    Vendors as VendorsModel
)
from DB.models.oms import Order as OrderModel, Part as PartModel
from DB.models.access_control import AccessUser as AccessUserModel


class RawMaterialHistoryService:
    """Service for logging raw material history"""
    
    @staticmethod
    def log_material_created(
        db: Session,
        material_id: int,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a raw material is created"""
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == material_id).first()
        if not material:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="material_created",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=material_id,
            material_name=material.material_name,
            description=f"Raw material '{material.material_name}' created"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_material_updated(
        db: Session,
        material_id: int,
        old_values: Dict[str, Any],
        new_values: Dict[str, Any],
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a raw material is updated"""
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == material_id).first()
        if not material:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="material_updated",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=material_id,
            material_name=material.material_name,
            old_values=json.dumps(old_values),
            new_values=json.dumps(new_values),
            description=f"Raw material '{material.material_name}' updated"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_material_deleted(
        db: Session,
        material_id: int,
        material_name: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a raw material is deleted"""
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="material_deleted",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=material_id,  # Keep ID even though material is deleted
            material_name=material_name,
            description=f"Raw material '{material_name}' deleted"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_stock_created(
        db: Session,
        stock_id: int,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a stock is created"""
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if not stock:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
        
        # Format dimensions
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock.source_type == "order" and stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        if stock.source_type == "general" and stock.vendor:
            vendor_name = stock.vendor.company_name
        
        history = RawMaterialHistoryModel(
            activity_type="stock_created",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id,
            material_name=material.material_name if material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            order_id=stock.source_order_id,
            order_status=stock.order_status,
            quantity=stock.quantity,
            form_type=stock.form_type,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            description=f"Stock created: {stock.quantity} units of {material.material_name if material else 'Unknown'}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_stock_updated(
        db: Session,
        stock_id: int,
        old_values: Dict[str, Any],
        new_values: Dict[str, Any],
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a stock is updated"""
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if not stock:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        
        # Format dimensions
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        history = RawMaterialHistoryModel(
            activity_type="stock_updated",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id,
            material_name=material.material_name if material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            order_id=stock.source_order_id,
            order_status=stock.order_status,
            quantity=stock.quantity,
            form_type=stock.form_type,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            old_values=json.dumps(old_values),
            new_values=json.dumps(new_values),
            description=f"Stock updated for {material.material_name if material else 'Unknown'}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_stock_deleted(
        db: Session,
        stock_id: int,
        material_name: str,
        source_type: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a stock is deleted"""
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="stock_deleted",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            stock_id=stock_id,
            material_name=material_name,
            source_type=source_type,
            description=f"Stock deleted for {material_name}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_unit_created(
        db: Session,
        unit_id: int,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a unit is created"""
        unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
        if not unit:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == unit.stock_id).first()
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first() if stock else None
        
        history = RawMaterialHistoryModel(
            activity_type="unit_created",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id if stock else None,
            material_name=material.material_name if material else None,
            stock_id=unit.stock_id,
            unit_id=unit.id,
            total_length=unit.total_length,
            remaining_length=unit.remaining_length,
            description=f"Unit created: {unit.total_length}mm for {material.material_name if material else 'Unknown'}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_unit_deleted(
        db: Session,
        unit_id: int,
        material_name: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when a unit is deleted"""
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="unit_deleted",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            unit_id=unit_id,
            material_name=material_name,
            description=f"Unit deleted for {material_name}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_material_linked(
        db: Session,
        unit_id: int,
        part_id: int,
        used_length: float,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when material is linked to a part"""
        unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
        if not unit:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == unit.stock_id).first()
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first() if stock else None
        part = db.query(PartModel).filter(PartModel.id == part_id).first()
        
        # Get order from part if stock is general (general stock has no order)
        # For order stock, get order from stock
        order = None
        order_id = None
        order_number = None
        if stock and stock.source_type == 'order':
            order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first() if stock else None
            order_id = stock.source_order_id
        elif part:
            # For general stock, get order from the part
            order = db.query(OrderModel).filter(OrderModel.id == part.order_id).first() if part.order_id else None
            order_id = part.order_id
        
        if order:
            order_number = order.sale_order_number
        
        # Format dimensions
        dimensions = ""
        if stock and stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {unit.total_length}mm" if stock.diameter and unit.total_length else ""
        elif stock and stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {unit.total_length}mm" if stock.breadth and stock.height and unit.total_length else ""
        elif stock and stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {unit.total_length}mm" if stock.outer_diameter and stock.inner_diameter and unit.total_length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock and stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock and stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        history = RawMaterialHistoryModel(
            activity_type="material_linked",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id if stock else None,
            material_name=material.material_name if material else None,
            stock_id=unit.stock_id,
            source_type=stock.source_type if stock else None,
            order_id=order_id,
            order_number=order_number,
            order_status=stock.order_status if stock else None,
            form_type=stock.form_type if stock else None,
            dimensions=dimensions,
            part_id=part_id,
            part_name=part.part_name if part else None,
            part_number=part.part_number if part else None,
            used_length=used_length,
            unit_id=unit_id,
            total_length=unit.total_length,
            remaining_length=unit.remaining_length,
            vendor_id=stock.received_vendor_id if stock else None,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            description=f"Material linked: {part.part_name if part else 'Unknown'} used {used_length}mm"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_material_unlinked(
        db: Session,
        unit_id: int,
        part_id: int,
        material_name: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when material is unlinked from a part"""
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        part = db.query(PartModel).filter(PartModel.id == part_id).first()
        unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
        
        # Get stock and material details
        stock = None
        material = None
        if unit:
            stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == unit.stock_id).first()
            if stock:
                material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        
        # Get order from part (for both general and order stock)
        order = None
        order_id = None
        order_number = None
        if part and part.order_id:
            order = db.query(OrderModel).filter(OrderModel.id == part.order_id).first()
            order_id = part.order_id
            if order:
                order_number = order.sale_order_number
        
        # Format dimensions
        dimensions = ""
        if stock and stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {unit.total_length}mm" if stock.diameter and unit and unit.total_length else ""
        elif stock and stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {unit.total_length}mm" if stock.breadth and stock.height and unit and unit.total_length else ""
        elif stock and stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {unit.total_length}mm" if stock.outer_diameter and stock.inner_diameter and unit and unit.total_length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock and stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock and stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        history = RawMaterialHistoryModel(
            activity_type="material_unlinked",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id if stock else None,
            material_name=material_name,
            stock_id=unit.stock_id if unit else None,
            source_type=stock.source_type if stock else None,
            order_id=order_id,
            order_number=order_number,
            order_status=stock.order_status if stock else None,
            form_type=stock.form_type if stock else None,
            dimensions=dimensions,
            part_id=part_id,
            part_name=part.part_name if part else None,
            part_number=part.part_number if part else None,
            unit_id=unit_id,
            total_length=unit.total_length if unit else None,
            remaining_length=unit.remaining_length if unit else None,
            vendor_id=stock.received_vendor_id if stock else None,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            description=f"Material unlinked from {part.part_name if part else 'Unknown'}"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_order_status_changed(
        db: Session,
        stock_id: int,
        old_status: str,
        new_status: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when order status is changed"""
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if not stock:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        order = db.query(OrderModel).filter(OrderModel.id == stock.source_order_id).first()
        
        # Format dimensions
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Get vendor information
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
            except (ValueError, AttributeError):
                pass
        
        if stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
        
        history = RawMaterialHistoryModel(
            activity_type="order_status_changed",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id,
            material_name=material.material_name if material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            order_id=stock.source_order_id,
            order_status=new_status,
            quantity=stock.quantity,
            form_type=stock.form_type,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            old_values=json.dumps({"old_status": old_status}),
            new_values=json.dumps({"new_status": new_status}),
            description=f"Order status changed from '{old_status}' to '{new_status}'"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_stock_status_changed(
        db: Session,
        stock_id: int,
        old_status: str,
        new_status: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when stock status is changed (available → exhausted, etc.)"""
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if not stock:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        
        # Format dimensions
        dimensions = ""
        if stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        history = RawMaterialHistoryModel(
            activity_type="stock_status_changed",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id,
            material_name=material.material_name if material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            order_id=stock.source_order_id,
            order_status=stock.order_status,
            quantity=stock.quantity,
            form_type=stock.form_type,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            old_values=json.dumps({"old_status": old_status}),
            new_values=json.dumps({"new_status": new_status}),
            description=f"Stock status changed from '{old_status}' to '{new_status}'"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_unit_status_changed(
        db: Session,
        unit_id: int,
        old_status: str,
        new_status: str,
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when unit status is changed (available → partially_used → exhausted)"""
        unit = db.query(RawMaterialUnitModel).filter(RawMaterialUnitModel.id == unit_id).first()
        if not unit:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == unit.stock_id).first()
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first() if stock else None
        
        # Format dimensions
        dimensions = ""
        if stock and stock.form_type == "Round":
            dimensions = f"Ø{stock.diameter}mm × {stock.length}mm" if stock.diameter and stock.length else ""
        elif stock and stock.form_type == "Square":
            dimensions = f"{stock.breadth}mm × {stock.height}mm × {stock.length}mm" if stock.breadth and stock.height and stock.length else ""
        elif stock and stock.form_type == "Pipe":
            dimensions = f"Ø{stock.outer_diameter}mm (ID: {stock.inner_diameter}mm) × {stock.length}mm" if stock.outer_diameter and stock.inner_diameter and stock.length else ""
        
        # Get vendor information
        vendor_name = None
        enquiry_vendor_name = None
        enquiry_vendor_count = 0
        received_vendor_name = None
        
        if stock and stock.vendor_id:
            try:
                vendor_ids = [int(vid.strip()) for vid in stock.vendor_id.split(',') if vid.strip()]
                vendors = db.query(VendorsModel).filter(VendorsModel.id.in_(vendor_ids)).all()
                if vendors:
                    enquiry_vendor_name = ", ".join([vendor.company_name for vendor in vendors])
                    enquiry_vendor_count = len(vendors)
                    vendor_name = enquiry_vendor_name
            except (ValueError, AttributeError):
                pass
        
        if stock and stock.received_vendor_id:
            received_vendor = db.query(VendorsModel).filter(VendorsModel.id == stock.received_vendor_id).first()
            if received_vendor:
                received_vendor_name = received_vendor.company_name
                if not vendor_name:
                    vendor_name = received_vendor_name
        
        history = RawMaterialHistoryModel(
            activity_type="unit_status_changed",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id if stock else None,
            material_name=material.material_name if material else None,
            stock_id=unit.stock_id,
            source_type=stock.source_type if stock else None,
            order_id=stock.source_order_id if stock else None,
            order_status=stock.order_status if stock else None,
            unit_id=unit.id,
            total_length=unit.total_length,
            remaining_length=unit.remaining_length,
            form_type=stock.form_type if stock else None,
            dimensions=dimensions,
            vendor_id=stock.received_vendor_id if stock else None,
            vendor_name=vendor_name,
            enquiry_vendor_name=enquiry_vendor_name,
            enquiry_vendor_count=enquiry_vendor_count,
            received_vendor_name=received_vendor_name,
            old_values=json.dumps({"old_status": old_status}),
            new_values=json.dumps({"new_status": new_status}),
            description=f"Unit status changed from '{old_status}' to '{new_status}'"
        )
        db.add(history)
        db.commit()
    
    @staticmethod
    def log_vendor_changed(
        db: Session,
        stock_id: int,
        old_vendor_id: Optional[int],
        new_vendor_id: Optional[int],
        user_id: Optional[int] = None,
        user_role: Optional[str] = None
    ):
        """Log when vendor is changed for a stock"""
        stock = db.query(RawMaterialStockModel).filter(RawMaterialStockModel.id == stock_id).first()
        if not stock:
            return
        
        user = db.query(AccessUserModel).filter(AccessUserModel.id == user_id).first() if user_id else None
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == stock.material_id).first()
        
        old_vendor = db.query(VendorsModel).filter(VendorsModel.id == old_vendor_id).first() if old_vendor_id else None
        new_vendor = db.query(VendorsModel).filter(VendorsModel.id == new_vendor_id).first() if new_vendor_id else None
        
        history = RawMaterialHistoryModel(
            activity_type="vendor_changed",
            user_id=user_id,
            user_role=user_role or (user.role if user else None),
            material_id=stock.material_id,
            material_name=material.material_name if material else None,
            stock_id=stock.id,
            source_type=stock.source_type,
            vendor_id=new_vendor_id,
            vendor_name=new_vendor.company_name if new_vendor else None,
            old_values=json.dumps({"old_vendor": old_vendor.company_name if old_vendor else None}),
            new_values=json.dumps({"new_vendor": new_vendor.company_name if new_vendor else None}),
            description=f"Vendor changed from '{old_vendor.company_name if old_vendor else 'None'}' to '{new_vendor.company_name if new_vendor else 'None'}'"
        )
        db.add(history)
        db.commit()
