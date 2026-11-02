"""
Quantity handoff for one unit-wise machine band.

Approved units on a machine fill that band from unit_from upward.
A later operation can use only the units in its own range that are already approved.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Mapping, Optional, Sequence, Set


def _as_band(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    return {
        "machine_id": raw.machine_id,
        "unit_from": raw.unit_from,
        "unit_to": raw.unit_to,
    }


def approved_unit_indexes(
    bands: Sequence,
    approved_by_machine: Mapping[int, int],
) -> Set[int]:
    """Units covered when each machine's approvals fill its bands from the low end."""
    remaining = {
        int(machine_id): int(qty or 0)
        for machine_id, qty in approved_by_machine.items()
    }
    ordered = sorted(bands, key=lambda raw: int(_as_band(raw)["unit_from"]))
    covered: Set[int] = set()
    for raw in ordered:
        band = _as_band(raw)
        machine_id = band.get("machine_id")
        if machine_id is None:
            continue
        left = remaining.get(int(machine_id), 0)
        if left <= 0:
            continue
        start = int(band["unit_from"])
        end = int(band["unit_to"])
        for unit_index in range(start, end + 1):
            if left <= 0:
                break
            covered.add(unit_index)
            left -= 1
        remaining[int(machine_id)] = left
    return covered


def released_in_range(
    covered: Iterable[int],
    unit_from: int,
    unit_to: int,
) -> int:
    covered_set = set(covered)
    return sum(1 for unit in range(int(unit_from), int(unit_to) + 1) if unit in covered_set)


def group_schedule_bands(rows: Sequence) -> List[dict]:
    """Contiguous unit ranges per machine from unit-schedule rows."""
    indexes: Dict[Optional[int], List[int]] = {}
    modes: Dict[Optional[int], Optional[str]] = {}
    for row in rows:
        machine_id = int(row.machine_id) if row.machine_id is not None else None
        indexes.setdefault(machine_id, []).append(int(row.unit_index))
        modes.setdefault(machine_id, getattr(row, "assignment_mode", None))

    bands: List[dict] = []
    for machine_id, unit_indexes in indexes.items():
        ordered = sorted(set(unit_indexes))
        start = previous = ordered[0]
        for unit_index in ordered[1:]:
            if unit_index == previous + 1:
                previous = unit_index
                continue
            bands.append(
                {
                    "machine_id": machine_id,
                    "unit_from": start,
                    "unit_to": previous,
                    "assignment_mode": modes.get(machine_id),
                }
            )
            start = previous = unit_index
        bands.append(
            {
                "machine_id": machine_id,
                "unit_from": start,
                "unit_to": previous,
                "assignment_mode": modes.get(machine_id),
            }
        )
    return bands
