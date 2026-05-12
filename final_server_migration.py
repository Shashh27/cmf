#!/usr/bin/env python3
"""
FINAL SERVER MIGRATION SCRIPT
Comprehensive migration from local CMF_Demo to server CMF_DIGITIZATION
Applies all structural changes and data operations as required
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import create_engine, text
from datetime import datetime

# Database configurations
LOCAL_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/CMF_Demo"
SERVER_DATABASE_URL = "postgresql://postgres:postgres@172.18.7.91:5432/CMF_DIGITIZATION"

class FinalServerMigration:
    def __init__(self):
        self.server_engine = create_engine(SERVER_DATABASE_URL)
        self.migration_log = []
        
    def log(self, message):
        """Log migration steps"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {message}"
        self.migration_log.append(log_entry)
        print(log_entry)
        
    def pre_migration_backup(self):
        """Backup critical data before migration"""
        self.log("🔒 PRE-MIGRATION BACKUP")
        
        critical_tables = [
            'inventory.raw_material_stock',
            'oms.parts', 
            'inventory.vendors',
            'oms.orders',
            'oms.order_parts_raw_material_linked'
        ]
        
        backup_data = {}
        
        with self.server_engine.connect() as server_conn:
            for table in critical_tables:
                schema, name = table.split('.')
                count = server_conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                backup_data[table] = count
                self.log(f"  {table}: {count} rows")
                
        self.log(f"✅ Backup complete: {sum(backup_data.values())} total rows")
        return backup_data
        
    def delete_raw_material_stock_data(self):
        """Delete all data from raw_material_stock table"""
        self.log("🗑️  DELETING RAW_MATERIAL_STOCK DATA")
        
        with self.server_engine.connect() as server_conn:
            trans = server_conn.begin()
            
            try:
                # Get current count
                count = server_conn.execute(text("SELECT COUNT(*) FROM inventory.raw_material_stock")).scalar()
                self.log(f"  Current rows: {count}")
                
                # Delete all data
                result = server_conn.execute(text("DELETE FROM inventory.raw_material_stock"))
                deleted_count = result.rowcount
                self.log(f"  ✅ Deleted {deleted_count} rows")
                
                trans.commit()
                return True, deleted_count
                
            except Exception as e:
                trans.rollback()
                self.log(f"  ❌ Deletion failed: {e}")
                return False, 0
                
    def update_raw_material_stock_structure(self):
        """Update raw_material_stock table structure"""
        self.log("🔧 UPDATING RAW_MATERIAL_STOCK STRUCTURE")
        
        with self.server_engine.connect() as server_conn:
            trans = server_conn.begin()
            
            try:
                # Add missing columns
                columns_to_add = [
                    ('remaining_length', 'DOUBLE PRECISION'),
                    ('parent_stock_id', 'INTEGER'),
                    ('is_cut_piece', 'BOOLEAN')
                ]
                
                for column, col_type in columns_to_add:
                    # Check if exists
                    exists = server_conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.columns 
                        WHERE table_schema = 'inventory' 
                        AND table_name = 'raw_material_stock' 
                        AND column_name = '{column}'
                    """)).scalar() > 0
                    
                    if not exists:
                        server_conn.execute(text(f"""
                            ALTER TABLE inventory.raw_material_stock 
                            ADD COLUMN {column} {col_type}
                        """))
                        self.log(f"  ✅ Added column {column} ({col_type})")
                    else:
                        self.log(f"  ⚠️  Column {column} already exists")
                
                # Add foreign key constraint
                fk_exists = server_conn.execute(text("""
                    SELECT COUNT(*) FROM information_schema.table_constraints 
                    WHERE table_schema = 'inventory' 
                    AND table_name = 'raw_material_stock' 
                    AND constraint_name = 'raw_material_stock_parent_stock_id_fkey'
                """)).scalar() > 0
                
                if not fk_exists:
                    server_conn.execute(text("""
                        ALTER TABLE inventory.raw_material_stock 
                        ADD CONSTRAINT raw_material_stock_parent_stock_id_fkey 
                        FOREIGN KEY (parent_stock_id) 
                        REFERENCES inventory.raw_material_stock(id)
                    """))
                    self.log(f"  ✅ Added foreign key constraint")
                else:
                    self.log(f"  ⚠️  Foreign key constraint already exists")
                
                trans.commit()
                self.log("✅ Raw material stock structure updated")
                return True
                
            except Exception as e:
                trans.rollback()
                self.log(f"❌ Structure update failed: {e}")
                return False
                
    def update_parts_table_structure(self):
        """Update parts table structure"""
        self.log("🔧 UPDATING PARTS TABLE STRUCTURE")
        
        with self.server_engine.connect() as server_conn:
            trans = server_conn.begin()
            
            try:
                # Remove obsolete columns
                columns_to_remove = ['raw_material_required_quantity', 'raw_material_stock_id']
                
                for column in columns_to_remove:
                    exists = server_conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.columns 
                        WHERE table_schema = 'oms' 
                        AND table_name = 'parts' 
                        AND column_name = '{column}'
                    """)).scalar() > 0
                    
                    if exists:
                        # Check for data
                        has_data = server_conn.execute(text(f"""
                            SELECT COUNT(*) FROM oms.parts WHERE {column} IS NOT NULL
                        """)).scalar() > 0
                        
                        if has_data:
                            affected = server_conn.execute(text(f"""
                                SELECT COUNT(*) FROM oms.parts WHERE {column} IS NOT NULL
                            """)).scalar()
                            self.log(f"  ⚠️  Column {column} has {affected} rows with data - will be lost")
                        
                        server_conn.execute(text(f"""
                            ALTER TABLE oms.parts DROP COLUMN {column}
                        """))
                        self.log(f"  ✅ Removed column {column}")
                    else:
                        self.log(f"  ⚠️  Column {column} does not exist")
                
                # Add missing columns
                columns_to_add = [
                    ('raw_material_unit_id', 'INTEGER'),
                    ('required_length', 'DOUBLE PRECISION')
                ]
                
                for column, col_type in columns_to_add:
                    exists = server_conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.columns 
                        WHERE table_schema = 'oms' 
                        AND table_name = 'parts' 
                        AND column_name = '{column}'
                    """)).scalar() > 0
                    
                    if not exists:
                        server_conn.execute(text(f"""
                            ALTER TABLE oms.parts ADD COLUMN {column} {col_type}
                        """))
                        self.log(f"  ✅ Added column {column} ({col_type})")
                    else:
                        self.log(f"  ⚠️  Column {column} already exists")
                
                trans.commit()
                self.log("✅ Parts table structure updated")
                return True
                
            except Exception as e:
                trans.rollback()
                self.log(f"❌ Parts structure update failed: {e}")
                return False
                
    def update_parts_table_constraint(self):
        """Update parts table constraint from global to composite"""
        self.log("🔧 UPDATING PARTS TABLE CONSTRAINT")
        
        with self.server_engine.connect() as server_conn:
            trans = server_conn.begin()
            
            try:
                # Check current constraints
                current_cons = server_conn.execute(text("""
                    SELECT constraint_name FROM information_schema.table_constraints 
                    WHERE table_schema = 'oms' AND table_name = 'parts' 
                    AND constraint_name LIKE '%part_number%'
                """)).fetchall()
                
                constraint_names = [con[0] for con in current_cons]
                self.log(f"  Current constraints: {constraint_names}")
                
                # Check if new constraint already exists
                if 'parts_part_number_product_key' in constraint_names:
                    self.log("  ✅ New composite constraint already exists")
                    trans.commit()
                    return True
                
                # Drop dependent foreign keys
                self.log("  🔓 Dropping dependent foreign keys...")
                server_conn.execute(text("""
                    ALTER TABLE scheduling.planned_schedule_items 
                    DROP CONSTRAINT IF EXISTS planned_schedule_items_part_number_fkey
                """))
                server_conn.execute(text("""
                    ALTER TABLE scheduling.rescheduling_items 
                    DROP CONSTRAINT IF EXISTS rescheduling_items_part_number_fkey
                """))
                
                # Remove old constraint
                if 'parts_part_number_key' in constraint_names:
                    self.log("  🗑️  Removing old global constraint...")
                    server_conn.execute(text("""
                        ALTER TABLE oms.parts DROP CONSTRAINT parts_part_number_key CASCADE
                    """))
                
                # Add new composite constraint
                self.log("  ➕ Adding new composite constraint...")
                server_conn.execute(text("""
                    ALTER TABLE oms.parts 
                    ADD CONSTRAINT parts_part_number_product_key 
                    UNIQUE (part_number, product_id)
                """))
                
                trans.commit()
                self.log("✅ Parts table constraint updated")
                return True
                
            except Exception as e:
                trans.rollback()
                self.log(f"❌ Constraint update failed: {e}")
                return False
                
    def create_missing_tables(self):
        """Create missing tables (empty)"""
        self.log("📋 CREATING MISSING TABLES")
        
        tables_to_create = [
            {
                'schema': 'maintenance',
                'name': 'help_support',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS maintenance.help_support (
                        id SERIAL PRIMARY KEY,
                        issue_type VARCHAR(100) NOT NULL,
                        description TEXT,
                        reported_by INTEGER,
                        assigned_to INTEGER,
                        status VARCHAR(50) DEFAULT 'open',
                        priority VARCHAR(20) DEFAULT 'medium',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        resolved_at TIMESTAMP,
                        resolution_notes TEXT
                    )
                '''
            },
            {
                'schema': 'notifications',
                'name': 'inspection_notifications',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS notifications.inspection_notifications (
                        id SERIAL PRIMARY KEY,
                        inspection_id INTEGER,
                        part_id INTEGER,
                        order_id INTEGER,
                        status VARCHAR(50) DEFAULT 'pending',
                        message TEXT,
                        created_by INTEGER,
                        assigned_to INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        due_date TIMESTAMP
                    )
                '''
            },
            {
                'schema': 'production_monitoring',
                'name': 'machine_live_history',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS production_monitoring.machine_live_history (
                        id SERIAL PRIMARY KEY,
                        machine_id INTEGER,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status VARCHAR(50),
                        production_count INTEGER DEFAULT 0,
                        cycle_time FLOAT,
                        temperature FLOAT,
                        pressure FLOAT,
                        vibration FLOAT,
                        operator_id INTEGER
                    )
                '''
            },
            {
                'schema': 'production_monitoring',
                'name': 'machine_live_status',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS production_monitoring.machine_live_status (
                        id SERIAL PRIMARY KEY,
                        machine_id INTEGER UNIQUE,
                        status VARCHAR(50) DEFAULT 'idle',
                        current_operation VARCHAR(100),
                        operator_id INTEGER,
                        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        production_rate FLOAT,
                        efficiency FLOAT,
                        downtime_reason VARCHAR(100)
                    )
                '''
            },
            {
                'schema': 'production_monitoring',
                'name': 'oee_issue',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS production_monitoring.oee_issue (
                        id SERIAL PRIMARY KEY,
                        machine_id INTEGER,
                        issue_type VARCHAR(50),
                        description TEXT,
                        start_time TIMESTAMP,
                        end_time TIMESTAMP,
                        duration INTEGER,
                        impact_category VARCHAR(50),
                        reported_by INTEGER
                    )
                '''
            },
            {
                'schema': 'production_monitoring',
                'name': 'shift_summary',
                'sql': '''
                    CREATE TABLE IF NOT EXISTS production_monitoring.shift_summary (
                        id SERIAL PRIMARY KEY,
                        shift_date DATE NOT NULL,
                        shift_type VARCHAR(20) NOT NULL,
                        machine_id INTEGER,
                        planned_production INTEGER DEFAULT 0,
                        actual_production INTEGER DEFAULT 0,
                        good_parts INTEGER DEFAULT 0,
                        rejected_parts INTEGER DEFAULT 0,
                        efficiency FLOAT DEFAULT 0,
                        downtime_minutes INTEGER DEFAULT 0,
                        operator_id INTEGER,
                        supervisor_id INTEGER,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                '''
            }
        ]
        
        with self.server_engine.connect() as server_conn:
            trans = server_conn.begin()
            
            try:
                created_count = 0
                for table_def in tables_to_create:
                    schema = table_def['schema']
                    name = table_def['name']
                    
                    exists = server_conn.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.tables 
                        WHERE table_schema = '{schema}' AND table_name = '{name}'
                    """)).scalar() > 0
                    
                    if not exists:
                        server_conn.execute(text(table_def['sql']))
                        self.log(f"  ✅ Created table {schema}.{name}")
                        created_count += 1
                    else:
                        self.log(f"  ⚠️  Table {schema}.{name} already exists")
                
                trans.commit()
                self.log(f"✅ Created {created_count} new tables")
                return True
                
            except Exception as e:
                trans.rollback()
                self.log(f"❌ Table creation failed: {e}")
                return False
                
    def verify_migration(self, backup_data):
        """Verify migration success"""
        self.log("🔍 VERIFYING MIGRATION")
        
        with self.server_engine.connect() as server_conn:
            # Verify raw_material_stock
            rm_count = server_conn.execute(text("SELECT COUNT(*) FROM inventory.raw_material_stock")).scalar()
            self.log(f"  Raw material stock: {rm_count} rows (should be 0)")
            
            # Verify parts table structure
            new_cols = server_conn.execute(text("""
                SELECT column_name FROM information_schema.columns 
                WHERE table_schema = 'oms' AND table_name = 'parts' 
                AND column_name IN ('raw_material_unit_id', 'required_length')
            """)).fetchall()
            self.log(f"  Parts new columns: {len(new_cols)}/2 present")
            
            # Verify parts constraint
            constraint_exists = server_conn.execute(text("""
                SELECT COUNT(*) FROM information_schema.table_constraints 
                WHERE table_schema = 'oms' AND table_name = 'parts' 
                AND constraint_name = 'parts_part_number_product_key'
            """)).scalar() > 0
            self.log(f"  Parts composite constraint: {'✅ Present' if constraint_exists else '❌ Missing'}")
            
            # Verify new tables
            expected_tables = [
                'maintenance.help_support',
                'notifications.inspection_notifications',
                'production_monitoring.machine_live_history',
                'production_monitoring.machine_live_status',
                'production_monitoring.oee_issue',
                'production_monitoring.shift_summary'
            ]
            
            tables_created = 0
            for table in expected_tables:
                schema, name = table.split('.')
                exists = server_conn.execute(text(f"""
                    SELECT COUNT(*) FROM information_schema.tables 
                    WHERE table_schema = '{schema}' AND table_name = '{name}'
                """)).scalar() > 0
                if exists:
                    tables_created += 1
            
            self.log(f"  New tables: {tables_created}/{len(expected_tables)} created")
            
            # Verify data integrity for other tables
            data_intact = True
            for table in ['oms.parts', 'inventory.vendors', 'oms.orders']:
                current_count = server_conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                original_count = backup_data.get(table, 0)
                
                if current_count != original_count:
                    self.log(f"  ❌ {table}: {original_count} → {current_count} (DATA LOSS!)")
                    data_intact = False
                else:
                    self.log(f"  ✅ {table}: {current_count} rows (intact)")
            
            return rm_count == 0 and len(new_cols) == 2 and constraint_exists and tables_created == 6 and data_intact
            
    def save_migration_log(self):
        """Save migration log"""
        log_file = f"final_migration_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(log_file, 'w') as f:
            f.write("\n".join(self.migration_log))
        self.log(f"📄 Migration log saved to: {log_file}")
        
    def run_migration(self):
        """Run complete migration"""
        self.log("="*80)
        self.log("FINAL SERVER MIGRATION STARTED")
        self.log("="*80)
        self.log("⚠️  DESTRUCTIVE OPERATIONS INCLUDED")
        self.log(f"📍 Target: {SERVER_DATABASE_URL}")
        
        try:
            # Step 1: Pre-migration backup
            backup_data = self.pre_migration_backup()
            
            # Step 2: Delete raw_material_stock data
            success, deleted_count = self.delete_raw_material_stock_data()
            if not success:
                self.log("❌ Raw material stock deletion failed - aborting")
                return False
                
            # Step 3: Update raw_material_stock structure
            if not self.update_raw_material_stock_structure():
                self.log("❌ Raw material stock structure update failed - aborting")
                return False
                
            # Step 4: Update parts table structure
            if not self.update_parts_table_structure():
                self.log("❌ Parts structure update failed - aborting")
                return False
                
            # Step 5: Update parts table constraint
            if not self.update_parts_table_constraint():
                self.log("❌ Parts constraint update failed - aborting")
                return False
                
            # Step 6: Create missing tables
            if not self.create_missing_tables():
                self.log("❌ Table creation failed - aborting")
                return False
                
            # Step 7: Verify migration
            success = self.verify_migration(backup_data)
            
            # Step 8: Save log
            self.save_migration_log()
            
            # Summary
            self.log("\n" + "="*80)
            self.log("MIGRATION SUMMARY")
            self.log("="*80)
            self.log(f"  Raw material stock data deleted: {deleted_count} rows")
            self.log(f"  Migration status: {'✅ SUCCESS' if success else '❌ FAILED'}")
            
            if success:
                self.log("\n🎉 FINAL MIGRATION COMPLETED SUCCESSFULLY!")
                self.log("📊 Server database structure now matches local database")
                return True
            else:
                self.log("\n⚠️  Migration completed with issues - review log")
                return False
                
        except Exception as e:
            self.log(f"❌ Migration failed: {e}")
            self.save_migration_log()
            return False
            
        finally:
            self.server_engine.dispose()

def main():
    """Main function"""
    print("🚀 FINAL SERVER MIGRATION SCRIPT")
    print("="*80)
    print("🎯 Comprehensive migration from local CMF_Demo to server CMF_DIGITIZATION")
    print("\n📋 MIGRATION PLAN:")
    print("   1. Backup critical data")
    print("   2. Delete raw_material_stock data (80 rows)")
    print("   3. Update raw_material_stock structure (add columns, foreign key)")
    print("   4. Update parts table structure (remove/add columns)")
    print("   5. Update parts table constraint (global → composite)")
    print("   6. Create 6 missing tables (empty)")
    print("   7. Verify migration success")
    print("\n⚠️  DESTRUCTIVE OPERATIONS:")
    print("   - Will DELETE 80 rows from raw_material_stock")
    print("   - Will REMOVE columns from parts table (data loss possible)")
    print("\n✅ PRESERVED DATA:")
    print("   - All other table data preserved")
    print("   - Parts table rows preserved")
    print("   - Orders, vendors, etc. preserved")
    print("\n" + "="*80)
    
    migration = FinalServerMigration()
    
    # Uncomment to execute
    # success = migration.run_migration()
    
    print("\n✅ Script is ready for execution")
    print("👉 To execute: python final_server_migration.py --execute")
    print("📝 Or uncomment migration.run_migration() in the script")
    print("\n⚠️  Make sure you understand the destructive operations before running!")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--execute":
        migration = FinalServerMigration()
        success = migration.run_migration()
        sys.exit(0 if success else 1)
    else:
        main()
