"""Unit-band handoff: approvals fill a machine band from the low unit upward."""

from intelligent_scheduler.unit_band import approved_unit_indexes, released_in_range


TURNING = [
    {"machine_id": 22, "unit_from": 1, "unit_to": 3},
    {"machine_id": 23, "unit_from": 4, "unit_to": 6},
]


def test_partial_approval_covers_the_low_end_of_the_band():
    covered = approved_unit_indexes(TURNING, {22: 2, 23: 0})
    assert covered == {1, 2}
    assert released_in_range(covered, 1, 3) == 2
    assert released_in_range(covered, 4, 5) == 0


def test_rework_unit_is_outside_the_already_approved_range():
    bands = [{"machine_id": 22, "unit_from": 1, "unit_to": 3}]
    covered = approved_unit_indexes(bands, {22: 2})
    assert released_in_range(covered, 1, 2) == 2
    assert released_in_range(covered, 3, 3) == 0


def test_one_machine_with_two_bands_spends_approvals_once():
    bands = [
        {"machine_id": 22, "unit_from": 1, "unit_to": 2},
        {"machine_id": 22, "unit_from": 5, "unit_to": 6},
    ]
    covered = approved_unit_indexes(bands, {22: 3})
    assert covered == {1, 2, 5}
    assert released_in_range(covered, 5, 6) == 1


def test_full_band_releases_the_matching_next_operation_range():
    covered = approved_unit_indexes(TURNING, {22: 3, 23: 1})
    assert released_in_range(covered, 1, 3) == 3
    assert released_in_range(covered, 4, 5) == 1
    assert released_in_range(covered, 4, 6) == 1
