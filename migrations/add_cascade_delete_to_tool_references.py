"""
Migration script to add ON DELETE CASCADE to tool_id foreign keys
This ensures that when a tool is deleted from inventory.tools_list,
all references in related tables are automatically deleted.

Tables affected:
- oms.tools_with_part (tool_id)
- inventory.inventory_requests (tool_id)
- inventory.tool_issues (tool_id)
"""

import sys
import os

# Add parent directory to path to import database modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from DB.database import engine, SessionLocal


def migrate():
    """Apply the cascade delete constraints to tool_id foreign keys"""
    db = SessionLocal()
    
    try:
        print("Starting migration: Add ON DELETE CASCADE to tool_id foreign keys...")
        
        # Step 1: Clean up orphaned records
        print("\nStep 1: Cleaning up orphaned records...")
        
        # Clean up tools_with_part
        orphaned_tools_with_part = db.execute(text("""
            DELETE FROM oms.tools_with_part 
            WHERE tool_id NOT IN (SELECT id FROM inventory.tools_list)
        """))
        if orphaned_tools_with_part.rowcount > 0:
            print(f"  Deleted {orphaned_tools_with_part.rowcount} orphaned records from tools_with_part")
        db.commit()
        
        # Clean up inventory_requests
        orphaned_inventory_requests = db.execute(text("""
            DELETE FROM inventory.inventory_requests 
            WHERE tool_id NOT IN (SELECT id FROM inventory.tools_list)
        """))
        if orphaned_inventory_requests.rowcount > 0:
            print(f"  Deleted {orphaned_inventory_requests.rowcount} orphaned records from inventory_requests")
        db.commit()
        
        # Clean up tool_issues
        orphaned_tool_issues = db.execute(text("""
            DELETE FROM inventory.tool_issues 
            WHERE tool_id NOT IN (SELECT id FROM inventory.tools_list)
        """))
        if orphaned_tool_issues.rowcount > 0:
            print(f"  Deleted {orphaned_tool_issues.rowcount} orphaned records from tool_issues")
        db.commit()
        
        print("Orphaned records cleanup completed!")
        
        # Step 2: Get actual constraint names for each table
        print("\nStep 2: Getting constraint names...")
        constraint_queries = {
            'tools_with_part': """
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = 'oms.tools_with_part'::regclass 
                AND contype = 'f' 
                AND conname LIKE '%tool_id%'
            """,
            'inventory_requests': """
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = 'inventory.inventory_requests'::regclass 
                AND contype = 'f' 
                AND conname LIKE '%tool_id%'
            """,
            'tool_issues': """
                SELECT conname 
                FROM pg_constraint 
                WHERE conrelid = 'inventory.tool_issues'::regclass 
                AND contype = 'f' 
                AND conname LIKE '%tool_id%'
            """
        }
        
        constraint_names = {}
        
        # Get constraint names
        for table, query in constraint_queries.items():
            result = db.execute(text(query)).fetchone()
            if result:
                constraint_names[table] = result[0]
                print(f"Found constraint for {table}: {result[0]}")
            else:
                print(f"WARNING: No constraint found for {table}")
        
        # Step 3: Drop and recreate constraints with CASCADE
        print("\nStep 3: Adding CASCADE delete constraints...")
        migration_statements = [
            # tools_with_part
            f"""
            ALTER TABLE oms.tools_with_part 
            DROP CONSTRAINT IF EXISTS {constraint_names.get('tools_with_part', 'tools_with_part_tool_id_fkey')};
            """,
            """
            ALTER TABLE oms.tools_with_part 
            ADD CONSTRAINT tools_with_part_tool_id_fkey 
            FOREIGN KEY (tool_id) REFERENCES inventory.tools_list(id) ON DELETE CASCADE;
            """,
            
            # inventory_requests
            f"""
            ALTER TABLE inventory.inventory_requests 
            DROP CONSTRAINT IF EXISTS {constraint_names.get('inventory_requests', 'inventory_requests_tool_id_fkey')};
            """,
            """
            ALTER TABLE inventory.inventory_requests 
            ADD CONSTRAINT inventory_requests_tool_id_fkey 
            FOREIGN KEY (tool_id) REFERENCES inventory.tools_list(id) ON DELETE CASCADE;
            """,
            
            # tool_issues
            f"""
            ALTER TABLE inventory.tool_issues 
            DROP CONSTRAINT IF EXISTS {constraint_names.get('tool_issues', 'tool_issues_tool_id_fkey')};
            """,
            """
            ALTER TABLE inventory.tool_issues 
            ADD CONSTRAINT tool_issues_tool_id_fkey 
            FOREIGN KEY (tool_id) REFERENCES inventory.tools_list(id) ON DELETE CASCADE;
            """
        ]
        
        # Execute migration statements
        for i, statement in enumerate(migration_statements, 1):
            print(f"Executing statement {i}/{len(migration_statements)}...")
            db.execute(text(statement))
            db.commit()
        
        print("\nMigration completed successfully!")
        print("Tool deletion will now cascade to:")
        print("  - oms.tools_with_part")
        print("  - inventory.inventory_requests")
        print("  - inventory.tool_issues")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
