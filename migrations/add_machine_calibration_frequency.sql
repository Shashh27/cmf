-- Migration: Add calibration_frequency column to machines table
-- Date: 2024-06-16
-- Description: Adds calibration_frequency field to support dynamic calibration due date calculation

-- Add calibration_frequency column to machines table
ALTER TABLE configuration.machines 
ADD COLUMN IF NOT EXISTS calibration_frequency VARCHAR(50);

-- Add comment to describe the column
COMMENT ON COLUMN configuration.machines.calibration_frequency IS 'Calibration frequency interval (e.g., "6 months", "1 year", "2 years")';

-- Verification query
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'configuration' 
AND table_name = 'machines' 
AND column_name = 'calibration_frequency';
