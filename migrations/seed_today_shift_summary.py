"""
Seed today's sample rows into production_monitoring.shift_summary.
Safe to re-run: skips machine+shift combos that already exist for today.
"""
from __future__ import annotations

import random
import sys
from datetime import datetime, time, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from DB.database import SessionLocal
from DB.models.configuration import Machine
from DB.models.ems import ShiftInfo
from DB.models.production import ShiftSummary


def _minutes_to_time(total_minutes: int) -> time:
    total_minutes = max(0, min(int(total_minutes), 23 * 60 + 59))
    return time(hour=total_minutes // 60, minute=total_minutes % 60, second=0)


def seed_today_shift_summary() -> None:
    db = SessionLocal()
    try:
        today = datetime.now().replace(hour=10, minute=0, second=0, microsecond=0)
        day_start = today.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = today.replace(hour=23, minute=59, second=59, microsecond=999999)

        machines = db.query(Machine).order_by(Machine.id).all()
        if not machines:
            print("No machines found in configuration.machines — nothing to seed.")
            return

        shifts = db.query(ShiftInfo).order_by(ShiftInfo.id).all()
        shift_ids = [s.id for s in shifts] if shifts else [1, 2, 3]
        # Prefer first shift for sample density; still cover up to 3 shifts
        sample_shifts = shift_ids[:3] if len(shift_ids) >= 1 else [1]

        existing = {
            (row.machine_id, row.shift)
            for row in db.query(ShiftSummary)
            .filter(ShiftSummary.timestamp >= day_start, ShiftSummary.timestamp <= day_end)
            .all()
        }

        inserted = 0
        rng = random.Random(today.strftime("%Y%m%d"))

        for machine in machines:
            for shift_id in sample_shifts:
                key = (machine.id, shift_id)
                if key in existing:
                    continue

                availability = round(rng.uniform(70, 98), 1)
                performance = round(rng.uniform(72, 97), 1)
                quality = round(rng.uniform(85, 99.5), 1)
                oee = round((availability / 100) * (performance / 100) * (quality / 100) * 100, 1)

                production_mins = int(480 * (availability / 100) * rng.uniform(0.85, 1.0))
                idle_mins = int(rng.uniform(10, 80))
                off_mins = max(0, 480 - production_mins - idle_mins)

                total_parts = rng.randint(20, 180)
                bad_parts = rng.randint(0, max(1, total_parts // 12))
                good_parts = max(0, total_parts - bad_parts)

                row = ShiftSummary(
                    machine_id=machine.id,
                    shift=shift_id,
                    timestamp=today + timedelta(hours=(shift_id - 1) * 2),
                    updatedate=datetime.now(),
                    production_time=_minutes_to_time(production_mins),
                    idle_time=_minutes_to_time(idle_mins),
                    off_time=_minutes_to_time(off_mins),
                    total_parts=total_parts,
                    good_parts=good_parts,
                    bad_parts=bad_parts,
                    availability=availability,
                    performance=performance,
                    quality=quality,
                    availability_loss=round(100 - availability, 1),
                    performance_loss=round(100 - performance, 1),
                    quality_loss=round(100 - quality, 1),
                    oee=oee,
                )
                db.add(row)
                inserted += 1

        db.commit()
        print(
            f"Seeded {inserted} shift_summary row(s) for {today.date()} "
            f"across {len(machines)} machine(s), shifts={sample_shifts}."
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_today_shift_summary()
