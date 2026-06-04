-- Migration: Add Role-Based Acknowledgment to Order Notifications
-- Date: 2026-06-01
-- Description: Add role-specific acknowledgment fields to order_notifications table
--              to track which role (admin, pc, mc) acknowledged the notification
-- Note: This replaces the single ack_by/ack_at and is_ack fields with role-specific fields

-- Drop legacy ack_by and ack_at columns if they exist (they are being replaced)
ALTER TABLE notifications.order_notifications
DROP COLUMN IF EXISTS ack_by,
DROP COLUMN IF EXISTS ack_at;

-- Drop legacy is_ack column (being replaced by role-specific status fields)
ALTER TABLE notifications.order_notifications
DROP COLUMN IF EXISTS is_ack;

-- Add role-specific acknowledgment status columns
ALTER TABLE notifications.order_notifications
ADD COLUMN IF NOT EXISTS mc_is_ack BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS pc_is_ack BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN IF NOT EXISTS admin_is_ack BOOLEAN DEFAULT FALSE NOT NULL;

-- Add role-specific acknowledgment columns to order_notifications table
ALTER TABLE notifications.order_notifications
ADD COLUMN IF NOT EXISTS mc_ack_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS mc_ack_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS pc_ack_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS pc_ack_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS admin_ack_by VARCHAR(255),
ADD COLUMN IF NOT EXISTS admin_ack_at TIMESTAMP WITH TIME ZONE;

-- Add comments to document the new columns
COMMENT ON COLUMN notifications.order_notifications.mc_is_ack IS 'Whether Manufacturing Coordinator has acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.pc_is_ack IS 'Whether Project Coordinator has acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.admin_is_ack IS 'Whether Admin has acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.mc_ack_by IS 'Manufacturing Coordinator who acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.mc_ack_at IS 'Timestamp when Manufacturing Coordinator acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.pc_ack_by IS 'Project Coordinator who acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.pc_ack_at IS 'Timestamp when Project Coordinator acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.admin_ack_by IS 'Admin who acknowledged the notification';
COMMENT ON COLUMN notifications.order_notifications.admin_ack_at IS 'Timestamp when Admin acknowledged the notification';

-- Add index on acknowledgment timestamp columns for faster queries
CREATE INDEX IF NOT EXISTS idx_order_notifications_mc_ack_at 
ON notifications.order_notifications(mc_ack_at) 
WHERE mc_ack_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_notifications_pc_ack_at 
ON notifications.order_notifications(pc_ack_at) 
WHERE pc_ack_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_notifications_admin_ack_at 
ON notifications.order_notifications(admin_ack_at) 
WHERE admin_ack_at IS NOT NULL;
