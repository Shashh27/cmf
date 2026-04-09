-- Migration: Create and configure operation_status table
-- Description: Creates the operation_status table for tracking operation lifecycle
-- Version: 1.0

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS scheduling.operation_status (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES oms.orders(id),
    part_id INTEGER REFERENCES oms.parts(id),
    operation_id INTEGER REFERENCES oms.operations(id) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add unique constraint if not exists (operation_id should be unique)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_operation_status_operation_id'
    ) THEN
        ALTER TABLE scheduling.operation_status 
        ADD CONSTRAINT uq_operation_status_operation_id UNIQUE (operation_id);
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_operation_status_operation_id 
ON scheduling.operation_status(operation_id);

CREATE INDEX IF NOT EXISTS idx_operation_status_status 
ON scheduling.operation_status(status);

-- Add trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION scheduling.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_operation_status_updated_at 
    BEFORE UPDATE ON scheduling.operation_status 
    FOR EACH ROW EXECUTE FUNCTION scheduling.update_updated_at_column();

-- Insert any existing operations that don't have status entries
INSERT INTO scheduling.operation_status (order_id, part_id, operation_id, status)
SELECT DISTINCT 
    p.product_id as order_id,
    psi.part_id,
    psi.operation_id,
    'pending' as status
FROM scheduling.planned_schedule_items psi
JOIN oms.parts p ON psi.part_id = p.id
LEFT JOIN scheduling.operation_status os ON psi.operation_id = os.operation_id
WHERE os.operation_id IS NULL;

-- Output migration completion message
DO $$
BEGIN
    RAISE NOTICE 'Operation status table migration completed successfully';
    RAISE NOTICE 'Added % status entries for existing operations', 
        (SELECT COUNT(*) FROM scheduling.operation_status WHERE created_at = NOW());
END $$;
