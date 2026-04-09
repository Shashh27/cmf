#!/usr/bin/env python3
"""
Migration script to add operator_id column to operation_status table
This will track which operator activated the job card
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from DB.database import SessionLocal
from sqlalchemy import text


def add_operator_id_column():
    """Add operator_id column to operation_status table"""
    db = SessionLocal()
    
    try:
        print("Adding operator_id column to operation_status table...")
        
        # Check if column already exists
        check_column = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' 
            AND table_name = 'operation_status' 
            AND column_name = 'operator_id'
        """)).fetchone()
        
        if check_column:
            print("operator_id column already exists in operation_status table")
            return True
        
        # Add the operator_id column
        db.execute(text("""
            ALTER TABLE scheduling.operation_status 
            ADD COLUMN operator_id INTEGER
        """))
        
        # Add foreign key constraint to access_users table
        try:
            db.execute(text("""
                ALTER TABLE scheduling.operation_status 
                ADD CONSTRAINT fk_operation_status_operator 
                FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id)
            """))
            print("Foreign key constraint added successfully")
        except Exception as e:
            print(f"Warning: Could not add foreign key constraint: {e}")
            print("Column added but without foreign key constraint")
        
        # Add index for better performance
        db.execute(text("""
            CREATE INDEX idx_operation_status_operator_id 
            ON scheduling.operation_status(operator_id)
        """))
        
        db.commit()
        
        # Verify the column was added
        verify_column = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' 
            AND table_name = 'operation_status' 
            AND column_name = 'operator_id'
        """)).fetchone()
        
        if verify_column:
            print(f"SUCCESS: operator_id column added successfully")
            print(f"  - Column: {verify_column.column_name}")
            print(f"  - Type: {verify_column.data_type}")
            print(f"  - Nullable: {verify_column.is_nullable}")
            return True
        else:
            print("ERROR: Column verification failed")
            return False
        
    except Exception as e:
        print(f"Migration failed: {str(e)}")
        db.rollback()
        return False
        
    finally:
        db.close()


def update_operation_status_model():
    """
    Instructions for updating the OperationStatus model
    """
    print("\n" + "=" * 60)
    print("MODEL UPDATE INSTRUCTIONS")
    print("=" * 60)
    print("After running this migration, update the OperationStatus model in:")
    print("  backend/cmf/DB/models/scheduling.py")
    print("\nAdd this line to the OperationStatus class:")
    print("  operator_id = Column(Integer, ForeignKey('accesscontrol.access_users.id'), nullable=True)")
    print("\nAdd this to the imports if not already present:")
    print("  from sqlalchemy import ForeignKey")
    print("\nAdd this to the relationships if desired:")
    print("  operator = relationship('AccessUser', foreign_keys=[operator_id])")


def show_current_table_structure():
    """Show current operation_status table structure"""
    db = SessionLocal()
    
    try:
        print("\nCurrent operation_status table structure:")
        print("-" * 50)
        
        columns = db.execute(text("""
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default
            FROM information_schema.columns 
            WHERE table_schema = 'scheduling' 
            AND table_name = 'operation_status'
            ORDER BY ordinal_position
        """)).fetchall()
        
        for col in columns:
            nullable = "NULL" if col.is_nullable == "YES" else "NOT NULL"
            default = f" DEFAULT {col.column_default}" if col.column_default else ""
            print(f"  {col.column_name}: {col.data_type} {nullable}{default}")
        
        # Show sample data
        print("\nSample data (first 5 rows):")
        print("-" * 50)
        
        sample_data = db.execute(text("""
            SELECT * FROM scheduling.operation_status 
            LIMIT 5
        """)).fetchall()
        
        if sample_data:
            # Get column names
            column_names = [desc[0] for desc in db.execute(text("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'scheduling' AND table_name = 'operation_status'
                ORDER BY ordinal_position
            """)).fetchall()]
            
            for row in sample_data:
                row_dict = dict(zip(column_names, row))
                print(f"  ID {row_dict.get('id', 'N/A')}: Op {row_dict.get('operation_id', 'N/A')}, "
                      f"Order {row_dict.get('order_id', 'N/A')}, Status {row_dict.get('status', 'N/A')}, "
                      f"Operator {row_dict.get('operator_id', 'N/A')}")
        else:
            print("  No data found")
        
    except Exception as e:
        print(f"Failed to show table structure: {str(e)}")
        
    finally:
        db.close()


if __name__ == "__main__":
    print("Operation Status Migration: Add operator_id Column")
    print("=" * 60)
    
    # Show current structure before migration
    show_current_table_structure()
    
    # Run the migration
    success = add_operator_id_column()
    
    if success:
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETED SUCCESSFULLY")
        
        # Show updated structure
        show_current_table_structure()
        
        # Show model update instructions
        update_operation_status_model()
        
        print("\n" + "=" * 60)
        print("NEXT STEPS:")
        print("1. Update the OperationStatus model as shown above")
        print("2. Update the job card activation endpoint to store operator_id")
        print("3. Test the functionality")
        
        sys.exit(0)
    else:
        print("\n" + "=" * 60)
        print("MIGRATION FAILED")
        print("Please check the error messages above and fix any issues")
        sys.exit(1)
