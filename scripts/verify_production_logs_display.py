#!/usr/bin/env python3
"""
Compare scheduling.production_logs (DB) vs order-tracking aggregation rules.

Usage:
  python scripts/verify_production_logs_display.py
  python scripts/verify_production_logs_display.py --operation-id 491
"""
from __future__ import annotations

import argparse
import os
import sys

from sqlalchemy import create_engine, text

# Allow running from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DEFAULT_DB = os.getenv(
    "DATABASE_URL", "postgresql+psycopg2://postgres:postgres@172.18.7.86:5432/CMF_Demo"
)


def fetch_logs(engine, operation_id: int | None):
    query = """
        SELECT id, operation_id, produced_quantity, approved_quantity,
               rework_quantity, rejected_quantity, operator_rework_quantity,
               remaining_quantity_to_be_produced, operator_status, status, created_at
        FROM scheduling.production_logs
    """
    params = {}
    if operation_id is not None:
        query += " WHERE operation_id = :op_id ORDER BY created_at ASC, id ASC"
        params["op_id"] = operation_id
    else:
        query += " ORDER BY id ASC"
    with engine.connect() as conn:
        return conn.execute(text(query), params).mappings().all()


def is_production_review(log) -> bool:
    return (log["produced_quantity"] or 0) > 0


def compute_totals(logs):
    """Mirror frontend getOpQtyTotals."""
    produced = sum(log["produced_quantity"] or 0 for log in logs)
    approved = sum(log["approved_quantity"] or 0 for log in logs)
    rework = sum(
        (log["rework_quantity"] or 0) for log in logs if is_production_review(log)
    )
    rejected = sum((log["rejected_quantity"] or 0) for log in logs)
    latest = logs[-1] if logs else None
    remaining = 0
    if latest:
        remaining = (
            latest["remaining_quantity_to_be_produced"]
            if latest["remaining_quantity_to_be_produced"] is not None
            else latest.get("remaining_to_close") or 0
        )
    return {
        "produced": produced,
        "approved": approved,
        "rework": rework,
        "rejected": rejected,
        "remaining": remaining or 0,
    }


def validate_batch_balance(log):
    """Supervisor rule per production review: produced = approved + rework + rejected."""
    if not is_production_review(log):
        return True, "rework-only log (no batch balance)"
    p = log["produced_quantity"] or 0
    a = log["approved_quantity"] or 0
    r = log["rework_quantity"] or 0
    j = log["rejected_quantity"] or 0
    ok = p == a + r + j
    return ok, f"produced={p} vs approved+rework+rejected={a}+{r}+{j}={a+r+j}"


def print_operation_report(operation_id: int, logs):
    print(f"\n{'='*72}")
    print(f"Operation {operation_id} — {len(logs)} log(s)")
    print(f"{'='*72}")
    print(
        f"{'id':>4} {'prod':>4} {'appr':>4} {'rew':>4} {'rej':>4} "
        f"{'op_rw':>5} {'rem':>4}  balance"
    )
    print("-" * 72)
    for log in logs:
        ok, msg = validate_batch_balance(log)
        flag = "OK" if ok else "MISMATCH"
        print(
            f"{log['id']:>4} {log['produced_quantity'] or 0:>4} "
            f"{log['approved_quantity'] or 0:>4} {log['rework_quantity'] or 0:>4} "
            f"{log['rejected_quantity'] or 0:>4} "
            f"{log['operator_rework_quantity'] or 0:>5} "
            f"{log['remaining_quantity_to_be_produced'] or 0:>4}  {flag} ({msg})"
        )

    totals = compute_totals(logs)
    print("-" * 72)
    print(
        "Frontend parent row should show: "
        f"Produced={totals['produced']} | Approved={totals['approved']} | "
        f"Rework={totals['rework']} | Rejected={totals['rejected']} | "
        f"Remaining={totals['remaining']}"
    )
    print(
        "\nRejected rule: sum rejected_quantity on all logs (production + rework cycles). "
        "Rework child rows show rejected only for rework-only logs."
    )

    production_rejected = sum(
        (log["rejected_quantity"] or 0) for log in logs if is_production_review(log)
    )
    all_rejected = sum((log["rejected_quantity"] or 0) for log in logs)
    print(f"Rejected on production-review logs only: {production_rejected}")
    print(f"Rejected on all logs (parent row): {all_rejected}")


def main():
    parser = argparse.ArgumentParser(description="Verify production log display totals")
    parser.add_argument("--operation-id", type=int, default=None)
    parser.add_argument("--database-url", default=DEFAULT_DB)
    args = parser.parse_args()

    engine = create_engine(args.database_url)

    if args.operation_id:
        logs = fetch_logs(engine, args.operation_id)
        print_operation_report(args.operation_id, logs)
        return

    # Default: operations from order 182 / ADSN002 bearing op 491 + sample 488
    for op_id in (488, 491, 500):
        logs = fetch_logs(engine, op_id)
        if logs:
            print_operation_report(op_id, logs)


if __name__ == "__main__":
    main()
