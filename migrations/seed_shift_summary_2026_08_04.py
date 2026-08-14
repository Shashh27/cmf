"""
Seed production_monitoring.shift_summary for 2026-08-04 (4/8/26).

Usage:
  python migrations/seed_shift_summary_2026_08_04.py
"""
from __future__ import annotations

import random
from datetime import datetime, time, timedelta

import psycopg2

DB = dict(
    host="172.18.7.91",
    port=5432,
    user="postgres",
    password="postgres",
    dbname="CMF_DIGITIZATION",
)

TARGET_DATE = datetime(2026, 8, 4)


def time_from_minutes(total_minutes: int) -> time:
    total_minutes = max(0, min(total_minutes, 23 * 60 + 59))
    return time(total_minutes // 60, total_minutes % 60, 0)


def metrics_for_seed(rng: random.Random) -> dict:
    availability = round(rng.uniform(70.0, 98.0), 2)
    performance = round(rng.uniform(65.0, 97.0), 2)
    quality = round(rng.uniform(85.0, 99.5), 2)
    oee = round(availability * performance * quality / 10000.0, 2)
    total_parts = rng.randint(20, 180)
    bad_parts = rng.randint(0, max(1, total_parts // 12))
    good_parts = max(0, total_parts - bad_parts)

    # Typical shift length ~ 480 minutes; split into off/idle/production
    production_mins = int(480 * (availability / 100.0) * (performance / 100.0))
    idle_mins = int(480 * (1 - availability / 100.0) * 0.55)
    off_mins = max(0, 480 - production_mins - idle_mins)

    return {
        "off_time": time_from_minutes(off_mins),
        "idle_time": time_from_minutes(idle_mins),
        "production_time": time_from_minutes(production_mins),
        "total_parts": total_parts,
        "good_parts": good_parts,
        "bad_parts": bad_parts,
        "availability": availability,
        "performance": performance,
        "quality": quality,
        "availability_loss": round(100.0 - availability, 2),
        "performance_loss": round(100.0 - performance, 2),
        "quality_loss": round(100.0 - quality, 2),
        "oee": oee,
    }


def main() -> None:
    conn = psycopg2.connect(**DB)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'production_monitoring'
              AND table_name = 'shift_summary'
            ORDER BY ordinal_position
            """
        )
        cols = cur.fetchall()
        print("shift_summary columns:")
        for c in cols:
            print(f"  {c[0]} ({c[1]})")

        cur.execute("SELECT id FROM configuration.machines ORDER BY id")
        machine_ids = [r[0] for r in cur.fetchall()]
        if not machine_ids:
            raise RuntimeError("No machines found in configuration.machines")

        cur.execute("SELECT id FROM ems.shift_info WHERE id IN (1, 2) ORDER BY id")
        shift_ids = [r[0] for r in cur.fetchall()]
        if not shift_ids:
            # fallback: any shifts present
            cur.execute("SELECT id FROM ems.shift_info ORDER BY id LIMIT 2")
            shift_ids = [r[0] for r in cur.fetchall()]
        if not shift_ids:
            raise RuntimeError("No shifts found in ems.shift_info")

        print(f"machines={len(machine_ids)} shifts={shift_ids}")

        day_start = TARGET_DATE.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1) - timedelta(seconds=1)

        cur.execute(
            """
            SELECT COUNT(*)
            FROM production_monitoring.shift_summary
            WHERE timestamp >= %s AND timestamp <= %s
            """,
            (day_start, day_end),
        )
        existing = cur.fetchone()[0]
        print(f"existing rows for {TARGET_DATE.date()}: {existing}")

        if existing:
            cur.execute(
                """
                DELETE FROM production_monitoring.shift_summary
                WHERE timestamp >= %s AND timestamp <= %s
                """,
                (day_start, day_end),
            )
            print(f"deleted {cur.rowcount} existing rows for that date")

        insert_sql = """
            INSERT INTO production_monitoring.shift_summary (
                machine_id, shift, timestamp, updatedate,
                off_time, idle_time, production_time,
                total_parts, good_parts, bad_parts,
                availability, performance, quality,
                availability_loss, performance_loss, quality_loss, oee
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s
            )
        """

        now = datetime.now()
        inserted = 0
        for machine_id in machine_ids:
            for shift_id in shift_ids:
                rng = random.Random(f"{machine_id}-{shift_id}-2026-08-04")
                m = metrics_for_seed(rng)
                # Place timestamp within the shift day (morning for shift 1, afternoon for shift 2)
                ts = day_start.replace(hour=8 if shift_id == 1 else 16, minute=0, second=0)
                cur.execute(
                    insert_sql,
                    (
                        machine_id,
                        shift_id,
                        ts,
                        now,
                        m["off_time"],
                        m["idle_time"],
                        m["production_time"],
                        m["total_parts"],
                        m["good_parts"],
                        m["bad_parts"],
                        m["availability"],
                        m["performance"],
                        m["quality"],
                        m["availability_loss"],
                        m["performance_loss"],
                        m["quality_loss"],
                        m["oee"],
                    ),
                )
                inserted += 1

        conn.commit()
        print(f"seeded {inserted} rows for {TARGET_DATE.date()}")

        cur.execute(
            """
            SELECT machine_id, shift, oee, availability, performance, quality, total_parts
            FROM production_monitoring.shift_summary
            WHERE timestamp >= %s AND timestamp <= %s
            ORDER BY machine_id, shift
            LIMIT 10
            """,
            (day_start, day_end),
        )
        print("sample:")
        for row in cur.fetchall():
            print(" ", row)

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
