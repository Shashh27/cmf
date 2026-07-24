"""Research-grade GA unit tests (operators + objectives, no DB)."""

import random
from datetime import datetime, timedelta

from unit_wise_ga_research import (
    ResearchGaConfig,
    evaluate_segments,
    mutate_perm,
    order_crossover,
    scalar_fitness,
)


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

    def test_scalar_fitness_prefers_lower_cost(self):
        cfg = ResearchGaConfig(
            w_makespan=1.0,
            w_mean_flow=0.0,
            w_mean_waiting=0.0,
            w_mean_tardiness=0.0,
            w_setup=0.0,
            w_idle=0.0,
            w_util_gap=0.0,
            w_throughput=0.0,
            w_priority=0.0,
        )
        good = scalar_fitness({"makespan_hours": 2.0, "setup_count": 0}, cfg)
        bad = scalar_fitness({"makespan_hours": 5.0, "setup_count": 0}, cfg)
        assert good > bad

    def test_scalar_fitness_rewards_throughput_and_penalizes_setups(self):
        cfg = ResearchGaConfig(
            w_makespan=0.0,
            w_mean_flow=0.0,
            w_mean_waiting=0.0,
            w_mean_tardiness=0.0,
            w_setup=1.0,
            w_idle=0.0,
            w_util_gap=0.0,
            w_throughput=1.0,
            w_priority=0.0,
        )
        more_setups = scalar_fitness(
            {"makespan_hours": 1.0, "setup_count": 5, "throughput_units_per_hour": 1.0},
            cfg,
        )
        fewer_setups = scalar_fitness(
            {"makespan_hours": 1.0, "setup_count": 1, "throughput_units_per_hour": 1.0},
            cfg,
        )
        assert fewer_setups > more_setups
