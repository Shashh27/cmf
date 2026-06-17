from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
import re
from DB.models.inventory import (
    RawMaterial as RawMaterialModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
    RawMaterialUsage as RawMaterialUsageModel,
)
from DB.models.oms import Part as PartModel, Order as OrderModel
from services.raw_material_calculations import RawMaterialCalculationService


class AutoExtractService:
    """Service for auto-extracting raw materials from documents and allocating to parts"""
    
    @staticmethod
    def auto_detect_form_type(dimensions: Dict) -> str:
        """
        Auto-detect form type from dimensions
        Round: diameter only (no inner_diameter)
        Pipe: diameter + inner_diameter
        Square: breadth + height + length
        """
        diameter = dimensions.get('diameter')
        inner_diameter = dimensions.get('inner_diameter')
        length = dimensions.get('length')
        breadth = dimensions.get('breadth')
        height = dimensions.get('height')
        
        # Count non-null dimension values
        dimension_count = sum([
            1 for val in [diameter, inner_diameter, length, breadth, height]
            if val is not None and val > 0
        ])
        
        # Priority-based detection
        if inner_diameter and diameter:
            return 'Pipe'
        elif breadth and height and length:
            return 'Square'
        elif diameter and length:
            # If only diameter and length, check if it could be square (if diameter > 100, might be breadth)
            # For now, assume Round for 2 dimensions
            return 'Round'
        elif diameter:
            return 'Round'
        elif length:
            # Only length - can't determine, default to Round
            return 'Round'
        else:
            # Default to Round for 2D drawings
            return 'Round'
    
    @staticmethod
    def parse_dimensions(stock_size: str) -> Dict:
        """
        Parse stock size string to dimensions dictionary
        Examples:
        - "50x1000" -> {'diameter': 50, 'length': 1000}
        - "50x50x1000" -> {'breadth': 50, 'height': 50, 'length': 1000}
        - "50/30x1000" -> {'diameter': 50, 'inner_diameter': 30, 'length': 1000}
        - "122 x 1165 x 1380" -> Try to detect form type based on values
        """
        dimensions = {}
        
        if not stock_size:
            return dimensions
        
        try:
            # Handle format like "CYLINDER 260(DIA) x 50(LENGTH)"
            if '(dia)' in stock_size.lower() or '(diameter)' in stock_size.lower():
                dia_match = re.search(r'(\d+)\s*\(\s*dia(?:meter)?\s*\)', stock_size, re.IGNORECASE)
                len_match = re.search(r'(\d+)\s*\(\s*len(?:gth)?\s*\)', stock_size, re.IGNORECASE)
                if dia_match:
                    dimensions['diameter'] = float(dia_match.group(1))
                if len_match:
                    dimensions['length'] = float(len_match.group(1))
                return dimensions
            
            # Try different formats
            if '/' in stock_size:
                # Pipe format: 50/30x1000
                parts = stock_size.replace('x', '/').split('/')
                if len(parts) >= 3:
                    dimensions['diameter'] = float(parts[0])
                    dimensions['inner_diameter'] = float(parts[1])
                    dimensions['length'] = float(parts[2])
            elif 'x' in stock_size:
                parts = stock_size.split('x')
                if len(parts) == 2:
                    # Round: 50x1000
                    dimensions['diameter'] = float(parts[0])
                    dimensions['length'] = float(parts[1])
                elif len(parts) == 3:
                    # 3 numbers: could be Square (breadth x height x length) or Round with length
                    # Use heuristics: if all three are similar in magnitude, likely square
                    # If one is much larger than the other two, it's likely length
                    values = [float(p.strip()) for p in parts]
                    values_sorted = sorted(values)
                    
                    # If the largest is significantly larger than the others, treat it as length
                    if values_sorted[2] > values_sorted[1] * 2:
                        # Treat as Square: breadth x height x length
                        dimensions['breadth'] = values[0]
                        dimensions['height'] = values[1]
                        dimensions['length'] = values[2]
                    else:
                        # Similar magnitudes - default to Square for 3 dimensions
                        dimensions['breadth'] = values[0]
                        dimensions['height'] = values[1]
                        dimensions['length'] = values[2]
        except (ValueError, IndexError):
            pass
        
        return dimensions
    
    @staticmethod
    def find_material_by_name(db: Session, material_name: str) -> Optional[RawMaterialModel]:
        """Find material by name (case-insensitive)"""
        return db.query(RawMaterialModel).filter(
            RawMaterialModel.material_name.ilike(f"%{material_name}%")
        ).first()
    
    @staticmethod
    def check_general_stock_availability(
        db: Session,
        material_id: int,
        form_type: str,
        dimensions: Dict,
        required_quantity: int
    ) -> Optional[RawMaterialStockModel]:
        """
        Check if general stock is available with matching specifications
        Returns the stock if found, None otherwise
        """
        query = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.source_type == 'general',
            RawMaterialStockModel.status == 'available',
            RawMaterialStockModel.material_id == material_id,
            RawMaterialStockModel.form_type == form_type,
            RawMaterialStockModel.available_quantity >= required_quantity
        )
        
        # Filter by dimensions
        diameter = dimensions.get('diameter')
        length = dimensions.get('length')
        breadth = dimensions.get('breadth')
        height = dimensions.get('height')
        inner_diameter = dimensions.get('inner_diameter')
        
        if diameter is not None:
            query = query.filter(RawMaterialStockModel.diameter == diameter)
        if length is not None:
            query = query.filter(RawMaterialStockModel.length == length)
        if breadth is not None:
            query = query.filter(RawMaterialStockModel.breadth == breadth)
        if height is not None:
            query = query.filter(RawMaterialStockModel.height == height)
        if inner_diameter is not None:
            query = query.filter(RawMaterialStockModel.inner_diameter == inner_diameter)
        
        return query.first()
    
    @staticmethod
    def allocate_from_general_stock(
        db: Session,
        stock: RawMaterialStockModel,
        part: PartModel,
        required_length: float
    ) -> Dict:
        """
        Allocate a unit from general stock to a part
        Returns the allocation result
        """
        # Find an available unit
        unit = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id == stock.id,
            RawMaterialUnitModel.status == 'available',
            RawMaterialUnitModel.remaining_length >= required_length
        ).first()
        
        if not unit:
            return {
                'success': False,
                'message': 'No available unit with sufficient length',
                'action': 'show_procure_button'
            }
        
        # Update part with unit assignment
        part.raw_material_unit_id = unit.id
        part.required_length = required_length
        part.raw_material_source_type = 'general'
        db.commit()
        
        return {
            'success': True,
            'action': 'allocated_from_general_stock',
            'stock_id': stock.id,
            'unit_id': unit.id,
            'message': f'Allocated from general stock (Unit #{unit.id})'
        }
    
    @staticmethod
    def create_order_stock_for_part(
        db: Session,
        part: PartModel,
        material_id: int,
        form_type: str,
        dimensions: Dict,
        quantity: int,
        required_length: float,
        user_id: int,
        process_type: str = 'Barstocks'
    ) -> Dict:
        """
        Create order stock for a part when general stock is not available
        Returns the created stock details
        """
        # Validate dimensions based on form type
        if form_type == 'Round':
            if dimensions.get('diameter') is None or dimensions.get('length') is None:
                return {
                    'success': False,
                    'action': 'invalid_dimensions',
                    'message': 'Diameter and Length are required for Round form type'
                }
        elif form_type == 'Square':
            if dimensions.get('breadth') is None or dimensions.get('height') is None or dimensions.get('length') is None:
                return {
                    'success': False,
                    'action': 'invalid_dimensions',
                    'message': 'Breadth, Height, and Length are required for Square form type'
                }
        elif form_type == 'Pipe':
            if dimensions.get('diameter') is None or dimensions.get('inner_diameter') is None or dimensions.get('length') is None:
                return {
                    'success': False,
                    'action': 'invalid_dimensions',
                    'message': 'Outer Diameter, Inner Diameter, and Length are required for Pipe form type'
                }
        
        # Get order from part's product for source_order_id
        source_order_id = None
        if part.product_id:
            order = db.query(OrderModel).filter(OrderModel.product_id == part.product_id).first()
            if order:
                source_order_id = order.id

        # Create stock entry
        stock = RawMaterialStockModel(
            material_id=material_id,
            form_type=form_type,
            process_type=process_type,  # Use the provided process_type
            quantity=quantity,
            source_type='order',
            source_order_id=source_order_id,
            order_status='enquiry',
            part_id=str(part.id),
            creation_source='auto_extract',
            user_id=user_id,
            status='available',
            allocated_quantity=0,
            available_quantity=quantity
        )
        
        # Set dimensions
        stock.diameter = dimensions.get('diameter')
        stock.length = dimensions.get('length')
        stock.breadth = dimensions.get('breadth')
        stock.height = dimensions.get('height')
        stock.inner_diameter = dimensions.get('inner_diameter')
        stock.outer_diameter = dimensions.get('diameter')
        
        # Get material
        material = db.query(RawMaterialModel).filter(RawMaterialModel.id == material_id).first()
        if not material:
            return {
                'success': False,
                'action': 'material_not_found',
                'message': 'Material not found in database'
            }
        
        # Create stock data object for calculations
        from collections import namedtuple
        StockData = namedtuple('StockData', [
            'form_type', 'diameter', 'length', 'breadth', 'height',
            'inner_diameter', 'outer_diameter', 'quantity'
        ])
        stock_data = StockData(
            form_type=form_type,
            diameter=dimensions.get('diameter') or 0,
            length=dimensions.get('length') or 0,
            breadth=dimensions.get('breadth') or 0,
            height=dimensions.get('height') or 0,
            inner_diameter=dimensions.get('inner_diameter') or 0,
            outer_diameter=dimensions.get('diameter') or 0,
            quantity=quantity
        )
        
        # Calculate volume, mass, weight, cost
        try:
            calculations = RawMaterialCalculationService.calculate_stock_item_properties(
                material=material,
                stock_data=stock_data
            )
            
            stock.volume = calculations.get('volume')
            stock.mass = calculations.get('mass')
            stock.weight = calculations.get('weight')
            stock.cost = calculations.get('cost')
            stock.estimated_cost = calculations.get('cost')  # Cost is already total for all units
        except ValueError as e:
            return {
                'success': False,
                'action': 'calculation_error',
                'message': f'Calculation error: {str(e)}'
            }
        
        db.add(stock)
        db.flush()  # Get stock.id
        
        # Create units with pending status and collect them
        created_units = []
        total_length = dimensions.get('length', 0)
        used_length = required_length or total_length
        
        for i in range(quantity):
            # Calculate remaining length: total - used
            remaining_length = max(0, total_length - used_length)
            
            unit = RawMaterialUnitModel(
                stock_id=stock.id,
                total_length=total_length,
                remaining_length=remaining_length,
                volume=calculations.get('volume'),
                mass=calculations.get('mass'),
                weight=calculations.get('weight'),
                cost=calculations.get('cost'),
                status='pending'  # Pending until order is received
            )
            db.add(unit)
            created_units.append(unit)
        
        db.flush()  # Flush to get unit IDs
        
        # Link part to the first unit (for procurement tracking)
        if created_units:
            first_unit = created_units[0]
            part.raw_material_unit_id = first_unit.id
            part.raw_material_id = material_id
            part.required_length = required_length
            part.raw_material_source_type = 'order'
            
            # Create usage entry linking unit to part
            usage = RawMaterialUsageModel(
                raw_material_unit_id=first_unit.id,
                part_id=part.id,
                used_length=required_length or dimensions.get('length', 0),
                user_id=user_id
            )
            db.add(usage)
        
        db.commit()
        
        return {
            'success': True,
            'action': 'created_order_stock',
            'stock_id': stock.id,
            'unit_id': created_units[0].id if created_units else None,
            'message': f'Created order stock #{stock.id} for procurement'
        }
    
    def process_and_create_stock(
        db: Session,
        part: PartModel,
        extracted_data: Dict,
        user_id: int
    ) -> Dict:
        """
        Process extracted material and create stock in database.
        This should only be called when user clicks Procure button.
        """
        # Extract data
        material_name = extracted_data.get('material')
        stock_size = extracted_data.get('stock_size', '')
        quantity = extracted_data.get('quantity', 1)
        required_length = extracted_data.get('required_length')
        process_type = extracted_data.get('process_type', 'Barstocks')

        # Parse dimensions
        dimensions = AutoExtractService.parse_dimensions(stock_size)

        # Auto-detect form type
        form_type = AutoExtractService.auto_detect_form_type(dimensions)

        # Check if material exists
        material = AutoExtractService.find_material_by_name(db, material_name)
        if not material:
            return {
                'success': False,
                'action': 'material_not_found',
                'message': f'Material "{material_name}" not found in database',
                'material_name': material_name,
                'form_type': form_type,
                'dimensions': dimensions,
                'quantity': quantity,
                'required_length': required_length
            }

        material_id = material.id

        # Create order stock for the part
        result = AutoExtractService.create_order_stock_for_part(
            db=db,
            part=part,
            material_id=material_id,
            form_type=form_type,
            process_type=process_type,
            dimensions=dimensions,
            quantity=quantity,
            required_length=required_length,
            user_id=user_id
        )

        return result


def process_extracted_material(
        db: Session,
        part: PartModel,
        extracted_data: Dict,
        user_id: int
    ) -> Dict:
        """
        Main function to process extracted material for a part
        Handles material check, general stock check, allocation or procurement
        """
        # Extract data
        material_name = extracted_data.get('material')
        stock_size = extracted_data.get('stock_size', '')
        quantity = extracted_data.get('quantity', 1)
        required_length = extracted_data.get('required_length')
        process_type = extracted_data.get('process_type', 'Barstocks')

        # Parse dimensions
        dimensions = AutoExtractService.parse_dimensions(stock_size)

        # Auto-detect form type
        form_type = AutoExtractService.auto_detect_form_type(dimensions)

        # Check if material exists
        material = AutoExtractService.find_material_by_name(db, material_name)
        if not material:
            return {
                'success': False,
                'action': 'material_not_found',
                'message': f'Material "{material_name}" not found in database',
                'material_name': material_name,
                'form_type': form_type,
                'dimensions': dimensions,
                'quantity': quantity,
                'required_length': required_length
            }

        material_id = material.id

        # Check general stock availability
        general_stock = AutoExtractService.check_general_stock_availability(
            db=db,
            material_id=material_id,
            form_type=form_type,
            dimensions=dimensions,
            required_quantity=quantity
        )

        if general_stock:
            # Don't automatically allocate - just inform that stock is available
            return {
                'success': False,
                'action': 'stock_available',
                'message': f'Material available in general stock. Please use the manual linking option to allocate from stock.',
                'stock_available': True,
                'stock_id': general_stock.id
            }
        else:
            # Create order stock for procurement
            stock_result = AutoExtractService.create_order_stock_for_part(
                db=db,
                part=part,
                material_id=material_id,
                form_type=form_type,
                dimensions=dimensions,
                quantity=quantity,
                required_length=required_length or dimensions.get('length', 0),
                user_id=user_id,
                process_type=process_type
            )
            return stock_result
