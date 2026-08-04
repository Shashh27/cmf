"""
Allow document_extracted_data rows without a linked 2D document (manual RM planning).
"""

from sqlalchemy import create_engine, text

from DB.db_config import get_database_url

engine = create_engine(get_database_url())

with engine.connect() as conn:
    check_column = text("""
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'oms'
          AND table_name = 'document_extracted_data'
          AND column_name = 'document_id'
    """)
    result = conn.execute(check_column).fetchone()

    if result and result[0] == 'NO':
        print("Making oms.document_extracted_data.document_id nullable...")
        conn.execute(text("""
            ALTER TABLE oms.document_extracted_data
            ALTER COLUMN document_id DROP NOT NULL
        """))
        conn.commit()
        print("Done.")
    else:
        print("document_id is already nullable — no change needed.")
