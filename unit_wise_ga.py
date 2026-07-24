"""
Phase 4 — Legacy PyGAD MVP (superseded by unit_wise_ga_research).

Rebuild now routes optimizer=ga|ga_research to optimize_unit_plan_research.
This module remains as a thin delegate for imports / A-B experiments.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session


def optimize_unit_plan_ga(
    db: Session,
    scope: List[Dict[str, Any]],
    *,
    engine,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Delegate to research-grade GA."""
    from unit_wise_ga_research import optimize_unit_plan_research

    return optimize_unit_plan_research(db, scope, engine=engine, now=now)
