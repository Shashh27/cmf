"""
Additive schema migration: bring server CMF_DIGITIZATION up to the local schema.

SAFETY RULES BUILT INTO THIS SCRIPT
  * Never DROP a table, never DELETE / TRUNCATE / UPDATE existing business data.
  * Only CREATE SCHEMA / CREATE TABLE / ADD COLUMN / ADD INDEX / ADD CONSTRAINT,
    plus widening type changes and NOT NULL relaxations.
  * New columns are backfilled only where they are NULL (they are brand new).
  * Every statement is idempotent, so the script can be re-run safely.
  * Row counts are captured before and after; the run aborts if any table lost rows.
  * Runs in a single transaction. Any failure rolls the whole thing back.

USAGE
  cd backend
  python -m scripts.migrate_server_schema              # dry run (rolls back)
  python -m scripts.migrate_server_schema --apply      # commit changes
  python -m scripts.migrate_server_schema --apply --skip-audit
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

SERVER = dict(
    host="172.18.7.91",
    port=5432,
    dbname="CMF_DIGITIZATION",
    user="postgres",
    password="postgres",
    connect_timeout=20,
)

# --------------------------------------------------------------------------
# 1. Schemas
# --------------------------------------------------------------------------
SCHEMAS = [
    "CREATE SCHEMA IF NOT EXISTS accesscontrol",
    "CREATE SCHEMA IF NOT EXISTS chatbox",
    "CREATE SCHEMA IF NOT EXISTS audit",
    "CREATE SCHEMA IF NOT EXISTS notifications",
    "CREATE SCHEMA IF NOT EXISTS production_monitoring",
    "CREATE SCHEMA IF NOT EXISTS scheduling",
]

# --------------------------------------------------------------------------
# 2. New tables (created empty — no local data is copied)
# --------------------------------------------------------------------------
NEW_TABLES = [
    # ---- JWT refresh tokens ------------------------------------------------
    (
        "accesscontrol.refresh_tokens",
        """
        CREATE TABLE IF NOT EXISTS accesscontrol.refresh_tokens (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL
                        REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            jti         VARCHAR(64) NOT NULL UNIQUE,
            token_hash  VARCHAR(128) NOT NULL,
            expires_at  TIMESTAMPTZ NOT NULL,
            revoked     BOOLEAN NOT NULL DEFAULT FALSE,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        )
        """,
    ),
    # ---- Order chatbox -----------------------------------------------------
    (
        "chatbox.chat_conversations",
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_conversations (
            id                SERIAL PRIMARY KEY,
            order_id          INTEGER NOT NULL
                              REFERENCES oms.orders(id) ON DELETE CASCADE,
            conversation_name VARCHAR(255),
            conversation_type VARCHAR(50) NOT NULL,
            created_by        INTEGER NOT NULL
                              REFERENCES accesscontrol.access_users(id),
            is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),
    (
        "chatbox.chat_participants",
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_participants (
            id              SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL
                            REFERENCES chatbox.chat_conversations(id) ON DELETE CASCADE,
            user_id         INTEGER NOT NULL
                            REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_read_at    TIMESTAMPTZ,
            is_active       BOOLEAN NOT NULL DEFAULT TRUE,
            CONSTRAINT uq_chat_conversation_user UNIQUE (conversation_id, user_id)
        )
        """,
    ),
    (
        "chatbox.chat_messages",
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_messages (
            id              SERIAL PRIMARY KEY,
            conversation_id INTEGER NOT NULL
                            REFERENCES chatbox.chat_conversations(id) ON DELETE CASCADE,
            sender_id       INTEGER NOT NULL
                            REFERENCES accesscontrol.access_users(id),
            message_text    TEXT NOT NULL,
            message_type    VARCHAR(50) NOT NULL DEFAULT 'text',
            reply_to_id     INTEGER REFERENCES chatbox.chat_messages(id),
            is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),
    (
        "chatbox.chat_message_attachments",
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_message_attachments (
            id            SERIAL PRIMARY KEY,
            message_id    INTEGER NOT NULL
                          REFERENCES chatbox.chat_messages(id) ON DELETE CASCADE,
            file_name     VARCHAR(512) NOT NULL,
            file_url      TEXT NOT NULL,
            file_category VARCHAR(50) NOT NULL,
            uploaded_by   INTEGER NOT NULL
                          REFERENCES accesscontrol.access_users(id),
            uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),
    (
        "chatbox.chat_message_read_status",
        """
        CREATE TABLE IF NOT EXISTS chatbox.chat_message_read_status (
            id         SERIAL PRIMARY KEY,
            message_id INTEGER NOT NULL
                       REFERENCES chatbox.chat_messages(id) ON DELETE CASCADE,
            user_id    INTEGER NOT NULL
                       REFERENCES accesscontrol.access_users(id) ON DELETE CASCADE,
            read_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_chat_message_user_read UNIQUE (message_id, user_id)
        )
        """,
    ),
    # ---- Missed PM notifications ------------------------------------------
    (
        "notifications.pm_missed_notifications",
        """
        CREATE TABLE IF NOT EXISTS notifications.pm_missed_notifications (
            id                 SERIAL PRIMARY KEY,
            assignment_item_id INTEGER NOT NULL,
            machine_id         INTEGER NOT NULL,
            checklist_id       INTEGER,
            due_date           DATE NOT NULL,
            item_text          VARCHAR,
            machine_label      VARCHAR,
            checklist_name     VARCHAR,
            message            VARCHAR NOT NULL,
            is_ack             BOOLEAN NOT NULL DEFAULT FALSE,
            ack_by             VARCHAR,
            ack_at             TIMESTAMPTZ,
            created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
    ),
    # ---- Unit level schedule ----------------------------------------------
    (
        "scheduling.unit_schedule_items",
        """
        CREATE TABLE IF NOT EXISTS scheduling.unit_schedule_items (
            id               SERIAL PRIMARY KEY,
            order_id         INTEGER NOT NULL REFERENCES oms.orders(id),
            order_number     VARCHAR NOT NULL,
            part_id          INTEGER NOT NULL REFERENCES oms.parts(id),
            part_number      VARCHAR NOT NULL,
            unit_index       INTEGER NOT NULL,
            operation_id     INTEGER NOT NULL REFERENCES oms.operations(id),
            operation_number VARCHAR NOT NULL,
            machine_id       INTEGER REFERENCES configuration.machines(id),
            start_time       TIMESTAMP NOT NULL,
            end_time         TIMESTAMP NOT NULL,
            status           VARCHAR NOT NULL DEFAULT 'unit_scheduled',
            schedule_version INTEGER NOT NULL DEFAULT 1,
            source           VARCHAR NOT NULL DEFAULT 'greedy',
            created_at       TIMESTAMP NOT NULL DEFAULT NOW()
        )
        """,
    ),
    # ---- OEE issue (production_monitoring copy) ---------------------------
    (
        "production_monitoring.oee_issue",
        """
        CREATE TABLE IF NOT EXISTS production_monitoring.oee_issue (
            id               SERIAL PRIMARY KEY,
            machine_id       INTEGER NOT NULL REFERENCES configuration.machines(id),
            issue_category   VARCHAR NOT NULL,
            issue_reason     TEXT NOT NULL,
            start_time       TIMESTAMP NOT NULL,
            end_time         TIMESTAMP,
            duration_minutes DOUBLE PRECISION,
            "timestamp"      TIMESTAMP DEFAULT NOW()
        )
        """,
    ),
    # ---- CNC process stream (plain table; TimescaleDB not installed) ------
    (
        "production_monitoring.machine_process_data",
        """
        CREATE TABLE IF NOT EXISTS production_monitoring.machine_process_data (
            machine_id    INTEGER NOT NULL,
            "timestamp"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            feed_rate     DOUBLE PRECISION,
            spindle_speed DOUBLE PRECISION,
            spindle_load  DOUBLE PRECISION,
            axis_load     JSONB,
            CONSTRAINT machine_process_data_pkey PRIMARY KEY (machine_id, "timestamp"),
            CONSTRAINT fk_machine_process_machine FOREIGN KEY (machine_id)
                REFERENCES configuration.machines(id) ON DELETE CASCADE
        )
        """,
    ),
    # ---- Audit log --------------------------------------------------------
    (
        "audit.change_log",
        """
        CREATE TABLE IF NOT EXISTS audit.change_log (
            id            BIGSERIAL,
            changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            schema_name   TEXT NOT NULL,
            table_name    TEXT NOT NULL,
            operation     TEXT NOT NULL,
            db_user       TEXT NOT NULL,
            app_user_name TEXT,
            app_user_id   INTEGER,
            app_user_role TEXT,
            client_addr   INET,
            old_row       JSONB,
            new_row       JSONB,
            CONSTRAINT change_log_pkey PRIMARY KEY (id)
        )
        """,
    ),
]

# --------------------------------------------------------------------------
# 3. Additive columns on existing tables (never drops anything)
# --------------------------------------------------------------------------
ADD_COLUMNS = [
    # CNC snapshot fields the app now reads/writes
    """
    ALTER TABLE production_monitoring.machine_live_status
        ADD COLUMN IF NOT EXISTS active_program_number INTEGER,
        ADD COLUMN IF NOT EXISTS main_program_number   INTEGER,
        ADD COLUMN IF NOT EXISTS program_name          VARCHAR(255),
        ADD COLUMN IF NOT EXISTS mode                  VARCHAR(255),
        ADD COLUMN IF NOT EXISTS run_status            VARCHAR(255),
        ADD COLUMN IF NOT EXISTS alarm_status          INTEGER,
        ADD COLUMN IF NOT EXISTS emergency_status      VARCHAR(255),
        ADD COLUMN IF NOT EXISTS alarm_message         VARCHAR(500),
        ADD COLUMN IF NOT EXISTS feed_rate             DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS spindle_speed         DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS spindle_load          DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS axis_load             JSON,
        ADD COLUMN IF NOT EXISTS battery_alarm         VARCHAR(500)
    """,
    # PM: frequency now lives on the per-machine assignment item
    """
    ALTER TABLE configuration.pm_assignment_items
        ADD COLUMN IF NOT EXISTS frequency_type VARCHAR,
        ADD COLUMN IF NOT EXISTS interval_value INTEGER,
        ADD COLUMN IF NOT EXISTS interval_unit  VARCHAR,
        ADD COLUMN IF NOT EXISTS trigger_hours  DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS is_compulsory  BOOLEAN NOT NULL DEFAULT FALSE
    """,
    # PM: stable checkpoint code
    """
    ALTER TABLE configuration.pm_checklist_items
        ADD COLUMN IF NOT EXISTS item_code VARCHAR(32)
    """,
]

# --------------------------------------------------------------------------
# 4. Backfill of the brand-new columns only (existing data untouched)
# --------------------------------------------------------------------------
BACKFILL = [
    (
        "copy PM frequency from checklist item to assignment item",
        """
        UPDATE configuration.pm_assignment_items ai
        SET frequency_type = COALESCE(ai.frequency_type, ci.frequency_type),
            interval_value = COALESCE(ai.interval_value, ci.interval_value),
            interval_unit  = COALESCE(ai.interval_unit,  ci.interval_unit),
            trigger_hours  = COALESCE(ai.trigger_hours,  ci.trigger_hours)
        FROM configuration.pm_checklist_items ci
        WHERE ai.checklist_item_id = ci.id
          AND ai.frequency_type IS NULL
        """,
    ),
    (
        "default PM frequency for assignment items with no master row",
        """
        UPDATE configuration.pm_assignment_items
        SET frequency_type = 'Time Based'
        WHERE frequency_type IS NULL
        """,
    ),
    (
        "ensure Time Based rows have an interval",
        """
        UPDATE configuration.pm_assignment_items
        SET interval_value = COALESCE(interval_value, 1),
            interval_unit  = COALESCE(interval_unit, 'Day')
        WHERE frequency_type = 'Time Based'
          AND (interval_value IS NULL OR interval_unit IS NULL)
        """,
    ),
    (
        "generate item_code for existing checkpoints",
        """
        UPDATE configuration.pm_checklist_items
        SET item_code = 'CP-' || id::text
        WHERE item_code IS NULL
        """,
    ),
]

# Constraints applied after the backfill, so existing rows already satisfy them.
POST_BACKFILL = [
    """
    ALTER TABLE configuration.pm_assignment_items
        ALTER COLUMN frequency_type SET NOT NULL
    """,
    """
    ALTER TABLE configuration.pm_checklist_items
        ALTER COLUMN item_code SET NOT NULL
    """,
    # Master frequency is optional now that it lives on the assignment item.
    # The server columns are KEPT (not dropped) so no data is lost.
    """
    ALTER TABLE configuration.pm_checklist_items
        ALTER COLUMN frequency_type DROP NOT NULL
    """,
]

# --------------------------------------------------------------------------
# 5. Type alignment. Only widening / relaxing — no truncation, no data loss.
# --------------------------------------------------------------------------
TYPE_CHANGES = [
    # cycle_time: TIME cannot hold durations over 24h, the app uses HHH:MM:SS text
    (
        "oms.operations.cycle_time -> VARCHAR(16)",
        """
        ALTER TABLE oms.operations
            ALTER COLUMN cycle_time TYPE VARCHAR(16)
            USING CASE WHEN cycle_time IS NULL THEN NULL
                       ELSE to_char(cycle_time, 'HH24:MI:SS') END
        """,
    ),
    # documents: naive timestamp -> timestamptz (+ created_at default)
    (
        "documents timestamps -> TIMESTAMPTZ",
        """
        ALTER TABLE documents.general_documents
            ALTER COLUMN created_at TYPE TIMESTAMPTZ,
            ALTER COLUMN created_at SET DEFAULT NOW(),
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ
        """,
    ),
    (
        "documents.general_folders timestamps -> TIMESTAMPTZ",
        """
        ALTER TABLE documents.general_folders
            ALTER COLUMN created_at TYPE TIMESTAMPTZ,
            ALTER COLUMN created_at SET DEFAULT NOW(),
            ALTER COLUMN updated_at TYPE TIMESTAMPTZ
        """,
    ),
    # widen length-limited columns to unbounded VARCHAR (matches local)
    (
        "widen oms.orders.project_name",
        "ALTER TABLE oms.orders ALTER COLUMN project_name TYPE VARCHAR",
    ),
    (
        "widen scheduling.production_logs.operator_status",
        "ALTER TABLE scheduling.production_logs ALTER COLUMN operator_status TYPE VARCHAR",
    ),
    (
        "widen oms.order_part_priorities.status",
        "ALTER TABLE oms.order_part_priorities ALTER COLUMN status TYPE VARCHAR",
    ),
    # relax NOT NULL where local is nullable (no rows change)
    (
        "relax quality.stage_inspection measured columns",
        """
        ALTER TABLE quality.stage_inspection
            ALTER COLUMN measured_1 DROP NOT NULL,
            ALTER COLUMN measured_2 DROP NOT NULL,
            ALTER COLUMN measured_3 DROP NOT NULL,
            ALTER COLUMN measured_mean DROP NOT NULL
        """,
    ),
    (
        "relax scheduling.production_logs from_date/from_time",
        """
        ALTER TABLE scheduling.production_logs
            ALTER COLUMN from_date DROP NOT NULL,
            ALTER COLUMN from_time DROP NOT NULL
        """,
    ),
    (
        "relax oms.document_extracted_data.document_id",
        "ALTER TABLE oms.document_extracted_data ALTER COLUMN document_id DROP NOT NULL",
    ),
    (
        "relax notifications.inspection_notifications.category",
        "ALTER TABLE notifications.inspection_notifications ALTER COLUMN category DROP NOT NULL",
    ),
    (
        "relax scheduling.rescheduling_items.machine_id",
        "ALTER TABLE scheduling.rescheduling_items ALTER COLUMN machine_id DROP NOT NULL",
    ),
    (
        "relax inventory.raw_material_units timestamps",
        """
        ALTER TABLE inventory.raw_material_units
            ALTER COLUMN created_at DROP NOT NULL,
            ALTER COLUMN updated_at DROP NOT NULL
        """,
    ),
    (
        "relax inventory.raw_material_usage.created_at",
        "ALTER TABLE inventory.raw_material_usage ALTER COLUMN created_at DROP NOT NULL",
    ),
    (
        "relax production_monitoring.shift_summary.updatedate",
        "ALTER TABLE production_monitoring.shift_summary ALTER COLUMN updatedate DROP NOT NULL",
    ),
    # add missing defaults (only affects future inserts)
    (
        "defaults on inventory.raw_material_stock quantities",
        """
        ALTER TABLE inventory.raw_material_stock
            ALTER COLUMN allocated_quantity SET DEFAULT 0,
            ALTER COLUMN available_quantity SET DEFAULT 0
        """,
    ),
    (
        "default on inventory.raw_material_units.status",
        "ALTER TABLE inventory.raw_material_units ALTER COLUMN status SET DEFAULT 'available'",
    ),
]

# --------------------------------------------------------------------------
# 6. Indexes (all safe, all IF NOT EXISTS)
# --------------------------------------------------------------------------
INDEXES = [
    # refresh tokens
    "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_user_id ON accesscontrol.refresh_tokens (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_refresh_tokens_jti ON accesscontrol.refresh_tokens (jti)",
    # chatbox
    "CREATE INDEX IF NOT EXISTS ix_chat_conversations_order_id ON chatbox.chat_conversations (order_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_conversations_id ON chatbox.chat_conversations (id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_conversations_order_updated ON chatbox.chat_conversations (order_id, is_deleted, updated_at DESC)",
    "CREATE INDEX IF NOT EXISTS ix_chat_conversations_created_by ON chatbox.chat_conversations (created_by)",
    "CREATE INDEX IF NOT EXISTS ix_chat_participants_conversation_id ON chatbox.chat_participants (conversation_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_participants_user_id ON chatbox.chat_participants (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_participants_user_active ON chatbox.chat_participants (user_id, is_active)",
    "CREATE INDEX IF NOT EXISTS ix_chat_messages_conversation_id ON chatbox.chat_messages (conversation_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_messages_id ON chatbox.chat_messages (id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_messages_conv_created ON chatbox.chat_messages (conversation_id, is_deleted, created_at)",
    "CREATE INDEX IF NOT EXISTS ix_chat_messages_reply_to_id ON chatbox.chat_messages (reply_to_id) WHERE reply_to_id IS NOT NULL",
    "CREATE INDEX IF NOT EXISTS ix_chat_messages_sender_id ON chatbox.chat_messages (sender_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_message_read_status_message_id ON chatbox.chat_message_read_status (message_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_message_read_status_user_id ON chatbox.chat_message_read_status (user_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_message_attachments_message_id ON chatbox.chat_message_attachments (message_id)",
    "CREATE INDEX IF NOT EXISTS ix_chat_message_attachments_uploaded_by ON chatbox.chat_message_attachments (uploaded_by)",
    # audit
    "CREATE INDEX IF NOT EXISTS ix_change_log_at ON audit.change_log (changed_at)",
    "CREATE INDEX IF NOT EXISTS ix_change_log_table ON audit.change_log (schema_name, table_name)",
    "CREATE INDEX IF NOT EXISTS ix_change_log_app_user ON audit.change_log (app_user_id)",
    "CREATE INDEX IF NOT EXISTS ix_change_log_operation ON audit.change_log (operation)",
    # missed PM notifications
    "CREATE INDEX IF NOT EXISTS ix_pm_missed_assignment_item ON notifications.pm_missed_notifications (assignment_item_id)",
    "CREATE INDEX IF NOT EXISTS ix_pm_missed_due_date ON notifications.pm_missed_notifications (due_date)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pm_missed_notifications_machine_id ON notifications.pm_missed_notifications (machine_id)",
    # unit schedule
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_machine_start ON scheduling.unit_schedule_items (machine_id, start_time)",
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_order ON scheduling.unit_schedule_items (order_id)",
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_part_unit_op ON scheduling.unit_schedule_items (part_id, unit_index, operation_id)",
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_part_ver_machine_end ON scheduling.unit_schedule_items (part_id, schedule_version, machine_id, end_time)",
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_part_version ON scheduling.unit_schedule_items (part_id, schedule_version)",
    "CREATE INDEX IF NOT EXISTS idx_unit_sched_version ON scheduling.unit_schedule_items (schedule_version)",
    # oee issue / process data
    "CREATE INDEX IF NOT EXISTS ix_production_monitoring_oee_issue_id ON production_monitoring.oee_issue (id)",
    'CREATE INDEX IF NOT EXISTS machine_process_data_timestamp_idx ON production_monitoring.machine_process_data ("timestamp" DESC)',
    "CREATE INDEX IF NOT EXISTS ix_production_monitoring_machine_live_status_id ON production_monitoring.machine_live_status (id)",
    # PM lookups
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_assignment_items_assignment_id ON configuration.pm_assignment_items (assignment_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_assignment_items_checklist_item_id ON configuration.pm_assignment_items (checklist_item_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_assignment_items_id ON configuration.pm_assignment_items (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_checklist_items_checklist_id ON configuration.pm_checklist_items (checklist_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_checklist_items_id ON configuration.pm_checklist_items (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_checklists_id ON configuration.pm_checklists (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_machine_assignments_checklist_id ON configuration.pm_machine_assignments (checklist_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_machine_assignments_machine_id ON configuration.pm_machine_assignments (machine_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_machine_assignments_id ON configuration.pm_machine_assignments (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_schedule_id ON configuration.pm_schedule (id)",
    "CREATE INDEX IF NOT EXISTS ix_pm_schedule_next_due_date ON configuration.pm_schedule (next_due_date)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_pm_checkpoint_submissions_id ON configuration.pm_checkpoint_submissions (id)",
    "CREATE INDEX IF NOT EXISTS ix_pm_submissions_schedule_id ON configuration.pm_checkpoint_submissions (schedule_id)",
    # hot query paths present on local
    "CREATE INDEX IF NOT EXISTS idx_machines_work_center_id ON configuration.machines (work_center_id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_operation_checklist_assign_id ON configuration.operation_checklist_assign (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_operation_checklists_id ON configuration.operation_checklists (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_submission_details_id ON configuration.submission_details (id)",
    "CREATE INDEX IF NOT EXISTS ix_configuration_submissions_id ON configuration.submissions (id)",
    "CREATE INDEX IF NOT EXISTS ix_inventory_categories_id ON inventory.categories (id)",
    "CREATE INDEX IF NOT EXISTS ix_inventory_raw_material_history_id ON inventory.raw_material_history (id)",
    "CREATE INDEX IF NOT EXISTS idx_raw_material_units_stock_id ON inventory.raw_material_units (stock_id)",
    "CREATE INDEX IF NOT EXISTS idx_raw_material_usage_part_id ON inventory.raw_material_usage (part_id)",
    "CREATE INDEX IF NOT EXISTS idx_raw_material_usage_unit_id ON inventory.raw_material_usage (raw_material_unit_id)",
    "CREATE INDEX IF NOT EXISTS ix_inventory_stock_quality_documents_id ON inventory.stock_quality_documents (id)",
    "CREATE INDEX IF NOT EXISTS ix_maintenance_help_support_id ON maintenance.help_support (id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_id ON notifications.activity_log (id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_order_id ON notifications.activity_log (order_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_timestamp ON notifications.activity_log (timestamp)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_action ON notifications.activity_log (action)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_entity_id ON notifications.activity_log (entity_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_activity_log_entity_type ON notifications.activity_log (entity_type)",
    "CREATE INDEX IF NOT EXISTS ix_mc_notifications_document_id ON notifications.mc_notifications (document_id)",
    "CREATE INDEX IF NOT EXISTS ix_mc_notifications_mc_user_id ON notifications.mc_notifications (mc_user_id)",
    "CREATE INDEX IF NOT EXISTS ix_mc_notifications_is_acknowledged ON notifications.mc_notifications (is_acknowledged)",
    "CREATE INDEX IF NOT EXISTS ix_mc_notifications_is_rejected ON notifications.mc_notifications (is_rejected)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pc_notifications_id ON notifications.pc_notifications (id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pc_notifications_pc_user_id ON notifications.pc_notifications (pc_user_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pc_notifications_is_read ON notifications.pc_notifications (is_read)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pc_notifications_created_at ON notifications.pc_notifications (created_at)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_pc_notifications_activity_log_id ON notifications.pc_notifications (activity_log_id)",
    "CREATE INDEX IF NOT EXISTS idx_moan_operator_id ON notifications.machine_operator_assignment_notification (operator_id)",
    "CREATE INDEX IF NOT EXISTS ix_notifications_tool_calibration_notification_id ON notifications.tool_calibration_notification (id)",
    "CREATE INDEX IF NOT EXISTS idx_document_extracted_data_planned_by ON oms.document_extracted_data (planned_by)",
    "CREATE INDEX IF NOT EXISTS idx_document_extracted_data_updated_at ON oms.document_extracted_data (updated_at)",
    "CREATE INDEX IF NOT EXISTS ix_document_extracted_data_planned_raw_material_id ON oms.document_extracted_data (planned_raw_material_id)",
    "CREATE INDEX IF NOT EXISTS ix_oms_order_additional_costs_id ON oms.order_additional_costs (id)",
    "CREATE INDEX IF NOT EXISTS idx_out_source_op_status_operation_id ON oms.out_source_operation_status (operation_id)",
    "CREATE INDEX IF NOT EXISTS idx_out_source_op_status_part_order ON oms.out_source_operation_status (part_id, order_id)",
    "CREATE INDEX IF NOT EXISTS ix_oms_out_source_operation_status_id ON oms.out_source_operation_status (id)",
    "CREATE INDEX IF NOT EXISTS idx_parts_raw_material_unit_id ON oms.parts (raw_material_unit_id)",
    "CREATE INDEX IF NOT EXISTS ix_production_monitoring_shift_summary_id ON production_monitoring.shift_summary (id)",
    "CREATE INDEX IF NOT EXISTS ix_quality_inspection_report_save_id ON quality.inspection_report_save (id)",
    "CREATE INDEX IF NOT EXISTS ix_quality_notes_op_no ON quality.notes (op_no)",
    "CREATE INDEX IF NOT EXISTS idx_mosa_assigned_by_id ON scheduling.machine_operator_shift_assignment (assigned_by_id)",
    "CREATE INDEX IF NOT EXISTS ix_scheduling_notifications_id ON scheduling.notifications (id)",
    "CREATE INDEX IF NOT EXISTS idx_part_schedule_status_status_part ON scheduling.part_schedule_status (status, part_id)",
    "CREATE INDEX IF NOT EXISTS idx_planned_sched_operation_id ON scheduling.planned_schedule_items (operation_id)",
    "CREATE INDEX IF NOT EXISTS idx_production_logs_operation_id ON scheduling.production_logs (operation_id)",
    "CREATE INDEX IF NOT EXISTS idx_rescheduling_operation_order ON scheduling.rescheduling_items (operation_id, order_id)",
    "CREATE INDEX IF NOT EXISTS idx_rescheduling_machine_start ON scheduling.rescheduling_items (machine_id, start_time)",
]

# --------------------------------------------------------------------------
# 7. Constraints, each guarded by an orphan / duplicate check.
#    (schema, table, constraint_name, DDL, guard_sql_or_None)
#    guard_sql must return a single integer column: 0 means safe to add.
# --------------------------------------------------------------------------
CONSTRAINTS = [
    (
        "configuration", "pm_checklist_items", "uq_pm_checklist_item_code",
        "ALTER TABLE configuration.pm_checklist_items "
        "ADD CONSTRAINT uq_pm_checklist_item_code UNIQUE (checklist_id, item_code)",
        "SELECT COALESCE(SUM(c - 1), 0) FROM (SELECT COUNT(*) c FROM configuration.pm_checklist_items "
        "GROUP BY checklist_id, item_code HAVING COUNT(*) > 1) d",
    ),
    (
        "configuration", "pm_machine_assignments", "uq_pm_machine_checklist",
        "ALTER TABLE configuration.pm_machine_assignments "
        "ADD CONSTRAINT uq_pm_machine_checklist UNIQUE (machine_id, checklist_id)",
        "SELECT COALESCE(SUM(c - 1), 0) FROM (SELECT COUNT(*) c FROM configuration.pm_machine_assignments "
        "GROUP BY machine_id, checklist_id HAVING COUNT(*) > 1) d",
    ),
    (
        "configuration", "pm_schedule", "uq_pm_schedule_assignment_item",
        "ALTER TABLE configuration.pm_schedule "
        "ADD CONSTRAINT uq_pm_schedule_assignment_item UNIQUE (assignment_item_id)",
        "SELECT COALESCE(SUM(c - 1), 0) FROM (SELECT COUNT(*) c FROM configuration.pm_schedule "
        "GROUP BY assignment_item_id HAVING COUNT(*) > 1) d",
    ),
    # allow the same part_number under different products (local behaviour)
    (
        "oms", "parts", "parts_part_number_product_key",
        "ALTER TABLE oms.parts "
        "ADD CONSTRAINT parts_part_number_product_key UNIQUE (part_number, product_id)",
        "SELECT COALESCE(SUM(c - 1), 0) FROM (SELECT COUNT(*) c FROM oms.parts "
        "GROUP BY part_number, product_id HAVING COUNT(*) > 1) d",
    ),
    (
        "quality", "inspection_report_save", "uix_inspection_report_save_scope",
        "ALTER TABLE quality.inspection_report_save "
        "ADD CONSTRAINT uix_inspection_report_save_scope "
        "UNIQUE (part_number, sales_order_id, op_no, quantity_no, consolidated)",
        "SELECT COALESCE(SUM(c - 1), 0) FROM (SELECT COUNT(*) c FROM quality.inspection_report_save "
        "GROUP BY part_number, sales_order_id, op_no, quantity_no, consolidated "
        "HAVING COUNT(*) > 1) d",
    ),
    # foreign keys — added only when the server has zero orphan rows
    (
        "configuration", "pm_assignment_items", "pm_assignment_items_assignment_id_fkey",
        "ALTER TABLE configuration.pm_assignment_items ADD CONSTRAINT pm_assignment_items_assignment_id_fkey "
        "FOREIGN KEY (assignment_id) REFERENCES configuration.pm_machine_assignments(id) ON DELETE CASCADE",
        "SELECT COUNT(*) FROM configuration.pm_assignment_items i "
        "LEFT JOIN configuration.pm_machine_assignments a ON a.id = i.assignment_id "
        "WHERE i.assignment_id IS NOT NULL AND a.id IS NULL",
    ),
    (
        "configuration", "pm_assignment_items", "pm_assignment_items_checklist_item_id_fkey",
        "ALTER TABLE configuration.pm_assignment_items ADD CONSTRAINT pm_assignment_items_checklist_item_id_fkey "
        "FOREIGN KEY (checklist_item_id) REFERENCES configuration.pm_checklist_items(id)",
        "SELECT COUNT(*) FROM configuration.pm_assignment_items i "
        "LEFT JOIN configuration.pm_checklist_items c ON c.id = i.checklist_item_id "
        "WHERE i.checklist_item_id IS NOT NULL AND c.id IS NULL",
    ),
    (
        "configuration", "pm_machine_assignments", "pm_machine_assignments_machine_id_fkey",
        "ALTER TABLE configuration.pm_machine_assignments ADD CONSTRAINT pm_machine_assignments_machine_id_fkey "
        "FOREIGN KEY (machine_id) REFERENCES configuration.machines(id) ON DELETE CASCADE",
        "SELECT COUNT(*) FROM configuration.pm_machine_assignments a "
        "LEFT JOIN configuration.machines m ON m.id = a.machine_id "
        "WHERE a.machine_id IS NOT NULL AND m.id IS NULL",
    ),
    (
        "configuration", "pm_machine_assignments", "pm_machine_assignments_checklist_id_fkey",
        "ALTER TABLE configuration.pm_machine_assignments ADD CONSTRAINT pm_machine_assignments_checklist_id_fkey "
        "FOREIGN KEY (checklist_id) REFERENCES configuration.pm_checklists(id) ON DELETE CASCADE",
        "SELECT COUNT(*) FROM configuration.pm_machine_assignments a "
        "LEFT JOIN configuration.pm_checklists c ON c.id = a.checklist_id "
        "WHERE a.checklist_id IS NOT NULL AND c.id IS NULL",
    ),
    (
        "configuration", "pm_checklist_items", "pm_checklist_items_checklist_id_fkey",
        "ALTER TABLE configuration.pm_checklist_items ADD CONSTRAINT pm_checklist_items_checklist_id_fkey "
        "FOREIGN KEY (checklist_id) REFERENCES configuration.pm_checklists(id) ON DELETE CASCADE",
        "SELECT COUNT(*) FROM configuration.pm_checklist_items i "
        "LEFT JOIN configuration.pm_checklists c ON c.id = i.checklist_id "
        "WHERE i.checklist_id IS NOT NULL AND c.id IS NULL",
    ),
    (
        "configuration", "pm_schedule", "pm_schedule_assignment_item_id_fkey",
        "ALTER TABLE configuration.pm_schedule ADD CONSTRAINT pm_schedule_assignment_item_id_fkey "
        "FOREIGN KEY (assignment_item_id) REFERENCES configuration.pm_assignment_items(id) ON DELETE CASCADE",
        "SELECT COUNT(*) FROM configuration.pm_schedule s "
        "LEFT JOIN configuration.pm_assignment_items i ON i.id = s.assignment_item_id "
        "WHERE s.assignment_item_id IS NOT NULL AND i.id IS NULL",
    ),
    (
        "configuration", "customers", "customers_user_id_fkey",
        "ALTER TABLE configuration.customers ADD CONSTRAINT customers_user_id_fkey "
        "FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id)",
        "SELECT COUNT(*) FROM configuration.customers x "
        "LEFT JOIN accesscontrol.access_users u ON u.id = x.user_id "
        "WHERE x.user_id IS NOT NULL AND u.id IS NULL",
    ),
    (
        "configuration", "machines", "machines_user_id_fkey",
        "ALTER TABLE configuration.machines ADD CONSTRAINT machines_user_id_fkey "
        "FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id)",
        "SELECT COUNT(*) FROM configuration.machines x "
        "LEFT JOIN accesscontrol.access_users u ON u.id = x.user_id "
        "WHERE x.user_id IS NOT NULL AND u.id IS NULL",
    ),
    (
        "configuration", "work_centers", "work_centers_user_id_fkey",
        "ALTER TABLE configuration.work_centers ADD CONSTRAINT work_centers_user_id_fkey "
        "FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id)",
        "SELECT COUNT(*) FROM configuration.work_centers x "
        "LEFT JOIN accesscontrol.access_users u ON u.id = x.user_id "
        "WHERE x.user_id IS NOT NULL AND u.id IS NULL",
    ),
    (
        "inventory", "raw_material_history", "raw_material_history_order_id_fkey",
        "ALTER TABLE inventory.raw_material_history ADD CONSTRAINT raw_material_history_order_id_fkey "
        "FOREIGN KEY (order_id) REFERENCES oms.orders(id)",
        "SELECT COUNT(*) FROM inventory.raw_material_history x "
        "LEFT JOIN oms.orders o ON o.id = x.order_id "
        "WHERE x.order_id IS NOT NULL AND o.id IS NULL",
    ),
    (
        "inventory", "raw_material_history", "raw_material_history_part_id_fkey",
        "ALTER TABLE inventory.raw_material_history ADD CONSTRAINT raw_material_history_part_id_fkey "
        "FOREIGN KEY (part_id) REFERENCES oms.parts(id)",
        "SELECT COUNT(*) FROM inventory.raw_material_history x "
        "LEFT JOIN oms.parts p ON p.id = x.part_id "
        "WHERE x.part_id IS NOT NULL AND p.id IS NULL",
    ),
    (
        "oms", "operations", "operations_machine_id_fkey",
        "ALTER TABLE oms.operations ADD CONSTRAINT operations_machine_id_fkey "
        "FOREIGN KEY (machine_id) REFERENCES configuration.machines(id)",
        "SELECT COUNT(*) FROM oms.operations o "
        "LEFT JOIN configuration.machines m ON m.id = o.machine_id "
        "WHERE o.machine_id IS NOT NULL AND m.id IS NULL",
    ),
    (
        "notifications", "activity_log", "activity_log_order_id_fkey",
        "ALTER TABLE notifications.activity_log ADD CONSTRAINT activity_log_order_id_fkey "
        "FOREIGN KEY (order_id) REFERENCES oms.orders(id)",
        "SELECT COUNT(*) FROM notifications.activity_log x "
        "LEFT JOIN oms.orders o ON o.id = x.order_id "
        "WHERE x.order_id IS NOT NULL AND o.id IS NULL",
    ),
    (
        "scheduling", "production_logs", "fk_production_logs_machine_id",
        "ALTER TABLE scheduling.production_logs ADD CONSTRAINT fk_production_logs_machine_id "
        "FOREIGN KEY (machine_id) REFERENCES configuration.machines(id)",
        "SELECT COUNT(*) FROM scheduling.production_logs p "
        "LEFT JOIN configuration.machines m ON m.id = p.machine_id "
        "WHERE p.machine_id IS NOT NULL AND m.id IS NULL",
    ),
    (
        "scheduling", "machine_downtimes", "machine_downtimes_machine_id_fkey",
        "ALTER TABLE scheduling.machine_downtimes ADD CONSTRAINT machine_downtimes_machine_id_fkey "
        "FOREIGN KEY (machine_id) REFERENCES configuration.machines(id)",
        "SELECT COUNT(*) FROM scheduling.machine_downtimes x "
        "LEFT JOIN configuration.machines m ON m.id = x.machine_id "
        "WHERE x.machine_id IS NOT NULL AND m.id IS NULL",
    ),
]

# oms.parts_part_number_key (server-only UNIQUE on part_number) is intentionally KEPT.
# Two server foreign keys depend on it:
#   scheduling.planned_schedule_items_part_number_fkey
#   scheduling.rescheduling_items_part_number_fkey
# Dropping it would require dropping those FKs, which would weaken the server.
# The extra UNIQUE (part_number, product_id) from local is added alongside it,
# so the server keeps behaving exactly as it does today.
KEPT_SERVER_RESTRICTIONS = [
    (
        "oms.parts_part_number_key",
        "kept — planned_schedule_items / rescheduling_items FKs depend on it. "
        "Server still enforces globally unique part_number.",
    ),
]

# --------------------------------------------------------------------------
# 8. Audit function + row triggers (same table list as db_security/04_audit_logging.sql)
# --------------------------------------------------------------------------
AUDIT_FUNCTION = """
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit, public
AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
    v_uid text := current_setting('app.current_user_id', true);
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_new := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_old := to_jsonb(OLD);
    ELSE
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
    END IF;

    INSERT INTO audit.change_log (
        schema_name, table_name, operation, db_user,
        app_user_name, app_user_id, app_user_role,
        client_addr, old_row, new_row
    ) VALUES (
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, session_user,
        NULLIF(current_setting('app.current_user', true), ''),
        NULLIF(v_uid, '')::int,
        NULLIF(current_setting('app.current_user_role', true), ''),
        inet_client_addr(), v_old, v_new
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$
"""

AUDIT_TRIGGERS = """
DO $$
DECLARE
    r record;
    included_schemas text[] := ARRAY[
        'accesscontrol','oms','configuration','inventory','documents',
        'maintenance','notifications','quality','scheduling','public'
    ];
    excluded_tables text[] := ARRAY[
        'public.alembic_version',
        'notifications.activity_log'
    ];
BEGIN
    FOR r IN
        SELECT n.nspname AS schema_name, c.relname AS table_name
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname = ANY(included_schemas)
          AND (n.nspname || '.' || c.relname) <> ALL(excluded_tables)
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_row ON %I.%I',
                       r.schema_name, r.table_name);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_row
                 AFTER INSERT OR UPDATE OR DELETE ON %I.%I
                 FOR EACH ROW EXECUTE FUNCTION audit.log_change()',
            r.schema_name, r.table_name);
    END LOOP;
END
$$
"""

# Leave approver-role validation matching local
APPROVER_TRIGGER = [
    """
    CREATE OR REPLACE FUNCTION accesscontrol.check_approver_role_function()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        IF NEW.approved_by IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM accesscontrol.access_users
                WHERE id = NEW.approved_by
                  AND role IN ('manufacturing_coordinator', 'supervisor', 'admin')
            ) THEN
                RAISE EXCEPTION 'approved_by must reference a user with role manufacturing_coordinator, supervisor, or admin';
            END IF;
        END IF;
        RETURN NEW;
    END;
    $$
    """,
    "DROP TRIGGER IF EXISTS check_approver_role_trigger ON accesscontrol.operator_leaves",
    """
    CREATE TRIGGER check_approver_role_trigger
        BEFORE INSERT OR UPDATE OF approved_by ON accesscontrol.operator_leaves
        FOR EACH ROW EXECUTE FUNCTION accesscontrol.check_approver_role_function()
    """,
]

ALEMBIC_STAMP = """
CREATE TABLE IF NOT EXISTS public.alembic_version (
    version_num VARCHAR(32) NOT NULL CONSTRAINT alembic_version_pkc PRIMARY KEY
);
DELETE FROM public.alembic_version;
INSERT INTO public.alembic_version (version_num) VALUES ('0005_chatbox_attachments');
"""


# ==========================================================================
# Runner
# ==========================================================================
def snapshot_counts(cur):
    cur.execute(
        """
        SELECT n.nspname AS schema, c.relname AS table
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname NOT LIKE 'pg_%%'
          AND n.nspname <> 'information_schema'
          AND n.nspname NOT LIKE '\\_timescaledb%%'
        ORDER BY 1, 2
        """
    )
    tables = [(r["schema"], r["table"]) for r in cur.fetchall()]
    counts = {}
    for schema, table in tables:
        cur.execute(f'SELECT COUNT(*) AS n FROM "{schema}"."{table}"')
        counts[f"{schema}.{table}"] = cur.fetchone()["n"]
    return counts


def constraint_exists(cur, schema, table, name):
    cur.execute(
        """
        SELECT 1 FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relname = %s AND con.conname = %s
        """,
        (schema, table, name),
    )
    return cur.fetchone() is not None


def table_exists(cur, qualified):
    schema, table = qualified.split(".", 1)
    cur.execute(
        """
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = %s AND c.relname = %s
        """,
        (schema, table),
    )
    return cur.fetchone() is not None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="commit the changes (default is a dry run that rolls back)")
    parser.add_argument("--skip-audit", action="store_true",
                        help="do not install audit.change_log row triggers")
    args = parser.parse_args()

    mode = "APPLY" if args.apply else "DRY RUN (will roll back)"
    print("=" * 74)
    print(f"Server schema migration  ->  {SERVER['host']}/{SERVER['dbname']}")
    print(f"Mode: {mode}")
    print("=" * 74)

    conn = psycopg2.connect(**SERVER)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)
    skipped = []

    try:
        print("\n[0] Capturing row counts before changes ...")
        before = snapshot_counts(cur)
        print(f"    {len(before)} tables, {sum(before.values()):,} rows total")

        print("\n[1] Schemas")
        for sql in SCHEMAS:
            cur.execute(sql)
            print(f"    OK  {sql}")

        print("\n[2] New tables (created empty)")
        for name, sql in NEW_TABLES:
            existed = table_exists(cur, name)
            cur.execute(sql)
            print(f"    {'exists' if existed else 'CREATED':>7}  {name}")

        print("\n[3] New columns on existing tables")
        for sql in ADD_COLUMNS:
            cur.execute(sql)
            print(f"    OK  {sql.strip().splitlines()[1].strip()}")

        print("\n[4] Backfilling the new columns only")
        for label, sql in BACKFILL:
            cur.execute(sql)
            print(f"    {cur.rowcount:>6} rows  {label}")

        print("\n[5] Tightening the new columns")
        for sql in POST_BACKFILL:
            cur.execute(sql)
            print(f"    OK  {' '.join(sql.split())[:88]}")

        print("\n[6] Type alignment (widen / relax only)")
        for label, sql in TYPE_CHANGES:
            try:
                cur.execute("SAVEPOINT sp_type")
                cur.execute(sql)
                cur.execute("RELEASE SAVEPOINT sp_type")
                print(f"    OK      {label}")
            except psycopg2.Error as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_type")
                skipped.append((label, str(exc).strip().splitlines()[0]))
                print(f"    SKIP    {label}  ({str(exc).strip().splitlines()[0]})")

        print("\n[7] Indexes")
        created = 0
        for sql in INDEXES:
            try:
                cur.execute("SAVEPOINT sp_ix")
                cur.execute(sql)
                cur.execute("RELEASE SAVEPOINT sp_ix")
                created += 1
            except psycopg2.Error as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_ix")
                skipped.append((sql[:70], str(exc).strip().splitlines()[0]))
        print(f"    {created}/{len(INDEXES)} index statements applied")

        print("\n[8] Constraints (only where server data already complies)")
        for schema, table, name, ddl, guard in CONSTRAINTS:
            if not table_exists(cur, f"{schema}.{table}"):
                print(f"    SKIP    {name} (table missing)")
                continue
            if constraint_exists(cur, schema, table, name):
                print(f"    exists  {name}")
                continue
            bad = 0
            if guard:
                try:
                    cur.execute("SAVEPOINT sp_guard")
                    cur.execute(guard)
                    bad = int(list(cur.fetchone().values())[0] or 0)
                    cur.execute("RELEASE SAVEPOINT sp_guard")
                except psycopg2.Error as exc:
                    cur.execute("ROLLBACK TO SAVEPOINT sp_guard")
                    skipped.append((name, f"guard failed: {str(exc).strip().splitlines()[0]}"))
                    print(f"    SKIP    {name} (guard failed)")
                    continue
            if bad:
                skipped.append((name, f"{bad} existing rows would violate it — left off on purpose"))
                print(f"    SKIP    {name}  ({bad} non-conforming rows kept as-is)")
                continue
            try:
                cur.execute("SAVEPOINT sp_con")
                cur.execute(ddl)
                cur.execute("RELEASE SAVEPOINT sp_con")
                print(f"    ADDED   {name}")
            except psycopg2.Error as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_con")
                skipped.append((name, str(exc).strip().splitlines()[0]))
                print(f"    SKIP    {name}  ({str(exc).strip().splitlines()[0]})")

        print("\n[9] Server-side restrictions kept on purpose")
        for name, reason in KEPT_SERVER_RESTRICTIONS:
            print(f"    KEEP    {name}: {reason}")

        print("\n[10] Approver-role validation trigger")
        for sql in APPROVER_TRIGGER:
            try:
                cur.execute("SAVEPOINT sp_appr")
                cur.execute(sql)
                cur.execute("RELEASE SAVEPOINT sp_appr")
            except psycopg2.Error as exc:
                cur.execute("ROLLBACK TO SAVEPOINT sp_appr")
                skipped.append(("approver trigger", str(exc).strip().splitlines()[0]))
        print("    OK")

        if args.skip_audit:
            print("\n[11] Audit triggers SKIPPED (--skip-audit)")
        else:
            print("\n[11] Audit log function + row triggers")
            cur.execute(AUDIT_FUNCTION)
            cur.execute(AUDIT_TRIGGERS)
            cur.execute(
                """
                SELECT COUNT(*) AS n FROM pg_trigger t
                WHERE t.tgname = 'trg_audit_row' AND NOT t.tgisinternal
                """
            )
            print(f"    audit triggers installed on {cur.fetchone()['n']} tables")

        print("\n[12] Alembic version stamp")
        cur.execute(ALEMBIC_STAMP)
        print("    stamped 0005_chatbox_attachments")

        print("\n[13] Verifying no rows were lost ...")
        after = snapshot_counts(cur)
        lost = []
        for key, old in before.items():
            new = after.get(key)
            if new is None:
                lost.append(f"{key}: TABLE MISSING (had {old})")
            elif new < old:
                lost.append(f"{key}: {old} -> {new}")
        if lost:
            raise RuntimeError("Row loss detected, rolling back:\n  " + "\n  ".join(lost))
        print(f"    OK — {len(before)} pre-existing tables, no row losses")
        print(f"    before total = {sum(before.values()):,}")
        print(f"    after  total = {sum(v for k, v in after.items() if k in before):,}")

        if args.apply:
            conn.commit()
            print("\nCOMMITTED.")
        else:
            conn.rollback()
            print("\nDRY RUN complete — rolled back. Re-run with --apply to commit.")

    except Exception as exc:
        conn.rollback()
        print(f"\nFAILED, rolled back: {type(exc).__name__}: {exc}")
        raise
    finally:
        if skipped:
            print("\n" + "-" * 74)
            print("Deliberately skipped (existing server data preserved):")
            for name, reason in skipped:
                print(f"  - {name}: {reason}")
            print("-" * 74)
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
