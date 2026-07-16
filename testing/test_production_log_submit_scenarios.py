"""Exhaustive operator submit scenarios across all rework / reject / fresh mixes."""

import pytest
from fastapi import HTTPException

from production_log_helpers import (
    adjust_work_due_for_pending_submissions,
    compute_work_due_breakdown,
    validate_operator_submit,
    work_limits_from_breakdown,
)


def _all_valid_pairs(limits: dict) -> list[tuple[int, int]]:
    max_p = limits["max_produced_quantity"]
    max_r = limits["max_rework_submit_quantity"]
    rem = limits["remaining_to_close"]
    pairs = []
    for produced in range(0, max_p + 1):
        for rework in range(0, max_r + 1):
            if produced + rework <= 0:
                continue
            if produced + rework <= rem:
                pairs.append((produced, rework))
    return pairs


def _some_invalid_pairs(limits: dict) -> list[tuple[int, int]]:
    max_p = limits["max_produced_quantity"]
    max_r = limits["max_rework_submit_quantity"]
    rem = limits["remaining_to_close"]
    invalid = []
    invalid.append((max_p + 1, 0))
    invalid.append((0, max_r + 1))
    if max_r == 0:
        invalid.append((0, 1))
    if max_p == 0 and max_r > 0:
        invalid.append((1, 0))
    if max_r > 0:
        invalid.append((max_p, max_r + 1))
    if max_p > 0 and max_r > 0 and max_p + max_r > rem:
        invalid.append((max_p, max_r))
    seen = set()
    out = []
    for pair in invalid:
        if pair not in seen:
            seen.add(pair)
            out.append(pair)
    return out


SCENARIO_BUCKETS = [
  # remaining, rework_due, reject_due
    (10, 0, 0),   # first run
    (5, 3, 2),    # classic mixed follow-up
    (1, 1, 0),    # qty-1 rework only
    (2, 0, 2),    # reject replacement only
    (3, 3, 0),    # rework only
    (7, 2, 1),    # mixed with fresh units never manufactured
    (4, 1, 1),    # small mixed
    (3, 2, 2),    # capped reject when rework+reject exceed remaining
    (6, 0, 4),    # reject capped to remaining
    (5, 5, 5),    # heavy reviewer marks capped to remaining
]


class TestWorkLimits:
    @pytest.mark.parametrize("remaining,rework,reject", SCENARIO_BUCKETS)
    def test_limits_are_consistent(self, remaining, rework, reject):
        fresh = max(0, remaining - rework - reject)
        base = {
            "remaining_to_close": remaining,
            "rework_due": min(rework, remaining),
            "reject_due": min(reject, max(0, remaining - min(rework, remaining))),
            "fresh_needed": fresh,
        }
        base["reject_due"] = min(base["reject_due"], remaining - base["rework_due"])
        base["fresh_needed"] = max(0, remaining - base["rework_due"] - base["reject_due"])
        limits = work_limits_from_breakdown(base)
        assert limits["max_produced_quantity"] + limits["max_rework_submit_quantity"] >= min(
            remaining, limits["max_produced_quantity"] + limits["max_rework_submit_quantity"]
        )
        assert limits["max_produced_quantity"] <= remaining
        assert limits["max_rework_submit_quantity"] <= remaining


class TestOperatorSubmitMatrix:
    @pytest.mark.parametrize("remaining,rework,reject", SCENARIO_BUCKETS)
    def test_all_valid_combinations_pass(self, remaining, rework, reject):
        rework_eff = min(rework, remaining)
        reject_eff = min(reject, remaining - rework_eff)
        fresh = max(0, remaining - rework_eff - reject_eff)
        work = work_limits_from_breakdown(
            {
                "remaining_to_close": remaining,
                "rework_due": rework_eff,
                "reject_due": reject_eff,
                "fresh_needed": fresh,
            }
        )
        for produced, rework_submit in _all_valid_pairs(work):
            validate_operator_submit(work, produced, rework_submit)

    @pytest.mark.parametrize("remaining,rework,reject", SCENARIO_BUCKETS)
    def test_selected_invalid_combinations_fail(self, remaining, rework, reject):
        rework_eff = min(rework, remaining)
        reject_eff = min(reject, remaining - rework_eff)
        fresh = max(0, remaining - rework_eff - reject_eff)
        work = work_limits_from_breakdown(
            {
                "remaining_to_close": remaining,
                "rework_due": rework_eff,
                "reject_due": reject_eff,
                "fresh_needed": fresh,
            }
        )
        for produced, rework_submit in _some_invalid_pairs(work):
            with pytest.raises(HTTPException):
                validate_operator_submit(work, produced, rework_submit)


class TestUserScenario:
    def test_ten_qty_partial_review_follow_up(self):
        """10 required, 5 approved, 3 rework + 2 reject — all valid follow-up splits."""
        work = work_limits_from_breakdown(
            {
                "remaining_to_close": 5,
                "rework_due": 3,
                "reject_due": 2,
                "fresh_needed": 0,
            }
        )
        assert work["max_produced_quantity"] == 2
        assert work["max_rework_submit_quantity"] == 3

        validate_operator_submit(work, 2, 3)
        validate_operator_submit(work, 2, 0)
        validate_operator_submit(work, 0, 3)
        validate_operator_submit(work, 1, 2)
        validate_operator_submit(work, 0, 1)

        with pytest.raises(HTTPException):
            validate_operator_submit(work, 3, 0)
        with pytest.raises(HTTPException):
            validate_operator_submit(work, 5, 0)
        with pytest.raises(HTTPException):
            validate_operator_submit(work, 0, 4)


class TestPendingSubmissionAdjustment:
    def test_pending_rework_reduces_open_rework_bucket(self):
        base = {
            "remaining_to_close": 5,
            "rework_due": 3,
            "reject_due": 2,
            "fresh_needed": 0,
        }
        adjusted = adjust_work_due_for_pending_submissions(base, pending_produced=0, pending_rework=2)
        limits = work_limits_from_breakdown(adjusted)
        assert limits["rework_due"] == 1
        assert limits["max_rework_submit_quantity"] == 1
        validate_operator_submit(limits, 0, 1)

    def test_pending_reject_replacement_reduces_reject_bucket(self):
        base = {
            "remaining_to_close": 5,
            "rework_due": 3,
            "reject_due": 2,
            "fresh_needed": 0,
        }
        adjusted = adjust_work_due_for_pending_submissions(base, pending_produced=2, pending_rework=0)
        limits = work_limits_from_breakdown(adjusted)
        assert limits["reject_due"] == 0
        assert limits["max_produced_quantity"] == 0
        with pytest.raises(HTTPException):
            validate_operator_submit(limits, 1, 0)
        validate_operator_submit(limits, 0, 3)

    def test_pending_mixed_covers_reject_and_partial_rework(self):
        base = {
            "remaining_to_close": 5,
            "rework_due": 3,
            "reject_due": 2,
            "fresh_needed": 0,
        }
        adjusted = adjust_work_due_for_pending_submissions(base, pending_produced=2, pending_rework=1)
        limits = work_limits_from_breakdown(adjusted)
        assert limits["reject_due"] == 0
        assert limits["rework_due"] == 2
        validate_operator_submit(limits, 0, 2)
