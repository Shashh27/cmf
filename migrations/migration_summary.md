# Database Migration Summary

## Migration Date: 2024-06-16

## New Migration: Machine Calibration Frequency

### Table Modified:

#### 1. configuration.machines
- **Status**: ✅ Schema defined
- **Purpose**: Add calibration_frequency field to support dynamic calibration due date calculation
- **Column Added**:
  - calibration_frequency (VARCHAR(50), nullable) - Calibration frequency interval (e.g., "6 months", "1 year", "2 years")
- **Migration File**: `migrations/add_machine_calibration_frequency.sql`
- **Status**: ✅ SQL script created, ready to execute

### Next Steps:
1. **Execute migration SQL** on the database
2. **Verify column addition** with verification commands below
3. **Test calibration date auto-calculation** with new frequency field

### Verification Commands:

```sql
-- Check calibration_frequency column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'configuration'
AND table_name = 'machines'
AND column_name = 'calibration_frequency';

-- Check column comment
SELECT pg_description.obj_description(obj_oid, 'pg_class') as table_comment,
       pg_description.obj_description(obj_sub_id, 'pg_attribute') as column_comment
FROM pg_description
JOIN pg_class ON pg_description.obj_oid = pg_class.oid
JOIN pg_attribute ON pg_description.obj_sub_id = pg_attribute.attnum
WHERE pg_class.relname = 'machines'
AND pg_attribute.attname = 'calibration_frequency';
```

---

## Migration Date: 2026-05-23

## New Migration: PC Notification System

### Tables Added:

#### 1. notifications.activity_log
- **Status**: ✅ Schema defined
- **Purpose**: Tracks all changes across the system for audit trail and notifications
- **Columns**:
  - id (SERIAL PRIMARY KEY)
  - entity_type (VARCHAR(50) NOT NULL) - Type of entity (part, operation, document, assembly, etc.)
  - entity_id (INTEGER NOT NULL) - ID of the entity that changed
  - action (VARCHAR(50) NOT NULL) - Action performed (created, updated, deleted, soft_deleted, restored, schedule_activated, etc.)
  - order_id (INTEGER) - Related order ID if applicable
  - user_id (INTEGER) - User who made the change
  - user_name (VARCHAR(255)) - Cached user name for performance
  - timestamp (TIMESTAMP WITH TIME ZONE NOT NULL) - When the change occurred
  - details (JSONB) - Additional details as JSON (field changes, old values, new values)
  - created_at (TIMESTAMP WITH TIME ZONE NOT NULL) - Record creation time
- **Indexes**:
  - idx_activity_log_entity_type
  - idx_activity_log_entity_id
  - idx_activity_log_action
  - idx_activity_log_order_id
  - idx_activity_log_timestamp (DESC)
  - idx_activity_log_user_id
- **Foreign Keys**:
  - fk_activity_log_order_id → oms.orders(id) ON DELETE SET NULL
  - fk_activity_log_user_id → accesscontrol.access_users(id) ON DELETE SET NULL

#### 2. notifications.pc_notifications
- **Status**: ✅ Schema defined
- **Purpose**: Links activity logs to Project Coordinators for notifications
- **Columns**:
  - id (SERIAL PRIMARY KEY)
  - activity_log_id (INTEGER NOT NULL) - Reference to activity log
  - pc_user_id (INTEGER NOT NULL) - Project Coordinator user to notify
  - is_read (BOOLEAN NOT NULL DEFAULT FALSE) - Read status
  - read_at (TIMESTAMP WITH TIME ZONE) - When notification was read
  - created_at (TIMESTAMP WITH TIME ZONE NOT NULL) - Notification creation time
- **Indexes**:
  - idx_pc_notifications_activity_log_id
  - idx_pc_notifications_pc_user_id
  - idx_pc_notifications_is_read
  - idx_pc_notifications_created_at (DESC)
- **Foreign Keys**:
  - fk_pc_notifications_activity_log_id → notifications.activity_log(id) ON DELETE CASCADE
  - fk_pc_notifications_pc_user_id → accesscontrol.access_users(id) ON DELETE CASCADE

### Migration File:
- **File**: `migrations/add_pc_notification_system.sql`
- **Status**: ✅ SQL script created, ready to execute

### Next Steps:
1. **Execute migration SQL** on the database
2. **Verify table creation** with verification commands below
3. **Test foreign key constraints**
4. **Proceed to Phase 2**: Create NotificationService

### Verification Commands:

```sql
-- Check activity_log table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'notifications' 
AND table_name = 'activity_log';

-- Check pc_notifications table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'notifications' 
AND table_name = 'pc_notifications';

-- Check activity_log columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'notifications' 
AND table_name = 'activity_log'
ORDER BY ordinal_position;

-- Check pc_notifications columns
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'notifications' 
AND table_name = 'pc_notifications'
ORDER BY ordinal_position;

-- Check indexes on activity_log
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'notifications' 
AND tablename = 'activity_log';

-- Check indexes on pc_notifications
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'notifications' 
AND tablename = 'pc_notifications';

-- Check foreign keys
SELECT
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_schema = 'notifications'
    AND tc.constraint_type = 'FOREIGN KEY';
```

---

## Previous Migrations

## Migration Date: 2025-03-31

## Tables Migrated:

### 1. inventory.vendors
- **Status**: ✅ Already exists and populated
- **Records**: 101 vendors
- **Columns**: id, company_name, created_at, updated_at
- **Data**: Successfully populated with vendor company names

### 2. oms.order_parts_raw_material_linked
- **Status**: ✅ Successfully migrated
- **Added Columns**:
  - `is_procurement` (boolean, default: FALSE)
  - `procurement_quantity` (integer, nullable)
  - `procurement_weight` (double precision, nullable)
  - `procurement_status` (character varying, default: 'pending')

### 3. oms.parts
- **Status**: ✅ Successfully migrated (2025-04-13)
- **Removed Columns**:
  - `size` (character varying, nullable) - Deprecated field

## Migration Actions Performed:

1. **Verified vendors table exists** with 101 vendor records
2. **Added missing procurement columns** to order_parts_raw_material_linked table
3. **Established vendor relationship** through vendor_id foreign key (already existed)
4. **Set default values** for new columns to maintain data integrity
5. **Removed size column** from parts table as it was deprecated from the data model

## Next Steps:

1. **Update application logic** to handle new procurement fields
2. **Test vendor assignment** functionality
3. **Verify data integrity** with existing orders
4. **Update API endpoints** to expose new procurement fields
5. **Verify size field removal** doesn't break existing functionality

## Verification Commands:

```sql
-- Check vendors count
SELECT COUNT(*) FROM inventory.vendors;

-- Check new columns in order_parts_raw_material_linked
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'oms' 
AND table_name = 'order_parts_raw_material_linked'
AND column_name IN ('is_procurement', 'procurement_quantity', 'procurement_weight', 'procurement_status');

-- Check procurement records
SELECT COUNT(*) FROM oms.order_parts_raw_material_linked WHERE is_procurement = TRUE;

-- Verify size column has been removed from parts table
SELECT column_name 
FROM information_schema.columns 
WHERE table_schema = 'oms' 
  AND table_name = 'parts' 
  AND column_name = 'size';
-- Should return no rows if size column was successfully removed
```

## Notes:

- All migrations were performed with proper transaction handling
- Foreign key relationships maintained
- Default values set to prevent data integrity issues
- No data loss occurred during migration
- Size field was safely removed as it was no longer used in the application
