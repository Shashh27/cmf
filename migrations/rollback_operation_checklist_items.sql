-- Rollback Migration: Remove operation_checklist_items table and checklist_item_id from submission_details
-- Description: Revert to simpler structure where each assignment IS a checklist item

-- Drop foreign key constraint for checklist_item_id
ALTER TABLE configuration.submission_details 
DROP CONSTRAINT IF EXISTS fk_submission_details_checklist_item;

-- Drop index on checklist_item_id
DROP INDEX IF EXISTS idx_submission_details_checklist_item_id;

-- Drop checklist_item_id column from submission_details table
ALTER TABLE configuration.submission_details 
DROP COLUMN IF EXISTS checklist_item_id;

-- Drop index on checklist_id
DROP INDEX IF EXISTS idx_operation_checklist_items_checklist_id;

-- Drop operation_checklist_items table
DROP TABLE IF EXISTS configuration.operation_checklist_items;
