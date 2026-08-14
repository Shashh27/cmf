"""Store operation cycle_time as duration string (up to 100 hours).

PostgreSQL TIME cannot represent 100:00:00. Convert existing clock values
to HHH:MM:SS text.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "0004_cycle_time_duration"
down_revision: Union[str, None] = "0003_chatbox_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE oms.operations
        ALTER COLUMN cycle_time TYPE VARCHAR(16)
        USING CASE
            WHEN cycle_time IS NULL THEN NULL
            ELSE to_char(cycle_time, 'HH24:MI:SS')
        END
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE oms.operations
        ALTER COLUMN cycle_time TYPE TIME
        USING CASE
            WHEN cycle_time IS NULL THEN NULL
            ELSE CAST(cycle_time AS TIME)
        END
        """
    )
