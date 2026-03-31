"""
Raw Material Calculations Service

Handles volume, mass, weight, and cost calculations for different material forms:
- Round: Volume = π (D/2)^2 × L
- Square: Volume = L × B × H  
- Pipe: Volume = π × L × [(OD/2)^2 - (ID/2)^2]

Common calculations:
- total_volume = volume × quantity
- mass = density × total_volume
- weight = mass × 9.81
- cost = weight × cost_per_kg
"""

import math
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from DB.models.inventory import RawMaterial, RawMaterialStock
from DB.schemas.inventory import RawMaterialStockCreate, RawMaterialStockUpdate


class RawMaterialCalculationService:
    """Service for raw material calculations"""
    
    GRAVITY = 9.81  # m/s²
    
    @staticmethod
    def calculate_volume(form_type: str, **dimensions) -> Optional[float]:
        """
        Calculate single unit volume based on form type and dimensions
        
        Args:
            form_type: "Round", "Square", or "Pipe"
            **dimensions: Form-specific dimensions
            
        Returns:
            Volume in cubic meters (m³) or None if insufficient data
        """
        try:
            if form_type == "Round":
                # Volume = π (D/2)^2 × L
                diameter = dimensions.get('diameter')
                length = dimensions.get('length')
                
                if diameter is None or length is None:
                    return None
                    
                # Convert mm to m (assuming input is in mm)
                diameter_m = diameter / 1000
                length_m = length / 1000
                
                radius = diameter_m / 2
                volume = math.pi * radius * radius * length_m
                
            elif form_type == "Square":
                # Volume = L × B × H
                length = dimensions.get('length')
                breadth = dimensions.get('breadth')
                height = dimensions.get('height')
                
                if length is None or breadth is None or height is None:
                    return None
                    
                # Convert mm to m (assuming input is in mm)
                length_m = length / 1000
                breadth_m = breadth / 1000
                height_m = height / 1000
                
                volume = length_m * breadth_m * height_m
                
            elif form_type == "Pipe":
                # Volume = π × L × [(OD/2)^2 - (ID/2)^2]
                outer_diameter = dimensions.get('outer_diameter') or dimensions.get('diameter')
                inner_diameter = dimensions.get('inner_diameter')
                length = dimensions.get('length')
                
                if outer_diameter is None or inner_diameter is None or length is None:
                    return None
                    
                # Convert mm to m (assuming input is in mm)
                outer_diameter_m = outer_diameter / 1000
                inner_diameter_m = inner_diameter / 1000
                length_m = length / 1000
                
                outer_radius = outer_diameter_m / 2
                inner_radius = inner_diameter_m / 2
                
                volume = math.pi * length_m * (outer_radius * outer_radius - inner_radius * inner_radius)
                
            else:
                return None
                
            return round(volume, 6)  # Round to 6 decimal places
            
        except (ValueError, TypeError, ZeroDivisionError):
            return None
    
    @staticmethod
    def calculate_mass(density: float, volume: float, quantity: int = 1) -> Optional[float]:
        """
        Calculate mass based on density and volume
        
        Args:
            density: Material density in kg/m³
            volume: Single unit volume in m³
            quantity: Number of units
            
        Returns:
            Total mass in kg or None if calculation fails
        """
        try:
            if density <= 0 or volume <= 0 or quantity < 0:
                return None
                
            total_volume = volume * quantity
            mass = density * total_volume
            
            return round(mass, 3)  # Round to 3 decimal places
            
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def calculate_weight(mass: float) -> Optional[float]:
        """
        Calculate weight based on mass
        
        Args:
            mass: Mass in kg
            
        Returns:
            Weight in Newtons (N) or None if calculation fails
        """
        try:
            if mass < 0:
                return None
                
            weight = mass * RawMaterialCalculationService.GRAVITY
            
            return round(weight, 3)  # Round to 3 decimal places
            
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def calculate_cost(mass: float, cost_per_kg: float) -> Optional[float]:
        """
        Calculate cost based on mass and cost per kg
        
        Args:
            mass: Mass in kg
            cost_per_kg: Cost per kg in currency units
            
        Returns:
            Total cost or None if calculation fails
        """
        try:
            if mass < 0 or cost_per_kg < 0:
                return None
                
            cost = mass * cost_per_kg
            
            return round(cost, 2)  # Round to 2 decimal places
            
        except (ValueError, TypeError):
            return None
    
    @staticmethod
    def validate_dimensions(form_type: str, **dimensions) -> Tuple[bool, list]:
        """
        Validate dimensions based on form type
        
        Args:
            form_type: "Round", "Square", or "Pipe"
            **dimensions: Form-specific dimensions
            
        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []
        
        if form_type == "Round":
            required = ['diameter', 'length']
            for dim in required:
                if dimensions.get(dim) is None or dimensions.get(dim) <= 0:
                    errors.append(f"{dim} is required and must be positive")
                    
        elif form_type == "Square":
            required = ['length', 'breadth', 'height']
            for dim in required:
                if dimensions.get(dim) is None or dimensions.get(dim) <= 0:
                    errors.append(f"{dim} is required and must be positive")
                    
        elif form_type == "Pipe":
            required = ['outer_diameter', 'inner_diameter', 'length']
            for dim in required:
                if dimensions.get(dim) is None or dimensions.get(dim) <= 0:
                    errors.append(f"{dim} is required and must be positive")
            
            # Additional validation for pipe
            outer_diameter = dimensions.get('outer_diameter') or dimensions.get('diameter')
            inner_diameter = dimensions.get('inner_diameter')
            
            if outer_diameter and inner_diameter and inner_diameter >= outer_diameter:
                errors.append("inner_diameter must be less than outer_diameter")
                
        else:
            errors.append("form_type must be 'Round', 'Square', or 'Pipe'")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def calculate_stock_item_properties(
        material, 
        stock_data
    ) -> dict:
        """
        Calculate all properties for a stock item
        
        Args:
            material: Raw material with density and cost_per_kg
            stock_data: Stock data with dimensions and quantity
            
        Returns:
            Dictionary with calculated properties
        """
        # Extract dimensions
        dimensions = {
            'diameter': stock_data.diameter,
            'length': stock_data.length,
            'breadth': stock_data.breadth,
            'height': stock_data.height,
            'inner_diameter': stock_data.inner_diameter,
            'outer_diameter': stock_data.outer_diameter
        }
        
        # Validate dimensions
        is_valid, errors = RawMaterialCalculationService.validate_dimensions(
            stock_data.form_type, **dimensions
        )
        
        if not is_valid:
            raise ValueError(f"Invalid dimensions: {', '.join(errors)}")
        
        # Calculate volume
        volume = RawMaterialCalculationService.calculate_volume(
            stock_data.form_type, **dimensions
        )
        
        if volume is None:
            raise ValueError("Failed to calculate volume")
        
        # Calculate mass (total for all units)
        mass = RawMaterialCalculationService.calculate_mass(
            material.density, volume, stock_data.quantity
        )
        
        # Calculate weight (total for all units)
        weight = RawMaterialCalculationService.calculate_weight(mass) if mass else None
        
        # Calculate cost = weight × cost_per_kg
        cost = None
        if weight and material.cost_per_kg:
            cost = round(weight * material.cost_per_kg, 2)
        
        return {
            'volume': volume,
            'mass': mass,
            'weight': weight,
            'cost': cost
        }
    
    @staticmethod
    def update_stock_calculations(db: Session, stock_item: RawMaterialStock) -> RawMaterialStock:
        """
        Update calculated properties for a stock item
        
        Args:
            db: Database session
            stock_item: Stock item to update
            
        Returns:
            Updated stock item
        """
        # Get material
        material = db.query(RawMaterial).filter(
            RawMaterial.id == stock_item.material_id
        ).first()
        
        if not material:
            raise ValueError(f"Material with id {stock_item.material_id} not found")
        
        # Create temporary stock data for calculation
        temp_stock = RawMaterialStockUpdate(
            form_type=stock_item.form_type,
            diameter=stock_item.diameter,
            length=stock_item.length,
            breadth=stock_item.breadth,
            height=stock_item.height,
            inner_diameter=stock_item.inner_diameter,
            outer_diameter=stock_item.outer_diameter,
            quantity=stock_item.quantity
        )
        
        # Calculate properties
        properties = RawMaterialCalculationService.calculate_stock_item_properties(
            material, temp_stock
        )
        
        # Update stock item
        stock_item.volume = properties['volume']
        stock_item.mass = properties['mass']
        stock_item.weight = properties['weight']
        stock_item.cost = properties['cost']
        
        return stock_item
