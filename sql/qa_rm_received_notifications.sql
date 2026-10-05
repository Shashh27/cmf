-- Quality Assurance: notifications when order raw material status becomes received
CREATE TABLE IF NOT EXISTS notifications.qa_rm_received_notifications (
    id SERIAL PRIMARY KEY,
    stock_id INTEGER NOT NULL REFERENCES inventory.raw_material_stock(id) ON DELETE CASCADE,
    order_id INTEGER NULL REFERENCES oms.orders(id) ON DELETE SET NULL,
    material_id INTEGER NULL,
    material_name VARCHAR NULL,
    sale_order_number VARCHAR NULL,
    product_name VARCHAR NULL,
    quantity INTEGER NULL,
    is_ack BOOLEAN NOT NULL DEFAULT FALSE,
    ack_by VARCHAR NULL,
    ack_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_qa_rm_received_notifications_stock_id
    ON notifications.qa_rm_received_notifications (stock_id);
CREATE INDEX IF NOT EXISTS ix_qa_rm_received_notifications_order_id
    ON notifications.qa_rm_received_notifications (order_id);
CREATE INDEX IF NOT EXISTS ix_qa_rm_received_notifications_is_ack
    ON notifications.qa_rm_received_notifications (is_ack);
CREATE INDEX IF NOT EXISTS ix_qa_rm_received_notifications_created_at
    ON notifications.qa_rm_received_notifications (created_at);
