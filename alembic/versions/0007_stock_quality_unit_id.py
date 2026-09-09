"""Add optional unit_id to stock_quality_documents for unit-level uploads.

Stock-level docs keep unit_id NULL.
Unit-level docs set unit_id to the raw_material_units row.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0007_stock_quality_unit_id"
down_revision: Union[str, None] = "0006_parts_unique_per_product"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE inventory.stock_quality_documents
            ADD COLUMN IF NOT EXISTS unit_id INTEGER
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'stock_quality_documents_unit_id_fkey'
            ) THEN
                ALTER TABLE inventory.stock_quality_documents
                    ADD CONSTRAINT stock_quality_documents_unit_id_fkey
                    FOREIGN KEY (unit_id)
                    REFERENCES inventory.raw_material_units(id)
                    ON DELETE SET NULL;
            END IF;
        END $$;
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_stock_quality_documents_unit_id
            ON inventory.stock_quality_documents (unit_id)
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE inventory.stock_quality_documents
            DROP CONSTRAINT IF EXISTS stock_quality_documents_unit_id_fkey
        """
    )
    op.execute(
        """
        DROP INDEX IF EXISTS inventory.ix_stock_quality_documents_unit_id
        """
    )
    op.execute(
        """
        ALTER TABLE inventory.stock_quality_documents
            DROP COLUMN IF EXISTS unit_id
        """
    )
