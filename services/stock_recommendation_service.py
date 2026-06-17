from sqlalchemy.orm import Session
from typing import Dict, List, Optional, Tuple
from DB.models.inventory import (
    RawMaterial as RawMaterialModel,
    RawMaterialStock as RawMaterialStockModel,
    RawMaterialUnit as RawMaterialUnitModel,
)


class StockRecommendationService:
    """Service for recommending stocks based on extracted raw material dimensions"""

    @staticmethod
    def normalize_material_name(material_name: str) -> str:
        """
        Normalize material name by removing spaces and converting to lowercase
        Example: "EN 8" -> "en8", "EN8" -> "en8"
        """
        if not material_name:
            return ""
        return material_name.lower().replace(" ", "").replace("-", "").replace("_", "")

    @staticmethod
    def calculate_dimension_match_score(
        extracted_dims: Dict,
        stock_dims: Dict,
        form_type: str
    ) -> float:
        """
        Calculate match score between extracted dimensions and stock dimensions.
        Returns a score between 0 and 1, where 1 is perfect match.
        
        Algorithm:
        - Stock must be >= extracted dimension for ALL dimensions for usable match
        - If any dimension is less than required, return 0
        - Score decreases as the difference increases
        """
        if not extracted_dims or not stock_dims:
            return 0.0

        score = 0.0
        total_dims = 0

        if form_type == "Round":
            # Check diameter and length
            if "diameter" in extracted_dims and "diameter" in stock_dims:
                extracted_dia = extracted_dims["diameter"]
                stock_dia = stock_dims["diameter"]
                if stock_dia < extracted_dia:
                    return 0.0
                # Score based on how close the stock diameter is to extracted
                diff_pct = (stock_dia - extracted_dia) / extracted_dia if extracted_dia > 0 else 1
                # Allow up to 100% excess with linear penalty
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            else:
                return 0.0

            if "length" in extracted_dims and "length" in stock_dims:
                extracted_len = extracted_dims["length"]
                stock_len = stock_dims["length"]
                if stock_len < extracted_len:
                    return 0.0
                diff_pct = (stock_len - extracted_len) / extracted_len if extracted_len > 0 else 1
                # Allow up to 100% excess with linear penalty
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            else:
                return 0.0

        elif form_type == "Square":
            # Check breadth, height, and length
            for dim in ["breadth", "height", "length"]:
                if dim in extracted_dims and dim in stock_dims:
                    extracted_val = extracted_dims[dim]
                    stock_val = stock_dims[dim]
                    if stock_val < extracted_val:
                        return 0.0
                    diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                    # Allow up to 100% excess with linear penalty
                    score += max(0, 1 - (diff_pct / 1.0))
                    total_dims += 1
                else:
                    return 0.0

        elif form_type == "Pipe":
            # Check inner_diameter, outer_diameter, and length
            for dim in ["inner_diameter", "outer_diameter", "length"]:
                if dim in extracted_dims and dim in stock_dims:
                    extracted_val = extracted_dims[dim]
                    stock_val = stock_dims[dim]
                    if stock_val < extracted_val:
                        return 0.0
                    diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                    # Allow up to 100% excess with linear penalty
                    score += max(0, 1 - (diff_pct / 1.0))
                    total_dims += 1
                else:
                    return 0.0

        return score / total_dims if total_dims > 0 else 0.0

    @staticmethod
    def parse_extracted_dimensions(stock_size: str) -> Tuple[Dict, str]:
        """
        Parse extracted dimension string to dimensions dictionary and detect form type.
        Examples:
        - "140x30" -> {'diameter': 140, 'length': 30}, 'Round'
        - "140(DIA) x 30(LENGTH)" -> {'diameter': 140, 'length': 30}, 'Round'
        - "CYLINDER 260(DIA) x 50(LENGTH)" -> {'diameter': 260, 'length': 50}, 'Round'
        - "140x30x500" -> {'breadth': 140, 'height': 30, 'length': 500}, 'Square'
        - "l12 b1089 h500" -> {'breadth': 12, 'height': 1089, 'length': 500}, 'Square'
        - "20(L)x 20(B) x 20(H)" -> {'breadth': 20, 'height': 20, 'length': 20}, 'Square'
        - "140/30x500" -> {'outer_diameter': 140, 'inner_diameter': 30, 'length': 500}, 'Pipe'
        """
        import re

        dimensions = {}
        form_type = "Round"  # Default

        if not stock_size:
            return dimensions, form_type

        try:
            # Check for pattern like 20(L)x 20(B) x 20(H) with parentheses
            cleaned = stock_size.upper()
            l_match = re.search(r'(\d+)\(L\)', cleaned)
            b_match = re.search(r'(\d+)\(B\)', cleaned)
            h_match = re.search(r'(\d+)\(H\)', cleaned)

            if l_match and b_match and h_match:
                form_type = "Square"
                dimensions["length"] = float(l_match.group(1))
                dimensions["breadth"] = float(b_match.group(1))
                dimensions["height"] = float(h_match.group(1))
                return dimensions, form_type

            # Check for pattern like 260(DIA)x50(LENGTH) with parentheses
            dia_match = re.search(r'(\d+)\(DIA\)', cleaned)
            len_match = re.search(r'(\d+)\(LENGTH\)', cleaned)

            if dia_match and len_match:
                form_type = "Round"
                dimensions["diameter"] = float(dia_match.group(1))
                dimensions["length"] = float(len_match.group(1))
                return dimensions, form_type

            # Remove parentheses and labels (DIA, LENGTH, etc.)
            cleaned = re.sub(r'\([^)]*\)', '', cleaned)  # Remove anything in parentheses
            cleaned = cleaned.replace(' ', '')  # Remove spaces
            cleaned = cleaned.lower()

            # Check for l b h pattern (length, breadth, height) -> Square
            if 'l' in cleaned and 'b' in cleaned and 'h' in cleaned:
                form_type = "Square"
                # Extract numbers after l, b, h
                l_match = re.search(r'l(\d+)', cleaned)
                b_match = re.search(r'b(\d+)', cleaned)
                h_match = re.search(r'h(\d+)', cleaned)
                if l_match:
                    dimensions["length"] = float(l_match.group(1))
                if b_match:
                    dimensions["breadth"] = float(b_match.group(1))
                if h_match:
                    dimensions["height"] = float(h_match.group(1))
            # Check for pipe format (contains /)
            elif "/" in cleaned:
                parts = cleaned.replace("x", "/").split("/")
                if len(parts) >= 3:
                    dimensions["outer_diameter"] = float(parts[0])
                    dimensions["inner_diameter"] = float(parts[1])
                    dimensions["length"] = float(parts[2])
                    form_type = "Pipe"
            elif "x" in cleaned:
                parts = cleaned.split("x")
                if len(parts) == 2:
                    # Round: diameter x length
                    dimensions["diameter"] = float(parts[0])
                    dimensions["length"] = float(parts[1])
                    form_type = "Round"
                elif len(parts) == 3:
                    # Square or Round with extra dimension
                    values = [float(p) for p in parts]
                    values_sorted = sorted(values)
                    # If one value is significantly larger, it's likely length
                    if values_sorted[2] > values_sorted[1] * 2:
                        # Likely Square
                        dimensions["breadth"] = values[0]
                        dimensions["height"] = values[1]
                        dimensions["length"] = values[2]
                        form_type = "Square"
                    else:
                        # Could be Round with diameter and length, or Square
                        # Default to Square for 3 values
                        dimensions["breadth"] = values[0]
                        dimensions["height"] = values[1]
                        dimensions["length"] = values[2]
                        form_type = "Square"
        except (ValueError, IndexError):
            pass

        return dimensions, form_type

    @staticmethod
    def get_stock_dimensions(stock: RawMaterialStockModel) -> Dict:
        """
        Get dimensions from stock object as dictionary
        """
        dimensions = {}
        if stock.diameter:
            dimensions["diameter"] = stock.diameter
        if stock.length:
            dimensions["length"] = stock.length
        if stock.breadth:
            dimensions["breadth"] = stock.breadth
        if stock.height:
            dimensions["height"] = stock.height
        if stock.inner_diameter:
            dimensions["inner_diameter"] = stock.inner_diameter
        if stock.outer_diameter:
            dimensions["outer_diameter"] = stock.outer_diameter
        return dimensions

    @staticmethod
    def recommend_stocks(
        db: Session,
        extracted_material_name: str,
        extracted_dimensions_str: str,
        min_score: float = 0.3,
        max_recommendations: int = 10
    ) -> List[Dict]:
        """
        Recommend stocks based on extracted raw material dimensions.

        Args:
            db: Database session
            extracted_material_name: Name of the extracted raw material
            extracted_dimensions_str: String representation of dimensions (e.g., "140x30")
            min_score: Minimum match score to include in recommendations (0-1)
            max_recommendations: Maximum number of recommendations to return

        Returns:
            List of recommended stocks with match scores
        """
        # Normalize material name for matching
        normalized_material_name = StockRecommendationService.normalize_material_name(extracted_material_name)

        # Parse extracted dimensions
        extracted_dims, form_type = StockRecommendationService.parse_extracted_dimensions(extracted_dimensions_str)

        if not extracted_dims:
            return []

        # Get all raw materials with matching name (case-insensitive, space-agnostic)
        all_materials = db.query(RawMaterialModel).all()
        matching_materials = []
        for material in all_materials:
            if StockRecommendationService.normalize_material_name(material.material_name) == normalized_material_name:
                matching_materials.append(material.id)

        if not matching_materials:
            return []

        # Get all general stocks for matching materials (remove status filter to debug)
        stocks = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.material_id.in_(matching_materials),
            RawMaterialStockModel.source_type == "general"
        ).all()

        recommendations = []
        for stock in stocks:
            # Only recommend stocks with same form type (lenient: case-insensitive match, skip if form_type is null)
            if stock.form_type:
                stock_form_type_normalized = stock.form_type.lower().strip()
                form_type_normalized = form_type.lower().strip()
                if stock_form_type_normalized != form_type_normalized:
                    continue

            stock_dims = StockRecommendationService.get_stock_dimensions(stock)
            score = StockRecommendationService.calculate_dimension_match_score(extracted_dims, stock_dims, form_type)

            if score >= min_score:
                # Calculate available units
                available_units = db.query(RawMaterialUnitModel).filter(
                    RawMaterialUnitModel.stock_id == stock.id,
                    RawMaterialUnitModel.status.in_(["available", "partially_used"])
                ).count()

                recommendations.append({
                    "stock_id": stock.id,
                    "material_id": stock.material_id,
                    "material_name": stock.material.material_name if stock.material else "",
                    "form_type": stock.form_type,
                    "dimensions": stock_dims,
                    "match_score": score,
                    "available_quantity": stock.available_quantity,
                    "available_units": available_units,
                    "stock_size": f"{stock.diameter if stock.diameter else stock.breadth or stock.inner_diameter}x{stock.length}" if stock.length else "",
                    "status": stock.status
                })

        # Sort by match score (descending) and return top recommendations
        recommendations.sort(key=lambda x: x["match_score"], reverse=True)
        return recommendations[:max_recommendations]
