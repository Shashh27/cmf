import re
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
        Normalize material name: strip non-alphanumeric chars, lowercase.
        Example: "20MnCr5 - DIN 17210" -> "20mncr5din17210", "EN 8" -> "en8"
        """
        if not material_name:
            return ""
        return re.sub(r"[^a-zA-Z0-9]", "", material_name).lower()

    @staticmethod
    def _material_match_rank(extracted_normalized: str, db_normalized: str) -> Optional[int]:
        """
        Return match rank (lower is better) or None if no match.
        0 = exact, 1 = extracted substring of db, 2 = db substring of extracted
        """
        if not extracted_normalized or not db_normalized:
            return None
        if extracted_normalized == db_normalized:
            return 0
        if extracted_normalized in db_normalized:
            return 1
        if db_normalized in extracted_normalized:
            return 2
        return None

    @staticmethod
    def find_matching_materials(
        db: Session,
        extracted_material_name: str,
        max_recommendations: int = 10,
    ) -> List[Dict]:
        """
        Find raw materials matching extracted name using fuzzy/partial logic.
        e.g. extracted "20MnCr5" matches DB "20MnCr5 - DIN 17210"
        """
        if not extracted_material_name:
            return []

        extracted_normalized = StockRecommendationService.normalize_material_name(extracted_material_name)
        if not extracted_normalized:
            return []

        all_materials = db.query(RawMaterialModel).order_by(RawMaterialModel.id.asc()).all()
        matches = []

        for material in all_materials:
            if not material.material_name:
                continue
            db_normalized = StockRecommendationService.normalize_material_name(material.material_name)
            rank = StockRecommendationService._material_match_rank(extracted_normalized, db_normalized)
            if rank is None:
                continue
            suffix_len = len(db_normalized) - len(extracted_normalized) if rank == 1 else 0
            matches.append({
                "id": material.id,
                "material_name": material.material_name,
                "match_type": "exact" if rank == 0 else "partial",
                "match_rank": rank,
                "suffix_length": suffix_len,
            })

        matches.sort(
            key=lambda m: (
                m["match_rank"],
                0 if m["material_name"].strip().lower() == extracted_material_name.strip().lower() else 1,
                m["suffix_length"],
                len(m["material_name"]),
            )
        )
        return matches[:max_recommendations]

    @staticmethod
    def find_best_material_by_name(
        db: Session,
        extracted_material_name: str,
    ) -> Optional[RawMaterialModel]:
        """Return the single best master-list match for an extracted material name."""
        matches = StockRecommendationService.find_matching_materials(
            db, extracted_material_name, max_recommendations=1
        )
        if not matches:
            return None
        return db.query(RawMaterialModel).filter(RawMaterialModel.id == matches[0]["id"]).first()

    @staticmethod
    def materials_match(extracted_name: str, db_name: str) -> bool:
        """True when two names match using the canonical normalize + substring rules."""
        extracted_normalized = StockRecommendationService.normalize_material_name(extracted_name)
        db_normalized = StockRecommendationService.normalize_material_name(db_name)
        return StockRecommendationService._material_match_rank(extracted_normalized, db_normalized) is not None

    @staticmethod
    def find_matching_material_ids(
        db: Session,
        extracted_material_name: str,
        material_id: Optional[int] = None,
    ) -> List[int]:
        """Resolve material IDs for stock lookup — explicit ID or fuzzy name match."""
        if material_id is not None:
            material = db.query(RawMaterialModel).filter(RawMaterialModel.id == material_id).first()
            return [material.id] if material else []

        matches = StockRecommendationService.find_matching_materials(db, extracted_material_name)
        return [m["id"] for m in matches]

    @staticmethod
    def calculate_dimension_match_score(
        extracted_dims: Dict,
        stock_dims: Dict,
        form_type: str,
        check_stock_length: bool = True,
    ) -> float:
        """
        Calculate match score between extracted dimensions and stock dimensions.
        Returns a score between 0 and 1, where 1 is perfect match.
        
        When check_stock_length is False, only cross-section dimensions are scored.
        Required cut length should be validated against unit remaining_length separately.
        """
        if not extracted_dims or not stock_dims:
            return 0.0

        score = 0.0
        total_dims = 0

        if form_type == "Round":
            if "diameter" in extracted_dims and "diameter" in stock_dims:
                extracted_dia = extracted_dims["diameter"]
                stock_dia = stock_dims["diameter"]
                if stock_dia < extracted_dia:
                    return 0.0
                diff_pct = (stock_dia - extracted_dia) / extracted_dia if extracted_dia > 0 else 1
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            else:
                return 0.0

            if check_stock_length and "length" in extracted_dims and "length" in stock_dims:
                extracted_len = extracted_dims["length"]
                stock_len = stock_dims["length"]
                if stock_len < extracted_len:
                    return 0.0
                diff_pct = (stock_len - extracted_len) / extracted_len if extracted_len > 0 else 1
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            elif check_stock_length:
                return 0.0

        elif form_type == "Square":
            for dim in ["breadth", "height"]:
                if dim in extracted_dims and dim in stock_dims:
                    extracted_val = extracted_dims[dim]
                    stock_val = stock_dims[dim]
                    if stock_val < extracted_val:
                        return 0.0
                    diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                    score += max(0, 1 - (diff_pct / 1.0))
                    total_dims += 1
                else:
                    return 0.0

            if check_stock_length and "length" in extracted_dims and "length" in stock_dims:
                extracted_val = extracted_dims["length"]
                stock_val = stock_dims["length"]
                if stock_val < extracted_val:
                    return 0.0
                diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            elif check_stock_length:
                return 0.0

        elif form_type == "Pipe":
            for dim in ["inner_diameter", "outer_diameter"]:
                if dim in extracted_dims and dim in stock_dims:
                    extracted_val = extracted_dims[dim]
                    stock_val = stock_dims[dim]
                    if stock_val < extracted_val:
                        return 0.0
                    diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                    score += max(0, 1 - (diff_pct / 1.0))
                    total_dims += 1
                else:
                    return 0.0

            if check_stock_length and "length" in extracted_dims and "length" in stock_dims:
                extracted_val = extracted_dims["length"]
                stock_val = stock_dims["length"]
                if stock_val < extracted_val:
                    return 0.0
                diff_pct = (stock_val - extracted_val) / extracted_val if extracted_val > 0 else 1
                score += max(0, 1 - (diff_pct / 1.0))
                total_dims += 1
            elif check_stock_length:
                return 0.0

        return score / total_dims if total_dims > 0 else 0.0

    @staticmethod
    def _get_usable_units(
        db: Session,
        stock_id: int,
        required_length: Optional[float] = None,
    ) -> List[RawMaterialUnitModel]:
        query = db.query(RawMaterialUnitModel).filter(
            RawMaterialUnitModel.stock_id == stock_id,
            RawMaterialUnitModel.status.in_(["available", "partially_used"]),
        )
        if required_length is not None and required_length > 0:
            query = query.filter(RawMaterialUnitModel.remaining_length >= required_length)
        return query.order_by(RawMaterialUnitModel.remaining_length.asc()).all()

    @staticmethod
    def _cross_section_meets_minimum(extracted_dims: Dict, stock_dims: Dict, form_type: str) -> bool:
        """Stock cross-section must be >= planned. Larger stock is allowed; smaller is rejected."""
        if form_type == "Round":
            planned_dia = extracted_dims.get("diameter")
            if planned_dia is None:
                return False
            return stock_dims.get("diameter", 0) >= planned_dia

        if form_type == "Square":
            planned_breadth = extracted_dims.get("breadth")
            planned_height = extracted_dims.get("height")
            if planned_breadth is None or planned_height is None:
                return False
            return (
                stock_dims.get("breadth", 0) >= planned_breadth
                and stock_dims.get("height", 0) >= planned_height
            )

        if form_type == "Pipe":
            planned_outer = extracted_dims.get("outer_diameter")
            planned_inner = extracted_dims.get("inner_diameter")
            if planned_outer is None or planned_inner is None:
                return False
            return (
                stock_dims.get("outer_diameter", 0) >= planned_outer
                and stock_dims.get("inner_diameter", 0) >= planned_inner
            )

        return False

    @staticmethod
    def _nearest_fit_distance(extracted_dims: Dict, stock_dims: Dict, form_type: str) -> float:
        """
        Distance from nearest-fit stock. Lower is better.
        Uses maximum excess across cross-section dimensions.
        """
        if not StockRecommendationService._cross_section_meets_minimum(extracted_dims, stock_dims, form_type):
            return float("inf")

        if form_type == "Round":
            return stock_dims["diameter"] - extracted_dims["diameter"]

        if form_type == "Square":
            return max(
                stock_dims["breadth"] - extracted_dims["breadth"],
                stock_dims["height"] - extracted_dims["height"],
            )

        if form_type == "Pipe":
            return max(
                stock_dims["outer_diameter"] - extracted_dims["outer_diameter"],
                stock_dims["inner_diameter"] - extracted_dims["inner_diameter"],
            )

        return float("inf")

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
        max_recommendations: int = 10,
        required_length: Optional[float] = None,
        material_id: Optional[int] = None,
    ) -> List[Dict]:
        """
        Recommend stocks based on extracted raw material dimensions.

        When required_length is provided (planned cut length), recommendations only
        include stocks that have at least one unit with remaining_length >= required_length.
        Cross-section dimensions still must match; length is validated on live units.

        material_id: optional planned_raw_material_id — used directly when set.
        Otherwise fuzzy-matches extracted_material_name against the master list.
        """
        # Parse extracted dimensions
        extracted_dims, form_type = StockRecommendationService.parse_extracted_dimensions(extracted_dimensions_str)

        if not extracted_dims:
            return []

        matching_materials = StockRecommendationService.find_matching_material_ids(
            db, extracted_material_name, material_id=material_id
        )

        if not matching_materials:
            return []

        # Get all general stocks for matching materials (remove status filter to debug)
        stocks = db.query(RawMaterialStockModel).filter(
            RawMaterialStockModel.material_id.in_(matching_materials),
            RawMaterialStockModel.source_type == "general"
        ).all()

        effective_required_length = required_length
        if (effective_required_length is None or effective_required_length <= 0) and extracted_dims.get("length"):
            effective_required_length = extracted_dims["length"]

        use_unit_length_check = effective_required_length is not None and effective_required_length > 0

        recommendations = []
        for stock in stocks:
            if stock.form_type:
                stock_form_type_normalized = stock.form_type.lower().strip()
                form_type_normalized = form_type.lower().strip()
                if stock_form_type_normalized != form_type_normalized:
                    continue

            stock_dims = StockRecommendationService.get_stock_dimensions(stock)

            if not StockRecommendationService._cross_section_meets_minimum(extracted_dims, stock_dims, form_type):
                continue

            score = StockRecommendationService.calculate_dimension_match_score(
                extracted_dims,
                stock_dims,
                form_type,
                check_stock_length=not use_unit_length_check,
            )

            if score <= 0:
                continue

            if not use_unit_length_check and score < min_score:
                continue

            usable_units = StockRecommendationService._get_usable_units(
                db,
                stock.id,
                effective_required_length if use_unit_length_check else None,
            )

            if use_unit_length_check and not usable_units:
                continue

            if not use_unit_length_check and not usable_units:
                usable_units = StockRecommendationService._get_usable_units(db, stock.id, None)
                if not usable_units:
                    continue

            cross_section_excess = StockRecommendationService._nearest_fit_distance(
                extracted_dims, stock_dims, form_type
            )
            available_units = len(usable_units)
            max_remaining_length = max((unit.remaining_length for unit in usable_units), default=0)
            length_excess_mm = 0.0
            if use_unit_length_check and effective_required_length:
                length_excess_mm = max(0.0, max_remaining_length - effective_required_length)
            elif extracted_dims.get("length"):
                length_excess_mm = max(0.0, max_remaining_length - extracted_dims["length"])

            sort_fit = length_excess_mm if use_unit_length_check else cross_section_excess

            recommendations.append({
                "stock_id": stock.id,
                "material_id": stock.material_id,
                "material_name": stock.material.material_name if stock.material else "",
                "form_type": stock.form_type,
                "dimensions": stock_dims,
                "match_score": score,
                "match_score_percent": round(score * 100, 1),
                "nearest_fit": sort_fit,
                "length_excess_mm": length_excess_mm,
                "cross_section_excess_mm": cross_section_excess,
                "available_quantity": stock.available_quantity,
                "available_units": available_units,
                "usable_units": len(usable_units),
                "best_remaining_length": max_remaining_length,
                "max_remaining_length": max_remaining_length,
                "required_length": effective_required_length,
                "stock_size": f"{stock.diameter if stock.diameter else stock.breadth or stock.inner_diameter}x{stock.length}" if stock.length else "",
                "status": "available",
            })

        recommendations.sort(key=lambda x: (x["nearest_fit"], -x["match_score"]))
        return recommendations[:max_recommendations]
