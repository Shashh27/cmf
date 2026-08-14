from sqlalchemy import create_engine, text
from DB.db_config import get_database_url

e = create_engine(get_database_url())
with e.connect() as c:
    rows = c.execute(text("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema='scheduling' AND table_name='rescheduling_items'
        ORDER BY ordinal_position
    """)).fetchall()
    for r in rows:
        print(r[0], r[1])
    print("---sample---")
    sample = c.execute(text("SELECT * FROM scheduling.rescheduling_items LIMIT 1")).mappings().first()
    if sample:
        for k, v in dict(sample).items():
            print(k, "=", v)
    else:
        print("no rows")
