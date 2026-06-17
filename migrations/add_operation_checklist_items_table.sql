-- Migration: Add operation_checklist_items table and update submission_details
-- Description: Support multiple checklist items per checklist for proper response tracking

-- Create operation_checklist_items table
CREATE TABLE IF NOT EXISTS configuration.operation_checklist_items (
    id SERIAL PRIMARY KEY,
    checklist_id INTEGER NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    sequence_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_checklist_items_checklist 
        FOREIGN KEY (checklist_id) 
        REFERENCES configuration.operation_checklists(id) 
        ON DELETE CASCADE
);

-- Add checklist_item_id column to submission_details table
ALTER TABLE configuration.submission_details 
ADD COLUMN IF NOT EXISTS checklist_item_id INTEGER;

-- Add foreign key constraint for checklist_item_id
ALTER TABLE configuration.submission_details 
ADD CONSTRAINT fk_submission_details_checklist_item 
    FOREIGN KEY (checklist_item_id) 
    REFERENCES configuration.operation_checklist_items(id) 
    ON DELETE CASCADE;

-- Create index on checklist_id for faster queries
CREATE INDEX IF NOT EXISTS idx_operation_checklist_items_checklist_id 
    ON configuration.operation_checklist_items(checklist_id);

-- Create index on checklist_item_id in submission_details for faster queries
CREATE INDEX IF NOT EXISTS idx_submission_details_checklist_item_id 
    ON configuration.submission_details(checklist_item_id);

-- Add comment to tables
COMMENT ON TABLE configuration.operation_checklist_items IS 'Stores individual items within an operation checklist';
COMMENT ON COLUMN configuration.operation_checklist_items.item_name IS 'Name/description of the checklist item';
COMMENT ON COLUMN configuration.operation_checklist_items.sequence_number IS 'Order in which the item should be displayed';
COMMENT ON COLUMN configuration.submission_details.checklist_item_id IS 'Foreign key to the specific checklist item being responded to';
