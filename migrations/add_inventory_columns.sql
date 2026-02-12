-- Add purpose_of_use column to inventory_requests table
ALTER TABLE inventory.inventory_requests 
ADD COLUMN purpose_of_use TEXT;

-- Add remarks column to inventory_return_requests table  
ALTER TABLE inventory.inventory_return_requests 
ADD COLUMN remarks TEXT;

-- Add comments for documentation
COMMENT ON COLUMN inventory.inventory_requests.purpose_of_use IS 'Purpose for which the inventory item is requested';
COMMENT ON COLUMN inventory.inventory_return_requests.remarks IS 'Additional notes or comments about the return request';
