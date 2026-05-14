
import sys
import os

# Add the project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine, text
from DB.database import DATABASE_URL

def update_efficiency_factor():
    print("Updating efficiency_factor from 0.85 to 1.0...")
    
    try:
        engine = create_engine(DATABASE_URL)
        
        # Update existing efficiency_factor record
        with engine.connect() as conn:
            # Update the existing row
            update_result = conn.execute(text("""
                UPDATE scheduling.efficiency_factor
                SET efficiency_factor = 1.0,
                    updated_at = NOW()
                WHERE efficiency_factor = 0.85
            """))
            
            # If no row was updated, check if any row exists
            if update_result.rowcount == 0:
                # Check if there's any row
                check_result = conn.execute(text("""
                    SELECT COUNT(*) FROM scheduling.efficiency_factor
                """)).scalar()
                
                if check_result == 0:
                    # Insert a new row
                    conn.execute(text("""
                        INSERT INTO scheduling.efficiency_factor
                        (efficiency_factor, created_at, updated_at)
                        VALUES (1.0, NOW(), NOW())
                    """))
                    print("[OK] Created new efficiency_factor record with value 1.0")
                else:
                    print(f"[OK] No record with 0.85 found. Current records are unchanged.")
            else:
                print(f"[OK] Updated {update_result.rowcount} record(s) from 0.85 to 1.0")
            
            conn.commit()
            
            # Verify the change
            final_result = conn.execute(text("""
                SELECT efficiency_factor FROM scheduling.efficiency_factor
            """)).fetchone()
            
            if final_result:
                print(f"[OK] Current efficiency_factor: {final_result[0]}")
                
        print("\n[SUCCESS] Efficiency factor updated successfully!")
        
    except Exception as e:
        print(f"\n[ERROR] Error updating efficiency_factor: {str(e)}")
        raise

if __name__ == "__main__":
    update_efficiency_factor()
