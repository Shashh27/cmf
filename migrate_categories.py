"""
Migration script to add Category table and update ToolsList to use foreign keys.

This script will:
1. Create the inventory.categories table
2. Add category_id and sub_category_id columns to inventory.tools_list
3. Migrate existing data from category/sub_category string columns to foreign keys
4. Drop the old category and sub_category columns from tools_list
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys
import os

# Add parent directory to path to import from DB
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from DB.database import DATABASE_URL
from DB.models.inventory import Base, Category, ToolsList

def migrate():
    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        print("Starting migration...")
        
        # Step 1: Create categories table
        print("\n1. Creating categories table...")
        Base.metadata.tables['inventory.categories'].create(engine, checkfirst=True)
        print("   ✓ Categories table created")
        
        # Step 2: Add category_id and sub_category_id columns to tools_list
        print("\n2. Adding foreign key columns to tools_list...")
        with engine.connect() as conn:
            # Check if old columns exist
            check_columns = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'inventory' 
                AND table_name = 'tools_list' 
                AND column_name IN ('category', 'sub_category')
            """)).fetchall()
            
            has_old_columns = len(check_columns) > 0
            
            if has_old_columns:
                # Add category_id column
                conn.execute(text("""
                    ALTER TABLE inventory.tools_list 
                    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES inventory.categories(id)
                """))
                
                # Add sub_category_id column
                conn.execute(text("""
                    ALTER TABLE inventory.tools_list 
                    ADD COLUMN IF NOT EXISTS sub_category_id INTEGER REFERENCES inventory.categories(id)
                """))
                
                conn.commit()
            else:
                print("   ℹ Old columns don't exist - assuming fresh database or already migrated")
                
                # Just add the new columns if they don't exist
                conn.execute(text("""
                    ALTER TABLE inventory.tools_list 
                    ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES inventory.categories(id)
                """))
                
                conn.execute(text("""
                    ALTER TABLE inventory.tools_list 
                    ADD COLUMN IF NOT EXISTS sub_category_id INTEGER REFERENCES inventory.categories(id)
                """))
                
                conn.commit()
        print("   ✓ Foreign key columns added")
        
        # Steps 3, 4, 5: Only run if old columns exist
        if has_old_columns:
            # Step 3: Migrate existing data
            print("\n3. Migrating existing category/sub-category data...")
            with engine.connect() as conn:
                # Get unique category/sub_category combinations from existing tools
                result = conn.execute(text("""
                    SELECT DISTINCT category, sub_category 
                    FROM inventory.tools_list 
                    WHERE category IS NOT NULL
                """))
            
            categories_map = {}  # name -> id
            subcategories_map = {}  # (parent_name, sub_name) -> id
            
            for row in result:
                cat_name = row[0]
                sub_name = row[1]
                
                # Create or get category
                if cat_name and cat_name not in categories_map:
                    conn.execute(text("""
                        INSERT INTO inventory.categories (name, parent_id)
                        VALUES (:name, NULL)
                        ON CONFLICT (name) DO NOTHING
                    """), {"name": cat_name})
                    
                    # Get the category ID
                    cat_result = conn.execute(text("""
                        SELECT id FROM inventory.categories WHERE name = :name
                    """), {"name": cat_name})
                    categories_map[cat_name] = cat_result.fetchone()[0]
                
                # Create or get sub-category
                if sub_name and cat_name:
                    key = (cat_name, sub_name)
                    if key not in subcategories_map:
                        parent_id = categories_map.get(cat_name)
                        if parent_id:
                            conn.execute(text("""
                                INSERT INTO inventory.categories (name, parent_id)
                                VALUES (:name, :parent_id)
                                ON CONFLICT DO NOTHING
                            """), {"name": sub_name, "parent_id": parent_id})
                            
                            # Get the sub-category ID
                            sub_result = conn.execute(text("""
                                SELECT id FROM inventory.categories 
                                WHERE name = :name AND parent_id = :parent_id
                            """), {"name": sub_name, "parent_id": parent_id})
                            subcategories_map[key] = sub_result.fetchone()[0]
            
                conn.commit()
            print("   ✓ Categories and sub-categories created")
            
            # Step 4: Update tools_list with foreign key IDs
            print("\n4. Updating tools_list with category_id and sub_category_id...")
            with engine.connect() as conn:
                # Update sub_category_id for tools that have both category and sub_category
                conn.execute(text("""
                    UPDATE inventory.tools_list t
                    SET sub_category_id = c.id
                    FROM inventory.categories c
                    WHERE t.sub_category = c.name
                """))
                
                # Update category_id for tools that only have category (no sub-category)
                conn.execute(text("""
                    UPDATE inventory.tools_list t
                    SET category_id = c.id
                    FROM inventory.categories c
                    WHERE t.category = c.name 
                    AND t.sub_category IS NULL
                """))
                
                conn.commit()
            print("   ✓ Foreign keys updated (category_id and sub_category_id are mutually exclusive)")
            
            # Step 5: Drop old columns
            print("\n5. Dropping old category and sub_category columns...")
            with engine.connect() as conn:
                try:
                    conn.execute(text("ALTER TABLE inventory.tools_list DROP COLUMN category"))
                    conn.execute(text("ALTER TABLE inventory.tools_list DROP COLUMN sub_category"))
                    conn.commit()
                    print("   ✓ Old columns dropped")
                except Exception as e:
                    print(f"   ⚠ Warning: Could not drop old columns: {e}")
                    print("   (This might be okay if columns don't exist or have dependencies)")
        else:
            print("\n3. Skipping data migration (no old columns)")
            print("\n4. Skipping foreign key update (no old data)")
            print("\n5. Skipping column drop (no old columns)")
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        session.rollback()
        raise
    finally:
        session.close()

if __name__ == "__main__":
    migrate()
