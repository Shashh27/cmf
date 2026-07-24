"""Legacy ga module now delegates to research engine."""

from unit_wise_ga import optimize_unit_plan_ga


def test_optimize_unit_plan_ga_is_callable():
    assert callable(optimize_unit_plan_ga)
