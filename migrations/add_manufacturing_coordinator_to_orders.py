from sqlalchemy import text
from DB.database import engine

def migrate():
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE oms.orders 
            ADD COLUMN IF NOT EXISTS manufacturing_coordinator_id INTEGER 
            REFERENCES accesscontrol.access_users(id)
        """))
        conn.commit()
        print("Migration completed: Added manufacturing_coordinator_id to oms.orders")

if __name__ == "__main__":
    migrate()
