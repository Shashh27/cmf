"""
Intelligent Scheduler extras — manual qty→machine allocations.

Does not rewrite unit_wise_scheduler greedy core; expands bands into
machine_by_slot and passes them through rebuild.
"""

from .service import (
    expand_allocations_to_machine_by_slot,
    get_allocations_for_part,
    list_active_inhouse_parts,
    load_machine_by_slot_for_parts,
    replace_allocations_for_part,
    validate_allocation_bands,
)

__all__ = [
    "expand_allocations_to_machine_by_slot",
    "get_allocations_for_part",
    "list_active_inhouse_parts",
    "load_machine_by_slot_for_parts",
    "replace_allocations_for_part",
    "validate_allocation_bands",
]
