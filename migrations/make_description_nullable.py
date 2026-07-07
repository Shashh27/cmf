"""
Migration script to make description column nullable in pokayoke_checklists table.
"""

import os
from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://postgres:postgres@172.18.7.86:5432/CMF_Demo",
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check if description column is currently NOT NULL
    check_column = text("""
        SELECT is_nullable 
        FROM information_schema.columns 
        WHERE table_schema = 'configuration' 
        AND table_name = 'pokayoke_checklists' 
        AND column_name = 'description'
    """)
    result = conn.execute(check_column).fetchone()
    
    if result and result[0] == 'NO':
        print("Description column is currently NOT NULL, making it nullable...")
        
        # First, update any NULL values to empty string to avoid data loss
        conn.execute(text("""
            UPDATE configuration.pokayoke_checklists 
            SET description = '' 
            WHERE description IS NULL
        """))
        print("Updated NULL descriptions to empty string")
        
        # Make the column nullable
        conn.execute(text("""
            ALTER TABLE configuration.pokayoke_checklists 
            ALTER COLUMN description DROP NOT NULL
        """))
        print("Made description column nullable")
        
        conn.commit()
        print("Migration completed successfully!")
    else:
        print("Description column is already nullable, no migration needed")
