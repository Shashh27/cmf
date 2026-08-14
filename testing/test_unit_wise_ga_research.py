"""
Unit tests for NSGA-II operators, objectives, and Policy Engine (no DB).

Covers:
- OX crossover permutation validity
- Mutation permutation preservation
- Objective evaluation (flow, wait, tardiness)
- NSGA-II dominance and non-dominated sorting
- PolicyEngine — balanced and all other policies
- PolicyEngine — determinism on identical inputs
- PolicyEngine — graceful fallback on empty/single-element fronts
- Nsga2Config env loading (backward compat: ResearchGaConfig alias)
"""

import random
from datetime import datetime, timedelta

import pytest

from unit_wise_ga_research import (
    Individual,
    Nsga2Config,
    PolicyEngine,
    ResearchGaConfig,  # backward-compat alias
    compute_crowding_distance,
    dominates,
    evaluate_segments,
    fast_non_dominated_sort,
    mutate_perm,
    normalize_objectives,
    order_crossover,
    plan_dominates_greedy,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_ind(makespan=None, tardiness=0.0, utilization=None, setups=0, inversions=0):
    """Build an Individual with pre-set objectives (no actual decode needed)."""
    obj = {}
    if makespan is not None:
        obj["makespan_hours"] = makespan
    obj["mean_tardiness_hours"] = tardiness
    if utilization is not None:
        obj["avg_utilization_pct"] = utilization
    obj["setup_count"] = setups
    obj["priority_inversions"] = inversions
    ind = Individual(perm=[], machines=[])
    ind.objectives = obj
    ind.normalized_objectives = {}
    return ind


def _normalize_front(front: list[Individual]):
    """Utility: normalize a list of individuals so dominates() works correctly."""
    normalize_objectives(front)


# ---------------------------------------------------------------------------
# Genetic Operators
# ---------------------------------------------------------------------------


class TestOxAndMutation:
    def test_ox_is_valid_permutation(self):
        rng = random.Random(0)
        parent_a = list(range(10))
        parent_b = list(reversed(range(10)))
        for _ in range(20):
            child = order_crossover(parent_a, parent_b, rng)
            assert sorted(child) == list(range(10))
            assert len(set(child)) == 10

    def test_mutate_perm_preserves_genes(self):
        rng = random.Random(1)
        base = list(range(8))
        out = mutate_perm(base, rate=1.0, rng=rng)
        assert sorted(out) == list(range(8))

    def test_ox_single_element(self):
        rng = random.Random(0)
        assert order_crossover([0], [0], rng) == [0]

    def test_ox_two_elements(self):
        rng = random.Random(42)
        child = order_crossover([0, 1], [1, 0], rng)
        assert sorted(child) == [0, 1]


# ---------------------------------------------------------------------------
# Objective evaluation
# ---------------------------------------------------------------------------


class TestObjectives:
    def test_evaluate_segments_flow_and_wait(self):
        t0 = datetime(2026, 7, 24, 8, 0)
        segments = [
            {
                "part_id": 1,
                "unit_index": 1,
                "order_id": 9,
                "operation_number": "10",
                "start_time": t0,
                "end_time": t0 + timedelta(hours=1),
            },
            {
                "part_id": 1,
                "unit_index": 1,
                "order_id": 9,
                "operation_number": "20",
                "start_time": t0 + timedelta(hours=2),
                "end_time": t0 + timedelta(hours=3),
            },
        ]
        due = {9: t0 + timedelta(hours=10)}
        obj = evaluate_segments(segments, due_by_order=due)
        assert obj["makespan_hours"] == 3.0
        assert obj["mean_flow_hours"] == 3.0
        assert obj["mean_waiting_hours"] == 1.0
        assert obj["mean_tardiness_hours"] == 0.0
        assert obj["units_completed"] == 1

    def test_evaluate_empty_segments(self):
        obj = evaluate_segments([], due_by_order={})
        assert obj["makespan_hours"] is None
        assert obj["units_completed"] == 0


# ---------------------------------------------------------------------------
# NSGA-II: dominance and sorting
# ---------------------------------------------------------------------------


class TestNsga2Internals:
    def test_dominates_clearly_better(self):
        # ind1 is better on makespan and tardiness
        ind1 = _make_ind(makespan=10, tardiness=0, utilization=80, setups=2)
        ind2 = _make_ind(makespan=20, tardiness=2, utilization=60, setups=5)
        _normalize_front([ind1, ind2])
        assert dominates(ind1, ind2)
        assert not dominates(ind2, ind1)

    def test_dominates_equal_not_dominated(self):
        ind1 = _make_ind(makespan=10, tardiness=0, utilization=80, setups=2)
        ind2 = _make_ind(makespan=10, tardiness=0, utilization=80, setups=2)
        _normalize_front([ind1, ind2])
        assert not dominates(ind1, ind2)
        assert not dominates(ind2, ind1)

    def test_non_dominated_sort_returns_first_front(self):
        # Two clearly separated individuals
        ind1 = _make_ind(makespan=10, tardiness=0, utilization=90, setups=1)
        ind2 = _make_ind(makespan=20, tardiness=5, utilization=50, setups=10)
        pop = [ind1, ind2]
        _normalize_front(pop)
        fronts = fast_non_dominated_sort(pop)
        assert len(fronts) >= 1
        assert 0 in fronts[0]  # ind1 should be rank-1

    def test_crowding_distance_boundary_inf(self):
        inds = [
            _make_ind(makespan=5, tardiness=0, utilization=90, setups=1),
            _make_ind(makespan=10, tardiness=2, utilization=70, setups=3),
            _make_ind(makespan=15, tardiness=5, utilization=50, setups=5),
        ]
        _normalize_front(inds)
        compute_crowding_distance(inds, list(range(len(inds))))
        # Boundary individuals should have infinite distance
        assert inds[0].crowding_distance == float("inf") or inds[-1].crowding_distance == float("inf")

    def test_plan_dominates_greedy_accepts_strict_win(self):
        greedy = {
            "makespan_hours": 100,
            "mean_tardiness_hours": 5,
            "avg_utilization_pct": 40,
            "setup_count": 4,
        }
        better = {**greedy, "makespan_hours": 90}
        assert plan_dominates_greedy(better, greedy)

    def test_plan_dominates_greedy_rejects_tradeoff(self):
        greedy = {
            "makespan_hours": 100,
            "mean_tardiness_hours": 5,
            "avg_utilization_pct": 40,
            "setup_count": 4,
        }
        tradeoff = {
            "makespan_hours": 90,
            "mean_tardiness_hours": 6,
            "avg_utilization_pct": 50,
            "setup_count": 4,
        }
        assert not plan_dominates_greedy(tradeoff, greedy)


# ---------------------------------------------------------------------------
# Policy Engine
# ---------------------------------------------------------------------------


class TestPolicyEngine:

    def _front(self):
        """Create a small diverse Pareto front for policy tests."""
        # ind0: best makespan, worst setups
        ind0 = _make_ind(makespan=10, tardiness=0.0, utilization=90, setups=10, inversions=0)
        # ind1: balanced
        ind1 = _make_ind(makespan=15, tardiness=0.0, utilization=80, setups=5, inversions=1)
        # ind2: best setups, worst makespan
        ind2 = _make_ind(makespan=25, tardiness=2.0, utilization=70, setups=1, inversions=2)
        front = [ind0, ind1, ind2]
        _normalize_front(front)
        return front

    def test_balanced_prefers_no_tardiness(self):
        front = self._front()
        engine = PolicyEngine("balanced")
        selected = engine.select(front)
        # ind0 or ind1 have zero tardiness; ind2 has tardiness 2.0
        assert selected.objectives.get("mean_tardiness_hours", 0) <= 0.0

    def test_minimum_makespan_policy(self):
        front = self._front()
        engine = PolicyEngine("minimum_makespan")
        selected = engine.select(front)
        assert selected.objectives["makespan_hours"] == 10

    def test_minimum_setup_policy(self):
        front = self._front()
        engine = PolicyEngine("minimum_setup")
        selected = engine.select(front)
        assert selected.objectives["setup_count"] == 1

    def test_throughput_policy(self):
        ind_a = _make_ind(makespan=10, tardiness=0, utilization=90, setups=5, inversions=0)
        ind_a.objectives["throughput_units_per_hour"] = 2.0
        ind_b = _make_ind(makespan=12, tardiness=0, utilization=85, setups=4, inversions=0)
        ind_b.objectives["throughput_units_per_hour"] = 5.0
        front = [ind_a, ind_b]
        _normalize_front(front)
        selected = PolicyEngine("throughput").select(front)
        assert selected.objectives["throughput_units_per_hour"] == 5.0

    def test_rush_order_policy_prefers_on_time(self):
        ind_late = _make_ind(makespan=10, tardiness=3.0, utilization=90, setups=1)
        ind_ontime = _make_ind(makespan=20, tardiness=0.0, utilization=70, setups=5)
        front = [ind_late, ind_ontime]
        _normalize_front(front)
        lead_time = datetime(2026, 8, 1, 17, 0)
        selected = PolicyEngine("rush_order").select(front, committed_lead_time=lead_time)
        # ind_ontime has zero tardiness → preferred
        assert selected.objectives["mean_tardiness_hours"] == 0.0

    def test_energy_efficient_policy(self):
        ind_a = _make_ind(makespan=10, tardiness=0, utilization=90, setups=5)
        ind_a.objectives["idle_hours_total"] = 1.0
        ind_b = _make_ind(makespan=12, tardiness=0, utilization=85, setups=4)
        ind_b.objectives["idle_hours_total"] = 5.0
        front = [ind_a, ind_b]
        _normalize_front(front)
        selected = PolicyEngine("energy_efficient").select(front)
        assert selected.objectives["idle_hours_total"] == 1.0

    def test_unknown_policy_falls_back_to_balanced(self):
        """Unknown policy should silently fall back to balanced, not raise."""
        front = self._front()
        engine = PolicyEngine("nonexistent_policy_xyz")
        assert engine.policy == "balanced"
        selected = engine.select(front)
        assert selected is not None

    def test_single_element_front(self):
        ind = _make_ind(makespan=10)
        _normalize_front([ind])
        selected = PolicyEngine("balanced").select([ind])
        assert selected is ind

    def test_empty_front_raises(self):
        with pytest.raises(ValueError):
            PolicyEngine("balanced").select([])

    def test_determinism_same_inputs(self):
        """Identical inputs must always produce identical outputs."""
        front = self._front()
        engine = PolicyEngine("balanced")
        result1 = engine.select(front)
        result2 = engine.select(front)
        assert result1 is result2

    def test_balanced_criteria_chain(self):
        """
        When all tardiness is equal, the tie-break should use utilization → makespan → setups.
        Verify that among equal-tardiness candidates, higher utilization wins.
        """
        ind_high_util = _make_ind(makespan=15, tardiness=0.0, utilization=90, setups=5, inversions=0)
        ind_low_util = _make_ind(makespan=12, tardiness=0.0, utilization=60, setups=5, inversions=0)
        front = [ind_high_util, ind_low_util]
        _normalize_front(front)
        selected = PolicyEngine("balanced").select(front)
        assert selected.objectives["avg_utilization_pct"] == 90


# ---------------------------------------------------------------------------
# Config and backward-compat alias
# ---------------------------------------------------------------------------


class TestNsga2Config:
    def test_default_values(self):
        cfg = Nsga2Config()
        assert cfg.population == 40
        assert cfg.generations == 60
        assert cfg.runs == 3
        assert cfg.pin_preferred is True

    def test_from_env_with_overrides(self):
        cfg = Nsga2Config.from_env({"population": 10, "generations": 5})
        assert cfg.population == 10
        assert cfg.generations == 5

    def test_research_ga_config_alias(self):
        """ResearchGaConfig must remain as an alias for backward compatibility."""
        cfg = ResearchGaConfig()
        assert isinstance(cfg, Nsga2Config)
        assert cfg.population == 40

    def test_no_weight_fields(self):
        """Weighted GA fields must not exist on the config."""
        cfg = Nsga2Config()
        for attr in ["w_makespan", "w_mean_flow", "w_mean_waiting", "w_mean_tardiness",
                     "w_setup", "w_idle", "w_util_gap", "w_throughput", "w_priority",
                     "use_nsga2"]:
            assert not hasattr(cfg, attr), f"Unexpected weight field: {attr}"
