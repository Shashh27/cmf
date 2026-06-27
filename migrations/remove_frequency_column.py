"""
Remove the old 'frequency' column from pokayoke_completed_logs table.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    try:
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_completed_logs 
            DROP COLUMN IF EXISTS frequency
        """))
        conn.commit()
        print("Successfully removed 'frequency' column from pokayoke_completed_logs")
    except Exception as e:
        print(f"Error removing frequency column: {e}")
