-- Migration: Add project_coordinator_id, admin_id, manufacturing_coordinator_id to orders;
-- add user_id to order_documents, documents, operation_documents, assemblies, parts, operations.
-- Backfill existing data using access control user IDs: admin=16, project_coordinator=20, manufacturing_coordinator=32.
-- Run this against your PostgreSQL database.

-- Reference user IDs from access control (existing data backfill)
-- admin_id = 16, project_coordinator_id = 20, manufacturing_coordinator_id = 32

-- 1) Orders: add new columns (nullable first for existing rows)
ALTER TABLE oms.orders ADD COLUMN IF NOT EXISTS project_coordinator_id INTEGER REFERENCES accesscontrol.access_users(id);
ALTER TABLE oms.orders ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES accesscontrol.access_users(id);
ALTER TABLE oms.orders ADD COLUMN IF NOT EXISTS manufacturing_coordinator_id INTEGER REFERENCES accesscontrol.access_users(id);

-- Backfill existing orders with the given access control user IDs
UPDATE oms.orders SET admin_id = 16 WHERE admin_id IS NULL;
UPDATE oms.orders SET project_coordinator_id = 20 WHERE project_coordinator_id IS NULL;
UPDATE oms.orders SET manufacturing_coordinator_id = 32 WHERE manufacturing_coordinator_id IS NULL;

-- Enforce NOT NULL for admin_id (required)
ALTER TABLE oms.orders ALTER COLUMN admin_id SET NOT NULL;

-- Make user_id nullable (creator is optional)
ALTER TABLE oms.orders ALTER COLUMN user_id DROP NOT NULL;

-- 2) Order documents: add user_id (uploader), backfill existing with admin (16)
ALTER TABLE oms.order_documents ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.order_documents SET user_id = 16 WHERE user_id IS NULL;

-- 3) Part/Assembly documents: add user_id (uploader), backfill existing with admin (16)
ALTER TABLE oms.documents ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.documents SET user_id = 16 WHERE user_id IS NULL;

-- 4) Operation documents: add user_id (uploader), backfill existing with admin (16)
ALTER TABLE oms.operation_documents ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.operation_documents SET user_id = 16 WHERE user_id IS NULL;

-- 5) Assembly: add user_id, backfill existing with project_coordinator (20)
ALTER TABLE oms.assemblies ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.assemblies SET user_id = 20 WHERE user_id IS NULL;

-- 6) Part: add user_id, backfill existing with project_coordinator (20)
ALTER TABLE oms.parts ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.parts SET user_id = 20 WHERE user_id IS NULL;

-- 7) Operation: add user_id, backfill existing with manufacturing_coordinator (32)
ALTER TABLE oms.operations ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.operations SET user_id = 32 WHERE user_id IS NULL;

-- 8) Orders: drop legacy project_name column (no longer used)
ALTER TABLE oms.orders DROP COLUMN IF EXISTS project_name;

-- 9) Raw materials: add user_id (creator/owner), backfill with admin (16)
ALTER TABLE inventory.raw_materials ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE inventory.raw_materials SET user_id = 16 WHERE user_id IS NULL;

-- 10) Work centers: add user_id, backfill with admin (16)
ALTER TABLE configuration.work_centers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE configuration.work_centers SET user_id = 16 WHERE user_id IS NULL;

-- 11) Machines: add user_id, backfill with admin (16)
ALTER TABLE configuration.machines ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE configuration.machines SET user_id = 16 WHERE user_id IS NULL;

-- 12) Customers: add user_id, backfill with admin (16)
ALTER TABLE configuration.customers ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE configuration.customers SET user_id = 16 WHERE user_id IS NULL;

-- 13) Tool-with-part: add user_id (manufacturing coordinator responsible), backfill with 32
ALTER TABLE oms.tools_with_part ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.tools_with_part SET user_id = 32 WHERE user_id IS NULL;

-- 14) Order parts raw material linked: add user_id (manufacturing coordinator responsible), backfill with 32
ALTER TABLE oms.order_parts_raw_material_linked ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.order_parts_raw_material_linked SET user_id = 32 WHERE user_id IS NULL;

-- 15) Part types: add user_id (admin), backfill with admin (16)
ALTER TABLE oms.part_types ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES accesscontrol.access_users(id);
UPDATE oms.part_types SET user_id = 16 WHERE user_id IS NULL;
