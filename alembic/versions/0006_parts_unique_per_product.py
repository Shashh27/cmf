"""Make part_number unique per product, not globally.

App logic already allows the same part number in different products.
Server DBs that still have a global UNIQUE on oms.parts.part_number reject
those inserts with IntegrityError (shown as generic "Error" in bulk upload).

Scheduling tables referenced that global unique via part_number FKs.
They already have part_id → oms.parts(id) FKs, so we only drop the
redundant part_number FKs. No part/schedule row data is deleted.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006_parts_unique_per_product"
down_revision: Union[str, None] = "0005_chatbox_attachments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Drop scheduling FKs that depend on global UNIQUE(part_number).
    #    Keep part_id FKs and all existing rows.
    op.execute(
        """
        ALTER TABLE scheduling.planned_schedule_items
        DROP CONSTRAINT IF EXISTS planned_schedule_items_part_number_fkey
        """
    )
    op.execute(
        """
        ALTER TABLE scheduling.rescheduling_items
        DROP CONSTRAINT IF EXISTS rescheduling_items_part_number_fkey
        """
    )

    # 2) Drop any UNIQUE constraint that is only on part_number (global uniqueness)
    op.execute(
        """
        DO $$
        DECLARE
          r RECORD;
          cols text[];
        BEGIN
          FOR r IN
            SELECT c.oid, c.conname
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = 'oms'
              AND t.relname = 'parts'
              AND c.contype = 'u'
          LOOP
            SELECT array_agg(a.attname::text ORDER BY u.ord)
              INTO cols
            FROM unnest(
              (SELECT conkey FROM pg_constraint WHERE oid = r.oid)
            ) WITH ORDINALITY AS u(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = (SELECT conrelid FROM pg_constraint WHERE oid = r.oid)
             AND a.attnum = u.attnum;

            IF cols = ARRAY['part_number']::text[] THEN
              EXECUTE format('ALTER TABLE oms.parts DROP CONSTRAINT %I', r.conname);
            END IF;
          END LOOP;
        END $$;
        """
    )

    # 3) Also drop a standalone unique INDEX on part_number if one exists
    op.execute(
        """
        DO $$
        DECLARE
          r RECORD;
        BEGIN
          FOR r IN
            SELECT i.relname AS index_name
            FROM pg_index x
            JOIN pg_class t ON t.oid = x.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_class i ON i.oid = x.indexrelid
            WHERE n.nspname = 'oms'
              AND t.relname = 'parts'
              AND x.indisunique = true
              AND x.indisprimary = false
              AND NOT EXISTS (
                SELECT 1 FROM pg_constraint c WHERE c.conindid = x.indexrelid
              )
              AND (
                SELECT array_agg(a.attname::text ORDER BY u.ord)
                FROM unnest(x.indkey) WITH ORDINALITY AS u(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = u.attnum
              ) = ARRAY['part_number']::text[]
          LOOP
            EXECUTE format('DROP INDEX IF EXISTS oms.%I', r.index_name);
          END LOOP;
        END $$;
        """
    )

    # 4) Enforce uniqueness per product (matches app logic)
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = 'oms'
              AND t.relname = 'parts'
              AND c.conname = 'uq_parts_product_part_number'
          ) THEN
            ALTER TABLE oms.parts
              ADD CONSTRAINT uq_parts_product_part_number
              UNIQUE (product_id, part_number);
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE oms.parts
        DROP CONSTRAINT IF EXISTS uq_parts_product_part_number
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON c.conrelid = t.oid
            JOIN pg_namespace n ON t.relnamespace = n.oid
            WHERE n.nspname = 'oms'
              AND t.relname = 'parts'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) LIKE '%(part_number)%'
              AND pg_get_constraintdef(c.oid) NOT LIKE '%product_id%'
          ) THEN
            ALTER TABLE oms.parts ADD CONSTRAINT parts_part_number_key UNIQUE (part_number);
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'planned_schedule_items_part_number_fkey'
          ) THEN
            ALTER TABLE scheduling.planned_schedule_items
              ADD CONSTRAINT planned_schedule_items_part_number_fkey
              FOREIGN KEY (part_number) REFERENCES oms.parts(part_number);
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'rescheduling_items_part_number_fkey'
          ) THEN
            ALTER TABLE scheduling.rescheduling_items
              ADD CONSTRAINT rescheduling_items_part_number_fkey
              FOREIGN KEY (part_number) REFERENCES oms.parts(part_number);
          END IF;
        END $$;
        """
    )
