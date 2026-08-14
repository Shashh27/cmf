"""One-shot repair: completed/inactive -> priority 0; active -> 1..N."""
from sqlalchemy import create_engine, text

ENGINE_URL = "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo"


def main() -> None:
    engine = create_engine(ENGINE_URL)
    with engine.begin() as conn:
        cleared = conn.execute(
            text(
                """
                UPDATE oms.order_part_priorities
                SET priority = 0, updated_at = NOW()
                WHERE status <> 'active' AND priority <> 0
                RETURNING id, part_id, status, priority
                """
            )
        ).fetchall()
        print(f"cleared {len(cleared)} non-active rows to priority=0")
        for row in cleared:
            print(" ", dict(row._mapping))

        active_ids = [
            r[0]
            for r in conn.execute(
                text(
                    """
                    SELECT id FROM oms.order_part_priorities
                    WHERE status = 'active' AND priority > 0
                    ORDER BY priority ASC, id ASC
                    """
                )
            ).fetchall()
        ]
        for i, rid in enumerate(active_ids, start=1):
            conn.execute(
                text(
                    """
                    UPDATE oms.order_part_priorities
                    SET priority = :p, updated_at = NOW()
                    WHERE id = :id
                    """
                ),
                {"p": i, "id": rid},
            )
        print(f"resequenced {len(active_ids)} active rows to 1..{len(active_ids)}")

        print("\nfinal state:")
        for row in conn.execute(
            text(
                """
                SELECT id, order_id, part_id, priority, status
                FROM oms.order_part_priorities
                ORDER BY id
                """
            )
        ):
            print(dict(row._mapping))


if __name__ == "__main__":
    main()
