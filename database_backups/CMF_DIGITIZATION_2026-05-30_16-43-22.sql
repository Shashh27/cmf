--
-- PostgreSQL database dump
--

\restrict 3oIRzv2nDX7sG83Xcjjh2sFp3fnQnYxKCOqRePEUc1BgRGzZajbs5tjLzTiGSQX

-- Dumped from database version 17.7
-- Dumped by pg_dump version 17.7

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: accesscontrol; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA accesscontrol;


--
-- Name: configuration; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA configuration;


--
-- Name: documents; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA documents;


--
-- Name: inventory; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA inventory;


--
-- Name: maintenance; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA maintenance;


--
-- Name: notifications; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA notifications;


--
-- Name: oms; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA oms;


--
-- Name: production_monitoring; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA production_monitoring;


--
-- Name: quality; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA quality;


--
-- Name: scheduling; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA scheduling;


--
-- Name: productionlogstatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.productionlogstatus AS ENUM (
    'PENDING',
    'COMPLETED',
    'REWORK'
);


--
-- Name: machine_live_status_history_function(); Type: FUNCTION; Schema: production_monitoring; Owner: -
--

CREATE FUNCTION production_monitoring.machine_live_status_history_function() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            -- Insert the OLD values (before update) into history table
            INSERT INTO production_monitoring.machine_live_history 
            (machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id)
            VALUES 
            (OLD.machine_id, OLD.status, OLD.last_updated, OLD.current_order_id, OLD.current_part_id, OLD.current_operation_id);
            
            -- Return the NEW values (after update) to continue the operation
            RETURN NEW;
        END;
        $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$

BEGIN

    NEW.updated_at = NOW() AT TIME ZONE 'Asia/Kolkata';

    RETURN NEW;

END;

$$;


--
-- Name: sync_order_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_order_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If scheduling status becomes 'active', set order to 'Scheduled'
    IF NEW.status = 'active' THEN
        UPDATE oms.orders SET status = 'Scheduled' WHERE id = NEW.order_id;
    -- If scheduling status becomes 'inactive', set order to 'Pending'
    ELSIF NEW.status = 'inactive' THEN
        UPDATE oms.orders SET status = 'Pending' WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_raw_material_pieces_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_raw_material_pieces_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
                BEGIN
                    NEW.updated_at = CURRENT_TIMESTAMP;
                    RETURN NEW;
                END;
                $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: scheduling; Owner: -
--

CREATE FUNCTION scheduling.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: access_users; Type: TABLE; Schema: accesscontrol; Owner: -
--

CREATE TABLE accesscontrol.access_users (
    id integer NOT NULL,
    user_name character varying NOT NULL,
    gmail character varying NOT NULL,
    role character varying NOT NULL,
    center character varying,
    "group" character varying,
    password character varying NOT NULL,
    "createdAt" timestamp without time zone,
    "updatedAt" timestamp without time zone
);


--
-- Name: access_users_id_seq; Type: SEQUENCE; Schema: accesscontrol; Owner: -
--

CREATE SEQUENCE accesscontrol.access_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: access_users_id_seq; Type: SEQUENCE OWNED BY; Schema: accesscontrol; Owner: -
--

ALTER SEQUENCE accesscontrol.access_users_id_seq OWNED BY accesscontrol.access_users.id;


--
-- Name: operator_leaves; Type: TABLE; Schema: accesscontrol; Owner: -
--

CREATE TABLE accesscontrol.operator_leaves (
    id integer NOT NULL,
    operator_id integer NOT NULL,
    from_date date NOT NULL,
    to_date date NOT NULL,
    reason character varying,
    additional_remarks text,
    status character varying NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    CONSTRAINT check_date_range CHECK ((from_date <= to_date)),
    CONSTRAINT check_status_values CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'acknowledged'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: operator_leaves_id_seq; Type: SEQUENCE; Schema: accesscontrol; Owner: -
--

CREATE SEQUENCE accesscontrol.operator_leaves_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operator_leaves_id_seq; Type: SEQUENCE OWNED BY; Schema: accesscontrol; Owner: -
--

ALTER SEQUENCE accesscontrol.operator_leaves_id_seq OWNED BY accesscontrol.operator_leaves.id;


--
-- Name: customers; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.customers (
    id integer NOT NULL,
    company_name character varying NOT NULL,
    address character varying NOT NULL,
    branch character varying NOT NULL,
    email character varying NOT NULL,
    contact_number character varying NOT NULL,
    contact_person character varying NOT NULL,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer
);


--
-- Name: customers_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.customers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customers_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.customers_id_seq OWNED BY configuration.customers.id;


--
-- Name: machines; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.machines (
    id integer NOT NULL,
    work_center_id integer NOT NULL,
    type character varying NOT NULL,
    make character varying,
    model character varying,
    year_of_installation integer,
    cnc_controller character varying,
    cnc_controller_service character varying,
    remarks character varying,
    calibration_date timestamp without time zone,
    calibration_due_date timestamp without time zone,
    password character varying(255) DEFAULT 'default123'::character varying NOT NULL,
    user_id integer
);


--
-- Name: machines_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.machines_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machines_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.machines_id_seq OWNED BY configuration.machines.id;


--
-- Name: pokayoke_checklist_items; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.pokayoke_checklist_items (
    id integer NOT NULL,
    checklist_id integer NOT NULL,
    item_text character varying NOT NULL,
    sequence_number integer NOT NULL,
    item_type character varying NOT NULL,
    is_required boolean,
    expected_value character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pokayoke_checklist_items_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.pokayoke_checklist_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pokayoke_checklist_items_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.pokayoke_checklist_items_id_seq OWNED BY configuration.pokayoke_checklist_items.id;


--
-- Name: pokayoke_checklists; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.pokayoke_checklists (
    id integer NOT NULL,
    name character varying NOT NULL,
    description character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: pokayoke_checklists_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.pokayoke_checklists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pokayoke_checklists_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.pokayoke_checklists_id_seq OWNED BY configuration.pokayoke_checklists.id;


--
-- Name: pokayoke_completed_logs; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.pokayoke_completed_logs (
    id integer NOT NULL,
    checklist_id integer NOT NULL,
    machine_id integer NOT NULL,
    operator_id integer NOT NULL,
    production_order_id integer,
    part_id integer,
    completed_at timestamp without time zone NOT NULL,
    all_items_passed boolean NOT NULL,
    comments text,
    read boolean,
    assignment_id integer,
    frequency character varying,
    shift character varying,
    operator_acknowledged boolean DEFAULT false NOT NULL,
    operator_acknowledged_at timestamp with time zone,
    supervisor_acknowledged boolean DEFAULT false NOT NULL,
    supervisor_acknowledged_at timestamp with time zone,
    supervisor_id integer
);


--
-- Name: pokayoke_completed_logs_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.pokayoke_completed_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pokayoke_completed_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.pokayoke_completed_logs_id_seq OWNED BY configuration.pokayoke_completed_logs.id;


--
-- Name: pokayoke_item_responses; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.pokayoke_item_responses (
    id integer NOT NULL,
    completed_log_id integer NOT NULL,
    item_id integer NOT NULL,
    response_value character varying NOT NULL,
    is_confirming boolean,
    "timestamp" timestamp without time zone NOT NULL,
    approval_status character varying(20),
    approved_by integer,
    approved_at timestamp without time zone,
    approval_comments character varying(500)
);


--
-- Name: COLUMN pokayoke_item_responses.approval_status; Type: COMMENT; Schema: configuration; Owner: -
--

COMMENT ON COLUMN configuration.pokayoke_item_responses.approval_status IS 'Approval status: approved, rejected, or pending';


--
-- Name: COLUMN pokayoke_item_responses.approved_by; Type: COMMENT; Schema: configuration; Owner: -
--

COMMENT ON COLUMN configuration.pokayoke_item_responses.approved_by IS 'User ID who approved/rejected the response';


--
-- Name: COLUMN pokayoke_item_responses.approved_at; Type: COMMENT; Schema: configuration; Owner: -
--

COMMENT ON COLUMN configuration.pokayoke_item_responses.approved_at IS 'Timestamp when the response was approved/rejected';


--
-- Name: COLUMN pokayoke_item_responses.approval_comments; Type: COMMENT; Schema: configuration; Owner: -
--

COMMENT ON COLUMN configuration.pokayoke_item_responses.approval_comments IS 'Optional comments for approval/rejection';


--
-- Name: pokayoke_item_responses_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.pokayoke_item_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pokayoke_item_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.pokayoke_item_responses_id_seq OWNED BY configuration.pokayoke_item_responses.id;


--
-- Name: pokayoke_machine_assignments; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.pokayoke_machine_assignments (
    id integer NOT NULL,
    checklist_id integer NOT NULL,
    machine_id integer NOT NULL,
    frequency character varying,
    shift character varying,
    scheduled_day character varying,
    assigned_at timestamp without time zone DEFAULT now()
);


--
-- Name: pokayoke_machine_assignments_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.pokayoke_machine_assignments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pokayoke_machine_assignments_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.pokayoke_machine_assignments_id_seq OWNED BY configuration.pokayoke_machine_assignments.id;


--
-- Name: work_centers; Type: TABLE; Schema: configuration; Owner: -
--

CREATE TABLE configuration.work_centers (
    id integer NOT NULL,
    code character varying NOT NULL,
    work_center_name character varying NOT NULL,
    description character varying,
    is_schedulable boolean,
    user_id integer
);


--
-- Name: work_centers_id_seq; Type: SEQUENCE; Schema: configuration; Owner: -
--

CREATE SEQUENCE configuration.work_centers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: work_centers_id_seq; Type: SEQUENCE OWNED BY; Schema: configuration; Owner: -
--

ALTER SEQUENCE configuration.work_centers_id_seq OWNED BY configuration.work_centers.id;


--
-- Name: common_documents; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.common_documents (
    id integer NOT NULL,
    folder_id integer,
    document_name character varying(255) NOT NULL,
    document_url character varying(500) NOT NULL,
    version double precision NOT NULL,
    parent_id integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    user_id integer NOT NULL
);


--
-- Name: common_documents_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.common_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: common_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.common_documents_id_seq OWNED BY documents.common_documents.id;


--
-- Name: common_folders; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.common_folders (
    id integer NOT NULL,
    folder_name character varying(255) NOT NULL,
    parent_id integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    user_id integer NOT NULL
);


--
-- Name: common_folders_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.common_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: common_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.common_folders_id_seq OWNED BY documents.common_folders.id;


--
-- Name: general_documents; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.general_documents (
    id integer NOT NULL,
    general_folder_id integer NOT NULL,
    file_name character varying(255) NOT NULL,
    url character varying(500) NOT NULL,
    version double precision NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    user_id integer NOT NULL
);


--
-- Name: general_documents_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.general_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: general_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.general_documents_id_seq OWNED BY documents.general_documents.id;


--
-- Name: general_folders; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.general_folders (
    id integer NOT NULL,
    folder_name character varying(255) NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone,
    user_id integer NOT NULL
);


--
-- Name: general_folders_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.general_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: general_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.general_folders_id_seq OWNED BY documents.general_folders.id;


--
-- Name: machine_documents; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.machine_documents (
    id integer NOT NULL,
    machine_folder_id integer,
    machine_id integer,
    document_name character varying(255) NOT NULL,
    document_url character varying(500) NOT NULL,
    version double precision NOT NULL,
    parent_id integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    user_id integer NOT NULL,
    document_type character varying(50)
);


--
-- Name: machine_documents_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.machine_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.machine_documents_id_seq OWNED BY documents.machine_documents.id;


--
-- Name: machine_folders; Type: TABLE; Schema: documents; Owner: -
--

CREATE TABLE documents.machine_folders (
    id integer NOT NULL,
    folder_name character varying(255) NOT NULL,
    machine_id integer NOT NULL,
    parent_id integer,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    user_id integer NOT NULL
);


--
-- Name: machine_folders_id_seq; Type: SEQUENCE; Schema: documents; Owner: -
--

CREATE SEQUENCE documents.machine_folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_folders_id_seq; Type: SEQUENCE OWNED BY; Schema: documents; Owner: -
--

ALTER SEQUENCE documents.machine_folders_id_seq OWNED BY documents.machine_folders.id;


--
-- Name: inventory_requests; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.inventory_requests (
    id integer NOT NULL,
    tool_id integer NOT NULL,
    operator_id integer NOT NULL,
    project_id integer NOT NULL,
    part_id integer NOT NULL,
    quantity integer NOT NULL,
    purpose_of_use text,
    created_at timestamp without time zone NOT NULL,
    inventory_supervisor_id integer,
    status character varying NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: inventory_requests_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.inventory_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.inventory_requests_id_seq OWNED BY inventory.inventory_requests.id;


--
-- Name: inventory_return_requests; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.inventory_return_requests (
    id integer NOT NULL,
    requested_id integer NOT NULL,
    operator_id integer NOT NULL,
    total_requested_qty integer NOT NULL,
    returned_qty integer NOT NULL,
    remarks text,
    created_at timestamp without time zone NOT NULL,
    inventory_supervisor_id integer,
    status character varying NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: inventory_return_requests_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.inventory_return_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_return_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.inventory_return_requests_id_seq OWNED BY inventory.inventory_return_requests.id;


--
-- Name: raw_material_stock; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.raw_material_stock (
    id integer NOT NULL,
    material_id integer NOT NULL,
    form_type character varying NOT NULL,
    diameter double precision,
    length double precision,
    breadth double precision,
    height double precision,
    inner_diameter double precision,
    outer_diameter double precision,
    quantity integer NOT NULL,
    volume double precision,
    mass double precision,
    weight double precision,
    cost double precision,
    source_type character varying NOT NULL,
    source_order_id integer,
    status character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    part_id character varying(50),
    vendor_id character varying(255),
    user_id integer,
    order_status character varying(50),
    received_vendor_id integer,
    allocated_quantity integer DEFAULT 0 NOT NULL,
    available_quantity integer DEFAULT 0 NOT NULL,
    remaining_length double precision,
    process_type character varying(50),
    estimated_cost double precision,
    final_cost double precision
);


--
-- Name: raw_material_stock_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.raw_material_stock_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: raw_material_stock_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.raw_material_stock_id_seq OWNED BY inventory.raw_material_stock.id;


--
-- Name: raw_material_units; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.raw_material_units (
    id integer NOT NULL,
    stock_id integer NOT NULL,
    total_length double precision NOT NULL,
    remaining_length double precision NOT NULL,
    volume double precision,
    mass double precision,
    weight double precision,
    cost double precision,
    status character varying(50) DEFAULT 'available'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: raw_material_units_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.raw_material_units_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: raw_material_units_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.raw_material_units_id_seq OWNED BY inventory.raw_material_units.id;


--
-- Name: raw_material_usage; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.raw_material_usage (
    id integer NOT NULL,
    raw_material_unit_id integer NOT NULL,
    part_id integer NOT NULL,
    used_length double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    user_id integer
);


--
-- Name: raw_material_usage_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.raw_material_usage_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: raw_material_usage_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.raw_material_usage_id_seq OWNED BY inventory.raw_material_usage.id;


--
-- Name: raw_materials; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.raw_materials (
    id integer NOT NULL,
    material_name character varying NOT NULL,
    density double precision NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cost_per_kg double precision,
    user_id integer
);


--
-- Name: raw_materials_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.raw_materials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: raw_materials_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.raw_materials_id_seq OWNED BY inventory.raw_materials.id;


--
-- Name: tool_issue_documents; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.tool_issue_documents (
    id integer NOT NULL,
    tool_issue_id integer NOT NULL,
    document_url character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tool_issue_documents_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.tool_issue_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tool_issue_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.tool_issue_documents_id_seq OWNED BY inventory.tool_issue_documents.id;


--
-- Name: tool_issues; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.tool_issues (
    id integer NOT NULL,
    tool_id integer NOT NULL,
    request_id integer NOT NULL,
    tool_issue_qty integer NOT NULL,
    operator_id integer NOT NULL,
    inventory_supervisor_id integer,
    status character varying NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone,
    issue_category character varying,
    description text,
    remarks text
);


--
-- Name: tool_issues_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.tool_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tool_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.tool_issues_id_seq OWNED BY inventory.tool_issues.id;


--
-- Name: tools_list; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.tools_list (
    id integer NOT NULL,
    item_description character varying,
    range character varying,
    identification_code character varying,
    make character varying,
    quantity integer,
    total_quantity integer,
    location character varying,
    gauge character varying,
    remarks text,
    amount double precision,
    ref_ledger character varying,
    type character varying,
    issues_qty integer,
    category character varying,
    sub_category character varying
);


--
-- Name: tools_list_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.tools_list_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tools_list_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.tools_list_id_seq OWNED BY inventory.tools_list.id;


--
-- Name: vendors; Type: TABLE; Schema: inventory; Owner: -
--

CREATE TABLE inventory.vendors (
    id integer NOT NULL,
    company_name character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: vendors_id_seq; Type: SEQUENCE; Schema: inventory; Owner: -
--

CREATE SEQUENCE inventory.vendors_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vendors_id_seq; Type: SEQUENCE OWNED BY; Schema: inventory; Owner: -
--

ALTER SEQUENCE inventory.vendors_id_seq OWNED BY inventory.vendors.id;


--
-- Name: component_issues; Type: TABLE; Schema: maintenance; Owner: -
--

CREATE TABLE maintenance.component_issues (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    reported_by integer NOT NULL,
    component_status character varying NOT NULL,
    production_order_id integer,
    part_id integer,
    description text,
    reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: component_issues_id_seq; Type: SEQUENCE; Schema: maintenance; Owner: -
--

CREATE SEQUENCE maintenance.component_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: component_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: maintenance; Owner: -
--

ALTER SEQUENCE maintenance.component_issues_id_seq OWNED BY maintenance.component_issues.id;


--
-- Name: help_support; Type: TABLE; Schema: maintenance; Owner: -
--

CREATE TABLE maintenance.help_support (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    reported_by integer NOT NULL,
    production_order_id integer NOT NULL,
    part_id integer NOT NULL,
    description text NOT NULL,
    reported_at timestamp without time zone NOT NULL,
    mc_reply text,
    replied_by integer,
    replied_at timestamp without time zone
);


--
-- Name: help_support_id_seq; Type: SEQUENCE; Schema: maintenance; Owner: -
--

CREATE SEQUENCE maintenance.help_support_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: help_support_id_seq; Type: SEQUENCE OWNED BY; Schema: maintenance; Owner: -
--

ALTER SEQUENCE maintenance.help_support_id_seq OWNED BY maintenance.help_support.id;


--
-- Name: machine_breakdown; Type: TABLE; Schema: maintenance; Owner: -
--

CREATE TABLE maintenance.machine_breakdown (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    reported_by integer NOT NULL,
    issue_category character varying NOT NULL,
    machine_status character varying NOT NULL,
    issue_reason text,
    additional_reason text,
    reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: machine_breakdown_id_seq; Type: SEQUENCE; Schema: maintenance; Owner: -
--

CREATE SEQUENCE maintenance.machine_breakdown_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_breakdown_id_seq; Type: SEQUENCE OWNED BY; Schema: maintenance; Owner: -
--

ALTER SEQUENCE maintenance.machine_breakdown_id_seq OWNED BY maintenance.machine_breakdown.id;


--
-- Name: oee_issues; Type: TABLE; Schema: maintenance; Owner: -
--

CREATE TABLE maintenance.oee_issues (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    reported_by integer NOT NULL,
    issue_category character varying NOT NULL,
    issue_reason text,
    start_time timestamp without time zone,
    end_time timestamp without time zone,
    reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: oee_issues_id_seq; Type: SEQUENCE; Schema: maintenance; Owner: -
--

CREATE SEQUENCE maintenance.oee_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oee_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: maintenance; Owner: -
--

ALTER SEQUENCE maintenance.oee_issues_id_seq OWNED BY maintenance.oee_issues.id;


--
-- Name: activity_log; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.activity_log (
    id integer NOT NULL,
    entity_type character varying NOT NULL,
    entity_id integer NOT NULL,
    action character varying NOT NULL,
    order_id integer,
    user_id integer,
    user_name character varying,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    details json,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_role character varying(100) DEFAULT NULL::character varying
);


--
-- Name: activity_log_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.activity_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_log_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.activity_log_id_seq OWNED BY notifications.activity_log.id;


--
-- Name: component_issues_notification; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.component_issues_notification (
    id integer NOT NULL,
    comp_issues_id integer NOT NULL,
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying,
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: component_issues_notification_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.component_issues_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: component_issues_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.component_issues_notification_id_seq OWNED BY notifications.component_issues_notification.id;


--
-- Name: inspection_notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.inspection_notifications (
    id integer NOT NULL,
    order_id integer NOT NULL,
    part_number character varying(255) NOT NULL,
    op_no integer NOT NULL,
    operation_id integer NOT NULL,
    machine_id integer,
    requested_by_username character varying(255),
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying(255),
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    category character varying(50) DEFAULT 'plan_request'::character varying
);


--
-- Name: inspection_notifications_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.inspection_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspection_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.inspection_notifications_id_seq OWNED BY notifications.inspection_notifications.id;


--
-- Name: machine_calibration_notification; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.machine_calibration_notification (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying,
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: machine_calibration_notification_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.machine_calibration_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_calibration_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.machine_calibration_notification_id_seq OWNED BY notifications.machine_calibration_notification.id;


--
-- Name: machine_notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.machine_notifications (
    id integer NOT NULL,
    machine_breakdown_id integer NOT NULL,
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying,
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: machine_notifications_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.machine_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.machine_notifications_id_seq OWNED BY notifications.machine_notifications.id;


--
-- Name: mc_notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.mc_notifications (
    id integer NOT NULL,
    document_id integer NOT NULL,
    mc_user_id integer NOT NULL,
    is_acknowledged boolean DEFAULT false NOT NULL,
    ack_remarks character varying,
    ack_at timestamp with time zone,
    is_rejected boolean DEFAULT false NOT NULL,
    reject_remarks character varying,
    reject_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: mc_notifications_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.mc_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mc_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.mc_notifications_id_seq OWNED BY notifications.mc_notifications.id;


--
-- Name: order_notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.order_notifications (
    id integer NOT NULL,
    order_id integer NOT NULL,
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying,
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_notifications_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.order_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.order_notifications_id_seq OWNED BY notifications.order_notifications.id;


--
-- Name: pc_notifications; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.pc_notifications (
    id integer NOT NULL,
    activity_log_id integer NOT NULL,
    pc_user_id integer NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pc_notifications_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.pc_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pc_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.pc_notifications_id_seq OWNED BY notifications.pc_notifications.id;


--
-- Name: tool_issues_notification; Type: TABLE; Schema: notifications; Owner: -
--

CREATE TABLE notifications.tool_issues_notification (
    id integer NOT NULL,
    tool_issues_id integer NOT NULL,
    is_ack boolean DEFAULT false NOT NULL,
    ack_by character varying,
    ack_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tool_issues_notification_id_seq; Type: SEQUENCE; Schema: notifications; Owner: -
--

CREATE SEQUENCE notifications.tool_issues_notification_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tool_issues_notification_id_seq; Type: SEQUENCE OWNED BY; Schema: notifications; Owner: -
--

ALTER SEQUENCE notifications.tool_issues_notification_id_seq OWNED BY notifications.tool_issues_notification.id;


--
-- Name: assemblies; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.assemblies (
    id integer NOT NULL,
    assembly_name character varying NOT NULL,
    assembly_number character varying NOT NULL,
    product_id integer,
    parent_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer,
    recycle_bin boolean DEFAULT false NOT NULL
);


--
-- Name: assemblies_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.assemblies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: assemblies_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.assemblies_id_seq OWNED BY oms.assemblies.id;


--
-- Name: document_extracted_data; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.document_extracted_data (
    id integer NOT NULL,
    document_id integer NOT NULL,
    part_id integer NOT NULL,
    note text,
    title character varying,
    stock_size character varying,
    material character varying,
    stocksize_kg character varying,
    net_wt_kg character varying,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: document_extracted_data_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.document_extracted_data_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_extracted_data_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.document_extracted_data_id_seq OWNED BY oms.document_extracted_data.id;


--
-- Name: documents; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.documents (
    id integer NOT NULL,
    document_name character varying NOT NULL,
    document_url character varying NOT NULL,
    document_type character varying NOT NULL,
    document_version character varying NOT NULL,
    part_id integer,
    parent_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    assembly_id integer,
    user_id integer,
    is_acknowledged boolean DEFAULT false NOT NULL,
    acknowledged_at timestamp with time zone
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.documents_id_seq OWNED BY oms.documents.id;


--
-- Name: operation_documents; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.operation_documents (
    id integer NOT NULL,
    document_name character varying NOT NULL,
    document_url character varying NOT NULL,
    document_type character varying NOT NULL,
    document_version character varying NOT NULL,
    operation_id integer NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer
);


--
-- Name: operation_documents_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.operation_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operation_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.operation_documents_id_seq OWNED BY oms.operation_documents.id;


--
-- Name: operations; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.operations (
    id integer NOT NULL,
    operation_number character varying NOT NULL,
    operation_name character varying NOT NULL,
    setup_time time without time zone,
    cycle_time time without time zone,
    workcenter_id integer,
    part_id integer,
    machine_id integer,
    work_instructions text,
    notes text,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    part_type_id integer DEFAULT 1 NOT NULL,
    from_date timestamp with time zone,
    to_date timestamp with time zone,
    user_id integer,
    vendor_id integer
);


--
-- Name: COLUMN operations.vendor_id; Type: COMMENT; Schema: oms; Owner: -
--

COMMENT ON COLUMN oms.operations.vendor_id IS 'Foreign key reference to vendor for outsourced operations';


--
-- Name: operations_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.operations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operations_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.operations_id_seq OWNED BY oms.operations.id;


--
-- Name: order_documents; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.order_documents (
    id integer NOT NULL,
    order_id integer NOT NULL,
    document_name character varying NOT NULL,
    document_url character varying NOT NULL,
    document_type character varying NOT NULL,
    document_version character varying NOT NULL,
    parent_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer
);


--
-- Name: order_documents_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.order_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.order_documents_id_seq OWNED BY oms.order_documents.id;


--
-- Name: order_part_priorities; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.order_part_priorities (
    id integer NOT NULL,
    order_id integer NOT NULL,
    product_id integer NOT NULL,
    part_id integer NOT NULL,
    priority integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying NOT NULL
);


--
-- Name: order_part_priorities_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.order_part_priorities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_part_priorities_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.order_part_priorities_id_seq OWNED BY oms.order_part_priorities.id;


--
-- Name: order_parts_raw_material_linked; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.order_parts_raw_material_linked (
    id integer NOT NULL,
    stock_id integer NOT NULL,
    part_id integer NOT NULL,
    order_id integer NOT NULL,
    used_quantity integer NOT NULL,
    linkage_group_id character varying,
    is_procurement boolean NOT NULL,
    procurement_quantity integer,
    procurement_weight double precision,
    vendor_id integer,
    procurement_status character varying NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_parts_raw_material_linked_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.order_parts_raw_material_linked_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_parts_raw_material_linked_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.order_parts_raw_material_linked_id_seq OWNED BY oms.order_parts_raw_material_linked.id;


--
-- Name: order_schedule_status; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.order_schedule_status (
    id integer NOT NULL,
    order_id integer NOT NULL,
    part_id integer NOT NULL,
    operation_id integer NOT NULL,
    status character varying NOT NULL,
    start_date timestamp with time zone,
    to_date timestamp with time zone,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.order_schedule_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.order_schedule_status_id_seq OWNED BY oms.order_schedule_status.id;


--
-- Name: orders; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.orders (
    id integer NOT NULL,
    sale_order_number character varying NOT NULL,
    customer_id integer NOT NULL,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    due_date timestamp without time zone,
    status character varying NOT NULL,
    order_date timestamp without time zone,
    user_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    project_coordinator_id integer,
    admin_id integer NOT NULL,
    manufacturing_coordinator_id integer,
    project_name character varying,
    approval_status character varying DEFAULT 'Pending Approval'::character varying NOT NULL,
    approval_remarks text,
    approved_at timestamp with time zone
);


--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.orders_id_seq OWNED BY oms.orders.id;


--
-- Name: out_source_operation_status; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.out_source_operation_status (
    id integer NOT NULL,
    part_id integer NOT NULL,
    order_id integer NOT NULL,
    operation_id integer NOT NULL,
    sent_date timestamp with time zone,
    delivered_date timestamp with time zone,
    status character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: out_source_operation_status_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.out_source_operation_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: out_source_operation_status_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.out_source_operation_status_id_seq OWNED BY oms.out_source_operation_status.id;


--
-- Name: out_source_parts_status; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.out_source_parts_status (
    id integer NOT NULL,
    part_id integer NOT NULL,
    order_id integer NOT NULL,
    start_date timestamp without time zone,
    to_date timestamp without time zone,
    status character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: out_source_parts_status_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.out_source_parts_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: out_source_parts_status_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.out_source_parts_status_id_seq OWNED BY oms.out_source_parts_status.id;


--
-- Name: part_types; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.part_types (
    id integer NOT NULL,
    type_name character varying NOT NULL,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer
);


--
-- Name: part_types_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.part_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: part_types_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.part_types_id_seq OWNED BY oms.part_types.id;


--
-- Name: parts; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.parts (
    id integer NOT NULL,
    part_name character varying NOT NULL,
    part_number character varying NOT NULL,
    type_id integer,
    raw_material_id integer,
    assembly_id integer,
    product_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer,
    part_detail character varying(50),
    qty integer DEFAULT 1,
    vendor_id integer,
    size character varying(255),
    required_length double precision,
    raw_material_unit_id integer,
    recycle_bin boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN parts.part_detail; Type: COMMENT; Schema: oms; Owner: -
--

COMMENT ON COLUMN oms.parts.part_detail IS 'For out-source parts: WITH_RAW_MATERIAL or WITHOUT_RAW_MATERIAL';


--
-- Name: COLUMN parts.vendor_id; Type: COMMENT; Schema: oms; Owner: -
--

COMMENT ON COLUMN oms.parts.vendor_id IS 'Foreign key reference to vendor for outsourced parts';


--
-- Name: parts_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.parts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: parts_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.parts_id_seq OWNED BY oms.parts.id;


--
-- Name: process_plans; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.process_plans (
    id integer NOT NULL,
    operation_id integer,
    work_instructions text,
    notes text
);


--
-- Name: process_plans_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.process_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: process_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.process_plans_id_seq OWNED BY oms.process_plans.id;


--
-- Name: products; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.products (
    id integer NOT NULL,
    product_name character varying NOT NULL,
    product_version character varying NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL
);


--
-- Name: products_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.products_id_seq OWNED BY oms.products.id;


--
-- Name: tools_with_part; Type: TABLE; Schema: oms; Owner: -
--

CREATE TABLE oms.tools_with_part (
    id integer NOT NULL,
    tool_id integer NOT NULL,
    part_id integer,
    operation_id integer,
    created_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    updated_at timestamp with time zone DEFAULT (now() AT TIME ZONE 'Asia/Kolkata'::text) NOT NULL,
    user_id integer
);


--
-- Name: tools_with_part_id_seq; Type: SEQUENCE; Schema: oms; Owner: -
--

CREATE SEQUENCE oms.tools_with_part_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tools_with_part_id_seq; Type: SEQUENCE OWNED BY; Schema: oms; Owner: -
--

ALTER SEQUENCE oms.tools_with_part_id_seq OWNED BY oms.tools_with_part.id;


--
-- Name: machine_live_history; Type: TABLE; Schema: production_monitoring; Owner: -
--

CREATE TABLE production_monitoring.machine_live_history (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    status character varying NOT NULL,
    last_updated timestamp without time zone DEFAULT now() NOT NULL,
    current_order_id integer,
    current_part_id integer,
    current_operation_id integer
);


--
-- Name: machine_live_history_id_seq; Type: SEQUENCE; Schema: production_monitoring; Owner: -
--

CREATE SEQUENCE production_monitoring.machine_live_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_live_history_id_seq; Type: SEQUENCE OWNED BY; Schema: production_monitoring; Owner: -
--

ALTER SEQUENCE production_monitoring.machine_live_history_id_seq OWNED BY production_monitoring.machine_live_history.id;


--
-- Name: machine_live_status; Type: TABLE; Schema: production_monitoring; Owner: -
--

CREATE TABLE production_monitoring.machine_live_status (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    status character varying DEFAULT 'OFF'::character varying NOT NULL,
    last_updated timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    current_order_id integer,
    current_part_id integer,
    current_operation_id integer
);


--
-- Name: machine_live_status_id_seq; Type: SEQUENCE; Schema: production_monitoring; Owner: -
--

CREATE SEQUENCE production_monitoring.machine_live_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_live_status_id_seq; Type: SEQUENCE OWNED BY; Schema: production_monitoring; Owner: -
--

ALTER SEQUENCE production_monitoring.machine_live_status_id_seq OWNED BY production_monitoring.machine_live_status.id;


--
-- Name: oee_issue; Type: TABLE; Schema: production_monitoring; Owner: -
--

CREATE TABLE production_monitoring.oee_issue (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    issue_category character varying NOT NULL,
    issue_reason text NOT NULL,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone,
    duration_minutes double precision,
    "timestamp" timestamp without time zone DEFAULT now()
);


--
-- Name: oee_issue_id_seq; Type: SEQUENCE; Schema: production_monitoring; Owner: -
--

CREATE SEQUENCE production_monitoring.oee_issue_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oee_issue_id_seq; Type: SEQUENCE OWNED BY; Schema: production_monitoring; Owner: -
--

ALTER SEQUENCE production_monitoring.oee_issue_id_seq OWNED BY production_monitoring.oee_issue.id;


--
-- Name: shift_summary; Type: TABLE; Schema: production_monitoring; Owner: -
--

CREATE TABLE production_monitoring.shift_summary (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    shift integer NOT NULL,
    "timestamp" timestamp without time zone DEFAULT now() NOT NULL,
    oee double precision,
    availability double precision,
    performance double precision,
    quality double precision,
    availability_loss double precision,
    performance_loss double precision,
    quality_loss double precision,
    total_parts integer,
    good_parts integer,
    bad_parts integer,
    updatedate timestamp without time zone DEFAULT now() NOT NULL,
    off_time time without time zone,
    idle_time time without time zone,
    production_time time without time zone
);


--
-- Name: shift_summary_id_seq; Type: SEQUENCE; Schema: production_monitoring; Owner: -
--

CREATE SEQUENCE production_monitoring.shift_summary_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_summary_id_seq; Type: SEQUENCE OWNED BY; Schema: production_monitoring; Owner: -
--

ALTER SEQUENCE production_monitoring.shift_summary_id_seq OWNED BY production_monitoring.shift_summary.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


--
-- Name: ftp_status; Type: TABLE; Schema: quality; Owner: -
--

CREATE TABLE quality.ftp_status (
    id integer NOT NULL,
    order_id bigint NOT NULL,
    ipid character varying(255) NOT NULL,
    is_completed boolean NOT NULL,
    status character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by_username character varying(255),
    approved_at timestamp with time zone
);


--
-- Name: ftp_status_id_seq; Type: SEQUENCE; Schema: quality; Owner: -
--

CREATE SEQUENCE quality.ftp_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ftp_status_id_seq; Type: SEQUENCE OWNED BY; Schema: quality; Owner: -
--

ALTER SEQUENCE quality.ftp_status_id_seq OWNED BY quality.ftp_status.id;


--
-- Name: inspection_plan_status; Type: TABLE; Schema: quality; Owner: -
--

CREATE TABLE quality.inspection_plan_status (
    id integer NOT NULL,
    part_number character varying NOT NULL,
    sales_order_id integer NOT NULL,
    op_no integer NOT NULL,
    status character varying(32) DEFAULT 'draft'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_by_username character varying(255)
);


--
-- Name: inspection_plan_status_id_seq; Type: SEQUENCE; Schema: quality; Owner: -
--

CREATE SEQUENCE quality.inspection_plan_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspection_plan_status_id_seq; Type: SEQUENCE OWNED BY; Schema: quality; Owner: -
--

ALTER SEQUENCE quality.inspection_plan_status_id_seq OWNED BY quality.inspection_plan_status.id;


--
-- Name: master_boc; Type: TABLE; Schema: quality; Owner: -
--

CREATE TABLE quality.master_boc (
    id integer NOT NULL,
    part_id character varying NOT NULL,
    sales_order_id integer NOT NULL,
    nominal character varying NOT NULL,
    uppertol double precision NOT NULL,
    lowertol double precision NOT NULL,
    zone character varying NOT NULL,
    dimension_type character varying NOT NULL,
    measured_instrument character varying NOT NULL,
    op_no integer NOT NULL,
    bbox text NOT NULL,
    ipid character varying NOT NULL,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: master_boc_id_seq; Type: SEQUENCE; Schema: quality; Owner: -
--

CREATE SEQUENCE quality.master_boc_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: master_boc_id_seq; Type: SEQUENCE OWNED BY; Schema: quality; Owner: -
--

ALTER SEQUENCE quality.master_boc_id_seq OWNED BY quality.master_boc.id;


--
-- Name: notes; Type: TABLE; Schema: quality; Owner: -
--

CREATE TABLE quality.notes (
    id integer NOT NULL,
    part_id integer NOT NULL,
    document_id integer,
    x double precision,
    y double precision,
    width double precision,
    height double precision,
    page integer,
    note_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notes_id_seq; Type: SEQUENCE; Schema: quality; Owner: -
--

CREATE SEQUENCE quality.notes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notes_id_seq; Type: SEQUENCE OWNED BY; Schema: quality; Owner: -
--

ALTER SEQUENCE quality.notes_id_seq OWNED BY quality.notes.id;


--
-- Name: stage_inspection; Type: TABLE; Schema: quality; Owner: -
--

CREATE TABLE quality.stage_inspection (
    id integer NOT NULL,
    user_id integer NOT NULL,
    part_id integer NOT NULL,
    sale_order_id integer NOT NULL,
    nominal_value character varying NOT NULL,
    uppertol double precision NOT NULL,
    lowertol double precision NOT NULL,
    zone character varying NOT NULL,
    dimension_type character varying NOT NULL,
    measured_1 character varying,
    measured_2 character varying,
    measured_3 character varying,
    measured_mean character varying,
    measured_instrument character varying NOT NULL,
    used_inst character varying NOT NULL,
    op_no integer NOT NULL,
    quantity_no integer,
    bbox text,
    is_done boolean NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    measurements json DEFAULT '[]'::json NOT NULL
);


--
-- Name: stage_inspection_id_seq; Type: SEQUENCE; Schema: quality; Owner: -
--

CREATE SEQUENCE quality.stage_inspection_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stage_inspection_id_seq; Type: SEQUENCE OWNED BY; Schema: quality; Owner: -
--

ALTER SEQUENCE quality.stage_inspection_id_seq OWNED BY quality.stage_inspection.id;


--
-- Name: efficiency_factor; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.efficiency_factor (
    id integer NOT NULL,
    efficiency_factor double precision NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: efficiency_factor_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.efficiency_factor_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: efficiency_factor_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.efficiency_factor_id_seq OWNED BY scheduling.efficiency_factor.id;


--
-- Name: machine_downtimes; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.machine_downtimes (
    id integer NOT NULL,
    machine_id integer,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    status_id integer,
    status_name character varying(255),
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: COLUMN machine_downtimes.created_at; Type: COMMENT; Schema: scheduling; Owner: -
--

COMMENT ON COLUMN scheduling.machine_downtimes.created_at IS 'Timestamp when the status update was recorded';


--
-- Name: machine_downtimes_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.machine_downtimes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_downtimes_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.machine_downtimes_id_seq OWNED BY scheduling.machine_downtimes.id;


--
-- Name: machine_operator_shift_assignment; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.machine_operator_shift_assignment (
    id integer NOT NULL,
    machine_id integer NOT NULL,
    operator_id integer NOT NULL,
    shift_config_id integer NOT NULL,
    created_at timestamp without time zone,
    updated_at timestamp without time zone
);


--
-- Name: machine_operator_shift_assignment_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.machine_operator_shift_assignment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_operator_shift_assignment_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.machine_operator_shift_assignment_id_seq OWNED BY scheduling.machine_operator_shift_assignment.id;


--
-- Name: machine_schedule; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.machine_schedule (
    id integer NOT NULL,
    order_id integer,
    part_id integer,
    operation_id integer,
    machine_id integer,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    status character varying,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: machine_schedule_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.machine_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.machine_schedule_id_seq OWNED BY scheduling.machine_schedule.id;


--
-- Name: machine_status; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.machine_status (
    id integer NOT NULL,
    machine_id integer,
    status_id integer,
    description text,
    available_from timestamp without time zone,
    available_to timestamp without time zone
);


--
-- Name: machine_status_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.machine_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: machine_status_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.machine_status_id_seq OWNED BY scheduling.machine_status.id;


--
-- Name: notifications; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.notifications (
    id integer NOT NULL,
    production_log_id integer NOT NULL,
    operator_id integer NOT NULL,
    supervisor_id integer,
    message text NOT NULL,
    is_acknowledged boolean NOT NULL,
    acknowledged_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.notifications_id_seq OWNED BY scheduling.notifications.id;


--
-- Name: operation_status; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.operation_status (
    id integer NOT NULL,
    order_id integer,
    part_id integer,
    operation_id integer NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    operator_id integer
);


--
-- Name: operation_status_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.operation_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: operation_status_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.operation_status_id_seq OWNED BY scheduling.operation_status.id;


--
-- Name: order_schedule_status; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.order_schedule_status (
    id integer NOT NULL,
    order_id integer,
    product_id integer,
    active_parts_count integer,
    active_inhouse_parts integer,
    status character varying,
    activated_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.order_schedule_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.order_schedule_status_id_seq OWNED BY scheduling.order_schedule_status.id;


--
-- Name: part_schedule_status; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.part_schedule_status (
    id integer NOT NULL,
    part_id integer NOT NULL,
    sale_order_id integer NOT NULL,
    status character varying NOT NULL,
    start_date timestamp without time zone,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: part_schedule_status_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.part_schedule_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: part_schedule_status_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.part_schedule_status_id_seq OWNED BY scheduling.part_schedule_status.id;


--
-- Name: planned_schedule_items; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.planned_schedule_items (
    id integer NOT NULL,
    part_id integer NOT NULL,
    part_number character varying NOT NULL,
    sale_order_id integer NOT NULL,
    sale_order_number character varying NOT NULL,
    operation_id integer NOT NULL,
    machine_id integer,
    planned_start_time timestamp without time zone NOT NULL,
    planned_end_time timestamp without time zone NOT NULL,
    total_quantity integer NOT NULL,
    remaining_quantity integer NOT NULL,
    status character varying,
    created_at timestamp without time zone NOT NULL,
    schedule_history_id integer
);


--
-- Name: planned_schedule_items_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.planned_schedule_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: planned_schedule_items_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.planned_schedule_items_id_seq OWNED BY scheduling.planned_schedule_items.id;


--
-- Name: production_logs; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.production_logs (
    id integer NOT NULL,
    operation_id integer NOT NULL,
    operator_id integer NOT NULL,
    supervisor_id integer,
    notes text,
    remarks text,
    from_date date,
    from_time time without time zone,
    to_date date,
    to_time time without time zone,
    status character varying NOT NULL,
    produced_quantity integer,
    approved_quantity integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    operator_status character varying,
    supervisor_acknowledged boolean DEFAULT false NOT NULL,
    supervisor_acknowledged_at timestamp without time zone,
    rework_quantity integer,
    rejected_quantity integer,
    remaining_quantity_to_be_produced integer,
    operator_acknowledged boolean DEFAULT false NOT NULL,
    operator_acknowledged_at timestamp without time zone
);


--
-- Name: production_logs_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.production_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: production_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.production_logs_id_seq OWNED BY scheduling.production_logs.id;


--
-- Name: rescheduling_items; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.rescheduling_items (
    id integer NOT NULL,
    order_id integer NOT NULL,
    order_number character varying NOT NULL,
    part_id integer NOT NULL,
    part_number character varying NOT NULL,
    operation_id integer NOT NULL,
    operation_number character varying NOT NULL,
    machine_id integer,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    total_qty integer NOT NULL,
    completed_qty integer NOT NULL,
    remaining_qty integer NOT NULL,
    status character varying NOT NULL,
    schedule_version integer NOT NULL
);


--
-- Name: rescheduling_items_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.rescheduling_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rescheduling_items_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.rescheduling_items_id_seq OWNED BY scheduling.rescheduling_items.id;


--
-- Name: schedule_history; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.schedule_history (
    id integer NOT NULL,
    version integer NOT NULL,
    is_active boolean NOT NULL,
    generated_at timestamp without time zone NOT NULL,
    message text
);


--
-- Name: schedule_history_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.schedule_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedule_history_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.schedule_history_id_seq OWNED BY scheduling.schedule_history.id;


--
-- Name: shift_hours_configuration; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.shift_hours_configuration (
    id integer NOT NULL,
    date date NOT NULL,
    working_day boolean NOT NULL,
    number_of_shifts integer NOT NULL
);


--
-- Name: shift_hours_configuration_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.shift_hours_configuration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_hours_configuration_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.shift_hours_configuration_id_seq OWNED BY scheduling.shift_hours_configuration.id;


--
-- Name: shift_timing_configuration; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.shift_timing_configuration (
    id integer NOT NULL,
    shift_config_id integer NOT NULL,
    shift_code character varying NOT NULL,
    shift_start time without time zone NOT NULL,
    shift_end time without time zone NOT NULL,
    custom_start time without time zone,
    custom_end time without time zone
);


--
-- Name: shift_timing_configuration_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.shift_timing_configuration_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shift_timing_configuration_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.shift_timing_configuration_id_seq OWNED BY scheduling.shift_timing_configuration.id;


--
-- Name: status; Type: TABLE; Schema: scheduling; Owner: -
--

CREATE TABLE scheduling.status (
    id integer NOT NULL,
    name character varying NOT NULL,
    description text
);


--
-- Name: status_id_seq; Type: SEQUENCE; Schema: scheduling; Owner: -
--

CREATE SEQUENCE scheduling.status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: status_id_seq; Type: SEQUENCE OWNED BY; Schema: scheduling; Owner: -
--

ALTER SEQUENCE scheduling.status_id_seq OWNED BY scheduling.status.id;


--
-- Name: access_users id; Type: DEFAULT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.access_users ALTER COLUMN id SET DEFAULT nextval('accesscontrol.access_users_id_seq'::regclass);


--
-- Name: operator_leaves id; Type: DEFAULT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.operator_leaves ALTER COLUMN id SET DEFAULT nextval('accesscontrol.operator_leaves_id_seq'::regclass);


--
-- Name: customers id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.customers ALTER COLUMN id SET DEFAULT nextval('configuration.customers_id_seq'::regclass);


--
-- Name: machines id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.machines ALTER COLUMN id SET DEFAULT nextval('configuration.machines_id_seq'::regclass);


--
-- Name: pokayoke_checklist_items id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_checklist_items ALTER COLUMN id SET DEFAULT nextval('configuration.pokayoke_checklist_items_id_seq'::regclass);


--
-- Name: pokayoke_checklists id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_checklists ALTER COLUMN id SET DEFAULT nextval('configuration.pokayoke_checklists_id_seq'::regclass);


--
-- Name: pokayoke_completed_logs id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs ALTER COLUMN id SET DEFAULT nextval('configuration.pokayoke_completed_logs_id_seq'::regclass);


--
-- Name: pokayoke_item_responses id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_item_responses ALTER COLUMN id SET DEFAULT nextval('configuration.pokayoke_item_responses_id_seq'::regclass);


--
-- Name: pokayoke_machine_assignments id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_machine_assignments ALTER COLUMN id SET DEFAULT nextval('configuration.pokayoke_machine_assignments_id_seq'::regclass);


--
-- Name: work_centers id; Type: DEFAULT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.work_centers ALTER COLUMN id SET DEFAULT nextval('configuration.work_centers_id_seq'::regclass);


--
-- Name: common_documents id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_documents ALTER COLUMN id SET DEFAULT nextval('documents.common_documents_id_seq'::regclass);


--
-- Name: common_folders id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_folders ALTER COLUMN id SET DEFAULT nextval('documents.common_folders_id_seq'::regclass);


--
-- Name: general_documents id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_documents ALTER COLUMN id SET DEFAULT nextval('documents.general_documents_id_seq'::regclass);


--
-- Name: general_folders id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_folders ALTER COLUMN id SET DEFAULT nextval('documents.general_folders_id_seq'::regclass);


--
-- Name: machine_documents id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents ALTER COLUMN id SET DEFAULT nextval('documents.machine_documents_id_seq'::regclass);


--
-- Name: machine_folders id; Type: DEFAULT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_folders ALTER COLUMN id SET DEFAULT nextval('documents.machine_folders_id_seq'::regclass);


--
-- Name: inventory_requests id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_requests ALTER COLUMN id SET DEFAULT nextval('inventory.inventory_requests_id_seq'::regclass);


--
-- Name: inventory_return_requests id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_return_requests ALTER COLUMN id SET DEFAULT nextval('inventory.inventory_return_requests_id_seq'::regclass);


--
-- Name: raw_material_stock id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_stock ALTER COLUMN id SET DEFAULT nextval('inventory.raw_material_stock_id_seq'::regclass);


--
-- Name: raw_material_units id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_units ALTER COLUMN id SET DEFAULT nextval('inventory.raw_material_units_id_seq'::regclass);


--
-- Name: raw_material_usage id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_usage ALTER COLUMN id SET DEFAULT nextval('inventory.raw_material_usage_id_seq'::regclass);


--
-- Name: raw_materials id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_materials ALTER COLUMN id SET DEFAULT nextval('inventory.raw_materials_id_seq'::regclass);


--
-- Name: tool_issue_documents id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issue_documents ALTER COLUMN id SET DEFAULT nextval('inventory.tool_issue_documents_id_seq'::regclass);


--
-- Name: tool_issues id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issues ALTER COLUMN id SET DEFAULT nextval('inventory.tool_issues_id_seq'::regclass);


--
-- Name: tools_list id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tools_list ALTER COLUMN id SET DEFAULT nextval('inventory.tools_list_id_seq'::regclass);


--
-- Name: vendors id; Type: DEFAULT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.vendors ALTER COLUMN id SET DEFAULT nextval('inventory.vendors_id_seq'::regclass);


--
-- Name: component_issues id; Type: DEFAULT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.component_issues ALTER COLUMN id SET DEFAULT nextval('maintenance.component_issues_id_seq'::regclass);


--
-- Name: help_support id; Type: DEFAULT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support ALTER COLUMN id SET DEFAULT nextval('maintenance.help_support_id_seq'::regclass);


--
-- Name: machine_breakdown id; Type: DEFAULT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.machine_breakdown ALTER COLUMN id SET DEFAULT nextval('maintenance.machine_breakdown_id_seq'::regclass);


--
-- Name: oee_issues id; Type: DEFAULT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.oee_issues ALTER COLUMN id SET DEFAULT nextval('maintenance.oee_issues_id_seq'::regclass);


--
-- Name: activity_log id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.activity_log ALTER COLUMN id SET DEFAULT nextval('notifications.activity_log_id_seq'::regclass);


--
-- Name: component_issues_notification id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.component_issues_notification ALTER COLUMN id SET DEFAULT nextval('notifications.component_issues_notification_id_seq'::regclass);


--
-- Name: inspection_notifications id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.inspection_notifications ALTER COLUMN id SET DEFAULT nextval('notifications.inspection_notifications_id_seq'::regclass);


--
-- Name: machine_calibration_notification id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.machine_calibration_notification ALTER COLUMN id SET DEFAULT nextval('notifications.machine_calibration_notification_id_seq'::regclass);


--
-- Name: machine_notifications id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.machine_notifications ALTER COLUMN id SET DEFAULT nextval('notifications.machine_notifications_id_seq'::regclass);


--
-- Name: mc_notifications id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.mc_notifications ALTER COLUMN id SET DEFAULT nextval('notifications.mc_notifications_id_seq'::regclass);


--
-- Name: order_notifications id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.order_notifications ALTER COLUMN id SET DEFAULT nextval('notifications.order_notifications_id_seq'::regclass);


--
-- Name: pc_notifications id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.pc_notifications ALTER COLUMN id SET DEFAULT nextval('notifications.pc_notifications_id_seq'::regclass);


--
-- Name: tool_issues_notification id; Type: DEFAULT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.tool_issues_notification ALTER COLUMN id SET DEFAULT nextval('notifications.tool_issues_notification_id_seq'::regclass);


--
-- Name: assemblies id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.assemblies ALTER COLUMN id SET DEFAULT nextval('oms.assemblies_id_seq'::regclass);


--
-- Name: document_extracted_data id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.document_extracted_data ALTER COLUMN id SET DEFAULT nextval('oms.document_extracted_data_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents ALTER COLUMN id SET DEFAULT nextval('oms.documents_id_seq'::regclass);


--
-- Name: operation_documents id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operation_documents ALTER COLUMN id SET DEFAULT nextval('oms.operation_documents_id_seq'::regclass);


--
-- Name: operations id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations ALTER COLUMN id SET DEFAULT nextval('oms.operations_id_seq'::regclass);


--
-- Name: order_documents id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_documents ALTER COLUMN id SET DEFAULT nextval('oms.order_documents_id_seq'::regclass);


--
-- Name: order_part_priorities id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_part_priorities ALTER COLUMN id SET DEFAULT nextval('oms.order_part_priorities_id_seq'::regclass);


--
-- Name: order_parts_raw_material_linked id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked ALTER COLUMN id SET DEFAULT nextval('oms.order_parts_raw_material_linked_id_seq'::regclass);


--
-- Name: order_schedule_status id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status ALTER COLUMN id SET DEFAULT nextval('oms.order_schedule_status_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders ALTER COLUMN id SET DEFAULT nextval('oms.orders_id_seq'::regclass);


--
-- Name: out_source_operation_status id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_operation_status ALTER COLUMN id SET DEFAULT nextval('oms.out_source_operation_status_id_seq'::regclass);


--
-- Name: out_source_parts_status id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_parts_status ALTER COLUMN id SET DEFAULT nextval('oms.out_source_parts_status_id_seq'::regclass);


--
-- Name: part_types id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.part_types ALTER COLUMN id SET DEFAULT nextval('oms.part_types_id_seq'::regclass);


--
-- Name: parts id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts ALTER COLUMN id SET DEFAULT nextval('oms.parts_id_seq'::regclass);


--
-- Name: process_plans id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.process_plans ALTER COLUMN id SET DEFAULT nextval('oms.process_plans_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.products ALTER COLUMN id SET DEFAULT nextval('oms.products_id_seq'::regclass);


--
-- Name: tools_with_part id; Type: DEFAULT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.tools_with_part ALTER COLUMN id SET DEFAULT nextval('oms.tools_with_part_id_seq'::regclass);


--
-- Name: machine_live_history id; Type: DEFAULT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history ALTER COLUMN id SET DEFAULT nextval('production_monitoring.machine_live_history_id_seq'::regclass);


--
-- Name: machine_live_status id; Type: DEFAULT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status ALTER COLUMN id SET DEFAULT nextval('production_monitoring.machine_live_status_id_seq'::regclass);


--
-- Name: oee_issue id; Type: DEFAULT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.oee_issue ALTER COLUMN id SET DEFAULT nextval('production_monitoring.oee_issue_id_seq'::regclass);


--
-- Name: shift_summary id; Type: DEFAULT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.shift_summary ALTER COLUMN id SET DEFAULT nextval('production_monitoring.shift_summary_id_seq'::regclass);


--
-- Name: ftp_status id; Type: DEFAULT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.ftp_status ALTER COLUMN id SET DEFAULT nextval('quality.ftp_status_id_seq'::regclass);


--
-- Name: inspection_plan_status id; Type: DEFAULT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.inspection_plan_status ALTER COLUMN id SET DEFAULT nextval('quality.inspection_plan_status_id_seq'::regclass);


--
-- Name: master_boc id; Type: DEFAULT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.master_boc ALTER COLUMN id SET DEFAULT nextval('quality.master_boc_id_seq'::regclass);


--
-- Name: notes id; Type: DEFAULT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.notes ALTER COLUMN id SET DEFAULT nextval('quality.notes_id_seq'::regclass);


--
-- Name: stage_inspection id; Type: DEFAULT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.stage_inspection ALTER COLUMN id SET DEFAULT nextval('quality.stage_inspection_id_seq'::regclass);


--
-- Name: efficiency_factor id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.efficiency_factor ALTER COLUMN id SET DEFAULT nextval('scheduling.efficiency_factor_id_seq'::regclass);


--
-- Name: machine_downtimes id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_downtimes ALTER COLUMN id SET DEFAULT nextval('scheduling.machine_downtimes_id_seq'::regclass);


--
-- Name: machine_operator_shift_assignment id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_operator_shift_assignment ALTER COLUMN id SET DEFAULT nextval('scheduling.machine_operator_shift_assignment_id_seq'::regclass);


--
-- Name: machine_schedule id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule ALTER COLUMN id SET DEFAULT nextval('scheduling.machine_schedule_id_seq'::regclass);


--
-- Name: machine_status id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_status ALTER COLUMN id SET DEFAULT nextval('scheduling.machine_status_id_seq'::regclass);


--
-- Name: notifications id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.notifications ALTER COLUMN id SET DEFAULT nextval('scheduling.notifications_id_seq'::regclass);


--
-- Name: operation_status id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status ALTER COLUMN id SET DEFAULT nextval('scheduling.operation_status_id_seq'::regclass);


--
-- Name: order_schedule_status id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.order_schedule_status ALTER COLUMN id SET DEFAULT nextval('scheduling.order_schedule_status_id_seq'::regclass);


--
-- Name: part_schedule_status id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.part_schedule_status ALTER COLUMN id SET DEFAULT nextval('scheduling.part_schedule_status_id_seq'::regclass);


--
-- Name: planned_schedule_items id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items ALTER COLUMN id SET DEFAULT nextval('scheduling.planned_schedule_items_id_seq'::regclass);


--
-- Name: production_logs id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.production_logs ALTER COLUMN id SET DEFAULT nextval('scheduling.production_logs_id_seq'::regclass);


--
-- Name: rescheduling_items id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items ALTER COLUMN id SET DEFAULT nextval('scheduling.rescheduling_items_id_seq'::regclass);


--
-- Name: schedule_history id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.schedule_history ALTER COLUMN id SET DEFAULT nextval('scheduling.schedule_history_id_seq'::regclass);


--
-- Name: shift_hours_configuration id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_hours_configuration ALTER COLUMN id SET DEFAULT nextval('scheduling.shift_hours_configuration_id_seq'::regclass);


--
-- Name: shift_timing_configuration id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_timing_configuration ALTER COLUMN id SET DEFAULT nextval('scheduling.shift_timing_configuration_id_seq'::regclass);


--
-- Name: status id; Type: DEFAULT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.status ALTER COLUMN id SET DEFAULT nextval('scheduling.status_id_seq'::regclass);


--
-- Data for Name: access_users; Type: TABLE DATA; Schema: accesscontrol; Owner: -
--

COPY accesscontrol.access_users (id, user_name, gmail, role, center, "group", password, "createdAt", "updatedAt") FROM stdin;
30	supervisor	supervisor@cmti.res.in	supervisor	CMF	CMF	supervisor	2026-03-12 11:18:26.828518	2026-03-12 11:18:26.828518
32	bharath	bharath@cmti.res.in	manufacturing_coordinator	CMF	CMF	bharath	2026-03-12 11:19:35.655542	2026-03-25 14:03:47.829028
34	vignesh	vignesh@gmail.com	manufacturing_coordinator	CMF	CMF	vignesh	2026-03-16 12:37:27.530213	2026-03-25 14:04:04.140479
16	admin	admin@gmail.com	admin	SMPM	SMC	admin	2026-02-09 09:22:55.399809	2026-02-09 09:22:55.399809
3	operator1	operator1@gmail.com	operator	CMF	cmf	operator1	2026-02-06 13:26:58.851243	2026-04-09 14:36:06.516565
4	project	project@gmail.com	project_coordinator	NMTC	NTC	project	2026-02-06 13:34:10.369017	2026-04-09 14:37:01.146816
12	operator	operator@gmail.com	operator	SMPM	SMC	operator	2026-02-09 04:26:26.606815	2026-02-10 12:51:57.350303
5	operator2	oper@gmail.com	operator	CMF	cmf	operator2	2026-02-09 03:55:29.86392	2026-04-09 14:38:07.572005
31	inventory	inventory@cmti.res.in	inventory_supervisor	CMF	CMF	inventory	2026-03-12 11:19:02.711268	2026-04-21 11:57:01.515148
20	Ramesh	ramesh@cmti.res.in	project_coordinator	NMTC	NT	Ramesh	2026-02-13 04:37:55.307852	2026-04-29 14:44:04.51248
\.


--
-- Data for Name: operator_leaves; Type: TABLE DATA; Schema: accesscontrol; Owner: -
--

COPY accesscontrol.operator_leaves (id, operator_id, from_date, to_date, reason, additional_remarks, status, created_at, updated_at) FROM stdin;
1	3	2026-04-23	2026-04-23	\N	\N	acknowledged	2026-04-21 11:13:27.960471	2026-04-21 05:44:27.929086
5	3	2026-04-27	2026-04-30	\N	\N	acknowledged	2026-04-21 18:13:23.180846	2026-04-21 12:53:39.108858
3	12	2026-04-25	2026-04-25	\N	\N	acknowledged	2026-04-21 18:02:52.489561	2026-04-21 12:56:14.604511
6	12	2026-05-08	2026-05-11	\N	\N	acknowledged	2026-04-22 17:47:41.942726	2026-05-04 08:45:54.248348
7	12	2026-05-27	2026-05-27	OD	\N	acknowledged	2026-05-04 16:36:32.78882	2026-05-04 11:57:19.14745
\.


--
-- Data for Name: customers; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.customers (id, company_name, address, branch, email, contact_number, contact_person, created_at, updated_at, user_id) FROM stdin;
2	BEL	Bangalore	Bangalore	bel@gmail.com	9292367869	Priya	2026-02-25 15:37:55.729301+05:30	2026-03-13 12:00:15.006177+05:30	16
3	ADA	Electronic city	ADA 	a@gmail.com	7852333608	Subhash	2026-02-25 15:37:55.729301+05:30	2026-03-13 12:00:15.006177+05:30	16
1	CMTI	Bangalore	smpm	supriyakeshav12@gmail.com	+917349695894	supriya k	2026-02-25 15:37:55.729301+05:30	2026-03-13 12:00:15.006177+05:30	16
10	ASEM	Nasik Industrial Estate, Plot 45, Nasik	Nasik	contact@asem.com	+91-255-1234567	Mr. Rajesh Sharma	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
11	Ordinance Factory	Defense Road, Itarsi, Madhya Pradesh	Itarsi	info@ordinancefactory.in	+91-757-9876543	Col. Vikram Singh	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
12	Godrej	Vikhroli East, Mumbai, Maharashtra	Mumbai	business@godrej.com	+91-22-26765432	Ms. Priya Desai	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
13	ADA	Airport Road, Bangalore, Karnataka		contact@ada.gov.in	+91-80-25261234	Dr. A. K. Prasad	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
14	RCI	Imarat Hills, Kanchanbagh, Hyderabad	Hyderabad	admin@rci.drdo.in	+91-40-24561278	Dr. S. N. Rao	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
15	ATCP	BHEL Complex, Delhi	Delhi	atcp.delhi@bhel.in	+91-11-26784561	Mr. Anil Kumar	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
16	ATCP	BHEL Complex, Vishakhapatnam	Delhi (BHEL & SBC - Vizag)	atcp.vizag@bhel.in	+91-891-2765432	Mr. Suresh Naidu	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
17	Mr. Harish Jevargi	123 Business Lane, Hubli, Karnataka		harish.jevargi@email.com	+91-836-9871234	Mr. Harish Jevargi	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
18	IIJT	Institute of Jewelery Technology Complex, Bhubaneswar	Bhubaneswar & HMT	iijt.bbsr@gov.in	+91-674-2387654	Prof. R. K. Mishra	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
19	ISH	Precision Tools Division, Pune, Maharashtra	Precision Tools	ish.pune@precision.com	+91-20-26784321	Mr. Deepak Pawar	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
20	SFC	Steel Fabrication Complex, Jagadalpur	Jagadalpur	sfc.jgd@steel.gov.in	+91-7782-234567	Mr. S. K. Verma	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
21	SACEM	Nasik Defense Park, Plot 12	Nasik	sacem.nasik@defense.com	+91-255-8765432	Col. R. S. Patil	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
22	Hinetic Electronics	Electronic City, Bangalore, Karnataka		info@hineticelectronics.com	+91-80-28561234	Ms. Kavita Reddy	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
23	LPSC	Vikram Sarabhai Space Centre, Trivandrum	Trivadrum	lpsc@vssc.gov.in	+91-471-2567891	Dr. V. R. Gowarikar	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
24	MHI	Industrial Machinery Division, Tokyo Office India		india@mhi.com	+91-22-27651234	Mr. T. Yamamoto	2026-03-31 19:23:23.929195+05:30	2026-03-31 19:23:23.929195+05:30	\N
25	ASEM	Nasik Industrial Estate, Plot 45, Nasik	Nasik	contact@asem.com	+91-255-1234567	Mr. Rajesh Sharma	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
26	Ordinance Factory	Defense Road, Itarsi, Madhya Pradesh	Itarsi	info@ordinancefactory.in	+91-757-9876543	Col. Vikram Singh	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
27	Godrej	Vikhroli East, Mumbai, Maharashtra	Mumbai	business@godrej.com	+91-22-26765432	Ms. Priya Desai	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
28	ADA	Airport Road, Bangalore, Karnataka		contact@ada.gov.in	+91-80-25261234	Dr. A. K. Prasad	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
29	RCI	Imarat Hills, Kanchanbagh, Hyderabad	Hyderabad	admin@rci.drdo.in	+91-40-24561278	Dr. S. N. Rao	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
30	ATCP	BHEL Complex, Delhi	Delhi	atcp.delhi@bhel.in	+91-11-26784561	Mr. Anil Kumar	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
31	ATCP	BHEL Complex, Vishakhapatnam	Delhi (BHEL & SBC - Vizag)	atcp.vizag@bhel.in	+91-891-2765432	Mr. Suresh Naidu	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
32	Mr. Harish Jevargi	123 Business Lane, Hubli, Karnataka		harish.jevargi@email.com	+91-836-9871234	Mr. Harish Jevargi	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
33	IIJT	Institute of Jewelery Technology Complex, Bhubaneswar	Bhubaneswar & HMT	iijt.bbsr@gov.in	+91-674-2387654	Prof. R. K. Mishra	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
34	ISH	Precision Tools Division, Pune, Maharashtra	Precision Tools	ish.pune@precision.com	+91-20-26784321	Mr. Deepak Pawar	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
35	SFC	Steel Fabrication Complex, Jagadalpur	Jagadalpur	sfc.jgd@steel.gov.in	+91-7782-234567	Mr. S. K. Verma	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
36	SACEM	Nasik Defense Park, Plot 12	Nasik	sacem.nasik@defense.com	+91-255-8765432	Col. R. S. Patil	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
37	Hinetic Electronics	Electronic City, Bangalore, Karnataka		info@hineticelectronics.com	+91-80-28561234	Ms. Kavita Reddy	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
38	LPSC	Vikram Sarabhai Space Centre, Trivandrum	Trivadrum	lpsc@vssc.gov.in	+91-471-2567891	Dr. V. R. Gowarikar	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
39	MHI	Industrial Machinery Division, Tokyo Office India		india@mhi.com	+91-22-27651234	Mr. T. Yamamoto	2026-03-31 19:23:43.487969+05:30	2026-03-31 19:23:43.487969+05:30	\N
\.


--
-- Data for Name: machines; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.machines (id, work_center_id, type, make, model, year_of_installation, cnc_controller, cnc_controller_service, remarks, calibration_date, calibration_due_date, password, user_id) FROM stdin;
13	3	Milling	DECKEL MAHO	DMU125U	2011	Sinumerik 840D 6FC5250-6BX30-5AH0	\N	Driver- SIMODRIVE LT and SIMODRIVE\r\nSoftware Version - 06.05.30,Bios-Version:V5.1	2011-02-02 13:00:00	2019-02-12 13:00:00	1234	16
14	3	Milling	ACE MICROMATIC	AMS 850	2025	Fanuc series 0i-MF PLUS, MT Connect	\N	Drivers - Fanuc driver\r\nSoftware Version - 	2025-04-08 13:00:00	2026-02-08 13:00:00	1234	16
15	3	Milling	Mitsubishi	MV5C	\N	Fanuc series 21-M	\N	Driver - Fanuc driver\r\nSoftware Version - DDA1-09	2022-02-08 18:30:00	2023-02-16 18:30:00	1234	16
16	3	Milling	MIKRON	WF41C	2003	Siemens 810D,6FC5450-6AY03-5AH0	\N	Driver - SIMODRIVE 611\r\nSoftware Version - 06.05.45-CCU3E,BIOS-Version:V1.7	2022-02-06 18:30:00	2026-02-10 18:30:00	1234	16
17	3	Milling	TDS	TDA	2008	Sinumerik 840D,6FC5250-6CY30-5AH0	\N	Driver- SIMODRIVE 611\r\nSoftware Version - 06.05.48,BIOS -VERSION:V3.2	2026-01-05 18:30:00	2026-01-31 18:30:00	1234	16
18	3	Milling	BFW BMV-50	BMV-50	2006	Siemens 810D,570.871.9010.24.36	\N	Driver - SIMODRIVE 611\r\nSoftware Version - 02.04.36-CCU1E	2026-02-07 18:30:00	2026-02-07 18:30:00	1234	16
19	3	Milling	34-48 Herders-deevlige sparmatic jigmill	34-48 Herders-deevlige 	1998	\N	\N	Driver - Fanuc driver\r\nSoftware Version - 	2026-01-31 13:00:00	2026-02-07 13:00:00	1234	16
20	3	Milling	DMU 60	DMU 60	\N	Heidenhein TNC 430	\N	Drivers - \r\nSoftware versions	2025-11-17 18:30:00	2026-02-21 18:30:00	1234	16
35	8	DIE SINKING	ONA-QX3F	ONA-QX3F	2025	Beckhoff	\N	Driver - Panasonic\r\nSoftware version - 	2024-02-05 18:30:00	2026-03-16 00:00:00	1234	16
33	6	Grinding 	Magerle	Magerle	80	sdfghj	asdfghj	Driver - \r\nSoftware version -	2023-02-05 18:30:00	2026-02-02 18:30:00	1234	16
22	2	Turning 	Stallion 200	Stallion 200	1998	Fanuc India series-OT	\N	Driver - Fanuc driver\r\nSoftware version	2026-02-07 18:30:00	2026-02-23 18:30:00	1234	16
21	3	Milling	DMU80C	DMU80C	\N	\N	\N	Driver -\r\nSoftware versions -	2026-02-07 18:30:00	2026-02-22 18:30:00	1234	16
23	2	Turning 	TC 46-MC	TC 46-MC	1998	Sinumerik 810D,6FC5450-4AY01-3AH0	\N	Driver - SIMODRIVE 611	2026-02-22 18:30:00	2028-02-04 18:30:00	1234	16
24	2	Turning 	Mazak super	 Quick Turn 10M	1996	S7-1200 PLC CPU 1214C,FCA535LHY	\N	Driver - Fanuc Driver\r\nSoftware version - M5XW250085X	2026-02-15 18:30:00	2026-03-10 18:30:00	1234	16
25	2	Turning 	Tekcel	TXLE-1015	2025	Fanuc series OI-TF plus	\N	Driver - Siemens\r\nSoftware version - Fanuc series OI-TF plus	2025-02-02 18:30:00	2026-02-05 18:30:00	1234	16
26	2	Turning 	STC	STC25	2002	Siemens 810D,6FC5450-6AY03-3AH0	\N	Driver - SIMODRIVE 611	2026-02-08 18:30:00	2026-02-20 18:30:00	1234	16
27	2	Turning 	Pinacho	Pinacho 225	\N	Fanuc GE  series oi Mate Tc	\N	Driver - Fanuc driver\r\nSoftware version - Fanuc GE  series oi Mate Tc	2026-02-08 18:30:00	2026-02-27 18:30:00	1234	16
28	2	Turning 	Schublin	Schublin 125-I	\N	\N	\N	Driver - \r\nSoftware version 	2026-02-14 18:30:00	2026-02-26 18:30:00	1234	16
29	2	Turning 	Schublin	Schublin 125-II	\N	\N	\N	Driver - \r\nSoftware Version -	2026-02-08 13:00:00	2026-02-27 13:00:00	1234	16
30	5	Grinding 	Kellenberger	Kellenberger	1989	\N	\N	Driver - \r\nSoftware version - 	2026-01-31 13:00:00	2026-02-27 13:00:00	1234	16
31	5	Grinding 	Voumard	Voumard	\N	\N	\N	Driver - \r\nSoftware version - 	2026-01-31 18:30:00	2026-02-24 18:30:00	1234	16
32	5	Grinding 	Studer	Studer RHU 650	\N	\N	\N	Driver - \r\nSoftware version  - 	2024-02-03 18:30:00	2027-02-05 18:30:00	1234	16
34	7	Grinding 	Reisauer	Rsauer	\N	\N	\N	Driver - \r\nSoftware version 	2026-03-10 00:00:00	2025-03-10 00:00:00	1234	16
36	6	Grinding 	HMT-500	Magerle	-3	asdfg	asdfghj	asdfgh	2026-03-10 00:00:00	2025-12-01 00:00:00	1234	16
\.


--
-- Data for Name: pokayoke_checklist_items; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.pokayoke_checklist_items (id, checklist_id, item_text, sequence_number, item_type, is_required, expected_value, created_at) FROM stdin;
2	1	Coolant pump off	1	numerical	t	50	2026-02-16 06:28:11.973811
3	1	Use gloves	2	boolean	t	yes	2026-02-16 06:29:48.746667
9	1	draw	3	numerical	t	30	2026-02-17 10:42:04.852477
16	12	Machine surface cleaned and free of chips/debris	1	boolean	t	true	2026-04-09 11:25:43.390527
17	12	All lubrication levels checked and at proper levels	2	boolean	t	true	2026-04-09 11:25:43.393061
18	12	Coolant level is above minimum mark	3	boolean	t	true	2026-04-09 11:25:43.394142
19	12	Coolant concentration percentage	4	numerical	t	8-12	2026-04-09 11:25:43.394142
20	12	Air pressure reading at regulator	5	numerical	t	80-100	2026-04-09 11:25:43.395179
21	12	Spindle running smoothly without unusual noise	6	boolean	t	true	2026-04-09 11:25:43.395179
22	12	All emergency stop buttons tested and functional	7	boolean	t	true	2026-04-09 11:25:43.395179
23	12	Chip conveyor operating normally	8	boolean	t	true	2026-04-09 11:25:43.395179
24	12	Door interlocks functioning correctly	9	boolean	t	true	2026-04-09 11:25:43.397752
25	12	Operator notes any anomalies	10	text	t	OK	2026-04-09 11:25:43.397752
36	14	Complete chip removal from all compartments	1	boolean	t	true	2026-04-09 11:25:43.408757
37	14	Coolant tank drained and cleaned	2	boolean	t	true	2026-04-09 11:25:43.409291
38	14	Hydraulic oil level and condition check	3	boolean	t	true	2026-04-09 11:25:43.409291
39	14	Hydraulic pressure reading	4	numerical	t	1000-1200	2026-04-09 11:25:43.409291
40	14	Axis positioning accuracy verified	5	boolean	t	true	2026-04-09 11:25:43.411326
41	14	Repeatability test results within tolerance	6	boolean	t	true	2026-04-09 11:25:43.411855
42	14	Spindle runout measured	7	numerical	t	<=0.005	2026-04-09 11:25:43.412382
43	14	All safety guards and interlocks tested	8	boolean	t	true	2026-04-09 11:25:43.41342
44	14	Parameter backup completed	9	boolean	t	true	2026-04-09 11:25:43.41342
45	14	Next maintenance due date recorded	10	text	t	Recorded	2026-04-09 11:25:43.41342
46	15	Hydraulic oil level at sight glass	1	boolean	t	true	2026-04-09 11:25:43.416798
47	15	Operating pressure within range	2	numerical	t	150-200	2026-04-09 11:25:43.416798
48	15	No visible hydraulic leaks detected	3	boolean	t	true	2026-04-09 11:25:43.417801
49	15	Two-hand controls functioning properly	4	boolean	t	true	2026-04-09 11:25:43.418902
50	15	Light curtains tested and operational	5	boolean	t	true	2026-04-09 11:25:43.419407
51	15	Die area clear of obstructions	6	boolean	t	true	2026-04-09 11:25:43.419407
52	15	Press stroke smooth and uniform	7	boolean	t	true	2026-04-09 11:25:43.419407
53	15	Emergency stop button tested	8	boolean	t	true	2026-04-09 11:25:43.419407
54	15	Workbench condition satisfactory	9	boolean	t	true	2026-04-09 11:25:43.419407
55	15	Operator safety PPE verified	10	boolean	t	true	2026-04-09 11:25:43.419407
56	16	Chuck jaws clean and properly seated	1	boolean	t	true	2026-04-09 11:25:43.425552
57	16	Tailstock quill moves smoothly	2	boolean	t	true	2026-04-09 11:25:43.426265
58	16	Tailstock alignment checked	3	boolean	t	true	2026-04-09 11:25:43.426418
59	16	Spindle speed range tested	4	boolean	t	true	2026-04-09 11:25:43.427424
60	16	Feed rate mechanism functioning	5	boolean	t	true	2026-04-09 11:25:43.427424
61	16	Carriage movement smooth on bed	6	boolean	t	true	2026-04-09 11:25:43.428424
62	16	Tool post securely locked	7	boolean	t	true	2026-04-09 11:25:43.429424
63	16	Bed ways cleaned and lubricated	8	boolean	t	true	2026-04-09 11:25:43.429424
64	16	Chip guard in place and secure	9	boolean	t	true	2026-04-09 11:25:43.429424
65	16	Daily run hours recorded	10	numerical	t	>=0	2026-04-09 11:25:43.431019
66	17	Table surface cleaned and inspected for damage	1	boolean	t	true	2026-04-09 11:25:43.431019
67	17	T-slots cleaned and deburred	2	boolean	t	true	2026-04-09 11:25:43.433766
68	17	Knee and column gibs adjustment checked	3	boolean	t	true	2026-04-09 11:25:43.434359
69	17	Spindle taper cleaned and inspected	4	boolean	t	true	2026-04-09 11:25:43.435242
70	17	Gearbox oil level verified	5	boolean	t	true	2026-04-09 11:25:43.435635
71	17	Power feed operation tested all directions	6	boolean	t	true	2026-04-09 11:25:43.43687
72	17	Drawbar condition and torque verified	7	boolean	t	true	2026-04-09 11:25:43.43687
73	17	Brake functionality tested	8	boolean	t	true	2026-04-09 11:25:43.437942
74	17	V-belt tension checked	9	boolean	t	true	2026-04-09 11:25:43.438501
75	17	Maintenance comments	10	text	t	None	2026-04-09 11:25:43.438501
76	18	Grinding wheel condition inspected for cracks	1	boolean	t	true	2026-04-09 11:25:43.441113
77	18	Wheel guard properly secured	2	boolean	t	true	2026-04-09 11:25:43.441113
78	18	Magnetic chuck surface clean and flat	3	boolean	t	true	2026-04-09 11:25:43.442631
79	18	Chuck holding power verified	4	boolean	t	true	2026-04-09 11:25:43.442631
80	18	Coolant flow rate adequate	5	boolean	t	true	2026-04-09 11:25:43.44419
81	18	Coolant nozzle positioned correctly	6	boolean	t	true	2026-04-09 11:25:43.44419
82	18	Table traverse smooth and even	7	boolean	t	true	2026-04-09 11:25:43.445194
83	18	Cross feed mechanism functioning	8	boolean	t	true	2026-04-09 11:25:43.446216
84	18	Spindle bearings temperature normal	9	boolean	t	true	2026-04-09 11:25:43.446216
85	18	Wheel speed RPM	10	numerical	t	1800-3600	2026-04-09 11:25:43.447217
86	19	Dielectric fluid level and quality checked	1	boolean	t	true	2026-04-09 11:25:43.449793
87	19	Dielectric resistivity measured	2	numerical	t	50-100	2026-04-09 11:25:43.450308
88	19	Filter cartridge condition inspected	3	boolean	t	true	2026-04-09 11:25:43.450308
89	19	Work tank cleaned of debris	4	boolean	t	true	2026-04-09 11:25:43.450308
90	19	Electrode holder inspected	5	boolean	t	true	2026-04-09 11:25:43.451848
91	19	Power contacts cleaned	6	boolean	t	true	2026-04-09 11:25:43.452338
92	19	Servo system response tested	7	boolean	t	true	2026-04-09 11:25:43.453347
93	19	Gap voltage calibration verified	8	boolean	t	true	2026-04-09 11:25:43.453347
94	19	Fire suppression system checked	9	boolean	t	true	2026-04-09 11:25:43.453347
95	19	Weekly operating hours	10	numerical	t	>=0	2026-04-09 11:25:43.453347
96	20	Hopper has sufficient material	1	boolean	t	true	2026-04-09 11:25:43.457339
97	20	Barrel temperature zones at set points	2	boolean	t	true	2026-04-09 11:25:43.458343
98	20	Mold clamping force adequate	3	boolean	t	true	2026-04-09 11:25:43.458891
99	20	Injection pressure reading	4	numerical	t	80-150	2026-04-09 11:25:43.460015
100	20	Mold cooling water flow verified	5	boolean	t	true	2026-04-09 11:25:43.460015
101	20	Ejector pins move freely	6	boolean	t	true	2026-04-09 11:25:43.460015
102	20	Safety door interlocks functioning	7	boolean	t	true	2026-04-09 11:25:43.461523
103	20	Hydraulic system pressure stable	8	boolean	t	true	2026-04-09 11:25:43.462053
104	20	Cycle time within specification	9	numerical	t	15-60	2026-04-09 11:25:43.463056
105	20	Part quality check completed	10	boolean	t	true	2026-04-09 11:25:43.463056
106	21	All axis joints visually inspected	1	boolean	t	true	2026-04-09 11:25:43.463056
107	21	Joint lubrication levels checked	2	boolean	t	true	2026-04-09 11:25:43.463056
108	21	End effector/gripper condition verified	3	boolean	t	true	2026-04-09 11:25:43.463056
109	21	Cable dress pack inspected for wear	4	boolean	t	true	2026-04-09 11:25:43.468093
110	21	Controller fan operation verified	5	boolean	t	true	2026-04-09 11:25:43.468943
111	21	Home position accuracy checked	6	boolean	t	true	2026-04-09 11:25:43.469447
112	21	Teach pendant cable condition	7	boolean	t	true	2026-04-09 11:25:43.469447
113	21	Safety fence and scanners tested	8	boolean	t	true	2026-04-09 11:25:43.469447
114	21	Backup of programs completed	9	boolean	t	true	2026-04-09 11:25:43.469447
115	21	Repeatability test deviation	10	numerical	t	<=0.02	2026-04-09 11:25:43.469447
116	22	test1	1	boolean	t	0	2026-04-28 13:25:49.064376
117	22	test2	2	boolean	t	yes	2026-04-28 13:25:49.064376
\.


--
-- Data for Name: pokayoke_checklists; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.pokayoke_checklists (id, name, description, created_at) FROM stdin;
1	Dry machining	Critical jobs which are assembled and//or dry machining recommended	2026-02-16 06:18:36.990118
2	Plating allowance	For parts which undergo platings	2026-02-16 06:20:58.236393
18	Surface Grinder 	Daily checks for surface grinding machines to ensure precision grinding and safety	2026-04-09 11:25:43.441113
17	Milling Machine 	Weekly maintenance tasks for vertical and horizontal milling machines	2026-04-09 11:25:43.431019
16	Lathe Machine 	Daily inspection routine for turning centers and lathes to maintain precision and safety	2026-04-09 11:25:43.42464
15	Hydraulic Press 	Daily safety and operational checks for hydraulic press machines to prevent accidents and ensure performance	2026-04-09 11:25:43.416204
14	CNC Machine 	Monthly thorough inspection and maintenance for CNC machines including calibration checks	2026-04-09 11:25:43.407213
12	CNC Machine 	Daily preventive maintenance checks for CNC machining centers to ensure operational safety and accuracy	2026-04-09 11:25:43.390527
19	EDM Machine 	Weekly maintenance for Electrical Discharge Machining equipment to maintain cutting accuracy	2026-04-09 11:25:43.447217
20	Injection Molding Machine 	Daily inspection for injection molding machines to ensure product quality and machine longevity	2026-04-09 11:25:43.457339
21	Industrial Robotic Arm 	Weekly preventive maintenance for industrial robotic arms to ensure precision and safety	2026-04-09 11:25:43.463056
22	TEST	TESTCASE 	2026-04-28 13:25:49.052012
\.


--
-- Data for Name: pokayoke_completed_logs; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.pokayoke_completed_logs (id, checklist_id, machine_id, operator_id, production_order_id, part_id, completed_at, all_items_passed, comments, read, assignment_id, frequency, shift, operator_acknowledged, operator_acknowledged_at, supervisor_acknowledged, supervisor_acknowledged_at, supervisor_id) FROM stdin;
\.


--
-- Data for Name: pokayoke_item_responses; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.pokayoke_item_responses (id, completed_log_id, item_id, response_value, is_confirming, "timestamp", approval_status, approved_by, approved_at, approval_comments) FROM stdin;
69	19	106	yes	t	2026-04-16 10:39:49.208	approved	16	2026-04-16 11:25:30.912673	
70	19	107	yes	t	2026-04-16 10:39:49.342	approved	16	2026-04-16 11:25:55.892881	
161	28	78	yes	f	2026-04-27 12:28:36.732	approved	32	2026-04-27 14:43:03.242144	
71	19	108	yes	t	2026-04-16 10:39:49.355	approved	16	2026-04-16 11:26:12.110341	
72	19	109	yes	t	2026-04-16 10:39:49.369	approved	16	2026-04-16 11:26:14.504291	
73	19	110	yes	t	2026-04-16 10:39:49.381	approved	16	2026-04-16 11:26:16.405676	
74	19	111	yes	t	2026-04-16 10:39:49.396	approved	16	2026-04-16 11:26:19.304181	
75	19	112	yes	t	2026-04-16 10:39:49.41	approved	16	2026-04-16 11:26:22.200508	
76	19	113	yes	t	2026-04-16 10:39:49.421	approved	16	2026-04-16 11:26:23.998363	
138	25	115	0.02	f	2026-04-20 15:04:28.428	approved	30	2026-04-28 09:55:40.570315	
129	25	106	yes	f	2026-04-20 15:04:28.275	approved	30	2026-04-21 09:19:33.293255	
132	25	109	yes	f	2026-04-20 15:04:28.334	approved	30	2026-04-21 09:19:35.612097	
162	28	79	yes	f	2026-04-27 12:28:36.747	approved	32	2026-04-27 14:44:07.939291	
137	25	114	yes	f	2026-04-20 15:04:28.412	approved	30	2026-04-27 10:00:37.706113	
79	20	106	yes	t	2026-04-16 10:49:47.613	approved	16	2026-04-16 11:39:17.082104	
119	24	96	yes	t	2026-04-16 12:40:05.798	\N	\N	\N	\N
122	24	99	54	f	2026-04-16 12:40:05.85	\N	\N	\N	\N
123	24	100	no	f	2026-04-16 12:40:05.867	\N	\N	\N	\N
124	24	101	yes	t	2026-04-16 12:40:05.884	\N	\N	\N	\N
125	24	102	no	f	2026-04-16 12:40:05.901	\N	\N	\N	\N
126	24	103	yes	t	2026-04-16 12:40:05.917	\N	\N	\N	\N
127	24	104	558	f	2026-04-16 12:40:05.935	\N	\N	\N	\N
128	24	105	yes	t	2026-04-16 12:40:05.955	\N	\N	\N	\N
78	19	115	0.02	f	2026-04-16 10:39:49.451	approved	32	2026-04-16 13:34:57.590406	
77	19	114	yes	f	2026-04-16 10:39:49.435	rejected	32	2026-04-16 13:49:30.177819	
88	20	115	0.02	f	2026-04-16 10:49:47.777	approved	32	2026-04-16 13:52:40.849593	
86	20	113	yes	f	2026-04-16 10:49:47.738	approved	32	2026-04-16 13:53:57.389994	
85	20	112	yes	f	2026-04-16 10:49:47.72	approved	32	2026-04-16 13:53:59.359659	
84	20	111	yes	f	2026-04-16 10:49:47.703	approved	32	2026-04-16 13:54:01.823477	
83	20	110	yes	f	2026-04-16 10:49:47.687	approved	32	2026-04-16 13:54:03.616807	
82	20	109	yes	f	2026-04-16 10:49:47.671	approved	32	2026-04-16 13:54:05.367224	
81	20	108	yes	f	2026-04-16 10:49:47.653	approved	32	2026-04-16 13:54:07.102107	
163	28	80	yes	f	2026-04-27 12:28:36.769	approved	32	2026-04-27 14:44:12.652875	
89	21	106	yes	f	2026-04-16 11:46:05.912	approved	30	2026-04-28 09:58:02.318234	
87	20	114	yes	f	2026-04-16 10:49:47.757	approved	32	2026-04-16 13:55:03.118743	
80	20	107	yes	f	2026-04-16 10:49:47.636	approved	32	2026-04-16 13:55:06.620351	
91	21	108	yes	f	2026-04-16 11:46:05.962	approved	32	2026-04-16 13:55:44.423912	
92	21	109	yes	f	2026-04-16 11:46:05.977	approved	32	2026-04-16 13:55:46.494475	
93	21	110	yes	f	2026-04-16 11:46:05.989	approved	32	2026-04-16 13:55:48.839175	
94	21	111	yes	f	2026-04-16 11:46:06.012	approved	32	2026-04-16 13:55:50.855714	
95	21	112	yes	f	2026-04-16 11:46:06.031	approved	32	2026-04-16 13:55:54.257006	
96	21	113	yes	f	2026-04-16 11:46:06.046	approved	32	2026-04-16 13:55:56.999835	
97	21	114	yes	f	2026-04-16 11:46:06.061	approved	32	2026-04-16 13:55:58.960208	
98	21	115	0.01	f	2026-04-16 11:46:06.078	approved	32	2026-04-16 14:02:47.10977	
121	24	98	no	f	2026-04-16 12:40:05.833	rejected	32	2026-04-16 14:04:01.720247	
120	24	97	yes	f	2026-04-16 12:40:05.814	approved	32	2026-04-16 14:04:08.894422	
164	28	81	yes	f	2026-04-27 12:28:36.785	approved	32	2026-04-27 14:44:28.341415	
130	25	107	yes	f	2026-04-20 15:04:28.302	approved	30	2026-04-21 09:18:32.934723	
131	25	108	yes	f	2026-04-20 15:04:28.319	approved	30	2026-04-21 09:18:34.334748	
165	28	82	yes	f	2026-04-27 12:28:36.799	approved	32	2026-04-27 14:44:30.043503	
133	25	110	yes	f	2026-04-20 15:04:28.349	approved	30	2026-04-21 09:18:38.696962	
134	25	111	yes	f	2026-04-20 15:04:28.365	approved	30	2026-04-21 09:18:40.552405	
135	25	112	yes	f	2026-04-20 15:04:28.381	approved	30	2026-04-21 09:18:43.85229	
136	25	113	yes	f	2026-04-20 15:04:28.396	approved	30	2026-04-21 09:18:47.152025	
159	28	76	yes	f	2026-04-27 12:28:36.688	approved	32	2026-04-27 14:42:58.232861	
160	28	77	yes	f	2026-04-27 12:28:36.714	approved	32	2026-04-27 14:43:00.785813	
166	28	83	yes	f	2026-04-27 12:28:36.816	approved	32	2026-04-27 14:44:31.653715	
167	28	84	yes	f	2026-04-27 12:28:36.832	approved	32	2026-04-27 14:44:34.287696	
168	28	85	2000	f	2026-04-27 12:28:36.846	approved	32	2026-04-27 14:44:36.315835	
149	27	106	yes	f	2026-04-27 12:11:10.446	approved	32	2026-04-27 14:45:03.894162	
153	27	110	yes	f	2026-04-27 12:11:10.571	approved	30	2026-04-27 14:50:06.020906	
154	27	111	yes	f	2026-04-27 12:11:10.59	approved	30	2026-04-27 14:50:09.056916	
150	27	107	yes	f	2026-04-27 12:11:10.506	approved	30	2026-04-27 14:49:36.492184	
151	27	108	yes	f	2026-04-27 12:11:10.529	approved	30	2026-04-27 14:49:39.470036	
152	27	109	yes	f	2026-04-27 12:11:10.549	approved	30	2026-04-27 14:49:45.207368	
155	27	112	yes	f	2026-04-27 12:11:10.606	approved	30	2026-04-27 14:50:12.780103	
158	27	115	0.1	f	2026-04-27 12:11:10.658	approved	30	2026-04-27 14:50:15.645019	
157	27	114	yes	f	2026-04-27 12:11:10.641	approved	30	2026-04-27 14:50:17.758049	
156	27	113	yes	f	2026-04-27 12:11:10.623	approved	30	2026-04-27 14:50:19.529598	
178	29	85	1999	t	2026-04-28 09:42:04.502	approved	30	2026-04-28 10:08:14.763932	
169	29	76	yes	f	2026-04-28 09:42:04.315	approved	30	2026-04-28 10:08:35.513154	
171	29	78	yes	f	2026-04-28 09:42:04.373	approved	30	2026-04-28 10:01:41.12782	
172	29	79	yes	t	2026-04-28 09:42:04.393	approved	30	2026-04-28 10:07:02.680915	
90	21	107	yes	f	2026-04-16 11:46:05.941	approved	30	2026-04-28 10:09:21.331171	
177	29	84	yes	t	2026-04-28 09:42:04.481	approved	30	2026-04-28 10:08:16.54665	
176	29	83	yes	t	2026-04-28 09:42:04.464	approved	30	2026-04-28 10:08:18.217684	
175	29	82	yes	t	2026-04-28 09:42:04.45	approved	30	2026-04-28 10:08:19.891796	
174	29	81	yes	t	2026-04-28 09:42:04.434	approved	30	2026-04-28 10:08:21.77099	
173	29	80	yes	t	2026-04-28 09:42:04.414	approved	30	2026-04-28 10:08:24.187662	
170	29	77	yes	f	2026-04-28 09:42:04.351	approved	30	2026-04-28 10:08:26.591646	
181	30	78	yes	t	2026-04-28 10:10:38.11	approved	30	2026-04-28 10:10:59.954659	
182	30	79	yes	t	2026-04-28 10:10:38.126	approved	30	2026-04-28 10:11:01.764027	
184	30	81	yes	t	2026-04-28 10:10:38.151	approved	30	2026-04-28 10:11:09.179387	
185	30	82	yes	t	2026-04-28 10:10:38.164	approved	30	2026-04-28 10:11:10.971325	
186	30	83	yes	t	2026-04-28 10:10:38.178	approved	30	2026-04-28 10:11:12.907132	
179	30	76	yes	t	2026-04-28 10:10:38.072	approved	30	2026-04-28 10:10:56.803589	
180	30	77	yes	t	2026-04-28 10:10:38.093	approved	30	2026-04-28 10:10:58.609681	
183	30	80	yes	t	2026-04-28 10:10:38.139	approved	30	2026-04-28 10:11:03.491638	
187	30	84	yes	t	2026-04-28 10:10:38.191	approved	30	2026-04-28 10:11:15.313808	
188	30	85	1999	t	2026-04-28 10:10:38.204	approved	30	2026-04-28 10:11:49.06542	
189	31	106	yes	t	2026-04-28 10:12:57.353	approved	30	2026-04-28 10:20:14.0528	
190	31	107	yes	t	2026-04-28 10:12:57.369	approved	30	2026-04-28 10:20:16.002931	
191	31	108	yes	t	2026-04-28 10:12:57.385	approved	30	2026-04-28 10:20:17.616071	
196	31	113	yes	t	2026-04-28 10:12:57.465	approved	30	2026-04-28 10:20:23.546681	
197	31	114	yes	t	2026-04-28 10:12:57.486	approved	30	2026-04-28 10:20:25.147335	
194	31	111	no	f	2026-04-28 10:12:57.432	rejected	30	2026-04-28 10:20:50.145633	
193	31	110	no	f	2026-04-28 10:12:57.415	rejected	32	2026-04-28 10:42:35.107347	
302	44	96	yes	t	2026-04-28 14:09:18.598	approved	30	2026-04-28 14:09:40.408444	
305	44	99	80	t	2026-04-28 14:09:18.655	approved	30	2026-04-28 14:09:50.284573	
308	44	102	yes	t	2026-04-28 14:09:18.72	approved	30	2026-04-28 14:09:51.822945	
246	36	83	yes	t	2026-04-28 11:18:10.81	approved	30	2026-04-28 11:26:51.250943	
248	36	85	3500	t	2026-04-28 11:18:10.896	approved	30	2026-04-28 11:26:54.469759	
247	36	84	yes	t	2026-04-28 11:18:10.873	approved	30	2026-04-28 11:26:56.299345	
245	36	82	yes	t	2026-04-28 11:18:10.795	approved	30	2026-04-28 11:26:59.062105	
244	36	81	yes	t	2026-04-28 11:18:10.777	approved	30	2026-04-28 11:27:00.837733	
243	36	80	yes	t	2026-04-28 11:18:10.762	approved	30	2026-04-28 11:27:02.942562	
242	36	79	yes	t	2026-04-28 11:18:10.747	approved	30	2026-04-28 11:27:04.966057	
241	36	78	yes	t	2026-04-28 11:18:10.731	approved	30	2026-04-28 11:27:06.716989	
240	36	77	yes	t	2026-04-28 11:18:10.712	approved	30	2026-04-28 11:27:08.42902	
249	37	106	yes	t	2026-04-28 11:30:43.253	approved	30	2026-04-28 11:30:56.93618	
252	37	109	yes	t	2026-04-28 11:30:43.36	approved	30	2026-04-28 11:30:58.342099	
255	37	112	yes	t	2026-04-28 11:30:43.437	approved	30	2026-04-28 11:30:59.693986	
258	37	115	0.02	t	2026-04-28 11:30:43.504	approved	30	2026-04-28 11:31:01.358713	
259	38	106	yes	t	2026-04-28 11:31:45.238	\N	\N	\N	\N
260	38	107	yes	t	2026-04-28 11:31:45.262	\N	\N	\N	\N
262	38	109	yes	t	2026-04-28 11:31:45.309	\N	\N	\N	\N
263	38	110	yes	t	2026-04-28 11:31:45.33	\N	\N	\N	\N
265	38	112	yes	t	2026-04-28 11:31:45.366	\N	\N	\N	\N
266	38	113	yes	t	2026-04-28 11:31:45.383	\N	\N	\N	\N
268	38	115	0.02	t	2026-04-28 11:31:45.413	\N	\N	\N	\N
278	39	105	no	f	2026-04-28 11:34:35.873	rejected	30	2026-04-28 11:34:56.071136	
276	39	103	yes	t	2026-04-28 11:34:35.843	approved	30	2026-04-28 11:34:58.277536	
275	39	102	yes	t	2026-04-28 11:34:35.827	approved	30	2026-04-28 11:34:59.773864	
273	39	100	yes	t	2026-04-28 11:34:35.787	approved	30	2026-04-28 11:35:01.013793	
272	39	99	80	t	2026-04-28 11:34:35.759	approved	30	2026-04-28 11:35:02.567844	
270	39	97	yes	t	2026-04-28 11:34:35.707	approved	30	2026-04-28 11:35:04.056045	
269	39	96	yes	t	2026-04-28 11:34:35.68	approved	30	2026-04-28 11:35:06.525595	
282	41	78	yes	t	2026-04-28 12:16:07.585	approved	30	2026-04-28 12:18:10.378073	
283	41	79	yes	t	2026-04-28 12:16:07.602	approved	30	2026-04-28 12:18:11.702774	
285	41	81	no	f	2026-04-28 12:16:07.637	rejected	30	2026-04-28 12:18:13.11913	
286	41	82	yes	t	2026-04-28 12:16:07.659	approved	30	2026-04-28 12:18:15.200634	
288	41	84	yes	t	2026-04-28 12:16:07.69	approved	30	2026-04-28 12:18:16.79377	
289	41	85	1800	t	2026-04-28 12:16:07.707	approved	30	2026-04-28 12:18:18.798393	
280	41	76	yes	t	2026-04-28 12:16:07.528	approved	30	2026-04-28 12:22:39.142477	
291	42	81	yes	t	2026-04-28 13:05:18.785	approved	30	2026-04-28 13:33:44.921784	
293	43	107	yes	t	2026-04-28 14:03:48.662	approved	30	2026-04-28 14:04:02.257744	
296	43	110	yes	t	2026-04-28 14:03:48.714	approved	30	2026-04-28 14:04:04.307759	
299	43	113	yes	t	2026-04-28 14:03:48.762	approved	30	2026-04-28 14:04:06.267927	
311	44	105	no	f	2026-04-28 14:09:18.769	rejected	30	2026-04-28 14:09:29.860705	
312	45	108	yes	t	2026-04-28 14:43:39.748	approved	30	2026-04-28 14:45:27.12029	
314	47	76	yes	t	2026-04-28 14:44:35.567	approved	30	2026-04-28 14:45:36.511799	
315	47	77	yes	t	2026-04-28 14:44:35.589	approved	30	2026-04-28 14:45:38.343776	
317	47	79	yes	t	2026-04-28 14:44:35.634	approved	30	2026-04-28 14:45:40.208319	
318	47	80	yes	t	2026-04-28 14:44:35.651	approved	30	2026-04-28 14:45:41.84497	
320	47	82	yes	t	2026-04-28 14:44:35.687	approved	30	2026-04-28 14:45:43.44159	
321	47	83	yes	t	2026-04-28 14:44:35.705	approved	30	2026-04-28 14:45:45.089983	
323	47	85	3600	t	2026-04-28 14:44:35.751	approved	30	2026-04-28 14:45:46.6255	
334	49	66	yes	t	2026-04-28 15:00:35.732	approved	30	2026-04-28 15:01:12.958427	
336	49	68	yes	t	2026-04-28 15:00:35.782	approved	30	2026-04-28 15:01:14.446833	
337	49	69	yes	t	2026-04-28 15:00:35.805	approved	30	2026-04-28 15:01:16.512565	
339	49	71	yes	t	2026-04-28 15:00:35.839	approved	30	2026-04-28 15:01:17.807645	
340	49	72	yes	t	2026-04-28 15:00:35.858	approved	30	2026-04-28 15:01:19.093904	
342	49	74	yes	t	2026-04-28 15:00:35.892	approved	30	2026-04-28 15:01:20.417891	
343	49	75	none	t	2026-04-28 15:00:35.917	approved	30	2026-04-28 15:01:22.191549	
331	48	103	yes	t	2026-04-28 14:59:45.043	approved	30	2026-04-28 15:01:49.039946	
328	48	100	yes	t	2026-04-28 14:59:44.981	approved	30	2026-04-28 15:01:51.187608	
325	48	97	yes	t	2026-04-28 14:59:44.92	approved	30	2026-04-28 15:01:52.966522	
344	50	105	yes	t	2026-04-28 15:02:12.285	approved	30	2026-04-28 15:02:29.011787	
345	51	96	yes	t	2026-04-30 10:03:03.87	\N	\N	\N	\N
347	51	98	yes	t	2026-04-30 10:03:03.897	\N	\N	\N	\N
348	51	99	90	t	2026-04-30 10:03:03.906	\N	\N	\N	\N
350	51	101	yes	t	2026-04-30 10:03:03.924	\N	\N	\N	\N
351	51	102	yes	t	2026-04-30 10:03:03.937	\N	\N	\N	\N
353	51	104	16	t	2026-04-30 10:03:03.956	\N	\N	\N	\N
354	51	105	yes	t	2026-04-30 10:03:03.965	\N	\N	\N	\N
356	52	107	yes	f	2026-05-04 13:31:03.138	approved	30	2026-05-04 13:31:21.120811	
358	52	109	yes	f	2026-05-04 13:31:03.203	approved	30	2026-05-04 13:31:22.880316	
360	52	111	yes	f	2026-05-04 13:31:03.26	approved	30	2026-05-04 13:31:27.032659	
362	52	113	yes	f	2026-05-04 13:31:03.318	approved	30	2026-05-04 13:31:28.660664	
363	52	114	yes	f	2026-05-04 13:31:03.337	approved	30	2026-05-04 13:31:30.368974	
364	52	115	0.01	f	2026-05-04 13:31:03.36	approved	30	2026-05-04 13:31:34.206997	
355	52	106	yes	f	2026-05-04 13:31:03.066	approved	30	2026-05-04 13:31:36.22748	
357	52	108	yes	f	2026-05-04 13:31:03.173	approved	30	2026-05-04 13:31:37.917769	
192	31	109	yes	t	2026-04-28 10:12:57.399	approved	30	2026-04-28 10:20:27.996096	
195	31	112	yes	t	2026-04-28 10:12:57.448	approved	30	2026-04-28 10:20:29.940346	
239	36	76	yes	t	2026-04-28 11:18:10.69	approved	30	2026-04-28 11:27:10.509816	
198	31	115	0.1	f	2026-04-28 10:12:57.502	rejected	30	2026-04-28 10:20:52.889167	
199	32	106	yes	t	2026-04-28 10:33:48.337	\N	\N	\N	\N
200	32	107	yes	t	2026-04-28 10:33:48.352	\N	\N	\N	\N
201	32	108	yes	t	2026-04-28 10:33:48.364	\N	\N	\N	\N
202	32	109	yes	t	2026-04-28 10:33:48.378	\N	\N	\N	\N
203	32	110	yes	t	2026-04-28 10:33:48.392	\N	\N	\N	\N
204	32	111	yes	t	2026-04-28 10:33:48.428	\N	\N	\N	\N
205	32	112	yes	t	2026-04-28 10:33:48.443	\N	\N	\N	\N
206	32	113	yes	t	2026-04-28 10:33:48.458	\N	\N	\N	\N
207	32	114	yes	t	2026-04-28 10:33:48.474	\N	\N	\N	\N
208	32	115	0.01	t	2026-04-28 10:33:48.49	\N	\N	\N	\N
209	33	96	yes	f	2026-04-28 10:54:16.914	approved	30	2026-04-28 11:07:25.820465	
210	33	97	yes	f	2026-04-28 10:54:16.943	approved	30	2026-04-28 11:07:28.26339	
211	33	98	yes	f	2026-04-28 10:54:16.964	rejected	30	2026-04-28 11:07:30.67287	
212	33	99	90	f	2026-04-28 10:54:16.987	approved	30	2026-04-28 11:07:33.448747	
213	33	100	yes	f	2026-04-28 10:54:17.006	approved	30	2026-04-28 11:07:36.11975	
214	33	101	yes	f	2026-04-28 10:54:17.021	approved	30	2026-04-28 11:07:39.753161	
215	33	102	yes	f	2026-04-28 10:54:17.036	approved	30	2026-04-28 11:07:41.709855	
216	33	103	yes	f	2026-04-28 10:54:17.05	approved	30	2026-04-28 11:07:43.864129	
217	33	104	60	f	2026-04-28 10:54:17.067	approved	30	2026-04-28 11:07:49.870764	
218	33	105	yes	f	2026-04-28 10:54:17.08	approved	30	2026-04-28 11:07:51.744316	
219	34	96	yes	t	2026-04-28 11:09:06.754	\N	\N	\N	\N
220	34	97	yes	t	2026-04-28 11:09:06.781	\N	\N	\N	\N
221	34	98	yes	t	2026-04-28 11:09:06.807	\N	\N	\N	\N
222	34	99	90	t	2026-04-28 11:09:06.825	\N	\N	\N	\N
223	34	100	yes	t	2026-04-28 11:09:06.839	\N	\N	\N	\N
224	34	101	yes	t	2026-04-28 11:09:06.858	\N	\N	\N	\N
225	34	102	yes	t	2026-04-28 11:09:06.875	\N	\N	\N	\N
226	34	103	yes	t	2026-04-28 11:09:06.891	\N	\N	\N	\N
227	34	104	60	t	2026-04-28 11:09:06.905	\N	\N	\N	\N
228	34	105	yes	t	2026-04-28 11:09:06.921	\N	\N	\N	\N
229	35	76	yes	t	2026-04-28 11:15:27.582	approved	30	2026-04-28 11:15:56.215597	
230	35	77	no	f	2026-04-28 11:15:27.61	rejected	30	2026-04-28 11:15:58.062268	
231	35	78	yes	t	2026-04-28 11:15:27.634	approved	30	2026-04-28 11:16:00.01181	
232	35	79	no	f	2026-04-28 11:15:27.654	rejected	30	2026-04-28 11:16:01.899096	
233	35	80	yes	t	2026-04-28 11:15:27.674	approved	30	2026-04-28 11:16:03.813902	
234	35	81	no	f	2026-04-28 11:15:27.698	rejected	30	2026-04-28 11:16:05.898686	
235	35	82	yes	t	2026-04-28 11:15:27.72	approved	30	2026-04-28 11:16:08.756238	
236	35	83	yes	t	2026-04-28 11:15:27.736	approved	30	2026-04-28 11:16:10.684807	
237	35	84	yes	t	2026-04-28 11:15:27.752	approved	30	2026-04-28 11:16:12.237435	
238	35	85	3500	t	2026-04-28 11:15:27.768	approved	30	2026-04-28 11:16:15.987597	
250	37	107	no	f	2026-04-28 11:30:43.295	rejected	30	2026-04-28 11:31:02.877272	
251	37	108	yes	t	2026-04-28 11:30:43.327	approved	30	2026-04-28 11:31:05.071285	
253	37	110	yes	t	2026-04-28 11:30:43.386	approved	30	2026-04-28 11:31:07.630948	
254	37	111	yes	t	2026-04-28 11:30:43.41	approved	30	2026-04-28 11:31:09.341976	
256	37	113	yes	t	2026-04-28 11:30:43.462	approved	30	2026-04-28 11:31:11.485181	
257	37	114	yes	t	2026-04-28 11:30:43.484	approved	30	2026-04-28 11:31:13.653862	
261	38	108	yes	t	2026-04-28 11:31:45.285	\N	\N	\N	\N
264	38	111	yes	t	2026-04-28 11:31:45.348	\N	\N	\N	\N
267	38	114	yes	t	2026-04-28 11:31:45.398	\N	\N	\N	\N
271	39	98	yes	t	2026-04-28 11:34:35.731	approved	30	2026-04-28 11:35:09.890756	
274	39	101	yes	t	2026-04-28 11:34:35.806	approved	30	2026-04-28 11:35:12.11729	
277	39	104	15	t	2026-04-28 11:34:35.858	approved	30	2026-04-28 11:35:14.278621	
279	40	105	yes	t	2026-04-28 11:36:22.386	approved	30	2026-04-28 12:01:04.958396	
281	41	77	yes	t	2026-04-28 12:16:07.564	approved	30	2026-04-28 12:18:22.864418	
284	41	80	no	f	2026-04-28 12:16:07.622	rejected	30	2026-04-28 12:18:25.956086	
287	41	83	yes	t	2026-04-28 12:16:07.676	approved	30	2026-04-28 12:18:27.352929	
290	42	80	yes	t	2026-04-28 13:05:18.751	approved	30	2026-04-28 13:33:54.610298	
292	43	106	yes	t	2026-04-28 14:03:48.624	approved	30	2026-04-28 14:04:07.972108	
295	43	109	yes	t	2026-04-28 14:03:48.699	approved	30	2026-04-28 14:04:11.657702	
294	43	108	no	f	2026-04-28 14:03:48.68	rejected	30	2026-04-28 14:04:13.973913	
297	43	111	yes	t	2026-04-28 14:03:48.731	approved	30	2026-04-28 14:04:17.051841	
298	43	112	yes	t	2026-04-28 14:03:48.746	approved	30	2026-04-28 14:04:18.708165	
300	43	114	yes	t	2026-04-28 14:03:48.783	approved	30	2026-04-28 14:04:20.255309	
301	43	115	0.01	t	2026-04-28 14:03:48.8	approved	30	2026-04-28 14:04:22.300238	
303	44	97	yes	t	2026-04-28 14:09:18.619	approved	30	2026-04-28 14:09:53.984985	
304	44	98	yes	t	2026-04-28 14:09:18.637	approved	30	2026-04-28 14:09:56.375803	
306	44	100	yes	t	2026-04-28 14:09:18.675	approved	30	2026-04-28 14:10:00.25954	
307	44	101	yes	t	2026-04-28 14:09:18.694	approved	30	2026-04-28 14:10:02.475911	
309	44	103	yes	t	2026-04-28 14:09:18.736	approved	30	2026-04-28 14:10:04.77198	
310	44	104	15	t	2026-04-28 14:09:18.752	approved	30	2026-04-28 14:10:06.42448	
313	46	105	yes	t	2026-04-28 14:44:05.252	approved	30	2026-04-28 14:45:31.112994	
316	47	78	yes	t	2026-04-28 14:44:35.615	approved	30	2026-04-28 14:45:48.093633	
319	47	81	yes	t	2026-04-28 14:44:35.668	approved	30	2026-04-28 14:45:50.212514	
322	47	84	yes	t	2026-04-28 14:44:35.728	approved	30	2026-04-28 14:45:52.011653	
335	49	67	yes	t	2026-04-28 15:00:35.76	approved	30	2026-04-28 15:01:23.730989	
338	49	70	yes	t	2026-04-28 15:00:35.822	approved	30	2026-04-28 15:01:27.083281	
341	49	73	yes	t	2026-04-28 15:00:35.875	approved	30	2026-04-28 15:01:29.006933	
333	48	105	no	f	2026-04-28 14:59:45.088	rejected	30	2026-04-28 15:01:35.782291	
332	48	104	60	t	2026-04-28 14:59:45.065	approved	30	2026-04-28 15:01:37.627893	
330	48	102	yes	t	2026-04-28 14:59:45.023	approved	30	2026-04-28 15:01:39.014236	
329	48	101	yes	t	2026-04-28 14:59:45.003	approved	30	2026-04-28 15:01:40.585059	
327	48	99	140	t	2026-04-28 14:59:44.959	approved	30	2026-04-28 15:01:42.324625	
326	48	98	yes	t	2026-04-28 14:59:44.941	approved	30	2026-04-28 15:01:44.017968	
324	48	96	yes	t	2026-04-28 14:59:44.897	approved	30	2026-04-28 15:01:46.015222	
346	51	97	yes	t	2026-04-30 10:03:03.887	\N	\N	\N	\N
349	51	100	yes	t	2026-04-30 10:03:03.915	\N	\N	\N	\N
352	51	103	yes	t	2026-04-30 10:03:03.947	\N	\N	\N	\N
359	52	110	yes	f	2026-05-04 13:31:03.233	approved	30	2026-05-04 13:31:39.657287	
361	52	112	yes	f	2026-05-04 13:31:03.298	approved	30	2026-05-04 13:31:41.616117	
435	60	86	yes	t	2026-05-25 13:55:57.739	approved	30	2026-05-25 13:59:22.481978	
436	60	87	60	t	2026-05-25 13:55:57.765	approved	30	2026-05-25 14:34:25.144306	
437	60	88	yes	t	2026-05-25 13:55:57.793	approved	30	2026-05-25 14:35:25.680218	
438	60	89	yes	t	2026-05-25 13:55:57.811	approved	30	2026-05-25 14:35:27.363632	
439	60	90	yes	t	2026-05-25 13:55:57.83	approved	30	2026-05-25 14:35:29.113812	
440	60	91	yes	t	2026-05-25 13:55:57.844	approved	30	2026-05-25 14:35:30.56994	
441	60	92	yes	t	2026-05-25 13:55:57.855	approved	30	2026-05-25 14:35:33.041853	
442	60	93	yes	t	2026-05-25 13:55:57.868	approved	30	2026-05-25 14:35:35.074582	
443	60	94	yes	t	2026-05-25 13:55:57.882	approved	30	2026-05-25 14:35:36.678335	
444	60	95	0.1	t	2026-05-25 13:55:57.898	approved	30	2026-05-25 14:35:38.301188	
455	62	116	no	t	2026-05-27 11:32:47.748	approved	30	2026-05-27 11:33:28.093024	
456	62	117	yes	t	2026-05-27 11:32:47.782	approved	30	2026-05-27 11:33:38.740099	
\.


--
-- Data for Name: pokayoke_machine_assignments; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.pokayoke_machine_assignments (id, checklist_id, machine_id, frequency, shift, scheduled_day, assigned_at) FROM stdin;
41	21	19	Daily	Both	\N	2026-05-04 14:20:50.610652
43	2	19	Monthly	\N	8	2026-05-08 11:32:08.725492
45	19	19	Daily	Both	\N	2026-05-25 13:50:03.499242
\.


--
-- Data for Name: work_centers; Type: TABLE DATA; Schema: configuration; Owner: -
--

COPY configuration.work_centers (id, code, work_center_name, description, is_schedulable, user_id) FROM stdin;
7	TG	Thread Grinding		t	16
6	SG	Surface Grinding		t	16
5	CG	Cylindrical Grinding		t	16
3	MC	Milling center		t	16
2	TC	Turning centre		t	16
8	DS	Die Sinking		t	16
\.


--
-- Data for Name: common_documents; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.common_documents (id, folder_id, document_name, document_url, version, parent_id, created_at, updated_at, user_id) FROM stdin;
4	\N	10581593	http://172.18.7.91:9000/cmf/common_documents/root/20260223_114437_10581593_1.0.pdf	1	\N	2026-02-23 06:14:37.187638	2026-02-23 06:14:37.187638	16
5	\N	10581593	http://172.18.7.91:9000/cmf/common_documents/root/20260223_114513_10581593_1.0.pdf	1	\N	2026-02-23 06:15:13.591698	2026-02-23 06:15:13.591698	16
6	\N	Part Studio 1 - Ring Gear (1) (2)	http://172.18.7.91:9000/cmf/common_documents/root/20260223_114730_Part Studio 1 - Ring Gear (1) (2)_1.0.pdf	1	\N	2026-02-23 06:17:30.999523	2026-02-23 06:17:30.999523	16
8	\N	M8 Screw rod brass nut (1) (3)	http://172.18.7.91:9000/cmf/common_documents/root/20260223_115350_M8 Screw rod brass nut (1) (3)_1.0.pdf	1	\N	2026-02-23 06:23:50.531378	2026-02-23 06:23:50.531378	16
11	\N	Crankshaft (2)	http://172.18.7.91:9000/cmf/common_documents/root/20260223_120516_Crankshaft (2)_1.0.pdf	1	\N	2026-02-23 06:35:16.3493	2026-02-23 06:35:16.3493	16
\.


--
-- Data for Name: common_folders; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.common_folders (id, folder_name, parent_id, created_at, updated_at, user_id) FROM stdin;
\.


--
-- Data for Name: general_documents; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.general_documents (id, general_folder_id, file_name, url, version, parent_id, created_at, updated_at, user_id) FROM stdin;
49	19	TEST (2).pdf	http://172.18.7.91:9000/cmf/general_documents/19/20260223_110007_TEST (2).pdf_1.0.pdf	1	\N	2026-02-23 11:00:07.309567+05:30	2026-02-23 11:00:07.309567+05:30	16
50	19	TEST (1).pdf	http://172.18.7.91:9000/cmf/general_documents/19/20260223_111425_TEST (1).pdf_1.0.pdf	1	\N	2026-02-23 11:14:25.78605+05:30	2026-02-23 11:14:25.78605+05:30	16
51	19	TEST (3).pdf	http://172.18.7.91:9000/cmf/general_documents/19/20260223_111444_TEST (3).pdf_1.0.pdf	1	\N	2026-02-23 11:14:44.576719+05:30	2026-02-23 11:14:44.576719+05:30	16
52	19	MPP-211090550086-Machined Stamped Part (1).pdf	http://172.18.7.91:9000/cmf/general_documents/19/20260223_111451_MPP-211090550086-Machined Stamped Part (1).pdf_2.0.pdf	2	49	2026-02-23 11:14:51.683368+05:30	2026-02-23 11:14:51.683368+05:30	16
58	38	Inventory_Boring Bar.xlsx	http://172.18.7.91:9000/cmf/general_documents/38/20260323_113424_DOC21_1.0.xlsx	1	\N	2026-03-23 11:34:24.431877+05:30	2026-03-23 11:34:24.431877+05:30	31
57	38	Inventory_Boring Bar.xlsx	http://172.18.7.91:9000/cmf/general_documents/38/20260323_113153_DOC21_1.0.xlsx	1	\N	2026-03-23 11:31:53.22708+05:30	2026-03-23 11:31:53.22708+05:30	16
60	37	Allen_Key_history (4).pdf	http://172.18.7.91:9000/cmf/general_documents/37/20260323_115529_SUSH_1.0.pdf	1	\N	2026-03-23 11:55:30.014633+05:30	2026-03-23 11:55:30.014633+05:30	32
62	37	Allen_Key_history (4).pdf	http://172.18.7.91:9000/cmf/general_documents/37/20260323_115632_SUSH_1.0.pdf	1	\N	2026-03-23 11:56:32.571926+05:30	2026-03-23 11:56:32.571926+05:30	34
\.


--
-- Data for Name: general_folders; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.general_folders (id, folder_name, parent_id, created_at, updated_at, user_id) FROM stdin;
19	Common Folder	\N	2026-02-18 11:30:02.382047+05:30	2026-02-18 11:30:02.382047+05:30	16
37	Test Folder	\N	2026-03-10 15:46:37.83463+05:30	2026-03-10 15:46:37.834634+05:30	16
38	Folder1	37	2026-03-10 15:46:52.783794+05:30	2026-03-10 15:46:52.783799+05:30	16
\.


--
-- Data for Name: machine_documents; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.machine_documents (id, machine_folder_id, machine_id, document_name, document_url, version, parent_id, created_at, updated_at, user_id, document_type) FROM stdin;
29	\N	24	document_1	http://172.18.7.91:9000/cmf/machine_documents/machine_24/20260331_114828_document_1_1.0.pdf	1	\N	2026-03-31 11:48:28.339949	2026-03-31 11:48:28.339949	16	maintenance
26	\N	24	211091230056-Body Braze Washer (BTKu 375 P)_01	http://172.18.7.91:9000/cmf/machine_documents/machine_24/20260330_142611_211091230056-Body Braze Washer (BTKu 375 P)_01_1.0.pdf	1	\N	2026-03-30 14:26:11.743004	2026-03-30 14:26:11.743004	16	maintenance
32	\N	25	document_1	http://172.18.7.91:9000/cmf/machine_documents/machine_25/20260331_152621_document_1_1.0.pdf	1	\N	2026-03-31 15:26:21.550734	2026-03-31 15:26:21.550734	16	maintenance
34	\N	13	document_1	http://172.18.7.91:9000/cmf/machine_documents/machine_13/20260409_110500_document_1_1.0.pdf	1	\N	2026-04-09 11:05:00.645734	2026-04-09 11:05:00.645734	16	maintenance
37	\N	15	Part_Report_A-PRT-002	http://172.18.7.91:9000/cmf/machine_documents/machine_15/20260526_100623_Part_Report_A-PRT-002_1.0.pdf	1	\N	2026-05-26 10:06:23.556416	2026-05-26 10:06:23.556416	32	maintenance
\.


--
-- Data for Name: machine_folders; Type: TABLE DATA; Schema: documents; Owner: -
--

COPY documents.machine_folders (id, folder_name, machine_id, parent_id, created_at, updated_at, user_id) FROM stdin;
6	56	15	\N	2026-02-21 11:40:20.998969	2026-02-21 11:40:20.998969	16
\.


--
-- Data for Name: inventory_requests; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.inventory_requests (id, tool_id, operator_id, project_id, part_id, quantity, purpose_of_use, created_at, inventory_supervisor_id, status, updated_at) FROM stdin;
9	148	12	32	28	20		2026-03-23 15:41:50.698148	31	rejected	2026-03-26 18:07:55.104913
17	1542	12	32	24	1		2026-04-22 17:29:39.312488	31	approved	2026-04-27 15:56:10.379031
22	168	12	32	24	20		2026-05-22 10:42:06.126104	31	approved	2026-05-22 10:42:19.143261
\.


--
-- Data for Name: inventory_return_requests; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.inventory_return_requests (id, requested_id, operator_id, total_requested_qty, returned_qty, remarks, created_at, inventory_supervisor_id, status, updated_at) FROM stdin;
8	17	12	1	1	Returned by operator	2026-04-27 15:57:04.735534	\N	pending	\N
\.


--
-- Data for Name: raw_material_stock; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.raw_material_stock (id, material_id, form_type, diameter, length, breadth, height, inner_diameter, outer_diameter, quantity, volume, mass, weight, cost, source_type, source_order_id, status, created_at, updated_at, part_id, vendor_id, user_id, order_status, received_vendor_id, allocated_quantity, available_quantity, remaining_length, process_type, estimated_cost, final_cost) FROM stdin;
121	7	Round	20	1000	\N	\N	\N	\N	10	0.000314	6.908	67.767	57601.95	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
227	1	Round	50	500	\N	\N	\N	\N	1	0.000982	7.709	75.625	6465.94	general	\N	available	2026-04-27 12:29:12.355584+05:30	2026-05-25 16:44:44.341797+05:30	\N	\N	16	\N	\N	0	1	\N	Forging	\N	\N
123	7	Pipe	\N	1000	\N	\N	20	25	10	0.000177	3.894	38.2	32470	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
124	8	Round	20	1000	\N	\N	\N	\N	10	0.000314	22.765	223.325	16749.38	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
126	8	Pipe	\N	1000	\N	\N	20	25	10	0.000177	12.832	125.882	9441.15	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
127	9	Round	20	1000	\N	\N	\N	\N	10	0.000314	27.632	271.07	140956.4	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
129	9	Pipe	\N	1000	\N	\N	20	25	10	0.000177	15.576	152.801	79456.52	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
249	1	Round	20	200	\N	\N	\N	\N	1	6.3e-05	0.495	4.856	415.19	general	\N	available	2026-05-25 16:50:01.183867+05:30	2026-05-25 16:52:08.975769+05:30	\N	\N	32	\N	\N	0	1	\N	Casting	\N	\N
113	4	Square	\N	1000	25	25	\N	\N	10	0.000625	49.062	481.298	31284.37	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
116	5	Square	\N	1000	25	25	\N	\N	10	0.000625	49.062	481.298	42354.22	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
119	6	Square	\N	1000	25	25	\N	\N	10	0.000625	49.062	481.298	57755.76	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
240	1	Round	10	500	\N	\N	\N	\N	1	3.9e-05	0.306	3.002	256.67	order	32	not_available	2026-05-23 10:20:06.351471+05:30	2026-05-25 17:47:32.983703+05:30		1,2	32	purchase_order	2	0	0	\N	Barstocks	256.67	300
122	7	Square	\N	1000	25	25	\N	\N	10	0.000625	13.75	134.888	114654.8	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
125	8	Square	\N	1000	25	25	\N	\N	10	0.000625	45.312	444.511	33338.33	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
251	4	Round	10	100	\N	\N	\N	\N	1	8e-06	0.063	0.618	40.17	order	134	not_available	2026-05-25 17:49:02.012254+05:30	2026-05-25 17:51:06.530811+05:30		4,7	16	enquiry	\N	0	0	\N	Forging	123	200
109	3	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.649	241.807	22246.24	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
114	4	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.894	136.3	8859.5	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
117	5	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.894	136.3	11994.4	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
118	6	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.649	241.807	29016.84	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
120	6	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.894	136.3	16356	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
103	1	Round	20	1000	100	100	\N	\N	10	0.000314	24.649	241.807	20674.5	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-05-29 16:32:34.235705+05:30	\N	\N	16	\N	\N	0	7	\N	Forging	\N	\N
106	2	Round	20	1000	\N	\N	\N	\N	10	0.000314	25.12	246.427	60374.61	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-05-14 11:42:12.875141+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
111	3	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.894	136.3	12539.6	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 15:03:08.322519+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
112	4	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.649	241.807	15717.45	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-13 16:49:40.02543+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
128	9	Square	\N	1000	25	25	\N	\N	10	0.000625	55	539.55	280566	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-07 12:12:13.17428+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
110	3	Square	\N	1000	25	25	\N	\N	10	0.000625	49.062	481.298	44279.42	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-13 17:02:28.081345+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
107	2	Square	\N	1000	25	25	\N	\N	10	0.000625	50	490.5	120172.5	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-16 10:59:35.43579+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
131	10	Square	\N	1000	25	25	\N	\N	10	0.000625	50.5	495.405	47063.47	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
115	5	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.649	241.807	21279.02	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-09 11:29:54.958886+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
134	11	Square	\N	1000	25	25	\N	\N	10	0.000625	48.438	475.177	133049.56	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
130	10	Round	20	1000	\N	\N	\N	\N	10	0.000314	25.371	248.89	23644.55	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
132	10	Pipe	\N	1000	\N	\N	20	25	10	0.000177	14.302	140.303	13328.78	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
133	11	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.335	238.726	66843.28	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
135	11	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.717	134.564	37677.92	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
184	1	Round	11	11	\N	\N	\N	\N	111	1e-06	0.871	8.545	730.6	general	\N	available	2026-04-09 10:31:00.488981+05:30	2026-04-09 10:31:00.488981+05:30	\N	\N	32	\N	\N	0	111	\N	Casting	\N	\N
105	1	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.894	136.3	11653.65	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 14:34:58.851783+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
108	2	Pipe	\N	1000	\N	\N	20	25	10	0.000177	14.16	138.91	34032.95	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
136	12	Round	20	1000	\N	\N	\N	\N	10	0.000314	8.478	83.169	15386.26	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
138	12	Pipe	\N	1000	\N	\N	20	25	10	0.000177	4.779	46.882	8673.17	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
139	13	Round	20	1000	\N	\N	\N	\N	10	0.000314	24.492	240.267	46852.07	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Casting	\N	\N
141	13	Pipe	\N	1000	\N	\N	20	25	10	0.000177	13.806	135.437	26410.22	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Barstocks	\N	\N
250	1	Pipe	\N	20	\N	\N	10	15	1	2e-06	0.016	0.157	13.42	order	32	available	2026-05-25 17:12:35.900968+05:30	2026-05-29 18:38:35.55477+05:30		6,5	32	received	6	0	1	\N	Barstocks	500	500
137	12	Square	\N	1000	25	25	\N	\N	10	0.000625	16.875	165.544	30625.64	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
140	13	Square	\N	1000	25	25	\N	\N	10	0.000625	48.75	478.238	93256.41	general	\N	available	2026-03-31 11:38:01.211568+05:30	2026-04-03 11:24:58.977429+05:30	\N	\N	16	\N	\N	0	10	\N	Forging	\N	\N
\.


--
-- Data for Name: raw_material_units; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.raw_material_units (id, stock_id, total_length, remaining_length, volume, mass, weight, cost, status, created_at, updated_at) FROM stdin;
547	103	1000	0	3.14e-05	2.4649	24.180699999999998	2067.45	exhausted	2026-04-23 12:01:47.588867+05:30	2026-05-08 13:15:37.798694+05:30
548	103	1000	0	3.14e-05	2.4649	24.180699999999998	2067.45	exhausted	2026-04-23 12:01:47.588867+05:30	2026-05-13 09:56:44.025433+05:30
61	109	1000	800	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	partially_used	2026-04-23 09:48:11.635926+05:30	2026-05-14 11:47:17.658103+05:30
549	103	1000	400	3.14e-05	2.4649	24.180699999999998	2067.45	partially_used	2026-04-23 12:01:47.588867+05:30	2026-05-22 18:20:05.301029+05:30
551	103	1000	900	3.14e-05	2.4649	24.180699999999998	2067.45	partially_used	2026-04-23 12:01:47.588867+05:30	2026-05-25 09:46:17.868124+05:30
550	103	1000	1000	3.14e-05	2.4649	24.180699999999998	2067.45	available	2026-04-23 12:01:47.588867+05:30	2026-04-23 12:01:47.588867+05:30
552	103	1000	1000	3.14e-05	2.4649	24.180699999999998	2067.45	available	2026-04-23 12:01:47.588867+05:30	2026-04-23 12:01:47.588867+05:30
553	103	1000	1000	3.14e-05	2.4649	24.180699999999998	2067.45	available	2026-04-23 12:01:47.588867+05:30	2026-04-23 12:01:47.588867+05:30
554	103	1000	1000	3.14e-05	2.4649	24.180699999999998	2067.45	available	2026-04-23 12:01:47.588867+05:30	2026-04-23 12:01:47.588867+05:30
545	103	1000	150	3.14e-05	2.4649	24.180699999999998	2067.45	partially_used	2026-04-23 12:01:47.588867+05:30	2026-05-29 16:32:34.179966+05:30
546	103	1000	0	3.14e-05	2.4649	24.180699999999998	2067.45	exhausted	2026-04-23 12:01:47.588867+05:30	2026-05-05 15:47:27.070924+05:30
46	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
47	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
48	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
49	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
50	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
62	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
63	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
64	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
66	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
67	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
68	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
69	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
70	109	1000	1000	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
71	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
72	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
73	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
74	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
75	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
76	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
77	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
78	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
79	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
80	110	1000	1000	6.25e-05	4.9062	48.1298	4427.942	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
81	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
82	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
83	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
84	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
85	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
86	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
87	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
88	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
89	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
90	111	1000	1000	1.77e-05	1.3894	13.63	1253.96	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
92	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
93	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
94	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
95	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
96	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
97	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
98	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
99	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
100	112	1000	1000	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
101	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
102	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
103	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
104	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
105	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
106	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
107	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
108	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
109	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
110	113	1000	1000	6.25e-05	4.9062	48.1298	3128.437	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
111	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
112	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
113	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
114	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
115	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
116	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
117	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
118	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
119	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
120	114	1000	1000	1.77e-05	1.3894	13.63	885.95	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
122	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
123	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
124	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
125	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
126	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
121	115	1000	850	3.14e-05	2.4649	24.180699999999998	2127.902	partially_used	2026-04-23 09:48:11.635926+05:30	2026-05-21 16:26:02.254365+05:30
91	112	1000	500	3.14e-05	2.4649	24.180699999999998	1571.7450000000001	partially_used	2026-04-23 09:48:11.635926+05:30	2026-05-22 09:53:17.239961+05:30
127	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
128	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
129	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
130	115	1000	1000	3.14e-05	2.4649	24.180699999999998	2127.902	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
131	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
132	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
133	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
134	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
135	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
136	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
137	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
138	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
139	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
140	116	1000	1000	6.25e-05	4.9062	48.1298	4235.4220000000005	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
141	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
142	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
143	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
144	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
145	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
146	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
147	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
148	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
149	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
150	117	1000	1000	1.77e-05	1.3894	13.63	1199.44	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
151	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
152	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
153	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
154	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
155	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
156	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
157	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
158	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
159	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
160	118	1000	1000	3.14e-05	2.4649	24.180699999999998	2901.684	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
161	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
162	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
163	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
164	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
165	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
166	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
167	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
168	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
169	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
170	119	1000	1000	6.25e-05	4.9062	48.1298	5775.576	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
171	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
172	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
173	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
174	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
175	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
176	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
177	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
178	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
179	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
180	120	1000	1000	1.77e-05	1.3894	13.63	1635.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
181	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
182	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
183	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
184	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
185	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
186	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
187	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
188	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
189	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
190	121	1000	1000	3.14e-05	0.6908000000000001	6.7767	5760.195	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
191	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
192	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
193	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
194	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
195	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
196	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
197	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
198	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
199	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
200	122	1000	1000	6.25e-05	1.375	13.488800000000001	11465.48	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
201	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
202	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
203	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
204	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
205	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
206	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
207	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
208	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
209	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
210	123	1000	1000	1.77e-05	0.3894	3.8200000000000003	3247	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
211	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
212	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
213	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
214	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
215	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
216	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
217	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
218	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
219	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
220	124	1000	1000	3.14e-05	2.2765	22.3325	1674.938	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
221	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
222	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
223	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
224	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
225	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
226	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
227	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
228	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
229	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
230	125	1000	1000	6.25e-05	4.5312	44.451100000000004	3333.833	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
231	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
232	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
233	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
234	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
235	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
236	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
237	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
238	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
239	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
240	126	1000	1000	1.77e-05	1.2832000000000001	12.5882	944.115	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
241	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
242	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
243	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
244	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
245	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
246	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
247	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
248	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
249	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
250	127	1000	1000	3.14e-05	2.7632000000000003	27.107	14095.64	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
251	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
252	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
253	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
254	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
255	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
256	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
257	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
258	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
259	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
260	128	1000	1000	6.25e-05	5.5	53.955	28056.6	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
261	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
262	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
263	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
264	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
265	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
266	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
267	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
268	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
269	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
270	129	1000	1000	1.77e-05	1.5576	15.2801	7945.652	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
271	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
272	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
273	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
274	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
275	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
276	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
277	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
278	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
279	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
280	130	1000	1000	3.14e-05	2.5370999999999997	24.889	2364.455	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
281	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
282	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
283	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
284	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
285	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
286	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
287	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
288	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
289	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
290	131	1000	1000	6.25e-05	5.05	49.540499999999994	4706.347	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
291	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
292	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
293	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
294	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
295	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
296	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
297	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
298	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
299	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
300	132	1000	1000	1.77e-05	1.4302	14.0303	1332.8780000000002	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
301	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
302	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
303	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
304	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
305	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
306	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
307	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
308	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
309	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
310	133	1000	1000	3.14e-05	2.4335	23.8726	6684.3279999999995	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
311	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
312	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
313	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
314	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
315	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
316	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
317	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
318	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
319	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
320	134	1000	1000	6.25e-05	4.8438	47.517700000000005	13304.956	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
321	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
322	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
323	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
324	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
325	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
326	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
327	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
328	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
329	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
330	135	1000	1000	1.77e-05	1.3717000000000001	13.456399999999999	3767.792	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
331	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
332	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
333	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
334	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
335	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
336	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
337	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
338	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
339	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
340	136	1000	1000	3.14e-05	0.8478	8.3169	1538.626	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
341	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
342	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
343	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
344	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
345	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
346	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
347	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
348	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
349	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
350	137	1000	1000	6.25e-05	1.6875	16.5544	3062.564	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
351	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
352	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
353	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
354	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
355	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
356	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
357	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
358	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
359	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
360	138	1000	1000	1.77e-05	0.4779	4.6882	867.317	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
361	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
362	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
363	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
364	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
365	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
366	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
367	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
368	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
369	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
370	139	1000	1000	3.14e-05	2.4492000000000003	24.026699999999998	4685.207	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
371	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
372	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
373	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
374	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
375	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
376	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
377	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
378	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
379	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
380	140	1000	1000	6.25e-05	4.875	47.8238	9325.641	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
381	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
382	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
383	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
384	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
385	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
386	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
387	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
388	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
389	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
390	141	1000	1000	1.77e-05	1.3805999999999998	13.543700000000001	2641.022	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
401	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
402	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
403	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
404	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
405	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
406	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
21	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
22	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
23	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
24	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
25	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
26	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
27	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
28	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
29	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
30	105	1000	1000	1.77e-05	1.3894	13.63	1165.365	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
52	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
53	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
54	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
55	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
56	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
57	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
58	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
59	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
60	108	1000	1000	1.77e-05	1.416	13.891	3403.2949999999996	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
407	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
408	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
409	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
410	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
411	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
412	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
413	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
414	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
415	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
416	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
417	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
418	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
419	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
420	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
421	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
422	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
51	108	1000	0	1.77e-05	1.416	13.891	3403.2949999999996	exhausted	2026-04-23 09:48:11.635926+05:30	2026-05-06 10:41:45.864106+05:30
423	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
424	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
425	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
426	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
427	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
428	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
429	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
430	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
431	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
432	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
433	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
434	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
435	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
436	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
437	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
438	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
439	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
440	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
441	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
442	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
443	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
444	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
445	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
446	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
447	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
448	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
449	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
450	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
451	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
452	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
453	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
454	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
455	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
456	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
457	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
458	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
459	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
460	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
461	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
462	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
463	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
464	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
465	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
466	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
467	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
468	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
469	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
470	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
471	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
472	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
473	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
474	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
508	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
509	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
510	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
511	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
590	240	500	200	3.9e-05	0.306	3.002	256.67	not_available	2026-05-25 14:48:29.569653+05:30	2026-05-25 17:47:32.983703+05:30
65	109	1000	800	3.14e-05	2.4649	24.180699999999998	2224.6240000000003	partially_used	2026-04-23 09:48:11.635926+05:30	2026-05-13 09:52:50.312251+05:30
599	249	200	200	6.3e-05	0.495	4.856	415.19	available	2026-05-25 16:50:01.186096+05:30	2026-05-25 16:52:08.963184+05:30
600	250	20	6	2e-06	0.016	0.157	13.42	partially_used	2026-05-25 17:12:35.900968+05:30	2026-05-29 18:38:35.578398+05:30
575	227	500	500	0.000982	7.709	75.625	6465.94	available	2026-04-27 12:29:12.373027+05:30	2026-05-25 16:44:44.290637+05:30
601	251	100	100	8e-06	0.063	0.618	40.17	not_available	2026-05-25 17:49:02.012254+05:30	2026-05-25 17:49:02.012254+05:30
31	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-05-14 11:42:12.859288+05:30
32	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
33	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
34	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
35	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
36	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
37	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
38	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
39	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
40	106	1000	1000	3.14e-05	2.512	24.642699999999998	6037.461	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
41	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
42	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
43	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
44	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
45	107	1000	1000	6.25e-05	5	49.05	12017.25	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
475	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
476	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
477	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
478	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
479	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
480	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
481	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
482	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
483	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
484	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
485	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
486	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
487	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
488	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
489	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
490	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
491	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
492	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
493	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
494	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
495	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
496	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
497	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
498	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
499	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
500	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
501	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
502	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
503	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
504	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
505	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
506	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
507	184	11	11	9.009009009009009e-09	0.007846846846846847	0.07698198198198199	6.581981981981982	available	2026-04-23 09:48:11.635926+05:30	2026-04-23 09:48:11.635926+05:30
\.


--
-- Data for Name: raw_material_usage; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.raw_material_usage (id, raw_material_unit_id, part_id, used_length, created_at, user_id) FROM stdin;
91	600	36	4	2026-05-29 17:34:54.348603+05:30	32
94	600	37	10	2026-05-29 18:22:16.447093+05:30	16
38	545	24	50	2026-04-30 11:21:11.442765+05:30	16
40	546	33	1000	2026-05-05 15:47:27.070924+05:30	16
42	51	25	1000	2026-05-06 10:41:45.864106+05:30	16
44	547	28	1000	2026-05-08 13:15:37.798694+05:30	16
61	65	1409	200	2026-05-13 09:52:50.312251+05:30	16
62	548	1433	1000	2026-05-13 09:56:44.025433+05:30	16
66	549	1515	500	2026-05-18 10:25:36.080824+05:30	16
68	91	1519	500	2026-05-22 09:53:17.239961+05:30	16
19	545	1439	500	2026-04-27 10:30:11.825769+05:30	32
20	545	1440	100	2026-04-27 10:31:32.398544+05:30	32
21	545	1447	100	2026-04-27 10:31:42.015545+05:30	32
22	545	1472	100	2026-04-27 10:31:51.949538+05:30	32
81	590	35	300	2026-05-25 14:49:28.661134+05:30	16
\.


--
-- Data for Name: raw_materials; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.raw_materials (id, material_name, density, created_at, updated_at, cost_per_kg, user_id) FROM stdin;
1	45C8	7850	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	85.5	16
2	SS316L	8000	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	245	16
3	EN36	7850	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	92	16
4	MS	7850	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	65	16
5	EN24	7850	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	88	16
6	15NiCr4Mo2	7850	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	120	16
7	TEFLON/HYLEM	2200	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	850	16
8	FG260	7250	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	75	16
9	PH BRONZE	8800	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	520	16
10	EN353	8080	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	95	16
11	17-4 PH	7750	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	280	16
12	Aluminium	2700	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	185	16
13	SS420	7800	2026-03-30 17:31:58.183498+05:30	2026-03-30 17:43:45.080228+05:30	195	16
21	Demo	26	2026-05-12 10:16:07.521699+05:30	2026-05-12 10:16:07.521699+05:30	\N	32
\.


--
-- Data for Name: tool_issue_documents; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.tool_issue_documents (id, tool_issue_id, document_url, created_at) FROM stdin;
\.


--
-- Data for Name: tool_issues; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.tool_issues (id, tool_id, request_id, tool_issue_qty, operator_id, inventory_supervisor_id, status, created_at, updated_at, issue_category, description, remarks) FROM stdin;
7	168	22	1	12	\N	pending	2026-05-22 11:06:08.655164	\N	\N	\N	\N
\.


--
-- Data for Name: tools_list; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.tools_list (id, item_description, range, identification_code, make, quantity, total_quantity, location, gauge, remarks, amount, ref_ledger, type, issues_qty, category, sub_category) FROM stdin;
1	Allen Key	1 mm	\N	\N	0	0	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
2	Allen Key	1.5 mm	\N	\N	2	2	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
3	Allen Key	2 mm	\N	\N	3	3	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
4	Allen Key	2.5 mm	\N	\N	0	0	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
5	Allen Key	3 mm	\N	\N	0	0	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
6	Allen Key	3.5 mm	\N	\N	1	1	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
7	Allen Key	4 mm	\N	\N	76	76	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
8	Allen Key	5 mm	\N	\N	17	17	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
10	Allen Key	7 mm	\N	\N	24	24	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
11	Allen Key	8 mm	\N	\N	26	26	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
12	Allen Key	9 mm	\N	\N	15	15	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
13	Allen Key	10 mm	\N	\N	35	35	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
14	Allen Key	12 mm	\N	\N	22	22	G9	\N	\N	1000	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
15	Allen Key	14 mm	\N	\N	3	3	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
16	Allen Key	16 mm	\N	\N	4	4	G9	\N	\N	1235	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
17	Allen Key	17 mm	\N	\N	14	14	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
18	Allen Key	19 mm	\N	\N	8	8	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
19	Allen Key	22 mm	\N	\N	9	9	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
20	Allen Key	24 mm	\N	\N	7	7	G9	\N	\N	3680	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
21	Allen Key	27 mm	\N	\N	5	5	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
22	Allen Key	9 / 16 "	\N	\N	7	7	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
23	Allen Key	7 / 8 "	\N	\N	1	1	G13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
24	Allen Key	7 / 32 "	\N	\N	10	10	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
25	Allen Key	5 / 8 "	\N	\N	10	10	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
26	Allen Key	5 / 32 "	\N	\N	10	10	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
27	Allen Key	3 / 4 "	\N	\N	7	7	G9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
28	Allen Key	3 / 8 "	\N	\N	14	14	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
29	Allen Key	5 / 16 "	\N	\N	26	26	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
30	Allen Key	3 / 16 "	\N	\N	6	6	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
31	Allen Key	1 / 16 "	\N	\N	0	0	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
32	Allen Key	3 / 32 "	\N	\N	1	1	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
33	Allen Key	1 / 8 "	\N	\N	1	1	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
34	Allen Key	1 / 4 "	\N	\N	17	17	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
35	Allen Key	1 / 2 "	\N	\N	14	14	G7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
36	Allen Key	1 "	\N	\N	5	5	G13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
38	Allen Key Set	set of 10	\N	\N	0	0	TC - 07	\N	\N	960	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
39	Angle Gauge	\N	4063933	Starrett	0	0	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
40	Angle Plate	\N	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
41	Angle Plate	\N	\N	\N	1	1	F11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
42	Bearing Puller	\N	\N	\N	1	1	E16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
43	Bevel Protractor - 1	\N	\N	Somet	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
44	Bevel Protractor - 2	\N	\N	Somet	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
45	Bevel Protractor - 3	\N	CMTI WSM0100	Somet	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
46	Bevel Protractor - 4	\N	02 - 161	Mitutoyo	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
47	Optical Bevel Protractor	\N	M-3-370	Somet	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
48	Blade Holder	\N	SGTBF - 25 - A	Iscar	1	1	TC - 04	\N	T - Type Face or OD Groove	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
49	Blade Holder	\N	SGTBU - 25C - 6	Iscar	1	1	TC - 04	\N	Straight Type	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
50	Bore Gauge	6 - 8	22885	Helios	0	0	TC - 10	\N	(Setting Pins - 7 Nos)	22950	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
51	Bore Gauge	6 - 8	22907	Helios	0	0	TC - 10	\N	(Setting Pins - 8 Nos)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
52	Bore Gauge	6 - 10	183722	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 9 Nos)	1490	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
53	Bore Gauge (New Stock)	6 - 10	224958	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 Nos)	5117.8	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
54	Bore Gauge (New Stock)	6 - 10	224941	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 Nos)	5117.8	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
55	Bore Gauge (Fixed Type)	7 - 10	TC - 001	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 6 Nos)	635	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
56	Bore Gauge (Fixed Type)	8 - 12	22980	Helios	0	0	TC - 10	\N	(Setting Pins - 9 Nos)	21714	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
57	Bore Gauge	8 - 12	22985	Helios	0	0	TC - 10	\N	(Setting Pins - 9 Nos)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
58	Bore Gauge	10 - 18	TC - 011	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 9 Nos)	1370	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
59	Bore Gauge	10 - 18.5	CSN 022 656	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 1 No's)	1400	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
9	Allen Key	6 mm	\N	\N	10	15	G8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
60	Bore Gauge (New Stock)	10 - 18.5	344522	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 No's)(Washer - 1 No's)	6107.63	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
61	Bore Gauge (New Stock)	10 - 18.5	344540	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 No's)(Washer - 1 No's)	6107.63	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
62	Bore Gauge	12 - 20	34109	Helios	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 1 No's)	14625	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
63	Bore Gauge	12 - 20	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 1 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
64	Bore Gauge	18 - 35	3107142	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 2 No's)	685	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
65	Bore Gauge (Dial Included)	18 - 35	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 2 No's)	2020	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
66	Bore Gauge (Dial Included)	18 - 35	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 1 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
67	Bore Gauge (Dial Included)	18 - 35	0410804	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 8 No's)(Washer - 3 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
68	Bore Gauge (New Stock)	18 - 35	23944249	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 No's)(Washer - 2 No's)	5646.61	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
69	Bore Gauge (New Stock)	18 - 35	23901200	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 9 No's)(Washer - 2 No's)	5646.61	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
70	Bore Gauge (Dial Included)	30 - 56	L - 2 - 0229	Somet	0	0	TC - 10	\N	(Setting Pins - 13 Nos)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
71	Bore Gauge	35 - 60	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 2 No's)	40251	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
72	Bore Gauge	35 - 60	08884	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 2 No's)	15094	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
73	Bore Gauge (Dial Included)	35 - 60	802072	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 6 No's)(Washer - 3 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
74	Bore Gauge (Dial Included)	35 - 60	0401222	Mitutoyo	0	0	TC - 10	\N	(Setting Pins - 6 No's)(Washer - 4 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
75	Bore Gauge (New Stock)	35 - 60	23907191	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 6 No's)(Washer - 4 No's)	5847	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
76	Bore Gauge (New Stock)	35 - 60	23907194	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 6 No's)(Washer - 4 No's)	5847	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
77	Bore Gauge (Dial Included)	50 - 100	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 11 No's)(Washer - 3 No's)	17300	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
80	Bore Gauge (Screw Adjustment)(New Stock)	60 - 100	21744801	Mitutoyo	0	0	TC - 09	\N	(Extension - 2 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
81	Bore Gauge (Screw Adjustment)(New Stock)	60 - 100	23936523	Mitutoyo	0	0	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
82	Bore Gauge	100 - 160	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 4 No's)	44928	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
83	Bore Gauge (Dial Included)	100 - 160	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 4 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
84	Bore Gauge (New Stock)	100 - 160	22847990	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 3 No's)	35240.68	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
85	Bore Gauge (New Stock)	100 - 160	22871752	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 3 No's)	35240.68	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
86	Bore Gauge (New Stock)	150 - 250	22897959	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 4 No's)	24534.01	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
87	Bore Gauge (Dial Included)	150 - 315	270	F M	0	0	TC - 10	\N	(Setting Pins - 9 No's)(Washer - 1 No's)(Extension - 1 No's)	60728	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
88	Bore Gauge (Dial Included)	160 - 280	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 4 No's)(Extension - 1 No's)	2775	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
89	Bore Gauge	160 - 280	Not Mensioned	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 4 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
90	Bore Gauge (New Stock)	250 - 400	23928496	Mitutoyo	0	0	TC - 09	\N	(Setting Pins - 3 No's)	28980	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
91	Bore Gauge (Dial Included)	280 - 510	09055	Helios	0	0	TC - 10	\N	(Setting Pins - 7 No's)(Washer - 4 No's)(Extension - 1 No's)	69512	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
92	Bore Gauge (New Stock)	400 - 600	23968809	Mitutoyo	0	0	TC - 09	\N	(Extension - 2 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
93	Bore Gauge	400 - 800	23217115	Helios	0	0	MANJUNATH	\N	Accessories 23 No	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
94	Boring Bar	Ø 6	SWHBR - 06	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
95	Boring Bar	Ø 6	S0606H SWUBR - 06	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
97	Boring Bar	Ø 8	1777	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
98	Boring Bar	Ø 10	\N	Iscar	3	3	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
99	Boring Bar	Ø 10	S10K SCL0L06	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
100	Boring Bar	Ø 10	S10K SDUCR07	Taegutec	2	2	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
101	Boring Bar	Ø 12	S12M SCLCR	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
96	Boring Bar	Ø 8	\N	Iscar	2	4	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	2	Tools	Boring Bars & Tools
102	Boring Bar	Ø 12	S12M SCLCR06	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
103	Boring Bar	Ø 12	0875806072009	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
104	Boring Bar	Ø 16	S16QSDQCL07	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
105	Boring Bar	Ø 16	S16R - SCLCR06 (6372)	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
106	Boring Bar	Ø 16	4365420	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
107	Boring Bar	Ø 16	S16R - PWLNR 06	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
108	Boring Bar	Ø 16	A16Q - SDUCR07	Seco	2	2	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
109	Boring Bar	Ø 16	S16	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
110	Boring Bar	Ø 16	4365528	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
111	Boring Bar	Ø 16	6938715210	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
112	Boring Bar	Ø 16	S25T - SVQBR - 16	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
113	Boring Bar	Ø 16	S32T - SVBQBR - 16	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
114	Boring Bar	Ø 16	S16MSDUCR 07	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
115	Boring Bar	Ø 20	S20T SDUCR 07F3	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
116	Boring Bar	Ø 20	S20S SCLCL09 F3 D2C	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
117	Boring Bar	Ø 20	S20S SDUCR 11-M	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
118	Boring Bar	Ø 20	S20Q SDUCR 11	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
119	Boring Bar	Ø 20	S20R PWLNR - 06	Iscar	2	2	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
120	Boring Bar	Ø 25	PWLNR 06 F3 - 04	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
121	Boring Bar	Ø 25	S25R SDUCR11 F3	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
122	Boring Bar	Ø 25	SDUCR11 F3 8C	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
123	Boring Bar	Ø 25	S25T PCLNR 12	Taegutec	1	1	TC - 04	\N	\N	19265	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
124	Boring Bar	Ø 25	S25 PCLNR 01204	Taegutec	3	3	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
125	Boring Bar	Ø 25	S25T PCLNR 12 (01204)	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
127	Boring Bar	Ø 32	S32S MCLNR12F3 ID 9A	Widia	1	1	TC - 04	\N	\N	31625	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
128	Boring Bar	Ø 32	\N	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
129	Boring Bar	Ø 32	6631492	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
130	Boring Bar	Ø 32	S32	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
131	Boring Bar	Ø 32	S32T - SVQBR - 16	Taegutec	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
132	Boring Bar	Ø 32	S32S 12F3	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
133	Boring Bar	Ø 40	\N	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
134	Boring Bar	Ø 40	S40SMCLNR12 F3 ID 9A	Widia	1	1	TC - 04	\N	\N	31900	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
135	Boring Bar	Ø 40	6631493	Widax	2	2	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
136	Box Spanner	7	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
137	Box Spanner	9	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
138	Box Spanner	11	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
139	Box Spanner	14	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
140	Box Spanner	17	\N	\N	2	2	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
141	Box Spanner	19	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
142	Box Spanner	21	\N	\N	3	3	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
143	Box Spanner	22	\N	\N	1	1	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
144	Box Spanner	26	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
145	Box Spanner	27	\N	\N	3	3	D22	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
146	Box Spanner	30	\N	\N	3	3	D23	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
147	Box Spanner	32	\N	\N	2	2	D23	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
148	Box Spanner	36	\N	\N	2	2	D23	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
149	Box Spanner	41	\N	\N	3	3	D23	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
150	Box Spanner	46	\N	\N	3	3	D23	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
151	Box Spanner	6 - 7	\N	\N	2	2	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
152	Box Spanner	8 - 9	\N	\N	1	1	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
153	Box Spanner	8 - 10	\N	\N	1	1	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
154	Box Spanner	9 - 10	\N	\N	3	3	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
155	Box Spanner	10 - 11	\N	\N	2	2	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
156	Box Spanner	11 - 12	\N	\N	1	1	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
157	Box Spanner	14 - 15	\N	\N	2	2	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
158	Box Spanner	14 - 17	\N	\N	3	3	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
159	Box Spanner	16 - 17	\N	\N	3	3	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
160	Box Spanner	18 - 19	\N	\N	2	2	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
161	Box Spanner	19 - 22	\N	\N	3	3	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
162	Box Spanner	20 - 22	\N	\N	3	3	D24	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
163	Box Spanner	21 - 23	\N	\N	2	2	D25	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
164	Box Spanner	24 - 26	\N	\N	3	3	D25	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
165	Box Spanner	25 - 28	\N	\N	1	1	D25	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
166	Box Spanner	30 - 33	\N	\N	3	3	D25	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
167	Box Spanner	3 / 16 "  -  1 / 4 "	\N	\N	1	1	D25	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
169	Inside Caliper	\N	\N	\N	3	3	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
170	Outside Caliper	\N	\N	\N	6	6	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
171	Dividers	\N	\N	\N	19	19	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bevel Protractors
172	Cast Iron Plate	500 × 400	\N	\N	1	1	D32	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
173	Center Drill (Type A )	A 1.0 × 3.15	\N	\N	9	9	\N	\N	\N	655.2	BIN CARD	CONSUMABLES	\N	Tools	Drills
174	Center Drill (Type A )	A 1.25 × 3.15	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
175	Center Drill (Type A )	A 1.6 × 4	\N	\N	13	13	A11	\N	\N	409.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
176	Center Drill (Type A )	A 2 × 5	\N	\N	6	6	A11	\N	\N	1563	BIN CARD	CONSUMABLES	\N	Tools	Drills
177	Center Drill (Type A )	A 2.5 × 6.3	\N	\N	8	8	A11	\N	\N	1157	BIN CARD	CONSUMABLES	\N	Tools	Drills
178	Center Drill (Type A )	A 3.15 × 8	\N	\N	11	11	A11	\N	\N	1363	BIN CARD	CONSUMABLES	\N	Tools	Drills
179	Center Drill (Type A )	A 4 × 10	\N	\N	13	13	A11	\N	\N	2170	BIN CARD	CONSUMABLES	\N	Tools	Drills
180	Center Drill (Type A )	A 5 × 12.5	\N	\N	13	13	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
181	Center Drill (Type A )	A 6.3 × 16	\N	\N	17	17	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
182	Center Drill (Type A )	A 8 × 20	\N	\N	3	3	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
183	Center Drill (Type B )	A 1.6 × 6.3	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
184	Center Drill (Type B )	A 2 × 8	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
185	Center Drill (Type B )	A 2.5 × 10	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
186	Center Drill (Type B )	A 3.15 × 11.2	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
187	Center Drill (Type B )	A 4 × 14	\N	\N	6	6	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
188	Chamfer Milling Cutter ( Single point )	45 °	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
189	Chamfer Milling Cutter ( Single point )	45 °	99616 - 14 - 220L	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
190	Chamfer Milling Cutter ( Single point )	45 °	R215.64 - 12A20 - 4512	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
191	Chamfer Milling Cutter ( Single point )	60 ° (Min Ø12)	R215.64 - 12A20 - 6012	Sandvik	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
192	Chamfer Milling Cutter ( Three point )	45 ° (Min Ø32)	R215.64 - 32S32 - 4512	Sandvik	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
193	Chamfer Milling Cutter ( Three point )	45 ° (Min Ø32)	CFSPR 323S32 (AE0004)	Mitsubishi	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
194	Chamfer Milling Cutter ( Three point )	60 ° (Min Ø32)	CESPR 323S32 (AJ0224)	Mitsubishi	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
195	Flat Chisel	\N	\N	\N	2	2	E12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
196	Circlip Plier ( External Straight )	\N	\N	\N	20	20	D7	\N	\N	44	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
197	Circlip Plier ( External Bent )	\N	\N	\N	2	2	D7	\N	\N	106	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
198	Circlip Plier ( Internal Straight )	\N	\N	\N	12	12	D7	\N	\N	865	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
199	Circlip Plier ( Internal Bent )	\N	\N	\N	1	1	D7	\N	\N	723	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
200	Combination Spanner	1/4 - 15/16	\N	\N	1	1	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
201	Combination Spanner	7/8	\N	\N	1	1	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
202	Combination Spanner	3/4	\N	\N	1	1	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
203	Combination Spanner	7/16W 1/2BS	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
204	Combination Spanner	1"	\N	\N	1	1	D17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
205	Combination Spanner	25/32	\N	\N	1	1	D17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
206	Combination Spanner	3/4 - 11/16	\N	\N	2	2	D17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
207	Counter Bore	M 3	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
208	Counter Bore	M 2.6	\N	\N	4	4	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
209	Counter Bore	M 3.5	\N	\N	6	6	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
210	Counter Bore	M 5	\N	\N	4	4	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
211	Counter Bore	Ø 6.3	\N	\N	2	2	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
212	Counter Bore	Ø 8	\N	\N	6	6	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
213	Counter Bore	Ø 11	\N	\N	2	2	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
214	Counter Bore	Ø 14.5	\N	\N	2	2	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
215	Counter Bore	Ø 15	\N	\N	5	5	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
216	Counter Bore	Ø 17.5	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
217	Counter Bore	Ø 19	\N	\N	7	7	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
218	Counter Bore	Ø 20	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
219	Counter Bore	Ø 25	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
220	Counter Bore	Ø 26	\N	\N	1	1	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
221	Counter Bore	Ø 28	\N	\N	1	1	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
222	Counter Bore	Ø 29	\N	\N	1	1	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
223	Counter Bore	Ø 31	\N	\N	1	1	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
224	Counter Bore	Ø 33	\N	\N	2	2	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
225	Counter Bore	1/4 × 1/8	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
226	Counter Bore	5/16 × 3/16	\N	\N	3	3	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
227	Counter Bore	3/8 × 7/32	\N	\N	6	6	B10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
228	Counter Sink	Ø8 × Ø12 × 60°	\N	\N	5	5	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
229	Counter Sink	Ø8 × Ø12 × 90°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
230	Counter Sink	Ø10 × Ø16 × 120°	\N	\N	6	6	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
231	Counter Sink	Ø11 × 90°	\N	\N	1	1	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
232	Counter Sink	Ø12 × 60°	\N	\N	2	2	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
233	Counter Sink	Ø12 × 90°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
234	Counter Sink	Ø16 × 60°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
235	Counter Sink	Ø16 × 90°	\N	\N	5	5	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
236	Counter Sink	Ø16 × 120°	\N	\N	0	0	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
237	Counter Sink	Ø20 × 90°	\N	\N	1	1	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
238	Counter Sink	Ø22 × 60°	\N	\N	2	2	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
239	Counter Sink	Ø22 × 90°	\N	\N	5	5	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
240	Counter Sink	Ø22 × 120°	\N	\N	2	2	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
241	Counter Sink	Ø32 × 60°	\N	\N	7	7	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
242	Counter Sink	Ø32 × 90°	\N	\N	4	4	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
243	Counter Sink	Ø32 × 120°	\N	\N	1	1	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
244	Counter Sink	Ø45 × 60°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
245	Counter Sink	Ø45 × 90°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
246	Counter Sink	Ø63 × 90°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
247	Counter Sink	Ø63 × 120°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
248	Counter Sink	1 1/4 "  × 90°	\N	\N	3	3	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
249	Counter Sink	3/4 " × 90°	\N	\N	1	1	B16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
250	Countersink Bore	M2	\N	\N	6	6	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
251	Countersink Bore	M2.6	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
252	Countersink Bore	M3.5	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
253	Countersink Bore	M 4	\N	\N	1	1	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
254	Countersink Bore	M 5	\N	\N	6	6	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
255	Countersink Bore	M 6	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
256	Countersink Bore	M8	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
257	Countersink Bore	M 10	\N	\N	1	1	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
258	Countersink Bore	M 12	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
259	Countersink Bore	M 14	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
260	Countersink Bore	M 16	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
261	Countersink Bore	M 18	\N	\N	2	2	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
262	Countersink Bore	M20	\N	\N	2	2	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
263	Countersink Bore	Ø 13 * 6.4	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
264	Countersink Bore	Ø 21.5 * 10.5	\N	\N	7	7	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
265	Countersink Bore	Ø 26 * 13	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
266	Countersink Bore	Ø 34 * 17	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
267	D - Shackle	3/4"	\N	\N	4	4	D10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
268	D - Shackle	1"	\N	\N	4	4	D10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
269	D'andrea Boaring Bar (Roughing)	Ø 18 - 22	TS 16/16	\N	1	1	TC - 02	\N	No Catridge	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
270	D'andrea Boaring Bar (Roughing)	Ø 22 - 28	TS 20/20	\N	1	1	TC - 02	\N	Catridge - SSCC20	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
271	D'andrea Boaring Bar (Roughing)	Ø 28 - 38	TS 25/25	\N	1	1	TC - 02	\N	Catridge - SSCC25	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
272	D'andrea Boaring Bar (Roughing)	Ø 35.5 - 50	TS 32/32	\N	1	1	\N	\N	Catridge - SFTP32	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
273	D'andrea Boaring Bar (Roughing)	Ø 50 - 68	TS 40/40	\N	1	1	TC - 02	\N	Catridge - SSCC40	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
274	D'andrea Boaring Bar (Roughing)	Ø 68 - 90	BS 50/50.100	\N	1	1	TC - 02	\N	Catridge - SSCC50	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
275	D'andrea Boaring Bar (Roughing)	Ø 90 - 120	TS 50/63	\N	1	1	TC - 02	\N	Catridge - SSCC63	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
276	D'andrea Boaring Bar (Roughing)	Ø 90 - 120	TS 63/63	\N	1	1	\N	\N	Catridge - SSCC90 (Long Catridge)	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
277	D'andrea Boaring Bar (Roughing)	Ø 200 - 300	BPS 200	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
278	D'andrea Boaring Bar (Finishing)	Ø 8 - 16	TRM 63, P 20.30	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
279	D'andrea Boaring Bar (Finishing)	Ø 18 - 23	BF 16/16.34	\N	1	1	TC - 02	\N	Catridge - SFCC 16	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
280	D'andrea Boaring Bar (Finishing)	Ø 18 - 23	TRM 16/16	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
281	D'andrea Boaring Bar (Finishing)	Ø 22 - 29	\N	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
282	D'andrea Boaring Bar (Finishing)	Ø 22 - 29	BF 20/20.40	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
283	D'andrea Boaring Bar (Finishing)	Ø 28 - 38	TRM 25/25	\N	1	1	TC - 02	\N	Catridge - SFTP 25	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
284	D'andrea Boaring Bar (Finishing)	Ø 28 - 38	BF 25/25.50	\N	1	1	\N	\N	Catridge - SFCC 25	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
285	D'andrea Boaring Bar (Finishing)	Ø 35.5 - 50	TRM 32/32	\N	1	1	TC - 02	\N	Catridge - SFCC 32	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
286	D'andrea Boaring Bar (Finishing)	Ø 35.5 - 50	TRM 32/32	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
287	D'andrea Boaring Bar (Finishing)	Ø 48 - 63	\N	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
288	D'andrea Boaring Bar (Finishing)	Ø 54 - 84	TRM 50/50	\N	1	1	TC - 02	\N	Catridge - SFCC 50	214704	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
289	D'andrea Boaring Bar (Finishing)	Ø 54 - 84	TRM 50/50	\N	1	1	TC - 02	\N	Catridge - SFTP 50	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
290	D'andrea Boaring Bar (Finishing)	Ø 90 - 120	\N	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
291	D'andrea Boaring Bar (Finishing)	Ø 90 - 120	TRM 63 , PS 11.30	\N	1	1	\N	\N	Catridge - SFCC 50	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
292	D'andrea Boaring Bar (Finishing)	Ø 100 - 200	TRM 80 , PS 12.30	\N	1	1	TC - 02	\N	Catridge - SFCC 50	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
293	D'andrea Boaring Bar Adapters	72 × 20 × 32	RD 50/32.32	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
294	D'andrea Boaring Bar Adapters	64 × 10 × 32	RD 50/16.24	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
295	D'andrea Boaring Bar Adapters	66 ×13 × 32	RD 50/20.26	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
296	D'andrea Boaring Bar Adapters	156 × 16 × 32	RAV 50/25.117	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
297	D'andrea Boaring Bar Adapters	127 × 16 × 32	RD 50/25.87	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
298	D'andrea Boaring Bar Adapters	110 × 13 × 32	RD 50/20.70	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
299	D'andrea Boaring Bar Adapters	127 × 25 × 32	RD 50/25.87	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
300	D'andrea Boaring Bar Adapters	185 × 20 × 32	RD 50/32.144	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
301	D'andrea Boaring Bar Adapters	127 × 20 × 32	RD 50/32.87	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
302	D'andrea Boaring Bar Adapters	133 × 13 × 32	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
303	D'andrea Boaring Bar Adapters	184 × 20 × 32	RAV 50/32.144	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
304	D'andrea Boaring Bar Adapters	68 × 16 × 32	RD 50/125.28	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
305	D'andrea Boaring Bar Adapters	216 × 25 × 32	RAV 50/40.176	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
306	D'andrea Boaring Bar Adapters	96 × 25 × 25	PR 40.63	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
307	D'andrea Boaring Bar Adapters	96 × 25 × 25	PR 40.63	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
308	D'andrea Boaring Bar Adapters	77 × 20 × 20	PR 32.50	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
309	D'andrea Boaring Bar Adapters	77 × 20 × 20	PR 32.50	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
310	D'andrea Boaring Bar Adapters	77 × 20 × 20	PR 32.50	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
311	D'andrea Boaring Bar Adapters	96 × 25 × 25	PR 40.63	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
312	D'andrea Boaring Bar Adapters	140 × 32 × 32	PR 50.100	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
313	D'andrea Boaring Bar Adapters	140 × 32 × 32	PR 50.100	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
314	D'andrea Boaring Bar Adapters	120 × 32 × 32	PR 50.80	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
315	D'andrea Boaring Bar Adapters	114 × 10 × 32	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
316	D'andrea Boaring Bar Adapters	174 × 42 × 42	PR 63.125	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
317	D'andrea Boaring Bar Adapters	80 × 10 × 32	RD 50/16.40	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
318	D'andrea Boaring Bar Adapters	77 × 20 × 20	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
319	D'andrea Boaring Bar Catridge	49 × 21.5 × 15	SFSH 50 - 45°	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
320	D'andrea Boaring Bar Catridge	33 × 13.5 × 9.3	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
321	D'andrea Boaring Bar Catridge	90 × 32 × 25	SSCC - 80	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
322	D'andrea Boaring Bar Catridge	420 × 25 × 130	43.30.30.30.430.0	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
323	D'andrea Boaring Bar Catridge	95 × 34 × 27	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
324	D'andrea Boaring Bar Catridge Holders	93 × 30 × 35	PS 12.30	\N	1	1	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
325	D'andrea Boaring Bar Catridge Holders	135 × 30 × 25	PS 13.30	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
326	D'andrea Fine Adjustment Screw Driver	\N	\N	\N	7	7	TC - 02	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
327	D'andrea Boaring Bar Kit	Ø 6 - 220	TRM 32 HS	\N	0	0	TC - 02	\N	Boaring Bar - 9 No	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
328	Dead Centre	MT 0	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
330	Dead Centre	MT 2	\N	\N	6	6	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
331	Dead Centre	MT 3	\N	\N	14	14	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
332	Dead Centre	MT 4	\N	\N	16	16	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
333	Dead Centre	MT 4.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
334	Dead Centre	MT 5	\N	\N	9	9	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
335	Dead Centre	MT 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
336	Dead Centre	MT 7	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
337	Pipe Centre	MT 0	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
338	Pipe Centre	MT 1	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
339	Pipe Centre	MT 2	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
340	Pipe Centre	MT 3	\N	\N	3	3	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
341	Pipe Centre	MT 4	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
342	Pipe Centre	MT 4.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
343	Pipe Centre	MT 5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
344	Pipe Centre	MT 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
345	Pipe Centre	MT 7	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
346	Revolving Centre	MT 0	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
347	Revolving Centre	MT 1	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
348	Revolving Centre	MT 2	\N	\N	2	2	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
349	Revolving Centre	MT 3	\N	\N	2	2	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
350	Revolving Centre	MT 4	\N	\N	4	4	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
351	Revolving Centre	MT 4.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
352	Revolving Centre	MT 5	\N	\N	3	3	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
353	Revolving Centre	MT 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
354	Revolving Centre	MT 7	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
355	Revolving Pipe Centre	MT 0	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
356	Revolving Pipe Centre	MT 1	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
357	Revolving Pipe Centre	MT 2	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
358	Revolving Pipe Centre	MT 3	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
359	Revolving Pipe Centre	MT 4	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
360	Revolving Pipe Centre	MT 4.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
361	Revolving Pipe Centre	MT 5	\N	\N	0	0	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
362	Revolving Pipe Centre	MT 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
363	Revolving Pipe Centre	MT 7	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
364	Drill Chuck	MT 0	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
365	Drill Chuck	MT 1	\N	\N	9	9	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
366	Drill Chuck	MT 2	\N	\N	17	17	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
367	Drill Chuck	MT 3	\N	\N	8	8	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
368	Drill Chuck	MT 4	\N	\N	3	3	A12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
369	Drill Chuck	MT 4.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
370	Drill Chuck	MT 5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
371	Drill Chuck	MT 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
372	Drill Chuck	MT 7	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Drills
373	Depth Micrometer	0-100	\N	Somet	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
374	Depth Micrometer	0-100	DM1039	Myco	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
375	Depth Micrometer	0-100	DM2162	Myco	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
376	Depth Scale	0 - 150	\N	\N	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
377	Depth Scale	0 - 300	\N	\N	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
378	Depth Vernier	0 - 200	TC - 61	K S	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
379	Depth Vernier	0 - 200	TC - 62	K S	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
380	Depth Vernier	0 - 210	TC - 63	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
381	Depth Vernier	0 - 300	TC - 65	K S	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
382	Depth Vernier	0 - 300	CSN 251 284	Somet	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
383	Depth Vernier	0 - 310	TC - 64	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
384	Depth Vernier	0 - 310	TC - 66	\N	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
385	Depth Vernier	0 - 640	TC - 67	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
386	Depth Vernier	0 - 640	TC - 68	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
387	Dial Caliper	0 - 150	6264744	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
388	Dial Caliper	0 - 150	\N	\N	1	1	Shishuma (NMTC)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
389	Dial Caliper	0 - 150	12360115	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
390	Dial Caliper	0 - 150	505-681	\N	1	1	Kavitha V (SVT)	\N	\N	59586	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
391	Dial Caliper	0 - 150	2146455	Mitutoyo	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
392	Dial Caliper	0 - 150	12578901	Mitutoyo	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
393	Dial Caliper	0 - 150	12579201	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
454	Die	M 18 × 1.5	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
394	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	21538718	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
395	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	21540228	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
396	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	21537738	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
397	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	22313979	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
398	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	21539291	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
399	Dial Caliper (New Stock)	0 - 150 ( 0.02 )	21356892	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
400	Dial Caliper	0 - 200 ( 0.01 )	14315416	Mitutoyo	1	1	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
401	Dial Caliper	0 - 200	505 - 682	Mitutoyo	1	1	\N	\N	\N	30375	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
402	Dial Caliper	0 - 200	505 - 682	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
403	Dial Caliper	0 - 200	14315424	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
404	Dial Caliper	0 - 200	14315411	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
405	Dial Caliper	0 - 300	14313567	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
406	Dial Caliper	0 - 300	11550028	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
407	Dial Caliper	0 - 300	11541530	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
408	Dial Caliper	0 - 300	505 - 673	Mitutoyo	1	1	\N	\N	\N	39200	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
409	Dial Caliper	0 - 300	11546087	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
410	Dial Caliper	0 - 300	\N	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
411	Dial Caliper	0 - 300	11546048	Mitutoyo	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
412	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	22551743	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
413	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	22555976	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
414	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	23535965	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
415	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	22556160	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
416	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	22553805	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
417	Dial Caliper (New Stock)	0 - 300 ( 0.02 )	22555778	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
418	Dial Stand	\N	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
419	Die Stock	\N	\N	\N	32	32	G15	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
420	Die	M 1	\N	\N	3	3	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
421	Die	M 1.4	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
422	Die	M 1.6	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
423	Die	M 1.7	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
424	Die	M 2	\N	\N	7	7	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
425	Die	M 2.3	\N	\N	8	8	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
426	Die	M 2.6	\N	\N	7	7	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
427	Die	M 3 × 0.35	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
428	Die	M 3 × 0.5	\N	\N	11	11	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
429	Die	M 3 × 0.6	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
430	Die	M 3.5	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
431	Die	M 4 × 0.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
432	Die	M 4 × 0.7	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
433	Die	M 4.5 × 0.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
434	Die	M 5 × 0.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
435	Die	M 5 × 0.8	\N	\N	5	5	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
436	Die	M 5.5 × 0.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
437	Die	M 6 × 1.0	\N	\N	7	7	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
438	Die	M 8 × 0.5	\N	\N	2	2	H3	\N	\N	160	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
439	Die	M 8 × 0.75	\N	\N	2	2	H3	\N	\N	160	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
440	Die	M 8 × 1.0	\N	\N	2	2	H3	\N	\N	160	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
441	Die	M 8 × 1.25	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
442	Die	M 10 × 0.75	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
443	Die	M 10 × 1.0	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
444	Die	M 10 × 1.5	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
445	Die	M 11 × 1.0	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
446	Die	M 12 × 1.0	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
447	Die	M 12 × 1.5	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
448	Die	M 12 × 1.75	\N	\N	3	3	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
449	Die	M 14 × 1.5	\N	\N	5	5	H3	\N	\N	275	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
450	Die	M 14 × 2	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
451	Die	M 15 × 1.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
452	Die	M 16 × 1.5	\N	\N	5	5	H3	\N	\N	460	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
453	Die	M 16 × 2.0	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
455	Die	M 18 × 2.5	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
456	Die	M 20 × 1.5	\N	\N	4	4	H3	\N	\N	705	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
457	Die	M 20 × 2.5	\N	\N	4	4	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
458	Die	M 22 × 1.5	\N	\N	4	4	H3	\N	\N	680	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
459	Die	M 22 × 2.5	\N	\N	3	3	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
460	Die	M 24 × 1.5	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
461	Die	M 24 × 3.0	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
462	Die	M 26 × 1.5	\N	\N	4	4	H3	\N	\N	860	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
463	Die	M 27 × 3.0	\N	\N	3	3	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
464	Die	M 30 × 3.5	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
465	Die	M 33 × 1.5	\N	\N	2	2	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
466	Die	M 33 × 3.5	\N	\N	3	3	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
467	Die	M 35 × 1.5	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
468	Die	M 36 × 2.0	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
469	Die	M 36 × 3.0	\N	\N	1	1	H3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
470	Die	M 39 × 2.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
471	Die	M 39 × 3.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
472	Die	M 39 × 4.0	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
473	Die	M 40 × 1.5	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
474	Die	M 42 × 1.5	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
475	Die	M 42 × 2.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
476	Die	M 42 × 3.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
477	Die	M 42 × 4.5	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
478	Die	M 45 × 1.5	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
479	Die	M 45 × 2.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
480	Die	M 45 × 3.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
481	Die	M 45 × 4.5	\N	\N	3	3	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
482	Die	M 48 × 1.5	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
483	Die	M 48 × 2.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
484	Die	M 48 × 3.0	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
485	Die	M 48 × 5.0	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
486	Die	G 3/8	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
487	Die	G 1/8	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
488	Die	G 1/2	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
489	Die	G 1/4	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
490	Die	G 1"	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
491	Die	G 7/8	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
492	Die	G 3/4	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
493	Die	G 1 1/8	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
494	Die	G 1 1/4	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
495	Die	G 1 1/2	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
496	Die	G 1 3/8	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
497	Die	W 1/4	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
498	Die	W 1/4 LH	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
499	Die	W 9/16	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
500	Die	W 3/4	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
501	Die	W 5/8	\N	\N	4	4	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
502	Die	W 1/2	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
503	Die	W 7/8	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
504	Die	W 1"	\N	\N	3	3	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
505	Die	PZ 7	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
506	Die	PZ 9	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
507	Die	PZ 11	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
508	Die	PZ 13.5	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
509	Die	PZ 16	\N	\N	2	2	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
510	Die	PZ 21	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
511	Die	PZ 29	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
512	Die	PZ 36	\N	\N	1	1	H4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
513	Digital Bore Gauge	10 - 20	2201127,2201126,2201125	Helios	0	0	TC - 10	Ring Gauge (Ø12.497 , Ø19.997) (2 No's)	Attachments - (10 - 12.5)(12.5 - 16)(16 - 20)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
514	Digital Bore Gauge	20 - 50	2201119,2201118,2201117	Helios	0	0	TC - 10	Ring Gauge (Ø19.998 , Ø30.005 , Ø42.501) (3 No's)	Attachments - (20 - 25)(25 - 35)(35 - 50)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
515	Digital Bore Gauge	50 - 100	2201139,2201138	Helios	0	0	TC - 10	Ring Gauge (Ø62.498 , Ø87.496 ) (2 No's)	Attachments - (50 - 75)(75 - 100)(Setting Pins - 4 Set)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
570	End Mill ( Flat )	Ø 4.5	\N	\N	3	3	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
516	Digital Caliper (New Stock)	0 - 150 ( 0.01 )	B23425748	Mitutoyo	1	1	TC - 09	\N	New Stock	9830.51	TCPP	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
517	Digital Caliper (New Stock)	0 - 150 ( 0.01 )	B23426017	Mitutoyo	1	1	TC - 09	\N	New Stock	9830.51	TCPP	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
518	Digital Caliper	0 - 150 ( 0.01 )	0054281	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
575	End Mill ( Flat )	Ø 9.1	\N	\N	2	2	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
519	Digital Caliper (New Stock)	0 - 300 ( 0.01 )	0073339	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
520	Digital Caliper (New Stock)	0 - 300 ( 0.01 )	0073340	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
521	Digital Caliper	0 - 300 ( 0.001 )	0004506	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
522	Digital Caliper	0 - 450	0004498	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
523	Digital Caliper	0 - 600	0009200	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
524	Digital Caliper	0 - 1000 (0.001)	4506	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
525	Digital Height Gauge	0 - 300 ( 0.01 )	0002171	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
526	Dovetail Cutter ( External )	45° × Ø 16 Ext	\N	\N	2	2	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
527	Dovetail Cutter ( External )	45° × Ø 20 Ext	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
528	Dovetail Cutter ( External )	45° × Ø 25 Ext	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
529	Dovetail Cutter ( External )	50° × Ø 16 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
530	Dovetail Cutter ( External )	50° × Ø 25 Ext	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
531	Dovetail Cutter ( External )	55° × Ø 16 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
532	Dovetail Cutter ( External )	55° × Ø 25 Ext	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
533	Dovetail Cutter ( External )	60° × Ø 16 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
534	Dovetail Cutter ( External )	60° × Ø 20 Ext	\N	\N	3	3	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
535	Dovetail Cutter ( External )	60° × Ø 25 Ext	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
536	Dovetail Cutter ( External )	65° × Ø 16 Ext	\N	\N	3	3	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
537	Dovetail Cutter ( External )	65° × Ø 25 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
538	Dovetail Cutter ( External )	70° × Ø 16 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
539	Dovetail Cutter ( External )	70° × Ø 20 Ext	\N	\N	2	2	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
540	Dovetail Cutter ( External )	70° × Ø 25 Ext	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
541	Dovetail Cutter ( External )	75° × Ø 16 Ext	\N	\N	8	8	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
542	Dovetail Cutter ( External )	75° × Ø 25 Ext	\N	\N	3	3	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
543	Dovetail Cutter ( Internal )	45° × Ø 16 Int	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
544	Dovetail Cutter ( Internal )	45° × Ø 20 Int	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
545	Dovetail Cutter ( Internal )	45° × Ø 25 Int	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
546	Dovetail Cutter ( Internal )	50° × Ø 16 Int	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
547	Dovetail Cutter ( Internal )	50° × Ø 25 Int	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
548	Dovetail Cutter ( Internal )	55° × Ø 15 Int	\N	\N	2	2	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
549	Dovetail Cutter ( Internal )	55° × Ø 16 Int	\N	\N	7	7	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
550	Dovetail Cutter ( Internal )	55° × Ø 25 Int	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
551	Dovetail Cutter ( Internal )	55° × Ø 55 Int	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
552	Dovetail Cutter ( Internal )	55° × Ø 63 × 20 × 16 Int	\N	\N	1	1	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
553	Dovetail Cutter ( Internal )	60° × Ø 16 Int	\N	\N	2	2	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
554	Dovetail Cutter ( Internal )	60° × Ø 20 Int	\N	\N	7	7	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
555	Dovetail Cutter ( Internal )	60° × Ø 25 Int	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
556	Dovetail Cutter ( Internal )	65° × Ø 16 Int	\N	\N	4	4	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
557	Dovetail Cutter ( Internal )	65° × Ø 25 Int	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
558	Dovetail Cutter ( Internal )	70° × Ø 16 Int	\N	\N	3	3	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
559	Dovetail Cutter ( Internal )	70° × Ø 20 Int	\N	\N	3	3	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
560	Dovetail Cutter ( Internal )	70° × Ø 25 Int	\N	\N	5	5	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
561	Dovetail Cutter ( Internal )	75° × Ø 16 Int	\N	\N	6	6	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
562	Dovetail Cutter ( Internal )	75° × Ø 25 Int	\N	\N	6	6	B8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
563	Drift	\N	\N	\N	20	20	D29	\N	\N	8155	BIN CARD	CONSUMABLES	\N	Tools	Hammers & Punches
564	Edge Finder	\N	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
565	End Mill ( Flat )	Ø 2	\N	\N	33	33	E14	\N	\N	11065	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
566	End Mill ( Flat )	Ø 2.5	\N	\N	4	4	E8	\N	\N	306	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
567	End Mill ( Flat )	Ø 3	\N	\N	25	25	E14	\N	\N	4923	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
568	End Mill ( Flat )	Ø 3.5	\N	\N	4	4	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
569	End Mill ( Flat )	Ø 4	\N	\N	42	42	E8	\N	\N	8026	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
571	End Mill ( Flat )	Ø 5	\N	\N	26	26	E14	\N	\N	27029	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
572	End Mill ( Flat )	Ø 6	\N	\N	45	45	E14	\N	\N	15457	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
573	End Mill ( Flat )	Ø 8	\N	\N	37	37	E14	\N	\N	32517	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
574	End Mill ( Flat )	Ø 7	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
576	End Mill ( Flat )	Ø 9.5	\N	\N	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
577	End Mill ( Flat )	Ø 10	\N	\N	11	11	E14	\N	\N	46019	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
578	End Mill ( Flat )	Ø 12	\N	\N	27	27	E14	\N	\N	30340	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
579	End Mill ( Flat )	Ø 14	\N	\N	2	2	E8	\N	\N	7276	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
580	End Mill ( Flat )	Ø 16	\N	\N	13	13	E14	\N	\N	31874	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
581	End Mill ( Flat )	Ø 20	\N	\N	8	8	E14	\N	\N	33221	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
582	End Mill ( Flat )	Ø 25	\N	\N	7	7	E14	\N	\N	32336	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
583	End Mill ( Ball Nose )	Ø 2	\N	\N	9	9	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
584	End Mill ( Ball Nose )	Ø 2.5	\N	\N	23	23	E8	\N	\N	5040	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
585	End Mill ( Ball Nose )	Ø 3	\N	\N	15	15	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
586	End Mill ( Ball Nose )	Ø 3.5	\N	\N	1	1	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
587	End Mill ( Ball Nose )	Ø 4	\N	\N	21	21	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
588	End Mill ( Ball Nose )	Ø 5	\N	\N	9	9	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
589	End Mill ( Ball Nose )	Ø 6	\N	\N	13	13	E8	\N	\N	8880	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
590	End Mill ( Ball Nose )	Ø 8	\N	\N	35	35	E8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
591	End Mill ( Ball Nose )	Ø 10	\N	\N	19	19	\N	\N	\N	23838	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
592	End Mill ( Ball Nose )	Ø 12	\N	\N	17	17	\N	\N	\N	35762	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
593	End Mill ( Ball Nose )	Ø 16	\N	\N	2	2	\N	\N	\N	42058	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
594	End Mill ( Bull Nose )	Ø 12	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
595	End Mill ( Bull Nose )	Ø 16	\N	\N	1	1	\N	\N	\N	6354	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
596	Extension Stud	M12 × 80	\N	\N	42	42	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
597	Extension Stud	M12 × 100	\N	\N	44	44	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
598	Extension Stud	M12 × 160	\N	\N	23	23	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
599	Extension Stud	M12 × 250	\N	\N	5	5	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
600	Extension Stud	M16 × 80	\N	\N	40	40	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
601	Extension Stud	M16 × 100	\N	\N	35	35	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
602	Extension Stud	M16 × 160	\N	\N	3	3	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
603	Extension Stud	M16 × 250	\N	\N	2	2	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
604	Extension Stud	M20 × 250	\N	\N	6	6	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
605	O D Grooving Tool	20 × 20	RF151.23 - 2020 - 30M	Sandvik	1	1	TC - 04	\N	\N	21400	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
606	O D Grooving Tool	20 × 20	SGTFL 20200 - 3	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
607	O D Grooving Tool	25 × 25	TGDR 2525 - 6M	Iscar	1	1	TC - 04	\N	\N	2641	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
608	O D Grooving Tool	25 × 25	CFTR 2525  M03	Seco	1	1	TC - 04	\N	\N	29130	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
609	O D Grooving Tool	\N	RF151.23 - 2525  - 30M	Sandvik	1	1	TC - 04	\N	\N	22800	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
610	O D Grooving Tool	\N	RF151.23 - 1616  - 30M	Sandvik	2	2	TC - 04	\N	\N	18700	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
611	O D Grooving Tool	20 × 20	CFTR 2020 K03	Seco	1	1	TC - 04	\N	\N	27330	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
612	O D Grooving Tool	25 × 25	4656294	Seco	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
613	O D Grooving Tool	20 × 20	750541	Sandvik	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
614	O D Grooving Tool	20 × 20	DGTR 20B - 1.4D30	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
615	O D Grooving Tool	\N	GHDL 25 - 5	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
616	O D Grooving Tool	\N	TTER 2525 - 3T25	Taegutec	10	10	TC - 04	\N	\N	35405	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
617	O D Grooving Tool	\N	TTEL 2020 - 3T20	Taegutec	9	9	TC - 04	\N	\N	20166	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
618	O D Relief Grooving Tool	20 × 20	GHMUR 20	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
619	O D Relief Grooving Tool	25 × 25	GHMUR 25	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
620	O D Relief Grooving Tool	25 × 25	GHMUR 25	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
621	O D Relief Grooving Tool	16 × 16	GHMUR 16	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
622	O D Relief Grooving Tool	16 × 16	GHMUR 16	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
623	O D Relief Grooving Tool	\N	SMGHR 2020 K6	Mitsubishi	1	1	TC - 05	\N	0.5 , 0.75 Insert Ball Screw 10*4	9867	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
624	O D Relief Grooving Tool	\N	RF123T06 - 2525 BM	Sandvik	1	1	TC - 05	\N	Ball Screw 10*4	9083	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
625	O D Relief Grooving Tool	\N	RF12306T06 - 1616 BM	Sandvik	1	1	TC - 05	\N	Ball Screw 10*4	7465	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
626	O D Relief Grooving Tool	\N	SMGHR 1616 H16	Mitsubishi	1	1	TC - 05	\N	0.5 , 0.75 Insert Ball Screw 10*4	7690	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
628	Analog Outside Micrometer	0-25	\N	Myco	1	1	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
629	Analog Outside Micrometer	0-25	\N	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
630	Analog Outside Micrometer	0-25	NBR - E1336	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
631	Analog Outside Micrometer	0-25	\N	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
632	Analog Outside Micrometer	0-25	74020855	Mitutoyo	1	1	TC - 09	\N	New Stock	1761.86	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
633	Analog Outside Micrometer	0-25	75020844	Mitutoyo	1	1	TC - 09	\N	New Stock	1761.86	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
634	Analog Outside Micrometer	0-25	74020857	Mitutoyo	1	1	TC - 09	\N	New Stock	1761.86	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
635	Analog Outside Micrometer	0-25	74020860	Mitutoyo	1	1	TC - 09	\N	New Stock	1761.86	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
636	Analog Outside Micrometer	0-25	75020847	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
637	Analog Outside Micrometer	0-25	75020846	Mitutoyo	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
638	Analog Outside Micrometer	25-50	2116636	Mitutoyo	1	1	TC - 09	Yes	\N	16400	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
639	Analog Outside Micrometer	25-50	2098549	Mitutoyo	1	1	TC - 09	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
640	Analog Outside Micrometer	25-50	1311695	Mitutoyo	1	1	TC - 09	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
641	Analog Outside Micrometer	25-50	D-9978	Hip	1	1	TC - 09	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
642	Analog Outside Micrometer	25-50	M-4-0742	\N	1	1	TC - 09	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
643	Analog Outside Micrometer	25-50	M-4-0716	\N	1	1	TC - 09	No	Spindle Lock Absent	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
644	Analog Outside Micrometer	25-50	NBR - 293 - 562 - 30	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
645	Analog Outside Micrometer	25-50	\N	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
646	Analog Outside Micrometer	25-50	\N	Hip	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
647	Analog Outside Micrometer	25-50	75030791	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
648	Analog Outside Micrometer	25-50	74060669	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
649	Analog Outside Micrometer	25-50	74060667	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
650	Analog Outside Micrometer	25-50	75055105	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
651	Analog Outside Micrometer	25-50	74054967	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
652	Analog Outside Micrometer	25-50	75030897	Mitutoyo	1	1	TC - 09	Yes	New Stock	2390.68	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
653	Analog Outside Micrometer	50-75	N-2-1853	\N	1	1	TC - 11	Yes	\N	45572	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
654	Analog Outside Micrometer	50-75	01.10103	TESA	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
655	Analog Outside Micrometer	50-75	N-2-1323	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
656	Analog Outside Micrometer	50-75	NBR - 103 - 139 -10	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
657	Analog Outside Micrometer	50-75	9024759	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
658	Analog Outside Micrometer	50-75	\N	TESA	1	1	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
659	Analog Outside Micrometer	50-75	74040598	Mitutoyo	1	1	TC - 09	Yes	New Stock	2684.75	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
660	Analog Outside Micrometer	50-75	75040585	Mitutoyo	1	1	TC - 09	Yes	New Stock	2684.75	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
661	Analog Outside Micrometer	50-75	74036280	Mitutoyo	1	1	TC - 09	Yes	New Stock	2684.75	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
662	Analog Outside Micrometer	50-75	75036384	Mitutoyo	1	1	TC - 09	Yes	New Stock	2684.75	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
663	Analog Outside Micrometer	75-100	N-1-1825	Somet	1	1	TC - 11	Yes	\N	91144	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
664	Analog Outside Micrometer	75-100	NBR - 851003	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
665	Analog Outside Micrometer	75-100	\N	Somet	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
666	Analog Outside Micrometer	75-100	74120376	Mitutoyo	1	1	TC - 09	Yes	New Stock	2936.44	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
667	Analog Outside Micrometer	75-100	74120375	Mitutoyo	1	1	TC - 09	Yes	New Stock	2936.44	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
668	Analog Outside Micrometer	75-100	75121862	Mitutoyo	1	1	TC - 09	Yes	New Stock	2936.44	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
669	Analog Outside Micrometer	75-100	75121861	Mitutoyo	1	1	TC - 09	Yes	New Stock	2936.44	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
670	Analog Outside Micrometer	100-125	N-4-2445	Somet	1	1	TC - 11	Yes	\N	60762	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
671	Analog Outside Micrometer	100-125	N-3-0176	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
672	Analog Outside Micrometer	100-125	N-4-2441	Somet	1	1	\N	Yes	\N	4052.54	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
673	Analog Outside Micrometer	100-125	\N	Somet	1	1	\N	\N	\N	4052.54	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
674	Analog Outside Micrometer	100-125	\N	Somet	1	1	\N	\N	\N	4052.54	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
675	Analog Outside Micrometer	100-125	74065322	Mitutoyo	1	1	TC - 09	Yes	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
676	Analog Outside Micrometer	100-125	74132564	Mitutoyo	1	1	TC - 09	Yes	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
677	Analog Outside Micrometer	100-125	75066823	Mitutoyo	1	1	TC - 09	Yes	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
678	Analog Outside Micrometer	100-125	\N	\N	1	1	Jiyaulla Khan	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
679	Analog Outside Micrometer	125-150	K-2-1562	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
680	Analog Outside Micrometer	125-150	M-3-2036	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
681	Analog Outside Micrometer	125-150	K-2-1590	Somet	1	1	TC - 11	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
682	Analog Outside Micrometer	125-150	\N	Somet	1	1	\N	\N	\N	5237.01	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
683	Analog Outside Micrometer	125-150	71877396	Mitutoyo	1	1	TC - 09	Yes	New Stock	4438.14	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
684	Analog Outside Micrometer	125-150	75178836	Mitutoyo	1	1	TC - 09	Yes	New Stock	4438.14	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
685	Analog Outside Micrometer	125-150	74200519	Mitutoyo	1	1	TC - 09	Yes	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
686	Analog Outside Micrometer	125-150	\N	\N	1	1	Md Fazal	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
687	Analog Outside Micrometer	150-175	N-1-0703	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
688	Analog Outside Micrometer	150-175	N-1-0675	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
689	Analog Outside Micrometer	150-175	N-1-1257	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
690	Analog Outside Micrometer	150-175	N-1-0562	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
691	Analog Outside Micrometer	150-175	N-1-1215	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
692	Analog Outside Micrometer	150-175	\N	Somet	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
693	Analog Outside Micrometer	150-175	75178410	Mitutoyo	1	1	TC - 09	Yes	New Stock	6137.99	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
694	Analog Outside Micrometer	150-175	75153065	Mitutoyo	1	1	TC - 09	Yes	New Stock	6137.99	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
695	Analog Outside Micrometer	175-200	N-1-0495	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
696	Analog Outside Micrometer	175-200	N-1-1496	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
697	Analog Outside Micrometer	175-200	N-1-1466	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
698	Analog Outside Micrometer	175-200	N-1-0374	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
699	Analog Outside Micrometer	175-200	N-1-1514	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
700	Analog Outside Micrometer	175-200	N-1-1442	Somet	1	1	\N	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
701	Analog Outside Micrometer	175-200	\N	Somet	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
702	Analog Outside Micrometer	175-200	\N	Somet	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
703	Analog Outside Micrometer	175-200	75045060	Mitutoyo	1	1	TC - 09	Yes	New Stock	6584	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
704	Analog Outside Micrometer	175-200	74179924	Mitutoyo	1	1	TC - 09	Yes	New Stock	6584	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
705	Analog Outside Micrometer	200 - 225	75134886	Mitutoyo	1	1	TC - 09	Yes	New Stock	7514	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
706	Analog Outside Micrometer	200 - 225	74111912	Mitutoyo	1	1	TC - 09	Yes	New Stock	7514	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
707	Analog Outside Micrometer	225 - 250	71973645	Mitutoyo	1	1	TC - 09	Yes	New Stock	7514	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
708	Analog Outside Micrometer	225 - 250	74156536	Mitutoyo	1	1	TC - 09	Yes	New Stock	7514	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
709	Analog Outside Micrometer	250 - 275	72600257	Mitutoyo	1	1	TC - 09	Yes	New Stock	8178	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
710	Analog Outside Micrometer	250 - 275	74039685	Mitutoyo	1	1	TC - 09	Yes	New Stock	8178	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
711	Analog Outside Micrometer	275 - 300	72666373	Mitutoyo	1	1	TC - 09	Yes	New Stock	7509.32	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
712	Analog Outside Micrometer	275 - 300	75178941	Mitutoyo	1	1	TC - 09	Yes	New Stock	7509.32	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
713	Analog Outside Micrometer	100-200	ADJ3147	Myco	1	1	TC - 09	Yes	4 Setting Pins and 4 Gauges	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
714	Analog Outside Micrometer	200-300	TC 200300	Somet	0	0	TC - 09	Yes	4 Setting Pins and 1 Gauges	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
715	Analog Outside Micrometer	300-400	61099666	Mitutoyo	0	0	TC - 09	Yes	4 Setting Pins and 4 Gauges (New Stock)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
716	Analog Outside Micrometer	300-400	TC 300400	Somet	0	0	TC - 09	Yes	3 Setting Pins and 1 Gauges	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
717	Analog Outside Micrometer	400-500	61096063	Mitutoyo	0	0	TC - 09	Yes	4 Setting Pins and 4 Gauges (New Stock)	24425	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
718	Analog Outside Micrometer	500-600	61088624	Mitutoyo	0	0	\N	Yes	4 Setting Pins and 4 Gauges (New Stock)	31039	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
719	Analog Outside Micrometer NEW STOCK	600-700	61089962	Mitutoyo	0	0	\N	Yes	4 Setting Pins and 4 Gauges (New Stock)	34257	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
720	Digital Outside Micrometer	0-25	293 - 805	Mitutoyo	1	1	TC - 11	Yes	\N	3205	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
721	Digital Outside Micrometer	0-25	\N	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
722	Digital Outside Micrometer	25-50	9024648	PAV	1	1	TC - 11	Yes	\N	1152	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
723	Digital Outside Micrometer	50-75	9024779	PAV	1	1	TC - 11	Yes	\N	922	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
724	External Threading Tool	\N	SER 2020 K16	Iscar	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
725	External Threading Tool	\N	6949789110	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
726	External Threading Tool	\N	AL20 - 3C LH	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
727	External Threading Tool	\N	2020 K16	SCR	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
728	External Threading Tool	\N	AL20 - 3C	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
729	External Threading Tool	\N	AL20 - 3	Vardex	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
730	External Threading Tool	\N	AL25 - 4	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
731	External Threading Tool	\N	SCR 2525 M22	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
732	External Threading Tool	\N	AL25 - 5C	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
733	External Threading Tool	\N	AL25 - 3CLH (00013)	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
734	External Threading Tool	\N	AL25 - 3C (00010)	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
735	External Threading Tool	\N	AL25 - 5C (00020)	Vardex	1	1	TC - 04	\N	\N	13600	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
736	External Threading Tool	\N	AL25 - 4C	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
737	External Threading Tool	\N	AL25 - 5C (5314834)	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
738	External Threading Tool	\N	AL25 - 5C	Vardex	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
739	External Threading Tool	\N	AL25 - 4C (1172666)	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
740	External Threading Tool	\N	SER 1616 H16 D9K	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
741	External Threading Tool	\N	261322	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
742	External Threading Tool	\N	AL 25 - 3C	Vardex	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
743	External Threading Tool	\N	AL 25 - 3C	Vardex	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
744	Eye Bolt	M 8	\N	\N	2	2	B10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
745	Eye Bolt	M 10	\N	\N	10	10	B10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
746	Eye Bolt	M 16	\N	\N	4	4	B10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
747	Eye Bolt	M 20	\N	\N	8	8	B10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
748	Eye Bolt	M 24	\N	\N	7	7	B10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
749	Face Grooving Tool	25 × 25	HFHPL 25M	Iscar	1	1	TC - 04	\N	\N	2641	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
750	Face Grooving Tool	\N	SGFFA35 - L - 2	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
751	Face Grooving Tool	25 × 25	HFHPR 25M	Iscar	1	1	TC - 04	\N	\N	5881	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
752	Face Grooving Tool	32 × 32	GHAL32 - 8	Iscar	1	1	TC - 04	\N	\N	7348	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
753	Face Grooving Tool	32 × 32	GHAL32 - 8	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
754	Face Milling Cutter ( Arbor Type )	Ø 80	A 3433	Widia	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
755	Face Milling Cutter ( Arbor Type )	Ø 100	U 4000	Widex	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
756	Face Milling Cutter ( Arbor Type )	Ø 100	R260.22 - 100Q32 - 12L	Sandvik	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
757	Face Milling Cutter ( Arbor Type )	Ø 100	AHX640S - 100B07AR (EF0503)	Mitsubishi	1	1	G5	\N	\N	48153	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
758	Face Milling Cutter ( Arbor Type )	Ø 125	U 8652	Widex	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
759	Face Milling Cutter ( Arbor Type )	Ø 125	A 3472	Widia	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
760	Face Milling Cutter ( Arbor Type )	Ø 125	R260.22 - 125Q40 - 12L	Sandvik	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
761	Face Milling Cutter ( Arbor Type )	Ø 160	U 8353	Widex	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
762	Face Milling Cutter ( Arbor Type )	Ø 160	AHX640S - 160C10NR (EF0404)	Mitsubishi	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
763	Feeler Gauge	\N	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
764	Flat File	6"- 10"	\N	\N	36	36	D19	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
765	Flat File ( Bastard cut )	12"	\N	\N	15	15	D28	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
766	Flat File ( Smooth cut )	12"	\N	\N	12	12	D19	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
767	Half Round File	6"- 10"	\N	\N	32	32	D19	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
768	Half Round File	12"	\N	\N	11	11	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
769	Knife Edge File	6"- 10"	\N	\N	12	12	D19	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
770	Triangle File	6"	\N	\N	11	11	D7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
771	Triangle File	10"- 12"	\N	\N	15	15	D9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
772	Round File	6"- 8"	\N	\N	29	29	D7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
773	Round File	10"- 12"	\N	\N	35	35	D17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
774	Square File	6"- 8"	\N	\N	45	45	D7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
775	Square File	10" - 12"	\N	\N	58	58	D7	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
776	Wood File	12"	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
777	Needle File	\N	\N	\N	5	5	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
778	Flange Micrometer	0-25	129051	Mitutoyo	1	1	LSC - 138	\N	\N	1785	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
779	Flange Micrometer	0-25	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
780	Flange Micrometer	0-25	\N	Myco	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
781	Flange Micrometer	25-50	90566	Mitutoyo	1	1	TC - 11	Yes	\N	2480	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
782	Flange Micrometer	25-50	GT-18	Myco	1	1	TC - 11	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
783	Flange Micrometer	25-50	TC 4	VIS	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
784	Flange Micrometer	50-75	0332532	Mitutoyo	1	1	TC - 11	No	\N	2200	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
785	Flange Micrometer	50-75	8920827	Mitutoyo	1	1	TC - 11	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
786	Flange Micrometer	75-100	2182000	Mitutoyo	1	1	TC - 11	No	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
787	Flange Micrometer	75-100	2181275	Mitutoyo	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
788	Flange Micrometer	100-125	M-3-2488	Somet	1	1	TC - 11	Yes	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
789	Force Gauge	\N	\N	Dillan	1	1	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
790	French Adjustable Wrench (Small)	\N	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
791	French Adjustable Wrench (Big)	\N	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
792	Gear Tooth Vernier Caliper	\N	TC - GTV - 01	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
793	Gear Tooth Vernier Caliper	\N	TC - GTV - 02	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
794	Grinding Carrier	15 - 20	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
795	Grinding Carrier	20 - 25	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
796	Grinding Carrier	25 - 32	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
797	Grinding Carrier	30 - 40	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
798	Grinding Carrier	40 - 50	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
799	Grinding Carrier	50 - 60	\N	\N	4	4	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
800	Grinding Carrier	60 - 70	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
801	Grinding Carrier	70 - 80	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
802	Grinding Carrier	80 - 90	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
803	Grinding Carrier	90 - 100	\N	\N	3	3	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
804	Grinding Vice	\N	\N	\N	1	1	H9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
805	Groove Comparator	10 - 150	\N	Interapid	0	0	TC - 08	\N	Swiss Make	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
806	Groove Comparator	20 - 40	DA32P003	Kroeplin	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
807	Groove Micrometer	0 - 25	146 - 101	Mitutoyo	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
808	Groove Micrometer	25 - 50	146 - 105	Mitutoyo	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
809	Groove Micrometer	50 - 75	146 - 107	Mitutoyo	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
810	Groove Micrometer	75 - 100	146 - 109	Mitutoyo	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
811	Groove Milling Cutter (Shank Type)	\N	R331.35 - 063A25CM060	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
812	Groove Milling Cutter (Shell Type)	\N	\N	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
813	Groove Milling Cutter (Disc Type)	\N	SGSF 125 - 4 - 32K (6779)	Iscar	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
814	Hacksaw Frame	\N	\N	\N	4	4	F16	\N	\N	133	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
815	Hacksaw Blade	\N	\N	\N	70	70	E15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Files & Scrapers
816	Ball Pein Hammer	\N	\N	\N	6	6	E12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
817	Cross Pein Hammer	\N	\N	\N	4	4	E12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
818	Sledge Hammer	\N	\N	\N	5	5	E12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
819	Mallet Hammer	\N	\N	\N	9	9	E12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
820	Hand Reamer	2 H7	\N	\N	0	0	A3	\N	\N	540	BIN CARD	CONSUMABLES	\N	Tools	Reamers
821	Hand Reamer	2.5 H7	\N	\N	0	0	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
822	Hand Reamer	3 H7	\N	\N	10	10	A3	\N	\N	3060	BIN CARD	CONSUMABLES	\N	Tools	Reamers
823	Hand Reamer	4 H7	\N	\N	10	10	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
824	Hand Reamer	4.5 H7	\N	\N	3	3	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
825	Hand Reamer	5 H7	\N	\N	10	10	A3	\N	\N	1479	BIN CARD	CONSUMABLES	\N	Tools	Reamers
826	Hand Reamer	5.5 H7	\N	\N	1	1	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
827	Hand Reamer	6 H7	\N	\N	10	10	A3	\N	\N	1979	BIN CARD	CONSUMABLES	\N	Tools	Reamers
828	Hand Reamer	7 H7	\N	\N	6	6	A3	\N	\N	1944	BIN CARD	CONSUMABLES	\N	Tools	Reamers
829	Hand Reamer	8 H7	\N	\N	6	6	A3	\N	\N	4104	BIN CARD	CONSUMABLES	\N	Tools	Reamers
830	Hand Reamer	9 H7	\N	\N	3	3	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
831	Hand Reamer	10 H7	\N	\N	11	11	A3	\N	\N	4032	BIN CARD	CONSUMABLES	\N	Tools	Reamers
832	Hand Reamer	11 H7	\N	\N	4	4	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
833	Hand Reamer	12 H7	\N	\N	12	12	A3	\N	\N	4056	BIN CARD	CONSUMABLES	\N	Tools	Reamers
834	Hand Reamer	13 H7	\N	\N	1	1	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
835	Hand Reamer	14 H7	\N	\N	8	8	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
836	Hand Reamer	15 H7	\N	\N	7	7	A3	\N	\N	315	BIN CARD	CONSUMABLES	\N	Tools	Reamers
837	Hand Reamer	16 H7	\N	\N	11	11	A3	\N	\N	5230	BIN CARD	CONSUMABLES	\N	Tools	Reamers
838	Hand Reamer	17 H7	\N	\N	1	1	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
839	Hand Reamer	18 H7	\N	\N	9	9	A3	\N	\N	6462	BIN CARD	CONSUMABLES	\N	Tools	Reamers
840	Hand Reamer	19 H7	\N	\N	4	4	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
841	Hand Reamer	20 H7	\N	\N	10	10	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
842	Hand Reamer	21 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
843	Hand Reamer	22 H7	\N	\N	5	5	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
844	Hand Reamer	23 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
845	Hand Reamer	24 H7	\N	\N	3	3	A3	\N	\N	660	BIN CARD	CONSUMABLES	\N	Tools	Reamers
846	Hand Reamer	25 H7	\N	\N	5	5	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
847	Hand Reamer	26 H7	\N	\N	5	5	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
848	Hand Reamer	27 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
849	Hand Reamer	28 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
850	Hand Reamer	29 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
851	Hand Reamer	30 H7	\N	\N	4	4	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
852	Hand Reamer	31 H7	\N	\N	2	2	A3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
853	Hand Reamer	32 H7	\N	\N	2	2	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
854	Hand Reamer	33 H7	\N	\N	2	2	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
855	Hand Reamer	34 H7	\N	\N	2	2	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
856	Hand Reamer	35 H7	\N	\N	3	3	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
857	Hand Reamer	36 H7	\N	\N	1	1	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
858	Hand Reamer	38 H7	\N	\N	2	2	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
859	Hand Reamer	40 H7	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
860	Hand Reamer	44 H7	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
861	Hand Reamer	45 H7	\N	\N	2	2	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
862	Hand Reamer	46 H7	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
863	Hand Reamer	48 H7	\N	\N	2	2	B11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
864	Hand Reamer	50 H7	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
865	Hand Reamer	3 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
866	Hand Reamer	4 H8	\N	\N	0	0	A4	\N	\N	204	BIN CARD	CONSUMABLES	\N	Tools	Reamers
867	Hand Reamer	4.5 H8	\N	\N	1	1	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
868	Hand Reamer	5 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
869	Hand Reamer	5.5 H8	\N	\N	4	4	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
870	Hand Reamer	6 H8	\N	\N	0	0	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
871	Hand Reamer	7 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
872	Hand Reamer	8 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
873	Hand Reamer	9 H8	\N	\N	1	1	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
874	Hand Reamer	10 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
875	Hand Reamer	11 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
876	Hand Reamer	12 H8	\N	\N	1	1	A4	\N	\N	210	BIN CARD	CONSUMABLES	\N	Tools	Reamers
877	Hand Reamer	13 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
878	Hand Reamer	14 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
879	Hand Reamer	15 H8	\N	\N	1	1	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
880	Hand Reamer	16 H8	\N	\N	1	1	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
881	Hand Reamer	17 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
882	Hand Reamer	18 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
883	Hand Reamer	19 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
884	Hand Reamer	20 H8	\N	\N	2	2	A4	\N	\N	300	BIN CARD	CONSUMABLES	\N	Tools	Reamers
885	Hand Reamer	21 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
886	Hand Reamer	22 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
887	Hand Reamer	23 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
888	Hand Reamer	24 H8	\N	\N	1	1	A4	\N	\N	860	BIN CARD	CONSUMABLES	\N	Tools	Reamers
889	Hand Reamer	25 H8	\N	\N	3	3	A4	\N	\N	860	BIN CARD	CONSUMABLES	\N	Tools	Reamers
890	Hand Reamer	26 H8	\N	\N	3	3	A4	\N	\N	1088	BIN CARD	CONSUMABLES	\N	Tools	Reamers
891	Hand Reamer	27 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
892	Hand Reamer	28 H8	\N	\N	3	3	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
893	Hand Reamer	29 H8	\N	\N	2	2	A4	\N	\N	668	BIN CARD	CONSUMABLES	\N	Tools	Reamers
894	Hand Reamer	30 H8	\N	\N	2	2	A4	\N	\N	1002	BIN CARD	CONSUMABLES	\N	Tools	Reamers
895	Hand Reamer	31 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
896	Hand Reamer	32 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
897	Hand Reamer	33 H8	\N	\N	2	2	A4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
898	Hand Reamer	34 H8	\N	\N	2	2	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
899	Hand Reamer	35 H8	\N	\N	4	4	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
900	Hand Reamer	36 H8	\N	\N	2	2	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
901	Hand Reamer	38 H8	\N	\N	2	2	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
902	Hand Reamer	42 H8	\N	\N	4	4	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
903	Hand Reamer	44 H8	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
904	Hand Reamer	45 H8	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
905	Hand Reamer	46 H8	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
906	Hand Reamer	48 H8	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
907	Hand Reamer	50 H8	\N	\N	2	2	B6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
908	Hand Reamer ( Taper )	Ø 3	\N	\N	10	10	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
909	Hand Reamer ( Taper )	Ø 4	\N	\N	4	4	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
910	Hand Reamer ( Taper )	Ø 5	\N	\N	7	7	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
911	Hand Reamer ( Taper )	Ø 6	\N	\N	5	5	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
912	Hand Reamer ( Taper )	Ø 8	\N	\N	5	5	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
913	Hand Reamer ( Taper )	Ø 10	\N	\N	4	4	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
914	Hand Reamer ( Taper )	Ø 12	\N	\N	9	9	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
915	Hand Reamer ( Taper )	Ø 14	\N	\N	3	3	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
916	Hand Reamer ( Taper )	Ø 16	\N	\N	3	3	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
917	Hand Reamer ( Taper )	Ø 20	\N	\N	3	3	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
918	Hand Reamer ( Taper )	Ø 25	\N	\N	2	2	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
919	Hand Reamer ( Taper )	Ø 32	\N	\N	2	2	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
920	Hand Reamer ( Taper )	Ø 40	\N	\N	2	2	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
921	Hand Reamer ( Taper )	Ø 50	\N	\N	2	2	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
922	Hand Reamer ( Taper )	MT 5	\N	\N	1	1	A5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
923	Hand Vice	\N	\N	\N	6	6	E16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
924	Hole Mill	Ø 6.8	\N	\N	3	3	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
925	Hole Mill	Ø 7.8	\N	\N	6	6	B15	\N	\N	2076	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
926	Hole Mill	Ø 7.9	\N	\N	1	1	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
927	Hole Mill	Ø 8.8	\N	\N	5	5	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
928	Hole Mill	Ø 8.9	\N	\N	3	3	B15	\N	\N	15992	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
929	Hole Mill	Ø 9.2	\N	\N	1	1	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
930	Hole Mill	Ø 9.8	\N	\N	8	8	B15	\N	\N	2436	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
931	Hole Mill	Ø 10.8	\N	\N	9	9	B14	\N	\N	4850	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
932	Hole Mill	Ø 11.8	\N	\N	13	13	B14	\N	\N	6672	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
933	Hole Mill	Ø 12.8	\N	\N	10	10	B14	\N	\N	1524	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
934	Hole Mill	Ø 13.8	\N	\N	9	9	B14	\N	\N	636	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
935	Hole Mill	Ø 14.8	\N	\N	6	6	B14	\N	\N	444	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
936	Hole Mill	Ø 15.6	\N	\N	2	2	B14	\N	\N	333	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
937	Hole Mill	Ø 15.8	\N	\N	7	7	B14	\N	\N	9100	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
938	Hole Mill	Ø 16.8	\N	\N	5	5	B14	\N	\N	5001	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
939	Hole Mill	Ø 17.8	\N	\N	3	3	B14	\N	\N	1010	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
940	Hole Mill	Ø 18.75	\N	\N	5	5	B14	\N	\N	7360	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
941	Hole Mill	Ø 19.8	\N	\N	5	5	B14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
942	Hole Mill	Ø 20.75	\N	\N	5	5	B14	\N	\N	8416	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
943	Hole Mill	Ø 21.8	\N	\N	6	6	B14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
944	Hole Mill	Ø 22.75	\N	\N	2	2	B14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
945	Hole Mill	Ø 23.75	\N	\N	2	2	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
946	Hole Mill	Ø 24.75	\N	\N	1	1	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
947	Hole Mill	Ø 25.75	\N	\N	1	1	B15	\N	\N	4594	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
948	Hole Mill	Ø 26.75	\N	\N	2	2	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
949	Hole Mill	Ø 27.75	\N	\N	3	3	B15	\N	\N	5010	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
950	Hole Mill	Ø 28.75	\N	\N	2	2	B15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
951	Hole Mill	Ø 29.75	\N	\N	4	4	B15	\N	\N	14848	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
952	Shell Type Hole Mill	Ø 20.75	\N	\N	1	1	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
953	Shell Type Hole Mill	Ø 23.75	\N	\N	1	1	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
954	Shell Type Hole Mill	Ø 24.75	\N	\N	3	3	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
955	Shell Type Hole Mill	Ø 25.75	\N	\N	1	1	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
956	Shell Type Hole Mill	Ø 26.75	\N	\N	3	3	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
957	Shell Type Hole Mill	Ø 27.75	\N	\N	4	4	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
958	Shell Type Hole Mill	Ø 28.75	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
959	Shell Type Hole Mill	Ø 29.75	\N	\N	3	3	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
960	Shell Type Hole Mill	Ø 30.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
961	Shell Type Hole Mill	Ø 31.75	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
962	Shell Type Hole Mill	Ø 32.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
963	Shell Type Hole Mill	Ø 33.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
964	Shell Type Hole Mill	Ø 34.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
965	Shell Type Hole Mill	Ø 35.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
966	Shell Type Hole Mill	Ø 37.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
967	Shell Type Hole Mill	Ø 39.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
968	Shell Type Hole Mill	Ø 41.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
969	Shell Type Hole Mill	Ø 43.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
970	Shell Type Hole Mill	Ø 44.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
971	Shell Type Hole Mill	Ø 45.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
972	Shell Type Hole Mill	Ø 47.7	\N	\N	2	2	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
973	Shell Type Hole Mill	Ø 49.7	\N	\N	1	1	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
974	Shell Type Hole Mill	Ø 50 × 36 × Ø 22	\N	\N	1	1	B13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
975	Hook Wrench	20 - 22	\N	\N	4	4	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
976	Hook Wrench	30 - 35	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
977	Hook Wrench	34 - 36	\N	\N	0	0	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
978	Hook Wrench	38 - 45	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
979	Hook Wrench	45 - 50	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
980	Hook Wrench	50 - 55	\N	\N	5	5	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
981	Hook Wrench	58 - 62	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
982	Hook Wrench	65	\N	\N	2	2	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
983	Hook Wrench	70	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
984	Hook Wrench	75 - 80	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
985	Hook Wrench	75 - 82	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
986	Hook Wrench	78	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
987	Hook Wrench	80 - 90	\N	\N	1	1	D26	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
988	Hook Wrench	80 - 98	\N	\N	1	1	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
989	Hook Wrench	120 - 130	\N	\N	1	1	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
990	Hook Wrench	135 - 140	\N	\N	2	2	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
991	Hook Wrench	150 - 160	\N	\N	1	1	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
992	Hook Wrench	170 - 180	\N	\N	3	3	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
993	Hook Wrench	190 - 200	\N	\N	0	0	D27	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
994	Hook Wrench	Ø44 / Ø7.5	\N	\N	12	12	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
995	Hook Wrench	Ø62 / Ø11	\N	\N	6	6	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
996	C - Spanner	ER32	\N	Turnmax	1	1	Sagar K	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
997	Inserted Tip Bullnose Endmill	Ø 12	DT 40 12 10 - 46B	DEPO	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
998	Inserted Tip EndMill ( Single Tip )	Ø 10	\N	Derek	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
999	Inserted Tip EndMill ( Single Tip )	Ø 10	300R - C10 - 10 - 100 - 1T	Derek	2	2	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1000	Inserted Tip EndMill ( Single Tip )	Ø 10	300R - C10 - 10 - 100	Derek	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1001	Inserted Tip EndMill ( Single Tip )	Ø 10	\N	Derek	1	1	\N	\N	Long Series	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1002	Inserted Tip EndMill ( Single Tip )	Ø 12	R216.2 - 712	Sandvik	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1003	Inserted Tip EndMill ( Single Tip )	Ø 12	300R - C12 - 12 - 130	Derek	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1004	Inserted Tip EndMill ( Single Tip )	Ø 12	300R - C12 - 12 - 130 - 1T	Derek	4	4	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1005	Inserted Tip EndMill ( Single Tip )	Ø 16	R216.2 - 716	Sandvik	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1006	Inserted Tip EndMill ( Two Tip )	Ø 16	300R - C16 - 16 - 160 - 2T	Derek	2	2	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1007	Inserted Tip EndMill ( Two Tip )	Ø 16	300R - C16 - 16 - 120 - 2T	Derek	5	5	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1008	Inserted Tip EndMill ( Two Tip )	Ø 16	\N	Derek	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1009	Inserted Tip EndMill ( Two Tip )	Ø 16	\N	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1010	Inserted Tip EndMill ( Two Tip )	Ø 16	\N	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1011	Inserted Tip EndMill ( Two Tip )	Ø 16	R162SA16SA	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1012	Inserted Tip EndMill ( Two Tip )	Ø 16	APX300R162SA16SA	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1013	Inserted Tip EndMill ( Two Tip )	Ø 20	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1014	Inserted Tip EndMill ( Two Tip )	Ø 20	APX3000R202SA20LA	Mitsubishi	1	1	\N	\N	\N	25450	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1015	Inserted Tip EndMill ( Two Tip )	Ø 20	APX300R2025A200LA	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1016	Inserted Tip EndMill ( Two Tip )	Ø 20	APX3000R2025A20LA	MMCI	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1017	Inserted Tip EndMill ( Two Tip )	Ø 20	APX300R20	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1018	Inserted Tip EndMill ( Two Tip )	Ø 25	400R - C25 - 25 - 160 - 2T	Derek	2	2	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1019	Inserted Tip EndMill ( Two Tip )	Ø 25	APX3000R252SA25 - LA	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1020	Inserted Tip EndMill ( Two Tip )	Ø 25	MCJX09R252SA25L ( CCM11048 )	MMCI	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1021	Inserted Tip EndMill ( Two Tip )	Ø 25	MCJX09R252SA25L	MMCI	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1022	Inserted Tip EndMill ( Two Tip )	Ø 25	MCJX09R252SA25EL	MMCI	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1023	Inserted Tip EndMill ( Two Tip )	Ø 32	AJX12R322SA32EL	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1024	Inserted Tip EndMill ( Three Tip )	Ø 25	APX3000R253SA25LA	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1025	Inserted Tip EndMill ( Three Tip )	Ø 25	\N	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1026	Inserted Tip EndMill ( Three Tip )	Ø 25	APX3000R253SA25ELA	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1027	Inserted Tip EndMill ( Three Tip )	Ø 25	APX3000R253SA25ELA	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1028	Inserted Tip EndMill ( Three Tip )	Ø 25	APX3000R253SA25ELA	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1029	Inserted Tip EndMill ( Three Tip )	Ø 32	EM101	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1030	Inserted Tip EndMill ( Three Tip )	Ø 32	EM102	Mitsubishi	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1031	Inserted Tip EndMill ( Three Tip )	Ø 32	\N	\N	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1032	Inserted Tip EndMill ( Three Tip )	Ø 32	\N	\N	1	1	E9	\N	Long Series	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1033	Inserted Tip EndMill ( Three Tip )	Ø 32	400R - C32 - 32 - 300 - 3T	Derek	1	1	E9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1034	Inserted Tip EndMill ( Three Tip )	Ø 32	APX3000R323SA32ELA ( CJ1939 )	Mitsubishi	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1035	Inserted Tip Ballnose Endmill	Ø 6	ABPF061S10 (AB050)	Moldino	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1036	Inserted Tip Ballnose Endmill	Ø 8	EBFMO8T12S100 (28478)	Tungaloy	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1037	Inserted Tip Ballnose Endmill	Ø 8	EBFMO8T12S100 (69537)	Tungaloy	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1038	Inserted Tip Ballnose Endmill	Ø 8	EBFMO8T12S100 (49402)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1039	Inserted Tip Ballnose Endmill	Ø 8	EBFMO8T12S100 (55004)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1040	Inserted Tip Ballnose Endmill	Ø 10	EBFM10T12S100 (46719)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1041	Inserted Tip Ballnose Endmill	Ø 10	EBFM10T12S100 (34260)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1042	Inserted Tip Ballnose Endmill	Ø 10	SRFH10S12M	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1043	Inserted Tip Ballnose Endmill	Ø 10	SRFH10S12M	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1044	Inserted Tip Ballnose Endmill	Ø 12	EBFM12S12S110	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1045	Inserted Tip Ballnose Endmill	Ø 12	SRFH12S16M (GC3917)	Mitsubishi	1	1	E10	\N	\N	12424	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1046	Inserted Tip Ballnose Endmill	Ø 12	SRFH12S16M (FI1979)	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1047	Inserted Tip Ballnose Endmill	Ø 16	EBFM16T20S130 (99765)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1048	Inserted Tip Ballnose Endmill	Ø 16	SRFH16S20M (GJ3197)	Mitsubishi	1	1	E10	\N	\N	13634	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1049	Inserted Tip Ballnose Endmill	Ø 16	SRFH16S20M	Mitsubishi	1	1	\N	\N	\N	13634	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1050	Inserted Tip Ballnose Endmill	Ø 25	SRM2250SNF (HK0615)	Mitsubishi	1	1	\N	\N	\N	4875	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1051	Inserted Tip Ballnose Endmill	Ø 25	SRM2250SNF (IB0855)	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1052	Inserted Tip Ballnose Endmill	Ø 25	SRM2250SNF (CE0143)	Mitsubishi	3	3	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1053	Inserted Tip Ballnose Endmill	Ø 25	SRFH25S25E150 (CA2929)	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1054	Inserted Tip Ballnose Endmill	Ø 25	SRFH25S25E150 (JG2033)	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1055	Inserted Tip Ballnose Endmill	Ø 30	EBFM30T32S220 (01636)	Tungaloy	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1056	Inserted Tip Ballnose Endmill	Ø 30	SRM2300SNM (IK0525)	Mitsubishi	1	1	E10	\N	\N	20399	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1057	Inserted Tip Ballnose Endmill	Ø 30	SRM2300SNM (BH0359)	Mitsubishi	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1058	Inserted Tip Ballnose Endmill	Ø 30	SRM2300SNM (BH0357)	Mitsubishi	1	1	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1059	Inserted Tip Ballnose Endmill	Ø 30	SRFH30S32E (BF1102)	Mitsubishi	2	2	E10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1060	I D Grooving Tool	\N	FSL 5108 R	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1061	I D Grooving Tool	Ø 6	TGIL - 16C - 3	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1062	I D Grooving Tool	Ø 12	FSL 5112R (BI2734)	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1063	I D Grooving Tool	Ø 12	FSL 5112R (BI2732)	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1064	I D Grooving Tool	Ø 16	16 - 14 - 3	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1065	I D Grooving Tool	Ø 16	FSL 5116R (CG3121)	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1066	I D Grooving Tool	Ø 16	FSL 5116R (CG3118)	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1067	I D Grooving Tool	Ø 20	20 - 3	GHIR	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1068	I D Grooving Tool	Ø 32	HELIIL - 32C - 510	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1069	I D Grooving Tool	Ø 32	HELIIL - 32C - 610	SIDE	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1070	I D Grooving Tool	Ø 32	5423880	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1071	I D Grooving Tool	Ø 40	69 337 122 20	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1072	I D Grooving Tool	Ø 25	69 337 020 10	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1073	I D Grooving Tool	Ø 40	S40T TTIR M3 T12	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1074	I D Grooving Tool	Ø 32	S32 TTIR M4 T12	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1075	I D Grooving Tool	Ø 32	S32S TTIR M3 T10	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1076	I D Grooving Tool	Ø 20	S20R TTIR M3 T8	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1077	Internal Threading Tool	\N	AVR 32 - 3C (00070)	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1184	Machine Reamer ( Straight Shank )	8 H6	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1078	Internal Threading Tool	\N	S32 SIR M22	STS Tools	2	2	TC - 04	\N	\N	6400	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1079	Internal Threading Tool	\N	AVR 32 3C	Vardex	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1080	Internal Threading Tool	\N	AVR 40 3C	Vardex	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1190	Machine Reamer ( Straight Shank )	6 H7	\N	\N	3	3	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1081	Internal Threading Tool	\N	SIR - 0025 - M22	STS Tools	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1082	Internal Threading Tool	\N	NVR 13 - 2 RH	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1083	Internal Threading Tool	\N	NVR 13 - 3	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1084	Internal Threading Tool	\N	AVR 25D - 4	Vardex	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1085	Internal Threading Tool	\N	MMTIR29 25 AS16 - C	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1086	Internal Threading Tool	\N	MMTIR37 32 AS16 - C	Mitsubishi	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1087	Internal Threading Tool	\N	NVR13LH	Vardex	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1088	Internal Threading Tool	\N	AVR 50 5C	Vardex	1	1	TC - 04	\N	\N	12800	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1089	Internal Threading Tool	\N	AVR 32 5C	Vardex	3	3	TC - 04	\N	\N	16800	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1090	Internal Threading Tool	\N	AVR 40 5C	Vardex	2	2	TC - 04	\N	\N	22400	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1091	Internal Threading Tool	\N	SIR - 0025 - R16	Iscar	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1092	Internal Threading Tool	\N	6948732410 DC	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1093	Internal Threading Tool	\N	SIR - 0013 - LH	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1094	Internal Threading Tool	\N	0007 K08	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1095	Internal Threading Tool	\N	SIR 0010 H11	Iscar	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1096	Internal Threading Tool	\N	SIR 0016 P16	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1097	Internal Threading Tool	\N	0032 S16	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1098	Internal Threading Tool	\N	SIR 0025 R16	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1099	Internal Threading Tool	\N	SIR 0020 P16	Iscar	1	1	TC - 05	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1100	Internal Threading Tool	\N	SIR 0016 P16	Iscar	1	1	Manjunath B N (RPD)	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1101	Knurling Tool	\N	\N	\N	11	11	F9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1102	L Square	45	\N	\N	3	3	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1103	L Square	50	\N	\N	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1104	L Square	80	\N	\N	11	11	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1105	L Square	110	\N	\N	2	2	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1106	L Square	125	\N	\N	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1107	L Square	135	\N	\N	5	5	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1108	L Square	150	\N	\N	1	1	Ramesh (PAT)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1109	L Square	220	\N	\N	8	8	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1110	L Square	310	\N	\N	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1111	L Square	360	\N	\N	2	2	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1112	L Square	400	\N	\N	1	1	Md Fazal	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1113	L Square (Wedge Type)	\N	\N	\N	1	1	TC - 05	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1114	Lathe Carrier ( Straight )	3 - 10 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1115	Lathe Carrier ( Straight )	7 - 15 mm	\N	\N	1	1	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1116	Lathe Carrier ( Straight )	10 - 15 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1117	Lathe Carrier ( Straight )	15 mm	\N	\N	6	6	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1118	Lathe Carrier ( Straight )	20 mm / 3/4 "	\N	\N	6	6	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1119	Lathe Carrier ( Straight )	20 - 35 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1120	Lathe Carrier ( Straight )	25 mm	\N	\N	7	7	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1121	Lathe Carrier ( Straight )	32 mm	\N	\N	4	4	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1122	Lathe Carrier ( Straight )	32 - 50 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1123	Lathe Carrier ( Straight )	40 mm	\N	\N	4	4	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1124	Lathe Carrier ( Straight )	45 - 70 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1125	Lathe Carrier ( Straight )	50 mm / 2"	\N	\N	7	7	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1126	Lathe Carrier ( Straight )	65 - 100 mm	\N	\N	3	3	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1127	Lathe Carrier ( Straight )	1/4 "	\N	\N	5	5	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1128	Lathe Carrier ( Straight )	1/2 "	\N	\N	7	7	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1129	Lathe Carrier ( Bend )	3 - 10 mm	\N	\N	1	1	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1130	Lathe Carrier ( Bend )	7 - 15 mm	\N	\N	1	1	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1131	Lathe Carrier ( Bend )	13 mm / 1/2''	\N	\N	6	6	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1132	Lathe Carrier ( Bend )	15 - 25 mm	\N	\N	1	1	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1133	Lathe Carrier ( Bend )	20 mm / 3/4"	\N	\N	5	5	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1134	Lathe Carrier ( Bend )	25 mm	\N	\N	6	6	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1135	Lathe Carrier ( Bend )	30 mm	\N	\N	3	3	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1136	Lathe Carrier ( Bend )	32 mm	\N	\N	3	3	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1137	Lathe Carrier ( Bend )	32 -50 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1138	Lathe Carrier ( Bend )	37 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1139	Lathe Carrier ( Bend )	40 mm	\N	\N	7	7	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1140	Lathe Carrier ( Bend )	45 -70 mm	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1141	Lathe Carrier ( Bend )	50 mm / 2''	\N	\N	5	5	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1142	Lathe Carrier ( Bend )	65 - 100 mm	\N	\N	3	3	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1143	Lathe Carrier ( Bend )	5/8''	\N	\N	2	2	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1144	Lathe Carrier ( Bend )	1/4''	\N	\N	6	6	H10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1145	Letter Punch	\N	\N	\N	10	10	E9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
1147	Lever Type Dial (0.01 mm)	\N	513 - 424	\N	1	1	TC - 07	\N	\N	280105	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1148	Lever Type Dial (0.01 mm)	\N	UNN977	\N	1	1	TC - 07	\N	\N	9530	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1149	Lever Type Dial (0.01 mm)	\N	\N	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1150	Lever Type Dial (0.01 mm)	\N	513 - 117	\N	1	1	TC - 07	\N	\N	12045	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1151	Lever Type Dial (0.01 mm)	\N	UUG648	Mitutoyo	0	0	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1152	Lever Type Dial (0.01 mm)	\N	1811000	\N	0	0	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1153	Lever Type Dial (0.01 mm)	\N	ARW244	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1154	Lever Type Dial (0.002 mm)	\N	513 - 465	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1155	Lever Type Dial (0.002 mm)	\N	513 - 405	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1156	Lever Type Dial (0.002 mm)	\N	513 - 465	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1157	Lever Type Dial (0.002 mm)	\N	513 - 425	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1158	Lever Type Dial (0.002 mm)	\N	0009	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1159	Lever Type Dial (0.002 mm)	\N	1810009	\N	0	0	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1160	Lever Type Dial (0.002 mm)	\N	3K16826	Tesa	1	1	Sharath	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1161	Lever Type Dial (0.002 mm) (New Stock)	\N	CNFR85	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1162	Lever Type Dial (0.002 mm) (New Stock)	\N	CQFG47	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1163	Lever Type Dial (0.002 mm) (New Stock)	\N	CWWE59	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1164	Lever Type Dial (0.002 mm) (New Stock)	\N	CWWE51	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1165	Lever Type Dial (0.002 mm) (New Stock)	\N	CWWE58	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1166	Lever Type Dial (0.002 mm) (New Stock)	\N	CNFR81	Mitutoyo	1	1	TC - 09	\N	\N	4237.29	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1167	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH28	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1168	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCL53	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1169	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCG76	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1170	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH91	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1171	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH86	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1172	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH29	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1173	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH66	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1174	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH63	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1175	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH20	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1176	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCL66	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1177	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCH65	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1178	Lever Type Dial (0.01 mm) (New Stock)	\N	CVCL39	Mitutoyo	1	1	TC - 09	\N	\N	3610.17	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1179	Machine Reamer ( Straight Shank )	3 H6	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1180	Machine Reamer ( Straight Shank )	4 H6	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1181	Machine Reamer ( Straight Shank )	5 H6	\N	\N	1	1	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1182	Machine Reamer ( Straight Shank )	6 H6	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1183	Machine Reamer ( Straight Shank )	7 H6	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1185	Machine Reamer ( Straight Shank )	9 H6	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1186	Machine Reamer ( Straight Shank )	10 H6	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1187	Machine Reamer ( Straight Shank )	3 H7	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1188	Machine Reamer ( Straight Shank )	4 H7	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1189	Machine Reamer ( Straight Shank )	5 H7	\N	\N	1	1	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1191	Machine Reamer ( Straight Shank )	7 H7	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1192	Machine Reamer ( Straight Shank )	8 H7	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1193	Machine Reamer ( Straight Shank )	9 H7	\N	\N	6	6	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1194	Machine Reamer ( Straight Shank )	10 H7	\N	\N	4	4	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1195	Machine Reamer ( Straight Shank )	3 H8	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1196	Machine Reamer ( Straight Shank )	4 H8	\N	\N	0	0	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1197	Machine Reamer ( Straight Shank )	5 H8	\N	\N	1	1	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1198	Machine Reamer ( Straight Shank )	6 H8	\N	\N	6	6	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1199	Machine Reamer ( Straight Shank )	7 H8	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1200	Machine Reamer ( Straight Shank )	8 H8	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1201	Machine Reamer ( Straight Shank )	9 H8	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1202	Machine Reamer ( Straight Shank )	10 H8	\N	\N	5	5	A2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1203	Machine Reamer ( Taper Shank )	6.35 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1204	Machine Reamer ( Taper Shank )	6 H6	\N	\N	2	2	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1205	Machine Reamer ( Taper Shank )	5 H6	\N	\N	1	1	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1206	Machine Reamer ( Taper Shank )	3 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1207	Machine Reamer ( Taper Shank )	4 H6	\N	\N	0	0	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1208	Machine Reamer ( Taper Shank )	8 H6	\N	\N	9	9	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1209	Machine Reamer ( Taper Shank )	7 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1210	Machine Reamer ( Taper Shank )	10 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1211	Machine Reamer ( Taper Shank )	9 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1212	Machine Reamer ( Taper Shank )	11 H6	\N	\N	7	7	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1213	Machine Reamer ( Taper Shank )	12 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1214	Machine Reamer ( Taper Shank )	13 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1215	Machine Reamer ( Taper Shank )	14 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1216	Machine Reamer ( Taper Shank )	15 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1217	Machine Reamer ( Taper Shank )	16 H6	\N	\N	6	6	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1218	Machine Reamer ( Taper Shank )	17 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1219	Machine Reamer ( Taper Shank )	18 H6	\N	\N	6	6	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1220	Machine Reamer ( Taper Shank )	19 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1221	Machine Reamer ( Taper Shank )	20 H6	\N	\N	4	4	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1222	Machine Reamer ( Taper Shank )	21 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1223	Machine Reamer ( Taper Shank )	22 H6	\N	\N	5	5	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1224	Machine Reamer ( Taper Shank )	23 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1225	Machine Reamer ( Taper Shank )	24 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1226	Machine Reamer ( Taper Shank )	25 H6	\N	\N	2	2	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1227	Machine Reamer ( Taper Shank )	26 H6	\N	\N	1	1	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1228	Machine Reamer ( Taper Shank )	27 H6	\N	\N	4	4	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1229	Machine Reamer ( Taper Shank )	28 H6	\N	\N	2	2	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1230	Machine Reamer ( Taper Shank )	29 H6	\N	\N	3	3	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1231	Machine Reamer ( Taper Shank )	30 H6	\N	\N	4	4	B4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1232	Machine Reamer ( Taper Shank )	31 H6	\N	\N	3	3	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1233	Machine Reamer ( Taper Shank )	32 H6	\N	\N	3	3	B5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1234	Machine Reamer ( Taper Shank )	3 H7	\N	\N	11	11	B3	\N	\N	1470	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1235	Machine Reamer ( Taper Shank )	4 H7	\N	\N	17	17	B3	\N	\N	1470	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1236	Machine Reamer ( Taper Shank )	5 H7	\N	\N	7	7	B3	\N	\N	1470	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1237	Machine Reamer ( Taper Shank )	6 H7	\N	\N	18	18	B3	\N	\N	2850	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1238	Machine Reamer ( Taper Shank )	7 H7	\N	\N	4	4	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1239	Machine Reamer ( Taper Shank )	8 H7	\N	\N	18	18	B3	\N	\N	3240	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1240	Machine Reamer ( Taper Shank )	9 H7	\N	\N	6	6	B3	\N	\N	2025	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1241	Machine Reamer ( Taper Shank )	9 H7 × Ø10	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1242	Machine Reamer ( Taper Shank )	10 H7	\N	\N	18	18	B3	\N	\N	4080	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1243	Machine Reamer ( Taper Shank )	10 H7 × Ø12	\N	\N	6	6	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1244	Machine Reamer ( Taper Shank )	11 H7	\N	\N	7	7	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1245	Machine Reamer ( Taper Shank )	12 H7	\N	\N	14	14	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1246	Machine Reamer ( Taper Shank )	13 H7	\N	\N	4	4	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1247	Machine Reamer ( Taper Shank )	14 H7	\N	\N	7	7	B3	\N	\N	2404	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1248	Machine Reamer ( Taper Shank )	15 H7	\N	\N	5	5	B3	\N	\N	3630	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1249	Machine Reamer ( Taper Shank )	16 H7	\N	\N	9	9	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1250	Machine Reamer ( Taper Shank )	17 H7	\N	\N	6	6	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1251	Machine Reamer ( Taper Shank )	18 H7	\N	\N	7	7	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1252	Machine Reamer ( Taper Shank )	19 H7	\N	\N	6	6	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1253	Machine Reamer ( Taper Shank )	20 H7	\N	\N	10	10	B3	\N	\N	8840	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1254	Machine Reamer ( Taper Shank )	21 H7	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1255	Machine Reamer ( Taper Shank )	22 H7	\N	\N	8	8	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1256	Machine Reamer ( Taper Shank )	23 H7	\N	\N	5	5	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1257	Machine Reamer ( Taper Shank )	24 H7	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1258	Machine Reamer ( Taper Shank )	25 H7	\N	\N	9	9	B3	\N	\N	7782	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1259	Machine Reamer ( Taper Shank )	26 H7	\N	\N	2	2	B3	\N	\N	9615	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1260	Machine Reamer ( Taper Shank )	27 H7	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1261	Machine Reamer ( Taper Shank )	28 H7	\N	\N	3	3	B3	\N	\N	3666	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1262	Machine Reamer ( Taper Shank )	29 H7	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1263	Machine Reamer ( Taper Shank )	30 H7	\N	\N	2	2	B3	\N	\N	4196	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1264	Machine Reamer ( Taper Shank )	31 H7	\N	\N	3	3	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1265	Machine Reamer ( Taper Shank )	32 H7	\N	\N	5	5	B3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1266	Machine Reamer ( Taper Shank )	3 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1267	Machine Reamer ( Taper Shank )	4 H8	\N	\N	0	0	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1268	Machine Reamer ( Taper Shank )	5 H8	\N	\N	0	0	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1269	Machine Reamer ( Taper Shank )	5.5 H8	\N	\N	4	4	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1270	Machine Reamer ( Taper Shank )	6 H8	\N	\N	4	4	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1271	Machine Reamer ( Taper Shank )	7 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1272	Machine Reamer ( Taper Shank )	8 H8	\N	\N	2	2	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1273	Machine Reamer ( Taper Shank )	9 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1274	Machine Reamer ( Taper Shank )	10 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1275	Machine Reamer ( Taper Shank )	11 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1276	Machine Reamer ( Taper Shank )	12 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1277	Machine Reamer ( Taper Shank )	13 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1278	Machine Reamer ( Taper Shank )	14 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1279	Machine Reamer ( Taper Shank )	15 H8	\N	\N	7	7	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1280	Machine Reamer ( Taper Shank )	16 H8	\N	\N	2	2	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1281	Machine Reamer ( Taper Shank )	17 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1282	Machine Reamer ( Taper Shank )	18 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1283	Machine Reamer ( Taper Shank )	19 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1284	Machine Reamer ( Taper Shank )	20 H8	\N	\N	0	0	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1285	Machine Reamer ( Taper Shank )	21 H8	\N	\N	5	5	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1286	Machine Reamer ( Taper Shank )	22 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1287	Machine Reamer ( Taper Shank )	23 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1288	Machine Reamer ( Taper Shank )	24 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1289	Machine Reamer ( Taper Shank )	25 H8	\N	\N	4	4	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1290	Machine Reamer ( Taper Shank )	26 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1291	Machine Reamer ( Taper Shank )	27 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1292	Machine Reamer ( Taper Shank )	28 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1293	Machine Reamer ( Taper Shank )	29 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1294	Machine Reamer ( Taper Shank )	30 H8	\N	\N	2	2	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1295	Machine Reamer ( Taper Shank )	31 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1296	Machine Reamer ( Taper Shank )	32 H8	\N	\N	3	3	B2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1297	Machine Reamer ( Taper Shank )	6 J6	\N	\N	0	0	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1298	Machine Reamer ( Taper Shank )	7 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1299	Machine Reamer ( Taper Shank )	9 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1300	Machine Reamer ( Taper Shank )	10 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1301	Machine Reamer ( Taper Shank )	11 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1302	Machine Reamer ( Taper Shank )	12 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1303	Machine Reamer ( Taper Shank )	13 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1304	Machine Reamer ( Taper Shank )	15 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1305	Machine Reamer ( Taper Shank )	16 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1306	Machine Reamer ( Taper Shank )	17 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1307	Machine Reamer ( Taper Shank )	18 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1308	Machine Reamer ( Taper Shank )	19 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1309	Machine Reamer ( Taper Shank )	20 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1310	Machine Reamer ( Taper Shank )	21 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1311	Machine Reamer ( Taper Shank )	23 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1312	Machine Reamer ( Taper Shank )	24 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1313	Machine Reamer ( Taper Shank )	25 J6	\N	\N	2	2	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1314	Machine Reamer ( Taper Shank )	26 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1315	Machine Reamer ( Taper Shank )	27 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1316	Machine Reamer ( Taper Shank )	29 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1317	Machine Reamer ( Taper Shank )	31 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1318	Machine Reamer ( Taper Shank )	30 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1319	Machine Reamer ( Taper Shank )	32 J6	\N	\N	1	1	B1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1320	Machine Reamer ( Taper Shank )	8 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1321	Machine Reamer ( Taper Shank )	9 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1322	Machine Reamer ( Taper Shank )	10 K6	\N	\N	2	2	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1323	Machine Reamer ( Taper Shank )	11 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1324	Machine Reamer ( Taper Shank )	12 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1325	Machine Reamer ( Taper Shank )	13 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1326	Machine Reamer ( Taper Shank )	14 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1327	Machine Reamer ( Taper Shank )	15 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1328	Machine Reamer ( Taper Shank )	16 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1329	Machine Reamer ( Taper Shank )	17 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1330	Machine Reamer ( Taper Shank )	18 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1331	Machine Reamer ( Taper Shank )	20 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1332	Machine Reamer ( Taper Shank )	21 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1333	Machine Reamer ( Taper Shank )	23 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1334	Machine Reamer ( Taper Shank )	25 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1335	Machine Reamer ( Taper Shank )	26 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1336	Machine Reamer ( Taper Shank )	27 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1337	Machine Reamer ( Taper Shank )	28 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1338	Machine Reamer ( Taper Shank )	29 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1339	Machine Reamer ( Taper Shank )	30 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1340	Machine Reamer ( Taper Shank )	31 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1341	Machine Reamer ( Taper Shank )	32 K6	\N	\N	1	1	B9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1342	Machine Reamer ( Shell Type )	18 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1343	Machine Reamer ( Shell Type )	19 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1344	Machine Reamer ( Shell Type )	20 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1345	Machine Reamer ( Shell Type )	21 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1346	Machine Reamer ( Shell Type )	23 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1347	Machine Reamer ( Shell Type )	24 H7	\N	\N	2	2	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1348	Machine Reamer ( Shell Type )	25 H7	\N	\N	2	2	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1349	Machine Reamer ( Shell Type )	26 H7	\N	\N	5	5	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1350	Machine Reamer ( Shell Type )	27 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1351	Machine Reamer ( Shell Type )	28 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1352	Machine Reamer ( Shell Type )	29 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1353	Machine Reamer ( Shell Type )	30 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1354	Machine Reamer ( Shell Type )	31 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1355	Machine Reamer ( Shell Type )	32 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1356	Machine Reamer ( Shell Type )	33 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1357	Machine Reamer ( Shell Type )	34 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1358	Machine Reamer ( Shell Type )	35 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1359	Machine Reamer ( Shell Type )	36 H7	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1360	Machine Reamer ( Shell Type )	18 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1361	Machine Reamer ( Shell Type )	19 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1362	Machine Reamer ( Shell Type )	20 H8	\N	\N	2	2	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1363	Machine Reamer ( Shell Type )	21 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1364	Machine Reamer ( Shell Type )	22 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1365	Machine Reamer ( Shell Type )	23 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1366	Machine Reamer ( Shell Type )	24 H8	\N	\N	4	4	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1367	Machine Reamer ( Shell Type )	25 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1368	Machine Reamer ( Shell Type )	27 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1369	Machine Reamer ( Shell Type )	28 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1370	Machine Reamer ( Shell Type )	29 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1371	Machine Reamer ( Shell Type )	30 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1372	Machine Reamer ( Shell Type )	31 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1373	Machine Reamer ( Shell Type )	32 H8	\N	\N	2	2	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1374	Machine Reamer ( Shell Type )	33 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1375	Machine Reamer ( Shell Type )	34 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1376	Machine Reamer ( Shell Type )	35 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1377	Machine Reamer ( Shell Type )	36 H8	\N	\N	3	3	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1378	Machine Reamer ( Shell Type )	Ø 63.0	\N	\N	2	2	B7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Reamers
1379	Master Cylinder	Ø 40 × 80	AM410601	---	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1380	Master Cylinder	Ø 65 × 240	AM430670	---	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1381	Measuring Tape	3m	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Instruments	Height Gauges
1382	Measuring Tape	5m	\N	Stanley	1	1	Tool Crib	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Instruments	Height Gauges
1383	Millimess (0.001 mm)	\N	669295	Mahr	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1384	Millimess (0.001 mm)	\N	\N	Mahr	1	1	\N	\N	Included With Marameter (0 - 25 )	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1385	Millimess (0.001 mm)	\N	\N	Mahr	1	1	\N	\N	Included With Marameter (25 - 60 )	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1386	Millimess (0.001 mm)(New Stock)	\N	42011555	Mahr	1	1	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1387	Millimess (0.001 mm)(New Stock)	\N	42011812	Mahr	1	1	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1388	Millimess (0.001 mm)(New Stock)	\N	42011817	Mahr	1	1	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1389	Nose Plier	\N	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
1390	Number Punch	\N	\N	\N	5	5	E9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Hammers & Punches
1391	Flange Nut	M12	\N	\N	7	7	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1392	Extension Nut	M12	\N	\N	5	5	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1393	T - Nut	M10 (Tenon - 28)	\N	\N	7	7	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1394	T - Nut	M12 (Tenon - 16)	\N	\N	14	14	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1395	T - Nut	M12 (Tenon - 28)	\N	\N	10	10	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1396	T - Nut	M16 (Tenon - 20)	\N	\N	16	16	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1397	T - Nut	M24 (Tenon - 28)	\N	\N	20	20	Wood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1398	Open End Spanner ( Double End )	5.5 - 7	\N	\N	2	2	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1399	Open End Spanner ( Double End )	6 - 7	\N	\N	9	9	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1400	Open End Spanner ( Double End )	8 - 7	\N	\N	1	1	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1401	Open End Spanner ( Double End )	8 - 9	\N	\N	3	3	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1402	Open End Spanner ( Double End )	9 - 11	\N	\N	1	1	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1403	Open End Spanner ( Double End )	10 - 11	\N	\N	3	3	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1404	Open End Spanner ( Double End )	10 - 13	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1405	Open End Spanner ( Double End )	11 - 12	\N	\N	1	1	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1406	Open End Spanner ( Double End )	11 - 14	\N	\N	1	1	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1407	Open End Spanner ( Double End )	12 - 13	\N	\N	2	2	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1408	Open End Spanner ( Double End )	13 - 17	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1409	Open End Spanner ( Double End )	14 - 15	\N	\N	3	3	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1410	Open End Spanner ( Double End )	14 - 17	\N	\N	2	2	D6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1411	Open End Spanner ( Double End )	16 - 17	\N	\N	5	5	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1412	Open End Spanner ( Double End )	17 - 22	\N	\N	1	1	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1413	Open End Spanner ( Double End )	18 - 19	\N	\N	3	3	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1414	Open End Spanner ( Double End )	19 - 22	\N	\N	5	5	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1415	Open End Spanner ( Double End )	19 - 24	\N	\N	2	2	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1416	Open End Spanner ( Double End )	20 - 22	\N	\N	11	11	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1417	Open End Spanner ( Double End )	21 - 23	\N	\N	15	15	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1418	Open End Spanner ( Double End )	24 - 26	\N	\N	2	2	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1419	Open End Spanner ( Double End )	24 - 27	\N	\N	13	13	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1420	Open End Spanner ( Double End )	24 - 30	\N	\N	5	5	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1421	Open End Spanner ( Double End )	25 - 27	\N	\N	3	3	D5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1422	Open End Spanner ( Double End )	25 - 28	\N	\N	3	3	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1423	Open End Spanner ( Double End )	22 - 27	\N	\N	3	3	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1424	Open End Spanner ( Double End )	27 - 30	\N	\N	1	1	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1425	Open End Spanner ( Double End )	27 - 32	\N	\N	10	10	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1426	Open End Spanner ( Double End )	30 - 32	\N	\N	22	22	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1427	Open End Spanner ( Double End )	36 - 41	\N	\N	4	4	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1428	Open End Spanner ( Double End )	7/16W 1/2BS - 9/16W 5/8BS	\N	\N	1	1	D17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1429	Open End Spanner ( Double End )	13/16 - 25/32	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1430	Open End Spanner ( Double End )	1/4 - 5/16	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1431	Open End Spanner ( Double End )	1/4W - 5/16W	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1432	Open End Spanner ( Double End )	3/8 - 7/16	\N	\N	3	3	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1433	Open End Spanner ( Double End )	1/8W - 3/16W	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1434	Open End Spanner ( Double End )	3/8W 7/16BS - 5/16W 3/8BS	\N	\N	3	3	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1435	Open End Spanner ( Double End )	1/2 - 7/16	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1436	Open End Spanner ( Double End )	1/16W - 3/32W	\N	\N	1	1	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1437	Open End Spanner ( Double End )	1/8W 3/16BS - 3/16W 1/4BS	\N	\N	3	3	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1438	Open End Spanner ( Double End )	5/16 - 11/32	\N	\N	4	4	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1439	Open End Spanner ( Double End )	3/4 - 5/8	\N	\N	5	5	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1440	Open End Spanner ( Double End )	7/8 - 13/16	\N	\N	4	4	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1441	Open End Spanner ( Double End )	1/2W 9/16BS - 7/16W 1/2BS	\N	\N	6	6	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1442	Open End Spanner ( Double End )	7/8 - 15/16	\N	\N	2	2	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1443	Open End Spanner ( Double End )	5/16W 3/8BS - 7/16W 1/2BS	\N	\N	1	1	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1444	Open End Spanner ( Double End )	3/8W 7/16BS - 7/16W 1/2BS	\N	\N	5	5	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1445	Open End Spanner ( Double End )	11/16 - 19/32	\N	\N	5	5	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1446	Open End Spanner ( Double End )	1 1/4 - 1 1/16	\N	\N	1	1	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1447	Open End Spanner ( Double End )	9/16W 5/8BS - 11/16W 3/4BS	\N	\N	1	1	D113	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1448	Open End Spanner ( Double End )	1/2 - 9/16	\N	\N	3	3	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1449	Open End Spanner ( Double End )	3/4 - 9/16	\N	\N	1	1	D13	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1450	Open End Spanner ( Double End )	3/4W 7/8BS - 7/8W 1BS	\N	\N	1	1	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1451	Open End Spanner ( Double End )	1/2W 9/16BS - 9/16W 5/8BS	\N	\N	4	4	D12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1452	Open End Spanner ( Double End )	3/4W 7/8BS - 5/8W 11/16BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1453	Open End Spanner ( Double End )	1"W 1/8BS - 7/8W 1"BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1454	Open End Spanner ( Single End )	7	\N	\N	1	1	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1455	Open End Spanner ( Single End )	8	\N	\N	1	1	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1456	Open End Spanner ( Single End )	9	\N	\N	2	2	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1457	Open End Spanner ( Single End )	10	\N	\N	0	0	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1458	Open End Spanner ( Single End )	11	\N	\N	2	2	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1459	Open End Spanner ( Single End )	12	\N	\N	1	1	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1460	Open End Spanner ( Single End )	14	\N	\N	1	1	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1461	Open End Spanner ( Single End )	15	\N	\N	1	1	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1462	Open End Spanner ( Single End )	16	\N	\N	3	3	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1463	Open End Spanner ( Single End )	17	\N	\N	7	7	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1464	Open End Spanner ( Single End )	18	\N	\N	0	0	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1465	Open End Spanner ( Single End )	19	\N	\N	3	3	D2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1466	Open End Spanner ( Single End )	20	\N	\N	1	1	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1467	Open End Spanner ( Single End )	21	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1468	Open End Spanner ( Single End )	22	\N	\N	5	5	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1469	Open End Spanner ( Single End )	24	\N	\N	6	6	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1470	Open End Spanner ( Single End )	27	\N	\N	9	9	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1471	Open End Spanner ( Single End )	30	\N	\N	12	12	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1472	Open End Spanner ( Single End )	32	\N	\N	10	10	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1473	Open End Spanner ( Single End )	36	\N	\N	7	7	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1474	Open End Spanner ( Single End )	41	\N	\N	2	2	D3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1475	Open End Spanner ( Single End )	46	\N	\N	5	5	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1476	Open End Spanner ( Single End )	50	\N	\N	5	5	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1477	Open End Spanner ( Single End )	55	\N	\N	2	2	D4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1478	Open End Spanner ( Single End )	60	\N	\N	2	2	E18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1479	Open End Spanner ( Single End )	65	\N	\N	1	1	E18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1480	Open End Spanner ( Single End )	70	\N	\N	1	1	E18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1481	Open End Spanner ( Single End )	75	\N	\N	3	3	E18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1482	Open End Spanner ( Single End )	80	\N	\N	1	1	E18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1483	Open End Spanner ( Single End )	1 1/2 "	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1484	Parallel Block	150 × 10 × 39.5	\N	\N	0	0	D8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1485	Parallel Block	150 × 10 × 39.5	\N	\N	0	0	D8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1486	Parallel Block	150 × 10 × 40	\N	\N	0	0	D8	\N	\N	2160	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1487	Parallel Block	150 × 10 × 47	\N	\N	0	0	D8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1488	Parallel Block	150 × 10 × 47	\N	\N	0	0	D8	\N	\N	2280	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1489	Parallel Block	150 × 12 × 50	\N	\N	0	0	D8	\N	\N	2400	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1544	PKM Collets ER 40	Ø 6	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1490	Parallel Block	150 × 12 × 55	\N	\N	0	0	D9	\N	\N	3600	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1491	Parallel Block	150 × 12 × 58	\N	\N	0	0	D9	\N	\N	3600	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1492	Parallel Block	150 × 12.5 × 51	\N	\N	0	0	D8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1493	Parallel Block	200 × 20.86 × 50	\N	\N	0	0	D8	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1494	Parallel Block (HMT )	200 × 120 × 60	\N	\N	0	0	E16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
1495	Parting Tool	\N	HELIR - 2020 - 3T - 20	Iscar	1	1	TC - 04	\N	\N	268	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1496	Parting Tool	\N	HELIR - 2020 - 4T - 25	Iscar	1	1	TC - 04	\N	\N	268	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1497	Parting Tool	\N	RF151.23 - 25 - 25 - 30ML	Sandvik	1	1	TC - 04	\N	\N	39	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1498	Parting Tool	\N	TTER 2525 - 3T25	Taegutech	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1499	Pass-O-Meter	25-50	\N	\N	0	0	TC- 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1500	Pass-O-Meter	25-50	24027	Mitutoyo	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1501	Pass-O-Meter	50-75	22984	Mitutoyo	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1502	Pass-O-Meter	75-100	11152	Mitutoyo	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1503	Pass-O-Meter	100-125	\N	\N	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1504	Pass-O-Meter	125-150	\N	\N	0	0	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1505	Pipe Wrench	\N	\N	\N	1	1	G6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1506	Pitch Micrometer	0 - 25	CMTI WSM 0016	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1507	Pitch Micrometer	0 - 25	CMTI WSM 0017	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1508	Pitch Micrometer	0 - 25	SY262601	Tesa	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1509	Pitch Micrometer	25 - 50	5Z 0999 01	Tesa	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1510	Pitch Micrometer	25 - 50	L - 4 - 1864	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1511	Pitch Micrometer	50 - 75	CMTI WSM 0019	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1512	Pitch Micrometer	50 - 75	CMTI WSM 0027	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1513	Pitch Micrometer	75 - 100	M - 4 - 0861	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1514	Pitch Micrometer	100 - 125	6IX1955	Somet	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
1515	PKM Tool Holders	\N	HSK - A63 WN06 100	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1516	PKM Tool Holders	\N	HSK - A63 WN08 100	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1517	PKM Tool Holders	\N	HSK - A63 WN10 100	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1518	PKM Tool Holders	\N	HSK - A63 WN12 100	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1519	PKM Tool Holders	\N	HSK - A63 WN16 100	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1520	PKM Tool Holders	\N	HSK - A63 WN20 100	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1521	PKM Tool Holders	\N	HSK - A63 WN25 100	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1522	PKM Tool Holders	\N	HSK - A63 WN32 100	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1523	PKM Tool Holders	\N	HSK - A63 FMH16 160	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1524	PKM Tool Holders	\N	HSK - A63 FMH27 160	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1525	PKM Tool Holders	\N	HSK - A63 FMC22 160	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1526	PKM Tool Holders	\N	HSK - A63 FMH32 160	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1527	PKM Tool Holders	\N	NCDC 113X HSK - A63	\N	2	2	TC - 07	\N	Drill Chuck Type	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1528	PKM Tool Holders	\N	DIN 69893 HSK - A63	\N	2	2	TC - 07	\N	Drill Chuck Type	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1529	PKM Tool Holders	\N	HSK - A63 MTA01 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1530	PKM Tool Holders	\N	HSK - A63 MTA02 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1531	PKM Tool Holders	\N	HSK - A63 MTA03 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1532	PKM Tool Holders	\N	HSK - A63 MTA04 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1533	PKM Tool Holders	\N	HSK - A63 ER11 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1534	PKM Tool Holders	\N	HSK - A63 ER16 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1535	PKM Tool Holders	\N	HSK - A63 ER20 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1536	PKM Tool Holders	\N	HSK - A63 ER25 160	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1537	PKM Tool Holders	\N	HSK - A63 ER40 160	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
1538	PKM Spanners	\N	ER 40	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1539	PKM Spanners	\N	ER 25	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1540	PKM Spanners	\N	ER 20	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1541	PKM Spanners	\N	ER 11M	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1543	PKM Collets ER 40	Ø 5	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1545	PKM Collets ER 40	Ø 7	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1546	PKM Collets ER 40	Ø 8	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1547	PKM Collets ER 40	Ø 9	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1548	PKM Collets ER 40	Ø 10	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1549	PKM Collets ER 40	Ø 11	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1550	PKM Collets ER 40	Ø 12	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1551	PKM Collets ER 40	Ø 13	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1552	PKM Collets ER 40	Ø 14	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1553	PKM Collets ER 40	Ø 15	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1554	PKM Collets ER 40	Ø 16	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1555	PKM Collets ER 40	Ø 17	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1556	PKM Collets ER 40	Ø 18	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1557	PKM Collets ER 40	Ø 19	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1558	PKM Collets ER 40	Ø 20	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1559	PKM Collets ER 40	Ø 21	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1560	PKM Collets ER 40	Ø 22	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1561	PKM Collets ER 40	Ø 23	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1562	PKM Collets ER 40	Ø 24	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1563	PKM Collets ER 40	Ø 25	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1564	PKM Collets ER 40	Ø 26	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1565	PKM Collets ER 25	Ø 2	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1566	PKM Collets ER 25	Ø 3	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1567	PKM Collets ER 25	Ø 4	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1568	PKM Collets ER 25	Ø 5	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1569	PKM Collets ER 25	Ø 5 - 6	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1570	PKM Collets ER 25	Ø 6	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1571	PKM Collets ER 25	Ø 7	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1572	PKM Collets ER 25	Ø 8	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1573	PKM Collets ER 25	Ø 9	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1574	PKM Collets ER 25	Ø 10	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1575	PKM Collets ER 25	Ø 11	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1576	PKM Collets ER 25	Ø 12	\N	\N	0	0	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1577	PKM Collets ER 25	Ø 13	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1578	PKM Collets ER 25	Ø 14	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1579	PKM Collets ER 25	Ø 15	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1580	PKM Collets ER 20	Ø 2	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1581	PKM Collets ER 20	Ø 3	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1582	PKM Collets ER 20	Ø 3 - 4	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1583	PKM Collets ER 20	Ø 4	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1584	PKM Collets ER 20	Ø 4 - 5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1585	PKM Collets ER 20	Ø 5	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1586	PKM Collets ER 20	Ø 5 - 6	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1587	PKM Collets ER 20	Ø 6	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1588	PKM Collets ER 20	Ø 6 - 7	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1589	PKM Collets ER 20	Ø 7	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1590	PKM Collets ER 20	Ø 7 - 8	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1591	PKM Collets ER 20	Ø 8	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1592	PKM Collets ER 20	Ø 8 - 9	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1593	PKM Collets ER 20	Ø 10	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1594	PKM Collets ER 20	Ø 11 - 12	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1595	PKM Collets ER 20	Ø 13 - 14	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1596	PKM Collets ER 16	Ø 1	\N	\N	3	3	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1597	PKM Collets ER 16	Ø 2	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1598	PKM Collets ER 16	Ø 2 - 3	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1599	PKM Collets ER 16	Ø 4	\N	\N	6	6	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1600	PKM Collets ER 16	Ø 5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1601	PKM Collets ER 16	Ø 5 - 6	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1602	PKM Collets ER 16	Ø 6 - 7	\N	\N	3	3	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1603	PKM Collets ER 16	Ø 7	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1604	PKM Collets ER 16	Ø 8	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1605	PKM Collets ER 16	Ø 9	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1606	PKM Collets ER 16	Ø 10	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1607	PKM Collets ER 16	Ø 11	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1608	PKM Collets ER 11	Ø 1	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1609	PKM Collets ER 11	Ø 2	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1610	PKM Collets ER 11	Ø 2.5	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1611	PKM Collets ER 11	Ø 3	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1612	PKM Collets ER 11	Ø 3.5	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1613	PKM Collets ER 11	Ø 4	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1614	PKM Collets ER 11	Ø 4.5	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1615	PKM Collets ER 11	Ø 5	\N	\N	3	3	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1616	PKM Collets ER 11	Ø 5.5	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1617	PKM Collets ER 11	Ø 6	\N	\N	3	3	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1618	PKM Collets ER 11	Ø 6.5	\N	\N	3	3	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1619	PKM Collets ER 11	Ø 7	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1620	PKM Collets ER 11	Ø 8.5	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1621	PKM Collets ER 8	Ø 0.5 - 1	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1622	PKM Collets ER 8	Ø 1 - 1.5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1623	PKM Collets ER 8	Ø 2	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1624	PKM Collets ER 8	Ø 2 - 2.5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1625	PKM Collets ER 8	Ø 2.5 - 3	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1626	PKM Collets ER 8	Ø 3 - 3.5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1627	PKM Collets ER 8	Ø 3.5 - 4	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1628	PKM Collets ER 8	Ø 4	\N	\N	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1629	PKM Collets ER 8	Ø 4 - 4.5	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1630	Plug Gauge ( GO and NOGO ) ( Double End )	4 H7	83110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1631	Plug Gauge ( GO and NOGO ) ( Double End )	4 H7	\N	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1632	Plug Gauge ( GO and NOGO ) ( Double End )	4 H7	7074 / 3	ASSPL	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1633	Plug Gauge ( GO and NOGO ) ( Double End )	5 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1634	Plug Gauge ( GO and NOGO ) ( Double End )	6 H7	\N	Baker Mercer	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1635	Plug Gauge ( GO and NOGO ) ( Double End )	6 H7	WSG0054	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1636	Plug Gauge ( GO and NOGO ) ( Double End )	7 H7	1972 / 1	ASSPL	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1637	Plug Gauge ( GO and NOGO ) ( Double End )	7 H7	NG 85218	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1638	Plug Gauge ( GO and NOGO ) ( Double End )	7 H7	WS - G0051	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1639	Plug Gauge ( GO and NOGO ) ( Double End )	8 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1640	Plug Gauge ( GO and NOGO ) ( Double End )	9 H7	NG 084948	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1641	Plug Gauge ( GO and NOGO ) ( Double End )	9 H7	WS - G0053	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1642	Plug Gauge ( GO and NOGO ) ( Double End )	9.525  +0.050	NGBS 214	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1643	Plug Gauge ( GO and NOGO ) ( Double End )	10 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1644	Plug Gauge ( GO and NOGO ) ( Double End )	10 H7	115	Baker Mercer	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1645	Plug Gauge ( GO and NOGO ) ( Double End )	11 H7	NG134918	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1646	Plug Gauge ( GO and NOGO ) ( Double End )	11 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1647	Plug Gauge ( GO and NOGO ) ( Double End )	12 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1648	Plug Gauge ( GO and NOGO ) ( Double End )	12 H7	G05A8215	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1649	Plug Gauge ( GO and NOGO ) ( Double End )	12 H7	125	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1650	Plug Gauge ( GO and NOGO ) ( Double End )	13 H7	NG0B5268	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1651	Plug Gauge ( GO and NOGO ) ( Double End )	13 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1652	Plug Gauge ( GO and NOGO ) ( Double End )	14 H7	145	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1653	Plug Gauge ( GO and NOGO ) ( Double End )	14 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1654	Plug Gauge ( GO and NOGO ) ( Double End )	15 H7	WS - G0042	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1655	Plug Gauge ( GO and NOGO ) ( Double End )	16 H7	NG0B4914	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1656	Plug Gauge ( GO and NOGO ) ( Double End )	16 H7	G0043	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1657	Plug Gauge ( GO and NOGO ) ( Double End )	16 H7	175	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1861	Ring Spanner	1/2 - 9/16	\N	\N	1	1	D14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1658	Plug Gauge ( GO and NOGO ) ( Double End )	17 H7	G0B5265	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1659	Plug Gauge ( GO and NOGO ) ( Double End )	17 H7	WS - G0044	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1660	Plug Gauge ( GO and NOGO ) ( Double End )	18 H7	G00112	Baker	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1661	Plug Gauge ( GO and NOGO ) ( Double End )	18 H7	WS - G0045	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1662	Plug Gauge ( GO and NOGO ) ( Double End )	19 H7	WS - G0046	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1663	Plug Gauge ( GO and NOGO ) ( Double End )	20 H7	WS - G0047	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1664	Plug Gauge ( GO and NOGO ) ( Double End )	20 H7	3 - 159	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1665	Plug Gauge ( GO and NOGO ) ( Double End )	21 H7	WS - G0037	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1666	Plug Gauge ( GO and NOGO ) ( Double End )	22 H7	WSG0038	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1667	Plug Gauge ( GO and NOGO ) ( Double End )	22 H7	IS - 039 / 130	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1668	Plug Gauge ( GO and NOGO ) ( Double End )	22 H7	\N	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1669	Plug Gauge ( GO and NOGO ) ( Double End )	23 H7	WS - G0039	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1670	Plug Gauge ( GO and NOGO ) ( Double End )	24 H7	WSG0068	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1671	Plug Gauge ( GO and NOGO ) ( Double End )	24 H7	IS - 042 / 83	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1672	Plug Gauge ( GO and NOGO ) ( Double End )	24 H7	WS - G0040	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1673	Plug Gauge ( GO and NOGO ) ( Double End )	25 H7	WS - G0041	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1674	Plug Gauge ( GO and NOGO ) ( Double End )	26 H7	IS - 046 / 27	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1675	Plug Gauge ( GO and NOGO ) ( Double End )	26 H7	WS - G0066	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1676	Plug Gauge ( GO and NOGO ) ( Double End )	26 H7	WS - G0032	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1677	Plug Gauge ( GO and NOGO ) ( Double End )	27 H7	WS - G0033	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1678	Plug Gauge ( GO and NOGO ) ( Double End )	27 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1679	Plug Gauge ( GO and NOGO ) ( Double End )	28 H7	IS - 050 / 22	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1680	Plug Gauge ( GO and NOGO ) ( Double End )	30 H7	315	Accurate	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1681	Plug Gauge ( GO and NOGO ) ( Double End )	30 H7	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1682	Plug Gauge ( GO and NOGO ) ( Double End )	32 H7	WS - G0035	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1683	Plug Gauge ( GO and NOGO ) ( Double End )	34 H7	WS - G0027	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1684	Plug Gauge ( GO and NOGO ) ( Double End )	36 H7	03126	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1685	Plug Gauge ( GO and NOGO ) ( Double End )	38 H7	WS - G0029	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1686	Plug Gauge ( GO and NOGO ) ( Double End )	40 H7	WS - G0030	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1687	Plug Gauge ( GO and NOGO ) ( Double End )	40 H7	03126	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1688	Plug Gauge ( GO and NOGO ) ( Double End )	44 H7	WS 0031	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1689	Plug Gauge ( GO and NOGO ) ( Double End )	48 H7	WS 0021	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1690	Plug Gauge ( GO and NOGO ) ( Double End )	52 H7	WS - G004	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1691	Plug Gauge ( GO and NOGO ) ( Double End )	52 H7	WS - G0022	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1692	Plug Gauge ( GO and NOGO ) ( Double End )	53 H7	WS - G0023	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1693	Plug Gauge ( GO and NOGO ) ( Double End )	56 H7	WS - G0024	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1694	Plug Gauge ( GO and NOGO ) ( Double End )	58 H7	WS - G0025	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1695	Plug Gauge ( GO and NOGO ) ( Double End )	58 H7	WS - G0055	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1696	Plug Gauge ( GO and NOGO ) ( Double End )	100 H7	WS - G0026	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1697	Plug Gauge ( GO and NOGO ) ( Double End )	8 J6	CSN 3110	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1698	Plug Gauge ( GO and NOGO ) ( Double End )	10 J6	WS - G0084	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1699	Plug Gauge ( GO and NOGO ) ( Double End )	20 J6	WS - G0081	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1700	Plug Gauge ( GO and NOGO ) ( Double End )	21 J6	WS - G0080	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1701	Plug Gauge ( GO and NOGO ) ( Double End )	40 J6	WS - G0078	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1702	Plug Gauge ( GO and NOGO ) ( Double End )	52 J6	WS - G0077	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1703	Plug Gauge ( GO and NOGO ) ( Double End )	100 J6	WS - G0079	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1704	Plug Gauge ( GO and NOGO ) ( Double End )	8 K6	WS - G0085	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1705	Plug Gauge ( GO and NOGO ) ( Double End )	9 K6	03110	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1706	Plug Gauge ( GO and NOGO ) ( Double End )	17 K6	WS - G0082	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1707	Plug Gauge ( GO and NOGO ) ( Double End )	40 K6	03126	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1708	Plug Gauge ( GO and NOGO ) ( Double End )	82 K6	WS - G0075	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1709	Plug Gauge ( GO and NOGO ) ( Double End )	88 K6	WS - G0074	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1710	Plug Gauge ( GO Gauge ) (Single End)	36 H7	WS - G0061	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1711	Plug Gauge ( GO Gauge ) (Single End)	36 H7	WS - G0059	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1712	Plug Gauge ( GO Gauge ) (Single End)	42 H7	WS - G0019	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1713	Plug Gauge ( GO Gauge ) (Single End)	45 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1714	Plug Gauge ( GO Gauge ) (Single End)	45 H7	WS - G0062	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1715	Plug Gauge ( GO Gauge ) (Single End)	46 H7	WS - G0018	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1716	Plug Gauge ( GO Gauge ) (Single End)	50 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1717	Plug Gauge ( GO Gauge ) (Single End)	62 H7	WS - G0016	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1718	Plug Gauge ( GO Gauge ) (Single End)	63 H7	WS - G0015	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1719	Plug Gauge ( GO Gauge ) (Single End)	65 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1720	Plug Gauge ( GO Gauge ) (Single End)	68 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1721	Plug Gauge ( GO Gauge ) (Single End)	70 H7	WS - G0012	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1722	Plug Gauge ( GO Gauge ) (Single End)	72 H7	WS - G008	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1723	Plug Gauge ( GO Gauge ) (Single End)	75 H7	WS - G001	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1724	Plug Gauge ( GO Gauge ) (Single End)	78 H7	WS - G007	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1725	Plug Gauge ( GO Gauge ) (Single End)	80 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1726	Plug Gauge ( GO Gauge ) (Single End)	82 H7	WS - G003	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1727	Plug Gauge ( GO Gauge ) (Single End)	85 H7	WS - G006	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1728	Plug Gauge ( GO Gauge ) (Single End)	88 H7	WS - G004	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1729	Plug Gauge ( GO Gauge ) (Single End)	90 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1730	Plug Gauge ( GO Gauge ) (Single End)	92 H7	WS - G0011	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1731	Plug Gauge ( GO Gauge ) (Single End)	95 H7	03120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1732	Plug Gauge ( GO Gauge ) (Single End)	98 H7	WS - G009	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1733	Plug Gauge ( GO Gauge ) (Single End)	60 J6	WS - G0070	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1734	Plug Gauge ( GO Gauge ) (Single End)	72 J6	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1735	Plug Gauge ( GO Gauge ) (Single End)	95 K6	WS - G0072	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1736	Plug Gauge ( GO Gauge ) (Single End)	62 K6	WS - G0069	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1737	Plug Gauge ( NOGO Gauge ) (Single End)	36 H7	WS - G0061	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1738	Plug Gauge ( NOGO Gauge ) (Single End)	36 H7	WS - G0059	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1739	Plug Gauge ( NOGO Gauge ) (Single End)	42 H7	WS - G0019	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1740	Plug Gauge ( NOGO Gauge ) (Single End)	45 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1741	Plug Gauge ( NOGO Gauge ) (Single End)	45 H7	WS - G0062	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1742	Plug Gauge ( NOGO Gauge ) (Single End)	46 H7	WS - G0018	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1743	Plug Gauge ( NOGO Gauge ) (Single End)	50 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1744	Plug Gauge ( NOGO Gauge ) (Single End)	62 H7	WS - G0016	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1745	Plug Gauge ( NOGO Gauge ) (Single End)	63 H7	WS - G0015	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1746	Plug Gauge ( NOGO Gauge ) (Single End)	65 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1747	Plug Gauge ( NOGO Gauge ) (Single End)	68 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1748	Plug Gauge ( NOGO Gauge ) (Single End)	70 H7	WS - G0012	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1749	Plug Gauge ( NOGO Gauge ) (Single End)	72 H7	WS - G008	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1750	Plug Gauge ( NOGO Gauge ) (Single End)	75 H7	WS - G001	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1751	Plug Gauge ( NOGO Gauge ) (Single End)	78 H7	WS - G007	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1752	Plug Gauge ( NOGO Gauge ) (Single End)	80 H7	CSN 3120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1753	Plug Gauge ( NOGO Gauge ) (Single End)	82 H7	WS - G003	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1754	Plug Gauge ( NOGO Gauge ) (Single End)	85 H7	WS - G006	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1755	Plug Gauge ( NOGO Gauge ) (Single End)	88 H7	WS - G004	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1756	Plug Gauge ( NOGO Gauge ) (Single End)	90 H7	03120	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1757	Plug Gauge ( NOGO Gauge ) (Single End)	92 H7	WS - G0011	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1758	Plug Gauge ( NOGO Gauge ) (Single End)	95 H7	03120	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1759	Plug Gauge ( NOGO Gauge ) (Single End)	98 H7	WS - G009	\N	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1760	Plug Gauge ( NOGO Gauge ) (Single End)	60 J6	WS - G0070	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1761	Plug Gauge ( NOGO Gauge ) (Single End)	72 J6	WS - G0071	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1762	Plug Gauge ( NOGO Gauge ) (Single End)	95 K6	WS - G0072	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1763	Plug Gauge ( NOGO Gauge ) (Single End)	62 K6	WS - G0069	Somet	1	1	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
1764	Plunger Dial (0.01 mm)	\N	VBJ181	Mitutoyo	1	1	TC - 07	\N	\N	5415	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1765	Plunger Dial (0.01 mm)	\N	VBJ166	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1766	Plunger Dial (0.01 mm)	\N	UTV162	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1767	Plunger Dial (0.01 mm)	\N	UTV157	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1768	Plunger Dial (0.01 mm)	\N	12191	Baker	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1769	Plunger Dial (0.01 mm)	\N	Type CO2	Baker	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1770	Plunger Dial (0.01 mm)	\N	6E796	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1771	Plunger Dial (0.01 mm)	\N	UUW334	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1772	Plunger Dial (0.01 mm)	\N	2046 - 08	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1773	Plunger Dial (0.01 mm)	\N	UTV - 158	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1774	Plunger Dial (0.01 mm)	\N	Type - J02	Baker	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1775	Plunger Dial (0.01 mm)	\N	CBY416	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1776	Plunger Dial (0.01 mm)	\N	UUW329	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1777	Plunger Dial (0.01 mm)	\N	EBY417	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1778	Plunger Dial (0.01 mm)	\N	BA2679	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1779	Plunger Dial (0.01 mm)	\N	VBJ173	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1780	Plunger Dial (0.01 mm)	\N	VBJ171	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1781	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH29	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1782	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH56	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1783	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH46	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1784	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH20	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1785	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH54	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1786	Plunger Dial (0.01 mm)(New Stock)	10 mm	CTAH19	Mitutoyo	1	1	TC - 09	\N	\N	1627.12	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1787	Plunger Dial (Long Stylus) (0.01 mm)	50 mm	3058	Mitutoyo	1	1	TC - 07	\N	\N	4950	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1788	Plunger Dial (Long Stylus) (0.01 mm)	30 mm	UZR020	Mitutoyo	1	1	TC - 07	\N	\N	4950	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1789	Plunger Dial (Long Stylus) (0.01 mm)	30 mm	TYL326	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1790	Plunger Dial (0.002 mm)	\N	1013F	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1791	Plunger Dial (0.001 mm)	\N	RTG441	Mitutoyo	1	1	TC - 07	\N	\N	19995	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1792	Plunger Dial (0.001 mm)	\N	RTG426	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1793	Plunger Dial (0.001 mm)	\N	BQB276	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1794	Plunger Dial (0.001 mm)	\N	CSN 251 816	Somet	1	1	TC - 07	\N	With Flexible Measuring Attachment	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1795	Plunger Dial (0.001 mm)	\N	TC - PD - 01	Helios	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1796	Plunger Dial (0.001 mm)	\N	2109 - 10	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1797	Plunger Dial (0.001 mm)	\N	2109	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1798	Plunger Dial (0.001 mm)	\N	2109F	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1799	Plunger Dial (0.001 mm)(New Stock)	5 mm	AYQM51	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1800	Plunger Dial (0.001 mm)(New Stock)	5 mm	AXTS34	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1801	Plunger Dial (0.001 mm)(New Stock)	5 mm	AQYK73	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1802	Plunger Dial (0.001 mm)(New Stock)	5 mm	ARXD26	Mitutoyo	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1803	Plunger Dial (0.001 mm)(New Stock)	10 mm	BAGS57	Mitutoyo	1	1	TC - 07	\N	\N	6091.53	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1804	Plunger Dial (0.001 mm)(New Stock)	10 mm	BKVF88	Mitutoyo	1	1	TC - 07	\N	\N	6091.53	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1805	Plunger Dial (0.001 mm)(New Stock)	10 mm	BJBN29	Mitutoyo	1	1	TC - 07	\N	\N	6091.53	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1806	Plunger Dial (0.001 mm)(New Stock)	10 mm	BKVF89	Mitutoyo	1	1	TC - 07	\N	\N	6091.53	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
1807	Radius Gauge	\N	\N	\N	7	7	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
1808	Radius Turning Tool	20 × 20	N176.39 2020 - 10	\N	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1809	Radius Turning Tool	20 × 20	SRGCR - 2020K - 12	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1810	Radius Turning Tool	\N	\N	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
1811	Ring Bore Gauge (Dial Included)	4 - 15	Not Mentioned	Somet	0	0	TC - 10	Ring Gauge - 13 No's	(Measuring Attachment - 12 No's)	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Bore Gauges
1812	Ring  Gauge	Ø 6   -0.0100	\N	Mercer	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1813	Ring  Gauge	Ø 6   +0.0109	\N	Mercer	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1814	Ring  Gauge	Ø 8	\N	Tesa	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1815	Ring  Gauge	Ø 10	\N	Mercer	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1816	Ring  Gauge	Ø 10	\N	Tesa	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1817	Ring  Gauge	Ø 11	\N	Tesa	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1818	Ring  Gauge	Ø 12	\N	Mercer	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1819	Ring  Gauge	Ø 17	\N	Tesa	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1820	Ring  Gauge	Ø 25	\N	Tesa	2	2	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1821	Ring  Gauge	Ø 25	\N	Micron	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1822	Ring  Gauge	Ø 34.9948	\N	Pragathi	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1823	Ring  Gauge	Ø 34.996	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1824	Ring  Gauge	Ø 35	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1825	Ring  Gauge	Ø 35  + 8 µ	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1826	Ring  Gauge	Ø 35  - 2 µ	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1827	Ring  Gauge	Ø 49.9990	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1828	Ring  Gauge	Ø 50  - 5 µ	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1829	Ring  Gauge	Ø 50  +3 µ	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1830	Ring  Gauge	Ø 69.995	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1831	Ring  Gauge	Ø 70  - 1 µ	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1832	Ring  Gauge	Ø 90  - 4 µ	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1833	Ring  Gauge	Ø 125	\N	Tesa	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1834	Ring  Gauge	Ø 217.9996	Z - 8039	Baker	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1835	Ring  Gauge	Ø 221.9982	Z - 8038	Baker	1	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Ring Gauges
1836	Ring Spanner	6 - 7	\N	\N	15	15	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1837	Ring Spanner	8 - 9	\N	\N	12	12	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1838	Ring Spanner	10 - 11	\N	\N	7	7	D1	\N	\N	290	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1839	Ring Spanner	12 - 13	\N	\N	1	1	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1840	Ring Spanner	14 - 15	\N	\N	11	11	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1841	Ring Spanner	16 - 17	\N	\N	9	9	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1842	Ring Spanner	17 - 19	\N	\N	1	1	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1843	Ring Spanner	18 - 19	\N	\N	6	6	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1844	Ring Spanner	19 - 22	\N	\N	1	1	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1845	Ring Spanner	20 - 22	\N	\N	4	4	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1846	Ring Spanner	21 - 23	\N	\N	3	3	D1	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1847	Ring Spanner	24 - 26	\N	\N	1	1	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1848	Ring Spanner	24 - 27	\N	\N	5	5	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1849	Ring Spanner	25 - 27	\N	\N	2	2	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1850	Ring Spanner	25 - 28	\N	\N	4	4	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1851	Ring Spanner	27 - 32	\N	\N	1	1	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1852	Ring Spanner	30 - 32	\N	\N	8	8	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1853	Ring Spanner	32 - 36	\N	\N	1	1	D11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1854	Ring Spanner	1/4 - 5/16	\N	\N	1	1	D15	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1855	Ring Spanner	1/8W 3/16BS - 3/16W 1/4BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1856	Ring Spanner	3/8 - 7/16	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1857	Ring Spanner	1/4W 5/16BS - 3/16W 1/4BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1858	Ring Spanner	11/16 - 19/32	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1859	Ring Spanner	1/4W 5/16BS - 5/16W 3/8BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1860	Ring Spanner	3/8W 7/16BS - 5/16W 3/8BS	\N	\N	3	3	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1862	Ring Spanner	13/16 - 25/32	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1863	Ring Spanner	3/4 - 5/8	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1864	Ring Spanner	3/8W 7/16BS - 7/16W 1/2BS	\N	\N	3	3	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1865	Ring Spanner	1/2W 9/16BS - 7/16W 1/2BS	\N	\N	3	3	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1866	Ring Spanner	7/8 - 15/16	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1867	Ring Spanner	1/2W - 9/16W	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1868	Ring Spanner	1" - 15/16	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1869	Ring Spanner	5/8W 11/16BS - 9/16W 5/8BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1870	Ring Spanner	1" - 1 1/8	\N	\N	1	1	D16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1871	Ring Spanner	3/4W 7/8BS - 5/8W 11/16BS	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1872	Ring Spanner	1 1/4 - 1 1/16	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1873	Ring Spanner	1"W 1 1/8BS - 7/8W 1"BS	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1874	Ring Spanner	13 - 13	\N	\N	1	1	\N	\N	Goose neck Type	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1875	Ring Spanner	17 - 17	\N	\N	1	1	D11	\N	Goose neck Type	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1876	Scraper	\N	\N	\N	84	84	G14	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Files & Scrapers
1877	Screw Driver	\N	\N	\N	0	0	G15	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
1878	Screw Driver Set	\N	\N	\N	0	0	G15	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Pliers & Vices
1879	Screw Jack	\N	\N	\N	12	12	E15	\N	\N	11040	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
1880	Shell Type Counter Bore	Ø 32	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1881	Shell Type Counter Bore	Ø 34	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1882	Shell Type Counter Bore	Ø 36	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1883	Shell Type Counter Bore	Ø 37	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1884	Shell Type Counter Bore	Ø 38	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1885	Shell Type Counter Bore	Ø 40	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1886	Shell Type Counter Bore	Ø 42	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1887	Shell Type Counter Bore	Ø 44	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1888	Shell Type Counter Bore	Ø 48	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1889	Shell Type Counter Bore	Ø 49	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1890	Shell Type Counter Bore	Ø 50	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Counterbores & Countersinks
1891	Shoulder Milling Cutter ( Arbor Type )	Ø 50	ASX400 - 050A05R (GC0396)	Mitsubishi	1	1	G5	\N	\N	83721	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1892	Shoulder Milling Cutter ( Arbor Type )	Ø 50	ASX400 - 050A04R	Mitsubishi	1	1	\N	\N	\N	22032	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1893	Shoulder Milling Cutter ( Arbor Type )	Ø 50	ASX400 - 050A04R	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1894	Shoulder Milling Cutter ( Arbor Type )	Ø 50	ASX400 - 050A05R	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1895	Shoulder Milling Cutter ( Arbor Type )	Ø 50	\N	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1896	Shoulder Milling Cutter ( Arbor Type )	Ø 63	ASX400 - 063A06R (FH1509)	Mitsubishi	1	1	G5	\N	\N	76046	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1897	Shoulder Milling Cutter ( Arbor Type )	Ø 63	ASX400 - 063A06R (FH1511)	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1898	Shoulder Milling Cutter ( Arbor Type )	Ø 80	ASX400 - 080B06R (GB2383)	Mitsubishi	1	1	\N	\N	\N	28261	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1899	Shoulder Milling Cutter ( Arbor Type )	Ø 80	ASX400 - 080B06R (ID0188)	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1900	Shoulder Milling Cutter ( Arbor Type )	Ø 80	ASX400 - 080B06R (ID0192)	Mitsubishi	1	1	G5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1901	Shoulder Milling Cutter ( Arbor Type )	Ø 100	ASX400 - 100B07R	Mitsubishi	1	1	\N	\N	\N	44843	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1902	Shoulder Milling Cutter ( Arbor Type )	Ø 100	ASX400 - 100B05R	Mitsubishi	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1903	Shoulder Milling Cutter ( Arbor Type )	Ø 100	ASX400 - 100B05R	Mitsubishi	1	1	\N	\N	\N	34560	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1904	Shoulder Milling Cutter ( Arbor Type )	Ø 125	ASX400 - 125B08R (GG0719)	Mitsubishi	1	1	G5	\N	\N	49370	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1905	Shoulder Milling Cutter ( Shank Type )	Ø 80	ASX400R 806S32	Mitsubishi	1	1	\N	\N	\N	49986	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1906	Side Face Cutter	Ø 50 × 4	\N	\N	5	5	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1907	Side Face Cutter	Ø 50 × 5	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1908	Side Face Cutter	Ø 50 × 6	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1909	Side Face Cutter	Ø 63 × 5	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1910	Side Face Cutter	Ø 63 × 6	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1911	Side Face Cutter	Ø 63 × 8	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1912	Side Face Cutter	Ø 63 × 10	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1913	Side Face Cutter	Ø 63 × 12	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1914	Side Face Cutter	Ø 80 × 10 ×  27	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1915	Side Face Cutter	Ø 80 × 12 ×  27	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1916	Side Face Cutter	Ø 80 × 14	\N	\N	4	4	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1917	Side Face Cutter	Ø 100 × 6 × 32	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1918	Side Face Cutter	Ø 100 × 8 × 32	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1919	Side Face Cutter	Ø 100 × 10 × 32	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1920	Side Face Cutter	Ø 100 × 12	\N	\N	1	1	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1921	Side Face Cutter	Ø 100 × 14	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1922	Side Face Cutter	Ø 100 × 16	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1923	Side Face Cutter	Ø 100 × 18 × 32	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1924	Side Face Cutter	Ø 125 × 14	\N	\N	2	2	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1925	Side Face Cutter	Ø 125 × 16	\N	\N	3	3	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1926	Side Face Cutter	Ø 125 × 18	\N	\N	6	6	A1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1927	Side Face Cutter ( Single Side Cutting )	Ø 63 × ( 6 to 9 )	\N	\N	1	1	\N	\N	Special ( Taper Side angle )	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1928	Sleeve	1 / 0	\N	\N	2	2	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1929	Sleeve	1 / 1	\N	\N	1	1	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1930	Sleeve	2 / 1	\N	\N	7	7	G10	\N	\N	280	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1931	Sleeve	2 / 2	\N	\N	1	1	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1932	Sleeve	3 / 1	\N	\N	0	0	G10	\N	3 Long Extensions	280	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1933	Sleeve	3 / 2	\N	\N	10	10	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1934	Sleeve	3 / 3	\N	\N	1	1	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1935	Sleeve	4 / 1	\N	\N	8	8	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1936	Sleeve	4 / 2	\N	\N	0	0	G10	\N	1 Long Extension	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1937	Sleeve	4 / 3	\N	\N	0	0	G10	\N	2 Long Extensions + 2 Extra Long Extensions	576	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1938	Sleeve	4 / 4	\N	\N	1	1	G10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1939	Sleeve	5 / 1	\N	\N	2	2	G10	\N	\N	720	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1940	Sleeve	5 / 2	\N	\N	7	7	G10	\N	\N	157	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1941	Sleeve	5 / 3	\N	\N	0	0	G10	\N	3 Long Extensions	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1942	Sleeve	5 / 4	\N	\N	0	0	G10	\N	2 Long Extensions	1860	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1943	Slip Gauge Box	20 - 100	CSN 253312.02	Somet	0	0	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1944	Slip Gauge Box	0.99 - 1.01	M2 - 22621	Somet	0	0	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1945	Slip Gauge Box	0.5 - 100	CSN 2533163	Somet	0	0	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1946	Slip Gauge Box	\N	IS - 2984 DIN - 861	DIN	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1947	Slip Gauge Box	\N	\N	Mitutoyo	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1948	Slip Gauge Box	0.5 - 100	R4 - 30813	Somet	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1949	Slip Gauge Box	0.5 - 100	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1950	Slip Gauge Holder	4.5 - 160	\N	Helios	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1951	Slip Gauge Holder	4.5 - 160	43 - 197	Helios	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1952	Slip Gauge Holder	160 - 800	23219003	Helios	0	0	\N	\N	\N	5542	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1953	Slip Gauge Holder	160 - 510	\N	Helios	1	1	TC - 08	\N	\N	4034	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
1954	Slitting Saw	Ø32 × 0.8 × 8	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1955	Slitting Saw	Ø32 × 1 × 8	\N	\N	3	3	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1956	Slitting Saw	Ø40 × 0.5 × 10	\N	\N	5	5	\N	\N	\N	396	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1957	Slitting Saw	Ø40 × 0.6 × 10	\N	\N	6	6	H2	\N	\N	264	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1958	Slitting Saw	Ø40 × 0.8 × 10	\N	\N	5	5	H2	\N	\N	360	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1959	Slitting Saw	Ø40 × 1.6 × 10	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1960	Slitting Saw	Ø50 × 0.6 × 13	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1961	Slitting Saw	Ø50 × 1 × 13	\N	\N	3	3	H2	\N	\N	610	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1962	Slitting Saw	Ø50 × 1.6 × 13	\N	\N	2	2	H2	\N	\N	1718	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1963	Slitting Saw	Ø50 × 2.5 × 13	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1964	Slitting Saw	Ø50 × 3 × 10	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1965	Slitting Saw	Ø50 × 4 × 13	\N	\N	3	3	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1966	Slitting Saw	Ø62 × 1.2 × 16	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1967	Slitting Saw	Ø63 × 1 × 16	\N	\N	8	8	\N	\N	\N	315	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1968	Slitting Saw	Ø63 × 1.6 × 16	\N	\N	8	8	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1969	Slitting Saw	Ø63 × 2 × 16	\N	\N	9	9	H2	\N	\N	330	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1970	Slitting Saw	Ø63 × 2.5 × 16	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1971	Slitting Saw	Ø63 × 3 × 16	\N	\N	3	3	\N	\N	\N	405	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1972	Slitting Saw	Ø63 × 4 × 16	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1973	Slitting Saw	Ø80 × 1 × 22	\N	\N	5	5	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1974	Slitting Saw	Ø80 × 1.6 × 22	\N	\N	6	6	H2	\N	\N	570	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1975	Slitting Saw	Ø80 × 2 × 22	\N	\N	5	5	H2	\N	\N	582	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1976	Slitting Saw	Ø80 × 3 × 16	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1977	Slitting Saw	Ø80 × 3 × 22	\N	\N	6	6	H2	\N	\N	684	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1978	Slitting Saw	Ø100 × 0.5 × 22	\N	\N	3	3	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1979	Slitting Saw	Ø100 × 0.8 × 22	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1980	Slitting Saw	Ø100 × 1 × 22	\N	\N	1	1	H2	\N	\N	164	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1981	Slitting Saw	Ø100 × 1 × 27	\N	\N	2	2	H2	\N	\N	550	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1982	Slitting Saw	Ø100 × 1.2 × 22	\N	\N	5	5	H2	\N	\N	410	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1983	Slitting Saw	Ø100 × 1.6 × 22	\N	\N	8	8	H2	\N	\N	574	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1984	Slitting Saw	Ø100 × 1.6 × 27	\N	\N	10	10	H2	\N	\N	1825	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1985	Slitting Saw	Ø100 × 2 × 22	\N	\N	8	8	H2	\N	\N	3063	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1986	Slitting Saw	Ø100 × 2.5 × 27	\N	\N	3	3	H2	\N	\N	1023	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1987	Slitting Saw	Ø100 × 3 × 22	\N	\N	8	8	H2	\N	\N	390	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1988	Slitting Saw	Ø100 × 4 × 22	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1989	Slitting Saw	Ø100 × 6 × 22	\N	\N	3	3	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1990	Slitting Saw	Ø100 × 6 × 32	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1991	Slitting Saw	Ø122.5 × 4 × 27	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1992	Slitting Saw	Ø125 × 1.6 × 22	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1993	Slitting Saw	Ø125 × 1.6 × 27	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1994	Slitting Saw	Ø125 × 2 × 22	\N	\N	4	4	H2	\N	\N	780	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1995	Slitting Saw	Ø125 × 2 × 27	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1996	Slitting Saw	Ø125 × 4 × 27	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1997	Slitting Saw	Ø125 × 5 × 27	\N	\N	1	1	\N	\N	\N	1912	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1998	Slitting Saw	Ø125 × 6 × 27	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
1999	Slitting Saw	Ø160 × 3 × 32	\N	\N	4	4	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2000	Slitting Saw	Ø160 × 3 × 1"	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2001	Slitting Saw	Ø160 × 2 × 32	\N	\N	2	2	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2002	Slitting Saw	Ø160 × 4 × 32	\N	\N	4	4	H2	\N	\N	2720	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2003	Slitting Saw	Ø160 × 5 × 32	\N	\N	1	1	H2	\N	\N	4300	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2004	Slitting Saw	Ø160 × 6 × 32	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2005	Slitting Saw	Ø166 × 2 × 32	\N	\N	3	3	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2006	Slitting Saw	Ø196 × 2 × 32	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2007	Slitting Saw	Ø198 × 3 × 32	\N	\N	1	1	H2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2008	Slitting Saw	Ø200 × 4 × 32	\N	\N	0	0	H2	\N	\N	5088	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2009	Slitting Saw	Ø200 × 2 × 32	\N	\N	6	6	H7	\N	\N	7500	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2010	Slitting Saw	Ø200 × 2.5 × 32	\N	\N	5	5	H7	\N	\N	3751	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2011	Slitting Saw	Ø200 × 3 × 32	\N	\N	4	4	H2	\N	\N	2310	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2012	Slitting Saw	Ø200 × 5 × 32	\N	\N	6	6	H7	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2013	Slitting Saw	Ø250 × 2.5 × 40	\N	\N	3	3	H8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2014	Slitting Saw	Ø250 × 3 × 40	\N	\N	1	1	H8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2015	Slitting Saw	Ø250 × 4 × 40	\N	\N	3	3	H8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2016	Slitting Saw	Ø250 × 5 × 40	\N	\N	5	5	H8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2017	Slitting Saw	Ø3" × 0.04" × 1"	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2018	Slitting Saw	Ø2 3/4" × 0.62" × 1"	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2019	Slitting Saw	Ø2 3/4" × 0.93" × 1"	\N	\N	2	2	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2020	Slot Drill	Ø 2.5	\N	\N	2	2	G2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2021	Slot Drill	Ø 4.0	\N	\N	9	9	G2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2022	Slot Drill	Ø 8.0	\N	\N	5	5	G2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2023	Slot Drill	Ø 13.0	\N	\N	1	1	G2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2024	Snap Gauge Marameter	0-25	\N	Mahr	1	1	\N	\N	\N	35726	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2025	Snap Gauge Marameter (New Stock)	0-25	3209074	Mahr	1	1	TC - 09	\N	New Stock	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2026	Snap Gauge Marameter	25-60	NBR - 4201029	Mahr	1	1	\N	\N	\N	38839	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2027	Snap Gauge Marameter	25-60	6110175	Mahr	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2028	Snap Gauge Marameter	50-100	\N	Mahr	1	1	TC - 11	\N	\N	39440	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2029	Snap Gauge Marameter	100-150	\N	Mahr	1	1	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Plug Gauges
2030	Socket Wrench Bits	\N	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
2031	Spirit Level	\N	1570	Kinex	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2032	Spirit Level	\N	5727/300 - 63/4	Kinex	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2033	Spirit Level	\N	ERB - KG	Heinrich	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2034	Spirit Level	\N	57271/300 - 62/11	Kinex	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2035	Spirit Level	\N	5739.1/300 - 62/111	Kinex	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2036	Spirit Level	\N	57391/250	Kinex	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2037	Electronic Level	\N	GH51720023	Tesa	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2038	Square Gauge	\N	43342 - A	Starrett	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2039	Steel Rule	0  -  300	WSTC - 1	Nigata Sanjaya	2	2	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2040	Steel Rule	0  -  300	411	Tower	1	1	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2041	Steel Rule	0  -  300	\N	\N	1	1	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2042	Steel Rule	0  -  500	\N	Kinex	1	1	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2043	Steel Rule	0  -  600	\N	Arch	3	3	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2044	Steel Rule	0  -  600	\N	Kristeel	1	1	Wood table	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Height Gauges
2045	Straight Edge (Knife Edge)	\N	3152537/41	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2046	Straight Edge (Knife Edge)	\N	200 C5N253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2047	Straight Edge (Knife Edge)	\N	315025313741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2048	Straight Edge (Knife Edge)	\N	3150253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2049	Straight Edge (Knife Edge)	\N	3150253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2050	Straight Edge (Knife Edge)	\N	200 CSN 253 - 141	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2051	Straight Edge (Knife Edge)	\N	201 CSN 253 - 141	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2052	Straight Edge (Knife Edge)	\N	202 CSN 253 - 141	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2053	Straight Edge (Knife Edge)	\N	203 CSN 253 - 141	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2054	Straight Edge (Knife Edge)	\N	1258253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2055	Straight Edge (Knife Edge)	\N	1258253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2056	Straight Edge (Knife Edge)	\N	1258253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2057	Straight Edge (Knife Edge)	\N	1258253741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2058	Straight Edge (Knife Edge)	\N	8083741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2059	Straight Edge (Knife Edge)	\N	8083741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2060	Straight Edge (Knife Edge)	\N	8083741	\N	1	1	TC - 08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2061	C I Straight Edge (Camel Back)	500	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2062	C I Straight Edge (Camel Back)	750	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2063	C I Straight Edge (Camel Back)	1000	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2064	C I Straight Edge (Camel Back)	1500	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2065	C I Straight Edge (Triangular)	45° × 250	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2066	C I Straight Edge (Triangular)	45° × 500	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2067	C I Straight Edge (Triangular)	50° × 250	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2068	C I Straight Edge (Triangular)	50° × 750	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2069	C I Straight Edge (Triangular)	55° × 250	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2070	C I Straight Edge (Triangular)	60° × 250	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2071	C I Straight Edge (Triangular)	60° × 750	\N	\N	2	2	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2072	Granite Straight Edge	310 × 50 × 30	\N	\N	1	1	H6	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Surface Plates & Straight Edges
2073	Straight Shank Drill	Ø2.0	\N	\N	25	25	A8	\N	\N	514	BIN CARD	CONSUMABLES	\N	Tools	Drills
2074	Straight Shank Drill	Ø2.1	\N	\N	4	4	A8	\N	\N	264	BIN CARD	CONSUMABLES	\N	Tools	Drills
2075	Straight Shank Drill	Ø2.2	\N	\N	52	52	A8	\N	\N	544	BIN CARD	CONSUMABLES	\N	Tools	Drills
2076	Straight Shank Drill	Ø2.3	\N	\N	5	5	A8	\N	\N	114	BIN CARD	CONSUMABLES	\N	Tools	Drills
2077	Straight Shank Drill	Ø2.4	\N	\N	4	4	A8	\N	\N	464	BIN CARD	CONSUMABLES	\N	Tools	Drills
2078	Straight Shank Drill	Ø2.5	\N	\N	21	21	A8	\N	\N	814	BIN CARD	CONSUMABLES	\N	Tools	Drills
2079	Straight Shank Drill	Ø2.6	\N	\N	15	15	A8	\N	\N	114	BIN CARD	CONSUMABLES	\N	Tools	Drills
2080	Straight Shank Drill	Ø2.7	\N	\N	14	14	A8	\N	\N	614	BIN CARD	CONSUMABLES	\N	Tools	Drills
2081	Straight Shank Drill	Ø2.8	\N	\N	15	15	A8	\N	\N	620	BIN CARD	CONSUMABLES	\N	Tools	Drills
2082	Straight Shank Drill	Ø2.9	\N	\N	14	14	A8	\N	\N	520	BIN CARD	CONSUMABLES	\N	Tools	Drills
2083	Straight Shank Drill	Ø3.0	\N	\N	34	34	A8	\N	\N	45	BIN CARD	CONSUMABLES	\N	Tools	Drills
2084	Straight Shank Drill	Ø3.1	\N	\N	9	9	A8	\N	\N	203	BIN CARD	CONSUMABLES	\N	Tools	Drills
2085	Straight Shank Drill	Ø3.2	\N	\N	48	48	A8	\N	\N	536	BIN CARD	CONSUMABLES	\N	Tools	Drills
2086	Straight Shank Drill	Ø3.3	\N	\N	17	17	A8	\N	\N	536	BIN CARD	CONSUMABLES	\N	Tools	Drills
2087	Straight Shank Drill	Ø3.4	\N	\N	20	20	A8	\N	\N	736	BIN CARD	CONSUMABLES	\N	Tools	Drills
2088	Straight Shank Drill	Ø3.5	\N	\N	15	15	A8	\N	\N	1076	BIN CARD	CONSUMABLES	\N	Tools	Drills
2089	Straight Shank Drill	Ø3.6	\N	\N	47	47	A8	\N	\N	3140	BIN CARD	CONSUMABLES	\N	Tools	Drills
2090	Straight Shank Drill	Ø3.7	\N	\N	21	21	A8	\N	\N	1172	BIN CARD	CONSUMABLES	\N	Tools	Drills
2091	Straight Shank Drill	Ø3.8	\N	\N	34	34	A8	\N	\N	2202	BIN CARD	CONSUMABLES	\N	Tools	Drills
2092	Straight Shank Drill	Ø3.9	\N	\N	10	10	A8	\N	\N	722	BIN CARD	CONSUMABLES	\N	Tools	Drills
2093	Straight Shank Drill	Ø4.0	\N	\N	25	25	A8	\N	\N	1022	BIN CARD	CONSUMABLES	\N	Tools	Drills
2094	Straight Shank Drill	Ø4.1	\N	\N	9	9	A8	\N	\N	998	BIN CARD	CONSUMABLES	\N	Tools	Drills
2095	Straight Shank Drill	Ø4.2	\N	\N	16	16	A8	\N	\N	1028	BIN CARD	CONSUMABLES	\N	Tools	Drills
2096	Straight Shank Drill	Ø4.3	\N	\N	8	8	A8	\N	\N	148.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2097	Straight Shank Drill	Ø4.4	\N	\N	30	30	A8	\N	\N	148.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2098	Straight Shank Drill	Ø4.5	\N	\N	13	13	A8	\N	\N	1475	BIN CARD	CONSUMABLES	\N	Tools	Drills
2099	Straight Shank Drill	Ø4.6	\N	\N	20	20	A8	\N	\N	195	BIN CARD	CONSUMABLES	\N	Tools	Drills
2100	Straight Shank Drill	Ø4.7	\N	\N	19	19	A8	\N	\N	195	BIN CARD	CONSUMABLES	\N	Tools	Drills
2101	Straight Shank Drill	Ø4.8	\N	\N	23	23	A8	\N	\N	195	BIN CARD	CONSUMABLES	\N	Tools	Drills
2102	Straight Shank Drill	Ø4.9	\N	\N	10	10	A8	\N	\N	212	BIN CARD	CONSUMABLES	\N	Tools	Drills
2103	Straight Shank Drill	Ø5.0	\N	\N	27	27	A8	\N	\N	752	BIN CARD	CONSUMABLES	\N	Tools	Drills
2104	Straight Shank Drill	Ø5.1	\N	\N	22	22	A8	\N	\N	212	BIN CARD	CONSUMABLES	\N	Tools	Drills
2105	Straight Shank Drill	Ø5.2	\N	\N	0	0	A8	\N	\N	212	BIN CARD	CONSUMABLES	\N	Tools	Drills
2106	Straight Shank Drill	Ø5.3	\N	\N	28	28	A8	\N	\N	228.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2107	Straight Shank Drill	Ø5.4	\N	\N	20	20	A8	\N	\N	228.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2108	Straight Shank Drill	Ø5.5	\N	\N	21	21	A8	\N	\N	768.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2109	Straight Shank Drill	Ø5.6	\N	\N	24	24	A9	\N	\N	228.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2110	Straight Shank Drill	Ø5.7	\N	\N	9	9	A9	\N	\N	1457	BIN CARD	CONSUMABLES	\N	Tools	Drills
2111	Straight Shank Drill	Ø5.8	\N	\N	35	35	A9	\N	\N	1507	BIN CARD	CONSUMABLES	\N	Tools	Drills
2112	Straight Shank Drill	Ø5.9	\N	\N	6	6	A9	\N	\N	1757	BIN CARD	CONSUMABLES	\N	Tools	Drills
2113	Straight Shank Drill	Ø6.0	\N	\N	30	30	A9	\N	\N	1020	BIN CARD	CONSUMABLES	\N	Tools	Drills
2114	Straight Shank Drill	Ø6.1	\N	\N	7	7	A9	\N	\N	1300	BIN CARD	CONSUMABLES	\N	Tools	Drills
2115	Straight Shank Drill	Ø6.2	\N	\N	6	6	A9	\N	\N	1230	BIN CARD	CONSUMABLES	\N	Tools	Drills
2116	Straight Shank Drill	Ø6.3	\N	\N	0	0	A9	\N	\N	1230	BIN CARD	CONSUMABLES	\N	Tools	Drills
2117	Straight Shank Drill	Ø6.4	\N	\N	11	11	A9	\N	\N	1170	BIN CARD	CONSUMABLES	\N	Tools	Drills
2118	Straight Shank Drill	Ø6.5	\N	\N	28	28	A9	\N	\N	1247	BIN CARD	CONSUMABLES	\N	Tools	Drills
2119	Straight Shank Drill	Ø6.6	\N	\N	10	10	A9	\N	\N	1137	BIN CARD	CONSUMABLES	\N	Tools	Drills
2120	Straight Shank Drill	Ø6.7	\N	\N	8	8	A9	\N	\N	1137	BIN CARD	CONSUMABLES	\N	Tools	Drills
2121	Straight Shank Drill	Ø6.8	\N	\N	28	28	A9	\N	\N	11947	BIN CARD	CONSUMABLES	\N	Tools	Drills
2122	Straight Shank Drill	Ø6.9	\N	\N	17	17	A9	\N	\N	1231	BIN CARD	CONSUMABLES	\N	Tools	Drills
2123	Straight Shank Drill	Ø7.0	\N	\N	10	10	A9	\N	\N	1341	BIN CARD	CONSUMABLES	\N	Tools	Drills
2124	Straight Shank Drill	Ø7.1	\N	\N	1	1	A9	\N	\N	990	BIN CARD	CONSUMABLES	\N	Tools	Drills
2125	Straight Shank Drill	Ø7.2	\N	\N	8	8	A9	\N	\N	990	BIN CARD	CONSUMABLES	\N	Tools	Drills
2126	Straight Shank Drill	Ø7.3	\N	\N	15	15	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2127	Straight Shank Drill	Ø7.4	\N	\N	20	20	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2128	Straight Shank Drill	Ø7.5	\N	\N	34	34	A9	\N	\N	412.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2129	Straight Shank Drill	Ø7.6	\N	\N	9	9	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2130	Straight Shank Drill	Ø7.7	\N	\N	15	15	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2131	Straight Shank Drill	Ø7.8	\N	\N	11	11	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2132	Straight Shank Drill	Ø7.9	\N	\N	0	0	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2133	Straight Shank Drill	Ø8.0	\N	\N	26	26	A9	\N	\N	490	BIN CARD	CONSUMABLES	\N	Tools	Drills
2134	Straight Shank Drill	Ø8.1	\N	\N	7	7	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2135	Straight Shank Drill	Ø8.2	\N	\N	14	14	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2136	Straight Shank Drill	Ø8.3	\N	\N	16	16	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2137	Straight Shank Drill	Ø8.4	\N	\N	14	14	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2138	Straight Shank Drill	Ø8.5	\N	\N	37	37	A9	\N	\N	594.5	BIN CARD	CONSUMABLES	\N	Tools	Drills
2139	Straight Shank Drill	Ø8.6	\N	\N	3	3	A9	\N	\N	990	BIN CARD	CONSUMABLES	\N	Tools	Drills
2140	Straight Shank Drill	Ø8.7	\N	\N	16	16	A9	\N	\N	2050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2141	Straight Shank Drill	Ø8.8	\N	\N	23	23	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2142	Straight Shank Drill	Ø8.9	\N	\N	8	8	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2143	Straight Shank Drill	Ø9.0	\N	\N	9	9	A9	\N	\N	626	BIN CARD	CONSUMABLES	\N	Tools	Drills
2144	Straight Shank Drill	Ø9.1	\N	\N	2	2	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2145	Straight Shank Drill	Ø9.2	\N	\N	5	5	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2146	Straight Shank Drill	Ø9.3	\N	\N	5	5	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2147	Straight Shank Drill	Ø9.4	\N	\N	10	10	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2148	Straight Shank Drill	Ø9.5	\N	\N	19	19	A9	\N	\N	653	BIN CARD	CONSUMABLES	\N	Tools	Drills
2149	Straight Shank Drill	Ø9.6	\N	\N	16	16	A9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2150	Straight Shank Drill	Ø9.7	\N	\N	6	6	A9	\N	\N	1250	BIN CARD	CONSUMABLES	\N	Tools	Drills
2151	Straight Shank Drill	Ø9.8	\N	\N	15	15	A10	\N	\N	1250	BIN CARD	CONSUMABLES	\N	Tools	Drills
2152	Straight Shank Drill	Ø9.9	\N	\N	11	11	A10	\N	\N	1250	BIN CARD	CONSUMABLES	\N	Tools	Drills
2153	Straight Shank Drill	Ø10.0	\N	\N	25	25	A10	\N	\N	1903	BIN CARD	CONSUMABLES	\N	Tools	Drills
2154	Straight Shank Drill	Ø10.1	\N	\N	4	4	A10	\N	\N	1074	BIN CARD	CONSUMABLES	\N	Tools	Drills
2155	Straight Shank Drill	Ø10.2	\N	\N	4	4	A10	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2156	Straight Shank Drill	Ø10.3	\N	\N	4	4	A10	\N	\N	1440	BIN CARD	CONSUMABLES	\N	Tools	Drills
2157	Straight Shank Drill	Ø10.4	\N	\N	1	1	A10	\N	\N	1414	BIN CARD	CONSUMABLES	\N	Tools	Drills
2158	Straight Shank Drill	Ø10.5	\N	\N	9	9	A10	\N	\N	2218	BIN CARD	CONSUMABLES	\N	Tools	Drills
2159	Straight Shank Drill	Ø10.6	\N	\N	5	5	A10	\N	\N	1320	BIN CARD	CONSUMABLES	\N	Tools	Drills
2160	Straight Shank Drill	Ø10.7	\N	\N	6	6	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2161	Straight Shank Drill	Ø10.8	\N	\N	7	7	A10	\N	\N	1207	BIN CARD	CONSUMABLES	\N	Tools	Drills
2162	Straight Shank Drill	Ø10.9	\N	\N	5	5	A10	\N	\N	1207	BIN CARD	CONSUMABLES	\N	Tools	Drills
2163	Straight Shank Drill	Ø11.0	\N	\N	13	13	A10	\N	\N	2025	BIN CARD	CONSUMABLES	\N	Tools	Drills
2164	Straight Shank Drill	Ø11.1	\N	\N	4	4	A10	\N	\N	1342	BIN CARD	CONSUMABLES	\N	Tools	Drills
2165	Straight Shank Drill	Ø11.2	\N	\N	6	6	A10	\N	\N	1342	BIN CARD	CONSUMABLES	\N	Tools	Drills
2166	Straight Shank Drill	Ø11.3	\N	\N	6	6	A10	\N	\N	1984	BIN CARD	CONSUMABLES	\N	Tools	Drills
2167	Straight Shank Drill	Ø11.4	\N	\N	7	7	A10	\N	\N	1984	BIN CARD	CONSUMABLES	\N	Tools	Drills
2168	Straight Shank Drill	Ø11.5	\N	\N	14	14	A10	\N	\N	2537	BIN CARD	CONSUMABLES	\N	Tools	Drills
2169	Straight Shank Drill	Ø11.6	\N	\N	4	4	A10	\N	\N	1417	BIN CARD	CONSUMABLES	\N	Tools	Drills
2170	Straight Shank Drill	Ø11.7	\N	\N	5	5	A10	\N	\N	435	BIN CARD	CONSUMABLES	\N	Tools	Drills
2171	Straight Shank Drill	Ø11.8	\N	\N	14	14	A10	\N	\N	435	BIN CARD	CONSUMABLES	\N	Tools	Drills
2172	Straight Shank Drill	Ø11.9	\N	\N	10	10	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2173	Straight Shank Drill	Ø12.0	\N	\N	26	26	A10	\N	\N	1196	BIN CARD	CONSUMABLES	\N	Tools	Drills
2174	Straight Shank Drill	Ø12.1	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2175	Straight Shank Drill	Ø12.2	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2176	Straight Shank Drill	Ø12.3	\N	\N	1	1	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2177	Straight Shank Drill	Ø12.4	\N	\N	5	5	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2178	Straight Shank Drill	Ø12.5	\N	\N	19	19	A10	\N	\N	1268	BIN CARD	CONSUMABLES	\N	Tools	Drills
2179	Straight Shank Drill	Ø12.6	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2180	Straight Shank Drill	Ø12.7	\N	\N	1	1	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2181	Straight Shank Drill	Ø12.8	\N	\N	7	7	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2182	Straight Shank Drill	Ø12.9	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2183	Straight Shank Drill	Ø13.0	\N	\N	9	9	A10	\N	\N	1397	BIN CARD	CONSUMABLES	\N	Tools	Drills
2184	Straight Shank Drill	Ø13.1	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2185	Straight Shank Drill	Ø13.2	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2186	Straight Shank Drill	Ø13.3	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2187	Straight Shank Drill	Ø13.4	\N	\N	1	1	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2188	Straight Shank Drill	Ø13.5	\N	\N	6	6	A10	\N	\N	1773	BIN CARD	CONSUMABLES	\N	Tools	Drills
2189	Straight Shank Drill	Ø13.6	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2190	Straight Shank Drill	Ø13.7	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2191	Straight Shank Drill	Ø13.8	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2192	Straight Shank Drill	Ø13.9	\N	\N	0	0	A10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2193	Straight Shank Drill	Ø14.0	\N	\N	3	3	A11	\N	\N	1924	BIN CARD	CONSUMABLES	\N	Tools	Drills
2194	Straight Shank Drill	Ø14.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2195	Straight Shank Drill	Ø14.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2196	Straight Shank Drill	Ø14.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2197	Straight Shank Drill	Ø14.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2198	Straight Shank Drill	Ø14.5	\N	\N	5	5	A11	\N	\N	2019	BIN CARD	CONSUMABLES	\N	Tools	Drills
2199	Straight Shank Drill	Ø14.6	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2200	Straight Shank Drill	Ø14.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2201	Straight Shank Drill	Ø14.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2202	Straight Shank Drill	Ø14.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2203	Straight Shank Drill	Ø15.0	\N	\N	8	8	A11	\N	\N	2175	BIN CARD	CONSUMABLES	\N	Tools	Drills
2204	Straight Shank Drill	Ø15.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2205	Straight Shank Drill	Ø15.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2206	Straight Shank Drill	Ø15.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2207	Straight Shank Drill	Ø15.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2208	Straight Shank Drill	Ø15.5	\N	\N	5	5	A11	\N	\N	2357	BIN CARD	CONSUMABLES	\N	Tools	Drills
2209	Straight Shank Drill	Ø15.6	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2210	Straight Shank Drill	Ø15.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2211	Straight Shank Drill	Ø15.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2212	Straight Shank Drill	Ø15.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2213	Straight Shank Drill	Ø16.0	\N	\N	9	9	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2214	Straight Shank Drill	Ø16.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2215	Straight Shank Drill	Ø16.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2216	Straight Shank Drill	Ø16.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2217	Straight Shank Drill	Ø16.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2218	Straight Shank Drill	Ø16.5	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2219	Straight Shank Drill	Ø16.6	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2220	Straight Shank Drill	Ø16.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2221	Straight Shank Drill	Ø16.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2222	Straight Shank Drill	Ø16.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2223	Straight Shank Drill	Ø17.0	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2224	Straight Shank Drill	Ø17.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2225	Straight Shank Drill	Ø17.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2226	Straight Shank Drill	Ø17.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2227	Straight Shank Drill	Ø17.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2228	Straight Shank Drill	Ø17.5	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2229	Straight Shank Drill	Ø17.6	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2230	Straight Shank Drill	Ø17.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2231	Straight Shank Drill	Ø17.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2232	Straight Shank Drill	Ø17.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2233	Straight Shank Drill	Ø18.0	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2234	Straight Shank Drill	Ø18.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2235	Straight Shank Drill	Ø18.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2236	Straight Shank Drill	Ø18.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2237	Straight Shank Drill	Ø18.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2238	Straight Shank Drill	Ø18.5	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2239	Straight Shank Drill	Ø18.6	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2240	Straight Shank Drill	Ø18.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2241	Straight Shank Drill	Ø18.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2242	Straight Shank Drill	Ø18.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2243	Straight Shank Drill	Ø19.0	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2244	Straight Shank Drill	Ø19.1	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2245	Straight Shank Drill	Ø19.2	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2246	Straight Shank Drill	Ø19.3	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2247	Straight Shank Drill	Ø19.4	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2248	Straight Shank Drill	Ø19.5	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2249	Straight Shank Drill	Ø19.6	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2250	Straight Shank Drill	Ø19.7	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2251	Straight Shank Drill	Ø19.8	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2252	Straight Shank Drill	Ø19.9	\N	\N	0	0	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2253	Straight Shank Drill	Ø20.0	\N	\N	3	3	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2254	Straight Shank Drill (Long Series)	Ø3.2	\N	\N	7	7	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2255	Straight Shank Drill (Long Series)	Ø4.0	\N	\N	4	4	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2256	Straight Shank Drill (Long Series)	Ø5.0	\N	\N	1	1	A13	\N	\N	480	BIN CARD	CONSUMABLES	\N	Tools	Drills
2257	Straight Shank Drill (Long Series)	Ø6.0	\N	\N	4	4	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2258	Straight Shank Drill (Long Series)	Ø6.5	\N	\N	5	5	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2259	Straight Shank Drill (Long Series)	Ø8.0	\N	\N	12	12	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2260	Straight Shank Drill (Long Series)	Ø10.0	\N	\N	14	14	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2261	Straight Shank Drill (Long Series)	Ø11.0	\N	\N	5	5	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2262	Straight Shank Drill (Long Series)	Ø12.0	\N	\N	1	1	A13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2263	Straight Shank Drill (Solid Carbide)	Ø3.0	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2264	Straight Shank Drill (Solid Carbide)	Ø4.2	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2265	Straight Shank Drill (Solid Carbide)	Ø5.0	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2266	Straight Shank Drill (Solid Carbide)	Ø5.8	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2267	Straight Shank Drill (Solid Carbide)	Ø6.0	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2268	Straight Shank Drill (Solid Carbide)	Ø8.5	\N	\N	1	1	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2269	Straight Shank Drill (Solid Carbide)	Ø9.8	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2270	Straight Shank Drill (Carbide Tipped)	Ø3.0	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2271	Straight Shank Drill (Carbide Tipped)	Ø5.0	\N	\N	2	2	A11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2272	T - Slot Cutter	Ø13.5 × 4	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2273	T - Slot Cutter	Ø16 × 8	\N	\N	5	5	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2274	T - Slot Cutter	Ø16.5 × 3	\N	\N	10	10	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2275	T - Slot Cutter	Ø16.5 × 4	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2276	T - Slot Cutter	Ø17 × 7	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2277	T - Slot Cutter	Ø17 × 8	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2278	T - Slot Cutter	Ø18 × 8	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2279	T - Slot Cutter	Ø19.5 × 6	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2280	T - Slot Cutter	Ø19.5 × 8	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2281	T - Slot Cutter	Ø21 × 8	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2282	T - Slot Cutter	Ø21 × 9	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2283	T - Slot Cutter	Ø24.5 × 10	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2284	T - Slot Cutter	Ø25 × 5	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2285	T - Slot Cutter	Ø25 × 6	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2286	T - Slot Cutter	Ø25 × 8	\N	\N	3	3	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2287	T - Slot Cutter	Ø25 × 10	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2288	T - Slot Cutter	Ø25 × 11	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2289	T - Slot Cutter	Ø29 × 12	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2290	T - Slot Cutter	Ø32 × 12	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2291	T - Slot Cutter	Ø32 × 14	\N	\N	3	3	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2292	T - Slot Cutter	Ø40 × 8	\N	\N	3	3	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2293	T - Slot Cutter	Ø40 × 10	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Milling Cutters
2294	Strap Clamp	M12 × 100	\N	\N	6	6	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2295	Strap Clamp	M12 × 125	\N	\N	12	12	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2296	Strap Clamp	M16 × 125	\N	\N	5	5	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2297	Strap Clamp	M16 × 150	\N	\N	8	8	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2298	U - Strap Clamp	M12	\N	\N	10	10	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2299	U - Strap Clamp	M16	\N	\N	10	10	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2300	Goose Neck Clamp	M12 × 125	\N	\N	19	19	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2301	Goose Neck Clamp	M16 × 150	\N	\N	20	20	Wood RACK	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2302	Tap Extention	\N	\N	\N	4	4	A17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Taps & Dies
2303	Tap Wrench	\N	\N	\N	51	51	A17	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
2304	Morse Taper Gauge	MT 0	WS - G0087	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2305	Morse Taper Gauge	MT 0	WS - G0088	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2306	Morse Taper Gauge	MT 1	WS - G0090	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2307	Morse Taper Gauge	MT 1	WS - G0091	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2308	Morse Taper Gauge	MT 2	WS - G0092	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2309	Morse Taper Gauge	MT 4	WS - G0099	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2310	Morse Taper Gauge	MT 5	WS - G0100	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2311	Morse Taper Gauge ( Female )	MT 2	WS - G0106	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2312	Morse Taper Gauge ( Female )	MT 3	WS - G0107	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2313	Morse Taper Gauge ( Female )	MT 4	WS - G0105	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2314	Metric Taper Gauge	Metric 12	WS - G0089	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2315	Metric Taper Gauge	Metric 18	WS - G0094	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2316	Metric Taper Gauge	Metric 24	WS - G0095	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2317	Metric Taper Gauge	Metric 32	WS - G0101	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2318	Metric Taper Gauge	Metric 40	WS - G0103	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2319	Metric Taper Gauge	Metric 40	WS - G0102	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2320	Metric Taper Gauge	Metric 50	WS - G0104	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2321	Taper Ratio Gauges	1 : 50 (Ø 53.12 )	\N	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2322	Taper Ratio Gauges	1 : 5 (Ø 50.4)	\N	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2323	Taper Ratio Gauges	1 : 50 (Ø 53.44 )	\N	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2324	ISO Taper Gauges ( Male )	ISO 40	\N	\N	0	0	TC - 03	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2325	Taper Plug Gauge	20°	\N	\N	0	0	Sadashiva (UPE)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Taper Gauges
2326	Mandrel	Ø 3.5	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2327	Mandrel	Ø 4	\N	\N	1	1	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2328	Mandrel	Ø 4.5	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2329	Mandrel	Ø 5.5	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2330	Mandrel	Ø 6	\N	\N	5	5	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2331	Mandrel	Ø 7	\N	\N	3	3	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2332	Mandrel	Ø 8	\N	\N	4	4	H5	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2333	Mandrel	Ø 9	\N	\N	3	3	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2334	Mandrel	Ø 10	\N	\N	5	5	H5	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2335	Mandrel	Ø 11	\N	\N	2	2	H5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2336	Mandrel	Ø 12	\N	\N	4	4	G11	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2337	Mandrel	Ø 13	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2338	Mandrel	Ø 14	\N	\N	3	3	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2339	Mandrel	Ø 15	\N	\N	4	4	G11	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2340	Mandrel	Ø 16	\N	\N	3	3	G11	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2341	Mandrel	Ø 17	\N	\N	3	3	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2342	Mandrel	Ø 18	\N	\N	4	4	G11	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2343	Mandrel	Ø 19	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2344	Mandrel	Ø 20	\N	\N	3	3	G11	\N	\N	230	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2345	Mandrel	Ø 21	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2346	Mandrel	Ø 22	\N	\N	5	5	G11	\N	\N	250	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2347	Mandrel	Ø 23	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2348	Mandrel	Ø 24	\N	\N	4	4	G11	\N	\N	250	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2349	Mandrel	Ø 25	\N	\N	4	4	G11	\N	\N	250	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2350	Mandrel	Ø 26	\N	\N	4	4	G11	\N	\N	500	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2351	Mandrel	Ø 27	\N	\N	3	3	G11	\N	\N	250	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2352	Mandrel	Ø 28	\N	\N	4	4	G11	\N	\N	500	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2353	Mandrel	Ø 30	\N	\N	4	4	G11	\N	\N	500	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2354	Mandrel	Ø 32	\N	\N	8	8	G11	\N	\N	560	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2355	Mandrel	Ø 34	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2356	Mandrel	Ø 35	\N	\N	4	4	G11	\N	\N	560	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2357	Mandrel	Ø 36	\N	\N	2	2	G11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2358	Mandrel	Ø 38	\N	\N	4	4	G11	\N	\N	560	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2359	Mandrel	Ø 40	\N	\N	2	2	G11	\N	\N	280	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2360	Mandrel	Ø 42	\N	\N	4	4	G12	\N	\N	600	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2361	Mandrel	Ø 44	\N	\N	2	2	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2362	Mandrel	Ø 45	\N	\N	4	4	G12	\N	\N	600	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2363	Mandrel	Ø 46	\N	\N	4	4	G12	\N	\N	600	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2364	Mandrel	Ø 48	\N	\N	4	4	G12	\N	\N	600	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2365	Mandrel	Ø 50	\N	\N	5	5	G12	\N	\N	600	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2366	Mandrel	Ø 50.5	\N	\N	1	1	G18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2367	Mandrel	Ø 52	\N	\N	3	3	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2368	Mandrel	Ø 55	\N	\N	3	3	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2369	Mandrel	Ø 56	\N	\N	3	3	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2370	Mandrel	Ø 58	\N	\N	2	2	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2371	Mandrel	Ø 60	\N	\N	3	3	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2372	Mandrel	Ø 62	\N	\N	3	3	G18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2373	Mandrel	Ø 63	\N	\N	1	1	G18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2374	Mandrel	Ø 65	\N	\N	4	4	G18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2375	Mandrel	Ø 68	\N	\N	2	2	G18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2376	Mandrel	Ø 70	\N	\N	2	2	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2377	Mandrel	Ø 72	\N	\N	5	5	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2378	Mandrel	Ø 75	\N	\N	2	2	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2379	Mandrel	Ø 78	\N	\N	2	2	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2380	Mandrel	Ø 80	\N	\N	2	2	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2381	Mandrel	Ø 82	\N	\N	2	2	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2382	Mandrel	Ø 85	\N	\N	2	2	G12	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2383	Mandrel	Ø 88	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2384	Mandrel	Ø 90	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2385	Mandrel	Ø 91	\N	\N	1	1	G17	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2386	Mandrel	Ø 92	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2387	Mandrel	Ø 95	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2388	Mandrel	Ø 98	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2389	Mandrel	Ø 100	\N	\N	2	2	G16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2390	Mandrel	Ø40 × Ø60 × 600	123.2538.01	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
2391	Taper Shank Drill	Ø3.0	\N	\N	5	5	C1	\N	\N	150	BIN CARD	CONSUMABLES	\N	Tools	Drills
2392	Taper Shank Drill	Ø3.1	\N	\N	1	1	C1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2393	Taper Shank Drill	Ø3.2	\N	\N	21	21	C1	\N	\N	1180	BIN CARD	CONSUMABLES	\N	Tools	Drills
2394	Taper Shank Drill	Ø3.3	\N	\N	24	24	C1	\N	\N	2250	BIN CARD	CONSUMABLES	\N	Tools	Drills
2395	Taper Shank Drill	Ø3.4	\N	\N	4	4	C1	\N	\N	400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2396	Taper Shank Drill	Ø3.5	\N	\N	11	11	C1	\N	\N	200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2397	Taper Shank Drill	Ø3.6	\N	\N	4	4	C1	\N	\N	440	BIN CARD	CONSUMABLES	\N	Tools	Drills
2398	Taper Shank Drill	Ø3.7	\N	\N	14	14	C1	\N	\N	440	BIN CARD	CONSUMABLES	\N	Tools	Drills
2399	Taper Shank Drill	Ø3.8	\N	\N	4	4	C1	\N	\N	360	BIN CARD	CONSUMABLES	\N	Tools	Drills
2400	Taper Shank Drill	Ø3.9	\N	\N	9	9	C1	\N	\N	380	BIN CARD	CONSUMABLES	\N	Tools	Drills
2401	Taper Shank Drill	Ø4.0	\N	\N	8	8	C1	\N	\N	4695	BIN CARD	CONSUMABLES	\N	Tools	Drills
2402	Taper Shank Drill	Ø4.1	\N	\N	6	6	C1	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2403	Taper Shank Drill	Ø4.2	\N	\N	23	23	C1	\N	\N	1990	BIN CARD	CONSUMABLES	\N	Tools	Drills
2404	Taper Shank Drill	Ø4.3	\N	\N	9	9	C1	\N	\N	550	BIN CARD	CONSUMABLES	\N	Tools	Drills
2405	Taper Shank Drill	Ø4.4	\N	\N	0	0	C1	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2406	Taper Shank Drill	Ø4.5	\N	\N	6	6	C1	\N	\N	1115	BIN CARD	CONSUMABLES	\N	Tools	Drills
2407	Taper Shank Drill	Ø4.6	\N	\N	3	3	C12	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2408	Taper Shank Drill	Ø4.7	\N	\N	7	7	C12	\N	\N	650	BIN CARD	CONSUMABLES	\N	Tools	Drills
2409	Taper Shank Drill	Ø4.8	\N	\N	4	4	C12	\N	\N	500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2410	Taper Shank Drill	Ø4.9	\N	\N	1	1	C12	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2411	Taper Shank Drill	Ø5.0	\N	\N	37	37	C12	\N	\N	5880	BIN CARD	CONSUMABLES	\N	Tools	Drills
2412	Taper Shank Drill	Ø5.1	\N	\N	7	7	C12	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2413	Taper Shank Drill	Ø5.2	\N	\N	7	7	C12	\N	\N	400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2414	Taper Shank Drill	Ø5.3	\N	\N	6	6	C12	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2415	Taper Shank Drill	Ø5.4	\N	\N	11	11	C12	\N	\N	1450	BIN CARD	CONSUMABLES	\N	Tools	Drills
2416	Taper Shank Drill	Ø5.5	\N	\N	7	7	C12	\N	\N	1215	BIN CARD	CONSUMABLES	\N	Tools	Drills
2417	Taper Shank Drill	Ø5.6	\N	\N	9	9	C12	\N	\N	750	BIN CARD	CONSUMABLES	\N	Tools	Drills
2418	Taper Shank Drill	Ø5.7	\N	\N	5	5	C12	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2419	Taper Shank Drill	Ø5.8	\N	\N	12	12	C23	\N	\N	400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2420	Taper Shank Drill	Ø5.9	\N	\N	3	3	C23	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2421	Taper Shank Drill	Ø6.0	\N	\N	14	14	C23	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2422	Taper Shank Drill	Ø6.1	\N	\N	19	19	C23	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2423	Taper Shank Drill	Ø6.2	\N	\N	11	11	C23	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2424	Taper Shank Drill	Ø6.3	\N	\N	8	8	C23	\N	\N	550	BIN CARD	CONSUMABLES	\N	Tools	Drills
2425	Taper Shank Drill	Ø6.4	\N	\N	14	14	C23	\N	\N	400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2426	Taper Shank Drill	Ø6.5	\N	\N	12	12	C23	\N	\N	1700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2427	Taper Shank Drill	Ø6.6	\N	\N	1	1	C23	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2428	Taper Shank Drill	Ø6.7	\N	\N	8	8	C23	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2429	Taper Shank Drill	Ø6.8	\N	\N	28	28	C23	\N	\N	3180	BIN CARD	CONSUMABLES	\N	Tools	Drills
2430	Taper Shank Drill	Ø6.9	\N	\N	8	8	C23	\N	\N	750	BIN CARD	CONSUMABLES	\N	Tools	Drills
2431	Taper Shank Drill	Ø7.0	\N	\N	12	12	C23	\N	\N	950	BIN CARD	CONSUMABLES	\N	Tools	Drills
2432	Taper Shank Drill	Ø7.1	\N	\N	6	6	C23	\N	\N	400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2433	Taper Shank Drill	Ø7.2	\N	\N	15	15	C23	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2434	Taper Shank Drill	Ø7.3	\N	\N	7	7	C24	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2435	Taper Shank Drill	Ø7.4	\N	\N	9	9	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2436	Taper Shank Drill	Ø7.5	\N	\N	7	7	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2437	Taper Shank Drill	Ø7.6	\N	\N	5	5	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2438	Taper Shank Drill	Ø7.7	\N	\N	8	8	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2439	Taper Shank Drill	Ø7.8	\N	\N	8	8	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2440	Taper Shank Drill	Ø7.9	\N	\N	5	5	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2441	Taper Shank Drill	Ø8.0	\N	\N	9	9	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2442	Taper Shank Drill	Ø8.1	\N	\N	7	7	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2443	Taper Shank Drill	Ø8.2	\N	\N	13	13	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2444	Taper Shank Drill	Ø8.3	\N	\N	5	5	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2445	Taper Shank Drill	Ø8.4	\N	\N	7	7	C24	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2446	Taper Shank Drill	Ø8.5	\N	\N	22	22	C24	\N	\N	2200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2447	Taper Shank Drill	Ø8.6	\N	\N	3	3	C13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2448	Taper Shank Drill	Ø8.7	\N	\N	11	11	C13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2449	Taper Shank Drill	Ø8.8	\N	\N	9	9	C13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2450	Taper Shank Drill	Ø8.9	\N	\N	3	3	C13	\N	\N	2725	BIN CARD	CONSUMABLES	\N	Tools	Drills
2451	Taper Shank Drill	Ø9.0	\N	\N	12	12	C13	\N	\N	235	BIN CARD	CONSUMABLES	\N	Tools	Drills
2452	Taper Shank Drill	Ø9.1	\N	\N	4	4	C13	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2453	Taper Shank Drill	Ø9.2	\N	\N	5	5	C13	\N	\N	550	BIN CARD	CONSUMABLES	\N	Tools	Drills
2454	Taper Shank Drill	Ø9.3	\N	\N	13	13	C13	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2455	Taper Shank Drill	Ø9.4	\N	\N	6	6	C13	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2456	Taper Shank Drill	Ø9.5	\N	\N	12	12	C13	\N	\N	1455	BIN CARD	CONSUMABLES	\N	Tools	Drills
2457	Taper Shank Drill	Ø9.6	\N	\N	3	3	C13	\N	\N	650	BIN CARD	CONSUMABLES	\N	Tools	Drills
2458	Taper Shank Drill	Ø9.7	\N	\N	6	6	C13	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2459	Taper Shank Drill	Ø9.8	\N	\N	8	8	C13	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2460	Taper Shank Drill	Ø9.9	\N	\N	8	8	C13	\N	\N	2140	BIN CARD	CONSUMABLES	\N	Tools	Drills
2461	Taper Shank Drill	Ø10.0	\N	\N	15	15	C2	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2462	Taper Shank Drill	Ø10.1	\N	\N	4	4	C2	\N	\N	1574	BIN CARD	CONSUMABLES	\N	Tools	Drills
2463	Taper Shank Drill	Ø10.2	\N	\N	20	20	C2	\N	\N	1480	BIN CARD	CONSUMABLES	\N	Tools	Drills
2464	Taper Shank Drill	Ø10.3	\N	\N	21	21	C2	\N	\N	2085	BIN CARD	CONSUMABLES	\N	Tools	Drills
2465	Taper Shank Drill	Ø10.4	\N	\N	4	4	C2	\N	\N	850	BIN CARD	CONSUMABLES	\N	Tools	Drills
2466	Taper Shank Drill	Ø10.5	\N	\N	15	15	C2	\N	\N	550	BIN CARD	CONSUMABLES	\N	Tools	Drills
2467	Taper Shank Drill	Ø10.6	\N	\N	8	8	C2	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2468	Taper Shank Drill	Ø10.7	\N	\N	12	12	C2	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2469	Taper Shank Drill	Ø10.8	\N	\N	4	4	C2	\N	\N	1312	BIN CARD	CONSUMABLES	\N	Tools	Drills
2470	Taper Shank Drill	Ø10.9	\N	\N	4	4	C2	\N	\N	1740	BIN CARD	CONSUMABLES	\N	Tools	Drills
2471	Taper Shank Drill	Ø11.0	\N	\N	17	17	C2	\N	\N	5185	BIN CARD	CONSUMABLES	\N	Tools	Drills
2472	Taper Shank Drill	Ø11.1	\N	\N	3	3	C2	\N	\N	712	BIN CARD	CONSUMABLES	\N	Tools	Drills
2473	Taper Shank Drill	Ø11.2	\N	\N	5	5	C2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2474	Taper Shank Drill	Ø11.3	\N	\N	7	7	C2	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2475	Taper Shank Drill	Ø11.4	\N	\N	9	9	C3	\N	\N	920	BIN CARD	CONSUMABLES	\N	Tools	Drills
2476	Taper Shank Drill	Ø11.5	\N	\N	11	11	C3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2477	Taper Shank Drill	Ø11.6	\N	\N	11	11	C3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2478	Taper Shank Drill	Ø11.7	\N	\N	7	7	C3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2479	Taper Shank Drill	Ø11.8	\N	\N	9	9	C3	\N	\N	1790	BIN CARD	CONSUMABLES	\N	Tools	Drills
2480	Taper Shank Drill	Ø11.9	\N	\N	13	13	C3	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2481	Taper Shank Drill	Ø12.0	\N	\N	15	15	C3	\N	\N	1845	BIN CARD	CONSUMABLES	\N	Tools	Drills
2482	Taper Shank Drill	Ø12.1	\N	\N	5	5	C3	\N	\N	2110	BIN CARD	CONSUMABLES	\N	Tools	Drills
2483	Taper Shank Drill	Ø12.2	\N	\N	8	8	C3	\N	\N	1384	BIN CARD	CONSUMABLES	\N	Tools	Drills
2484	Taper Shank Drill	Ø12.25	\N	\N	8	8	C3	\N	\N	4594	BIN CARD	CONSUMABLES	\N	Tools	Drills
2485	Taper Shank Drill	Ø12.3	\N	\N	6	6	C3	\N	\N	1530	BIN CARD	CONSUMABLES	\N	Tools	Drills
2486	Taper Shank Drill	Ø12.4	\N	\N	4	4	C3	\N	\N	938	BIN CARD	CONSUMABLES	\N	Tools	Drills
2487	Taper Shank Drill	Ø12.5	\N	\N	8	8	C3	\N	\N	1294	BIN CARD	CONSUMABLES	\N	Tools	Drills
2488	Taper Shank Drill	Ø12.6	\N	\N	8	8	C14	\N	\N	1565	BIN CARD	CONSUMABLES	\N	Tools	Drills
2489	Taper Shank Drill	Ø12.7	\N	\N	9	9	C14	\N	\N	1994	BIN CARD	CONSUMABLES	\N	Tools	Drills
2490	Taper Shank Drill	Ø12.8	\N	\N	8	8	C14	\N	\N	1674	BIN CARD	CONSUMABLES	\N	Tools	Drills
2491	Taper Shank Drill	Ø12.9	\N	\N	9	9	C14	\N	\N	1530	BIN CARD	CONSUMABLES	\N	Tools	Drills
2492	Taper Shank Drill	Ø13.0	\N	\N	9	9	C14	\N	\N	189	BIN CARD	CONSUMABLES	\N	Tools	Drills
2493	Taper Shank Drill	Ø13.1	\N	\N	7	7	C14	\N	\N	235	BIN CARD	CONSUMABLES	\N	Tools	Drills
2494	Taper Shank Drill	Ø13.2	\N	\N	9	9	C14	\N	\N	3200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2495	Taper Shank Drill	Ø13.3	\N	\N	7	7	C14	\N	\N	938	BIN CARD	CONSUMABLES	\N	Tools	Drills
2496	Taper Shank Drill	Ø13.4	\N	\N	11	11	C14	\N	\N	135	BIN CARD	CONSUMABLES	\N	Tools	Drills
2497	Taper Shank Drill	Ø13.5	\N	\N	11	11	C14	\N	\N	3968	BIN CARD	CONSUMABLES	\N	Tools	Drills
2498	Taper Shank Drill	Ø13.6	\N	\N	5	5	C14	\N	\N	2644	BIN CARD	CONSUMABLES	\N	Tools	Drills
2499	Taper Shank Drill	Ø13.7	\N	\N	3	3	C14	\N	\N	3544	BIN CARD	CONSUMABLES	\N	Tools	Drills
2500	Taper Shank Drill	Ø13.8	\N	\N	10	10	C25	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2501	Taper Shank Drill	Ø13.9	\N	\N	9	9	C25	\N	\N	1444	BIN CARD	CONSUMABLES	\N	Tools	Drills
2502	Taper Shank Drill	Ø14.0	\N	\N	24	24	C25	\N	\N	7293	BIN CARD	CONSUMABLES	\N	Tools	Drills
2503	Taper Shank Drill	Ø14.1	\N	\N	6	6	C25	\N	\N	2328	BIN CARD	CONSUMABLES	\N	Tools	Drills
2504	Taper Shank Drill	Ø14.2	\N	\N	11	11	C25	\N	\N	2328	BIN CARD	CONSUMABLES	\N	Tools	Drills
2505	Taper Shank Drill	Ø14.25	\N	\N	5	5	C25	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2506	Taper Shank Drill	Ø14.3	\N	\N	6	6	C25	\N	\N	4220	BIN CARD	CONSUMABLES	\N	Tools	Drills
2507	Taper Shank Drill	Ø14.4	\N	\N	0	0	C25	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2508	Taper Shank Drill	Ø14.5	\N	\N	11	11	C25	\N	\N	1290	BIN CARD	CONSUMABLES	\N	Tools	Drills
2509	Taper Shank Drill	Ø14.6	\N	\N	6	6	C25	\N	\N	3920	BIN CARD	CONSUMABLES	\N	Tools	Drills
2510	Taper Shank Drill	Ø14.68	\N	\N	1	1	C25	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2511	Taper Shank Drill	Ø14.7	\N	\N	2	2	C25	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2512	Taper Shank Drill	Ø14.75	\N	\N	5	5	C25	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2513	Taper Shank Drill	Ø14.8	\N	\N	7	7	C26	\N	\N	1900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2514	Taper Shank Drill	Ø14.9	\N	\N	4	4	C26	\N	\N	3470	BIN CARD	CONSUMABLES	\N	Tools	Drills
2515	Taper Shank Drill	Ø15.0	\N	\N	13	13	C26	\N	\N	2820	BIN CARD	CONSUMABLES	\N	Tools	Drills
2516	Taper Shank Drill	Ø15.1	\N	\N	4	4	C26	\N	\N	3634	BIN CARD	CONSUMABLES	\N	Tools	Drills
2517	Taper Shank Drill	Ø15.2	\N	\N	4	4	C26	\N	\N	240	BIN CARD	CONSUMABLES	\N	Tools	Drills
2518	Taper Shank Drill	Ø15.3	\N	\N	4	4	C26	\N	\N	950	BIN CARD	CONSUMABLES	\N	Tools	Drills
2519	Taper Shank Drill	Ø15.4	\N	\N	3	3	C26	\N	\N	90	BIN CARD	CONSUMABLES	\N	Tools	Drills
2520	Taper Shank Drill	Ø15.5	\N	\N	22	22	C26	\N	\N	7748	BIN CARD	CONSUMABLES	\N	Tools	Drills
2521	Taper Shank Drill	Ø15.6	\N	\N	7	7	C26	\N	\N	3511	BIN CARD	CONSUMABLES	\N	Tools	Drills
2522	Taper Shank Drill	Ø15.7	\N	\N	2	2	C26	\N	\N	1180	BIN CARD	CONSUMABLES	\N	Tools	Drills
2523	Taper Shank Drill	Ø15.75	\N	\N	17	17	C26	\N	\N	3200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2524	Taper Shank Drill	Ø15.8	\N	\N	4	4	C26	\N	\N	1530	BIN CARD	CONSUMABLES	\N	Tools	Drills
2525	Taper Shank Drill	Ø15.9	\N	\N	6	6	C15	\N	\N	938	BIN CARD	CONSUMABLES	\N	Tools	Drills
2526	Taper Shank Drill	Ø16.0	\N	\N	20	20	C15	\N	\N	8007	BIN CARD	CONSUMABLES	\N	Tools	Drills
2527	Taper Shank Drill	Ø16.1	\N	\N	3	3	C15	\N	\N	135	BIN CARD	CONSUMABLES	\N	Tools	Drills
2528	Taper Shank Drill	Ø16.2	\N	\N	3	3	C15	\N	\N	402	BIN CARD	CONSUMABLES	\N	Tools	Drills
2529	Taper Shank Drill	Ø16.25	\N	\N	6	6	C15	\N	\N	3200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2530	Taper Shank Drill	Ø16.3	\N	\N	6	6	C15	\N	\N	1250	BIN CARD	CONSUMABLES	\N	Tools	Drills
2531	Taper Shank Drill	Ø16.4	\N	\N	3	3	C15	\N	\N	1180	BIN CARD	CONSUMABLES	\N	Tools	Drills
2532	Taper Shank Drill	Ø16.5	\N	\N	9	9	C15	\N	\N	5057	BIN CARD	CONSUMABLES	\N	Tools	Drills
2533	Taper Shank Drill	Ø16.6	\N	\N	3	3	C15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2534	Taper Shank Drill	Ø16.7	\N	\N	4	4	C15	\N	\N	1530	BIN CARD	CONSUMABLES	\N	Tools	Drills
2535	Taper Shank Drill	Ø16.8	\N	\N	4	4	C15	\N	\N	752	BIN CARD	CONSUMABLES	\N	Tools	Drills
2536	Taper Shank Drill	Ø16.9	\N	\N	3	3	C15	\N	\N	189	BIN CARD	CONSUMABLES	\N	Tools	Drills
2537	Taper Shank Drill	Ø17.0	\N	\N	12	12	C4	\N	\N	4819	BIN CARD	CONSUMABLES	\N	Tools	Drills
2538	Taper Shank Drill	Ø17.1	\N	\N	1	1	C4	\N	\N	1180	BIN CARD	CONSUMABLES	\N	Tools	Drills
2539	Taper Shank Drill	Ø17.2	\N	\N	0	0	C4	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2540	Taper Shank Drill	Ø17.3	\N	\N	4	4	C4	\N	\N	1100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2541	Taper Shank Drill	Ø17.4	\N	\N	2	2	C4	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2542	Taper Shank Drill	Ø17.5	\N	\N	21	21	C4	\N	\N	6785	BIN CARD	CONSUMABLES	\N	Tools	Drills
2543	Taper Shank Drill	Ø17.6	\N	\N	5	5	C4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2544	Taper Shank Drill	Ø17.7	\N	\N	3	3	C4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2545	Taper Shank Drill	Ø17.75	\N	\N	3	3	C4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2546	Taper Shank Drill	Ø17.8	\N	\N	2	2	C4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2547	Taper Shank Drill	Ø17.9	\N	\N	2	2	C4	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2548	Taper Shank Drill	Ø18.0	\N	\N	15	15	C4	\N	\N	4912	BIN CARD	CONSUMABLES	\N	Tools	Drills
2549	Taper Shank Drill	Ø18.1	\N	\N	2	2	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2550	Taper Shank Drill	Ø18.25	\N	\N	6	6	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2551	Taper Shank Drill	Ø18.3	\N	\N	4	4	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2552	Taper Shank Drill	Ø18.4	\N	\N	3	3	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2553	Taper Shank Drill	Ø18.5	\N	\N	12	12	C5	\N	\N	1592	BIN CARD	CONSUMABLES	\N	Tools	Drills
2554	Taper Shank Drill	Ø18.6	\N	\N	1	1	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2555	Taper Shank Drill	Ø18.7	\N	\N	1	1	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2556	Taper Shank Drill	Ø18.75	\N	\N	15	15	C5	\N	\N	6720	BIN CARD	CONSUMABLES	\N	Tools	Drills
2557	Taper Shank Drill	Ø18.8	\N	\N	4	4	C5	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2558	Taper Shank Drill	Ø18.9	\N	\N	1	1	C5	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2559	Taper Shank Drill	Ø19.0	\N	\N	13	13	C5	\N	\N	2610	BIN CARD	CONSUMABLES	\N	Tools	Drills
2560	Taper Shank Drill	Ø19.1	\N	\N	0	0	C5	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2561	Taper Shank Drill	Ø19.2	\N	\N	3	3	C16	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2562	Taper Shank Drill	Ø19.25	\N	\N	4	4	C16	\N	\N	1100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2563	Taper Shank Drill	Ø19.3	\N	\N	3	3	C16	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2564	Taper Shank Drill	Ø19.4	\N	\N	6	6	C16	\N	\N	2100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2565	Taper Shank Drill	Ø19.5	\N	\N	12	12	C16	\N	\N	6422	BIN CARD	CONSUMABLES	\N	Tools	Drills
2566	Taper Shank Drill	Ø19.6	\N	\N	1	1	C16	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2567	Taper Shank Drill	Ø19.7	\N	\N	4	4	C16	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2568	Taper Shank Drill	Ø19.75	\N	\N	5	5	C16	\N	\N	7060	BIN CARD	CONSUMABLES	\N	Tools	Drills
2569	Taper Shank Drill	Ø19.8	\N	\N	1	1	C16	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2570	Taper Shank Drill	Ø19.9	\N	\N	0	0	C16	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2571	Taper Shank Drill	Ø20.0	\N	\N	10	10	C16	\N	\N	3320	BIN CARD	CONSUMABLES	\N	Tools	Drills
2572	Taper Shank Drill	Ø20.25	\N	\N	5	5	C16	\N	\N	3804	BIN CARD	CONSUMABLES	\N	Tools	Drills
2573	Taper Shank Drill	Ø20.50	\N	\N	6	6	C27	\N	\N	4224	BIN CARD	CONSUMABLES	\N	Tools	Drills
2574	Taper Shank Drill	Ø20.75	\N	\N	12	12	C27	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2575	Taper Shank Drill	Ø21.0	\N	\N	18	18	C27	\N	\N	6860	BIN CARD	CONSUMABLES	\N	Tools	Drills
2576	Taper Shank Drill	Ø21.25	\N	\N	4	4	C27	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2577	Taper Shank Drill	Ø21.50	\N	\N	5	5	C27	\N	\N	2515	BIN CARD	CONSUMABLES	\N	Tools	Drills
2578	Taper Shank Drill	Ø21.75	\N	\N	4	4	C27	\N	\N	4641	BIN CARD	CONSUMABLES	\N	Tools	Drills
2579	Taper Shank Drill	Ø22.0	\N	\N	8	8	C27	\N	\N	2233	BIN CARD	CONSUMABLES	\N	Tools	Drills
2580	Taper Shank Drill	Ø22.50	\N	\N	10	10	C27	\N	\N	2926	BIN CARD	CONSUMABLES	\N	Tools	Drills
2581	Taper Shank Drill	Ø22.75	\N	\N	2	2	C27	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2582	Taper Shank Drill	Ø23.0	\N	\N	7	7	C27	\N	\N	2948	BIN CARD	CONSUMABLES	\N	Tools	Drills
2583	Taper Shank Drill	Ø23.25	\N	\N	7	7	C27	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2584	Taper Shank Drill	Ø23.50	\N	\N	5	5	C27	\N	\N	2367	BIN CARD	CONSUMABLES	\N	Tools	Drills
2585	Taper Shank Drill	Ø23.75	\N	\N	4	4	C28	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2586	Taper Shank Drill	Ø24.0	\N	\N	7	7	C28	\N	\N	6429	BIN CARD	CONSUMABLES	\N	Tools	Drills
2587	Taper Shank Drill	Ø24.25	\N	\N	4	4	C28	\N	\N	1900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2588	Taper Shank Drill	Ø24.50	\N	\N	6	6	C28	\N	\N	3131	BIN CARD	CONSUMABLES	\N	Tools	Drills
2589	Taper Shank Drill	Ø24.75	\N	\N	6	6	C28	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2590	Taper Shank Drill	Ø25.0	\N	\N	13	13	C28	\N	\N	2995	BIN CARD	CONSUMABLES	\N	Tools	Drills
2591	Taper Shank Drill	Ø25.25	\N	\N	4	4	C28	\N	\N	1300	BIN CARD	CONSUMABLES	\N	Tools	Drills
2592	Taper Shank Drill	Ø25.50	\N	\N	5	5	C28	\N	\N	2897	BIN CARD	CONSUMABLES	\N	Tools	Drills
2593	Taper Shank Drill	Ø25.75	\N	\N	5	5	C28	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2594	Taper Shank Drill	Ø26.0	\N	\N	5	5	C28	\N	\N	6240	BIN CARD	CONSUMABLES	\N	Tools	Drills
2595	Taper Shank Drill	Ø26.25	\N	\N	5	5	C28	\N	\N	2400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2596	Taper Shank Drill	Ø26.50	\N	\N	11	11	C28	\N	\N	15493	BIN CARD	CONSUMABLES	\N	Tools	Drills
2597	Taper Shank Drill	Ø26.75	\N	\N	4	4	C17	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2598	Taper Shank Drill	Ø27.0	\N	\N	14	14	C17	\N	\N	1884	BIN CARD	CONSUMABLES	\N	Tools	Drills
2599	Taper Shank Drill	Ø27.25	\N	\N	2	2	C17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2600	Taper Shank Drill	Ø27.50	\N	\N	6	6	C17	\N	\N	5044	BIN CARD	CONSUMABLES	\N	Tools	Drills
2601	Taper Shank Drill	Ø27.75	\N	\N	2	2	C17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2602	Taper Shank Drill	Ø28.0	\N	\N	6	6	C17	\N	\N	2067	BIN CARD	CONSUMABLES	\N	Tools	Drills
2603	Taper Shank Drill	Ø28.25	\N	\N	3	3	C17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2604	Taper Shank Drill	Ø28.50	\N	\N	3	3	C17	\N	\N	2073	BIN CARD	CONSUMABLES	\N	Tools	Drills
2605	Taper Shank Drill	Ø28.75	\N	\N	1	1	C17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2606	Taper Shank Drill	Ø29.0	\N	\N	5	5	C17	\N	\N	2170	BIN CARD	CONSUMABLES	\N	Tools	Drills
2607	Taper Shank Drill	Ø29.25	\N	\N	5	5	C17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2608	Taper Shank Drill	Ø29.50	\N	\N	8	8	C17	\N	\N	2179	BIN CARD	CONSUMABLES	\N	Tools	Drills
2609	Taper Shank Drill	Ø29.75	\N	\N	7	7	C6	\N	\N	3878	BIN CARD	CONSUMABLES	\N	Tools	Drills
2610	Taper Shank Drill	Ø30.0	\N	\N	3	3	C6	\N	\N	2224	BIN CARD	CONSUMABLES	\N	Tools	Drills
2611	Taper Shank Drill	Ø30.25	\N	\N	5	5	C6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2612	Taper Shank Drill	Ø30.50	\N	\N	2	2	C6	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2613	Taper Shank Drill	Ø30.75	\N	\N	2	2	C6	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2614	Taper Shank Drill	Ø31.0	\N	\N	4	4	C6	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2615	Taper Shank Drill	Ø31.25	\N	\N	3	3	C6	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2616	Taper Shank Drill	Ø31.50	\N	\N	6	6	C6	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2617	Taper Shank Drill	Ø31.75	\N	\N	3	3	C6	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2618	Taper Shank Drill	Ø32.0	\N	\N	11	11	C7	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2619	Taper Shank Drill	Ø32.25	\N	\N	3	3	C7	\N	\N	1100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2620	Taper Shank Drill	Ø32.50	\N	\N	5	5	C7	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2621	Taper Shank Drill	Ø32.75	\N	\N	5	5	C7	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2622	Taper Shank Drill	Ø33.0	\N	\N	4	4	C7	\N	\N	2100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2623	Taper Shank Drill	Ø33.25	\N	\N	3	3	C7	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2624	Taper Shank Drill	Ø33.50	\N	\N	5	5	C7	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2625	Taper Shank Drill	Ø33.75	\N	\N	2	2	C7	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2626	Taper Shank Drill	Ø34.0	\N	\N	2	2	C7	\N	\N	900	BIN CARD	CONSUMABLES	\N	Tools	Drills
2627	Taper Shank Drill	Ø34.25	\N	\N	3	3	C18	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2628	Taper Shank Drill	Ø34.50	\N	\N	6	6	C18	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2629	Taper Shank Drill	Ø34.75	\N	\N	4	4	C18	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2630	Taper Shank Drill	Ø35.0	\N	\N	5	5	C18	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2631	Taper Shank Drill	Ø35.25	\N	\N	5	5	C18	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2632	Taper Shank Drill	Ø35.50	\N	\N	5	5	C18	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2633	Taper Shank Drill	Ø35.75	\N	\N	5	5	C18	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2634	Taper Shank Drill	Ø36.0	\N	\N	5	5	C18	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2635	Taper Shank Drill	Ø36.25	\N	\N	3	3	C18	\N	\N	1400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2636	Taper Shank Drill	Ø36.50	\N	\N	3	3	C29	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2637	Taper Shank Drill	Ø36.75	\N	\N	5	5	C29	\N	\N	1050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2638	Taper Shank Drill	Ø37.0	\N	\N	3	3	C29	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2639	Taper Shank Drill	Ø37.25	\N	\N	4	4	C29	\N	\N	1400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2640	Taper Shank Drill	Ø37.50	\N	\N	4	4	C29	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2641	Taper Shank Drill	Ø37.75	\N	\N	3	3	C29	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2642	Taper Shank Drill	Ø38.0	\N	\N	6	6	C29	\N	\N	3000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2643	Taper Shank Drill	Ø38.5	\N	\N	4	4	C29	\N	\N	1400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2644	Taper Shank Drill	Ø39.0	\N	\N	5	5	C29	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2645	Taper Shank Drill	Ø39.5	\N	\N	3	3	C30	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2646	Taper Shank Drill	Ø40.0	\N	\N	6	6	C30	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2647	Taper Shank Drill	Ø40.5	\N	\N	2	2	C30	\N	\N	600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2648	Taper Shank Drill	Ø41.0	\N	\N	0	0	C30	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2649	Taper Shank Drill	Ø41.5	\N	\N	5	5	C30	\N	\N	1500	BIN CARD	CONSUMABLES	\N	Tools	Drills
2650	Taper Shank Drill	Ø42.0	\N	\N	4	4	C30	\N	\N	1400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2651	Taper Shank Drill	Ø42.5	\N	\N	3	3	C30	\N	\N	1400	BIN CARD	CONSUMABLES	\N	Tools	Drills
2652	Taper Shank Drill	Ø43.0	\N	\N	3	3	C30	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2653	Taper Shank Drill	Ø43.5	\N	\N	4	4	C30	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2654	Taper Shank Drill	Ø44.0	\N	\N	2	2	C19	\N	\N	700	BIN CARD	CONSUMABLES	\N	Tools	Drills
2655	Taper Shank Drill	Ø44.5	\N	\N	3	3	C19	\N	\N	2050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2656	Taper Shank Drill	Ø45.0	\N	\N	1	1	C19	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2657	Taper Shank Drill	Ø45.5	\N	\N	0	0	C19	\N	\N	2100	BIN CARD	CONSUMABLES	\N	Tools	Drills
2658	Taper Shank Drill	Ø46.0	\N	\N	3	3	C19	\N	\N	2050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2659	Taper Shank Drill	Ø46.5	\N	\N	3	3	C19	\N	\N	2050	BIN CARD	CONSUMABLES	\N	Tools	Drills
2660	Taper Shank Drill	Ø47.0	\N	\N	2	2	C19	\N	\N	2000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2661	Taper Shank Drill	Ø47.5	\N	\N	3	3	C19	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2662	Taper Shank Drill	Ø48.0	\N	\N	3	3	C19	\N	\N	1000	BIN CARD	CONSUMABLES	\N	Tools	Drills
2663	Taper Shank Drill	Ø48.5	\N	\N	3	3	C8	\N	\N	1800	BIN CARD	CONSUMABLES	\N	Tools	Drills
2664	Taper Shank Drill	Ø49.0	\N	\N	3	3	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2665	Taper Shank Drill	Ø49.5	\N	\N	1	1	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2666	Taper Shank Drill	Ø50.0	\N	\N	6	6	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2667	Taper Shank Drill	Ø51.0	\N	\N	2	2	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2668	Taper Shank Drill	Ø52.0	\N	\N	2	2	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2669	Taper Shank Drill	Ø53.0	\N	\N	4	4	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2670	Taper Shank Drill	Ø54.0	\N	\N	1	1	C8	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2671	Taper Shank Drill	Ø55.0	\N	\N	5	5	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2672	Taper Shank Drill	Ø56.0	\N	\N	3	3	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2673	Taper Shank Drill	Ø57.0	\N	\N	3	3	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2674	Taper Shank Drill	Ø58.0	\N	\N	2	2	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2675	Taper Shank Drill	Ø59.0	\N	\N	1	1	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2676	Taper Shank Drill	Ø60.0	\N	\N	2	2	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2677	Taper Shank Drill	Ø61.0	\N	\N	1	1	C9	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2678	Taper Shank Drill	Ø62.0	\N	\N	3	3	C20	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2679	Taper Shank Drill	Ø63.0	\N	\N	2	2	C20	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2680	Taper Shank Drill	Ø64.0	\N	\N	2	2	C20	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2681	Taper Shank Drill	Ø65.0	\N	\N	2	2	C20	\N	\N	1600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2682	Taper Shank Drill	Ø66.0	\N	\N	5	5	C20	\N	\N	1600	BIN CARD	CONSUMABLES	\N	Tools	Drills
2683	Taper Shank Drill	Ø67.0	\N	\N	0	0	C20	\N	\N	1010	BIN CARD	CONSUMABLES	\N	Tools	Drills
2684	Taper Shank Drill	Ø68.0	\N	\N	2	2	C20	\N	\N	1010	BIN CARD	CONSUMABLES	\N	Tools	Drills
2685	Taper Shank Drill	Ø69.0	\N	\N	2	2	C21	\N	\N	1010	BIN CARD	CONSUMABLES	\N	Tools	Drills
2686	Taper Shank Drill	Ø70.0	\N	\N	2	2	C21	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2687	Taper Shank Drill	Ø71.0	\N	\N	2	2	C21	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2688	Taper Shank Drill	Ø72.0	\N	\N	0	0	C21	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2689	Taper Shank Drill	Ø73.0	\N	\N	2	2	C21	\N	\N	1274	BIN CARD	CONSUMABLES	\N	Tools	Drills
2690	Taper Shank Drill	Ø74.0	\N	\N	2	2	C21	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2691	Taper Shank Drill	Ø75.0	\N	\N	1	1	C21	\N	\N	637	BIN CARD	CONSUMABLES	\N	Tools	Drills
2692	Taper Shank Drill	Ø76.0	\N	\N	2	2	C21	\N	\N	1200	BIN CARD	CONSUMABLES	\N	Tools	Drills
2693	Taper Shank Drill (Carbide Tipped)	Ø15.5	\N	\N	1	1	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2694	Taper Shank Drill (Carbide Tipped)	Ø16.0	\N	\N	3	3	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2695	Taper Shank Drill (Carbide Tipped)	Ø16.5	\N	\N	1	1	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2696	Taper Shank Drill (Carbide Tipped)	Ø17.0	\N	\N	1	1	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2697	Taper Shank Drill (Carbide Tipped)	Ø17.5	\N	\N	2	2	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2698	Taper Shank Drill (Carbide Tipped)	Ø18.5	\N	\N	2	2	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2699	Taper Shank Drill (Carbide Tipped)	Ø19.0	\N	\N	4	4	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2700	Taper Shank Drill (Carbide Tipped)	Ø19.5	\N	\N	3	3	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2701	Taper Shank Drill (Carbide Tipped)	Ø22.0	\N	\N	1	1	C32	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2702	Taper Shank Drill (Long Series)	Ø4 × 200	\N	\N	6	6	C10	\N	\N	1944	BIN CARD	CONSUMABLES	\N	Tools	Drills
2703	Taper Shank Drill (Long Series)	Ø5 × 200	\N	\N	14	14	C10	\N	\N	1620	BIN CARD	CONSUMABLES	\N	Tools	Drills
2704	Taper Shank Drill (Long Series)	Ø6 × 200	\N	\N	13	13	C10	\N	\N	5106.2	TCPP	CONSUMABLES	\N	Tools	Drills
2705	Taper Shank Drill (Long Series)	Ø6 × 230	\N	\N	0	0	C10	\N	\N	93	BIN CARD	CONSUMABLES	\N	Tools	Drills
2706	Taper Shank Drill (Long Series)	Ø6 × 250	\N	\N	0	0	C10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2707	Taper Shank Drill (Long Series)	Ø7 × 200	\N	\N	5	5	C10	\N	\N	1797	BIN CARD	CONSUMABLES	\N	Tools	Drills
2708	Taper Shank Drill (Long Series)	Ø7 × 230	\N	\N	1	1	C10	\N	\N	93	BIN CARD	CONSUMABLES	\N	Tools	Drills
2709	Taper Shank Drill (Long Series)	Ø7 × 275	\N	\N	2	2	C10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2710	Taper Shank Drill (Long Series)	Ø8 × 220	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2711	Taper Shank Drill (Long Series)	Ø8 × 375	\N	\N	4	4	C10	\N	\N	2089	BIN CARD	CONSUMABLES	\N	Tools	Drills
2712	Taper Shank Drill (Long Series)	Ø10 × 130	\N	\N	2	2	C10	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2713	Taper Shank Drill (Long Series)	Ø10 × 200	\N	\N	2	2	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2714	Taper Shank Drill (Long Series)	Ø10 × 230	\N	\N	1	1	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2715	Taper Shank Drill (Long Series)	Ø10 × 250	\N	\N	1	1	C22	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2716	Taper Shank Drill (Long Series)	Ø10 × 310	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2717	Taper Shank Drill (Long Series)	Ø12 × 150	\N	\N	0	0	C21	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2718	Taper Shank Drill (Long Series)	Ø12 × 250	\N	\N	3	3	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2719	Taper Shank Drill (Long Series)	Ø14 × 250	\N	\N	2	2	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2720	Taper Shank Drill (Long Series)	Ø14 × 350	\N	\N	2	2	C21	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2721	Taper Shank Drill (Long Series)	Ø16 × 250	\N	\N	0	0	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2722	Taper Shank Drill (Long Series)	Ø18.5 × 400	\N	\N	1	1	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2723	Taper Shank Drill (Long Series)	Ø25 × 400	\N	\N	2	2	C11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2724	Hand Taps - PZ	PZ - 7	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2725	Hand Taps - PZ	PZ - 9	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2726	Hand Taps - PZ	PZ - 11	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2727	Hand Taps - PZ	PZ - 13.5	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2728	Hand Taps - PZ	PZ - 16	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2729	Hand Taps - PZ	PZ - 21	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2730	Hand Taps - PZ	PZ - 29	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2731	Hand Taps - PZ	PZ - 36	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2732	Hand Taps - PZ	PZ - 42	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2733	Hand Taps - PZ	PZ - 48	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2734	Hand Taps - BSW	1/8 " (49)	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2735	Hand Taps - BSW	1/4 " (19)	\N	\N	0	0	TC - 11	\N	2 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2736	Hand Taps - BSW	1/4 " (20)	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2737	Hand Taps - BSW	1/4 " (20)(19)	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2738	Hand Taps - BSW	3/8 "	\N	\N	0	0	TC - 11	\N	3 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2739	Hand Taps - BSW	3/4 "	\N	\N	0	0	TC - 11	\N	2 set's New Stock	7011	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2740	Hand Taps - BSW	1/2 " (12)	\N	\N	0	0	TC - 11	\N	3 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2741	Hand Taps - BSW	1 "	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2742	Hand Taps - BSW	5/16 " (18)	\N	\N	0	0	TC - 11	\N	3 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2743	Hand Taps - BSW	7/16 "	\N	\N	0	0	TC - 11	\N	3 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2744	Hand Taps - BSW	7/8 "	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2745	Hand Taps - BSW	5/8 "	\N	\N	0	0	\N	\N	\N	3330	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2746	Hand Taps - BSW	W 7/16	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2747	Hand Taps - BSW	W 9/16	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2748	Hand Taps - BSW	W 1 1/4	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2749	Hand Taps - BSW	W 7/8	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2750	Hand Taps - BSW	W 3/4	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2751	Hand Taps - BSW	W 1/2	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2752	Hand Taps - BSW	W1 "	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2753	Hand Taps - BSW	W 16	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2754	Hand Taps - BSP	G 1/8	\N	\N	0	0	A17	\N	\N	8370	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2755	Hand Taps - BSP	G 1/4	\N	\N	0	0	A17	\N	\N	6700	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2756	Hand Taps - BSP	G 7/8	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2757	Hand Taps - BSP	G 5/8	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2758	Hand Taps - BSP	G 3/8	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2759	Hand Taps - BSP	G 3/4	\N	\N	0	0	\N	\N	\N	3207	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2760	Hand Taps - BSP	G 1/2 (18)	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2761	Hand Taps - BSP	G 1	\N	\N	0	0	A17	\N	\N	3698	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2762	Hand Taps - BSP	G 1 1/8	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2763	Hand Taps - BSP	G 1 1/4	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2764	Hand Taps - BSP	G 1 3/4	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2765	Hand Taps - BSP	G 1 3/8	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2766	Hand Taps - BSP	G 1 1/2	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2767	Hand Taps - BSP	1/4 "	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2768	Hand Taps - BSP	3/8 "	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2769	Hand Taps - BSP	5/8 "	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2770	Hand Taps - BSP	1/2 " (19)	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2771	Hand Taps - BSP	1 "	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2772	Hand Taps - BSP	1/8 " (28)	\N	\N	0	0	TC - 11	\N	2 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2773	Hand Taps - BSP	5/8 " (14)	\N	\N	0	0	TC - 11	\N	2 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2774	Hand Taps - BSP	1/4 " (19)	\N	\N	0	0	TC - 11	\N	4 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2775	Hand Taps - BSP	3/4 " (14)	\N	\N	0	0	TC - 11	\N	3 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2776	Hand Taps - BSP	1/2 " (14)	\N	\N	0	0	TC - 11	\N	7 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2777	Hand Taps - BSP	1 1/2 " (34)	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2778	Hand Taps - NPT	1/4 "	\N	\N	0	0	A17	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2779	Hand Taps - MJ	MJ33 × 1.5	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2780	Hand Taps - UNF	9/16 " × 18	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2781	Hand Taps - UNF	1 1/18"	\N	\N	0	0	TC - 11	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2782	Hand Taps - UNF	15/8 " (12)	\N	\N	0	0	A18	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2783	Hand Taps - UNF	17/8 " (12)	\N	\N	0	0	A18	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2784	Hand Taps - UNF	7/8 " (14)	\N	\N	0	0	TC - 11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2785	Hand Taps - Metric (Standard)	M2 × 0.4	\N	\N	0	0	A16	\N	2 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2786	Hand Taps - Metric (Standard)	M2.5 × 0.45	\N	\N	0	0	A16	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2787	Hand Taps - Metric (Standard)	M3 × 0.5	\N	\N	0	0	A16	\N	28 set's New Stock	3328	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2788	Hand Taps - Metric (Standard)	M4 × 0.7	\N	\N	0	0	A16	\N	21 set's New Stock	3150	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2789	Hand Taps - Metric (Standard)	M5 × 0.8	\N	\N	0	0	A16	\N	12 set's New Stock	8005	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2790	Hand Taps - Metric (Standard)	M6 × 1.0	\N	\N	0	0	A16	\N	11 set's New Stock	12595	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2791	Hand Taps - Metric (Standard)	M8 × 1.25	\N	\N	0	0	A16	\N	17 set's New Stock	18882	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2792	Hand Taps - Metric (Standard)	M10 × 1.5	\N	\N	0	0	\N	\N	17 set's New Stock	20087	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2793	Hand Taps - Metric (Standard)	M12 × 1.75	\N	\N	0	0	A16	\N	8 set's New Stock	23530	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2794	Hand Taps - Metric (Standard)	M14 × 2.0	\N	\N	0	0	A16	\N	5 set's New Stock	27880	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2795	Hand Taps - Metric (Standard)	M16 × 2.0	\N	\N	0	0	A16	\N	9 set's New Stock	35285	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2796	Hand Taps - Metric (Standard)	M18 × 2.5	\N	\N	0	0	A14	\N	5 set's New Stock	16675	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2797	Hand Taps - Metric (Standard)	M20 × 2.5	\N	\N	0	0	A16	\N	\N	7740	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2798	Hand Taps - Metric (Standard)	M22 × 2.5	\N	\N	0	0	A15	\N	4 set's New Stock	23000	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2799	Hand Taps - Metric (Standard)	M24 × 3	\N	\N	0	0	\N	\N	11 set's New Stock	44387	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2800	Hand Taps - Metric (Standard)	M27 × 3	\N	\N	0	0	A14	\N	\N	966	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2801	Hand Taps - Metric (Standard)	M36 × 4	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2802	Hand Taps - Metric (Standard)	M42 × 4.5	\N	\N	0	0	A18	\N	Issued to Guruprasad PAT	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2803	Hand Taps - Metric (Standard)	M56 × 5.5	\N	\N	0	0	A18	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2804	Hand Taps - Metric (Fine Pitch)	M3 × 0.35	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2805	Hand Taps - Metric (Fine Pitch)	M4 × 0.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2806	Hand Taps - Metric (Fine Pitch)	M5 × 0.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2807	Hand Taps - Metric (Fine Pitch)	M6 × 0.75	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2808	Hand Taps - Metric (Fine Pitch)	M7 × 0.5	\N	\N	0	0	A15	\N	\N	164	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2809	Hand Taps - Metric (Fine Pitch)	M7 × 1	\N	\N	0	0	\N	\N	2 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2810	Hand Taps - Metric (Fine Pitch)	M8 × 0.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2811	Hand Taps - Metric (Fine Pitch)	M8 × 0.75	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2812	Hand Taps - Metric (Fine Pitch)	M8 × 1	\N	\N	0	0	A15	\N	\N	61	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2813	Hand Taps - Metric (Fine Pitch)	M9 × 1	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2814	Hand Taps - Metric (Fine Pitch)	M10 × 0.75	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2815	Hand Taps - Metric (Fine Pitch)	M10 × 1	\N	\N	0	0	A15	\N	\N	725	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2816	Hand Taps - Metric (Fine Pitch)	M10 × 1.25	\N	\N	0	0	A15	\N	\N	360	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2817	Hand Taps - Metric (Fine Pitch)	M12 × 1	\N	\N	0	0	A15	\N	1 set New Stock	580	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2818	Hand Taps - Metric (Fine Pitch)	M12 × 1.25	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2819	Hand Taps - Metric (Fine Pitch)	M12 × 1.5	\N	\N	0	0	A15	\N	\N	696	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2820	Hand Taps - Metric (Fine Pitch)	M14 × 1	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2821	Hand Taps - Metric (Fine Pitch)	M14 × 1.25	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2822	Hand Taps - Metric (Fine Pitch)	M14 × 1.5	\N	\N	0	0	A15	\N	\N	568	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2823	Hand Taps - Metric (Fine Pitch)	M14 × 2	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2824	Hand Taps - Metric (Fine Pitch)	M15 × 1	\N	\N	0	0	\N	\N	1 set New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2825	Hand Taps - Metric (Fine Pitch)	M15 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2826	Hand Taps - Metric (Fine Pitch)	M16 × 1	\N	\N	0	0	A15	\N	\N	1764	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2827	Hand Taps - Metric (Fine Pitch)	M16 × 1.5	\N	\N	0	0	A15	\N	7 set's New Stock	138	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2828	Hand Taps - Metric (Fine Pitch)	M16 × 2	\N	\N	0	0	A14	\N	11 set's New Stock	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2829	Hand Taps - Metric (Fine Pitch)	M17 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2830	Hand Taps - Metric (Fine Pitch)	M18 × 1	\N	\N	0	0	\N	\N	\N	1485	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2831	Hand Taps - Metric (Fine Pitch)	M18 × 1.5	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2832	Hand Taps - Metric (Fine Pitch)	M20 × 1	\N	\N	0	0	A15	\N	\N	6900	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2833	Hand Taps - Metric (Fine Pitch)	M20 × 1.5	\N	\N	0	0	A15	\N	4 set's New Stock	11040	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2834	Hand Taps - Metric (Fine Pitch)	M20 × 2	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2835	Hand Taps - Metric (Fine Pitch)	M22 × 1.5	\N	\N	0	0	A15	\N	\N	850	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2836	Hand Taps - Metric (Fine Pitch)	M22 × 2	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2837	Hand Taps - Metric (Fine Pitch)	M24 × 1.5	\N	\N	0	0	A15	\N	\N	5780	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2838	Hand Taps - Metric (Fine Pitch)	M24 × 2	\N	\N	0	0	A15	\N	\N	7312	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2839	Hand Taps - Metric (Fine Pitch)	M25 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2840	Hand Taps - Metric (Fine Pitch)	M26 × 1.5	\N	\N	0	0	A14	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2841	Hand Taps - Metric (Fine Pitch)	M27 × 1.5	\N	\N	0	0	A15	\N	\N	1175	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2842	Hand Taps - Metric (Fine Pitch)	M27 × 2	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2843	Hand Taps - Metric (Fine Pitch)	M30 × 1.5	\N	\N	0	0	A15	\N	2 set's New Stock	19321	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2844	Hand Taps - Metric (Fine Pitch)	M30 × 3.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2845	Hand Taps - Metric (Fine Pitch)	M33 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2846	Hand Taps - Metric (Fine Pitch)	M35 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2847	Hand Taps - Metric (Fine Pitch)	M35 × 2	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2848	Hand Taps - Metric (Fine Pitch)	M36 × 1.5	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2849	Hand Taps - Metric (Fine Pitch)	M36 × 2	\N	\N	0	0	A15	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2850	Hand Taps - Metric (Fine Pitch)	M48 × 3	\N	\N	0	0	A18	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2851	Hand Taps - Metric (Fine Pitch)(Machine Tap)	M8 6h (Mc)	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2852	Hand Taps - Metric (Fine Pitch)(Machine Tap)	M10 × 1.5  (Mc)	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2853	Hand Taps - Metric (Fine Pitch)(Machine Tap)	M12 × 1  (Mc)	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2854	Hand Taps - Metric (Fine Pitch)(Machine Tap)	M12 × 1.75 (Mc)	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2855	Hand Taps - Metric (Fine Pitch)(LH)	M8 × 1  LH	\N	\N	0	0	TC - 11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2856	Hand Taps - Metric (Fine Pitch)(LH)	M6 × 1  LH	\N	\N	0	0	TC - 11	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Taps & Dies
2857	Thread Measuring Pin's	Ø 0.45	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2858	Thread Measuring Pin's	Ø 0.72	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2859	Thread Measuring Pin's	Ø 1.10	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2860	Thread Measuring Pin's	Ø 1.65	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2861	Thread Measuring Pin's	Ø 2.05	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2862	Thread Measuring Pin's	Ø 3.20	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2863	Thread Measuring Pin's	Ø 4.0	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2864	Thread Measuring Pin's	Ø 5.05	\N	\N	0	0	TC -08	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2865	Thread Pitch Gauge (Metric)	\N	\N	\N	2	2	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2866	Thread Pitch Gauge (Inch)	\N	\N	\N	4	4	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2867	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M3 × 0.5 - 6H	\N	\N	2	2	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2868	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M4 × 0.7	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2869	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M4 - 6H	\N	\N	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2870	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M5 × 0.8 - 6H	\N	\N	2	2	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2871	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M6 × 1 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2872	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M6 × 1 - 6H	\N	\N	3	3	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2873	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M8 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2874	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M7 × 1.0 - 6H	\N	\N	1	1	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2875	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M8 × 1.0 - 6H	\N	\N	1	1	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2876	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M10 × 1.5 - 6H	\N	\N	1	1	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2877	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M7 × 1.0 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2878	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M8 × 1.0 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2879	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M10 × 1.0 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2880	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M10 × 1.25 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2881	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M 12× 1.5 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2882	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M14 × 1.0 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2883	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M14 × 1.25 - 6H	\N	\N	1	1	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2884	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M14 × 1.5 - 6H	\N	\N	3	3	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2885	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M16 × 1.5 - 4H/5H (LH)	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2886	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M18 × 1.5 - 6H	\N	\N	3	3	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2887	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M20 × 1.5 - 7H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2888	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M22 × 1.5 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2889	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M26 × 1.5 - 6H	\N	\N	2	2	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2890	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M12 × 1.0 - 6H	\N	\N	1	1	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2891	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M12 × 1.25 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2892	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M12 × 1.0 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2893	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M27 × 1.0 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2894	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M27 × 1.5 - 4H/5H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2895	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M20 × 1.5 - 6H	\N	\N	3	3	G3	\N	\N	\N	LEDGER-6	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2896	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M40 × 1.5 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2897	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M30 × 1.0 - 6H	\N	\N	2	2	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2898	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M40 × 1.5 - 4H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2899	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M48 × 1.5 - 6H	\N	\N	1	1	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2900	Thread Plug Gauge ( Go and Nogo ) ( Double End )	M64 × 1.5 - 6H	\N	\N	3	3	G3	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2901	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ12 × 1.25 - 4H/5H	\N	\N	3	3	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2902	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ16 × 1.5 - 4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2903	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ18 × 1.5 - 4H/5H	\N	\N	3	3	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2904	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ22 × 1.5 - 4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2905	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ24 × 1.5 - 4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2906	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ24 × 1.5 - 4H/5H (LH)	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2907	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ27 × 1.5 - 4H/5H	\N	\N	3	3	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2908	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ30 × 1.5 -4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2909	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ33 × 1.5 - 4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2910	Thread Plug Gauge ( Go and Nogo ) ( Double End )	MJ50 × 1.5 - 4H/5H	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2911	Thread Plug Gauge ( Go and Nogo ) ( Double End )	1" - 12 UNF 2B ( LH )	\N	\N	1	1	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2912	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M64 × 4 - 7H	\N	\N	1	1	G2	\N	Before AL	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2913	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M76 × 2 - 6H	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2914	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M82 × 1.5 - 6H	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2915	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M90 × 1.5 - 6H	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2916	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M94 × 1.5 - 6H	\N	\N	0	0	Sadashiva (UPE)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2917	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M105 × 1.5 - 6H	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2918	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M110 × 6 - 6H	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2919	Thread Plug Gauge ( Go and Nogo ) ( Single End )	M120 × 6	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2920	Thread Ring Gauge	M3 × 0.5 - 6g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2921	Thread Ring Gauge	M6 × 1 - 4g/6g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2922	Thread Ring Gauge	M6  - 6g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2923	Thread Ring Gauge	M20 × 1 - 6g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2924	Thread Ring Gauge	M20 × 1.5 - 8g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2925	Thread Ring Gauge	M40 × 1.5 - 4h	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2926	Thread Ring Gauge	M40 × 1.5 - 6g	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2927	Thread Ring Gauge	M48 × 1.5 - 6g	\N	\N	0	0	G5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2928	Thread Ring Gauge	M64 × 1.5 - 6g	\N	\N	0	0	G5	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2929	Thread Ring Gauge	M82 × 1.5	\N	\N	0	0	Sadashiva (UPE)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2930	Thread Ring Gauge	M82 × 1.5 - 6g	\N	\N	0	0	G5	\N	1 number NOGO	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2931	Thread Ring Gauge	M110 × 6	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2932	Thread Ring Gauge	M120 × 6	\N	\N	0	0	G2	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2933	Thread Ring Gauge	BSW 3/8"	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2934	Thread Ring Gauge	MJ16 × 1.5 - 4H/6H	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2935	Thread Ring Gauge	MJ16 × 1.5 - 4H/6H ( LH )	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2936	Thread Ring Gauge	MJ22 × 1.5	\N	\N	0	0	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2937	Thread Ring Gauge	MJ24 × 1.5 - 4H/6H	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2938	Thread Ring Gauge	MJ24 × 1.5 - 4H/6H (LH )	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2939	Thread Ring Gauge	MJ33 × 1.5 - 4h/6h	\N	\N	0	0	G4	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Thread Gauges
2940	Three Point Micrometer	6  -  8	7Y238208	Tesa	1	1	TC - 06	\N	Not Working Properly	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2941	Three Point Micrometer	10  -  12	\N	Tesa	1	1	TC - 06	\N	\N	270	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2942	Three Point Micrometer	10  -  12	7Y236908	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2943	Three Point Micrometer	11  -  14	8C103008	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2944	Three Point Micrometer	14  -  17	\N	Tesa	1	1	TC - 06	\N	\N	234	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2945	Three Point Micrometer	17  -  20	\N	Tesa	1	1	TC - 06	\N	\N	235	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2946	Three Point Micrometer	17  -  20	8C120908	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2947	Three Point Micrometer	20  -  25	\N	Tesa	1	1	TC - 06	\N	\N	242	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2948	Three Point Micrometer	20  -  25	8C117708	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2949	Three Point Micrometer	25  -  30	\N	Tesa	1	1	TC - 06	\N	Not Working Properly	243	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2950	Three Point Micrometer	30  -  35	\N	Tesa	1	1	TC - 06	\N	\N	260	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2951	Three Point Micrometer	30  -  35	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2952	Three Point Micrometer	30  -  35	8C094708	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2953	Three Point Micrometer (Tri-o-Bar)	30  -  40	3207	Tesa	1	1	TC - 06	\N	\N	1248	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2954	Three Point Micrometer	35  -  40	\N	Tesa	1	1	TC - 06	\N	\N	862	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2955	Three Point Micrometer	35  -  40	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2956	Three Point Micrometer	35  -  40	8C000308	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2957	Three Point Micrometer	40  -  50	\N	Tesa	1	1	TC - 06	\N	\N	688	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2958	Three Point Micrometer	40  -  50	7U410808	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2959	Three Point Micrometer	50  -  60	\N	Tesa	1	1	TC - 06	\N	\N	528	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2960	Three Point Micrometer	50  -  60	8C006508	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2961	Three Point Micrometer	60  -  70	\N	Tesa	1	1	TC - 06	\N	\N	325	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2962	Three Point Micrometer	60  -  70	8C024508	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2963	Three Point Micrometer	70  -  80	\N	Tesa	1	1	TC - 06	\N	\N	332	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2964	Three Point Micrometer	70  -  80	\N	Tesa	1	1	TC - 06	\N	Not Working Properly	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2965	Three Point Micrometer	80  -  90	\N	Tesa	1	1	TC - 06	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2966	Three Point Micrometer	80  -  90	8C019608	Tesa	1	1	TC - 06	\N	\N	345	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2967	Three Point Micrometer	90  -  100	8C021908	Tesa	1	1	TC - 06	\N	Not Working Properly	332	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2968	Three Point Micrometer	100  -  125	\N	Tesa	1	1	TC - 06	\N	\N	335	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
2969	Torque Wrench Set ( NC )	\N	\N	\N	0	0	E9	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
2970	Torque Wrench	\N	\N	\N	4	4	E10	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
2971	Turning Tool	\N	SVJ BR 1616 H16	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2972	Turning Tool	\N	MVJNL 2020 - K16	Seco	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2973	Turning Tool	\N	MVJNLR 2020 - K16 D8C	Korloy	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2974	Turning Tool	\N	DDJNR 2020 - K15 - M	Seco	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2975	Turning Tool	\N	DDJNL 2020 - K15 - M	Seco	4	4	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2976	Turning Tool	\N	PCLNR 2020 - K12	Teagutec	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2977	Turning Tool	\N	MVJNR 2020 - K16	Korloy	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2978	Turning Tool	\N	SVJBR 2525 - M16	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2979	Turning Tool	\N	SVJBL 2525 - M16	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2980	Turning Tool	\N	PDJNL 2525 - M15 4K	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2981	Turning Tool	\N	PDJNL 2525 - M15	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2982	Turning Tool	\N	MVJNL 2525 - M16	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2983	Turning Tool	\N	PCLNR 2525 - M12	Teagutec	3	3	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2984	Turning Tool	\N	TDJNR 2525 - M15	Teagutec	1	1	Vinay Kumar (AEAMT)	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2985	Turning Tool	\N	PDJNL 2525 - M15	Teagutec	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2986	Turning Tool	\N	MVJNL 2525 - M16	Sandvik	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2987	Turning Tool	\N	TDJNR 2525 - M15	STS Tools	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2988	Turning Tool	\N	2525 - M16	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2989	Turning Tool	\N	2525 - M15	Widax	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2990	Turning Tool	\N	MVJNR 2525 - M16	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2991	Turning Tool	\N	MVJNR 2525 - M16	Seco	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2992	Turning Tool	\N	TDJNL 2525 - M5	\N	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2993	Turning Tool	\N	TDJNL 2525 - M15	Teagutec	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2994	Turning Tool	\N	PCLNL 2525 M (5196)	Teagutec	1	1	\N	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2995	Turning Tool	\N	PCLNR 2525 - M12	WIDAX	1	1	Sridhar	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Turning & Threading Tools
2996	Twist Clamp	\N	\N	\N	8	8	E16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
2997	U Drill	\N	DFT330 R4 WD 40M	KennaMetal	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2998	U Drill	Ø 25	216 80 425	Widax	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
2999	U Drill	Ø 30	216 75 230 I 5J	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3000	U Drill	Ø 32	69 339 928	Widax	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3001	U Drill	\N	\N	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3002	U Drill	Ø 40	69499836	Widax	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3003	U Drill	\N	DCM105 - 052 - 16A	Iscar	2	2	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3004	U Drill	\N	DCM100 - 050 - 16A	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3005	U Drill	\N	DCM125 - 062 - 16A	Iscar	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3006	U Drill	Ø 40	100152450	Widia	1	1	TC - 04	\N	\N	\N	BIN CARD	CONSUMABLES	\N	Tools	Drills
3007	V - Block Clamp	\N	\N	\N	7	7	E15	\N	\N	6850	BIN CARD	CONSUMABLES	\N	Tools	Clamps & Workholding
3008	V - Blocks	\N	\N	\N	0	0	E16	\N	\N	15530	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
3009	V - Blocks	\N	\N	\N	0	0	E16	\N	\N	10370	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
3010	V - Blocks ( Magnetic )	\N	\N	\N	0	0	E15	\N	\N	28600	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
3011	V - Blocks ( Magnetic )	\N	\N	\N	0	0	E15	\N	\N	39560	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
3012	V - Blocks ( Big )	\N	\N	\N	0	0	E16	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Surface & Inspection Plates
3013	Vernier Caliper	0 - 130	5434771	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3014	Vernier Caliper	0 - 150	TC - 19	Mitutoyo	1	1	TC - 01	\N	\N	625	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3015	Vernier Caliper	0 - 150	TC - 25	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3016	Vernier Caliper	0 - 150	NCC - 3	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3017	Vernier Caliper	0 - 150	TC - 50	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3018	Vernier Caliper	0 - 150	505 - 681	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3019	Vernier Caliper	0 - 150	505 - 685	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3020	Vernier Caliper	0 - 150	5396515	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3021	Vernier Caliper	0 - 150	1284	Mitutoyo	1	1	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3022	Vernier Caliper	0 - 150	\N	\N	1	1	Manjunatha B N (RPD)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3023	Vernier Caliper	0 - 150	\N	\N	1	1	Vinay Kumar (AEAMT)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3024	Vernier Caliper	0 - 200	TC - 51	Mitutoyo	1	1	LC - 139	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3025	Vernier Caliper	0 - 200	\N	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3026	Vernier Caliper	0 - 280	6074772	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3027	Vernier Caliper	0 - 300	TC - 52	Tesa	1	1	TC - 01	\N	\N	1305	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3028	Vernier Caliper	0 - 300	TC - 0095	Mitutoyo	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3029	Vernier Caliper	0 - 300	TC - 55	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3030	Vernier Caliper	0 - 300	TC - 56	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3031	Vernier Caliper	0 - 300	TC - 57	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3032	Vernier Caliper	0 - 300	TC - 58	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3033	Vernier Caliper	0 - 300	TC - 59	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3034	Vernier Caliper	0 - 300	\N	\N	1	1	Manjunatha B N (RPD)	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3035	Vernier Caliper	0 - 350	TC - 60	Helios	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3036	Vernier Caliper	0 - 450	TC - 53	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3037	Vernier Caliper	0 - 450	TC - 54	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3038	Vernier Caliper	0 - 650	CSN 251231	Somet	1	1	TC - 01	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3039	Web Sling	1 Mtr ( SWL - 1 Ton )	36046 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3040	Web Sling	1 Mtr ( SWL - 1 Ton )	36045 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3041	Web Sling	1 Mtr ( SWL - 2 Ton )	36071 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3042	Web Sling	1 Mtr ( SWL - 2 Ton )	36070 / 22-23	\N	1	1	Woood Rack	\N	\N	2160	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3043	Web Sling	2 Mtr ( SWL - 1 Ton )	36041 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3044	Web Sling	2 Mtr ( SWL - 1 Ton )	36042 / 22-23	\N	1	1	Woood Rack	\N	\N	3474	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3045	Web Sling	2 Mtr ( SWL - 2 Ton )	36047 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3046	Web Sling	2 Mtr ( SWL - 2 Ton )	36048 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3047	Web Sling	2 Mtr ( SWL - 2 Ton )	36066 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3048	Web Sling	2 Mtr ( SWL - 2 Ton )	36067 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3049	Web Sling	3 Mtr ( SWL - 2 Ton )	245512	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3050	Web Sling	3 Mtr ( SWL - 2 Ton )	245507	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3051	Web Sling	3 Mtr ( SWL - 2 Ton )	156239 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3052	Web Sling	3 Mtr ( SWL - 4 Ton )	36049 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3053	Web Sling	3 Mtr ( SWL - 4 Ton )	36050 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3054	Web Sling	4 Mtr ( SWL - 3 Ton )	36043 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3055	Web Sling	4 Mtr ( SWL - 3 Ton )	36044 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3056	Web Sling	4 Mtr ( SWL - 4 Ton )	36068 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3057	Web Sling	4 Mtr ( SWL - 4 Ton )	36069 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3058	Web Sling	5 Mtr ( SWL - 5 Ton )	36076 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3059	Web Sling	5 Mtr ( SWL - 5 Ton )	36077 / 22-23	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3060	Web Sling	6 Mtr ( SWL - 10 Ton )	43320	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3061	Web Sling	6 Mtr ( SWL - 10 Ton )	43321	\N	1	1	Woood Rack	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3062	Web Sling with Hook	\N	\N	\N	1	1	Woood Rack	\N	4 Branches	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
3063	Slip Gauge Holder	20 - 250 mm	\N	Mitutoyo	2	2	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3064	Gauge Block	8 mm	\N	Mitutoyo	0	0	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3065	Gauge Block	12 mm	\N	Mitutoyo	0	0	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3066	Gauge Block	20 mm	\N	Mitutoyo	0	0	TC - 09	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3067	Digital Caliper (New Stock)	0-1500	B242503673	Mitutoyo	1	1	RACK	\N	New Stock	113000	TCPP	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3068	Bore Gauge (New Stock)	600-800	B242503672	Mitutoyo	0	0	TC - 09	\N	New Stock	43345.99	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
3069	HALF ROUND JAW(GAUGE BLOCK HOLDER JAWS)	8MM	B242503312	Mitutoyo	0	0	\N	\N	New Stock	63396	TCPP	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3070	HALF ROUND JAW(GAUGE BLOCK HOLDER JAWS)	20MM	B242503311	Mitutoyo	0	0	\N	\N	New Stock	63396	TCPP	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3071	HALF ROUND JAW(GAUGE BLOCK HOLDER JAWS)	12MM	B242503309	Mitutoyo	0	0	\N	\N	New Stock	63396	TCPP	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3072	GAUGE BLOCK HOLDER 20MM OR LESS -250MM	20MM OR LESS 250MM	B242503314	Mitutoyo	0	0	\N	\N	New Stock	126791.99	TCPP	NON-CONSUMABLES	\N	Instruments	Slip Gauges
3073	DIGIMATIC FIBER CARBON CALIPER	0-450MM	B242503308	Mitutoyo	0	0	\N	\N	New Stock	39491.53	TCPP	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3074	DIGIMATIC FIBER CARBON CALIPER	0-600MM	B242503308	Mitutoyo	0	0	\N	\N	New Stock	50000	TCPP	NON-CONSUMABLES	\N	Instruments	Vernier Calipers
3075	Bore Gauge WITH MICROMETER HEADS(New Stock)	60-100	B242503307	Mitutoyo	0	0	\N	\N	New Stock	18316	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
3076	Bore Guage With Micrometer	400-600MM	B242502352	Mitutoyo	0	0	\N	\N	New Stock	40792	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
3077	Bore Gauge WITH MICROMETER(New Stock)	60-100	B242502351	Mitutoyo	0	0	\N	\N	New Stock	18316	TCPP	NON-CONSUMABLES	\N	Instruments	Bore Gauges
3078	Dial indicator plunger type	8mm	B242501299	Mitutoyo	0	0	\N	\N	New Stock	6137.99	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
3079	Outside Micrometer	300-400	B242501292	Mitutoyo	0	0	\N	\N	\N	22079	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
3080	Dial  indicator plunger s shank	dia 8mm	B242500615	Mitutoyo	0	0	\N	\N	New Stock	18413.98	TCPP	NON-CONSUMABLES	\N	Instruments	Dial Indicators
3081	Attachment blade for outside micrometer	\N	208064	Mitutoyo	0	0	\N	\N	New Stock	3940	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
3082	Attachable disc plate for outside micrometer	\N	208066	Mitutoyo	0	0	\N	\N	New Stock	4574.01	TCPP	NON-CONSUMABLES	\N	Instruments	Micrometers
3083	hi-flow pedestal fan compton 400mm	400mm	\N	compton	0	0	\N	\N	New Stock	48600.09	TCPP	NON-CONSUMABLES	\N	Misc	General
3084	Boring Bar ID	\N	A32SWMTER0319M	\N	0	0	\N	\N	New Stock	8211.6	TCPP	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
3085	VDI Static Tool Holder	\N	B7 603260	\N	0	0	\N	\N	New Stock	13520	TCPP	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
3086	VDI Static Tool Holder	\N	B5 603260	\N	0	0	\N	\N	New Stock	13520	TCPP	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
3087	Dovetail cutter	22*29*16.2*12Thickness	\N	\N	0	0	\N	\N	New Stock	5900	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3088	Face mill	Ø50	BAP400-50-4T	\N	0	0	\N	\N	New Stock	2065	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3089	End mill cutter extra length	Ø25	APX3000R253SA25ELA	MITSUBHISHI	0	0	\N	\N	New Stock	899	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3090	End mill cutter extra length	Ø25	MCPX300R253SA25LA	MITSUBHISHI	0	0	\N	\N	New Stock	2697	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3091	End Mill	Ø125	ASX400-125B08R	MITSUBHISHI	0	0	\N	\N	New Stock	995	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3092	Boring Tool	Ø4	\N	\N	0	0	\N	\N	New Stock	1534	TCPP	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
3093	End mill cutter	Ø32	APX3000R323SA32ELA	MITSUBHISHI	0	0	\N	\N	New Stock	899	TCPP	NON-CONSUMABLES	\N	Tools	Milling Cutters
3094	HSS TAP SET	M20*2.5	\N	\N	0	0	\N	\N	New Stock	6383.8	TCPP	NON-CONSUMABLES	\N	Tools	Taps & Dies
3095	Dead center , Direct Hardened&Precision Ground	MT4*280mm	\N	\N	0	0	\N	\N	New Stock	6431	TCPP	NON-CONSUMABLES	\N	Tools	Centres & Arbors
126	Boring Bar	Ø 25	\N	Sandvik	0	1	TC - 04	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Boring Bars & Tools
3096	Tool Holders & inserts	\N	335.14-1206.0-042-100E	\N	0	0	\N	\N	New Stock	47790	TCPP	NON-CONSUMABLES	\N	Tools	Turning & Threading Tools
37	T - Allen Key	4 mm	\N	\N	32	23	\N	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Keys & Wrenches
1542	PKM Collets ER 40	Ø 4	\N	\N	0	1	TC - 07	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Collets & Holders
1146	Lever Type Dial (0.01 mm)	\N	513 - 415	Mitutoyo	0	1	TC - 07	\N	\N	2300	BIN CARD	NON-CONSUMABLES	\N	Instruments	Dial Indicators
329	Dead Centre	MT 1	\N	\N	3	4	A18	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Tools	Centres & Arbors
627	Analog Outside Micrometer	0-25	CSN 25 1421	SOMET	0	1	TC - 11	\N	\N	\N	BIN CARD	NON-CONSUMABLES	\N	Instruments	Micrometers
168	C - Clamp	\N	\N	\N	8	28	D27	\N	\N	6556	BIN CARD	NON-CONSUMABLES	\N	Tools	Clamps & Workholding
\.


--
-- Data for Name: vendors; Type: TABLE DATA; Schema: inventory; Owner: -
--

COPY inventory.vendors (id, company_name, created_at, updated_at) FROM stdin;
2	Ace Carbo Nitriders	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
3	Adithya Fab	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
4	Adpro Technologies	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
5	Amigo Corp	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
6	AND Industries	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
7	Apex Metals India	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
8	Aravac Forge	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
9	Amit Incoporation	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
10	Anil CNC	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
11	AMSteel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
12	Bangalore Standard Key	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
13	Bansali Metal Corp	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
14	Bay Forge	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
15	Bhandari Forge	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
16	Bhatarth Forge	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
17	Bmbhyraveshwara Hyd	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
18	Bharath Electro Chem	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
19	Bharath Steel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
20	Cenlub	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
21	Mhemco Engineering	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
22	Cluster Aluminium	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
23	DC Cranes	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
24	Durga Bearings	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
25	Eastern Rubber	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
26	Furat Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
27	Filcon	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
28	Fusion Technical Services	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
29	Garuda Gears	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
30	Good Will Industries	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
31	Great Steel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
32	GS Alloys	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
33	GS Fabricators	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
34	Garloc	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
35	Immaculate	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
36	Induction Themal treatment	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
37	Internation Bearing Co	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
38	John Crane	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
39	JS Enterprises	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
40	Kamlesh Steels	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
41	Karthik -Fasteners	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
42	KNS Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
43	Krishna Fab	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
44	KCP	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
45	Kine Electroline	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
46	Haddinakal	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
47	Hitech Industries	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
48	HyMech Industries	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
49	Harshitha Enterprises	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
50	Hydrolink	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
51	Le Met Corp	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
52	Light Metals	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
53	Lishan Hyd Prod.	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
54	Malnad Castings	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
55	Manjira Machine Builders	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
56	Mardia dhatu	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
57	ME Forge Tech	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
58	Mysore Tubes	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
59	Manikanta Steel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
60	Metro Steel (SS)	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
61	Machine Tool Accessories	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
62	Navneet Steels	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
63	Neeta Bellows	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
64	New Sun Foundary	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
65	Nyloking Belting	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
66	Narbada Bearings	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
67	Onkar Bearing Co	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
68	Orient Fab	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
69	ORTC	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
70	Panch Dhatu	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
71	Pemco Bellows	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
72	Perumal Transport	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
73	Plymech Industries	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
74	PMS Engineers	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
75	PREAC Cylinders	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
76	Quality Grinders	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
77	Radius Engg.	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
78	Rapal Systems	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
79	RGK Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
80	Santino Steel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
81	Sakshi Steel	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
82	Saloc Technologie	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
83	SAN Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
84	Seal Well	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
85	Shanti Gears	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
86	Sneha Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
87	SR Aluminium	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
88	Sri Chanani Aly Stl	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
89	Sri Shivshakti Ind.	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
90	Sri Varu Enterprises	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
91	Suhner	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
92	Surya Steels And Alloys	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
93	Technicks India	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
94	The New Ball Bearing Co.	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
95	The Rubber House	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
96	Yes Peee Engg	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
97	Technotool Solution Indian LLP	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
98	Nayana Tooling System	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
99	MRR Enterprises	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
100	Manjunatha Enterprises	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
101	KGN TOOLs	2026-03-31 14:00:14.073469+05:30	2026-03-31 14:00:14.073469+05:30
1	Accu Spiral	2026-03-31 14:00:14.073469+05:30	2026-05-04 14:18:03.762866+05:30
\.


--
-- Data for Name: component_issues; Type: TABLE DATA; Schema: maintenance; Owner: -
--

COPY maintenance.component_issues (id, machine_id, reported_by, component_status, production_order_id, part_id, description, reported_at) FROM stdin;
16	14	3	not available	95	1409	broken	2026-04-22 11:00:38
\.


--
-- Data for Name: help_support; Type: TABLE DATA; Schema: maintenance; Owner: -
--

COPY maintenance.help_support (id, machine_id, reported_by, production_order_id, part_id, description, reported_at, mc_reply, replied_by, replied_at) FROM stdin;
5	26	12	113	1433	machine needs to be cooled	2026-04-20 14:17:39	completed	32	2026-04-20 14:18:19.125388
8	13	12	113	1433	need help	2026-04-27 10:36:39	OK	32	2026-05-05 10:40:33.464299
9	27	12	114	1439	help	2026-05-07 15:33:26	\N	\N	\N
12	22	12	30	1515	breakdown	2026-05-21 14:20:57	done	32	2026-05-21 14:21:34.478647
\.


--
-- Data for Name: machine_breakdown; Type: TABLE DATA; Schema: maintenance; Owner: -
--

COPY maintenance.machine_breakdown (id, machine_id, reported_by, issue_category, machine_status, issue_reason, additional_reason, reported_at) FROM stdin;
16	36	5	Performance	OFF	mechanical issue|hydraulic issue	Pydantic	2026-03-25 16:37:18
17	25	5	Quality	OFF	hydraulic issue|pneumatic issue	wearout	2026-03-26 16:05:40
18	13	12	Quality	OFF	machine breakdown|mechanical issue	\N	2026-04-29 12:05:47
19	26	12	Performance	OFF	machine breakdown	\N	2026-05-29 11:33:26
\.


--
-- Data for Name: oee_issues; Type: TABLE DATA; Schema: maintenance; Owner: -
--

COPY maintenance.oee_issues (id, machine_id, reported_by, issue_category, issue_reason, start_time, end_time, reported_at) FROM stdin;
26	36	5	Performance	tool change|setup/adjustment	2026-03-25 04:05:05	2026-03-25 21:04:04	2026-03-25 16:36:16
27	36	5	Performance	setup/adjustment|power failure|material shortage	2026-03-25 17:17:20	2026-03-28 00:00:00	2026-03-25 17:17:34
28	13	12	Availability	machine oeeissue	2026-04-27 00:00:00	2026-04-29 00:00:00	2026-04-27 10:27:06
\.


--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.activity_log (id, entity_type, entity_id, action, order_id, user_id, user_name, "timestamp", details, created_at, user_role) FROM stdin;
1	part	1571	created	32	32	bharath	2026-05-23 17:08:17.769297+05:30	{"part_name": "demo", "part_number": "demo"}	2026-05-23 17:08:16.715872+05:30	manufacturing_coordinator
2	part	1571	soft_deleted	32	32	bharath	2026-05-23 17:09:37.890163+05:30	{"part_name": "demo", "part_number": "demo"}	2026-05-23 17:09:36.83594+05:30	manufacturing_coordinator
3	operation	16	updated	32	32	bharath	2026-05-23 17:13:34.969287+05:30	{"operation_name": "Milling", "operation_number": "20", "changed_fields": ["operation_name", "part_type_id", "from_date", "to_date", "setup_time", "cycle_time", "workcenter_id", "machine_id", "work_instructions", "notes"]}	2026-05-23 17:13:33.905163+05:30	manufacturing_coordinator
6	operation	18	updated	32	32	bharath	2026-05-23 17:37:45.545778+05:30	{"operation_name": "Milling", "operation_number": "20", "changes": {"operation_name": {"old": "Milling", "new": "Milling"}, "part_type_id": {"old": 1, "new": 1}, "from_date": {"old": "None", "new": "None"}, "to_date": {"old": "None", "new": "None"}, "setup_time": {"old": "00:12:00", "new": "00:12:00"}, "cycle_time": {"old": "03:48:00", "new": "03:48:00"}, "workcenter_id": {"old": 3, "new": 3}, "machine_id": {"old": 13, "new": 13}, "work_instructions": {"old": "Maintain concentricity <0.02mm\\r\\n\\r\\nCheck runout before removal", "new": "Maintain concentricity <0.02mm\\r\\n\\r\\nCheck runout before removal"}, "notes": {"old": "None", "new": "None"}, "vendor_id": {"old": "None", "new": "None"}}}	2026-05-23 17:37:44.486283+05:30	manufacturing_coordinator
7	operation	389	updated	30	16	admin	2026-05-25 09:44:51.241246+05:30	{"operation_name": "Gear Cutting", "operation_number": "30", "changes": {"operation_name": {"old": "Gear Cutting", "new": "Gear Cutting"}, "part_type_id": {"old": 1, "new": 1}, "from_date": {"old": "None", "new": "None"}, "to_date": {"old": "None", "new": "None"}, "setup_time": {"old": "00:15:00", "new": "00:15:00"}, "cycle_time": {"old": "02:40:00", "new": "02:40:00"}, "workcenter_id": {"old": 3, "new": 3}, "machine_id": {"old": 20, "new": 14}, "work_instructions": {"old": "None", "new": "None"}, "notes": {"old": "None", "new": "None"}, "vendor_id": {"old": "None", "new": "None"}}}	2026-05-25 09:44:48.268559+05:30	admin
8	part	59	updated	30	16	admin	2026-05-25 09:46:20.875468+05:30	{"part_name": "Sub Assembly A11", "part_number": "A-PRT-002", "changes": {"part_name": {"old": "Sub Assembly A11", "new": "Sub Assembly A11"}, "part_number": {"old": "A-PRT-002", "new": "A-PRT-002"}, "type_id": {"old": 1, "new": 1}, "part_detail": {"old": "None", "new": "None"}, "assembly_id": {"old": 30, "new": 30}, "product_id": {"old": 15, "new": 15}, "user_id": {"old": 16, "new": 16}, "qty": {"old": 10, "new": 20}, "size": {"old": "Custom", "new": "Custom"}}}	2026-05-25 09:46:17.909391+05:30	admin
9	part	59	updated	30	16	admin	2026-05-25 09:46:46.063231+05:30	{"part_name": "Sub Assembly A11", "part_number": "A-PRT-002", "changes": {"part_name": {"old": "Sub Assembly A11", "new": "Sub Assembly A11"}, "part_number": {"old": "A-PRT-002", "new": "A-PRT-002"}, "type_id": {"old": 1, "new": 1}, "part_detail": {"old": "None", "new": "None"}, "assembly_id": {"old": 30, "new": 30}, "product_id": {"old": 15, "new": 15}, "user_id": {"old": 16, "new": 16}, "qty": {"old": 20, "new": 10}, "size": {"old": "Custom", "new": "Custom"}}}	2026-05-25 09:46:43.096438+05:30	admin
10	part	1572	soft_deleted	30	20	Ramesh	2026-05-25 11:09:04.56649+05:30	{"part_name": "Housing", "part_number": "0009-3"}	2026-05-25 11:09:01.604582+05:30	project_coordinator
11	part	1572	deleted	30	20	Ramesh	2026-05-25 11:09:36.103512+05:30	{"part_name": "Housing", "part_number": "0009-3", "permanent": true}	2026-05-25 11:09:33.14386+05:30	project_coordinator
12	part	1573	created	32	16	admin	2026-05-25 15:16:07.103693+05:30	{"part_name": "kyu", "part_number": "yuky7u"}	2026-05-25 15:16:04.716088+05:30	admin
13	part	1573	soft_deleted	32	16	admin	2026-05-25 15:17:27.855805+05:30	{"part_name": "kyu", "part_number": "yuky7u"}	2026-05-25 15:17:25.472799+05:30	admin
14	part	1573	deleted	32	16	admin	2026-05-25 15:17:33.642604+05:30	{"part_name": "kyu", "part_number": "yuky7u", "permanent": true}	2026-05-25 15:17:31.25554+05:30	admin
22	order_document	90	created	147	16	admin	2026-05-25 15:57:07.465606+05:30	{"document_name": "Invoice-AMIL9RXS-0001.pdf", "document_type": "Technical", "order_id": 147}	2026-05-25 15:57:07.463004+05:30	admin
23	order_document	90	deleted	147	16	admin	2026-05-25 15:57:11.482868+05:30	{"document_name": "Invoice-AMIL9RXS-0001.pdf", "document_type": "Technical", "order_id": 147}	2026-05-25 15:57:11.481792+05:30	admin
24	order_document	91	created	113	32	bharath	2026-05-25 15:58:59.854909+05:30	{"document_name": "Invoice-AMIL9RXS-0001.pdf", "document_type": "Purchase Order", "order_id": 113}	2026-05-25 15:58:59.853977+05:30	manufacturing_coordinator
25	order_document	91	deleted	113	32	bharath	2026-05-25 15:59:05.131226+05:30	{"document_name": "Invoice-AMIL9RXS-0001.pdf", "document_type": "Purchase Order", "order_id": 113}	2026-05-25 15:59:05.130271+05:30	manufacturing_coordinator
26	part	26	updated	32	20	Ramesh	2026-05-25 16:44:44.30528+05:30	{"part_name": "Forward Rear Body Section", "part_number": "004", "changes": {"raw_material_id": {"old": 1, "new": "None"}, "raw_material_unit_id": {"old": 575, "new": "None"}, "required_length": {"old": 500.0, "new": "None"}}}	2026-05-25 16:44:44.302858+05:30	project_coordinator
27	part	26	updated	32	20	Ramesh	2026-05-25 16:52:08.970987+05:30	{"part_name": "Forward Rear Body Section", "part_number": "004", "changes": {"raw_material_id": {"old": 1, "new": "None"}, "raw_material_unit_id": {"old": 599, "new": "None"}, "required_length": {"old": 200.0, "new": "None"}}}	2026-05-25 16:52:08.969065+05:30	project_coordinator
28	operation	351	updated	32	16	admin	2026-05-26 09:18:43.33243+05:30	{"operation_name": "milling", "operation_number": "20", "changes": {"operation_name": {"old": "milling", "new": "milling"}, "part_type_id": {"old": 2, "new": 2}, "from_date": {"old": "2026-04-25T14:35:43+05:30", "new": "2026-04-26T03:48:43+00:00"}, "to_date": {"old": "2026-05-29T14:35:43+05:30", "new": "2026-05-29T03:48:43+00:00"}, "setup_time": {"old": "None", "new": "None"}, "cycle_time": {"old": "None", "new": "None"}, "workcenter_id": {"old": "None", "new": "None"}, "machine_id": {"old": "None", "new": "None"}, "work_instructions": {"old": "None", "new": "None"}, "notes": {"old": "None", "new": "None"}, "vendor_id": {"old": 1, "new": 1}}}	2026-05-26 09:18:43.719007+05:30	admin
29	operation	351	updated	32	16	admin	2026-05-26 09:18:54.6626+05:30	{"operation_name": "milling", "operation_number": "20", "changes": {"operation_name": {"old": "milling", "new": "milling"}, "part_type_id": {"old": 2, "new": 2}, "from_date": {"old": "2026-04-26T09:18:43+05:30", "new": "2026-05-26T03:48:54+00:00"}, "to_date": {"old": "2026-05-29T09:18:43+05:30", "new": "2026-05-29T03:48:54+00:00"}, "setup_time": {"old": "None", "new": "None"}, "cycle_time": {"old": "None", "new": "None"}, "workcenter_id": {"old": "None", "new": "None"}, "machine_id": {"old": "None", "new": "None"}, "work_instructions": {"old": "None", "new": "None"}, "notes": {"old": "None", "new": "None"}, "vendor_id": {"old": 1, "new": 1}}}	2026-05-26 09:18:55.039885+05:30	admin
30	part	1515	soft_deleted	30	20	Ramesh	2026-05-26 09:23:44.362962+05:30	{"part_name": "XYZ", "part_number": "PRT-002"}	2026-05-26 09:23:44.362006+05:30	project_coordinator
31	part	1515	restored	30	20	Ramesh	2026-05-26 09:24:04.832595+05:30	{"part_name": "XYZ", "part_number": "PRT-002"}	2026-05-26 09:24:04.831795+05:30	project_coordinator
32	part	1574	created	30	32	bharath	2026-05-26 09:40:26.580082+05:30	{"part_name": "SUZI", "part_number": "NEW_PRT"}	2026-05-26 09:40:26.577865+05:30	manufacturing_coordinator
72	part	37	updated	32	20	Ramesh	2026-05-29 17:42:04.243179+05:30	{"part_name": "Tertiary Wing Section", "part_number": "ASS1-03-006", "changes": {"raw_material_id": {"old": 1, "new": "None"}, "raw_material_unit_id": {"old": 600, "new": "None"}, "required_length": {"old": 10.0, "new": "None"}}}	2026-05-29 17:42:01.265109+05:30	project_coordinator
33	part	1574	updated	30	20	Ramesh	2026-05-26 09:48:17.508764+05:30	{"part_name": "SUZI", "part_number": "NEW_PRT", "changes": {"part_name": {"old": "SUZI", "new": "SUZI"}, "part_number": {"old": "NEW_PRT", "new": "NEW_PRT"}, "type_id": {"old": 1, "new": 1}, "raw_material_id": {"old": 22, "new": "None"}, "part_detail": {"old": "None", "new": "None"}, "assembly_id": {"old": 28, "new": 28}, "product_id": {"old": 15, "new": 15}, "user_id": {"old": 32, "new": 20}, "qty": {"old": 10, "new": 10}, "size": {"old": "100*100*100", "new": "100x100x100"}}}	2026-05-26 09:48:17.507458+05:30	project_coordinator
34	part	1574	soft_deleted	30	20	Ramesh	2026-05-26 09:52:21.555303+05:30	{"part_name": "SUZI", "part_number": "NEW_PRT"}	2026-05-26 09:52:21.55382+05:30	project_coordinator
35	part	1574	deleted	30	20	Ramesh	2026-05-26 09:52:37.767132+05:30	{"part_name": "SUZI", "part_number": "NEW_PRT", "permanent": true}	2026-05-26 09:52:37.764243+05:30	project_coordinator
36	part	26	updated	32	20	Ramesh	2026-05-26 09:53:21.602761+05:30	{"part_name": "Forward Rear Body Section", "part_number": "004", "changes": {"raw_material_id": {"old": 22, "new": "None"}, "raw_material_unit_id": {"old": 602, "new": "None"}, "required_length": {"old": 1.0, "new": "None"}}}	2026-05-26 09:53:21.601376+05:30	project_coordinator
37	document	301	created	32	\N	\N	2026-05-26 10:29:55.501254+05:30	{"document_name": "Part_Report_A-PRT-002.pdf", "document_type": "mpp"}	2026-05-26 10:29:55.499087+05:30	\N
38	document	296	deleted	30	16	admin	2026-05-27 09:38:51.21677+05:30	{"document_name": "Part_Report_005", "document_type": "2D"}	2026-05-27 09:38:49.164372+05:30	admin
39	document	303	created	30	20	Ramesh	2026-05-27 09:39:14.761275+05:30	{"document_name": "product-bom-Product 15", "document_type": "2D"}	2026-05-27 09:39:12.728452+05:30	project_coordinator
40	document	295	deleted	30	16	admin	2026-05-27 09:39:26.250837+05:30	{"document_name": "Part_Report_005", "document_type": "2D"}	2026-05-27 09:39:24.217319+05:30	admin
41	document	295	deleted	30	16	admin	2026-05-27 09:39:44.720208+05:30	{"document_name": "Part_Report_005", "document_type": "2D"}	2026-05-27 09:39:42.694738+05:30	admin
42	document	303	deleted	30	20	Ramesh	2026-05-27 09:39:59.78054+05:30	{"document_name": "product-bom-Product 15", "document_type": "2D"}	2026-05-27 09:39:57.753303+05:30	project_coordinator
43	document	295	deleted	30	16	admin	2026-05-27 09:40:03.114835+05:30	{"document_name": "Part_Report_005", "document_type": "2D"}	2026-05-27 09:40:01.091537+05:30	admin
44	document	305	created	30	20	Ramesh	2026-05-27 09:59:59.473025+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-27 09:59:57.486721+05:30	project_coordinator
45	document	305	deleted	30	20	Ramesh	2026-05-27 10:08:29.985304+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-27 10:08:28.02872+05:30	project_coordinator
46	document	306	created	30	20	Ramesh	2026-05-27 10:10:49.225731+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-27 10:10:47.275043+05:30	project_coordinator
47	document	307	created	30	20	Ramesh	2026-05-27 10:11:07.440659+05:30	{"document_name": "helical bevel gear (2)", "document_type": "3D"}	2026-05-27 10:11:05.48933+05:30	project_coordinator
48	document	306	deleted	30	20	Ramesh	2026-05-27 10:11:25.958761+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-27 10:11:24.005784+05:30	project_coordinator
49	document	307	deleted	30	20	Ramesh	2026-05-27 10:11:30.023395+05:30	{"document_name": "helical bevel gear (2)", "document_type": "3D"}	2026-05-27 10:11:28.068541+05:30	project_coordinator
50	document	308	created	30	20	Ramesh	2026-05-27 10:12:55.048644+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-27 10:12:53.100681+05:30	project_coordinator
51	document	309	created	30	20	Ramesh	2026-05-27 10:13:17.143708+05:30	{"document_name": "threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_", "document_type": "3D"}	2026-05-27 10:13:15.197178+05:30	project_coordinator
52	document	310	created	30	20	Ramesh	2026-05-27 10:13:45.887707+05:30	{"document_name": "101-1-4", "document_type": "2D"}	2026-05-27 10:13:43.949503+05:30	project_coordinator
53	document	289	deleted	30	16	admin	2026-05-27 11:26:45.315677+05:30	{"document_name": "211091230056-Body Braze Washer (BTKu 375 P)_01", "document_type": "2D"}	2026-05-27 11:26:43.548917+05:30	admin
54	document	313	created	30	20	Ramesh	2026-05-27 11:28:27.018828+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:28:25.254323+05:30	project_coordinator
55	document	314	created	30	20	Ramesh	2026-05-27 11:30:19.126367+05:30	{"document_name": "straight_fitting_", "document_type": "3D"}	2026-05-27 11:30:17.365457+05:30	project_coordinator
56	document	313	deleted	30	20	Ramesh	2026-05-27 11:38:46.474677+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:38:44.730352+05:30	project_coordinator
57	document	314	deleted	30	20	Ramesh	2026-05-27 11:38:49.540245+05:30	{"document_name": "straight_fitting_", "document_type": "3D"}	2026-05-27 11:38:47.806767+05:30	project_coordinator
58	document	317	created	30	20	Ramesh	2026-05-27 11:40:15.513675+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:40:13.781761+05:30	project_coordinator
59	document	318	created	30	20	Ramesh	2026-05-27 11:40:54.62433+05:30	{"document_name": "Tube_29-SLIDE_ASSEM", "document_type": "3D"}	2026-05-27 11:40:52.885946+05:30	project_coordinator
60	document	317	deleted	30	20	Ramesh	2026-05-27 11:46:10.825713+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:46:09.10229+05:30	project_coordinator
61	document	318	deleted	30	20	Ramesh	2026-05-27 11:46:12.583315+05:30	{"document_name": "Tube_29-SLIDE_ASSEM", "document_type": "3D"}	2026-05-27 11:46:10.860458+05:30	project_coordinator
62	document	319	created	30	20	Ramesh	2026-05-27 11:46:43.673186+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:46:41.958955+05:30	project_coordinator
63	document	320	created	30	20	Ramesh	2026-05-27 11:47:09.398577+05:30	{"document_name": "MOTOR_MOUNT", "document_type": "3D"}	2026-05-27 11:47:07.673134+05:30	project_coordinator
64	document	319	deleted	30	20	Ramesh	2026-05-27 11:52:55.683657+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-27 11:52:53.975415+05:30	project_coordinator
65	document	320	deleted	30	20	Ramesh	2026-05-27 11:52:57.682164+05:30	{"document_name": "MOTOR_MOUNT", "document_type": "3D"}	2026-05-27 11:52:55.979159+05:30	project_coordinator
66	document	321	created	30	20	Ramesh	2026-05-27 11:53:45.800116+05:30	{"document_name": "straight_fitting_", "document_type": "3D"}	2026-05-27 11:53:44.100625+05:30	project_coordinator
67	document	322	created	30	20	Ramesh	2026-05-27 11:53:45.843217+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-27 11:53:44.140829+05:30	project_coordinator
68	document	310	deleted	30	20	Ramesh	2026-05-27 14:45:58.094249+05:30	{"document_name": "101-1-4", "document_type": "2D"}	2026-05-27 14:45:56.78437+05:30	project_coordinator
69	operation	470	updated	30	16	admin	2026-05-29 12:18:21.222911+05:30	{"operation_name": "CYL GRINDING", "operation_number": "20", "changes": {"operation_name": {"old": "CYL GRINDING", "new": "CYL GRINDING"}, "part_type_id": {"old": 1, "new": 1}, "from_date": {"old": "None", "new": "None"}, "to_date": {"old": "None", "new": "None"}, "setup_time": {"old": "00:03:03", "new": "00:03:03"}, "cycle_time": {"old": "00:04:04", "new": "00:04:04"}, "workcenter_id": {"old": 7, "new": 6}, "machine_id": {"old": 34, "new": 33}, "work_instructions": {"old": "None", "new": "None"}, "notes": {"old": "None", "new": "None"}, "vendor_id": {"old": "None", "new": "None"}}}	2026-05-29 12:18:19.266419+05:30	admin
70	part	59	updated	30	16	admin	2026-05-29 16:32:34.200876+05:30	{"part_name": "Sub Assembly A11", "part_number": "A-PRT-002", "changes": {"raw_material_id": {"old": 1, "new": "None"}, "raw_material_unit_id": {"old": 545, "new": "None"}, "required_length": {"old": 150.0, "new": "None"}}}	2026-05-29 16:32:34.198693+05:30	admin
71	document	298	deleted	32	20	Ramesh	2026-05-29 17:22:08.153869+05:30	{"document_name": "Pi7_Tool_Annexure 1", "document_type": "2D"}	2026-05-29 17:22:05.156898+05:30	project_coordinator
73	order	148	order_approved	148	16	admin	2026-05-29 18:04:54.206811+05:30	{"approval_status": "Approved", "approval_remarks": "dqswD", "sale_order_number": "DEMO1E2R2", "project_name": null}	2026-05-29 18:04:54.205695+05:30	admin
74	order	148	order_rejected	148	16	admin	2026-05-29 18:06:36.736313+05:30	{"approval_status": "Rejected", "approval_remarks": "dqswD", "sale_order_number": "DEMO1E2R2", "project_name": null}	2026-05-29 18:06:36.735506+05:30	admin
75	document	323	created	32	20	Ramesh	2026-05-29 18:11:33.603605+05:30	{"document_name": "Pi7_Tool_Annexure 1", "document_type": "3D"}	2026-05-29 18:11:33.594475+05:30	project_coordinator
76	document	323	deleted	32	20	Ramesh	2026-05-29 18:11:39.917648+05:30	{"document_name": "Pi7_Tool_Annexure 1", "document_type": "3D"}	2026-05-29 18:11:39.913402+05:30	project_coordinator
77	document	324	created	30	20	Ramesh	2026-05-30 11:01:37.173632+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-30 11:01:37.159883+05:30	project_coordinator
78	part	1575	created	30	20	Ramesh	2026-05-30 11:17:47.641465+05:30	{"part_name": "demo", "part_number": "demo"}	2026-05-30 11:17:47.637405+05:30	project_coordinator
79	document	325	deleted	30	20	Ramesh	2026-05-30 12:21:52.644234+05:30	{"document_name": "Back Plate", "document_type": "2D"}	2026-05-30 12:21:52.614003+05:30	project_coordinator
80	document	326	deleted	30	20	Ramesh	2026-05-30 12:21:54.304786+05:30	{"document_name": "Back Plate", "document_type": "3D"}	2026-05-30 12:21:54.292846+05:30	project_coordinator
81	document	328	created	30	20	Ramesh	2026-05-30 12:22:37.991433+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-30 12:22:37.987237+05:30	project_coordinator
82	document	328	mc_acknowledged	30	32	bharath	2026-05-30 13:22:01.742861+05:30	{"action": "acknowledged", "remarks": "Ok"}	2026-05-30 13:22:01.732705+05:30	manufacturing_coordinator
83	document	329	created	30	20	Ramesh	2026-05-30 13:22:21.904869+05:30	{"document_name": "Encoder Seat", "document_type": "2D"}	2026-05-30 13:22:21.900401+05:30	project_coordinator
84	document	329	mc_rejected	30	32	bharath	2026-05-30 13:22:48.32282+05:30	{"action": "rejected", "remarks": "Reject"}	2026-05-30 13:22:48.312604+05:30	manufacturing_coordinator
85	document	327	deleted	30	20	Ramesh	2026-05-30 13:25:17.466229+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-30 13:25:17.447305+05:30	project_coordinator
86	document	327	deleted	30	20	Ramesh	2026-05-30 13:25:23.024556+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-30 13:25:23.018219+05:30	project_coordinator
87	document	329	deleted	30	20	Ramesh	2026-05-30 13:26:13.000741+05:30	{"document_name": "Encoder Seat", "document_type": "2D"}	2026-05-30 13:26:12.983539+05:30	project_coordinator
88	document	328	deleted	30	20	Ramesh	2026-05-30 13:26:23.642985+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-30 13:26:23.630021+05:30	project_coordinator
89	document	329	deleted	30	20	Ramesh	2026-05-30 13:27:32.909373+05:30	{"document_name": "Encoder Seat", "document_type": "2D"}	2026-05-30 13:27:32.878713+05:30	project_coordinator
90	document	328	deleted	30	20	Ramesh	2026-05-30 13:27:40.772926+05:30	{"document_name": "Encoder Cover", "document_type": "2D"}	2026-05-30 13:27:40.759749+05:30	project_coordinator
91	document	327	deleted	30	20	Ramesh	2026-05-30 13:27:43.672845+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-30 13:27:43.665574+05:30	project_coordinator
92	document	330	deleted	30	20	Ramesh	2026-05-30 13:29:56.852569+05:30	{"document_name": "BASE PLATE REFER - Copy", "document_type": "2D"}	2026-05-30 13:29:56.830217+05:30	project_coordinator
93	document	331	deleted	30	20	Ramesh	2026-05-30 13:29:58.307631+05:30	{"document_name": "BASE PLATE REFER - Copy", "document_type": "3D"}	2026-05-30 13:29:58.2932+05:30	project_coordinator
94	document	332	deleted	30	20	Ramesh	2026-05-30 13:31:27.822891+05:30	{"document_name": "BASE PLATE REFER - Copy", "document_type": "2D"}	2026-05-30 13:31:27.658717+05:30	project_coordinator
95	document	333	deleted	30	20	Ramesh	2026-05-30 13:31:29.633686+05:30	{"document_name": "BASE PLATE REFER - Copy", "document_type": "3D"}	2026-05-30 13:31:29.620143+05:30	project_coordinator
96	document	334	deleted	30	20	Ramesh	2026-05-30 13:32:15.647163+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-30 13:32:15.621811+05:30	project_coordinator
97	document	335	deleted	30	20	Ramesh	2026-05-30 13:32:19.535907+05:30	{"document_name": "Balancer 60", "document_type": "3D"}	2026-05-30 13:32:19.449323+05:30	project_coordinator
98	document	336	mc_acknowledged	30	32	bharath	2026-05-30 13:38:34.547482+05:30	{"action": "acknowledged", "remarks": "ok bro"}	2026-05-30 13:38:34.540178+05:30	manufacturing_coordinator
99	document	337	mc_rejected	30	32	bharath	2026-05-30 13:40:30.739095+05:30	{"action": "rejected", "remarks": "Rejected bro"}	2026-05-30 13:40:30.737821+05:30	manufacturing_coordinator
100	document	321	deleted	30	20	Ramesh	2026-05-30 14:03:17.081013+05:30	{"document_name": "straight_fitting_", "document_type": "3D"}	2026-05-30 14:03:17.074045+05:30	project_coordinator
101	document	322	deleted	30	20	Ramesh	2026-05-30 14:03:20.19884+05:30	{"document_name": "Balancer 60", "document_type": "2D"}	2026-05-30 14:03:20.193522+05:30	project_coordinator
102	part	59	soft_deleted	30	16	admin	2026-05-30 14:03:30.903609+05:30	{"part_name": "Sub Assembly A11", "part_number": "A-PRT-002"}	2026-05-30 14:03:30.902399+05:30	admin
103	part	59	deleted	30	16	admin	2026-05-30 14:03:40.392925+05:30	{"part_name": "Sub Assembly A11", "part_number": "A-PRT-002", "permanent": true}	2026-05-30 14:03:40.392224+05:30	admin
104	document	338	mc_acknowledged	32	34	vignesh	2026-05-30 14:57:25.177569+05:30	{"action": "acknowledged", "remarks": "ok "}	2026-05-30 14:57:25.170658+05:30	manufacturing_coordinator
105	document	339	mc_rejected	32	34	vignesh	2026-05-30 14:57:29.435541+05:30	{"action": "rejected", "remarks": "sorry"}	2026-05-30 14:57:29.432453+05:30	manufacturing_coordinator
106	document	340	deleted	32	16	admin	2026-05-30 15:05:49.893205+05:30	{"document_name": "BASE PLATE REFER - Copy", "document_type": "2D"}	2026-05-30 15:05:49.878201+05:30	admin
107	document	342	deleted	32	20	Ramesh	2026-05-30 15:07:04.582762+05:30	{"document_name": "threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_.125_IN_", "document_type": "2D"}	2026-05-30 15:07:04.577595+05:30	project_coordinator
108	document	343	created	32	20	Ramesh	2026-05-30 15:27:26.699761+05:30	{"document_name": "threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_", "document_type": "3D"}	2026-05-30 15:27:26.689976+05:30	project_coordinator
109	document	343	mc_acknowledged	32	34	vignesh	2026-05-30 15:29:02.389429+05:30	{"action": "acknowledged", "remarks": "ok"}	2026-05-30 15:29:02.383823+05:30	manufacturing_coordinator
\.


--
-- Data for Name: component_issues_notification; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.component_issues_notification (id, comp_issues_id, is_ack, ack_by, ack_at, created_at, updated_at) FROM stdin;
1	9	t	admin	2026-03-07 09:27:57.401524+05:30	2026-03-06 16:42:19.588755+05:30	2026-03-07 09:27:55.936862+05:30
4	11	t	admin	2026-03-09 10:58:09.246077+05:30	2026-03-09 10:48:51.965061+05:30	2026-03-09 10:58:07.907678+05:30
5	13	f	\N	\N	2026-03-25 16:38:29.9718+05:30	2026-03-25 16:38:29.9718+05:30
6	14	f	\N	\N	2026-03-31 14:02:34.996131+05:30	2026-03-31 14:02:34.996131+05:30
7	1	f	\N	\N	2026-04-13 14:57:30.307079+05:30	2026-04-13 14:57:30.307079+05:30
8	2	f	\N	\N	2026-04-13 15:09:24.244963+05:30	2026-04-13 15:09:24.244963+05:30
9	3	f	\N	\N	2026-04-13 16:23:41.695412+05:30	2026-04-13 16:23:41.695412+05:30
10	15	f	\N	\N	2026-04-20 11:39:24.655212+05:30	2026-04-20 11:39:24.655212+05:30
11	4	f	\N	\N	2026-04-20 12:15:00.640958+05:30	2026-04-20 12:15:00.640958+05:30
12	5	f	\N	\N	2026-04-20 14:17:40.945611+05:30	2026-04-20 14:17:40.945611+05:30
13	6	f	\N	\N	2026-04-20 17:56:23.844857+05:30	2026-04-20 17:56:23.844857+05:30
14	7	f	\N	\N	2026-04-22 10:58:31.01012+05:30	2026-04-22 10:58:31.01012+05:30
15	16	f	\N	\N	2026-04-22 11:00:40.232914+05:30	2026-04-22 11:00:40.232914+05:30
16	8	f	\N	\N	2026-04-27 10:36:40.421672+05:30	2026-04-27 10:36:40.421672+05:30
18	18	f	\N	\N	2026-04-30 17:22:56.755406+05:30	2026-04-30 17:22:56.755406+05:30
17	17	t	admin	2026-04-30 17:23:11.83892+05:30	2026-04-30 17:21:55.685717+05:30	2026-04-30 17:23:05.975959+05:30
19	9	f	\N	\N	2026-05-07 15:33:25.485586+05:30	2026-05-07 15:33:25.485586+05:30
20	10	f	\N	\N	2026-05-13 17:21:52.622532+05:30	2026-05-13 17:21:52.622532+05:30
21	11	f	\N	\N	2026-05-20 15:29:28.291945+05:30	2026-05-20 15:29:28.291945+05:30
22	12	f	\N	\N	2026-05-21 14:20:58.049078+05:30	2026-05-21 14:20:58.049078+05:30
\.


--
-- Data for Name: inspection_notifications; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.inspection_notifications (id, order_id, part_number, op_no, operation_id, machine_id, requested_by_username, is_ack, ack_by, ack_at, created_at, updated_at, category) FROM stdin;
2	114	00987	20	382	33	operator	t	supervisor	2026-04-16 12:08:23.855402+05:30	2026-04-16 12:06:10.226985+05:30	2026-04-16 12:09:05.942948+05:30	plan_request
3	114	0098712	20	402	18	operator	t	supervisor	2026-04-22 10:55:45.759765+05:30	2026-04-22 10:51:32.874313+05:30	2026-04-22 10:56:58.906053+05:30	plan_request
4	114	00987	30	404	\N	operator	t	supervisor	2026-04-22 12:14:27.71803+05:30	2026-04-22 12:15:07.471563+05:30	2026-04-22 12:15:40.872542+05:30	ftp_request
5	114	00987	30	404	\N	operator	t	supervisor	2026-04-24 10:12:14.586481+05:30	2026-04-22 12:15:54.969157+05:30	2026-04-24 10:13:27.917812+05:30	ftp_request
15	32	002	20	18	\N	operator	t	supervisor	2026-05-05 15:18:11.225257+05:30	2026-05-05 14:41:05.88768+05:30	2026-05-05 15:19:29.311036+05:30	ftp_request
8	114	0078	10	401	\N	operator	t	supervisor	2026-05-05 15:18:18.563661+05:30	2026-04-28 10:31:58.504278+05:30	2026-05-05 15:19:36.651892+05:30	ftp_request
17	114	part7	10	410	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:12.004964+05:30	2026-05-06 10:16:49.5763+05:30	2026-05-06 10:43:30.32499+05:30	plan_request
16	114	97986	10	408	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:13.648289+05:30	2026-05-05 15:50:24.093873+05:30	2026-05-06 10:43:31.965952+05:30	plan_request
14	32	002	20	18	13	operator	t	supervisor	2026-05-06 10:42:14.462672+05:30	2026-05-05 14:36:33.723228+05:30	2026-05-06 10:43:32.782222+05:30	plan_request
13	114	00987	0	0	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:15.12539+05:30	2026-05-05 14:22:03.708839+05:30	2026-05-06 10:43:33.444869+05:30	plan_request
12	114	00098345	0	0	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:15.912318+05:30	2026-04-29 12:12:11.656643+05:30	2026-05-06 10:43:34.231732+05:30	plan_request
11	114	0078	0	0	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:17.065967+05:30	2026-04-29 12:11:26.19457+05:30	2026-05-06 10:43:35.385893+05:30	plan_request
6	114	0078	10	401	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:19.510316+05:30	2026-04-28 10:15:24.857115+05:30	2026-05-06 10:43:37.830939+05:30	plan_request
7	114	00098345	20	407	0	Plan Confirmed by admin	t	supervisor	2026-05-06 10:42:20.166916+05:30	2026-04-28 10:22:53.406191+05:30	2026-05-06 10:43:38.486878+05:30	plan_request
9	114	00089	0	0	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:20.745316+05:30	2026-04-28 17:16:28.646598+05:30	2026-05-06 10:43:39.065943+05:30	plan_request
10	114	0098712	0	0	0	Plan Confirmed by supervisor	t	supervisor	2026-05-06 10:42:21.45696+05:30	2026-04-29 11:37:12.187194+05:30	2026-05-06 10:43:39.776583+05:30	plan_request
18	114	00098345	10	411	0	Plan Confirmed by supervisor	f	\N	\N	2026-05-06 11:09:08.96959+05:30	2026-05-06 11:09:08.96959+05:30	plan_request
19	114	0078	20	409	0	Plan Confirmed by supervisor	f	\N	\N	2026-05-06 14:25:07.992903+05:30	2026-05-06 14:25:07.992903+05:30	plan_request
20	114	00089	10	377	0	Plan Confirmed by supervisor	f	\N	\N	2026-05-06 14:31:47.165559+05:30	2026-05-06 14:31:47.165559+05:30	plan_request
21	114	0098712	10	381	0	Plan Confirmed by supervisor	f	\N	\N	2026-05-07 10:12:13.295903+05:30	2026-05-07 10:12:13.295903+05:30	plan_request
22	114	0098712	30	403	0	Plan Confirmed by supervisor	f	\N	\N	2026-05-07 11:48:52.03003+05:30	2026-05-07 11:48:52.03003+05:30	plan_request
\.


--
-- Data for Name: machine_calibration_notification; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.machine_calibration_notification (id, machine_id, is_ack, ack_by, ack_at, created_at, updated_at) FROM stdin;
3	24	t	admin	2026-03-07 14:58:47.903753+05:30	2026-03-07 14:57:15.620246+05:30	2026-03-07 14:58:45.965806+05:30
2	35	t	admin	2026-03-07 14:59:02.707458+05:30	2026-03-07 14:57:15.620246+05:30	2026-03-07 14:59:00.770328+05:30
4	34	t	admin	2026-03-09 09:54:55.758709+05:30	2026-03-07 14:59:49.514321+05:30	2026-03-09 09:54:54.303316+05:30
\.


--
-- Data for Name: machine_notifications; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.machine_notifications (id, machine_breakdown_id, is_ack, ack_by, ack_at, created_at, updated_at) FROM stdin;
1	12	t	admin	2026-03-07 14:58:35.879013+05:30	2026-03-07 14:58:06.645086+05:30	2026-03-07 14:58:33.9421+05:30
2	13	t	admin	2026-03-09 10:58:03.703808+05:30	2026-03-09 10:55:02.545034+05:30	2026-03-09 10:58:02.365707+05:30
7	18	t	admin	2026-04-29 12:11:13.475141+05:30	2026-04-29 12:05:47.451227+05:30	2026-04-29 12:11:13.473108+05:30
8	19	t	admin	2026-05-29 11:33:55.213716+05:30	2026-05-29 11:33:25.418772+05:30	2026-05-29 11:33:53.155289+05:30
3	14	t	admin	2026-05-29 17:56:05.449049+05:30	2026-03-20 17:25:28.745931+05:30	2026-05-29 17:56:02.472942+05:30
5	16	t	admin	2026-05-29 17:56:05.991538+05:30	2026-03-25 16:37:20.882964+05:30	2026-05-29 17:56:03.016522+05:30
6	17	t	admin	2026-05-29 17:56:06.446551+05:30	2026-03-26 16:05:41.079083+05:30	2026-05-29 17:56:03.472573+05:30
\.


--
-- Data for Name: mc_notifications; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.mc_notifications (id, document_id, mc_user_id, is_acknowledged, ack_remarks, ack_at, is_rejected, reject_remarks, reject_at, created_at) FROM stdin;
3	336	32	t	ok bro	2026-05-30 13:38:34.539551+05:30	f	\N	\N	2026-05-30 13:32:45.39511+05:30
4	337	32	f	\N	\N	t	Rejected bro	2026-05-30 13:40:30.738086+05:30	2026-05-30 13:32:45.39511+05:30
5	338	34	t	ok 	2026-05-30 14:57:25.170252+05:30	f	\N	\N	2026-05-30 13:35:29.761442+05:30
6	339	34	f	\N	\N	t	sorry	2026-05-30 14:57:29.433537+05:30	2026-05-30 13:35:29.761442+05:30
8	343	34	t	ok	2026-05-30 15:29:02.386072+05:30	f	\N	\N	2026-05-30 15:27:26.711515+05:30
\.


--
-- Data for Name: order_notifications; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.order_notifications (id, order_id, is_ack, ack_by, ack_at, created_at, updated_at) FROM stdin;
34	114	t	admin	2026-04-30 17:12:49.174385+05:30	2026-04-13 15:15:14.006512+05:30	2026-04-30 17:12:43.307749+05:30
33	113	t	admin	2026-05-21 14:31:41.124901+05:30	2026-04-13 10:02:54.685335+05:30	2026-05-21 14:31:41.28442+05:30
22	102	t	admin	2026-05-21 14:31:41.612953+05:30	2026-04-08 09:55:10.540016+05:30	2026-05-21 14:31:41.771484+05:30
21	101	t	admin	2026-05-21 14:31:42.173224+05:30	2026-04-07 17:43:16.679269+05:30	2026-05-21 14:31:42.332236+05:30
19	99	t	admin	2026-05-21 14:31:42.814864+05:30	2026-04-07 09:08:51.84096+05:30	2026-05-21 14:31:42.973233+05:30
15	95	t	admin	2026-05-21 14:31:43.337+05:30	2026-04-06 14:54:58.308139+05:30	2026-05-21 14:31:43.494346+05:30
9	89	t	admin	2026-05-21 14:31:44.05676+05:30	2026-03-25 16:22:55.349931+05:30	2026-05-21 14:31:44.216567+05:30
51	135	t	admin	2026-05-29 17:53:47.57352+05:30	2026-05-23 17:34:39.089414+05:30	2026-05-29 17:53:44.168262+05:30
\.


--
-- Data for Name: pc_notifications; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.pc_notifications (id, activity_log_id, pc_user_id, is_read, read_at, created_at) FROM stdin;
1	1	20	t	2026-05-23 17:12:28.413785+05:30	2026-05-23 17:08:16.715872+05:30
2	2	20	t	2026-05-23 17:12:34.469489+05:30	2026-05-23 17:09:36.83594+05:30
72	73	20	t	2026-05-29 18:07:05.850749+05:30	2026-05-29 18:04:54.205695+05:30
73	74	20	t	2026-05-29 18:07:05.850749+05:30	2026-05-29 18:06:36.735506+05:30
3	3	20	t	2026-05-23 17:35:40.003654+05:30	2026-05-23 17:13:33.905163+05:30
5	6	20	t	2026-05-25 09:41:43.860356+05:30	2026-05-23 17:37:44.486283+05:30
6	7	20	t	2026-05-25 11:46:55.941343+05:30	2026-05-25 09:44:48.268559+05:30
7	8	20	t	2026-05-25 11:46:55.941343+05:30	2026-05-25 09:46:17.909391+05:30
8	9	20	t	2026-05-25 11:46:55.941912+05:30	2026-05-25 09:46:43.096438+05:30
9	10	20	t	2026-05-25 11:46:55.941912+05:30	2026-05-25 11:09:01.604582+05:30
10	11	20	t	2026-05-25 11:46:55.941912+05:30	2026-05-25 11:09:33.14386+05:30
23	24	16	f	\N	2026-05-25 15:58:59.853977+05:30
24	25	16	f	\N	2026-05-25 15:59:05.130271+05:30
74	75	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-29 18:11:33.594475+05:30
75	76	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-29 18:11:39.913402+05:30
76	77	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 11:01:37.159883+05:30
77	78	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 11:17:47.637405+05:30
78	79	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 12:21:52.614003+05:30
79	80	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 12:21:54.292846+05:30
80	81	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 12:22:37.987237+05:30
81	82	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:22:01.732705+05:30
82	83	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:22:21.900401+05:30
83	84	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:22:48.312604+05:30
84	85	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:25:17.447305+05:30
85	86	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:25:23.018219+05:30
86	87	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:26:12.983539+05:30
87	88	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:26:23.630021+05:30
88	89	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:27:32.878713+05:30
89	90	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:27:40.759749+05:30
90	91	20	t	2026-05-30 13:30:09.097438+05:30	2026-05-30 13:27:43.665574+05:30
91	92	20	t	2026-05-30 13:30:09.09794+05:30	2026-05-30 13:29:56.830217+05:30
92	93	20	t	2026-05-30 13:30:09.09794+05:30	2026-05-30 13:29:58.2932+05:30
93	94	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:31:27.658717+05:30
94	95	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:31:29.620143+05:30
95	96	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:32:15.621811+05:30
96	97	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:32:19.449323+05:30
97	98	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:38:34.540178+05:30
98	99	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 13:40:30.737821+05:30
99	100	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:03:17.074045+05:30
100	101	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:03:20.193522+05:30
101	102	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:03:30.902399+05:30
67	68	20	t	2026-05-27 15:00:21.986698+05:30	2026-05-27 14:45:56.78437+05:30
102	103	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:03:40.392224+05:30
103	104	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:57:25.170658+05:30
104	105	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 14:57:29.432453+05:30
105	106	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 15:05:49.878201+05:30
11	12	20	t	2026-05-29 17:47:18.349092+05:30	2026-05-25 15:16:04.716088+05:30
12	13	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 15:17:25.472799+05:30
13	14	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 15:17:31.25554+05:30
21	22	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 15:57:07.463004+05:30
22	23	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 15:57:11.481792+05:30
25	26	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 16:44:44.302858+05:30
26	27	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-25 16:52:08.969065+05:30
27	28	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:18:43.719007+05:30
28	29	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:18:55.039885+05:30
29	30	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:23:44.362006+05:30
30	31	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:24:04.831795+05:30
31	32	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:40:26.577865+05:30
32	33	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:48:17.507458+05:30
33	34	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:52:21.55382+05:30
34	35	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:52:37.764243+05:30
35	36	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 09:53:21.601376+05:30
36	37	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-26 10:29:55.499087+05:30
37	38	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:38:49.164372+05:30
38	39	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:39:12.728452+05:30
39	40	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:39:24.217319+05:30
40	41	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:39:42.694738+05:30
41	42	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:39:57.753303+05:30
42	43	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:40:01.091537+05:30
43	44	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 09:59:57.486721+05:30
44	45	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 10:08:28.02872+05:30
45	46	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 10:10:47.275043+05:30
46	47	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 10:11:05.48933+05:30
47	48	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 10:11:24.005784+05:30
48	49	20	t	2026-05-29 17:47:18.349994+05:30	2026-05-27 10:11:28.068541+05:30
49	50	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 10:12:53.100681+05:30
50	51	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 10:13:15.197178+05:30
51	52	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 10:13:43.949503+05:30
52	53	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:26:43.548917+05:30
53	54	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:28:25.254323+05:30
54	55	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:30:17.365457+05:30
55	56	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:38:44.730352+05:30
56	57	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:38:47.806767+05:30
57	58	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:40:13.781761+05:30
58	59	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:40:52.885946+05:30
59	60	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:46:09.10229+05:30
60	61	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:46:10.860458+05:30
61	62	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:46:41.958955+05:30
62	63	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:47:07.673134+05:30
63	64	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:52:53.975415+05:30
64	65	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:52:55.979159+05:30
65	66	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:53:44.100625+05:30
66	67	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-27 11:53:44.140829+05:30
68	69	20	t	2026-05-29 17:47:18.350997+05:30	2026-05-29 12:18:19.266419+05:30
69	70	20	t	2026-05-29 17:47:18.351499+05:30	2026-05-29 16:32:34.198693+05:30
70	71	20	t	2026-05-29 17:47:18.351499+05:30	2026-05-29 17:22:05.156898+05:30
71	72	20	t	2026-05-29 17:47:18.351499+05:30	2026-05-29 17:42:01.265109+05:30
106	107	20	t	2026-05-30 15:27:08.892968+05:30	2026-05-30 15:07:04.577595+05:30
107	108	20	f	\N	2026-05-30 15:27:26.689976+05:30
108	109	20	f	\N	2026-05-30 15:29:02.383823+05:30
\.


--
-- Data for Name: tool_issues_notification; Type: TABLE DATA; Schema: notifications; Owner: -
--

COPY notifications.tool_issues_notification (id, tool_issues_id, is_ack, ack_by, ack_at, created_at, updated_at) FROM stdin;
14	3	t	admin	2026-03-13 11:08:01.208754+05:30	2026-03-13 10:57:13.583339+05:30	2026-03-13 11:07:59.09447+05:30
17	1	t	admin	2026-03-20 17:24:48.850783+05:30	2026-03-20 12:35:48.264549+05:30	2026-03-20 17:24:46.131695+05:30
16	1	t	admin	2026-03-20 17:24:49.41836+05:30	2026-03-13 15:35:27.98098+05:30	2026-03-20 17:24:46.704057+05:30
15	4	t	admin	2026-03-20 17:24:50.034389+05:30	2026-03-13 14:54:26.585129+05:30	2026-03-20 17:24:47.319963+05:30
19	3	f	\N	\N	2026-03-23 14:58:47.251376+05:30	2026-03-23 14:58:47.251376+05:30
20	4	f	\N	\N	2026-03-30 15:53:50.279722+05:30	2026-03-30 15:53:50.279722+05:30
21	5	t	admin	2026-04-30 17:20:58.104693+05:30	2026-04-30 12:39:25.098306+05:30	2026-04-30 17:20:52.239858+05:30
22	6	f	\N	\N	2026-05-22 10:37:29.89035+05:30	2026-05-22 10:37:29.89035+05:30
23	7	f	\N	\N	2026-05-22 11:06:08.195807+05:30	2026-05-22 11:06:08.195807+05:30
\.


--
-- Data for Name: assemblies; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.assemblies (id, assembly_name, assembly_number, product_id, parent_id, created_at, updated_at, user_id, recycle_bin) FROM stdin;
23	Protusion System Assembly	ASM-005	14	\N	2026-02-25 15:23:14.484013+05:30	2026-04-02 12:17:21.941526+05:30	20	f
24	Wire Tunnel Assembly	ASM-006	14	\N	2026-02-25 15:23:14.484013+05:30	2026-04-02 12:17:21.941526+05:30	20	f
25	Balance Pins Assembly	ASM-007	14	\N	2026-02-25 15:23:14.484013+05:30	2026-04-02 12:17:21.941526+05:30	20	f
54	assembly	0001	60	\N	2026-04-13 10:03:17.0963+05:30	2026-04-13 10:03:17.0963+05:30	16	f
55	assm1	0009	61	\N	2026-04-13 15:15:25.272989+05:30	2026-05-21 18:59:32.984747+05:30	16	t
28	Primary Control Assembly	CTL-001	15	\N	2026-02-25 15:23:14.484013+05:30	2026-05-22 13:46:14.077111+05:30	20	f
21	Wing Main Assembly	ASM-003	14	\N	2026-02-25 15:23:14.484013+05:30	2026-05-22 14:21:51.028413+05:30	20	f
30	Advanced Control Assembly 	CTL-003	15	28	2026-02-25 15:23:14.484013+05:30	2026-05-22 18:42:43.698424+05:30	32	f
22	Wing Cover Assembly	ASM-004	14	\N	2026-02-25 15:23:14.484013+05:30	2026-05-23 17:07:47.836698+05:30	20	f
\.


--
-- Data for Name: document_extracted_data; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.document_extracted_data (id, document_id, part_id, note, title, stock_size, material, stocksize_kg, net_wt_kg, created_at) FROM stdin;
77	184	1409	C\r\n1. *** : 0025-3 (SLEEVE-2) TO BE SHRINK FIT WITH 0026-3\r\n(BRAZING HOUSING - 2) WITH RADIAL INTERFERENCE OF 20 MICRON (MIN.)\r\n2. TO BE HARDENED TO 50-55 HRC.	SLEEVE  - 2	Ø 40 X 70	EN47	\N	\N	2026-04-06 15:13:41.532384
80	188	24	\N	TEGRATED MOTOR SPINDLE	140(DIA) x 30(LENGTH)	ALUMINIUM ALLOY 6061	1.2 KG	0.2 KG	2026-04-07 16:11:07.596132
145	315	1515	1. ALL SIDES TO BE CHAMFERED TO 0.5 x 45 .\n2. TO BE HARDENED TO 28-30 HRC.	KEYWAY-60	BILLET 20(L)x 20(B) x 20(H)	EN 8	\N	\N	2026-05-27 11:39:50.927098
88	202	1480	1. ALL HOLES TO BE CHAMFERED BY 1 x 45 .\n2. TO BE HARDENED TO 28-30 HRC.	BALANCER-60	CYLINDER 110(DIA) X 25(THICK)	EN 8	1.5 KG	0.5 KG	2026-05-05 14:30:56.316061
89	203	1479	1. ALL EDGES TO BE CHAMFERED TO 0.5 x 45\n2. TO BE HARDENED TO 28 - 30 HRC.\n3. OUTER SURFACE TO BE GLASS BEAD SHOT PEENED AND\nELECTROLYSIS NICKEL PLATED.	NTEGRATED MOTOR SPINDLE	CYLINDER 260(DIA) x 50(LENGTH)	EN8	21 KG	6 KG	2026-05-05 15:41:04.410559
141	308	1519	THIS DRAWING IS THE PROPERTY OF CMTI (A GOVT. OF INDIA SOCIETY). THIS SHOULD NOT BE COPIED OR LENT\nWITHOUT A WRITTEN AUTHORITY FROM CMTI	TEGRATED MOTOR SPINDLE	140(DIA) x 30(LENGTH)	ALUMINIUM ALLOY 6061	1.2 KG	0.2 KG	2026-05-27 10:12:53.444902
90	204	1440	1. ALL SIDES TO BE CHAMFERED TO 0.5 x 45 .\n2. TO BE HARDENED TO 28-30 HRC.	KEYWAY-60	BILLET 20(L)x 20(B) x 20(H)	EN 8	\N	\N	2026-05-05 16:30:30.806807
134	297	36	\N	\N	122 x 1165 x 1380	E548			2026-05-25 09:23:14.197377
137	302	40	\N	\N	\N	\N	\N	\N	2026-05-26 11:57:30.685856
8	37	35	1. Stress releive before and after machining.\r\n2. Casting should be free from defects. B\r\n3. Hole A1 - A12 is for wheel head mounting, Refer Wheel head (03-3-2)\r\n(Wheel head dimensions provided by M/s CoE MTD IIT(BHU)\r\n4. Remove sharp edges.	Wheel head spacer X axis	122 x 1165 x 1380	E548			2026-03-05 12:34:09.106192
157	336	1575	\N	\N	\N	\N	\N	\N	2026-05-30 13:32:47.454493
158	338	214	1. ALL SHARP EDGES TO BE CHAMFERED TO 0.5 x 45 .\n2. TO BE HARDENED TO 58-60 HRC.	BACK BEARING HOUSING	CYLINDER 190(DIA) x 170(LENGTH)	20MnCr5 - DIN 17210	37 KG	15.7 KG	2026-05-30 13:35:31.519628
160	341	214	* BEARING SURFACE......\nGRIND TO MAINTAIN\nFLATNESS BELOW 2\nMICRON\n* TAPERED SURFACE.....\n* HEAT TREATMENT AS PER HT SHEET\n* CHAMFER ALL SHARP\nEDGES MAX. 0.5X45DEG	BASE PLATE	690*480*55	OHNS GRADE: CW1	\N	\N	2026-05-30 15:06:04.347962
83	197	1439	1. ALL EDGES TO BE CHAMFERED TO 0.5 x 45\n2. TO BE HARDENED TO 28 - 30 HRC.\n3. OUTER SURFACE TO BE GLASS BEAD SHOT PEENED AND\nELECTROLYSIS NICKEL PLATED.	NTEGRATED MOTOR SPINDLE	CYLINDER 260(DIA) x 50(LENGTH)	EN8	21 KG	6 KG	2026-04-27 11:50:40.374537
84	198	1440	* BEARING SURFACE......\nGRIND TO MAINTAIN\nFLATNESS BELOW 2\nMICRON\n* TAPERED SURFACE.....\n* HEAT TREATMENT AS PER HT SHEET\n* CHAMFER ALL SHARP\nEDGES MAX. 0.5X45DEG	BASE PLATE	690*480*55	OHNS GRADE: CW1	\N	\N	2026-04-28 17:17:46.235199
85	199	1447	1. TO BE HARDENED TO 28 - 30 HRC.	SPACER-70-L-01	90(DIA) x 30(THICK)	EN 8	0.8 KG	0.12 KG	2026-04-29 11:36:20.986231
86	200	1472	1. ALL EDGES TO BE CHAMFERED TO 0.5 x 45\n2. TO BE HARDENED TO 28-30 HRC.	SPACER-60-L-01	80(DIA) x 60(HEIGHT)	EN 8	1.4 KG	0.28 KG	2026-04-29 12:10:47.308391
118	265	1519	C\n1. *** : 0025-3 (SLEEVE - 2) TO BE SHRINK FIT WITH 0026-3 (BRAZING HOUSING - 2)\nWITH RADIAL INTERFERENCE OF 20 MICRON (MIN.)\n2. TO BE CASE HARDENED TO 58 - 60 HRC\n3. BREAK SHARP EDGES.	RAZING  HOUSING  - 2	Ø 80 x 100	EN353	\N	\N	2026-05-19 15:36:35.732985
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.documents (id, document_name, document_url, document_type, document_version, part_id, parent_id, created_at, updated_at, assembly_id, user_id, is_acknowledged, acknowledged_at) FROM stdin;
337	101-1-4	http://172.18.7.91:9000/cmf/documents/part_1575/20260530_133245_fc036492_AEROTECH-BLM-325_MT300P_MT300P.step	3D	00	1575	\N	2026-05-30 13:32:45.19158+05:30	2026-05-30 13:32:45.19158+05:30	\N	20	f	\N
336	101-1-4	http://172.18.7.91:9000/cmf/documents/part_1575/20260530_133245_b865ff52_101-1-4.pdf	2D	00	1575	\N	2026-05-30 13:32:45.19158+05:30	2026-05-30 13:38:34.540178+05:30	\N	20	t	\N
341	BASE PLATE REFER - Copy	http://172.18.7.91:9000/cmf/documents/part_214/20260530_150603_2c78a038_BASE PLATE REFER - Copy.pdf	2D	00	214	\N	2026-05-30 15:06:03.029096+05:30	2026-05-30 15:06:03.029096+05:30	\N	16	f	\N
37	0001-2	http://172.18.7.91:9000/cmf/documents/part_35/20260305_123402_0001-2.pdf	2D	v1.0	35	\N	2026-03-05 12:34:09.09872+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.901489+05:30
184	0023-3_EN47	http://172.18.7.91:9000/cmf/documents/part_1409/20260406_151341_2317c484_0023-3_EN47.PDF	2D	v1.0	1409	\N	2026-04-06 15:13:41.532384+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.905552+05:30
188	Encoder Cover	http://172.18.7.91:9000/cmf/documents/part_24/20260407_161106_7303b527_Encoder Cover.pdf	2D	v1.0	24	\N	2026-04-07 16:11:07.596132+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.905552+05:30
190	MPP-211090470061-HF Head -BTU 80 C (BEL 3968 I)	http://172.18.7.91:9000/cmf/documents/part_24/20260407_161106_1533df3b_MPP-211090470061-HF Head -BTU 80 C (BEL 3968 I).pdf	MPP	v1.0	24	\N	2026-04-07 16:11:07.596132+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.906552+05:30
285	Invoice-AMIL9RXS-0001	http://172.18.7.91:9000/cmf/documents/assembly_28/20260520_192813_59c9d6e1_Invoice-AMIL9RXS-0001.pdf	2D	00	\N	\N	2026-05-20 19:28:14.023668+05:30	2026-05-30 11:09:36.201967+05:30	28	16	t	\N
294	Part_Report_005	http://172.18.7.91:9000/cmf/documents/assembly_28/20260522_184327_8a934fe4_Part_Report_005.pdf	2D	00	\N	\N	2026-05-22 18:43:27.312159+05:30	2026-05-30 11:09:36.201967+05:30	28	16	t	\N
286	Invoice-AMIL9RXS-0001	http://172.18.7.91:9000/cmf/documents/assembly_28/20260520_192826_4ca5b932_Invoice-AMIL9RXS-0001.pdf	2D	01	\N	285	2026-05-20 19:28:26.26664+05:30	2026-05-30 11:09:36.201967+05:30	28	16	t	\N
265	0026-3	http://172.18.7.91:9000/cmf/documents/part_1519/20260519_153634_b0ac5358_0026-3.pdf	2D	00	1519	\N	2026-05-19 15:36:35.732985+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	\N
282	Pi7_Tool_Annexure 1	http://172.18.7.91:9000/cmf/documents/assembly_28/20260520_192405_188b3f95_Pi7_Tool_Annexure 1.pdf	2D	00	\N	\N	2026-05-20 19:24:06.204591+05:30	2026-05-30 11:09:36.201967+05:30	28	16	t	\N
283	Pi7_Tool_Annexure 1	http://172.18.7.91:9000/cmf/documents/assembly_28/20260520_192419_728fa798_Pi7_Tool_Annexure 1.pdf	2D	01	\N	282	2026-05-20 19:24:19.103225+05:30	2026-05-30 11:09:36.201967+05:30	28	16	t	\N
302	Brochure - NanoshapeT250 IMTEX2023 (1)	http://172.18.7.91:9000/cmf/documents/part_40/20260526_115730_be65c773_Brochure - NanoshapeT250 IMTEX2023 (1).pdf	2D	00	40	\N	2026-05-26 11:57:30.582956+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	\N
339	BBHR	http://172.18.7.91:9000/cmf/documents/part_214/20260530_133529_a7d3cb84_threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_.125_IN_.step	3D	00	214	\N	2026-05-30 13:35:29.725188+05:30	2026-05-30 13:35:29.725188+05:30	\N	20	f	\N
338	BBHR	http://172.18.7.91:9000/cmf/documents/part_214/20260530_133529_d7766680_BBHR.pdf	2D	00	214	\N	2026-05-30 13:35:29.725188+05:30	2026-05-30 14:57:25.170658+05:30	\N	20	t	\N
192	Facing Plate	http://172.18.7.91:9000/cmf/documents/part_26/20260408_050104_c35e1714_Facing Plate.STEP	3D	v1.0	26	\N	2026-04-08 10:31:05.170701+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.906552+05:30
193	helical bevel gear	http://172.18.7.91:9000/cmf/documents/part_34/20260408_092137_f68d2cd1_helical bevel gear.stp	3D	v1.0	34	\N	2026-04-08 14:51:37.824134+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.9077+05:30
194	MPP-211090470061-HF Head -BTU 80 C (BEL 3968 I)	http://172.18.7.91:9000/cmf/documents/part_34/20260408_093250_e4fb776c_MPP-211090470061-HF Head -BTU 80 C (BEL 3968 I).pdf	mpp	v1.0	34	\N	2026-04-08 15:02:50.576403+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.908704+05:30
197	Back Plate	http://172.18.7.91:9000/cmf/documents/part_1439/20260427_115040_d2cce07a_Back Plate.pdf	2D	v1.0	1439	\N	2026-04-27 11:50:40.374537+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.908704+05:30
198	BASE PLATE REFER - Copy	http://172.18.7.91:9000/cmf/documents/part_1440/20260428_171746_64f754c4_BASE PLATE REFER - Copy.pdf	2D	v1.0	1440	\N	2026-04-28 17:17:46.235199+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.910208+05:30
199	Spacer 70-L-01	http://172.18.7.91:9000/cmf/documents/part_1447/20260429_113620_589acf46_Spacer 70-L-01.pdf	2D	v1.0	1447	\N	2026-04-29 11:36:20.986231+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.910208+05:30
200	Spacer 60-L-01	http://172.18.7.91:9000/cmf/documents/part_1472/20260429_121046_e72327f9_Spacer 60-L-01.pdf	2D	v1.0	1472	\N	2026-04-29 12:10:47.308391+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.911212+05:30
202	Balancer 60	http://172.18.7.91:9000/cmf/documents/part_1480/20260505_143056_93e995e5_Balancer 60.pdf	2D	v1.0	1480	\N	2026-05-05 14:30:56.316061+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.911212+05:30
203	Back Plate	http://172.18.7.91:9000/cmf/documents/part_1479/20260505_154104_99a2cdfc_Back Plate.pdf	2D	v1.0	1479	\N	2026-05-05 15:41:04.410559+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.911212+05:30
204	Keyway 60	http://172.18.7.91:9000/cmf/documents/part_1440/20260505_163031_0372b2ff_Keyway 60.pdf	2D	v2.0	1440	198	2026-05-05 16:30:30.797185+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.912905+05:30
206	conrod	http://172.18.7.91:9000/cmf/documents/part_36/20260508_104335_eb560a2a_conrod.stl	3D	v1.0	36	\N	2026-05-08 10:43:35.446562+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.913909+05:30
207	ESP32-CAM Protective Enclosure Top	http://172.18.7.91:9000/cmf/documents/part_35/20260508_104404_b226b20c_ESP32-CAM Protective Enclosure Top.STL	3D	v1.0	35	\N	2026-05-08 10:44:04.41137+05:30	2026-05-30 11:09:36.201967+05:30	\N	16	t	2026-05-30 10:55:50.913909+05:30
297	Part_Report_005	http://172.18.7.91:9000/cmf/documents/part_36/20260525_092313_870d6184_Part_Report_005.pdf	2D	00	36	\N	2026-05-25 09:23:13.862144+05:30	2026-05-30 11:09:36.201967+05:30	\N	32	t	2026-05-30 10:55:50.913909+05:30
301	Part_Report_A-PRT-002.pdf	http://172.18.7.91:9000/cmf/documents/part_28/20260526_102955_44038faf_Part_Report_A-PRT-002.pdf	mpp	1.0	28	\N	2026-05-26 10:29:55.462238+05:30	2026-05-30 11:09:36.201967+05:30	\N	\N	t	2026-05-30 10:55:50.916174+05:30
304	helical bevel gear (2)	http://172.18.7.91:9000/cmf/documents/part_1519/20260527_094330_557f0f8f_helical bevel gear (2).STEP	3D	00	1519	\N	2026-05-27 09:43:28.802584+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	2026-05-30 10:55:50.916707+05:30
308	Encoder Cover	http://172.18.7.91:9000/cmf/documents/part_1519/20260527_101254_20c427f0_Encoder Cover.pdf	2D	01	1519	265	2026-05-27 10:12:53.043152+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	2026-05-30 10:55:50.91515+05:30
309	threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_	http://172.18.7.91:9000/cmf/documents/part_1519/20260527_101317_edf45f87_threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_.125_IN_.step	3D	01	1519	304	2026-05-27 10:13:15.174567+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	2026-05-30 10:55:50.918215+05:30
315	Keyway 60	http://172.18.7.91:9000/cmf/documents/part_1515/20260527_113952_5eeedecb_Keyway 60.pdf	2D	00	1515	\N	2026-05-27 11:39:50.628024+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	2026-05-30 10:55:50.920249+05:30
316	Keyway 60	http://172.18.7.91:9000/cmf/documents/part_1515/20260527_113952_f01b74e4_Tube_13-SLIDE_ASSEM.step	3D	00	1515	\N	2026-05-27 11:39:50.628024+05:30	2026-05-30 11:09:36.201967+05:30	\N	20	t	2026-05-30 10:55:50.921253+05:30
343	threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_	http://172.18.7.91:9000/cmf/documents/part_214/20260530_152726_60278c3f_threaded_elbow--90deg_CLASS_2000_THREADED_ELBOW,_.125_IN_.step	3D	01	214	341	2026-05-30 15:27:26.639918+05:30	2026-05-30 15:29:02.383823+05:30	\N	20	t	\N
\.


--
-- Data for Name: operation_documents; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.operation_documents (id, document_name, document_url, document_type, document_version, operation_id, parent_id, created_at, updated_at, user_id) FROM stdin;
78	ballooned_drawing_75.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_351/20260402_113615_233f83e0_ballooned_drawing_75.pdf	Image	1.0	351	\N	2026-04-02 11:36:11.041253+05:30	2026-04-02 11:36:11.041253+05:30	16
91	211091230056-Body Braze Washer (BTKu 375 P)_01.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_59/20260408_092755_41c29db8_211091230056-Body Braze Washer (BTKu 375 P)_01.pdf	Balloon	v1.0	59	\N	2026-04-08 14:57:55.371583+05:30	2026-04-08 14:57:55.371583+05:30	16
92	aEKPGZY_qhlogs.doc	http://172.18.7.91:9000/cmf/operation_documents/operation_59/20260408_092843_f7961971_aEKPGZY_qhlogs.doc	instruction	v1.0	59	\N	2026-04-08 14:58:44.203149+05:30	2026-04-08 14:58:44.203149+05:30	16
93	card_diamond.nc	http://172.18.7.91:9000/cmf/operation_documents/operation_59/20260408_104346_94c2f5f7_card_diamond.nc	CNC	v1.0	59	\N	2026-04-08 16:13:47.322831+05:30	2026-04-08 16:13:47.322831+05:30	16
107	Tail.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_100450_b0495dad_Tail.pdf	Balloon	1.0	375	\N	2026-04-13 10:04:52.095304+05:30	2026-04-13 10:04:52.095304+05:30	16
108	Balancer 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_376/20260413_100529_efc4544f_Balancer 60.pdf	Balloon	1.0	376	\N	2026-04-13 10:05:30.943111+05:30	2026-04-13 10:05:30.943111+05:30	16
109	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_101415_61924b25_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 10:14:54.042128+05:30	2026-04-13 10:14:54.042128+05:30	\N
110	0001-1_op20_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_376/20260413_101535_f8c3b288_0001-1_op20_balloon.pdf	Balloon document	1.0	376	\N	2026-04-13 10:16:13.376788+05:30	2026-04-13 10:16:13.376788+05:30	\N
111	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_122631_02870f8b_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 12:27:09.372061+05:30	2026-04-13 12:27:09.372061+05:30	\N
112	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_122706_c480a8f4_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 12:27:44.201804+05:30	2026-04-13 12:27:44.201804+05:30	\N
113	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_133906_43d3e488_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 13:39:44.09778+05:30	2026-04-13 13:39:44.09778+05:30	\N
114	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_134435_956d977a_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 13:45:13.4807+05:30	2026-04-13 13:45:13.4807+05:30	\N
115	Tail.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_51/20260413_135344_b2ba8acb_Tail.pdf	Balloon	v1.0	51	\N	2026-04-13 13:53:45.856809+05:30	2026-04-13 13:53:45.856809+05:30	16
116	005_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_51/20260413_140117_a3b50974_005_op10_balloon.pdf	Balloon document	1.0	51	\N	2026-04-13 14:01:55.146658+05:30	2026-04-13 14:01:55.146658+05:30	\N
117	Tail.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_17/20260413_140353_5e82d1d9_Tail.pdf	Balloon	v1.0	17	\N	2026-04-13 14:03:55.29434+05:30	2026-04-13 14:03:55.29434+05:30	16
118	0001-1_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_375/20260413_145341_2f90a6bd_0001-1_op10_balloon.pdf	Balloon document	1.0	375	\N	2026-04-13 14:54:19.687838+05:30	2026-04-13 14:54:19.687838+05:30	\N
119	Tail.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_377/20260413_151817_6ed2c348_Tail.pdf	Balloon	1.0	377	\N	2026-04-13 15:18:11.086852+05:30	2026-04-13 15:18:11.086852+05:30	16
120	Balancer 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_378/20260413_152040_8f794cc5_Balancer 60.pdf	Balloon	1.0	378	\N	2026-04-13 15:20:33.752172+05:30	2026-04-13 15:20:33.752172+05:30	16
121	00089_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_377/20260413_152701_bd6bfe66_00089_op10_balloon.pdf	Balloon document	1.0	377	\N	2026-04-13 15:27:39.007657+05:30	2026-04-13 15:27:39.007657+05:30	\N
122	00089_op20_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_378/20260413_152740_8b40fa5a_00089_op20_balloon.pdf	Balloon document	1.0	378	\N	2026-04-13 15:28:18.110821+05:30	2026-04-13 15:28:18.110821+05:30	\N
123	Spacer 60-L-01.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_379/20260413_155542_b17915c9_Spacer 60-L-01.pdf	Balloon	1.0	379	\N	2026-04-13 15:55:36.451702+05:30	2026-04-13 15:55:36.451702+05:30	16
124	00089_op30_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_379/20260413_164558_a342fe5f_00089_op30_balloon.pdf	Balloon document	1.0	379	\N	2026-04-13 16:46:36.371885+05:30	2026-04-13 16:46:36.371885+05:30	\N
125	Spacer 70-L-01.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_380/20260413_170312_5799624e_Spacer 70-L-01.pdf	Balloon	1.0	380	\N	2026-04-13 17:03:06.383796+05:30	2026-04-13 17:03:06.383796+05:30	16
126	00987_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_380/20260415_100738_fa2ad8f5_00987_op10_balloon.pdf	Balloon document	1.0	380	\N	2026-04-15 10:08:20.209255+05:30	2026-04-15 10:08:20.209255+05:30	\N
127	Spacer 60-U-01.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_381/20260416_110012_4cbf2525_Spacer 60-U-01.pdf	Balloon	1.0	381	\N	2026-04-16 11:00:05.382532+05:30	2026-04-16 11:00:05.382532+05:30	16
128	Spacer 70-L-03.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_382/20260416_110131_0c1b2a7d_Spacer 70-L-03.pdf	Balloon	1.0	382	\N	2026-04-16 11:01:24.930102+05:30	2026-04-16 11:01:24.930102+05:30	16
129	00987_op20_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_382/20260416_120632_d72a2466_00987_op20_balloon.pdf	Balloon document	1.0	382	\N	2026-04-16 12:07:14.488698+05:30	2026-04-16 12:07:14.488698+05:30	\N
130	Balancer 70 .......pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_401/20260422_104904_484b8130_Balancer 70 .......pdf	Balloon	1.0	401	\N	2026-04-22 10:48:57.905466+05:30	2026-04-22 10:48:57.905466+05:30	16
131	Balancer 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_402/20260422_105012_a1285514_Balancer 60.pdf	Balloon	1.0	402	\N	2026-04-22 10:50:06.559932+05:30	2026-04-22 10:50:06.559932+05:30	16
132	0098712_op20_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_402/20260422_105414_2b14342d_0098712_op20_balloon.pdf	Balloon document	1.0	402	\N	2026-04-22 10:55:27.789317+05:30	2026-04-22 10:55:27.789317+05:30	\N
133	0098712_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_381/20260422_112042_cdc29791_0098712_op10_balloon.pdf	Balloon document	1.0	381	\N	2026-04-22 11:21:55.524105+05:30	2026-04-22 11:21:55.524105+05:30	\N
134	0098712_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_381/20260422_112405_1339d9b7_0098712_op10_balloon.pdf	Balloon document	1.0	381	\N	2026-04-22 11:25:18.304722+05:30	2026-04-22 11:25:18.304722+05:30	\N
135	Encoder Cover.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_403/20260422_113713_dcbcc2c1_Encoder Cover.pdf	Balloon	1.0	403	\N	2026-04-22 11:37:07.138724+05:30	2026-04-22 11:37:07.138724+05:30	16
136	Encoder Seat.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_404/20260422_115102_f033e17d_Encoder Seat.pdf	Balloon	1.0	404	\N	2026-04-22 11:50:55.654692+05:30	2026-04-22 11:50:55.654692+05:30	16
137	00987_op30_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_404/20260422_115545_29e1d94f_00987_op30_balloon.pdf	Balloon document	1.0	404	\N	2026-04-22 11:56:58.258771+05:30	2026-04-22 11:56:58.258771+05:30	\N
138	0098712_op30_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_403/20260424_164037_eb333873_0098712_op30_balloon.pdf	Balloon document	1.0	403	\N	2026-04-24 16:41:52.930751+05:30	2026-04-24 16:41:52.930751+05:30	\N
141	0078_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_401/20260428_101411_6f27e7e1_0078_op10_balloon.pdf	Balloon document	1.0	401	\N	2026-04-28 10:15:24.788425+05:30	2026-04-28 10:15:24.788425+05:30	\N
144	Keyway 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_408/20260505_143157_8245e223_Keyway 60.pdf	IPID	1.0	408	\N	2026-05-05 14:31:57.387346+05:30	2026-05-05 14:31:57.387346+05:30	16
145	Keyway 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_18/20260505_143445_cae12db2_Keyway 60.pdf	IPID	v1.0	18	\N	2026-05-05 14:34:44.771836+05:30	2026-05-05 14:34:44.771836+05:30	16
146	002_op20_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_18/20260505_143839_ae029054_002_op20_balloon.pdf	Balloon document	1.0	18	\N	2026-05-05 14:39:58.019797+05:30	2026-05-05 14:39:58.019797+05:30	\N
147	Back Plate.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_409/20260505_150232_fb269458_Back Plate.pdf	Balloon	1.0	409	\N	2026-05-05 15:02:32.170499+05:30	2026-05-05 15:02:32.170499+05:30	16
148	97986_op10_balloon.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_408/20260505_154905_f1d14db8_97986_op10_balloon.pdf	Balloon document	1.0	408	\N	2026-05-05 15:50:23.943993+05:30	2026-05-05 15:50:23.943993+05:30	\N
149	Encoder Seat.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_410/20260505_155642_3fff0abc_Encoder Seat.pdf	Balloon	1.0	410	\N	2026-05-05 15:56:42.287885+05:30	2026-05-05 15:56:42.287885+05:30	16
150	Back Plate.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_411/20260505_163303_24f2a6a4_Back Plate.pdf	IPID	1.0	411	\N	2026-05-05 16:33:03.19735+05:30	2026-05-05 16:33:03.19735+05:30	16
152	Balancer 60.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_423/20260513_114256_a9fbbab8_Balancer 60.pdf	Balloon	1.0	423	\N	2026-05-13 11:42:55.951707+05:30	2026-05-13 11:42:55.951707+05:30	16
156	BASE PLATE.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_453/20260520_185208_8b604813_BASE PLATE.pdf	IPID	00	453	\N	2026-05-20 18:52:08.590338+05:30	2026-05-20 18:52:08.590338+05:30	32
160	Invoice-AMIL9RXS-0001.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_454/20260520_191715_4a150124_Invoice-AMIL9RXS-0001.pdf	IPID	00	454	\N	2026-05-20 19:17:15.368685+05:30	2026-05-20 19:17:15.368685+05:30	16
164	Encoder Cover.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_454/20260527_115823_1dd01084_Encoder Cover.pdf	IPID	01	454	160	2026-05-27 11:58:21.630392+05:30	2026-05-27 11:58:21.630392+05:30	16
165	product-bom-Product 15.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_470/20260529_095242_aafb8035_product-bom-Product 15.pdf	IPID	02	470	\N	2026-05-29 09:52:40.625511+05:30	2026-05-29 09:52:40.625511+05:30	16
166	product-bom-Product 14.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_454/20260529_095451_d16936e8_product-bom-Product 14.pdf	IPID	00	454	\N	2026-05-29 09:54:49.67572+05:30	2026-05-29 09:54:49.67572+05:30	16
167	document_1.pdf	http://172.18.7.91:9000/cmf/operation_documents/operation_454/20260529_114831_d6b35205_document_1.pdf	IPID	01	454	166	2026-05-29 11:48:29.374657+05:30	2026-05-29 11:48:29.374657+05:30	16
\.


--
-- Data for Name: operations; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.operations (id, operation_number, operation_name, setup_time, cycle_time, workcenter_id, part_id, machine_id, work_instructions, notes, created_at, updated_at, part_type_id, from_date, to_date, user_id, vendor_id) FROM stdin;
357	10	Grooving	00:10:00	03:00:07	2	1409	22	\N	\N	2026-04-06 15:02:08.941286+05:30	2026-04-09 15:55:40.296499+05:30	1	\N	\N	16	\N
17	10	Turning	00:10:00	03:50:00	2	24	26	Maintain concentricity <0.02mm\r\n\r\nCheck runout before removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
18	20	Milling	00:12:00	03:48:00	3	24	13	Maintain concentricity <0.02mm\r\n\r\nCheck runout before removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
19	10	CNC TURNING 	00:45:00	04:00:00	2	25	24	Hard jaw setup\r\n\r\nRough OD + Bore\r\n\r\nLeave 1mm for HT distortion	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
20	20	HEAT TREATMENT	00:15:00	01:00:00	9	25	\N	Follow 17-4PH aging cycle\r\n\r\nRecord hardness	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
21	30	FINISH TURNING	00:10:00	03:30:00	2	25	24	Re-clamp using soft jaws\r\n\r\nMaintain TIR <0.01mm	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
22	40	MILING	00:30:00	11:30:00	3	25	14	Fixture on rotary table\r\n\r\nIndexing program\r\n\r\nSlot + pocket milling	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
51	10	TURNING	00:15:00	00:04:45	2	28	26	Balance part after heavy material removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
77	10	MILLING	00:30:00	02:00:00	3	50	13	Instruction:\r\n\r\nDeep slot milling\r\n\r\nUse long tool holder\r\n\r\nCheck deflection	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
78	10	TRNING	00:15:00	00:45:00	2	51	27	Steps:\r\n\r\nRough turn\r\n\r\nFinish turn\r\n\r\nCenter grinding\r\n\r\nSurface finish check	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
452	10	WIRE EDM	00:10:00	01:00:00	2	1515	22	\N	last operation	2026-05-18 10:52:11.950641+05:30	2026-05-18 17:30:56.081591+05:30	1	\N	\N	16	\N
68	10	MILLING 	00:10:00	00:55:00	3	44	18	CAREFULL WHILE FITING	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
79	20	GRINDING	00:15:00	00:50:00	5	51	31	Steps:\r\n\r\nRough turn\r\n\r\nFinish turn\r\n\r\nCenter grinding\r\n\r\nSurface finish check	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
23	50	CYL GRINDING	00:30:00	14:00:00	5	25	32	Mount between centers\r\n\r\nRough grind\r\n\r\nFinish grind\r\n\r\nAchieve Ra <0.8	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
24	60	HONIG	\N	00:55:00	1	25	\N	Internal bore finishing\r\n\r\nSurface finish check	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
25	10	Rough Turning	00:30:00	04:00:00	2	26	25	Hard jaw setup\r\n\r\nRough OD + Bore\r\n\r\nLeave 1mm for HT distortion	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
27	30	FINISH TURNING	00:10:00	03:00:00	2	26	26	Re-clamp using soft jaws\r\n\r\nMaintain TIR <0.01mm	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
28	40	MILLING	00:25:00	04:00:00	3	26	14	Fixture on rotary table\r\n\r\nIndexing program\r\n\r\nSlot + pocket milling	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
29	50	CYL GRINDING	01:00:00	07:00:00	5	26	32	Mount between centers\r\n\r\nRough grind\r\n\r\nFinish grind\r\n\r\nAchieve Ra <0.8	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
16	20	Milling	00:06:00	01:54:00	6	33	36	OP2 – 4 Axis Milling\r\n\r\nMount in soft jaws fixture\r\n\r\nSet 4th axis zero\r\n\r\nRough profile milling\r\n\r\nDrill features\r\n\r\nFinish contour\r\n\r\nDeburr	\N	2026-02-25 15:23:14.492708+05:30	2026-05-23 17:16:10.922456+05:30	1	\N	\N	32	\N
52	20	HEAVY MILLING 	00:30:00	10:10:00	3	28	13	Balance part after heavy material removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
15	10	rough turning 	00:25:00	03:35:00	2	33	23	OP1 – Turning\r\n\r\nVerify material: Al (B26 SWP)\r\n\r\nClamp in 3-jaw chuck\r\n\r\nSet Z zero at face\r\n\r\nRough turning → Leave 0.5mm stock\r\n\r\nFinish turning → Final dimension\r\n\r\nChamfer edges\r\n\r\nIn-process inspection (Vernier + Micrometer)	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
83	20	milling	\N	\N	\N	38	\N	\N	\N	2026-02-27 11:13:27.868838+05:30	2026-04-03 18:43:58.852836+05:30	2	2026-03-02 10:48:32+05:30	2026-03-12 10:48:32+05:30	32	1
67	20	DIESINKING	00:10:00	03:40:00	8	43	35	Wire EDM Work Instruction:\r\n\r\nCreate EDM program\r\n\r\nLoad DXF\r\n\r\nThread wire\r\n\r\nSet reference\r\n\r\nDry run\r\n\r\nFinal cut	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
69	20	DIESINKING	00:20:00	03:30:00	8	44	35	Wire EDM Work Instruction:\r\n\r\nCreate EDM program\r\n\r\nLoad DXF\r\n\r\nThread wire\r\n\r\nSet reference\r\n\r\nDry run\r\n\r\nFinal cut	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
70	10	MILLING	00:15:00	01:00:00	3	45	19	\N	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
71	20	DIESINKING	00:15:00	03:30:00	8	45	35	Wire EDM Work Instruction:\r\n\r\nCreate EDM program\r\n\r\nLoad DXF\r\n\r\nThread wire\r\n\r\nSet reference\r\n\r\nDry run\r\n\r\nFinal cut	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
351	20	milling	\N	\N	\N	35	\N	\N	\N	2026-04-02 11:36:10.915036+05:30	2026-05-26 09:18:55.032634+05:30	2	2026-05-26 09:18:54+05:30	2026-05-29 09:18:54+05:30	16	1
470	20	CYL GRINDING	00:03:03	00:04:04	6	1519	33	\N	\N	2026-05-22 18:48:32.352927+05:30	2026-05-29 12:18:19.242726+05:30	1	\N	\N	16	\N
26	20	Heat Treatment	00:10:00	05:00:00	5	26	31	Follow 17-4PH aging cycle\r\n\r\nRecord hardness	\N	2026-02-25 15:23:14.492708+05:30	2026-05-08 12:20:51.519169+05:30	1	\N	\N	32	\N
368	20	Cutting	00:15:00	04:00:00	2	1409	24	\N	\N	2026-04-09 13:18:30.184095+05:30	2026-05-13 10:12:37.950363+05:30	1	\N	\N	20	\N
73	20	DIESINKING	00:30:00	03:30:00	8	46	35	Wire EDM Work Instruction:\r\n\r\nCreate EDM program\r\n\r\nLoad DXF\r\n\r\nThread wire\r\n\r\nSet reference\r\n\r\nDry run\r\n\r\nFinal cut	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
74	10	MILLING	00:10:00	00:50:00	3	47	18	Instruction:\r\n\r\nDeep slot milling\r\n\r\nUse long tool holder\r\n\r\nCheck deflection	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
75	10	MILLING	00:30:00	02:00:00	3	48	20	Instruction:\r\n\r\nDeep slot milling\r\n\r\nUse long tool holder\r\n\r\nCheck deflection	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
76	10	MILLING	00:15:00	02:00:00	3	49	16	Instruction:\r\n\r\nDeep slot milling\r\n\r\nUse long tool holder\r\n\r\nCheck deflection	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
53	30	HEAVY MILLING 2 	00:03:00	10:10:00	3	28	13	Balance part after heavy material removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
54	40	HEAVY MILLING 3	00:30:00	10:10:00	3	28	13	Balance part after heavy material removal	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
55	50	GRINDING	00:10:00	02:00:00	5	28	32	\N	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
59	10	MILLING	00:30:00	07:03:00	3	34	18	Critical:\r\n\r\nAngular alignment check\r\n\r\nUse CMM after machining	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
57	10	MILLING 	00:30:00	07:30:00	3	36	18	Use vacuum fixture\r\n\r\nRough pocket\r\n\r\nFinish aero profile\r\n\r\nMaintain thickness tolerance ±0.02mm\r\n\r\nEdge radius check	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
58	10	MILLING	00:30:00	07:30:00	3	37	18	Use vacuum fixture\r\n\r\nRough pocket\r\n\r\nFinish aero profile\r\n\r\nMaintain thickness tolerance ±0.02mm\r\n\r\nEdge radius check	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
60	10	MILLING 	01:01:00	15:00:00	3	38	14	Steps:\r\n\r\nSoft jaw setup\r\n\r\n3+1 axis milling\r\n\r\nSurface finish Ra <1.6	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
61	10	MILLING 	01:00:00	15:00:00	3	39	14	Steps:\r\n\r\nSoft jaw setup\r\n\r\n3+1 axis milling\r\n\r\nSurface finish Ra <1.6	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
62	10	MILLING 	01:00:00	10:00:00	3	40	16	Steps:\r\n\r\nSoft jaw setup\r\n\r\n3+1 axis milling\r\n\r\nSurface finish Ra <1.6	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
63	10	TURNIG	00:10:00	03:50:00	2	41	27	carefull at fixing	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
64	10	MILLING 	00:10:00	00:50:00	3	42	19	\N	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
65	20	WIRE EDM	00:15:00	03:45:00	8	42	35	Wire EDM Work Instruction:\r\n\r\nCreate EDM program\r\n\r\nLoad DXF\r\n\r\nThread wire\r\n\r\nSet reference\r\n\r\nDry run\r\n\r\nFinal cut	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
66	10	MILLING 	00:10:00	00:45:00	3	43	16	\N	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
72	10	MILLING 	00:10:00	00:50:00	3	46	20	CAREFULL WHILE FIXING 	\N	2026-02-25 15:23:14.492708+05:30	2026-03-13 11:35:07.421893+05:30	1	\N	\N	32	\N
375	10	cutting 	00:02:00	00:04:00	3	1433	13	dfrf	\N	2026-04-13 10:04:51.889997+05:30	2026-04-13 10:04:51.889997+05:30	1	\N	\N	16	\N
376	20	grinding 	00:05:00	03:00:00	5	1433	32	wded	\N	2026-04-13 10:05:30.751836+05:30	2026-04-13 10:05:30.751836+05:30	1	\N	\N	16	\N
377	10	cutting 	02:00:00	04:00:00	2	1439	28	\N	\N	2026-04-13 15:18:10.961465+05:30	2026-04-13 15:18:10.961465+05:30	1	\N	\N	16	\N
378	20	grinding 	00:04:00	04:00:00	6	1439	36	rgr	\N	2026-04-13 15:20:33.547947+05:30	2026-04-13 15:20:33.547947+05:30	1	\N	\N	16	\N
379	30	threading 	04:00:00	03:00:00	7	1439	34	mk	\N	2026-04-13 15:55:36.337714+05:30	2026-04-13 15:55:36.337714+05:30	1	\N	\N	16	\N
380	10	Gear grinding	00:03:00	00:04:00	3	1440	15	bd	\N	2026-04-13 17:03:06.284869+05:30	2026-04-13 17:05:17.329967+05:30	1	\N	\N	16	\N
461	30	CYL GRINDING	00:40:00	04:00:00	6	35	36	\N	\N	2026-05-22 10:16:07.024952+05:30	2026-05-25 13:55:34.550926+05:30	1	\N	\N	16	\N
381	10	Cutting	01:00:00	04:00:00	2	1447	27	\N	\N	2026-04-16 11:00:05.260553+05:30	2026-04-16 11:00:05.260553+05:30	1	\N	\N	16	\N
382	20	Laser cutting	00:02:00	05:01:00	6	1440	33	\N	\N	2026-04-16 11:01:24.830438+05:30	2026-04-16 11:01:24.830438+05:30	1	\N	\N	16	\N
453	30	Boring (ID Finish)	00:03:03	00:03:03	5	1515	32	\N	\N	2026-05-20 18:52:08.5376+05:30	2026-05-25 10:31:15.505994+05:30	1	\N	\N	32	\N
56	10	MILLING	00:30:00	03:00:00	3	35	14	Use vacuum fixture\r\n\r\nRough pocket\r\n\r\nFinish aero profile\r\n\r\nMaintain thickness tolerance ±0.02mm\r\n\r\nEdge radius check	\N	2026-02-25 15:23:14.492708+05:30	2026-05-25 13:51:31.330964+05:30	1	\N	\N	32	\N
401	10	Drilling	00:03:00	00:04:00	5	1472	30	fvrvf	frr	2026-04-22 10:48:57.784528+05:30	2026-04-22 10:48:57.784528+05:30	1	\N	\N	16	\N
402	20	Milling	00:03:00	00:05:00	3	1447	18	\N	\N	2026-04-22 10:50:06.470146+05:30	2026-04-22 10:50:06.470146+05:30	1	\N	\N	16	\N
403	30	Gear Cutting	00:02:00	00:03:00	3	1447	18	\N	\N	2026-04-22 11:37:07.018061+05:30	2026-04-22 11:37:07.018061+05:30	1	\N	\N	16	\N
404	30	Heat Treatment	00:01:00	00:01:00	3	1440	18	\N	\N	2026-04-22 11:50:55.564038+05:30	2026-04-22 11:50:55.564038+05:30	1	\N	\N	16	\N
408	10	Cutting	00:02:00	00:04:00	3	1480	14	scsd	dsvc	2026-05-05 14:31:57.270296+05:30	2026-05-05 14:31:57.270296+05:30	1	\N	\N	16	\N
409	20	whatever	00:01:00	01:00:00	3	1472	16	\N	\N	2026-05-05 15:02:31.914305+05:30	2026-05-05 15:02:31.914305+05:30	1	\N	\N	16	\N
410	10	shitting	00:01:00	01:00:00	5	1481	30	\N	\N	2026-05-05 15:56:42.121449+05:30	2026-05-05 15:56:42.121449+05:30	1	\N	\N	16	\N
411	10	Turning	00:05:00	00:03:00	5	1479	31	ff	fbf	2026-05-05 16:33:03.080712+05:30	2026-05-05 16:33:03.080712+05:30	1	\N	\N	16	\N
454	10	CYL GRINDING	00:05:05	00:04:05	6	1519	33	\N	\N	2026-05-20 19:17:15.338822+05:30	2026-05-22 11:03:31.24596+05:30	1	\N	\N	16	\N
423	10	turnmeom	05:15:00	00:02:00	5	1496	31	\N	\N	2026-05-13 11:42:55.879622+05:30	2026-05-13 11:42:55.879622+05:30	1	\N	\N	16	\N
443	20	CNC TURNING	00:07:00	04:04:00	5	1515	30	\N	\N	2026-05-18 10:22:21.885694+05:30	2026-05-18 10:27:21.943928+05:30	1	\N	\N	16	\N
\.


--
-- Data for Name: order_documents; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.order_documents (id, order_id, document_name, document_url, document_type, document_version, parent_id, created_at, updated_at, user_id) FROM stdin;
\.


--
-- Data for Name: order_part_priorities; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.order_part_priorities (id, order_id, product_id, part_id, priority, created_at, updated_at, status) FROM stdin;
1163	32	14	28	3	2026-05-27 12:19:41.486132+05:30	2026-05-27 12:19:41.486132+05:30	active
1164	32	14	33	4	2026-05-27 12:19:41.486132+05:30	2026-05-27 12:19:41.486132+05:30	active
1165	32	14	35	5	2026-05-27 12:19:41.486132+05:30	2026-05-27 12:19:41.486132+05:30	active
1167	30	15	1519	6	2026-05-29 12:18:27.459646+05:30	2026-05-29 12:18:27.459646+05:30	active
1161	32	14	24	2	2026-05-27 12:19:41.486132+05:30	2026-05-29 14:06:40.634269+05:30	active
1162	32	14	25	1	2026-05-27 12:19:41.486132+05:30	2026-05-29 14:06:40.634269+05:30	active
\.


--
-- Data for Name: order_parts_raw_material_linked; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.order_parts_raw_material_linked (id, stock_id, part_id, order_id, used_quantity, linkage_group_id, is_procurement, procurement_quantity, procurement_weight, vendor_id, procurement_status, user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: order_schedule_status; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.order_schedule_status (id, order_id, part_id, operation_id, status, start_date, to_date, user_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.orders (id, sale_order_number, customer_id, product_id, quantity, due_date, status, order_date, user_id, created_at, updated_at, project_coordinator_id, admin_id, manufacturing_coordinator_id, project_name, approval_status, approval_remarks, approved_at) FROM stdin;
95	ISP2502101	34	47	1	2026-06-17 00:00:00	Pending	2026-03-04 00:00:00	16	2026-04-06 14:54:58.250421+05:30	2026-05-29 16:55:53.617221+05:30	16	16	32	\N	Approved	Approved	2026-05-29 16:55:53.617221+05:30
113	ISP1234567	11	60	2	2026-04-15 00:00:00	Pending	2026-04-08 00:00:00	16	2026-04-13 10:02:54.647482+05:30	2026-05-29 16:55:56.740016+05:30	16	16	32	\N	Approved	Approved	2026-05-29 16:55:56.740016+05:30
114	ISP9876543	11	61	1	\N	Pending	\N	16	2026-04-13 15:15:13.977192+05:30	2026-05-29 16:55:59.606783+05:30	4	16	34	\N	Approved	Approved	2026-05-29 16:55:59.606783+05:30
134	DEMO1	2	105	1	\N	Pending	\N	20	2026-05-23 17:34:12.490313+05:30	2026-05-29 16:56:02.543299+05:30	20	16	32	\N	Approved	Approved	2026-05-29 16:56:02.543299+05:30
135	DEMO123	3	106	1	\N	Pending	\N	16	2026-05-23 17:34:39.086341+05:30	2026-05-29 16:56:05.380743+05:30	\N	16	\N	\N	Approved	Approved	2026-05-29 16:56:05.380743+05:30
147	CADW	2	120	1	\N	Pending	\N	20	2026-05-25 15:52:45.082419+05:30	2026-05-29 16:56:08.174121+05:30	20	16	\N	\N	Approved	Approved	2026-05-29 16:56:08.174121+05:30
30	SAMPLE-001	1	15	11	2026-04-23 00:00:00	In Progress	2026-04-09 00:00:00	16	2026-02-25 15:10:19.612666+05:30	2026-05-29 17:52:46.368727+05:30	20	16	32	\N	Approved	Testing	2026-05-29 16:33:14.032175+05:30
148	DEMO1E2R2	2	121	1	\N	Pending	\N	20	2026-05-29 16:59:41.243835+05:30	2026-05-29 18:06:36.69538+05:30	20	16	32	\N	Rejected	dqswD	2026-05-29 17:04:31.832253+05:30
32	89	2	14	5	2026-04-30 00:00:00	In Progress	2026-04-02 00:00:00	16	2026-02-26 15:12:59.467932+05:30	2026-05-30 13:34:48.050771+05:30	20	16	34	\N	Approved	Ok 	2026-05-29 16:34:58.929985+05:30
\.


--
-- Data for Name: out_source_operation_status; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.out_source_operation_status (id, part_id, order_id, operation_id, sent_date, delivered_date, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: out_source_parts_status; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.out_source_parts_status (id, part_id, order_id, start_date, to_date, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: part_types; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.part_types (id, type_name, created_at, updated_at, user_id) FROM stdin;
1	IN-House	2026-02-25 15:23:14.486849+05:30	2026-03-13 12:00:15.02076+05:30	16
2	Out-Source	2026-02-25 15:23:14.486849+05:30	2026-03-13 12:00:15.02076+05:30	16
3	STANDARD	2026-04-13 11:58:41.052798+05:30	2026-04-13 11:58:41.052798+05:30	16
\.


--
-- Data for Name: parts; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.parts (id, part_name, part_number, type_id, raw_material_id, assembly_id, product_id, created_at, updated_at, user_id, part_detail, qty, vendor_id, size, required_length, raw_material_unit_id, recycle_bin) FROM stdin;
24	Aircraft Forebody Assembly	002	1	1	\N	14	2026-02-25 15:23:14.489305+05:30	2026-04-30 11:21:11.442765+05:30	16	\N	10	\N	Custom	50	545	f
1575	demo	demo	1	\N	30	15	2026-05-30 11:17:47.615068+05:30	2026-05-30 11:17:47.615068+05:30	20	\N	1	\N	\N	\N	\N	f
25	Primary Fuselage Section	003	1	2	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-06 10:41:45.864106+05:30	20	\N	1	\N	Custom	1000	51	f
28	Aft Rear Body Section	005	1	1	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-08 13:15:37.798694+05:30	20	\N	1	\N	Custom	1000	547	f
1447	part3	0098712	1	1	55	61	2026-04-16 10:59:35.425513+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	4	\N	100x200	100	545	t
1472	part4	0078	1	1	55	61	2026-04-22 10:47:32.415625+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	2	\N	\N	100	545	t
1409	Hydraulic sleeve	0023-3	1	3	\N	47	2026-04-06 14:58:17.183045+05:30	2026-05-13 09:52:50.312251+05:30	16	\N	1	\N	Standard	200	65	f
214	Component ABCD	PRT001	1	\N	\N	14	2026-03-26 11:43:14.711978+05:30	2026-04-18 13:50:40.731988+05:30	16	\N	1	\N	Standard	\N	\N	f
1480	part6	97986	1	2	55	61	2026-05-05 14:30:42.822705+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	3	\N	12	\N	\N	t
34	Zero Degree Fin Assembly	007	1	\N	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-23 10:34:16.19058+05:30	20	\N	1	\N	Custom	\N	\N	f
1515	XYZ	PRT-002	1	1	30	15	2026-05-18 09:38:15.453944+05:30	2026-05-26 09:24:04.829664+05:30	20	\N	1	\N	Ø12x7x9	500	549	f
26	Forward Rear Body Section	004	1	\N	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-26 09:53:21.591364+05:30	20	\N	1	\N	Custom	\N	\N	f
36	Secondary Wing Section	ASS1-02-006	1	1	21	14	2026-02-25 15:23:14.489305+05:30	2026-05-29 17:35:15.814753+05:30	20	\N	1	\N	Custom	4	600	f
37	Tertiary Wing Section	ASS1-03-006	1	1	21	14	2026-02-25 15:23:14.489305+05:30	2026-05-29 18:22:16.447093+05:30	20	\N	1	\N	Custom	10	600	f
47	Primary Wire Tunnel	ASS4 - 01- 011	1	\N	24	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	1000x200x200	\N	\N	f
48	Central Wire Tunnel	ASS4 - 02- 011	1	\N	24	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	1000x200x200	\N	\N	f
49	Tertiary Wire Tunnel	ASS4 - 03- 011	1	\N	24	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	1000x200x200	\N	\N	f
50	Quaternary Wire Tunnel	ASS4 - 04- 011	1	\N	24	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	1000x200x200	\N	\N	f
51	Aircraft Balance Pin	ASS5- 01- 012	1	\N	25	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	Standard	\N	\N	f
52	Balance Pin Assembly	ASS5 - 02- 012	1	\N	25	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	Custom	\N	\N	f
57	Aft Rear Body - Standalone Config	015	1	\N	\N	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	Standard	\N	\N	f
1519	Bush	0003-3	1	4	30	15	2026-05-19 15:35:39.919347+05:30	2026-05-22 18:42:43.698424+05:30	20	\N	1	\N	Ø55 x 70	500	91	f
41	Fin Protection Cover	009	1	\N	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-23 10:34:16.19058+05:30	20	\N	1	\N	300x200x50	\N	\N	f
1439	part1	00089	1	1	55	61	2026-04-13 15:17:36.614443+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	3	\N	Standard	500	545	t
1479	part5	00098345	1	2	55	61	2026-04-27 11:23:00.571603+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	2	\N	65	\N	\N	t
1481	asa	part7	1	2	55	61	2026-05-05 15:55:56.234365+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	1	\N	231	\N	\N	t
38	Wing Cover Panel A	ASS2 - 01 -008	1	\N	22	14	2026-02-25 15:23:14.489305+05:30	2026-05-29 18:38:35.535523+05:30	20	\N	1	\N	300x200x50	\N	\N	f
40	Wing Cover Panel C	ASS2 - 03 - 008	1	\N	22	14	2026-02-25 15:23:14.489305+05:30	2026-05-29 18:38:35.578398+05:30	20	\N	1	\N	300x200x50	\N	\N	f
33	Aircraft Nose Cone	001	1	1	\N	14	2026-02-25 15:23:14.489305+05:30	2026-05-05 15:47:27.070924+05:30	20	\N	1	\N	Ø500x800	1000	546	f
43	Secondary Protusion Unit	ASS3 - 02 - 010	1	\N	23	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	200x150x100	\N	\N	f
44	Tertiary Protusion Unit	ASS3 - 03 - 010	1	\N	23	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	200x150x100	\N	\N	f
45	Quaternary Protusion Unit	ASS3 - 04 -010	1	\N	23	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	200x150x100	\N	\N	f
46	Quinary Protusion Unit	ASS3 - 05 - 010	1	\N	23	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	200x150x100	\N	\N	f
39	Wing Cover Panel B	ASS2 - 02 - 008	1	\N	22	14	2026-02-25 15:23:14.489305+05:30	2026-05-29 18:38:35.565171+05:30	20	\N	1	\N	300x200x50	\N	\N	f
35	Primary Wing Section	ASS1 - 01-06	1	1	21	14	2026-02-25 15:23:14.489305+05:30	2026-05-25 17:47:32.983703+05:30	20	\N	1	\N	Custom	300	590	f
1440	part2	00987	1	1	55	61	2026-04-13 17:02:28.065919+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	5	\N	Standard	100	545	t
1496	bv g	part567	1	3	55	61	2026-05-13 11:41:27.700767+05:30	2026-05-21 18:59:32.984747+05:30	16	\N	1	\N	\N	\N	\N	t
1433	part1	0001-1	1	1	54	60	2026-04-13 10:03:45.855456+05:30	2026-05-13 09:56:44.025433+05:30	16	\N	3	\N	Standard	1000	548	f
42	Primary Protusion Unit	ASS3 - 01 - 010	1	\N	23	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	200x150x100	\N	\N	f
53	Air Intake System	013	1	\N	\N	14	2026-02-25 15:23:14.489305+05:30	2026-04-23 09:53:46.178685+05:30	20	\N	1	\N	Standard	\N	\N	f
1434	part2	0002-1	2	\N	54	60	2026-04-13 10:04:11.926681+05:30	2026-04-18 12:29:09.186072+05:30	16	WITHOUT_RAW_MATERIAL	3	\N	Standard	\N	\N	f
\.


--
-- Data for Name: process_plans; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.process_plans (id, operation_id, work_instructions, notes) FROM stdin;
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.products (id, product_name, product_version, user_id, created_at, updated_at) FROM stdin;
47	Hydro Locking tool holder	1.0	16	2026-04-06 14:52:45.145044+05:30	2026-04-06 14:52:45.145044+05:30
60	QUALITY	1.0	16	2026-04-13 10:02:30.204227+05:30	2026-04-13 10:02:30.204227+05:30
63	ISP1234567	1.0	16	2026-04-21 10:14:35.086873+05:30	2026-04-21 10:14:35.086873+05:30
64	ISP1234567	1.0	16	2026-04-21 10:14:40.484534+05:30	2026-04-21 10:14:40.484534+05:30
65	ISP1234567	1.0	16	2026-04-21 10:14:52.705617+05:30	2026-04-21 10:14:52.705617+05:30
66	ISP1234567	1.0	16	2026-04-21 10:14:59.664309+05:30	2026-04-21 10:14:59.664309+05:30
67	ISP1234567	1.0	16	2026-04-21 10:15:11.3181+05:30	2026-04-21 10:15:11.3181+05:30
68	ISP1234567	1.0	16	2026-04-21 10:15:20.41634+05:30	2026-04-21 10:15:20.41634+05:30
69	ISP2502101	1.0	16	2026-04-21 11:19:22.916521+05:30	2026-04-21 11:19:22.916521+05:30
70	ISP2502101	1.0	16	2026-04-21 11:36:14.480762+05:30	2026-04-21 11:36:14.480762+05:30
120	cwad	1.0	20	2026-05-25 15:52:45.066085+05:30	2026-05-25 15:52:45.066085+05:30
121	fewfw	1.0	20	2026-05-29 16:59:41.22351+05:30	2026-05-29 16:59:41.22351+05:30
14	Control Valve Assembly	1.0	20	2026-02-25 15:23:14.481294+05:30	2026-05-20 11:12:57.458053+05:30
94	tre	1.0	16	2026-05-21 09:29:58.417023+05:30	2026-05-21 09:29:58.417023+05:30
95	tre	1.0	16	2026-05-21 09:30:04.552971+05:30	2026-05-21 09:30:04.552971+05:30
15	Primary Actuator Unit	1.0	20	2026-02-25 15:23:14.481294+05:30	2026-05-21 09:52:53.777087+05:30
61	QUALITY 2.0	1.0	4	2026-04-13 15:15:05.954877+05:30	2026-05-21 10:18:35.558037+05:30
102	demo	1.0	16	2026-05-23 17:17:52.466236+05:30	2026-05-23 17:17:52.466236+05:30
104	demo1	1.0	20	2026-05-23 17:34:08.989374+05:30	2026-05-23 17:34:08.989374+05:30
106	dsq	1.0	16	2026-05-23 17:34:39.069847+05:30	2026-05-23 17:34:39.069847+05:30
105	demo	1.0	20	2026-05-23 17:34:12.475389+05:30	2026-05-25 09:56:08.464799+05:30
109	d2e	1.0	20	2026-05-25 15:33:25.675036+05:30	2026-05-25 15:33:25.675036+05:30
110	th5t	1.0	20	2026-05-25 15:33:40.465101+05:30	2026-05-25 15:33:40.465101+05:30
\.


--
-- Data for Name: tools_with_part; Type: TABLE DATA; Schema: oms; Owner: -
--

COPY oms.tools_with_part (id, tool_id, part_id, operation_id, created_at, updated_at, user_id) FROM stdin;
163	48	34	59	2026-04-08 14:55:45.771335+05:30	2026-04-08 14:55:45.771335+05:30	16
22	108	33	15	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
23	122	33	15	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
24	127	33	15	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
25	468	33	15	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
26	29	33	16	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
27	60	33	16	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
28	67	33	16	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
29	178	24	17	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
30	96	24	17	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
31	12	24	17	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
32	25	24	18	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
33	30	24	18	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
34	29	24	18	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
35	30	25	19	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
36	65	25	19	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
37	2	25	19	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
38	67	25	21	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
39	104	25	23	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
40	105	25	23	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
42	27	28	51	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
43	53	28	51	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
44	230	35	56	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
45	2	35	56	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
46	5302	35	56	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
47	2103	36	57	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
48	1781	37	58	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
49	1778	37	58	2026-02-25 15:23:14.498201+05:30	2026-03-13 12:00:15.010636+05:30	32
65	16	33	15	2026-03-06 16:35:45.125511+05:30	2026-03-13 12:00:15.010636+05:30	32
130	1	40	62	2026-03-27 10:09:56.157629+05:30	2026-03-27 10:09:56.157629+05:30	16
155	605	1409	357	2026-04-06 15:33:43.452605+05:30	2026-04-06 15:33:43.452605+05:30	16
174	2	1433	375	2026-04-13 10:04:51.995676+05:30	2026-04-13 10:04:51.995676+05:30	16
175	5	1433	375	2026-04-13 10:04:51.995676+05:30	2026-04-13 10:04:51.995676+05:30	16
176	2	1433	376	2026-04-13 10:05:30.837339+05:30	2026-04-13 10:05:30.837339+05:30	16
177	4	1433	376	2026-04-13 10:05:30.837339+05:30	2026-04-13 10:05:30.837339+05:30	16
178	7	1433	376	2026-04-13 10:05:30.837339+05:30	2026-04-13 10:05:30.837339+05:30	16
179	3	1439	378	2026-04-13 15:20:33.649327+05:30	2026-04-13 15:20:33.649327+05:30	16
180	5	1439	378	2026-04-13 15:20:33.649327+05:30	2026-04-13 15:20:33.649327+05:30	16
181	6	1439	378	2026-04-13 15:20:33.649327+05:30	2026-04-13 15:20:33.649327+05:30	16
184	3	1472	409	2026-05-05 15:02:32.054955+05:30	2026-05-05 15:02:32.054955+05:30	16
185	2	1481	410	2026-05-05 15:56:42.210925+05:30	2026-05-05 15:56:42.210925+05:30	16
\.


--
-- Data for Name: machine_live_history; Type: TABLE DATA; Schema: production_monitoring; Owner: -
--

COPY production_monitoring.machine_live_history (id, machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id) FROM stdin;
1	13	ON	2026-05-05 16:18:38.403375	32	43	16
2	13	off	2026-05-05 16:28:48.295427	32	33	16
3	34	OFF	2026-05-05 12:27:48.833431	\N	\N	\N
4	13	off	2026-05-05 16:32:17.096467	32	24	18
5	26	off	2026-05-05 16:25:25.968252	32	24	17
7	15	OFF	2026-05-05 12:27:48.820672	\N	\N	\N
8	28	OFF	2026-05-05 12:27:48.829093	\N	\N	\N
9	25	OFF	2026-05-05 12:27:48.827254	\N	\N	\N
11	15	off	2026-05-06 11:26:14.000926	114	1440	380
12	28	off	2026-05-06 11:27:54.676481	114	1439	377
14	28	off	2026-05-06 12:22:07.023446	114	1439	377
15	36	OFF	2026-05-05 12:27:48.833982	\N	\N	\N
17	28	off	2026-05-06 12:39:59.760266	114	1439	377
18	28	off	2026-05-06 15:23:26.25571	114	1439	377
19	28	off	2026-05-06 15:54:42.729291	114	1439	377
20	28	off	2026-05-06 16:20:23.621923	114	1439	377
21	28	off	2026-05-06 16:29:43.279619	114	1439	377
22	28	off	2026-05-06 16:36:39.045571	114	1439	377
23	28	off	2026-05-06 17:00:45.423995	114	1439	377
24	14	ON	2026-05-05 12:27:48.82016	\N	\N	\N
25	13	ON	2026-05-05 16:32:17.096467	32	24	18
26	15	off	2026-05-06 12:23:52.561669	114	1440	380
28	28	off	2026-05-08 09:52:06.28354	114	1439	377
29	34	off	2026-05-06 14:03:13.850997	114	1439	379
30	36	off	2026-05-06 13:55:02.635066	114	1439	378
31	14	OFF	2026-05-05 12:27:48.82016	\N	\N	\N
32	20	OFF	2026-05-05 12:27:48.823699	\N	\N	\N
33	21	OFF	2026-05-05 12:27:48.824206	\N	\N	\N
34	23	OFF	2026-05-05 12:27:48.825712	\N	\N	\N
36	28	PRODUCTION	2026-05-08 09:52:06.28354	114	1439	377
37	36	PRODUCTION	2026-05-06 13:55:02.635066	114	1439	378
40	15	PRODUCTION	2026-05-06 12:23:52.561669	114	1440	380
46	22	OFF	2026-05-05 12:27:48.825209	\N	\N	\N
47	22	off	2026-05-13 10:01:10.118162	95	1409	357
48	24	OFF	2026-05-05 12:27:48.826742	\N	\N	\N
49	28	off	2026-05-08 15:28:46.777391	114	1439	377
50	13	PRODUCTION	2026-05-05 16:32:17.096467	32	24	18
56	17	OFF	2026-05-05 12:27:48.82218	\N	\N	\N
57	20	ON	2026-05-05 12:27:48.823699	\N	\N	\N
69	28	off	2026-05-13 11:46:37.73387	114	1439	377
70	19	OFF	2026-05-05 12:27:48.823191	\N	\N	\N
74	15	off	2026-05-12 10:56:10.898584	\N	\N	\N
75	25	off	2026-05-12 17:55:30.763892	\N	\N	\N
83	22	off	2026-05-13 10:46:55.87201	95	1409	357
84	22	off	2026-05-18 17:36:20.487517	30	1515	452
85	30	OFF	2026-05-05 12:27:48.831108	\N	\N	\N
86	30	off	2026-05-18 19:02:20.687637	30	1515	443
114	22	off	2026-05-18 18:42:20.63802	30	1515	452
115	30	off	2026-05-19 10:37:12.102247	30	1515	443
116	22	off	2026-05-20 17:33:25.83705	30	1515	452
120	22	off	2026-05-20 17:55:07.426951	30	1515	452
122	27	OFF	2026-05-05 12:27:48.82859	\N	\N	\N
124	33	OFF	2026-05-05 12:27:48.832775	\N	\N	\N
125	33	off	2026-05-22 09:57:56.057968	30	1519	454
127	33	off	2026-05-22 10:16:11.025137	30	1519	454
128	33	off	2026-05-22 11:10:44.493388	30	1519	454
129	33	off	2026-05-22 11:18:25.931222	30	1519	454
130	33	off	2026-05-22 11:25:18.453733	30	1519	454
134	33	off	2026-05-22 11:34:39.733207	30	1519	454
136	33	off	2026-05-22 12:20:09.266794	30	1519	454
137	33	off	2026-05-22 13:57:13.813647	30	1519	454
138	33	off	2026-05-22 14:09:49.582911	30	1519	454
139	33	off	2026-05-22 14:25:01.871897	30	1519	454
140	33	off	2026-05-22 16:01:02.303109	30	1519	454
142	34	PRODUCTION	2026-05-06 14:03:13.850997	114	1439	379
143	34	off	2026-05-23 10:33:20.483102	30	1519	470
146	14	ON	2026-05-05 12:27:48.82016	\N	\N	\N
147	33	off	2026-05-23 10:17:59.688685	30	1519	454
148	34	off	2026-05-23 10:34:38.996774	30	1519	470
149	33	off	2026-05-25 12:10:24.099974	30	1519	454
150	34	off	2026-05-25 12:15:05.920447	30	1519	470
152	14	off	2026-05-25 15:56:56.974252	32	35	56
153	14	off	2026-05-25 16:00:50.70176	32	35	56
154	14	off	2026-05-25 16:05:48.186805	32	35	56
155	14	off	2026-05-25 16:07:20.918943	32	35	56
156	14	off	2026-05-25 17:48:56.457952	32	35	56
157	14	off	2026-05-26 09:38:38.712198	32	35	56
158	14	off	2026-05-26 12:27:41.728108	32	35	56
159	14	off	2026-05-26 16:12:43.755128	32	35	56
160	14	off	2026-05-26 16:35:54.123766	32	35	56
161	14	off	2026-05-26 16:41:23.679116	32	35	56
162	33	off	2026-05-25 12:28:06.61636	30	1519	454
163	26	Production	2026-05-05 16:25:25.968252	32	24	17
164	26	off	2026-05-29 09:26:26.680313	32	24	17
165	26	off	2026-05-29 09:50:28.561855	32	24	17
166	26	off	2026-05-29 09:59:07.213372	32	24	17
167	33	off	2026-05-27 11:23:31.114002	30	1519	454
168	26	off	2026-05-29 11:32:43.074659	32	24	17
169	26	off	2026-05-29 12:10:33.019274	32	24	17
170	26	off	2026-05-29 13:55:03.637972	32	24	17
171	26	off	2026-05-29 13:59:56.815179	32	24	17
172	26	off	2026-05-29 14:02:31.771783	32	24	17
173	26	off	2026-05-29 14:04:56.427859	32	24	17
174	33	off	2026-05-29 11:49:03.740708	30	1519	454
175	33	off	2026-05-29 14:46:35.282536	30	1519	454
176	24	off	2026-05-13 10:51:53.813977	95	1409	368
177	24	off	2026-05-29 15:30:42.486224	32	25	19
\.


--
-- Data for Name: machine_live_status; Type: TABLE DATA; Schema: production_monitoring; Owner: -
--

COPY production_monitoring.machine_live_status (id, machine_id, status, last_updated, current_order_id, current_part_id, current_operation_id) FROM stdin;
15	14	off	2026-05-27 09:17:22.20638	32	35	56
31	30	off	2026-05-20 17:36:16.057607	30	1515	443
23	22	off	2026-05-21 14:30:01.026031	30	1515	452
27	26	off	2026-05-29 14:07:18.026258	32	24	17
38	33	off	2026-05-29 15:10:33.132556	30	1519	470
16	15	off	2026-05-12 10:56:10.898584	\N	\N	\N
26	25	off	2026-05-12 17:55:30.763892	\N	\N	\N
25	24	off	2026-05-29 15:41:52.348619	32	25	19
22	21	ON	2026-05-05 12:27:48.824206	\N	\N	\N
24	23	ON	2026-05-05 12:27:48.825712	\N	\N	\N
37	36	off	2026-05-11 09:33:48.893752	114	1439	378
17	16	OFF	2026-05-05 12:27:48.821677	\N	\N	\N
19	18	OFF	2026-05-05 12:27:48.822684	\N	\N	\N
30	29	OFF	2026-05-05 12:27:48.8296	\N	\N	\N
32	31	OFF	2026-05-05 12:27:48.831619	\N	\N	\N
33	32	OFF	2026-05-05 12:27:48.832017	\N	\N	\N
36	35	OFF	2026-05-05 12:27:48.833982	\N	\N	\N
35	34	off	2026-05-25 12:30:46.505151	30	1519	470
\.


--
-- Data for Name: oee_issue; Type: TABLE DATA; Schema: production_monitoring; Owner: -
--

COPY production_monitoring.oee_issue (id, machine_id, issue_category, issue_reason, start_time, end_time, duration_minutes, "timestamp") FROM stdin;
\.


--
-- Data for Name: shift_summary; Type: TABLE DATA; Schema: production_monitoring; Owner: -
--

COPY production_monitoring.shift_summary (id, machine_id, shift, "timestamp", oee, availability, performance, quality, availability_loss, performance_loss, quality_loss, total_parts, good_parts, bad_parts, updatedate, off_time, idle_time, production_time) FROM stdin;
83	14	1	2026-05-06 08:30:00	70	100	70	100	0	30	0	5	5	0	2026-05-06 16:30:00	01:23:00	01:04:00	05:33:00
87	13	1	2026-05-03 08:30:00	51.38	68.75	78.92	94.71	31.25	21.08	5.29	92	87	5	2026-05-03 16:30:00	01:11:00	01:19:00	05:30:00
88	14	1	2026-05-03 08:30:00	59.66	67.08	94.4	94.21	32.92	5.6	5.79	115	108	7	2026-05-03 16:30:00	01:06:00	01:32:00	05:22:00
89	15	1	2026-05-03 08:30:00	43.23	65.21	76.67	86.46	34.79	23.33	13.54	167	144	23	2026-05-03 16:30:00	02:09:00	00:38:00	05:13:00
135	13	3	2026-05-03 00:30:00	60.93	74.79	94.4	86.3	25.21	5.6	13.7	81	69	12	2026-05-03 08:30:00	01:00:00	01:01:00	05:59:00
136	14	3	2026-05-03 00:30:00	47.16	68.96	75.78	90.25	31.04	24.22	9.75	155	139	16	2026-05-03 08:30:00	00:53:00	01:36:00	05:31:00
137	15	3	2026-05-03 00:30:00	68.64	80.62	88.68	96	19.38	11.32	4	141	135	6	2026-05-03 08:30:00	00:31:00	01:02:00	06:27:00
138	16	3	2026-05-03 00:30:00	57.53	73.33	87.41	89.75	26.67	12.59	10.25	177	158	19	2026-05-03 08:30:00	01:12:00	00:56:00	05:52:00
139	17	3	2026-05-03 00:30:00	43.74	61.25	75.72	94.32	38.75	24.28	5.68	75	70	5	2026-05-03 08:30:00	02:17:00	00:49:00	04:54:00
140	18	3	2026-05-03 00:30:00	51.1	66.04	79.26	97.62	33.96	20.74	2.38	91	88	3	2026-05-03 08:30:00	01:49:00	00:54:00	05:17:00
141	19	3	2026-05-03 00:30:00	55.65	76.25	85.51	85.35	23.75	14.49	14.65	80	68	12	2026-05-03 08:30:00	01:08:00	00:46:00	06:06:00
142	20	3	2026-05-03 00:30:00	50.17	65.62	89.2	85.7	34.38	10.8	14.3	84	71	13	2026-05-03 08:30:00	01:25:00	01:20:00	05:15:00
143	21	3	2026-05-03 00:30:00	47.21	68.96	77.66	88.16	31.04	22.34	11.84	168	148	20	2026-05-03 08:30:00	01:01:00	01:28:00	05:31:00
144	22	3	2026-05-03 00:30:00	68.96	79.79	94.51	91.44	20.21	5.49	8.56	120	109	11	2026-05-03 08:30:00	01:13:00	00:24:00	06:23:00
145	23	3	2026-05-03 00:30:00	47.04	70.62	76.94	86.57	29.38	23.06	13.43	189	163	26	2026-05-03 08:30:00	01:06:00	01:15:00	05:39:00
146	24	3	2026-05-03 00:30:00	53.46	67.08	81.59	97.66	32.92	18.41	2.34	164	160	4	2026-05-03 08:30:00	01:03:00	01:35:00	05:22:00
147	25	3	2026-05-03 00:30:00	50.86	61.25	88.08	94.28	38.75	11.92	5.72	53	49	4	2026-05-03 08:30:00	02:42:00	00:24:00	04:54:00
148	26	3	2026-05-03 00:30:00	48.9	65.21	81.15	92.4	34.79	18.85	7.6	81	74	7	2026-05-03 08:30:00	01:29:00	01:18:00	05:13:00
149	27	3	2026-05-03 00:30:00	52.89	62.5	93.47	90.53	37.5	6.53	9.47	112	101	11	2026-05-03 08:30:00	01:35:00	01:25:00	05:00:00
150	28	3	2026-05-03 00:30:00	57.45	75	80.89	94.69	25	19.11	5.31	195	184	11	2026-05-03 08:30:00	00:50:00	01:10:00	06:00:00
151	29	3	2026-05-03 00:30:00	51.64	77.08	75.53	88.7	22.92	24.47	11.3	174	154	20	2026-05-03 08:30:00	00:35:00	01:15:00	06:10:00
152	30	3	2026-05-03 00:30:00	49.65	63.12	81.75	96.21	36.88	18.25	3.79	80	76	4	2026-05-03 08:30:00	01:22:00	01:35:00	05:03:00
153	31	3	2026-05-03 00:30:00	67.46	75.21	92.72	96.74	24.79	7.28	3.26	108	104	4	2026-05-03 08:30:00	00:58:00	01:01:00	06:01:00
154	32	3	2026-05-03 00:30:00	45.52	62.92	79.41	91.11	37.08	20.59	8.89	80	72	8	2026-05-03 08:30:00	01:45:00	01:13:00	05:02:00
155	33	3	2026-05-03 00:30:00	59.42	76.67	82.44	94.01	23.33	17.56	5.99	189	177	12	2026-05-03 08:30:00	00:46:00	01:06:00	06:08:00
156	34	3	2026-05-03 00:30:00	51.4	73.96	77.99	89.11	26.04	22.01	10.89	143	127	16	2026-05-03 08:30:00	01:12:00	00:53:00	05:55:00
157	35	3	2026-05-03 00:30:00	47.59	60.83	84.67	92.4	39.17	15.33	7.6	85	78	7	2026-05-03 08:30:00	02:20:00	00:48:00	04:52:00
158	36	3	2026-05-03 00:30:00	54.62	75.21	83.35	87.13	24.79	16.65	12.87	114	99	15	2026-05-03 08:30:00	00:46:00	01:13:00	06:01:00
90	16	1	2026-05-03 08:30:00	59.14	71.88	85.1	96.69	28.12	14.9	3.31	123	118	5	2026-05-03 16:30:00	00:44:00	01:31:00	05:45:00
91	17	1	2026-05-03 08:30:00	54.34	67.5	85.08	94.63	32.5	14.92	5.37	117	110	7	2026-05-03 16:30:00	01:56:00	00:40:00	05:24:00
92	18	1	2026-05-03 08:30:00	54.54	83.12	76.73	85.51	16.88	23.27	14.49	124	106	18	2026-05-03 16:30:00	00:34:00	00:47:00	06:39:00
93	19	1	2026-05-03 08:30:00	50.33	66.25	85.62	88.74	33.75	14.38	11.26	139	123	16	2026-05-03 16:30:00	01:19:00	01:23:00	05:18:00
94	20	1	2026-05-03 08:30:00	61.16	73.96	84.63	97.71	26.04	15.37	2.29	90	87	3	2026-05-03 16:30:00	00:48:00	01:17:00	05:55:00
95	21	1	2026-05-03 08:30:00	42.41	63.75	75.03	88.68	36.25	24.97	11.32	158	140	18	2026-05-03 16:30:00	01:48:00	01:06:00	05:06:00
96	22	1	2026-05-03 08:30:00	54.21	68.33	86.61	91.6	31.67	13.39	8.4	156	142	14	2026-05-03 16:30:00	01:46:00	00:46:00	05:28:00
97	23	1	2026-05-03 08:30:00	56.05	65	94.08	91.65	35	5.92	8.35	85	77	8	2026-05-03 16:30:00	01:43:00	01:05:00	05:12:00
98	24	1	2026-05-03 08:30:00	57.26	66.88	91.77	93.3	33.12	8.23	6.7	146	136	10	2026-05-03 16:30:00	01:19:00	01:20:00	05:21:00
99	25	1	2026-05-03 08:30:00	55.33	67.5	92.45	88.67	32.5	7.55	11.33	84	74	10	2026-05-03 16:30:00	01:01:00	01:35:00	05:24:00
100	26	1	2026-05-03 08:30:00	64.35	74.58	89.63	96.26	25.42	10.37	3.74	155	149	6	2026-05-03 16:30:00	00:59:00	01:03:00	05:58:00
101	27	1	2026-05-03 08:30:00	55.6	74.79	83.06	89.5	25.21	16.94	10.5	88	78	10	2026-05-03 16:30:00	01:33:00	00:28:00	05:59:00
102	28	1	2026-05-03 08:30:00	49.79	61.88	93.57	86	38.12	6.43	14	67	57	10	2026-05-03 16:30:00	01:50:00	01:13:00	04:57:00
103	29	1	2026-05-03 08:30:00	54.72	65	91.7	91.8	35	8.3	8.2	170	156	14	2026-05-03 16:30:00	01:22:00	01:26:00	05:12:00
104	30	1	2026-05-03 08:30:00	64.27	76.25	87.07	96.82	23.75	12.93	3.18	196	189	7	2026-05-03 16:30:00	00:25:00	01:29:00	06:06:00
105	31	1	2026-05-03 08:30:00	46.48	65.21	81.79	87.15	34.79	18.21	12.85	148	128	20	2026-05-03 16:30:00	01:16:00	01:31:00	05:13:00
106	32	1	2026-05-03 08:30:00	42.87	64.38	75.08	88.71	35.62	24.92	11.29	182	161	21	2026-05-03 16:30:00	01:34:00	01:17:00	05:09:00
107	33	1	2026-05-03 08:30:00	53.34	64.17	88.98	93.42	35.83	11.02	6.58	86	80	6	2026-05-03 16:30:00	01:17:00	01:35:00	05:08:00
108	34	1	2026-05-03 08:30:00	55.81	72.08	83.8	92.39	27.92	16.2	7.61	153	141	12	2026-05-03 16:30:00	01:05:00	01:09:00	05:46:00
109	35	1	2026-05-03 08:30:00	55.62	67.08	87.76	94.47	32.92	12.24	5.53	130	122	8	2026-05-03 16:30:00	02:14:00	00:24:00	05:22:00
110	36	1	2026-05-03 08:30:00	57.39	78.12	83.13	88.37	21.88	16.87	11.63	136	120	16	2026-05-03 16:30:00	01:06:00	00:39:00	06:15:00
111	13	2	2026-05-03 16:30:00	52.99	70.83	87.81	85.19	29.17	12.19	14.81	189	161	28	2026-05-04 00:30:00	01:19:00	01:01:00	05:40:00
112	14	2	2026-05-03 16:30:00	67.79	82.5	84.77	96.94	17.5	15.23	3.06	152	147	5	2026-05-04 00:30:00	00:27:00	00:57:00	06:36:00
113	15	2	2026-05-03 16:30:00	53.48	70.21	85.64	88.95	29.79	14.36	11.05	147	130	17	2026-05-04 00:30:00	01:49:00	00:34:00	05:37:00
114	16	2	2026-05-03 16:30:00	60.57	84.79	82.78	86.28	15.21	17.22	13.72	102	88	14	2026-05-04 00:30:00	00:29:00	00:44:00	06:47:00
115	17	2	2026-05-03 16:30:00	54.69	76.25	77.66	92.36	23.75	22.34	7.64	196	181	15	2026-05-04 00:30:00	00:43:00	01:11:00	06:06:00
116	18	2	2026-05-03 16:30:00	48.94	66.67	79.67	92.14	33.33	20.33	7.86	114	105	9	2026-05-04 00:30:00	01:24:00	01:16:00	05:20:00
117	19	2	2026-05-03 16:30:00	68.65	78.12	93.05	94.44	21.88	6.95	5.56	122	115	7	2026-05-04 00:30:00	01:21:00	00:24:00	06:15:00
118	20	2	2026-05-03 16:30:00	57.36	72.5	88.61	89.29	27.5	11.39	10.71	197	175	22	2026-05-04 00:30:00	00:47:00	01:25:00	05:48:00
119	21	2	2026-05-03 16:30:00	53.8	60	92.13	97.33	40	7.87	2.67	93	90	3	2026-05-04 00:30:00	02:27:00	00:45:00	04:48:00
120	22	2	2026-05-03 16:30:00	62.31	73.12	89.83	94.86	26.88	10.17	5.14	97	92	5	2026-05-04 00:30:00	00:55:00	01:14:00	05:51:00
121	23	2	2026-05-03 16:30:00	59.25	72.29	84.1	97.46	27.71	15.9	2.54	148	144	4	2026-05-04 00:30:00	01:37:00	00:36:00	05:47:00
122	24	2	2026-05-03 16:30:00	57.41	82.5	80.94	85.97	17.5	19.06	14.03	108	92	16	2026-05-04 00:30:00	00:50:00	00:34:00	06:36:00
123	25	2	2026-05-03 16:30:00	52.86	68.12	84.11	92.25	31.88	15.89	7.75	114	105	9	2026-05-04 00:30:00	01:22:00	01:11:00	05:27:00
124	26	2	2026-05-03 16:30:00	56.91	77.08	76.57	96.42	22.92	23.43	3.58	118	113	5	2026-05-04 00:30:00	01:14:00	00:36:00	06:10:00
125	27	2	2026-05-03 16:30:00	62.31	71.88	94.98	91.27	28.12	5.02	8.73	153	139	14	2026-05-04 00:30:00	01:30:00	00:45:00	05:45:00
126	28	2	2026-05-03 16:30:00	60.38	75.42	90.28	88.69	24.58	9.72	11.31	137	121	16	2026-05-04 00:30:00	00:36:00	01:22:00	06:02:00
127	29	2	2026-05-03 16:30:00	54.24	72.08	78.07	96.38	27.92	21.93	3.62	108	104	4	2026-05-04 00:30:00	00:46:00	01:28:00	05:46:00
128	30	2	2026-05-03 16:30:00	66.44	82.71	88.83	90.43	17.29	11.17	9.57	149	134	15	2026-05-04 00:30:00	00:28:00	00:55:00	06:37:00
129	31	2	2026-05-03 16:30:00	67.89	78.12	89.63	96.95	21.88	10.37	3.05	99	95	4	2026-05-04 00:30:00	00:28:00	01:17:00	06:15:00
130	32	2	2026-05-03 16:30:00	59.84	68.54	92.5	94.39	31.46	7.5	5.61	80	75	5	2026-05-04 00:30:00	01:24:00	01:07:00	05:29:00
131	33	2	2026-05-03 16:30:00	66.07	77.29	88.59	96.49	22.71	11.41	3.51	136	131	5	2026-05-04 00:30:00	01:01:00	00:48:00	06:11:00
132	34	2	2026-05-03 16:30:00	68.41	77.71	93.84	93.82	22.29	6.16	6.18	198	185	13	2026-05-04 00:30:00	01:18:00	00:29:00	06:13:00
133	35	2	2026-05-03 16:30:00	54.99	70.62	87.96	88.52	29.38	12.04	11.48	153	135	18	2026-05-04 00:30:00	00:51:00	01:30:00	05:39:00
134	36	2	2026-05-03 16:30:00	53.16	70.62	84.24	89.35	29.38	15.76	10.65	119	106	13	2026-05-04 00:30:00	01:10:00	01:11:00	05:39:00
207	13	3	2026-05-04 00:30:00	64.39	74.38	94.42	91.69	25.62	5.58	8.31	197	180	17	2026-05-04 08:30:00	01:18:00	00:45:00	05:57:00
208	14	3	2026-05-04 00:30:00	56.09	69.38	88.54	91.32	30.62	11.46	8.68	109	99	10	2026-05-04 08:30:00	01:58:00	00:29:00	05:33:00
209	15	3	2026-05-04 00:30:00	59.69	76.25	81.61	95.92	23.75	18.39	4.08	170	163	7	2026-05-04 08:30:00	00:47:00	01:07:00	06:06:00
210	16	3	2026-05-04 00:30:00	54.43	72.71	79.86	93.74	27.29	20.14	6.26	97	90	7	2026-05-04 08:30:00	01:39:00	00:32:00	05:49:00
211	17	3	2026-05-04 00:30:00	56.85	68.96	85.77	96.12	31.04	14.23	3.88	132	126	6	2026-05-04 08:30:00	01:38:00	00:51:00	05:31:00
212	18	3	2026-05-04 00:30:00	58.66	71.88	92.94	87.81	28.12	7.06	12.19	98	86	12	2026-05-04 08:30:00	00:54:00	01:21:00	05:45:00
213	19	3	2026-05-04 00:30:00	46.61	70.62	76.09	86.73	29.38	23.91	13.27	110	95	15	2026-05-04 08:30:00	01:30:00	00:51:00	05:39:00
214	20	3	2026-05-04 00:30:00	54.55	62.5	89.06	97.99	37.5	10.94	2.01	62	60	2	2026-05-04 08:30:00	02:06:00	00:54:00	05:00:00
215	21	3	2026-05-04 00:30:00	58.15	65.83	91.54	96.49	34.17	8.46	3.51	135	130	5	2026-05-04 08:30:00	01:08:00	01:36:00	05:16:00
216	22	3	2026-05-04 00:30:00	57.55	77.29	77.91	95.57	22.71	22.09	4.43	138	131	7	2026-05-04 08:30:00	00:49:00	01:00:00	06:11:00
217	23	3	2026-05-04 00:30:00	51.6	65.42	92.11	85.64	34.58	7.89	14.36	132	113	19	2026-05-04 08:30:00	02:22:00	00:24:00	05:14:00
218	24	3	2026-05-04 00:30:00	57.56	66.46	94.67	91.49	33.54	5.33	8.51	136	124	12	2026-05-04 08:30:00	01:09:00	01:32:00	05:19:00
219	25	3	2026-05-04 00:30:00	52.77	69.79	78.28	96.6	30.21	21.72	3.4	108	104	4	2026-05-04 08:30:00	01:55:00	00:30:00	05:35:00
220	26	3	2026-05-04 00:30:00	56.78	68.33	84.8	97.98	31.67	15.2	2.02	190	186	4	2026-05-04 08:30:00	02:05:00	00:27:00	05:28:00
221	27	3	2026-05-04 00:30:00	51.1	62.29	89.89	91.25	37.71	10.11	8.75	97	88	9	2026-05-04 08:30:00	02:37:00	00:24:00	04:59:00
222	28	3	2026-05-04 00:30:00	55.68	67.92	90.38	90.7	32.08	9.62	9.3	158	143	15	2026-05-04 08:30:00	01:11:00	01:23:00	05:26:00
223	29	3	2026-05-04 00:30:00	54.66	78.33	75.45	92.48	21.67	24.55	7.52	146	135	11	2026-05-04 08:30:00	00:41:00	01:03:00	06:16:00
224	30	3	2026-05-04 00:30:00	55.97	74.79	82.78	90.39	25.21	17.22	9.61	150	135	15	2026-05-04 08:30:00	01:20:00	00:41:00	05:59:00
225	31	3	2026-05-04 00:30:00	53.04	68.96	84.52	91	31.04	15.48	9	112	101	11	2026-05-04 08:30:00	01:09:00	01:20:00	05:31:00
226	32	3	2026-05-04 00:30:00	63.84	75	94.65	89.94	25	5.35	10.06	91	81	10	2026-05-04 08:30:00	00:57:00	01:03:00	06:00:00
227	33	3	2026-05-04 00:30:00	58.44	70.42	90.99	91.22	29.58	9.01	8.78	104	94	10	2026-05-04 08:30:00	01:15:00	01:07:00	05:38:00
228	34	3	2026-05-04 00:30:00	67.79	81.46	93.42	89.09	18.54	6.58	10.91	142	126	16	2026-05-04 08:30:00	00:46:00	00:43:00	06:31:00
229	35	3	2026-05-04 00:30:00	53.58	68.12	91.75	85.72	31.88	8.25	14.28	119	102	17	2026-05-04 08:30:00	01:49:00	00:44:00	05:27:00
230	36	3	2026-05-04 00:30:00	51.5	66.46	79.92	96.97	33.54	20.08	3.03	161	156	5	2026-05-04 08:30:00	01:26:00	01:15:00	05:19:00
159	13	1	2026-05-04 08:30:00	44.36	62.5	75.4	94.13	37.5	24.6	5.87	103	96	7	2026-05-04 16:30:00	01:43:00	01:17:00	05:00:00
160	14	1	2026-05-04 08:30:00	61.27	81.04	84.73	89.22	18.96	15.27	10.78	124	110	14	2026-05-04 16:30:00	00:31:00	01:00:00	06:29:00
161	15	1	2026-05-04 08:30:00	57.46	76.25	82.06	91.82	23.75	17.94	8.18	115	105	10	2026-05-04 16:30:00	01:08:00	00:46:00	06:06:00
162	16	1	2026-05-04 08:30:00	52.19	68.96	84.88	89.17	31.04	15.12	10.83	94	83	11	2026-05-04 16:30:00	01:12:00	01:17:00	05:31:00
163	17	1	2026-05-04 08:30:00	45.9	65.21	75.8	92.85	34.79	24.2	7.15	88	81	7	2026-05-04 16:30:00	02:14:00	00:33:00	05:13:00
164	18	1	2026-05-04 08:30:00	49.19	69.38	79.25	89.47	30.62	20.75	10.53	101	90	11	2026-05-04 16:30:00	01:28:00	00:59:00	05:33:00
165	19	1	2026-05-04 08:30:00	61.33	74.17	89.54	92.35	25.83	10.46	7.65	198	182	16	2026-05-04 16:30:00	00:55:00	01:09:00	05:56:00
166	20	1	2026-05-04 08:30:00	56.78	63.12	92.87	96.85	36.88	7.13	3.15	81	78	3	2026-05-04 16:30:00	02:25:00	00:32:00	05:03:00
167	21	1	2026-05-04 08:30:00	46.41	62.08	87.56	85.38	37.92	12.44	14.62	120	102	18	2026-05-04 16:30:00	01:56:00	01:06:00	04:58:00
168	22	1	2026-05-04 08:30:00	59.17	64.58	93.75	97.72	35.42	6.25	2.28	123	120	3	2026-05-04 16:30:00	02:07:00	00:43:00	05:10:00
169	23	1	2026-05-04 08:30:00	62.15	81.67	84.22	90.35	18.33	15.78	9.65	128	115	13	2026-05-04 16:30:00	01:02:00	00:26:00	06:32:00
170	24	1	2026-05-04 08:30:00	41.64	62.08	77.96	86.03	37.92	22.04	13.97	42	36	6	2026-05-04 16:30:00	02:18:00	00:44:00	04:58:00
171	25	1	2026-05-04 08:30:00	51.1	65.21	84.88	92.31	34.79	15.12	7.69	178	164	14	2026-05-04 16:30:00	01:37:00	01:10:00	05:13:00
172	26	1	2026-05-04 08:30:00	42.9	62.29	80.91	85.12	37.71	19.09	14.88	113	96	17	2026-05-04 16:30:00	01:26:00	01:35:00	04:59:00
173	27	1	2026-05-04 08:30:00	47.24	61.88	87.36	87.39	38.12	12.64	12.61	63	55	8	2026-05-04 16:30:00	02:13:00	00:50:00	04:57:00
174	28	1	2026-05-04 08:30:00	63.15	76.25	87.08	95.11	23.75	12.92	4.89	177	168	9	2026-05-04 16:30:00	00:33:00	01:21:00	06:06:00
175	29	1	2026-05-04 08:30:00	63.07	75	89.96	93.48	25	10.04	6.52	145	135	10	2026-05-04 16:30:00	00:59:00	01:01:00	06:00:00
176	30	1	2026-05-04 08:30:00	45.16	62.29	79.93	90.7	37.71	20.07	9.3	77	69	8	2026-05-04 16:30:00	02:03:00	00:58:00	04:59:00
177	31	1	2026-05-04 08:30:00	59.88	69.38	89.02	96.96	30.62	10.98	3.04	140	135	5	2026-05-04 16:30:00	01:09:00	01:18:00	05:33:00
178	32	1	2026-05-04 08:30:00	51.7	66.67	80.5	96.34	33.33	19.5	3.66	92	88	4	2026-05-04 16:30:00	02:02:00	00:38:00	05:20:00
179	33	1	2026-05-04 08:30:00	45.58	63.96	82.36	86.53	36.04	17.64	13.47	135	116	19	2026-05-04 16:30:00	02:18:00	00:35:00	05:07:00
180	34	1	2026-05-04 08:30:00	50.17	73.96	77.99	86.98	26.04	22.01	13.02	120	104	16	2026-05-04 16:30:00	00:45:00	01:20:00	05:55:00
181	35	1	2026-05-04 08:30:00	66.36	82.92	91.22	87.74	17.08	8.78	12.26	101	88	13	2026-05-04 16:30:00	00:41:00	00:41:00	06:38:00
182	36	1	2026-05-04 08:30:00	52.89	66.46	83.39	95.43	33.54	16.61	4.57	136	129	7	2026-05-04 16:30:00	01:16:00	01:25:00	05:19:00
183	13	2	2026-05-04 16:30:00	54.82	69.79	84.61	92.84	30.21	15.39	7.16	149	138	11	2026-05-05 00:30:00	01:36:00	00:49:00	05:35:00
184	14	2	2026-05-04 16:30:00	62.63	73.54	92.7	91.88	26.46	7.3	8.12	170	156	14	2026-05-05 00:30:00	00:37:00	01:30:00	05:53:00
185	15	2	2026-05-04 16:30:00	59.78	72.5	94.21	87.52	27.5	5.79	12.48	86	75	11	2026-05-05 00:30:00	00:43:00	01:29:00	05:48:00
186	16	2	2026-05-04 16:30:00	42.94	64.58	76.7	86.67	35.42	23.3	13.33	166	143	23	2026-05-05 00:30:00	02:08:00	00:42:00	05:10:00
187	17	2	2026-05-04 16:30:00	54.38	70.42	86.46	89.32	29.58	13.54	10.68	179	159	20	2026-05-05 00:30:00	01:52:00	00:30:00	05:38:00
188	18	2	2026-05-04 16:30:00	50.07	76.25	75.32	87.18	23.75	24.68	12.82	161	140	21	2026-05-05 00:30:00	01:18:00	00:36:00	06:06:00
189	19	2	2026-05-04 16:30:00	53.79	62.29	91.26	94.63	37.71	8.74	5.37	65	61	4	2026-05-05 00:30:00	02:18:00	00:43:00	04:59:00
190	20	2	2026-05-04 16:30:00	52.31	70.83	78.98	93.5	29.17	21.02	6.5	195	182	13	2026-05-05 00:30:00	01:29:00	00:51:00	05:40:00
191	21	2	2026-05-04 16:30:00	56.19	69.79	85.7	93.94	30.21	14.3	6.06	159	149	10	2026-05-05 00:30:00	01:13:00	01:12:00	05:35:00
192	22	2	2026-05-04 16:30:00	60.85	79.79	78.29	97.4	20.21	21.71	2.6	120	116	4	2026-05-05 00:30:00	00:47:00	00:50:00	06:23:00
193	23	2	2026-05-04 16:30:00	59.7	66.46	93.06	96.54	33.54	6.94	3.46	180	173	7	2026-05-05 00:30:00	01:19:00	01:22:00	05:19:00
194	24	2	2026-05-04 16:30:00	50.63	70.42	79.2	90.79	29.58	20.8	9.21	96	87	9	2026-05-05 00:30:00	00:57:00	01:25:00	05:38:00
195	25	2	2026-05-04 16:30:00	53.17	63.54	88.45	94.6	36.46	11.55	5.4	156	147	9	2026-05-05 00:30:00	01:51:00	01:04:00	05:05:00
196	26	2	2026-05-04 16:30:00	59.88	74.58	82.8	96.97	25.42	17.2	3.03	125	121	4	2026-05-05 00:30:00	01:26:00	00:36:00	05:58:00
197	27	2	2026-05-04 16:30:00	49.29	70.83	81.6	85.27	29.17	18.4	14.73	181	154	27	2026-05-05 00:30:00	01:17:00	01:03:00	05:40:00
198	28	2	2026-05-04 16:30:00	58.24	80	77.58	93.84	20	22.42	6.16	186	174	12	2026-05-05 00:30:00	00:27:00	01:09:00	06:24:00
199	29	2	2026-05-04 16:30:00	60.22	73.96	86.55	94.08	26.04	13.45	5.92	130	122	8	2026-05-05 00:30:00	01:01:00	01:04:00	05:55:00
200	30	2	2026-05-04 16:30:00	71.12	80.21	93.89	94.44	19.79	6.11	5.56	164	154	10	2026-05-05 00:30:00	00:54:00	00:41:00	06:25:00
201	31	2	2026-05-04 16:30:00	60.23	81.46	80.56	91.78	18.54	19.44	8.22	89	81	8	2026-05-05 00:30:00	00:40:00	00:49:00	06:31:00
202	32	2	2026-05-04 16:30:00	48.61	70.62	78.66	87.5	29.38	21.34	12.5	80	69	11	2026-05-05 00:30:00	00:53:00	01:28:00	05:39:00
203	33	2	2026-05-04 16:30:00	58.35	69.38	92.18	91.24	30.62	7.82	8.76	88	80	8	2026-05-05 00:30:00	01:40:00	00:47:00	05:33:00
204	34	2	2026-05-04 16:30:00	51.65	68.54	86.63	86.99	31.46	13.37	13.01	163	141	22	2026-05-05 00:30:00	01:03:00	01:28:00	05:29:00
205	35	2	2026-05-04 16:30:00	51.36	63.12	89.47	90.93	36.88	10.53	9.07	189	171	18	2026-05-05 00:30:00	02:09:00	00:48:00	05:03:00
206	36	2	2026-05-04 16:30:00	60.35	78.54	88.43	86.89	21.46	11.57	13.11	140	121	19	2026-05-05 00:30:00	00:34:00	01:09:00	06:17:00
279	13	3	2026-05-05 00:30:00	45.11	61.25	83.98	87.7	38.75	16.02	12.3	77	67	10	2026-05-05 08:30:00	01:42:00	01:24:00	04:54:00
280	14	3	2026-05-05 00:30:00	64.02	77.92	90.53	90.76	22.08	9.47	9.24	126	114	12	2026-05-05 08:30:00	00:52:00	00:54:00	06:14:00
281	15	3	2026-05-05 00:30:00	67.43	82.29	84.21	97.32	17.71	15.79	2.68	139	135	4	2026-05-05 08:30:00	00:51:00	00:34:00	06:35:00
282	16	3	2026-05-05 00:30:00	48.98	63.12	84.62	91.7	36.88	15.38	8.3	110	100	10	2026-05-05 08:30:00	02:14:00	00:43:00	05:03:00
283	17	3	2026-05-05 00:30:00	60.33	73.54	84.41	97.19	26.46	15.59	2.81	84	81	3	2026-05-05 08:30:00	01:00:00	01:07:00	05:53:00
284	18	3	2026-05-05 00:30:00	47.16	65.42	83.23	86.61	34.58	16.77	13.39	82	71	11	2026-05-05 08:30:00	02:10:00	00:36:00	05:14:00
285	19	3	2026-05-05 00:30:00	47.32	66.46	75.09	94.83	33.54	24.91	5.17	171	162	9	2026-05-05 08:30:00	01:11:00	01:30:00	05:19:00
286	20	3	2026-05-05 00:30:00	61.9	75.21	84.83	97.02	24.79	15.17	2.98	100	97	3	2026-05-05 08:30:00	00:41:00	01:18:00	06:01:00
287	21	3	2026-05-05 00:30:00	49.17	69.38	78.17	90.68	30.62	21.83	9.32	102	92	10	2026-05-05 08:30:00	01:42:00	00:45:00	05:33:00
288	22	3	2026-05-05 00:30:00	64.21	75.83	94.76	89.36	24.17	5.24	10.64	127	113	14	2026-05-05 08:30:00	01:10:00	00:46:00	06:04:00
289	23	3	2026-05-05 00:30:00	51.35	72.71	80.22	88.04	27.29	19.78	11.96	147	129	18	2026-05-05 08:30:00	00:35:00	01:36:00	05:49:00
290	24	3	2026-05-05 00:30:00	63.16	75.42	92.01	91.01	24.58	7.99	8.99	181	164	17	2026-05-05 08:30:00	00:45:00	01:13:00	06:02:00
291	25	3	2026-05-05 00:30:00	59.51	75.21	90.1	87.82	24.79	9.9	12.18	120	105	15	2026-05-05 08:30:00	01:08:00	00:51:00	06:01:00
292	26	3	2026-05-05 00:30:00	45.84	69.79	77.26	85.01	30.21	22.74	14.99	94	79	15	2026-05-05 08:30:00	01:49:00	00:36:00	05:35:00
293	27	3	2026-05-05 00:30:00	47.74	61.88	82.5	93.51	38.12	17.5	6.49	45	42	3	2026-05-05 08:30:00	01:48:00	01:15:00	04:57:00
294	28	3	2026-05-05 00:30:00	52.53	75	78.37	89.37	25	21.63	10.63	121	108	13	2026-05-05 08:30:00	00:26:00	01:34:00	06:00:00
295	29	3	2026-05-05 00:30:00	70.57	79.58	94.38	93.96	20.42	5.62	6.04	194	182	12	2026-05-05 08:30:00	00:25:00	01:13:00	06:22:00
296	30	3	2026-05-05 00:30:00	60.91	69.17	92.3	95.41	30.83	7.7	4.59	80	76	4	2026-05-05 08:30:00	01:24:00	01:04:00	05:32:00
297	31	3	2026-05-05 00:30:00	48.43	62.5	84.5	91.7	37.5	15.5	8.3	119	109	10	2026-05-05 08:30:00	01:30:00	01:30:00	05:00:00
298	32	3	2026-05-05 00:30:00	61.19	74.79	87.32	93.69	25.21	12.68	6.31	144	134	10	2026-05-05 08:30:00	01:30:00	00:31:00	05:59:00
299	33	3	2026-05-05 00:30:00	50.85	66.67	81.22	93.91	33.33	18.78	6.09	170	159	11	2026-05-05 08:30:00	01:29:00	01:11:00	05:20:00
300	34	3	2026-05-05 00:30:00	61.29	76.04	87.67	91.93	23.96	12.33	8.07	134	123	11	2026-05-05 08:30:00	01:17:00	00:38:00	06:05:00
301	35	3	2026-05-05 00:30:00	57.13	75	83.01	91.77	25	16.99	8.23	179	164	15	2026-05-05 08:30:00	00:58:00	01:02:00	06:00:00
302	36	3	2026-05-05 00:30:00	70.66	80.42	93.61	93.86	19.58	6.39	6.14	182	170	12	2026-05-05 08:30:00	00:42:00	00:52:00	06:26:00
231	13	1	2026-05-05 08:30:00	48.78	69.38	81.58	86.19	30.62	18.42	13.81	109	93	16	2026-05-05 16:30:00	00:58:00	01:29:00	05:33:00
232	14	1	2026-05-05 08:30:00	45.7	69.58	75.37	87.13	30.42	24.63	12.87	98	85	13	2026-05-05 16:30:00	01:20:00	01:06:00	05:34:00
233	15	1	2026-05-05 08:30:00	63.94	75.62	91.96	91.94	24.38	8.04	8.06	115	105	10	2026-05-05 16:30:00	00:40:00	01:17:00	06:03:00
234	16	1	2026-05-05 08:30:00	62.32	76.67	94.61	85.92	23.33	5.39	14.08	142	122	20	2026-05-05 16:30:00	00:24:00	01:28:00	06:08:00
235	17	1	2026-05-05 08:30:00	57.88	69.17	91	91.96	30.83	9	8.04	90	82	8	2026-05-05 16:30:00	01:39:00	00:49:00	05:32:00
236	18	1	2026-05-05 08:30:00	44	62.29	79.43	88.93	37.71	20.57	11.07	86	76	10	2026-05-05 16:30:00	02:37:00	00:24:00	04:59:00
237	19	1	2026-05-05 08:30:00	53.75	68.54	87.68	89.44	31.46	12.32	10.56	163	145	18	2026-05-05 16:30:00	01:01:00	01:30:00	05:29:00
238	20	1	2026-05-05 08:30:00	46.88	70	77.4	86.53	30	22.6	13.47	88	76	12	2026-05-05 16:30:00	00:57:00	01:27:00	05:36:00
239	21	1	2026-05-05 08:30:00	63.64	81.67	90.36	86.25	18.33	9.64	13.75	175	150	25	2026-05-05 16:30:00	00:49:00	00:39:00	06:32:00
240	22	1	2026-05-05 08:30:00	56.14	72.92	88.39	87.11	27.08	11.61	12.89	98	85	13	2026-05-05 16:30:00	00:54:00	01:16:00	05:50:00
241	23	1	2026-05-05 08:30:00	59.5	82.92	75.59	94.94	17.08	24.41	5.06	183	173	10	2026-05-05 16:30:00	00:31:00	00:51:00	06:38:00
242	24	1	2026-05-05 08:30:00	56.82	67.08	87.62	96.68	32.92	12.38	3.32	90	87	3	2026-05-05 16:30:00	01:55:00	00:43:00	05:22:00
243	25	1	2026-05-05 08:30:00	56.29	70	93.22	86.26	30	6.78	13.74	134	115	19	2026-05-05 16:30:00	01:16:00	01:08:00	05:36:00
244	26	1	2026-05-05 08:30:00	68.72	76.46	91.98	97.72	23.54	8.02	2.28	125	122	3	2026-05-05 16:30:00	00:26:00	01:27:00	06:07:00
245	27	1	2026-05-05 08:30:00	41.45	60.42	76.61	89.55	39.58	23.39	10.45	65	58	7	2026-05-05 16:30:00	02:36:00	00:34:00	04:50:00
246	28	1	2026-05-05 08:30:00	59.84	75.83	83.98	93.96	24.17	16.02	6.04	81	76	5	2026-05-05 16:30:00	00:54:00	01:02:00	06:04:00
247	29	1	2026-05-05 08:30:00	60.12	74.38	91.65	88.19	25.62	8.35	11.81	146	128	18	2026-05-05 16:30:00	00:37:00	01:26:00	05:57:00
248	30	1	2026-05-05 08:30:00	48.9	70.21	79.76	87.33	29.79	20.24	12.67	146	127	19	2026-05-05 16:30:00	01:51:00	00:32:00	05:37:00
249	31	1	2026-05-05 08:30:00	70.67	80	94.07	93.91	20	5.93	6.09	119	111	8	2026-05-05 16:30:00	00:30:00	01:06:00	06:24:00
250	32	1	2026-05-05 08:30:00	52.47	67.5	91.09	85.34	32.5	8.91	14.66	81	69	12	2026-05-05 16:30:00	01:32:00	01:04:00	05:24:00
251	33	1	2026-05-05 08:30:00	55.06	75.62	77.55	93.88	24.38	22.45	6.12	182	170	12	2026-05-05 16:30:00	01:20:00	00:37:00	06:03:00
252	34	1	2026-05-05 08:30:00	56.88	70.21	86.37	93.8	29.79	13.63	6.2	181	169	12	2026-05-05 16:30:00	01:26:00	00:57:00	05:37:00
253	35	1	2026-05-05 08:30:00	49.6	68.33	77.45	93.71	31.67	22.55	6.29	193	180	13	2026-05-05 16:30:00	01:00:00	01:32:00	05:28:00
254	36	1	2026-05-05 08:30:00	59.98	75	90.21	88.65	25	9.79	11.35	174	154	20	2026-05-05 16:30:00	00:28:00	01:32:00	06:00:00
255	13	2	2026-05-05 16:30:00	51.14	72.29	77.65	91.1	27.71	22.35	8.9	168	153	15	2026-05-06 00:30:00	01:39:00	00:34:00	05:47:00
256	14	2	2026-05-05 16:30:00	60.51	77.71	89.62	86.89	22.29	10.38	13.11	151	131	20	2026-05-06 00:30:00	01:04:00	00:43:00	06:13:00
257	15	2	2026-05-05 16:30:00	62.4	76.88	89.45	90.76	23.12	10.55	9.24	188	170	18	2026-05-06 00:30:00	00:26:00	01:25:00	06:09:00
258	16	2	2026-05-05 16:30:00	50.55	62.92	91.37	87.94	37.08	8.63	12.06	139	122	17	2026-05-06 00:30:00	02:11:00	00:47:00	05:02:00
259	17	2	2026-05-05 16:30:00	61.63	74.79	93.2	88.42	25.21	6.8	11.58	175	154	21	2026-05-06 00:30:00	00:31:00	01:30:00	05:59:00
260	18	2	2026-05-05 16:30:00	58.94	76.25	80.39	96.16	23.75	19.61	3.84	109	104	5	2026-05-06 00:30:00	01:19:00	00:35:00	06:06:00
261	19	2	2026-05-05 16:30:00	53.88	71.88	85.74	87.44	28.12	14.26	12.56	93	81	12	2026-05-06 00:30:00	00:39:00	01:36:00	05:45:00
262	20	2	2026-05-05 16:30:00	59.71	74.17	93.06	86.51	25.83	6.94	13.49	113	97	16	2026-05-06 00:30:00	01:05:00	00:59:00	05:56:00
263	21	2	2026-05-05 16:30:00	54.83	63.12	88.73	97.9	36.88	11.27	2.1	189	185	4	2026-05-06 00:30:00	02:26:00	00:31:00	05:03:00
264	22	2	2026-05-05 16:30:00	54.75	65.83	90.79	91.6	34.17	9.21	8.4	188	172	16	2026-05-06 00:30:00	02:07:00	00:37:00	05:16:00
265	23	2	2026-05-05 16:30:00	53.08	63.33	85.55	97.96	36.67	14.45	2.04	166	162	4	2026-05-06 00:30:00	01:54:00	01:02:00	05:04:00
266	24	2	2026-05-05 16:30:00	59.2	71.25	93.41	88.95	28.75	6.59	11.05	186	165	21	2026-05-06 00:30:00	01:37:00	00:41:00	05:42:00
267	25	2	2026-05-05 16:30:00	50.13	63.33	86.38	91.64	36.67	13.62	8.36	151	138	13	2026-05-06 00:30:00	02:15:00	00:41:00	05:04:00
268	26	2	2026-05-05 16:30:00	58.27	73.54	92.88	85.31	26.46	7.12	14.69	116	98	18	2026-05-06 00:30:00	01:20:00	00:47:00	05:53:00
269	27	2	2026-05-05 16:30:00	51.97	66.88	80.24	96.84	33.12	19.76	3.16	198	191	7	2026-05-06 00:30:00	01:03:00	01:36:00	05:21:00
270	28	2	2026-05-05 16:30:00	53.07	67.08	86.11	91.87	32.92	13.89	8.13	134	123	11	2026-05-06 00:30:00	01:30:00	01:08:00	05:22:00
271	29	2	2026-05-05 16:30:00	61.57	79.38	82.09	94.49	20.62	17.91	5.51	174	164	10	2026-05-06 00:30:00	00:57:00	00:42:00	06:21:00
272	30	2	2026-05-05 16:30:00	55.91	71.25	82.94	94.61	28.75	17.06	5.39	168	158	10	2026-05-06 00:30:00	00:57:00	01:21:00	05:42:00
273	31	2	2026-05-05 16:30:00	50.99	63.96	93.23	85.51	36.04	6.77	14.49	146	124	22	2026-05-06 00:30:00	02:16:00	00:37:00	05:07:00
274	32	2	2026-05-05 16:30:00	49.49	76.67	75.49	85.52	23.33	24.51	14.48	165	141	24	2026-05-06 00:30:00	01:19:00	00:33:00	06:08:00
275	33	2	2026-05-05 16:30:00	59.29	72.92	93.35	87.1	27.08	6.65	12.9	105	91	14	2026-05-06 00:30:00	01:19:00	00:51:00	05:50:00
276	34	2	2026-05-05 16:30:00	54.69	73.54	78.84	94.34	26.46	21.16	5.66	85	80	5	2026-05-06 00:30:00	00:40:00	01:27:00	05:53:00
277	35	2	2026-05-05 16:30:00	63.92	77.29	93.72	88.25	22.71	6.28	11.75	112	98	14	2026-05-06 00:30:00	01:10:00	00:39:00	06:11:00
278	36	2	2026-05-05 16:30:00	54.32	62.71	94.59	91.58	37.29	5.41	8.42	150	137	13	2026-05-06 00:30:00	02:30:00	00:29:00	05:01:00
84	26	1	2026-05-06 08:30:00	70	100	70	100	0	30	0	5	5	0	2026-05-06 16:30:00	02:15:00	00:50:00	04:55:00
85	14	1	2026-05-11 08:30:00	0	100	70	0	0	30	100	2	0	2	2026-05-11 16:30:00	01:44:00	01:10:00	05:06:00
86	26	1	2026-05-11 08:30:00	0	100	70	0	0	30	100	2	0	2	2026-05-11 16:30:00	00:38:00	01:32:00	05:50:00
\.


--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.alembic_version (version_num) FROM stdin;
001_user_id_docs
\.


--
-- Data for Name: ftp_status; Type: TABLE DATA; Schema: quality; Owner: -
--

COPY quality.ftp_status (id, order_id, ipid, is_completed, status, created_at, updated_at, approved_by_username, approved_at) FROM stdin;
1	100	PLAN_100_0001-1_OP10	t	Completed	2026-04-09 14:38:35.617449+05:30	2026-04-09 14:38:35.617449+05:30	\N	\N
2	100	PLAN_100_001-23_OP10	t	Completed	2026-04-09 17:22:45.945049+05:30	2026-04-09 17:22:45.945049+05:30	\N	\N
3	113	FTP_0001-1_OP_10	t	approved	2026-04-13 14:54:53.305655+05:30	2026-04-13 14:58:20.616603+05:30	\N	\N
4	113	FTP_0001-1_OP_20	t	approved	2026-04-13 15:01:37.866599+05:30	2026-04-13 15:03:08.828685+05:30	\N	\N
5	114	FTP_00089_OP_20	t	approved	2026-04-13 15:29:32.273262+05:30	2026-04-13 15:29:52.258174+05:30	\N	\N
6	114	FTP_00089_OP_30	t	approved	2026-04-13 16:49:31.064682+05:30	2026-04-13 16:50:06.282688+05:30	\N	\N
7	114	FTP_00987_OP_10	t	approved	2026-04-15 10:12:23.43322+05:30	2026-04-15 10:13:12.566755+05:30	\N	\N
8	114	FTP_00987_OP_20	t	approved	2026-04-16 12:08:30.31155+05:30	2026-04-16 12:09:41.837494+05:30	\N	\N
9	114	FTP_0098712_OP_20	t	approved	2026-04-22 10:56:43.191291+05:30	2026-04-22 10:57:43.98893+05:30	\N	\N
10	114	FTP_00987_OP_30	f	pending	2026-04-22 12:15:07.461911+05:30	2026-04-22 12:15:07.461911+05:30	\N	\N
12	114	FTP_00089_OP_0	t	approved	2026-04-28 17:16:31.756282+05:30	2026-04-28 17:16:31.756282+05:30	supervisor	2026-04-28 17:16:31.756282+05:30
13	114	FTP_0098712_OP_0	t	approved	2026-04-29 11:37:15.998354+05:30	2026-04-29 11:37:15.998354+05:30	supervisor	2026-04-29 11:37:15.998354+05:30
14	114	FTP_0078_OP_0	t	approved	2026-04-29 12:11:34.997056+05:30	2026-04-29 12:11:34.997056+05:30	supervisor	2026-04-29 12:11:34.997056+05:30
15	114	FTP_00098345_OP_0	t	approved	2026-04-29 12:12:18.471353+05:30	2026-04-29 12:12:18.471353+05:30	supervisor	2026-04-29 12:12:18.471353+05:30
16	114	FTP_00987_OP_0	t	approved	2026-05-05 14:22:20.909801+05:30	2026-05-05 14:25:29.29136+05:30	supervisor	2026-05-05 14:25:29.29136+05:30
17	32	FTP_002_OP_20	t	approved	2026-05-05 14:41:05.87845+05:30	2026-05-05 15:19:29.249686+05:30	supervisor	2026-05-05 15:19:29.249686+05:30
11	114	FTP_0078_OP_10	t	approved	2026-04-28 10:31:58.491963+05:30	2026-05-05 15:19:36.603216+05:30	supervisor	2026-05-05 15:19:36.603216+05:30
18	114	FTP_00098345_OP_20	t	approved	2026-05-05 15:50:06.638149+05:30	2026-05-05 15:50:06.638149+05:30	supervisor	2026-05-05 15:50:06.638149+05:30
19	114	FTP_00089_OP_10	t	approved	2026-05-08 10:38:42.556454+05:30	2026-05-08 10:38:42.556454+05:30	supervisor	2026-05-08 10:38:42.556454+05:30
\.


--
-- Data for Name: inspection_plan_status; Type: TABLE DATA; Schema: quality; Owner: -
--

COPY quality.inspection_plan_status (id, part_number, sales_order_id, op_no, status, created_at, updated_at, confirmed_by_username) FROM stdin;
3	1111	48	10	draft	2026-04-09 12:37:43.991438+05:30	2026-04-09 12:37:43.991438+05:30	\N
4	2222	48	30	draft	2026-04-09 12:37:53.773726+05:30	2026-04-09 12:37:53.773726+05:30	\N
5	0001-3	100	10	draft	2026-04-09 12:50:14.627719+05:30	2026-04-09 12:50:14.627719+05:30	\N
6	0001-3	100	20	draft	2026-04-09 13:05:38.409947+05:30	2026-04-09 13:05:38.409947+05:30	\N
2	0001-2	100	10	confirmed	2026-04-09 11:47:12.430381+05:30	2026-04-09 14:19:32.713448+05:30	\N
8	001-23	100	20	draft	2026-04-09 14:35:47.861254+05:30	2026-04-09 14:35:47.861254+05:30	\N
7	001-23	100	10	confirmed	2026-04-09 14:33:20.343872+05:30	2026-04-09 14:36:30.502157+05:30	\N
1	0001-1	100	10	confirmed	2026-04-09 11:14:57.729012+05:30	2026-04-09 15:28:26.965191+05:30	\N
9	0001-1	100	20	draft	2026-04-09 15:49:28.721421+05:30	2026-04-09 15:49:28.721421+05:30	\N
10	0001-1	100	30	draft	2026-04-09 16:07:49.990374+05:30	2026-04-09 16:07:49.990374+05:30	\N
11	0001-1	100	40	draft	2026-04-09 16:08:00.993271+05:30	2026-04-09 16:08:00.993271+05:30	\N
13	0001-1	113	20	confirmed	2026-04-13 10:15:28.213848+05:30	2026-04-13 10:16:13.411317+05:30	\N
14	005	32	10	confirmed	2026-04-13 14:01:21.015077+05:30	2026-04-13 14:01:55.177908+05:30	admin
15	002	32	10	draft	2026-04-13 14:04:08.41893+05:30	2026-04-13 14:04:08.41893+05:30	\N
12	0001-1	113	10	confirmed	2026-04-13 10:13:37.865618+05:30	2026-04-13 14:54:19.714736+05:30	admin
17	00089	114	20	confirmed	2026-04-13 15:28:01.010963+05:30	2026-04-13 15:28:18.139408+05:30	supervisor
18	00089	114	30	confirmed	2026-04-13 16:44:01.022312+05:30	2026-04-13 16:46:36.412346+05:30	supervisor
19	00987	114	10	confirmed	2026-04-15 10:04:17.579189+05:30	2026-04-15 10:08:20.285178+05:30	supervisor
20	00987	114	20	confirmed	2026-04-16 12:07:14.572177+05:30	2026-04-16 12:07:14.572177+05:30	supervisor
21	0098712	114	20	confirmed	2026-04-22 10:55:27.84183+05:30	2026-04-22 10:55:27.84183+05:30	supervisor
23	00987	114	30	confirmed	2026-04-22 11:56:48.560008+05:30	2026-04-22 11:56:58.301937+05:30	supervisor
26	0078	114	10	confirmed	2026-04-27 15:04:54.918437+05:30	2026-04-28 10:15:24.824765+05:30	supervisor
27	00098345	114	20	draft	2026-04-28 10:22:31.395304+05:30	2026-04-28 11:59:16.022825+05:30	\N
28	00089	114	0	confirmed	2026-04-28 17:16:28.402208+05:30	2026-04-28 17:16:28.402208+05:30	supervisor
29	0098712	114	0	confirmed	2026-04-29 11:37:11.888665+05:30	2026-04-29 11:37:11.888665+05:30	supervisor
30	0078	114	0	confirmed	2026-04-29 12:11:25.936586+05:30	2026-04-29 12:11:25.936586+05:30	supervisor
31	00098345	114	0	confirmed	2026-04-29 12:12:11.332107+05:30	2026-04-29 12:12:11.332107+05:30	supervisor
32	00987	114	0	confirmed	2026-05-05 14:22:03.489113+05:30	2026-05-05 14:22:03.489113+05:30	supervisor
33	002	32	20	confirmed	2026-05-05 14:37:43.009608+05:30	2026-05-05 14:39:58.134226+05:30	supervisor
34	97986	114	10	confirmed	2026-05-05 14:46:46.18269+05:30	2026-05-05 15:50:23.983183+05:30	supervisor
36	part7	114	10	confirmed	2026-05-05 15:56:53.967269+05:30	2026-05-06 10:16:49.126308+05:30	supervisor
25	00098345	114	10	confirmed	2026-04-27 11:24:13.939194+05:30	2026-05-06 11:09:08.694155+05:30	supervisor
35	0078	114	20	confirmed	2026-05-05 15:02:55.686125+05:30	2026-05-06 14:31:05.10949+05:30	supervisor
24	0098712	114	30	confirmed	2026-04-24 10:47:12.504906+05:30	2026-05-07 11:48:51.860721+05:30	supervisor
22	0098712	114	10	confirmed	2026-04-22 11:21:40.828452+05:30	2026-05-07 14:15:08.095508+05:30	supervisor
16	00089	114	10	confirmed	2026-04-13 15:27:29.311277+05:30	2026-05-08 10:09:33.4089+05:30	supervisor
37	0023-3	95	10	draft	2026-05-13 11:20:53.874336+05:30	2026-05-13 11:20:53.874336+05:30	\N
38	part567	114	10	draft	2026-05-13 11:43:06.139182+05:30	2026-05-13 11:43:06.139182+05:30	\N
39	A-PRT-001	30	20	draft	2026-05-13 11:56:53.33888+05:30	2026-05-13 11:56:53.33888+05:30	\N
40	A-PRT-001	30	10	draft	2026-05-13 11:58:33.155453+05:30	2026-05-13 11:58:33.155453+05:30	\N
42	PRT-002	30	30	draft	2026-05-27 10:30:47.766764+05:30	2026-05-27 10:30:47.766764+05:30	\N
43	0003-3	30	20	draft	2026-05-27 10:31:03.142911+05:30	2026-05-27 10:31:03.142911+05:30	\N
\.


--
-- Data for Name: master_boc; Type: TABLE DATA; Schema: quality; Owner: -
--

COPY quality.master_boc (id, part_id, sales_order_id, nominal, uppertol, lowertol, zone, dimension_type, measured_instrument, op_no, bbox, ipid, user_id, created_at) FROM stdin;
494	001-23	100	5.25	0	0	C3	Length	default	10	{"bbox":[[285.38299560546875,318.71441650390625],[304.516357421875,318.71441650390625],[304.516357421875,335.430419921875],[285.38299560546875,335.430419921875]],"text":"5.25","page":1}	AUTO	\N	2026-04-09 14:33:24.778776+05:30
495	001-23	100	0.025	0	0	C2	GDT-Flatness	default	10	{"bbox":[[374.94205006308715,316.94580078125],[420.0565490722656,316.94580078125],[420.0565490722656,333.66180419921875],[374.94205006308715,333.66180419921875]],"text":"0.025","gdt_class":6,"page":1}	AUTO	\N	2026-04-09 14:33:28.413986+05:30
496	001-23	100	0.05	0	0	C2	Length	default	10	{"bbox":[[395.4444885253906,334.41839599609375],[414.5778503417969,334.41839599609375],[414.5778503417969,351.1343994140625],[395.4444885253906,351.1343994140625]],"text":"0.05","page":1}	AUTO	\N	2026-04-09 14:33:28.413986+05:30
379	0001-3	100	100	0.15	0.15	B2	Length	default	10	{"bbox":[[304.84369038884813,504.4346105919003],[365.9871239911959,504.4346105919003],[365.9871239911959,530.6617133956386],[304.84369038884813,530.6617133956386]],"text":"100","page":1}	AUTO	\N	2026-04-09 12:51:02.4363+05:30
497	001-23	100	5	0.1	-0.1	C2	Length	default	10	{"bbox":[[349.4924011230469,377.0083923339844],[366.2084045410156,377.0083923339844],[366.2084045410156,410.92510986328125],[349.4924011230469,410.92510986328125]],"text":"5 ±0.1","page":1}	AUTO	\N	2026-04-09 14:33:30.786712+05:30
498	001-23	100	10	0.1	-0.1	B3	Length	default	10	{"bbox":[[165.71240234375,406.0177307128906],[182.42840576171875,406.0177307128906],[182.42840576171875,445.401123046875],[165.71240234375,445.401123046875]],"text":"10 ±0.1","page":1}	AUTO	\N	2026-04-09 14:33:32.853679+05:30
507	0001-1	100	680	0	0	F5	Length	default	40	{"bbox":[[775.5203247070312,86.57684326171875],[798.8536376953125,86.57684326171875],[798.8536376953125,105.68684387207031],[775.5203247070312,105.68684387207031]],"text":"680","page":1}	AUTO	\N	2026-04-09 16:08:13.565468+05:30
508	0001-1	100	±0.10	0.1	-0.1	F5	Length	default	40	{"bbox":[[802.6959228515625,89.85186767578125],[830.1194458007812,89.85186767578125],[830.1194458007812,104.86686706542969],[802.6959228515625,104.86686706542969]],"text":"±0.10","page":1}	AUTO	\N	2026-04-09 16:08:13.565468+05:30
478	0001-1	100	63	0.15	-0.15	D6	Length	default	10	{"bbox":[[384.8876953125,360.75469970703125],[429.7377014160156,360.75469970703125],[429.7377014160156,377.470703125],[384.8876953125,377.470703125]],"text":"63 ±0.15","page":1}	AUTO	\N	2026-04-09 14:18:39.791412+05:30
479	0001-1	100	93.2	0.15	-0.15	D6	Length	default	10	{"bbox":[[380.78369140625,340.8106994628906],[433.8337707519531,340.8106994628906],[433.8337707519531,357.5267028808594],[380.78369140625,357.5267028808594]],"text":"93.2 ±0.15","page":1}	AUTO	\N	2026-04-09 14:18:39.791412+05:30
480	0001-1	100	113.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,320.9386901855469],[386.9377746582031,320.9386901855469],[386.9377746582031,337.6546936035156],[333.8876953125,337.6546936035156]],"text":"113.2 ±0.2","page":1}	AUTO	\N	2026-04-09 14:18:39.791412+05:30
481	0001-1	100	118.2	0.05	-0.05	D6	Length	default	10	{"bbox":[[331.1517028808594,298.6186828613281],[389.6684265136719,298.6186828613281],[389.6684265136719,315.3346862792969],[331.1517028808594,315.3346862792969]],"text":"118.2 ±0.05","page":1}	AUTO	\N	2026-04-09 14:18:39.791412+05:30
482	0001-1	100	123.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,276.7066955566406],[386.9377746582031,276.7066955566406],[386.9377746582031,293.4226989746094],[333.8876953125,293.4226989746094]],"text":"123.2 ±0.2","page":1}	AUTO	\N	2026-04-09 14:18:39.791412+05:30
483	0001-1	100	0.003	0	0	D7	GDT-Flatness	default	10	{"bbox":[[129.6582886858684,338.9775085449219],[175.11643981933594,338.9775085449219],[175.11643981933594,355.6935119628906],[129.6582886858684,355.6935119628906]],"text":"0.003","gdt_class":6,"page":1}	AUTO	\N	2026-04-09 14:18:44.489479+05:30
484	0001-1	100	0.005	0	0	D7	GDT-Parallelism	default	10	{"bbox":[[129.6630952044231,356.4501953125],[175.11643981933594,356.4501953125],[175.11643981933594,373.16619873046875],[129.6630952044231,373.16619873046875]],"text":"0.005","gdt_class":8,"page":1}	AUTO	\N	2026-04-09 14:18:44.489479+05:30
485	0001-1	100	0.8	0	0	D8	Length	default	10	{"bbox":[[105.89830017089844,390.037841796875],[115.0094223022461,390.037841796875],[115.0094223022461,401.18182373046875],[105.89830017089844,401.18182373046875]],"text":"0.8","page":1}	AUTO	\N	2026-04-09 14:18:44.489479+05:30
635	00987	114	0.02	0	0	D3	GDT-Parallelism	default	0	{"bbox":[[1482.6552860911556,780.2544555664062],[1524.2149658203125,780.2544555664062],[1524.2149658203125,797.5700813506786],[1482.6552860911556,797.5700813506786]],"text":"0.02","gdt_class":8,"page":1}	FTP_00987_OP_0	\N	2026-04-29 11:45:08.204955+05:30
486	0001-1	100	0.003	0	0	D5	GDT-Flatness	default	10	{"bbox":[[517.3472534342509,344.25921630859375],[562.00146484375,344.25921630859375],[562.00146484375,360.9752197265625],[517.3472534342509,360.9752197265625]],"text":"0.003","gdt_class":6,"page":1}	AUTO	\N	2026-04-09 14:18:47.11965+05:30
487	0001-1	100	0.8	0	0	D5	Length	default	10	{"bbox":[[587.1622924804688,390.9818420410156],[596.2734375,390.9818420410156],[596.2734375,402.1258239746094],[587.1622924804688,402.1258239746094]],"text":"0.8","page":1}	AUTO	\N	2026-04-09 14:18:47.11965+05:30
488	0001-1	100	0.005	0	0	D5	Length	default	10	{"bbox":[[537.4014282226562,361.7319030761719],[562.00146484375,361.7319030761719],[562.00146484375,378.4479064941406],[537.4014282226562,378.4479064941406]],"text":"0.005","page":1}	AUTO	\N	2026-04-09 14:18:47.11965+05:30
489	0001-1	100	0.025	0	0	C4	GDT-Total Runout	default	10	{"bbox":[[667.6588134765625,498.4970703125],[684.3748168945312,498.4970703125],[684.3748168945312,543.5759316159345],[667.6588134765625,543.5759316159345]],"text":"0.025","gdt_class":14,"page":1}	AUTO	\N	2026-04-09 14:18:49.908233+05:30
490	0001-1	100	120	0.2	-0.2	C4	Length	default	10	{"bbox":[[652.1224975585938,473.17584228515625],[668.8385009765625,473.17584228515625],[668.8385009765625,515.29248046875],[652.1224975585938,515.29248046875]],"text":"120 ±0.2","page":1}	AUTO	\N	2026-04-09 14:18:49.908233+05:30
499	001-23	100	0.5x45	0	0	D1	Length	default	20	{"bbox":[[445.95440673828125,189.84625244140625],[491.8432922363281,189.84625244140625],[491.8432922363281,208.9562530517578],[445.95440673828125,208.9562530517578]],"text":"0.5x45","page":1}	AUTO	\N	2026-04-09 14:35:53.667488+05:30
500	001-23	100	14	0	0	C3	Length	default	20	{"bbox":[[141.2021026611328,282.0472106933594],[160.31210327148438,282.0472106933594],[160.31210327148438,301.49163818359375],[141.2021026611328,301.49163818359375]],"text":"14","page":1}	AUTO	\N	2026-04-09 14:35:59.395474+05:30
501	001-23	100	36	0	0	C2	Length	default	20	{"bbox":[[303.1404113769531,361.4022216796875],[326.4737243652344,361.4022216796875],[326.4737243652344,380.51220703125],[303.1404113769531,380.51220703125]],"text":"36","page":1}	AUTO	\N	2026-04-09 14:36:01.406725+05:30
491	0001-2	100	6	0.1	-0.1	C4	Length	default	10	{"bbox":[[83.0604019165039,401.0690002441406],[99.77639770507812,401.0690002441406],[99.77639770507812,434.9857177734375],[83.0604019165039,434.9857177734375]],"text":"6 ±0.1","page":1}	AUTO	\N	2026-04-09 14:19:03.900406+05:30
492	0001-2	100	3.5	0.1	-0.1	C4	Length	default	10	{"bbox":[[134.0843963623047,377.7610168457031],[150.80039978027344,377.7610168457031],[150.80039978027344,419.8777160644531],[134.0843963623047,419.8777160644531]],"text":"3.5 ±0.1","page":1}	AUTO	\N	2026-04-09 14:19:06.430531+05:30
493	0001-2	100	0.025	0	0	B4	GDT-Flatness	default	10	{"bbox":[[96.23966673831282,518.3458251953125],[141.7177276611328,518.3458251953125],[141.7177276611328,535.0618286132812],[96.23966673831282,535.0618286132812]],"text":"0.025","gdt_class":6,"page":1}	AUTO	\N	2026-04-09 14:19:09.815061+05:30
502	0001-1	100	10.5	0.1	-0.1	B3	Length	default	20	{"bbox":[[247.58299255371094,513.5104370117188],[295.166259765625,513.5104370117188],[295.166259765625,530.2264404296875],[247.58299255371094,530.2264404296875]],"text":"10.5 ±0.1","page":1}	AUTO	\N	2026-04-09 15:49:35.321884+05:30
503	0001-1	100	5.25	0	0	C3	Length	default	20	{"bbox":[[285.38299560546875,318.71441650390625],[304.516357421875,318.71441650390625],[304.516357421875,335.430419921875],[285.38299560546875,335.430419921875]],"text":"5.25","page":1}	AUTO	\N	2026-04-09 15:49:37.868831+05:30
504	0001-1	100	5	0.1	-0.1	C2	Length	default	20	{"bbox":[[349.4924011230469,377.0083923339844],[366.2084045410156,377.0083923339844],[366.2084045410156,410.92510986328125],[349.4924011230469,410.92510986328125]],"text":"5 ±0.1","page":1}	AUTO	\N	2026-04-09 15:49:39.587306+05:30
505	0001-1	100	10	0.1	-0.1	B3	Length	default	20	{"bbox":[[165.71240234375,406.0177307128906],[182.42840576171875,406.0177307128906],[182.42840576171875,445.401123046875],[165.71240234375,445.401123046875]],"text":"10 ±0.1","page":1}	AUTO	\N	2026-04-09 15:49:42.571982+05:30
506	0001-1	100	2.5	0.05	-0.05	D3	Length	default	20	{"bbox":[[246.6259002685547,60.64939880371094],[294.20916748046875,60.64939880371094],[294.20916748046875,77.36539459228516],[246.6259002685547,77.36539459228516]],"text":"2.5 ±0.05","page":1}	AUTO	\N	2026-04-09 15:49:45.193297+05:30
509	0001-1	113	63	0.15	-0.15	D6	Length	default	10	{"bbox":[[384.8876953125,360.75469970703125],[429.7377014160156,360.75469970703125],[429.7377014160156,377.470703125],[384.8876953125,377.470703125]],"text":"63 ±0.15","page":1}	AUTO	\N	2026-04-13 10:13:46.642326+05:30
510	0001-1	113	93.2	0.15	-0.15	D6	Length	default	10	{"bbox":[[380.78369140625,340.8106994628906],[433.8337707519531,340.8106994628906],[433.8337707519531,357.5267028808594],[380.78369140625,357.5267028808594]],"text":"93.2 ±0.15","page":1}	AUTO	\N	2026-04-13 10:13:46.642326+05:30
636	00987	114	0.01	0	0	D3	GDT-Total Runout	default	0	{"bbox":[[1482.9545815165707,762.7818603515625],[1529.555419921875,762.7818603515625],[1529.555419921875,779.4978637695312],[1482.9545815165707,779.4978637695312]],"text":"0.01","gdt_class":14,"page":1}	FTP_00987_OP_0	\N	2026-04-29 11:45:08.204955+05:30
637	00987	114	0.4	0	0	D4	Length	default	0	{"bbox":[[1460.4307861328125,815.9072875976562],[1477.146728515625,815.9072875976562],[1477.146728515625,829.573974609375],[1460.4307861328125,829.573974609375]],"text":"0.4","page":1}	FTP_00987_OP_0	\N	2026-04-29 11:45:08.204955+05:30
643	002	32	6	0.1	-0.1	C4	Length	default	20	{"bbox":[[83.0604019165039,401.0690002441406],[99.77639770507812,401.0690002441406],[99.77639770507812,434.9857177734375],[83.0604019165039,434.9857177734375]],"text":"6 ±0.1","page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:06.157748+05:30
644	002	32	3.5	0.1	-0.1	C4	Length	default	20	{"bbox":[[134.0843963623047,377.7610168457031],[150.80039978027344,377.7610168457031],[150.80039978027344,419.8777160644531],[134.0843963623047,419.8777160644531]],"text":"3.5 ±0.1","page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:07.745857+05:30
645	002	32	0.025	0	0	B4	GDT-Flatness	default	20	{"bbox":[[96.06834028047182,518.3458251953125],[141.7177276611328,518.3458251953125],[141.7177276611328,535.0618286132812],[96.06834028047182,535.0618286132812]],"text":"0.025","gdt_class":6,"page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:09.666924+05:30
646	002	32	12	0.1	-0.1	B3	Length	default	20	{"bbox":[[259.26129150390625,486.6058349609375],[298.6446838378906,486.6058349609375],[298.6446838378906,503.32183837890625],[259.26129150390625,503.32183837890625]],"text":"12 ±0.1","page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:11.142194+05:30
647	002	32	0.5 X 45° TYP.	0	0	C1	Chamfer	default	20	{"bbox":[[420.6972961425781,375.56982421875],[486.747314453125,375.56982421875],[486.747314453125,392.28582763671875],[420.6972961425781,392.28582763671875]],"text":"0.5 X 45° TYP.","page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:15.38129+05:30
743	part7	114	0.003	0	0	C3	GDT-Total Runout	default	10	{"bbox":[[237.18104145101086,328.9566955566406],[282.34454345703125,328.9566955566406],[282.34454345703125,345.8774941876857],[237.18104145101086,345.8774941876857]],"text":"0.003","gdt_class":14,"page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
744	part7	114	60	0	0	C3	Length	default	10	{"bbox":[[242.47479248046875,360.5036926269531],[258.8747863769531,360.5036926269531],[258.8747863769531,377.2196960449219],[242.47479248046875,377.2196960449219]],"text":"60","page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
745	part7	114	0.021	0	0	C3	Length	default	10	{"bbox":[[267.4587707519531,348.5036926269531],[292.0588073730469,348.5036926269531],[292.0588073730469,365.2196960449219],[267.4587707519531,365.2196960449219]],"text":"0.021","page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
746	part7	114	0.015	0	0	C3	Length	default	10	{"bbox":[[267.4587707519531,360.5036926269531],[292.0588073730469,360.5036926269531],[292.0588073730469,377.2196960449219],[267.4587707519531,377.2196960449219]],"text":"0.015","page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
638	0078	114	0.002	0	0	C2	GDT-Flatness	default	0	{"bbox":[[363.35223013149164,291.9789733886719],[408.6566467285156,291.9789733886719],[408.6566467285156,308.6949768066406],[363.35223013149164,308.6949768066406]],"text":"0.002","gdt_class":6,"page":1}	FTP_0078_OP_0	\N	2026-04-29 12:11:01.810866+05:30
639	0078	114	0.005	0	0	C2	Length	default	0	{"bbox":[[384.0566101074219,309.4516906738281],[408.6566467285156,309.4516906738281],[408.6566467285156,326.1676940917969],[384.0566101074219,326.1676940917969]],"text":"0.005","page":1}	FTP_0078_OP_0	\N	2026-04-29 12:11:01.810866+05:30
640	0078	114	45	0.15	-0.15	C2	Length	default	0	{"bbox":[[379.4859924316406,396.2870178222656],[396.2019958496094,396.2870178222656],[396.2019958496094,441.13702392578125],[379.4859924316406,441.13702392578125]],"text":"45 ±0.15","page":1}	FTP_0078_OP_0	\N	2026-04-29 12:11:03.891693+05:30
532	0001-1	113	100	0.15	-0.15	C6	Diameter	default	20	{"bbox":[[306.3931733415724,513.5695190429688],[367.33575439453125,513.5695190429688],[367.33575439453125,530.2855224609375],[306.3931733415724,530.2855224609375]],"text":"100 ±0.15","gdt_class":5,"page":1}	AUTO	\N	2026-04-13 10:15:34.46069+05:30
533	0001-1	113	0.003	0	0	C6	GDT-Total Runout	default	20	{"bbox":[[302.98361981374035,529.1058349609375],[348.0174255371094,529.1058349609375],[348.0174255371094,545.9804174411636],[302.98361981374035,545.9804174411636]],"text":"0.003","gdt_class":14,"page":1}	AUTO	\N	2026-04-13 10:15:34.46069+05:30
537	0001-1	113	15	0.1	-0.1	B7	Length	default	20	{"bbox":[[149.91580200195312,644.2327270507812],[166.63180541992188,644.2327270507812],[166.63180541992188,683.6160888671875],[149.91580200195312,683.6160888671875]],"text":"15 ±0.1","page":1}	AUTO	\N	2026-04-13 10:15:53.693209+05:30
550	005	32	113.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,320.9386901855469],[386.9377746582031,320.9386901855469],[386.9377746582031,337.6546936035156],[333.8876953125,337.6546936035156]],"text":"113.2 ±0.2","page":1}	AUTO	\N	2026-04-13 14:01:46.023992+05:30
551	005	32	118.2	0.05	-0.05	D6	Length	default	10	{"bbox":[[331.1517028808594,298.6186828613281],[389.6684265136719,298.6186828613281],[389.6684265136719,315.3346862792969],[331.1517028808594,315.3346862792969]],"text":"118.2 ±0.05","page":1}	AUTO	\N	2026-04-13 14:01:46.023992+05:30
552	005	32	123.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,276.7066955566406],[386.9377746582031,276.7066955566406],[386.9377746582031,293.4226989746094],[333.8876953125,293.4226989746094]],"text":"123.2 ±0.2","page":1}	AUTO	\N	2026-04-13 14:01:46.023992+05:30
558	00089	114	15	0.1	-0.1	B7	Length	default	20	{"bbox":[[149.91580200195312,644.2327270507812],[166.63180541992188,644.2327270507812],[166.63180541992188,683.6160888671875],[149.91580200195312,683.6160888671875]],"text":"15 ±0.1","page":1}	FTP_00089_OP_20	\N	2026-04-13 15:28:07.243137+05:30
559	00089	114	100	0.15	-0.15	C6	Length	default	20	{"bbox":[[319.75250244140625,513.5695190429688],[367.33575439453125,513.5695190429688],[367.33575439453125,530.2855224609375],[319.75250244140625,530.2855224609375]],"text":"100 ±0.15","page":1}	FTP_00089_OP_20	\N	2026-04-13 15:28:12.161457+05:30
553	00089	114	63	0.15	-0.15	D6	Length	default	10	{"bbox":[[384.8876953125,360.75469970703125],[429.7377014160156,360.75469970703125],[429.7377014160156,377.470703125],[384.8876953125,377.470703125]],"text":"63 ±0.15","page":1}	FTP_00089_OP_10	\N	2026-04-13 15:27:35.647508+05:30
554	00089	114	93.2	0.15	-0.15	D6	Length	default	10	{"bbox":[[380.78369140625,340.8106994628906],[433.8337707519531,340.8106994628906],[433.8337707519531,357.5267028808594],[380.78369140625,357.5267028808594]],"text":"93.2 ±0.15","page":1}	FTP_00089_OP_10	\N	2026-04-13 15:27:35.647508+05:30
555	00089	114	113.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,320.9386901855469],[386.9377746582031,320.9386901855469],[386.9377746582031,337.6546936035156],[333.8876953125,337.6546936035156]],"text":"113.2 ±0.2","page":1}	FTP_00089_OP_10	\N	2026-04-13 15:27:35.647508+05:30
556	00089	114	118.2	0.05	-0.05	D6	Length	default	10	{"bbox":[[331.1517028808594,298.6186828613281],[389.6684265136719,298.6186828613281],[389.6684265136719,315.3346862792969],[331.1517028808594,315.3346862792969]],"text":"118.2 ±0.05","page":1}	FTP_00089_OP_10	\N	2026-04-13 15:27:35.647508+05:30
557	00089	114	123.2	0.2	-0.2	D6	Length	default	10	{"bbox":[[333.8876953125,276.7066955566406],[386.9377746582031,276.7066955566406],[386.9377746582031,293.4226989746094],[333.8876953125,293.4226989746094]],"text":"123.2 ±0.2","page":1}	FTP_00089_OP_10	\N	2026-04-13 15:27:35.647508+05:30
565	00089	114	45	0.15	-0.15	C2	Length	default	30	{"bbox":[[379.4859924316406,396.2870178222656],[396.2019958496094,396.2870178222656],[396.2019958496094,441.13702392578125],[379.4859924316406,441.13702392578125]],"text":"45 ±0.15","page":1}	FTP_00089_OP_30	\N	2026-04-13 16:44:24.791881+05:30
566	00987	114	17	0.1	-0.1	C4	Length	default	10	{"bbox":[[86.1427001953125,377.1712341308594],[102.85869598388672,377.1712341308594],[102.85869598388672,416.55462646484375],[86.1427001953125,416.55462646484375]],"text":"17 ±0.1","page":1}	FTP_00987_OP_10	\N	2026-04-15 10:04:25.167814+05:30
567	00987	114	78	0.15	-0.15	C2	Length	default	10	{"bbox":[[277.6581115722656,234.99974060058594],[319.7747802734375,234.99974060058594],[319.7747802734375,251.7157440185547],[277.6581115722656,251.7157440185547]],"text":"78 ±0.15","page":1}	FTP_00987_OP_10	\N	2026-04-15 10:04:35.056189+05:30
570	00987	114	30	0.15	-0.15	C3	Length	default	20	{"bbox":[[146.91390991210938,261.6377868652344],[191.76388549804688,261.6377868652344],[191.76388549804688,278.3537902832031],[146.91390991210938,278.3537902832031]],"text":"30 ±0.15","page":1}	FTP_00987_OP_20	\N	2026-04-16 12:06:58.505036+05:30
571	00987	114	4	0.05	-0.05	C3	Length	default	20	{"bbox":[[145.62989807128906,295.5018005371094],[185.01327514648438,295.5018005371094],[185.01327514648438,312.2178039550781],[145.62989807128906,312.2178039550781]],"text":"4 ±0.05","page":1}	FTP_00987_OP_20	\N	2026-04-16 12:07:03.831676+05:30
572	00987	114	9	0.1	-0.1	C3	Length	default	20	{"bbox":[[150.201904296875,278.6418151855469],[184.1185760498047,278.6418151855469],[184.1185760498047,295.3578186035156],[150.201904296875,295.3578186035156]],"text":"9 ±0.1","page":1}	FTP_00987_OP_20	\N	2026-04-16 12:07:03.831676+05:30
573	0098712	114	0.003	0	0	C6	GDT-Total Runout	default	20	{"bbox":[[302.62241179567644,529.1058349609375],[348.0174255371094,529.1058349609375],[348.0174255371094,546.0050537768554],[302.62241179567644,546.0050537768554]],"text":"0.003","gdt_class":14,"page":1}	FTP_0098712_OP_20	\N	2026-04-22 10:52:15.187078+05:30
574	0098712	114	100	0.15	-0.15	C6	Diameter	default	20	{"bbox":[[306.1339951239235,513.5695190429688],[367.33575439453125,513.5695190429688],[367.33575439453125,530.2855224609375],[306.1339951239235,530.2855224609375]],"text":"100 ±0.15","gdt_class":5,"page":1}	FTP_0098712_OP_20	\N	2026-04-22 10:52:15.187078+05:30
578	0098712	114	15	0.1	-0.1	B7	Length	default	20	{"bbox":[[149.91580200195312,644.2327270507812],[166.63180541992188,644.2327270507812],[166.63180541992188,683.6160888671875],[149.91580200195312,683.6160888671875]],"text":"15 ±0.1","page":1}	FTP_0098712_OP_20	\N	2026-04-22 10:52:31.165139+05:30
579	0098712	114	0.002	0	0	A5	GDT-Flatness	default	20	{"bbox":[[452.4206100340647,722.2521362304688],[497.8686218261719,722.2521362304688],[497.8686218261719,738.9681396484375],[452.4206100340647,738.9681396484375]],"text":"0.002","gdt_class":6,"page":1}	FTP_0098712_OP_20	\N	2026-04-22 10:52:35.142005+05:30
778	A-PRT-001	30	1750	0	0	D5	Length	default	10	{"bbox":[[464.7886047363281,291.23583984375],[503.6774597167969,291.23583984375],[503.6774597167969,310.3458251953125],[464.7886047363281,310.3458251953125]],"text":"1750","page":1}	FTP_A-PRT-001_OP_10	\N	2026-05-13 11:58:49.172571+05:30
747	part7	114	95 g6 0.034	0	0	C3	Length	default	10	{"bbox":[[246.0634002685547,313.4203796386719],[304.1194152832031,313.4203796386719],[304.1194152832031,330.1363830566406],[246.0634002685547,330.1363830566406]],"text":"95 g6 0.034","page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
748	part7	114	0.4	0	0	C3	Length	default	10	{"bbox":[[220.15859985351562,407.8987121582031],[231.30259704589844,407.8987121582031],[231.30259704589844,417.00982666015625],[220.15859985351562,417.00982666015625]],"text":"0.4","page":1}	FTP_part7_OP_10	\N	2026-05-06 10:10:18.662853+05:30
761	0098712	114	78	0.15	-0.15	C3	Diameter	default	10	{"bbox":[[264.2858251251365,234.99974060058594],[319.7747802734375,234.99974060058594],[319.7747802734375,251.7157440185547],[264.2858251251365,251.7157440185547]],"text":"78 ±0.15","gdt_class":5,"page":1}	FTP_0098712_OP_10	\N	2026-05-07 09:43:30.919121+05:30
762	0098712	114	0.003	0	0	C3	GDT-Total Runout	default	10	{"bbox":[[258.1638063110496,250.53599548339844],[303.1898498535156,250.53599548339844],[303.1898498535156,267.5063497860939],[258.1638063110496,267.5063497860939]],"text":"0.003","gdt_class":14,"page":1}	FTP_0098712_OP_10	\N	2026-05-07 09:43:30.919121+05:30
763	0098712	114	70	0	0	C3	Length	default	10	{"bbox":[[269.430908203125,297.3406066894531],[280.3642578125,297.3406066894531],[280.3642578125,314.0566101074219],[269.430908203125,314.0566101074219]],"text":"70","page":1}	FTP_0098712_OP_10	\N	2026-05-07 09:43:30.919121+05:30
764	0098712	114	0.017	0	0	C2	Length	default	10	{"bbox":[[288.8468933105469,285.3406066894531],[313.4469299316406,285.3406066894531],[313.4469299316406,302.0566101074219],[288.8468933105469,302.0566101074219]],"text":"0.017","page":1}	FTP_0098712_OP_10	\N	2026-05-07 09:43:30.919121+05:30
588	00987	114	0.5 X 45° TYP.	0	0	C4	Chamfer	default	30	{"bbox":[[92.74699401855469,379.3815002441406],[158.7969970703125,379.3815002441406],[158.7969970703125,396.0975036621094],[92.74699401855469,396.0975036621094]],"text":"0.5 X 45° TYP.","page":1}	FTP_00987_OP_30	\N	2026-04-22 11:56:54.343421+05:30
589	00987	114	0.4	0	0	C3	Length	default	30	{"bbox":[[187.0865936279297,368.63470458984375],[198.2305908203125,368.63470458984375],[198.2305908203125,377.7458190917969],[187.0865936279297,377.7458190917969]],"text":"0.4","page":1}	FTP_00987_OP_30	\N	2026-04-22 11:56:54.343421+05:30
590	0098712	114	0.8	0	0	B3	Diameter	default	30	{"bbox":[[149.4438018798828,412.93368487593216],[174.06283571119397,412.93368487593216],[174.06283571119397,437.8497009277344],[149.4438018798828,437.8497009277344]],"text":"0.8","gdt_class":5,"page":1}	FTP_0098712_OP_30	\N	2026-04-24 16:40:49.626234+05:30
591	0098712	114	136	0.15	-0.15	C3	Diameter	default	30	{"bbox":[[155.18298150892346,384.4285888671875],[216.21644592285156,384.4285888671875],[216.21644592285156,401.14459228515625],[155.18298150892346,401.14459228515625]],"text":"136 ±0.15","gdt_class":5,"page":1}	FTP_0098712_OP_30	\N	2026-04-24 16:40:49.626234+05:30
765	0098712	114	0 011	0	0	C2	Length	default	10	{"bbox":[[288.8468933105469,297.3406066894531],[313.4469299316406,297.3406066894531],[313.4469299316406,314.0566101074219],[288.8468933105469,314.0566101074219]],"text":"0 011","page":1}	FTP_0098712_OP_10	\N	2026-05-07 09:43:30.919121+05:30
593	0098712	114	0.005	0	0	B4	GDT-Flatness	default	30	{"bbox":[[75.98435455309003,540.0091552734375],[121.36773681640625,540.0091552734375],[121.36773681640625,556.7251586914062],[75.98435455309003,556.7251586914062]],"text":"0.005","gdt_class":6,"page":1}	FTP_0098712_OP_30	\N	2026-04-24 16:41:04.360688+05:30
594	0098712	114	20	0.1	-0.1	B3	Length	default	30	{"bbox":[[173.84739685058594,489.5937194824219],[190.5634002685547,489.5937194824219],[190.5634002685547,528.9771118164062],[173.84739685058594,528.9771118164062]],"text":"20 ±0.1","page":1}	FTP_0098712_OP_30	\N	2026-04-24 16:41:10.547857+05:30
595	00089	114	0.1	0	0	D5	GDT-Perpendicularity	default	0	{"bbox":[[451.41088696672506,372.2174987792969],[500.5723876953125,372.2174987792969],[500.5723876953125,389.04925805306084],[451.41088696672506,389.04925805306084]],"text":"0.1","gdt_class":9,"page":1}	FTP_00089_OP_0	\N	2026-04-27 11:58:13.874281+05:30
596	00089	114	18	0	0	D5	Diameter	default	0	{"bbox":[[470.0968906517226,325.6084899902344],[511.2079162597656,325.6084899902344],[511.2079162597656,387.27350121712334],[470.0968906517226,387.27350121712334]],"text":"18","gdt_class":5,"page":1}	FTP_00089_OP_0	\N	2026-04-27 11:58:13.874281+05:30
597	00089	114	9	0	0	D5	GDT-Perpendicularity	default	0	{"bbox":[[457.01239129259176,312.0085144042969],[488.72296142578125,312.0085144042969],[488.72296142578125,339.8028782007659],[457.01239129259176,339.8028782007659]],"text":"9","gdt_class":9,"page":1}	FTP_00089_OP_0	\N	2026-04-27 11:58:13.874281+05:30
641	00098345	114	5	0.1	-0.1	D6	Length	default	0	{"bbox":[[349.4924011230469,377.0083923339844],[366.2084045410156,377.0083923339844],[366.2084045410156,410.92510986328125],[349.4924011230469,410.92510986328125]],"text":"5 ±0.1","page":1}	FTP_00098345_OP_0	\N	2026-04-29 12:12:08.128075+05:30
774	part567	114	15	0.1	-0.1	B7	Length	default	10	{"bbox":[[149.91580200195312,644.2327270507812],[166.63180541992188,644.2327270507812],[166.63180541992188,683.6160888671875],[149.91580200195312,683.6160888671875]],"text":"15 ±0.1","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:43.570721+05:30
598	00089	114	8 x CBORE HOLES	0	0	D5	Length	default	0	{"bbox":[[455.850830078125,298.4009704589844],[542.767578125,298.4009704589844],[542.767578125,315.1169738769531],[455.850830078125,315.1169738769531]],"text":"8 x CBORE HOLES","page":1}	FTP_00089_OP_0	\N	2026-04-27 11:58:13.874281+05:30
599	00089	114	9.3	0	0	D5	Length	default	0	{"bbox":[[523.4478759765625,325.6084899902344],[539.847900390625,325.6084899902344],[539.847900390625,342.3244934082031],[523.4478759765625,342.3244934082031]],"text":"9.3","page":1}	FTP_00089_OP_0	\N	2026-04-27 11:58:13.874281+05:30
600	00089	114	0.1	0	0	C8	GDT-Perpendicularity	default	0	{"bbox":[[30.830765915905253,520.3656005859375],[80.11758422851562,520.3656005859375],[80.11758422851562,537.504857063808],[30.830765915905253,537.504857063808]],"text":"0.1","gdt_class":9,"page":1}	FTP_00089_OP_0	\N	2026-04-27 11:59:39.061754+05:30
601	00089	114	10 x  TAPPED HOLES	0	0	C8	Length	default	0	{"bbox":[[29.38319969177246,460.1566162109375],[128.89990234375,460.1566162109375],[128.89990234375,476.87261962890625],[29.38319969177246,476.87261962890625]],"text":"10 x  TAPPED HOLES","page":1}	FTP_00089_OP_0	\N	2026-04-27 11:59:39.061754+05:30
602	00089	114	30°	0.3	-0.3	F4	Angular	default	0	{"bbox":[[659.473388671875,96.20584106445312],[710.6256103515625,96.20584106445312],[710.6256103515625,121.23212432861328],[659.473388671875,121.23212432861328]],"text":"30° ±0.3°","page":1}	FTP_00089_OP_0	\N	2026-04-27 12:00:02.528326+05:30
603	00089	114	R92	0.2	-0.2	E3	Radius	default	0	{"bbox":[[782.2435302734375,174.98399353027344],[829.0321044921875,174.98399353027344],[829.0321044921875,204.63302612304688],[782.2435302734375,204.63302612304688]],"text":"R92 ±0.2","page":1}	FTP_00089_OP_0	\N	2026-04-27 13:32:16.034221+05:30
604	00089	114	17	0	0	E3	Length	default	0	{"bbox":[[835.3836059570312,167.6863250732422],[851.0269165039062,167.6863250732422],[851.0269165039062,186.99575805664062],[835.3836059570312,186.99575805664062]],"text":"17","page":1}	FTP_00089_OP_0	\N	2026-04-27 13:32:16.034221+05:30
605	00089	114	2	0	0	E3	Length	default	0	{"bbox":[[860.4241333007812,210.3142852783203],[877.14013671875,210.3142852783203],[877.14013671875,218.5146484375],[860.4241333007812,218.5146484375]],"text":"2","page":1}	FTP_00089_OP_0	\N	2026-04-27 13:32:16.034221+05:30
749	00098345	114	0.1	0	0	D5	GDT-Perpendicularity	default	10	{"bbox":[[450.9032172138227,372.2174987792969],[500.5723876953125,372.2174987792969],[500.5723876953125,388.9335021972656],[450.9032172138227,388.9335021972656]],"text":"0.1","gdt_class":9,"page":1}	FTP_00098345_OP_10	\N	2026-05-06 10:31:57.146144+05:30
750	00098345	114	18	0	0	D5	Diameter	default	10	{"bbox":[[469.6683720523847,325.6084899902344],[511.2079162597656,325.6084899902344],[511.2079162597656,369.44734101959335],[469.6683720523847,369.44734101959335]],"text":"18","gdt_class":5,"page":1}	FTP_00098345_OP_10	\N	2026-05-06 10:31:57.146144+05:30
751	00098345	114	9.3	0	0	D5	Length	default	10	{"bbox":[[523.4478759765625,325.6084899902344],[539.847900390625,325.6084899902344],[539.847900390625,342.3244934082031],[523.4478759765625,342.3244934082031]],"text":"9.3","page":1}	FTP_00098345_OP_10	\N	2026-05-06 10:31:57.146144+05:30
642	002	32	4	0.05	-0.05	D3	Length	default	20	{"bbox":[[254.40660095214844,59.32463073730469],[293.78997802734375,59.32463073730469],[293.78997802734375,76.0406265258789],[254.40660095214844,76.0406265258789]],"text":"4 ±0.05","page":1}	FTP_002_OP_20	\N	2026-05-05 14:37:00.287812+05:30
610	0078	114	100	0.15	-0.15	C6	Length	default	10	{"bbox":[[305.8546142578125,529.4732666015625],[353.4378662109375,529.4732666015625],[353.4378662109375,546.1892700195312],[305.8546142578125,546.1892700195312]],"text":"100 ±0.15","page":1}	FTP_0078_OP_10	\N	2026-04-28 10:15:10.594166+05:30
611	0078	114	0 003	0	0	C6	Length	default	10	{"bbox":[[309.51959228515625,545.009521484375],[334.11962890625,545.009521484375],[334.11962890625,561.7255249023438],[309.51959228515625,561.7255249023438]],"text":"0 003","page":1}	FTP_0078_OP_10	\N	2026-04-28 10:15:10.594166+05:30
766	part567	114	100	0.15	-0.15	C6	Length	default	10	{"bbox":[[319.75250244140625,513.5695190429688],[367.33575439453125,513.5695190429688],[367.33575439453125,530.2855224609375],[319.75250244140625,530.2855224609375]],"text":"100 ±0.15","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:33.807021+05:30
767	part567	114	60	0	0	B6	Length	default	10	{"bbox":[[312.3961486816406,573.3294677734375],[323.3294982910156,573.3294677734375],[323.3294982910156,590.0454711914062],[312.3961486816406,590.0454711914062]],"text":"60","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:33.807021+05:30
615	0098712	114	78	0.15	-0.15	C3	Diameter	default	0	{"bbox":[[264.27675767494867,234.99974060058594],[319.7747802734375,234.99974060058594],[319.7747802734375,251.7157440185547],[264.27675767494867,251.7157440185547]],"text":"78 ±0.15","gdt_class":5,"page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:03.218665+05:30
616	0098712	114	0.003	0	0	C3	Length	default	0	{"bbox":[[278.5898132324219,250.53599548339844],[303.1898498535156,250.53599548339844],[303.1898498535156,267.2519836425781],[278.5898132324219,267.2519836425781]],"text":"0.003","page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:03.218665+05:30
617	0098712	114	70	0	0	C3	Length	default	0	{"bbox":[[269.430908203125,297.3406066894531],[280.3642578125,297.3406066894531],[280.3642578125,314.0566101074219],[269.430908203125,314.0566101074219]],"text":"70","page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:03.218665+05:30
618	0098712	114	0.017	0	0	C2	Length	default	0	{"bbox":[[288.8468933105469,285.3406066894531],[313.4469299316406,285.3406066894531],[313.4469299316406,302.0566101074219],[288.8468933105469,302.0566101074219]],"text":"0.017","page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:03.218665+05:30
619	0098712	114	0.011	0	0	C2	Length	default	0	{"bbox":[[288.8468933105469,297.3406066894531],[313.4469299316406,297.3406066894531],[313.4469299316406,314.0566101074219],[288.8468933105469,314.0566101074219]],"text":"0.011","page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:03.218665+05:30
620	0098712	114	0.002	0	0	B2	GDT-Flatness	default	0	{"bbox":[[384.56362957985885,459.9901123046875],[429.92962646484375,459.9901123046875],[429.92962646484375,476.70611572265625],[384.56362957985885,476.70611572265625]],"text":"0.002","gdt_class":6,"page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:05.827522+05:30
621	0098712	114	17	0.1	-0.1	C4	Length	default	0	{"bbox":[[86.1427001953125,377.1712341308594],[102.85869598388672,377.1712341308594],[102.85869598388672,416.55462646484375],[86.1427001953125,416.55462646484375]],"text":"17 ±0.1","page":1}	FTP_0098712_OP_0	\N	2026-04-29 11:37:08.304572+05:30
657	97986	114	90	0	0	D5	Length	default	10	{"bbox":[[477.34503173828125,378.0106506347656],[496.8631896972656,378.0106506347656],[496.8631896972656,397.5932312011719],[477.34503173828125,397.5932312011719]],"text":"90","page":1}	FTP_97986_OP_10	\N	2026-05-05 15:22:06.759205+05:30
612	00098345	114	30°	0.3	-0.3	F4	Angular	default	20	{"bbox":[[659.473388671875,96.20584106445312],[710.6256103515625,96.20584106445312],[710.6256103515625,121.23212432861328],[659.473388671875,121.23212432861328]],"text":"30° ±0.3°","page":1}	FTP_00098345_OP_20	\N	2026-04-28 10:22:49.732171+05:30
752	00098345	114	0.1	0	0	F6	GDT-Position	default	10	{"bbox":[[414.4444818438372,67.20793151855469],[463.3633728027344,67.20793151855469],[463.3633728027344,83.9239273071289],[414.4444818438372,83.9239273071289]],"text":"0.1","gdt_class":10,"page":1}	FTP_00098345_OP_10	\N	2026-05-06 10:53:43.677275+05:30
753	00098345	114	0 1	0	0	F5	Length	default	10	{"bbox":[[449.6966857910156,67.20793151855469],[478.3207092285156,67.20793151855469],[478.3207092285156,101.3965835571289],[449.6966857910156,101.3965835571289]],"text":"0 1 +M -0.1","page":1}	FTP_00098345_OP_10	\N	2026-05-06 10:53:43.677275+05:30
768	part567	114	0.021	0	0	B6	Length	default	10	{"bbox":[[331.8147888183594,561.3294677734375],[356.4148254394531,561.3294677734375],[356.4148254394531,578.0454711914062],[331.8147888183594,578.0454711914062]],"text":"0.021","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:33.807021+05:30
769	part567	114	0 015	0	0	B6	Length	default	10	{"bbox":[[331.8147888183594,573.3294677734375],[356.4148254394531,573.3294677734375],[356.4148254394531,590.0454711914062],[331.8147888183594,590.0454711914062]],"text":"0 015","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:33.807021+05:30
770	part567	114	0.003	0	0	C6	Length	default	10	{"bbox":[[323.4173889160156,529.1058349609375],[348.0174255371094,529.1058349609375],[348.0174255371094,545.8218383789062],[323.4173889160156,545.8218383789062]],"text":"0.003","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:33.807021+05:30
775	part567	114	0	0	0	D5	Length	default	10	{"bbox":[[481.2408447265625,381.8456115722656],[496.8631896972656,381.8456115722656],[496.8631896972656,397.5932312011719],[481.2408447265625,397.5932312011719]],"text":"0","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:47.776968+05:30
776	part567	114	0.5 X	0	0	D5	Length	default	10	{"bbox":[[554.88525390625,384.8612976074219],[577.8576049804688,384.8612976074219],[577.8576049804688,401.5773010253906],[554.88525390625,401.5773010253906]],"text":"0.5 X","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:47.776968+05:30
800	PRT-002	30	209 50	0	0	D5	Length	default	30	{"bbox":[[1108.0498046875,657.1649780273438],[1143.127685546875,657.1649780273438],[1143.127685546875,676.6669311523438],[1108.0498046875,676.6669311523438]],"text":"209 50","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:31:47.492611+05:30
801	PRT-002	30	235.75	0	0	D5	Length	default	30	{"bbox":[[1104.8609619140625,632.3544921875],[1146.3165283203125,632.3544921875],[1146.3165283203125,651.8564453125],[1104.8609619140625,651.8564453125]],"text":"235.75","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:31:47.492611+05:30
802	PRT-002	30	±0.05	0.05	-0.05	D5	Length	default	30	{"bbox":[[1146.3173828125,635.6569213867188],[1169.89111328125,635.6569213867188],[1169.89111328125,650.9799194335938],[1146.3173828125,650.9799194335938]],"text":"±0.05","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:31:47.492611+05:30
808	PRT-002	30	390	0	0	E6	Length	default	30	{"bbox":[[765.127197265625,281.11590576171875],[784.629150390625,281.11590576171875],[784.629150390625,306.6270751953125],[765.127197265625,306.6270751953125]],"text":"390","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:23.542864+05:30
809	PRT-002	30	±0.10	0.1	-0.1	F6	Length	default	30	{"bbox":[[768.4271240234375,257.5429992675781],[783.7501220703125,257.5429992675781],[783.7501220703125,281.11669921875],[768.4271240234375,281.11669921875]],"text":"±0.10","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:23.542864+05:30
813	0003-3	30	30°	0	0	B5	Angular	default	20	{"bbox":[[449.41571044921875,571.1315307617188],[483.75927734375,571.1315307617188],[483.75927734375,604.594970703125],[449.41571044921875,604.594970703125]],"text":"30°","page":1}	FTP_0003-3_OP_20	\N	2026-05-27 10:48:00.836667+05:30
814	0003-3	30	0.18	0	0	B5	Length	default	20	{"bbox":[[517.9542846679688,586.0648193359375],[552.954345703125,586.0648193359375],[552.954345703125,605.1748046875],[517.9542846679688,605.1748046875]],"text":"0.18","page":1}	FTP_0003-3_OP_20	\N	2026-05-27 10:48:00.836667+05:30
815	0003-3	30	40.5	0	0	E4	Length	default	20	{"bbox":[[649.659912109375,231.75045776367188],[668.7698974609375,231.75045776367188],[668.7698974609375,266.75048828125],[649.659912109375,266.75048828125]],"text":"40.5","page":1}	FTP_0003-3_OP_20	\N	2026-05-27 10:49:35.22229+05:30
816	0003-3	30	±0.1	0.1	-0.1	E4	Length	default	20	{"bbox":[[653.8639526367188,212.38046264648438],[667.5139770507812,212.38046264648438],[667.5139770507812,231.7554931640625],[653.8639526367188,231.7554931640625]],"text":"±0.1","page":1}	FTP_0003-3_OP_20	\N	2026-05-27 10:49:35.22229+05:30
771	part567	114	0.002	0	0	B5	GDT-Flatness	default	10	{"bbox":[[507.9428991262891,576.1766357421875],[552.9329223632812,576.1766357421875],[552.9329223632812,592.8926391601562],[507.9428991262891,592.8926391601562]],"text":"0.002","gdt_class":6,"page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:38.124361+05:30
772	part567	114	0.005	0	0	B5	Length	default	10	{"bbox":[[528.3328857421875,593.6493530273438],[552.9329223632812,593.6493530273438],[552.9329223632812,610.3653564453125],[528.3328857421875,610.3653564453125]],"text":"0.005","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:38.124361+05:30
803	PRT-002	30	169 50	0	0	D5	Length	default	30	{"bbox":[[1108.0513916015625,695.2372436523438],[1143.1292724609375,695.2372436523438],[1143.1292724609375,714.7391967773438],[1108.0513916015625,714.7391967773438]],"text":"169 50","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:02.778257+05:30
804	PRT-002	30	±0 05	0	0	D5	Length	default	30	{"bbox":[[1143.1292724609375,698.4952392578125],[1169.89111328125,698.4952392578125],[1169.89111328125,713.8548583984375],[1143.1292724609375,713.8548583984375]],"text":"±0 05","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:02.778257+05:30
805	PRT-002	30	185.75	0	0	D5	Length	default	30	{"bbox":[[1104.8609619140625,679.3304443359375],[1146.3165283203125,679.3304443359375],[1146.3165283203125,698.8323974609375],[1104.8609619140625,698.8323974609375]],"text":"185.75","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:02.778257+05:30
806	PRT-002	30	209.50	0	0	D5	Length	default	30	{"bbox":[[1104.8609619140625,657.1649780273438],[1146.3165283203125,657.1649780273438],[1146.3165283203125,676.6669311523438],[1104.8609619140625,676.6669311523438]],"text":"209.50","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:02.778257+05:30
807	PRT-002	30	±0.05	0.05	-0.05	D5	Length	default	30	{"bbox":[[1146.3173828125,682.6243286132812],[1169.89111328125,682.6243286132812],[1169.89111328125,697.9473266601562],[1146.3173828125,697.9473266601562]],"text":"±0.05","page":1}	FTP_PRT-002_OP_30	\N	2026-05-27 10:32:02.778257+05:30
810	A-PRT-002	30	Concentricity	0	0	D4	GDT-Concentricity	default	10	{"bbox":[[122.52589537874539,97.00832007957929],[142.2256489016183,97.00832007957929],[142.2256489016183,113.27484582497114],[122.52589537874539,113.27484582497114]],"text":"Concentricity","gdt_class":3,"page":1}	FTP_A-PRT-002_OP_10	\N	2026-05-27 10:46:54.190873+05:30
811	A-PRT-002	30	Diameter	0	0	D2	Diameter	default	10	{"bbox":[[394.0380696558492,112.23548851910849],[404.9858598017232,112.23548851910849],[404.9858598017232,123.6468139738204],[394.0380696558492,123.6468139738204]],"text":"Diameter","gdt_class":5,"page":1}	FTP_A-PRT-002_OP_10	\N	2026-05-27 10:47:00.398623+05:30
812	A-PRT-002	30	Diameter	0	0	C2	Diameter	default	10	{"bbox":[[313.46349855081405,371.6369363553875],[321.8518814624962,371.6369363553875],[321.8518814624962,382.71551339701347],[313.46349855081405,382.71551339701347]],"text":"Diameter","gdt_class":5,"page":1}	FTP_A-PRT-002_OP_10	\N	2026-05-27 10:47:05.95268+05:30
754	0078	114	0.002	0	0	D6	GDT-Flatness	default	20	{"bbox":[[363.2022208698998,291.9789733886719],[408.6566467285156,291.9789733886719],[408.6566467285156,308.6949768066406],[363.2022208698998,308.6949768066406]],"text":"0.002","gdt_class":6,"page":1}	FTP_0078_OP_20	\N	2026-05-06 14:25:01.75548+05:30
755	0078	114	0.005	0	0	D6	Length	default	20	{"bbox":[[384.0566101074219,309.4516906738281],[408.6566467285156,309.4516906738281],[408.6566467285156,326.1676940917969],[384.0566101074219,326.1676940917969]],"text":"0.005","page":1}	FTP_0078_OP_20	\N	2026-05-06 14:25:01.75548+05:30
773	part567	114	0.002	0	0	A5	GDT-Flatness	default	10	{"bbox":[[452.7546400258116,722.2521362304688],[497.8686218261719,722.2521362304688],[497.8686218261719,738.9681396484375],[452.7546400258116,738.9681396484375]],"text":"0.002","gdt_class":6,"page":1}	FTP_part567_OP_10	\N	2026-05-13 11:43:41.290002+05:30
777	part567	114	7.5	0	0	C4	Length	default	10	{"bbox":[[590.4606496994879,416.0315367718591],[618.9120691640636,416.0315367718591],[618.9120691640636,434.36717454922984],[590.4606496994879,434.36717454922984]],"text":"7.5","page":1}	FTP_part567_OP_10	\N	2026-05-13 11:44:45.164708+05:30
729	00098345	114	166	0	0	E5	Length	default	10	{"bbox":[[436.0130615234375,153.88833618164062],[457.47332763671875,153.88833618164062],[457.47332763671875,175.52357482910156],[436.0130615234375,175.52357482910156]],"text":"166","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:20.859431+05:30
730	00098345	114	210	0	0	E5	Length	default	10	{"bbox":[[454.64111328125,216.22373962402344],[471.0411376953125,216.22373962402344],[471.0411376953125,232.9397430419922],[454.64111328125,232.9397430419922]],"text":"210","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:22.573737+05:30
732	00098345	114	136	0	0	E5	Length	default	10	{"bbox":[[439.4991455078125,269.2663269042969],[460.716064453125,269.2663269042969],[460.716064453125,290.6685791015625],[439.4991455078125,290.6685791015625]],"text":"136","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:24.559932+05:30
733	00098345	114	10°	0	0	C7	Angular	default	10	{"bbox":[[278.89202880859375,448.531982421875],[295.9720764160156,448.531982421875],[295.9720764160156,466.50885009765625],[278.89202880859375,466.50885009765625]],"text":"10°","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:33.666238+05:30
734	00098345	114	15°	0	0	C7	Angular	default	10	{"bbox":[[241.0345458984375,454.65252685546875],[261.31622314453125,454.65252685546875],[261.31622314453125,475.54766845703125],[241.0345458984375,475.54766845703125]],"text":"15°","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:33.666238+05:30
735	00098345	114	35°	0	0	C6	Angular	default	10	{"bbox":[[396.8581237792969,490.52764892578125],[419.8066101074219,490.52764892578125],[419.8066101074219,513.468994140625],[396.8581237792969,513.468994140625]],"text":"35°","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:33.666238+05:30
736	00098345	114	30°	0.3	-0.3	F4	Angular	default	10	{"bbox":[[659.473388671875,96.20584106445312],[710.6256103515625,96.20584106445312],[710.6256103515625,121.23212432861328],[659.473388671875,121.23212432861328]],"text":"30° ±0.3°","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:49.189905+05:30
737	00098345	114	60°	0.3	-0.3	F3	Angular	default	10	{"bbox":[[731.5235595703125,94.25543975830078],[780.9059448242188,94.25543975830078],[780.9059448242188,136.70884704589844],[731.5235595703125,136.70884704589844]],"text":"60° ±0.3°","page":1}	FTP_00098345_OP_10	\N	2026-05-05 16:33:54.406493+05:30
\.


--
-- Data for Name: notes; Type: TABLE DATA; Schema: quality; Owner: -
--

COPY quality.notes (id, part_id, document_id, x, y, width, height, page, note_text, created_at, updated_at) FROM stdin;
34	1440	129	0	0	1	1	1	lj;	2026-04-28 15:28:42.44345+05:30	2026-04-28 15:28:42.44345+05:30
36	1447	134	345.8803386396526	513.5787512794268	222.25934587554266	83.58580348004094	1	AFTER MANUFACTURING, SURFACE P	2026-05-05 14:10:06.696034+05:30	2026-05-05 14:10:06.696034+05:30
35	1447	134	345.8803386396526	513.5787512794268	222.25934587554266	83.58580348004094	1	Note:\nALL EDGES TO BE CHAMFERED TO 0.5 x 45\n.	2026-05-05 14:10:06.696458+05:30	2026-05-05 14:10:06.696458+05:30
37	1447	134	345.8803386396526	513.5787512794268	222.25934587554266	83.58580348004094	1	TO BE HARDENED TO 58 - 60 HRC	2026-05-05 14:10:06.743053+05:30	2026-05-05 14:10:06.743053+05:30
38	1447	134	345.8803386396526	513.5787512794268	222.25934587554266	83.58580348004094	1	TO BE GRINDED BY 41 MICRONS	2026-05-05 14:10:06.742878+05:30	2026-05-05 14:10:06.742878+05:30
39	1447	134	288.91412758620686	635.0109329268292	96.47576551724137	29.774158536585364	1	Material\n20MnCr5 - DIN 17210	2026-05-05 14:10:28.245477+05:30	2026-05-05 14:10:28.245477+05:30
45	1481	149	394.3787231890153	565.3680624321463	183.97480502046687	36.48411481401024	1	ALL EDGES TO BE CHAMFERED TO 0.5 x 45\nTO BE HARDENED TO 28 - 30 HRC	2026-05-06 10:16:32.239288+05:30	2026-05-06 10:16:32.239288+05:30
47	1479	203	714.4432758564943	514.8442159075065	301.5406916653851	76.50974709099592	1	ALL EDGES TO BE CHAMFERED TO 0.5 x 45\nTO BE HARDENED TO 28 - 30 HRC.\nOUTER SURFACE TO BE GLASS BEAD SHOT PEENED AND\nELECTROLYSIS NICKEL PLATED.	2026-05-06 10:32:21.691058+05:30	2026-05-06 10:32:21.691058+05:30
48	1472	200	394.6306525182645	559.6089739402876	183.3978945563784	39.6532304122677	1	ALL EDGES TO BE CHAMFERED TO 0.5 x 45\nTO BE HARDENED TO 28-30 HRC.	2026-05-06 14:46:39.202489+05:30	2026-05-06 14:46:39.202489+05:30
50	1496	152	846.0852280426451	504.0593789012506	258.0622769372309	50.98252474552214	1	TO BE HARDENED TO 28-30 HRC.\n2.	2026-05-13 11:44:57.746687+05:30	2026-05-13 11:44:57.746687+05:30
49	1496	152	846.0852280426451	504.0593789012506	258.0622769372309	50.98252474552214	1	NOTE:\nALL HOLES TO BE CHAMFERED BY 1 x 45\n.	2026-05-13 11:44:57.746524+05:30	2026-05-13 11:44:57.746524+05:30
\.


--
-- Data for Name: stage_inspection; Type: TABLE DATA; Schema: quality; Owner: -
--

COPY quality.stage_inspection (id, user_id, part_id, sale_order_id, nominal_value, uppertol, lowertol, zone, dimension_type, measured_1, measured_2, measured_3, measured_mean, measured_instrument, used_inst, op_no, quantity_no, bbox, is_done, created_at, measurements) FROM stdin;
452	1	1472	114	45	0.15	-0.15	C2	Length	\N	\N	\N	11.00	default	default	0	2	{"master_boc_id": 640}	t	2026-05-07 12:21:43.609985+05:30	["11", "11", "11"]
451	1	1472	114	0.005	0	0	C2	Length	\N	\N	\N	10.00	default	default	0	2	{"master_boc_id": 639}	t	2026-05-07 12:21:43.609985+05:30	["10", "10", "10"]
450	1	1472	114	0.002	0	0	C2	GDT-Flatness	\N	\N	\N	8.00	default	default	0	2	{"master_boc_id": 638}	t	2026-05-07 12:21:43.609985+05:30	["2", "11", "11"]
320	1	1439	114	113.2	0.2	-0.2	D6	Length				113.00	default	default	10	1	{"master_boc_id": 555}	f	2026-04-16 09:55:51.627574+05:30	["113", "113", "113", ""]
481	1	1440	114	0.02	0	0	D3	GDT-Parallelism	\N	\N	\N		default	default	0	5	{"master_boc_id": 635}	f	2026-05-08 10:39:33.780632+05:30	[]
482	1	1440	114	0.01	0	0	D3	GDT-Total Runout	\N	\N	\N		default	default	0	5	{"master_boc_id": 636}	f	2026-05-08 10:39:33.780632+05:30	[]
483	1	1440	114	0.4	0	0	D4	Length	\N	\N	\N		default	default	0	5	{"master_boc_id": 637}	f	2026-05-08 10:39:33.780632+05:30	[]
239	1	1416	100	63	0.15	-0.15	D6	Length					default	default	10	1	{"master_boc_id": 340}	f	2026-04-09 11:18:21.14409+05:30	[]
240	1	1416	100	93.2	0.15	-0.15	D6	Length					default	default	10	1	{"master_boc_id": 341}	f	2026-04-09 11:18:21.14409+05:30	[]
241	1	1416	100	113.2	0.2	-0.2	D6	Length					default	default	10	1	{"master_boc_id": 342}	f	2026-04-09 11:18:21.14409+05:30	[]
242	1	1416	100	118.2	0.05	-0.05	D6	Length					default	default	10	1	{"master_boc_id": 343}	f	2026-04-09 11:18:21.14409+05:30	[]
243	1	1416	100	123.2	0.2	-0.2	D6	Length					default	default	10	1	{"master_boc_id": 344}	f	2026-04-09 11:18:21.14409+05:30	[]
244	1	1416	100	0.003	0	0	D5	GDT-Flatness					default	default	10	1	{"master_boc_id": 345}	f	2026-04-09 11:18:21.14409+05:30	[]
245	1	1416	100	0.005	0	0	D5	GDT-Total Runout					default	default	10	1	{"master_boc_id": 346}	f	2026-04-09 11:18:21.14409+05:30	[]
246	1	1416	100	0.8	0	0	D5	Length					default	default	10	1	{"master_boc_id": 347}	f	2026-04-09 11:18:21.14409+05:30	[]
457	1	1447	114	0 011	0	0	C2	Length	\N	\N	\N		default	default	10	1	{"master_boc_id": 765}	f	2026-05-07 14:15:09.261997+05:30	[]
453	1	1447	114	78	0.15	-0.15	C3	Diameter	\N	\N	\N	12.50	default	default	10	1	{"master_boc_id": 761}	t	2026-05-07 14:15:09.261997+05:30	["11", "12", "13", "14"]
455	1	1447	114	70	0	0	C3	Length	\N	\N	\N	70.00	default	default	10	1	{"master_boc_id": 763}	f	2026-05-07 14:15:09.261997+05:30	["70", "70", "70", ""]
456	1	1447	114	0.017	0	0	C2	Length	\N	\N	\N		default	default	10	1	{"master_boc_id": 764}	f	2026-05-07 14:15:09.261997+05:30	["", "", "", ""]
454	1	1447	114	0.003	0	0	C3	GDT-Total Runout	\N	\N	\N	11.67	default	default	10	1	{"master_boc_id": 762}	f	2026-05-07 14:15:09.261997+05:30	["10", "12", "13", ""]
465	1	1439	114	63	0.15	-0.15	D6	Length	\N	\N	\N		default	default	10	2	{"master_boc_id": 553}	f	2026-05-08 10:38:46.056706+05:30	[]
466	1	1439	114	93.2	0.15	-0.15	D6	Length	\N	\N	\N		default	default	10	2	{"master_boc_id": 554}	f	2026-05-08 10:38:46.056706+05:30	[]
467	1	1439	114	113.2	0.2	-0.2	D6	Length	\N	\N	\N		default	default	10	2	{"master_boc_id": 555}	f	2026-05-08 10:38:46.056706+05:30	[]
468	1	1439	114	118.2	0.05	-0.05	D6	Length	\N	\N	\N		default	default	10	2	{"master_boc_id": 556}	f	2026-05-08 10:38:46.056706+05:30	[]
469	1	1439	114	123.2	0.2	-0.2	D6	Length	\N	\N	\N		default	default	10	2	{"master_boc_id": 557}	f	2026-05-08 10:38:46.056706+05:30	[]
460	1	1447	114	70	0	0	C3	Length	\N	\N	\N		default	default	0	2	{"master_boc_id": 617}	f	2026-05-07 14:39:50.609447+05:30	[]
461	1	1447	114	0.017	0	0	C2	Length	\N	\N	\N		default	default	0	2	{"master_boc_id": 618}	f	2026-05-07 14:39:50.609447+05:30	[]
462	1	1447	114	0.011	0	0	C2	Length	\N	\N	\N		default	default	0	2	{"master_boc_id": 619}	f	2026-05-07 14:39:50.609447+05:30	[]
463	1	1447	114	0.002	0	0	B2	GDT-Flatness	\N	\N	\N		default	default	0	2	{"master_boc_id": 620}	f	2026-05-07 14:39:50.609447+05:30	[]
464	1	1447	114	17	0.1	-0.1	C4	Length	\N	\N	\N		default	default	0	2	{"master_boc_id": 621}	f	2026-05-07 14:39:50.609447+05:30	[]
458	1	1447	114	78	0.15	-0.15	C3	Diameter	\N	\N	\N	100.00	default	default	0	2	{"master_boc_id": 615}	t	2026-05-07 14:39:50.609447+05:30	["100", "100", "100", "100", "100"]
459	1	1447	114	0.003	0	0	C3	Length	\N	\N	\N		default	default	0	2	{"master_boc_id": 616}	f	2026-05-07 14:39:50.609447+05:30	["", "", "", "", ""]
470	1	1439	114	63	0.15	-0.15	D6	Length	\N	\N	\N		default	default	10	3	{"master_boc_id": 553}	f	2026-05-08 10:38:46.553737+05:30	[]
471	1	1439	114	93.2	0.15	-0.15	D6	Length	\N	\N	\N		default	default	10	3	{"master_boc_id": 554}	f	2026-05-08 10:38:46.553737+05:30	[]
472	1	1439	114	113.2	0.2	-0.2	D6	Length	\N	\N	\N		default	default	10	3	{"master_boc_id": 555}	f	2026-05-08 10:38:46.553737+05:30	[]
473	1	1439	114	118.2	0.05	-0.05	D6	Length	\N	\N	\N		default	default	10	3	{"master_boc_id": 556}	f	2026-05-08 10:38:46.553737+05:30	[]
474	1	1439	114	123.2	0.2	-0.2	D6	Length	\N	\N	\N		default	default	10	3	{"master_boc_id": 557}	f	2026-05-08 10:38:46.553737+05:30	[]
348	1	1439	114	18	0	0	D5	Diameter					default	default	0	1	{"master_boc_id": 596}	f	2026-04-27 12:00:07.325417+05:30	[]
343	1	1447	114	94	0	0	F6	Length					default	default	10	1	{"master_boc_id": 586}	f	2026-04-22 11:25:14.13195+05:30	[]
344	1	1447	114	45	0	0	D7	Length					default	default	10	1	{"master_boc_id": 587}	f	2026-04-22 11:25:14.13195+05:30	[]
345	1	1440	114	0.5 X 45° TYP.	0	0	C4	Chamfer	12	12	12	12	default	default	30	1	{"master_boc_id": 588}	t	2026-04-22 12:04:27.143956+05:30	["12", "12", "12"]
349	1	1439	114	9	0	0	D5	GDT-Perpendicularity					default	default	0	1	{"master_boc_id": 597}	f	2026-04-27 12:00:07.325417+05:30	[]
346	1	1440	114	0.4	0	0	C3	Length	11	11	11	11	default	default	30	1	{"master_boc_id": 589}	t	2026-04-22 12:04:27.143956+05:30	["11", "11", "11"]
347	1	1439	114	0.1	0	0	D5	GDT-Perpendicularity					default	default	0	1	{"master_boc_id": 595}	f	2026-04-27 12:00:07.325417+05:30	[]
350	1	1439	114	8 x CBORE HOLES	0	0	D5	Length					default	default	0	1	{"master_boc_id": 598}	f	2026-04-27 12:00:07.325417+05:30	[]
351	1	1439	114	9.3	0	0	D5	Length					default	default	0	1	{"master_boc_id": 599}	f	2026-04-27 12:00:07.325417+05:30	[]
353	1	1439	114	10 x  TAPPED HOLES	0	0	C8	Length					default	default	0	1	{"master_boc_id": 601}	f	2026-04-27 12:00:07.325417+05:30	[]
355	1	1439	114	R92	0.2	-0.2	E3	Radius					default	default	0	1	{"master_boc_id": 603}	f	2026-04-27 14:11:59.817939+05:30	[]
392	1	1479	114	5	0.1	-0.1	C2	Length				5.33	default	default	0	2	{"master_boc_id": 641}	t	2026-05-05 14:37:27.051421+05:30	["5", "6", "5"]
475	1	1440	114	0.02	0	0	D3	GDT-Parallelism	\N	\N	\N		default	default	0	3	{"master_boc_id": 635}	f	2026-05-08 10:39:33.10964+05:30	[]
476	1	1440	114	0.01	0	0	D3	GDT-Total Runout	\N	\N	\N		default	default	0	3	{"master_boc_id": 636}	f	2026-05-08 10:39:33.10964+05:30	[]
477	1	1440	114	0.4	0	0	D4	Length	\N	\N	\N		default	default	0	3	{"master_boc_id": 637}	f	2026-05-08 10:39:33.10964+05:30	[]
247	1	1416	100	95	0	0	C5	Diameter					default	default	10	1	{"master_boc_id": 348}	f	2026-04-09 11:18:21.14409+05:30	[]
248	1	1416	100	0.025	0	0	C4	GDT-Parallelism					default	default	10	1	{"master_boc_id": 349}	f	2026-04-09 11:18:21.14409+05:30	[]
249	1	1416	100	85	0.15	-0.15	C5	Diameter					default	default	10	1	{"master_boc_id": 350}	f	2026-04-09 11:18:21.14409+05:30	[]
250	1	1416	100	120	0.2	-0.2	C4	Diameter					default	default	10	1	{"master_boc_id": 351}	f	2026-04-09 11:18:21.14409+05:30	[]
251	1	1416	100	78	0.15	-0.15	C5	Diameter					default	default	10	1	{"master_boc_id": 352}	f	2026-04-09 11:18:21.14409+05:30	[]
252	1	1416	100	103	0.2	-0.2	C4	Diameter					default	default	10	1	{"master_boc_id": 353}	f	2026-04-09 11:18:21.14409+05:30	[]
253	1	1416	100	0.003	0	0	C5	GDT-Parallelism					default	default	10	1	{"master_boc_id": 354}	f	2026-04-09 11:18:21.14409+05:30	[]
254	1	1416	100	0.035	0	0	C5	Length					default	default	10	1	{"master_boc_id": 355}	f	2026-04-09 11:18:21.14409+05:30	[]
255	1	1416	100	0.000	0	0	C5	Length					default	default	10	1	{"master_boc_id": 356}	f	2026-04-09 11:18:21.14409+05:30	[]
256	1	1416	100	0.4	0	0	C5	Length					default	default	10	1	{"master_boc_id": 357}	f	2026-04-09 11:18:21.14409+05:30	[]
257	1	1416	100	104	0.15	-0.15	C8	Diameter					default	default	10	1	{"master_boc_id": 358}	f	2026-04-09 11:18:21.14409+05:30	[]
258	1	1416	100	0.025	0	0	C7	GDT-Total Runout					default	default	10	1	{"master_boc_id": 359}	f	2026-04-09 11:18:21.14409+05:30	[]
259	1	1416	100	86	0.15	-0.15	C8	Diameter					default	default	10	1	{"master_boc_id": 360}	f	2026-04-09 11:18:21.14409+05:30	[]
260	1	1416	100	72	0.15	-0.15	C7	Diameter					default	default	10	1	{"master_boc_id": 361}	f	2026-04-09 11:18:21.14409+05:30	[]
261	1	1416	100	83	0.15	-0.15	C8	Diameter					default	default	10	1	{"master_boc_id": 362}	f	2026-04-09 11:18:21.14409+05:30	[]
262	1	1416	100	0.00	0	0	C8	Length					default	default	10	1	{"master_boc_id": 363}	f	2026-04-09 11:18:21.14409+05:30	[]
263	1	1416	100	0.03	0	0	C7	Length					default	default	10	1	{"master_boc_id": 364}	f	2026-04-09 11:18:21.14409+05:30	[]
264	1	1416	100	1 5	0	0	B7	Length					default	default	10	1	{"master_boc_id": 365}	f	2026-04-09 11:18:21.14409+05:30	[]
265	1	1416	100	0.8	0	0	C7	Length					default	default	10	1	{"master_boc_id": 366}	f	2026-04-09 11:18:21.14409+05:30	[]
266	1	1416	100	43.50	0	0	B6	Length					default	default	10	1	{"master_boc_id": 367}	f	2026-04-09 11:18:21.14409+05:30	[]
267	1	1416	100	83.2	0.15	-0.15	B6	Length					default	default	10	1	{"master_boc_id": 368}	f	2026-04-09 11:18:21.14409+05:30	[]
268	1	1416	100	88.2	0.15	-0.15	B6	Length					default	default	10	1	{"master_boc_id": 369}	f	2026-04-09 11:18:21.14409+05:30	[]
269	1	1416	100	91.2	0.15	-0.15	A6	Length					default	default	10	1	{"master_boc_id": 370}	f	2026-04-09 11:18:21.14409+05:30	[]
270	1	1416	100	10.5	0.1	-0.1	B3	Length	10.5	10.5	10.5	10.5	default	default	20	1	{"master_boc_id": 502}	t	2026-04-09 15:49:47.582283+05:30	["10.5", "10.5", "10.5"]
271	1	1416	100	5.25	0	0	C3	Length	5.25	5.25	5.25	5.25	default	default	20	1	{"master_boc_id": 503}	t	2026-04-09 15:49:47.582283+05:30	["5.25", "5.25", "5.25"]
272	1	1416	100	5	0.1	-0.1	C2	Length	5	5	5	5	default	default	20	1	{"master_boc_id": 504}	t	2026-04-09 15:49:47.582283+05:30	["5", "5", "5"]
273	1	1416	100	10	0.1	-0.1	B3	Length	10	10	10	10	default	default	20	1	{"master_boc_id": 505}	t	2026-04-09 15:49:47.582283+05:30	["10", "10", "10"]
274	1	1416	100	2.5	0.05	-0.05	D3	Length	2.6	2.67	2.67	2.646667	default	default	20	1	{"master_boc_id": 506}	t	2026-04-09 15:49:47.582283+05:30	["2.6", "2.67", "2.67"]
275	1	1416	100	680	0	0	F5	Length					default	default	40	1	{"master_boc_id": 507}	f	2026-04-09 16:08:24.521469+05:30	[]
276	1	1416	100	±0.10	0.1	-0.1	F5	Length					default	default	40	1	{"master_boc_id": 508}	f	2026-04-09 16:08:24.521469+05:30	[]
281	1	1433	113	93.2	0.15	-0.15	D6	Length	94	94	94	94	default	default	10	1	{"master_boc_id": 510}	t	2026-04-13 13:36:21.305162+05:30	["94", "94", "94"]
277	1	1433	113	100	0.15	-0.15	C6	Diameter	150	100	100	116.666667	default	default	20	1	{"master_boc_id": 532}	t	2026-04-13 10:16:16.335257+05:30	["150", "100", "100"]
280	1	1433	113	63	0.15	-0.15	D6	Length	63	63	63	63	default	default	10	1	{"master_boc_id": 509}	t	2026-04-13 13:36:21.305162+05:30	["63", "63", "63"]
278	1	1433	113	0.003	0	0	C6	GDT-Total Runout	0.002	0.003	0.003	0.002667	default	default	20	1	{"master_boc_id": 533}	t	2026-04-13 10:16:16.335257+05:30	["0.002", "0.003", "0.003"]
279	1	1433	113	15	0.1	-0.1	B7	Length	15	15	15	15	default	default	20	1	{"master_boc_id": 537}	t	2026-04-13 10:16:16.335257+05:30	["15", "15", "15"]
282	1	1433	113	113.2	0.2	-0.2	D6	Length					default	default	10	1	{"master_boc_id": 511}	f	2026-04-13 13:36:21.305162+05:30	[]
283	1	1433	113	118.2	0.05	-0.05	D6	Length					default	default	10	1	{"master_boc_id": 512}	f	2026-04-13 13:36:21.305162+05:30	[]
284	1	1433	113	123.2	0.2	-0.2	D6	Length					default	default	10	1	{"master_boc_id": 513}	f	2026-04-13 13:36:21.305162+05:30	[]
285	1	1433	113	86	0.15	-0.15	C8	Diameter					default	default	10	1	{"master_boc_id": 526}	f	2026-04-13 13:36:21.305162+05:30	[]
286	1	1433	113	85	0.15	-0.15	C5	Diameter					default	default	10	1	{"master_boc_id": 538}	f	2026-04-13 13:36:21.305162+05:30	[]
287	1	1433	113	78	0.15	-0.15	C5	Diameter					default	default	10	1	{"master_boc_id": 539}	f	2026-04-13 13:36:21.305162+05:30	[]
288	1	1433	113	43.50	0	0	B6	Length					default	default	10	1	{"master_boc_id": 540}	f	2026-04-13 13:36:21.305162+05:30	[]
289	1	1433	113	83.2	0.15	-0.15	B6	Length					default	default	10	1	{"master_boc_id": 541}	f	2026-04-13 13:36:21.305162+05:30	[]
290	1	1433	113	88.2	0.15	-0.15	B6	Length					default	default	10	1	{"master_boc_id": 542}	f	2026-04-13 13:36:21.305162+05:30	[]
291	1	1433	113	91.2	0.15	-0.15	A6	Length					default	default	10	1	{"master_boc_id": 543}	f	2026-04-13 13:36:21.305162+05:30	[]
292	1	1433	113	83	0.15	-0.15	C8	Length					default	default	10	1	{"master_boc_id": 544}	f	2026-04-13 13:36:21.305162+05:30	[]
293	1	1433	113	0.003	0	0	D7	GDT-Flatness					default	default	10	1	{"master_boc_id": 545}	f	2026-04-13 13:36:21.305162+05:30	[]
294	1	1433	113	0.005	0	0	D7	GDT-Parallelism					default	default	10	1	{"master_boc_id": 546}	f	2026-04-13 13:36:21.305162+05:30	[]
295	1	1433	113	0.8	0	0	D8	Length					default	default	10	1	{"master_boc_id": 547}	f	2026-04-13 13:36:21.305162+05:30	[]
296	1	24	32	0	0	0	E7	Length					default	default	10	1	{"master_boc_id": 380}	f	2026-04-13 14:01:11.2268+05:30	[]
297	1	1433	113	63	0.15	-0.15	D6	Length					default	default	10	2	{"master_boc_id": 509}	f	2026-04-13 15:08:37.557327+05:30	[]
298	1	1433	113	93.2	0.15	-0.15	D6	Length					default	default	10	2	{"master_boc_id": 510}	f	2026-04-13 15:08:37.557327+05:30	[]
299	1	1433	113	63	0.15	-0.15	D6	Length					default	default	10	3	{"master_boc_id": 509}	f	2026-04-13 15:09:06.448574+05:30	[]
300	1	1433	113	93.2	0.15	-0.15	D6	Length					default	default	10	3	{"master_boc_id": 510}	f	2026-04-13 15:09:06.448574+05:30	[]
327	1	1440	114	9	0.1	-0.1	C3	Length	9	9	9	9	default	default	20	1	{"master_boc_id": 572}	t	2026-04-16 12:07:27.831845+05:30	["9", "9", "9"]
309	1	1440	114	78	0.15	-0.15	C2	Length	78	78	78	78	default	default	10	1	{"master_boc_id": 567}	t	2026-04-15 10:08:36.174618+05:30	["78", "78", "78"]
310	1	1440	114	17	0.1	-0.1	C4	Length					default	default	10	2	{"master_boc_id": 566}	f	2026-04-15 12:23:44.280422+05:30	[]
311	1	1440	114	78	0.15	-0.15	C2	Length					default	default	10	2	{"master_boc_id": 567}	f	2026-04-15 12:23:44.280422+05:30	[]
301	1	1439	114	15	0.1	-0.1	B7	Length	15	15	15	57	default	default	20	1	{"master_boc_id": 558}	t	2026-04-13 15:28:26.477307+05:30	["15", "15", "15"]
312	1	1440	114	17	0.1	-0.1	C4	Length					default	default	10	3	{"master_boc_id": 566}	f	2026-04-15 12:23:45.738505+05:30	[]
313	1	1440	114	78	0.15	-0.15	C2	Length					default	default	10	3	{"master_boc_id": 567}	f	2026-04-15 12:23:45.738505+05:30	[]
302	1	1439	114	100	0.15	-0.15	C6	Length	100	100	100	100	default	default	20	1	{"master_boc_id": 559}	t	2026-04-13 15:28:26.477307+05:30	["100", "100", "100"]
314	1	1440	114	17	0.1	-0.1	C4	Length					default	default	10	4	{"master_boc_id": 566}	f	2026-04-15 12:23:46.917051+05:30	[]
315	1	1440	114	78	0.15	-0.15	C2	Length					default	default	10	4	{"master_boc_id": 567}	f	2026-04-15 12:23:46.917051+05:30	[]
303	1	1439	114	15	0.1	-0.1	B7	Length	15	15	15	15	default	default	20	2	{"master_boc_id": 558}	t	2026-04-13 15:30:01.130633+05:30	["15", "15", "15"]
316	1	1440	114	17	0.1	-0.1	C4	Length					default	default	10	5	{"master_boc_id": 566}	f	2026-04-15 12:23:48.972104+05:30	[]
317	1	1440	114	78	0.15	-0.15	C2	Length					default	default	10	5	{"master_boc_id": 567}	f	2026-04-15 12:23:48.972104+05:30	[]
304	1	1439	114	100	0.15	-0.15	C6	Length	100	100	0100	100	default	default	20	2	{"master_boc_id": 559}	t	2026-04-13 15:30:01.130633+05:30	["100", "100", "0100"]
305	1	1439	114	15	0.1	-0.1	B7	Length	14	14	14	14	default	default	20	3	{"master_boc_id": 558}	t	2026-04-13 15:30:14.476915+05:30	["14", "14", "14"]
306	1	1439	114	100	0.15	-0.15	C6	Length	100	100	100	100	default	default	20	3	{"master_boc_id": 559}	t	2026-04-13 15:30:14.476915+05:30	["100", "100", "100"]
323	1	1439	114	45	0.15	-0.15	C2	Length					default	default	30	2	{"master_boc_id": 565}	f	2026-04-16 10:10:37.744415+05:30	[]
324	1	1439	114	45	0.15	-0.15	C2	Length					default	default	30	3	{"master_boc_id": 565}	f	2026-04-16 10:12:45.816773+05:30	[]
307	1	1439	114	45	0.15	-0.15	C2	Length	45	45	45	45	default	default	30	1	{"master_boc_id": 565}	t	2026-04-13 16:45:33.285518+05:30	["45", "45", "45"]
308	1	1440	114	17	0.1	-0.1	C4	Length	17	17	17	17	default	default	10	1	{"master_boc_id": 566}	t	2026-04-15 10:08:36.174618+05:30	["17", "17", "17"]
328	1	1440	114	30	0.15	-0.15	C3	Length					default	default	20	2	{"master_boc_id": 570}	f	2026-04-16 12:09:44.837559+05:30	[]
329	1	1440	114	4	0.05	-0.05	C3	Length					default	default	20	2	{"master_boc_id": 571}	f	2026-04-16 12:09:44.837559+05:30	[]
330	1	1440	114	9	0.1	-0.1	C3	Length					default	default	20	2	{"master_boc_id": 572}	f	2026-04-16 12:09:44.837559+05:30	[]
325	1	1440	114	30	0.15	-0.15	C3	Length	30	30	30	30	default	default	20	1	{"master_boc_id": 570}	t	2026-04-16 12:07:27.831845+05:30	["30", "30", "30"]
331	1	1440	114	30	0.15	-0.15	C3	Length					default	default	20	3	{"master_boc_id": 570}	f	2026-04-16 12:09:46.343219+05:30	[]
332	1	1440	114	4	0.05	-0.05	C3	Length					default	default	20	3	{"master_boc_id": 571}	f	2026-04-16 12:09:46.343219+05:30	[]
326	1	1440	114	4	0.05	-0.05	C3	Length	4	4	4	4	default	default	20	1	{"master_boc_id": 571}	t	2026-04-16 12:07:27.831845+05:30	["4", "4", "4"]
333	1	1440	114	9	0.1	-0.1	C3	Length					default	default	20	3	{"master_boc_id": 572}	f	2026-04-16 12:09:46.343219+05:30	[]
334	1	1447	114	0.003	0	0	C6	GDT-Total Runout	0.003	0.003	0.003	0.003	default	default	20	1	{"master_boc_id": 573}	t	2026-04-22 10:56:02.812559+05:30	["0.003", "0.003", "0.003"]
336	1	1447	114	15	0.1	-0.1	B7	Length	15	15	15	15	default	default	20	1	{"master_boc_id": 578}	t	2026-04-22 10:56:02.812559+05:30	["15", "15", "15"]
335	1	1447	114	100	0.15	-0.15	C6	Diameter	100	100	100	100	default	default	20	1	{"master_boc_id": 574}	t	2026-04-22 10:56:02.812559+05:30	["100", "100", "100"]
338	1	1447	114	0.003	0	0	C6	GDT-Total Runout					default	default	20	2	{"master_boc_id": 573}	f	2026-04-22 10:58:01.738107+05:30	[]
339	1	1447	114	100	0.15	-0.15	C6	Diameter					default	default	20	2	{"master_boc_id": 574}	f	2026-04-22 10:58:01.738107+05:30	[]
337	1	1447	114	0.002	0	0	A5	GDT-Flatness	0.002	0.0021	0.002	0.002033	default	default	20	1	{"master_boc_id": 579}	t	2026-04-22 10:56:02.812559+05:30	["0.002", "0.0021", "0.002"]
340	1	1447	114	15	0.1	-0.1	B7	Length					default	default	20	2	{"master_boc_id": 578}	f	2026-04-22 10:58:01.738107+05:30	[]
341	1	1447	114	0.002	0	0	A5	GDT-Flatness					default	default	20	2	{"master_boc_id": 579}	f	2026-04-22 10:58:01.738107+05:30	[]
342	1	1447	114	150	0	0	D6	Length					default	default	10	1	{"master_boc_id": 585}	f	2026-04-22 11:25:14.13195+05:30	[]
357	1	1439	114	2	0	0	E3	Length					default	default	0	1	{"master_boc_id": 605}	f	2026-04-27 14:11:59.817939+05:30	[]
358	1	1479	114	118 2	0	0	D6	Length					default	default	10	1	{"master_boc_id": 606}	f	2026-04-27 16:42:23.149569+05:30	[]
359	1	1479	114	123.2	0.2	-0.2	D6	Length	123.2	123.2	123.2	123.2	default	default	10	1	{"master_boc_id": 607}	t	2026-04-27 16:42:23.149569+05:30	["123.2", "123.2", "123.2"]
362	1	1479	114	30°	0.3	-0.3	F4	Angular	1	1	1	1	asdf	default	20	1	{"master_boc_id": 612}	t	2026-04-28 15:26:03.905307+05:30	["1", "1", "1"]
376	1	1440	114	0.4	0	0	D4	Length	1	1	1	1	default	default	0	1	{"master_boc_id": 637}	t	2026-04-29 11:49:18.14192+05:30	["1", "1", "1"]
354	1	1439	114	30°	0.3	-0.3	F4	Angular	30	30	30	30	default	default	0	1	{"master_boc_id": 602}	t	2026-04-27 12:00:07.325417+05:30	["30", "30", "30"]
352	1	1439	114	0.1	0	0	C8	GDT-Perpendicularity	.1	.1	.1	0.1	default	default	0	1	{"master_boc_id": 600}	t	2026-04-27 12:00:07.325417+05:30	[".1", ".1", ".1"]
360	1	1472	114	100	0.15	-0.15	C6	Length	100	100	100	100	default	default	10	1	{"master_boc_id": 610}	t	2026-04-28 10:15:13.272906+05:30	["100", "100", "100"]
374	1	1440	114	0.02	0	0	D3	GDT-Parallelism	11	11	11	11	asd	default	0	1	{"master_boc_id": 635}	t	2026-04-29 11:49:18.14192+05:30	["11", "11", "11"]
378	1	1472	114	0.005	0	0	C2	Length	5	5	5	5	default	default	0	1	{"master_boc_id": 639}	t	2026-04-29 12:11:05.374529+05:30	["5", "5", "5"]
361	1	1472	114	0 003	0	0	C6	Length	0.003	0.003	0.003	0.003	default	default	10	1	{"master_boc_id": 611}	t	2026-04-28 10:15:13.272906+05:30	["0.003", "0.003", "0.003"]
363	1	1447	114	0.8	0	0	B3	Diameter					default	default	30	1	{"master_boc_id": 590}	f	2026-04-28 16:01:06.596097+05:30	[]
321	1	1439	114	118.2	0.05	-0.05	D6	Length				118.00	default	default	10	1	{"master_boc_id": 556}	f	2026-04-16 09:55:51.627574+05:30	["118", "", "", ""]
319	1	1439	114	93.2	0.15	-0.15	D6	Length				49.50	default	default	10	1	{"master_boc_id": 554}	t	2026-04-16 09:55:51.627574+05:30	["93", "9", "3", "93"]
322	1	1439	114	123.2	0.2	-0.2	D6	Length				123.00	default	default	10	1	{"master_boc_id": 557}	f	2026-04-16 09:55:51.627574+05:30	["123", "123", "", ""]
364	1	1447	114	136	0.15	-0.15	C3	Diameter					default	default	30	1	{"master_boc_id": 591}	f	2026-04-28 16:01:06.596097+05:30	[]
365	1	1447	114	0.005	0	0	B4	GDT-Flatness					default	default	30	1	{"master_boc_id": 593}	f	2026-04-28 16:01:06.596097+05:30	[]
366	1	1447	114	20	0.1	-0.1	B3	Length					default	default	30	1	{"master_boc_id": 594}	f	2026-04-28 16:01:06.596097+05:30	[]
375	1	1440	114	0.01	0	0	D3	GDT-Total Runout	12	12	12	12	asdf	default	0	1	{"master_boc_id": 636}	t	2026-04-29 11:49:18.14192+05:30	["12", "12", "12"]
377	1	1472	114	0.002	0	0	C2	GDT-Flatness	3	3	3	3	asdf	default	0	1	{"master_boc_id": 638}	t	2026-04-29 12:11:05.374529+05:30	["3", "3", "3"]
356	1	1439	114	17	0	0	E3	Length	17	17	17	17	default	default	0	1	{"master_boc_id": 604}	t	2026-04-27 14:11:59.817939+05:30	["17", "17", "17"]
367	1	1447	114	78	0.15	-0.15	C3	Diameter					default	default	0	1	{"master_boc_id": 615}	f	2026-04-29 11:37:14.273914+05:30	[]
368	1	1447	114	0.003	0	0	C3	Length					default	default	0	1	{"master_boc_id": 616}	f	2026-04-29 11:37:14.273914+05:30	[]
369	1	1447	114	70	0	0	C3	Length					default	default	0	1	{"master_boc_id": 617}	f	2026-04-29 11:37:14.273914+05:30	[]
370	1	1447	114	0.017	0	0	C2	Length					default	default	0	1	{"master_boc_id": 618}	f	2026-04-29 11:37:14.273914+05:30	[]
371	1	1447	114	0.011	0	0	C2	Length					default	default	0	1	{"master_boc_id": 619}	f	2026-04-29 11:37:14.273914+05:30	[]
372	1	1447	114	0.002	0	0	B2	GDT-Flatness					default	default	0	1	{"master_boc_id": 620}	f	2026-04-29 11:37:14.273914+05:30	[]
373	1	1447	114	17	0.1	-0.1	C4	Length					default	default	0	1	{"master_boc_id": 621}	f	2026-04-29 11:37:14.273914+05:30	[]
379	1	1472	114	45	0.15	-0.15	C2	Length	45	45	45	45	default	default	0	1	{"master_boc_id": 640}	t	2026-04-29 12:11:05.374529+05:30	["45", "45", "45"]
381	1	1439	114	0.1	0	0	D5	GDT-Perpendicularity					default	default	0	2	{"master_boc_id": 595}	f	2026-05-05 10:52:34.163391+05:30	[]
382	1	1439	114	18	0	0	D5	Diameter					default	default	0	2	{"master_boc_id": 596}	f	2026-05-05 10:52:34.163391+05:30	[]
383	1	1439	114	9	0	0	D5	GDT-Perpendicularity					default	default	0	2	{"master_boc_id": 597}	f	2026-05-05 10:52:34.163391+05:30	[]
384	1	1439	114	8 x CBORE HOLES	0	0	D5	Length					default	default	0	2	{"master_boc_id": 598}	f	2026-05-05 10:52:34.163391+05:30	[]
385	1	1439	114	9.3	0	0	D5	Length					default	default	0	2	{"master_boc_id": 599}	f	2026-05-05 10:52:34.163391+05:30	[]
380	1	1479	114	5	0.1	-0.1	C2	Length	5	5	5	5	asdfg	default	0	1	{"master_boc_id": 641}	t	2026-04-29 12:12:12.933842+05:30	["5", "5", "5"]
386	1	1439	114	0.1	0	0	C8	GDT-Perpendicularity					default	default	0	2	{"master_boc_id": 600}	f	2026-05-05 10:52:34.163391+05:30	[]
387	1	1439	114	10 x  TAPPED HOLES	0	0	C8	Length					default	default	0	2	{"master_boc_id": 601}	f	2026-05-05 10:52:34.163391+05:30	[]
388	1	1439	114	30°	0.3	-0.3	F4	Angular					default	default	0	2	{"master_boc_id": 602}	f	2026-05-05 10:52:34.163391+05:30	[]
389	1	1439	114	R92	0.2	-0.2	E3	Radius					default	default	0	2	{"master_boc_id": 603}	f	2026-05-05 10:52:34.163391+05:30	[]
390	1	1439	114	17	0	0	E3	Length					default	default	0	2	{"master_boc_id": 604}	f	2026-05-05 10:52:34.163391+05:30	[]
391	1	1439	114	2	0	0	E3	Length					default	default	0	2	{"master_boc_id": 605}	f	2026-05-05 10:52:34.163391+05:30	[]
411	1	1481	114	0.003	0	0	C3	GDT-Total Runout					asd	default	10	1	{"master_boc_id": 743}	f	2026-05-06 10:11:16.434932+05:30	[]
433	1	1472	114	0.002	0	0	C2	GDT-Flatness					default	default	20	1	{"master_boc_id": 754}	f	2026-05-06 14:25:08.751638+05:30	[]
393	1	24	32	4	0.05	-0.05	D3	Length	4	4	4	4	default	default	20	1	{"master_boc_id": 642}	t	2026-05-05 14:37:27.911782+05:30	["4", "4", "4"]
434	1	1472	114	0.005	0	0	C2	Length					default	default	20	1	{"master_boc_id": 755}	f	2026-05-06 14:25:08.751638+05:30	[]
412	1	1481	114	60	0	0	C3	Length	60	60	60	60	default	default	10	1	{"master_boc_id": 744}	t	2026-05-06 10:11:16.434932+05:30	["60", "60", "60"]
394	1	24	32	6	0.1	-0.1	C4	Length	6	6	6	6	default	default	20	1	{"master_boc_id": 643}	t	2026-05-05 14:37:27.911782+05:30	["6", "6", "6"]
417	1	1479	114	0.1	0	0	D5	GDT-Perpendicularity					default	default	10	1	{"master_boc_id": 749}	f	2026-05-06 10:38:52.030795+05:30	[]
418	1	1479	114	18	0	0	D5	Diameter					default	default	10	1	{"master_boc_id": 750}	f	2026-05-06 10:38:52.030795+05:30	[]
395	1	24	32	3.5	0.1	-0.1	C4	Length	4	4	4	4	default	default	20	1	{"master_boc_id": 644}	t	2026-05-05 14:37:27.911782+05:30	["4", "4", "4"]
419	1	1479	114	9.3	0	0	D5	Length					default	default	10	1	{"master_boc_id": 751}	f	2026-05-06 10:38:52.030795+05:30	[]
403	1	1479	114	166	0	0	E5	Length					nm m	default	10	1	{"master_boc_id": 729}	f	2026-05-06 09:47:02.589147+05:30	[]
396	1	24	32	0.025	0	0	B4	GDT-Flatness	1	1	1	1	default	default	20	1	{"master_boc_id": 645}	t	2026-05-05 14:37:27.911782+05:30	["1", "1", "1"]
420	1	1439	114	0.1	0	0	D5	GDT-Perpendicularity					default	default	0	3	{"master_boc_id": 595}	f	2026-05-06 11:00:17.739949+05:30	[]
421	1	1439	114	18	0	0	D5	Diameter					default	default	0	3	{"master_boc_id": 596}	f	2026-05-06 11:00:17.739949+05:30	[]
397	1	24	32	12	0.1	-0.1	B3	Length	12	12	12	12	default	default	20	1	{"master_boc_id": 646}	t	2026-05-05 14:37:27.911782+05:30	["12", "12", "12"]
422	1	1439	114	9	0	0	D5	GDT-Perpendicularity					default	default	0	3	{"master_boc_id": 597}	f	2026-05-06 11:00:17.739949+05:30	[]
423	1	1439	114	8 x CBORE HOLES	0	0	D5	Length					default	default	0	3	{"master_boc_id": 598}	f	2026-05-06 11:00:17.739949+05:30	[]
424	1	1439	114	9.3	0	0	D5	Length					default	default	0	3	{"master_boc_id": 599}	f	2026-05-06 11:00:17.739949+05:30	[]
425	1	1439	114	0.1	0	0	C8	GDT-Perpendicularity					default	default	0	3	{"master_boc_id": 600}	f	2026-05-06 11:00:17.739949+05:30	[]
426	1	1439	114	10 x  TAPPED HOLES	0	0	C8	Length					default	default	0	3	{"master_boc_id": 601}	f	2026-05-06 11:00:17.739949+05:30	[]
398	1	24	32	0.5 X 45° TYP.	0	0	C1	Chamfer	2	2	2	2	default	default	20	1	{"master_boc_id": 647}	t	2026-05-05 14:37:27.911782+05:30	["2", "2", "2"]
427	1	1439	114	30°	0.3	-0.3	F4	Angular					default	default	0	3	{"master_boc_id": 602}	f	2026-05-06 11:00:17.739949+05:30	[]
428	1	1439	114	R92	0.2	-0.2	E3	Radius					default	default	0	3	{"master_boc_id": 603}	f	2026-05-06 11:00:17.739949+05:30	[]
399	1	1480	114	90	0	0	D5	Length	90	90	90	90	default	default	10	1	{"master_boc_id": 657}	t	2026-05-05 15:22:14.013029+05:30	["90", "90", "90"]
400	1	1440	114	0.02	0	0	D3	GDT-Parallelism					default	default	0	2	{"master_boc_id": 635}	f	2026-05-05 16:27:08.247796+05:30	[]
401	1	1440	114	0.01	0	0	D3	GDT-Total Runout					default	default	0	2	{"master_boc_id": 636}	f	2026-05-05 16:27:08.247796+05:30	[]
402	1	1440	114	0.4	0	0	D4	Length					default	default	0	2	{"master_boc_id": 637}	f	2026-05-05 16:27:08.247796+05:30	[]
404	1	1479	114	210	0	0	E5	Length					default	default	10	1	{"master_boc_id": 730}	f	2026-05-06 09:47:02.589147+05:30	[]
405	1	1479	114	136	0	0	E5	Length					default	default	10	1	{"master_boc_id": 732}	f	2026-05-06 09:47:02.589147+05:30	[]
406	1	1479	114	10°	0	0	C7	Angular					default	default	10	1	{"master_boc_id": 733}	f	2026-05-06 09:47:02.589147+05:30	[]
407	1	1479	114	15°	0	0	C7	Angular					default	default	10	1	{"master_boc_id": 734}	f	2026-05-06 09:47:02.589147+05:30	[]
408	1	1479	114	35°	0	0	C6	Angular					default	default	10	1	{"master_boc_id": 735}	f	2026-05-06 09:47:02.589147+05:30	[]
409	1	1479	114	30°	0.3	-0.3	F4	Angular					default	default	10	1	{"master_boc_id": 736}	f	2026-05-06 09:47:02.589147+05:30	[]
410	1	1479	114	60°	0.3	-0.3	F3	Angular					default	default	10	1	{"master_boc_id": 737}	f	2026-05-06 09:47:02.589147+05:30	[]
413	1	1481	114	0.021	0	0	C3	Length					default	default	10	1	{"master_boc_id": 745}	f	2026-05-06 10:11:16.434932+05:30	[]
414	1	1481	114	0.015	0	0	C3	Length					default	default	10	1	{"master_boc_id": 746}	f	2026-05-06 10:11:16.434932+05:30	[]
415	1	1481	114	95 g6 0.034	0	0	C3	Length					default	default	10	1	{"master_boc_id": 747}	f	2026-05-06 10:11:16.434932+05:30	[]
416	1	1481	114	0.4	0	0	C3	Length					default	default	10	1	{"master_boc_id": 748}	f	2026-05-06 10:11:16.434932+05:30	[]
429	1	1439	114	17	0	0	E3	Length					default	default	0	3	{"master_boc_id": 604}	f	2026-05-06 11:00:17.739949+05:30	[]
430	1	1439	114	2	0	0	E3	Length					default	default	0	3	{"master_boc_id": 605}	f	2026-05-06 11:00:17.739949+05:30	[]
431	1	1479	114	0.1	0	0	F6	GDT-Position					default	default	10	1	{"master_boc_id": 752}	f	2026-05-06 11:09:13.106468+05:30	[]
432	1	1479	114	0 1	0	0	F5	Length					default	default	10	1	{"master_boc_id": 753}	f	2026-05-06 11:09:13.106468+05:30	[]
318	1	1439	114	63	0.15	-0.15	D6	Length				63.00	default	default	10	1	{"master_boc_id": 553}	t	2026-04-16 09:55:51.627574+05:30	["63", "63", "63", "63"]
478	1	1440	114	0.02	0	0	D3	GDT-Parallelism	\N	\N	\N		default	default	0	4	{"master_boc_id": 635}	f	2026-05-08 10:39:33.516249+05:30	[]
479	1	1440	114	0.01	0	0	D3	GDT-Total Runout	\N	\N	\N		default	default	0	4	{"master_boc_id": 636}	f	2026-05-08 10:39:33.516249+05:30	[]
480	1	1440	114	0.4	0	0	D4	Length	\N	\N	\N		default	default	0	4	{"master_boc_id": 637}	f	2026-05-08 10:39:33.516249+05:30	[]
\.


--
-- Data for Name: efficiency_factor; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.efficiency_factor (id, efficiency_factor, created_at, updated_at) FROM stdin;
1	1	2026-02-23 06:47:05.698766	2026-05-14 12:36:36.121553
\.


--
-- Data for Name: machine_downtimes; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.machine_downtimes (id, machine_id, start_time, end_time, status_id, status_name, description, created_at) FROM stdin;
51	25	2026-03-27 09:05:06	2026-03-30 20:08:08	2	OFF	Default status - machine created	2026-03-26 10:39:49.254071
69	15	2026-01-01 00:00:00	2026-03-31 00:00:00	2	OFF	OFF	2026-03-30 05:46:15.45472
71	24	2026-03-30 12:00:00	2026-03-31 05:00:00	2	OFF	hydraulic issue|pneumatic issue	2026-03-30 07:03:58.732089
73	15	2026-03-31 10:55:15.493	2026-01-01 00:00:00	1	ON	on	2026-03-31 05:25:15.510825
75	24	2026-03-31 11:35:52.371	2026-01-01 00:00:00	1	ON	machine on	2026-03-31 06:05:52.683147
76	25	2026-03-31 11:36:08.043	2026-01-01 00:00:00	1	ON	machine on	2026-03-31 06:06:08.355807
81	33	2026-04-02 00:00:00	2026-04-16 00:00:00	2	OFF	machine off	2026-04-01 09:36:14.377791
82	33	2026-04-01 15:09:55.094	2026-01-01 00:00:00	1	ON	machine ON	2026-04-01 09:39:55.107763
83	34	2026-04-02 00:00:00	2026-04-30 00:00:00	2	OFF	ISSUE	2026-04-01 09:40:47.022754
84	34	2026-04-01 15:30:23.733	2026-01-01 00:00:00	1	ON	machine on	2026-04-01 10:00:23.905096
85	33	2026-04-06 09:00:00	2026-04-08 10:00:00	2	OFF	machine off	2026-04-06 05:33:02.988902
86	33	2026-04-06 11:34:23.031	2026-01-01 00:00:00	1	ON	machine on	2026-04-06 06:04:23.046139
89	13	2026-04-09 05:06:00	2026-04-09 05:06:00	2	OFF	Default status - machine created	2026-04-09 05:34:30.749547
90	13	2026-04-09 11:05:48.755	2026-01-01 00:00:00	1	ON	Default status - machine created	2026-04-09 05:35:50.037993
91	15	2026-04-09 05:06:00	2026-04-16 09:00:00	2	OFF	breakdown	2026-04-09 05:36:26.813845
92	15	2026-04-09 11:12:09.435	2026-01-01 00:00:00	1	ON	machine on	2026-04-09 05:42:10.723752
101	17	2026-04-27 00:00:00	2026-04-30 00:00:00	2	OFF	Default status - machine created	2026-04-27 11:41:31.504647
102	17	2026-04-27 17:11:46.099	2026-01-01 00:00:00	1	ON	Default status - machine created	2026-04-27 11:41:43.032722
103	13	2026-04-29 07:00:00	2026-04-30 04:00:00	2	OFF	Default status - machine created	2026-04-29 11:13:37.672529
104	13	2026-04-29 16:51:35.784	2026-01-01 00:00:00	1	ON	machine repaired	2026-04-29 11:21:35.804173
105	15	2026-05-21 00:00:00	2026-05-28 00:00:00	2	OFF	machine breakdown	2026-05-21 11:08:00.655428
106	26	2026-05-29 11:00:00	2026-05-30 13:00:00	2	OFF	machine breakdown	2026-05-29 06:04:48.916747
107	26	2026-05-29 11:50:14.783	2026-01-01 00:00:00	1	ON	machine repaired now	2026-05-29 06:20:14.797628
\.


--
-- Data for Name: machine_operator_shift_assignment; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.machine_operator_shift_assignment (id, machine_id, operator_id, shift_config_id, created_at, updated_at) FROM stdin;
17	13	3	139	2026-05-19 05:57:30.78243	2026-05-19 05:57:30.78243
18	20	3	140	2026-05-19 06:37:37.120658	2026-05-19 06:37:37.120658
19	20	3	141	2026-05-19 06:44:34.740466	2026-05-19 06:44:34.740466
23	13	3	138	2026-05-19 10:02:57.573725	2026-05-19 10:02:57.573725
\.


--
-- Data for Name: machine_schedule; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.machine_schedule (id, order_id, part_id, operation_id, machine_id, start_time, end_time, status, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: machine_status; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.machine_status (id, machine_id, status_id, description, available_from, available_to) FROM stdin;
22	14	1	Default status - machine created	2026-01-01 00:00:00	\N
24	16	1	Default status - machine created	2026-01-01 00:00:00	\N
26	18	1	Default status - machine created	2026-01-01 00:00:00	\N
27	19	1	Default status - machine created	2026-01-01 00:00:00	\N
28	20	1	Default status - machine created	2026-01-01 00:00:00	\N
29	21	1	Default status - machine created	2026-01-01 00:00:00	\N
30	22	1	Default status - machine created	2026-01-01 00:00:00	\N
31	23	1	Default status - machine created	2026-01-01 00:00:00	\N
35	27	1	Default status - machine created	2026-01-01 00:00:00	\N
36	28	1	Default status - machine created	2026-01-01 00:00:00	\N
37	29	1	Default status - machine created	2026-01-01 00:00:00	\N
38	30	1	Default status - machine created	2026-01-01 00:00:00	\N
39	31	1	Default status - machine created	2026-01-01 00:00:00	\N
40	32	1	Default status - machine created	2026-01-01 00:00:00	\N
43	35	1	Default status - machine created	2026-01-01 00:00:00	\N
32	24	1	machine on	2026-03-31 11:35:52.371	\N
33	25	1	machine on	2026-03-31 11:36:08.043	\N
42	34	1	machine on	2026-04-01 15:30:23.733	\N
41	33	1	machine on	2026-04-06 11:34:23.031	\N
44	36	1	Default status - machine created	2026-01-01 00:00:00	\N
25	17	1	Default status - machine created	2026-04-27 17:11:46.099	\N
21	13	1	machine repaired	2026-04-29 16:51:35.784	\N
23	15	2	machine breakdown	2026-05-21 00:00:00	2026-05-28 00:00:00
34	26	1	machine repaired now	2026-05-29 11:50:14.783	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.notifications (id, production_log_id, operator_id, supervisor_id, message, is_acknowledged, acknowledged_at, created_at) FROM stdin;
\.


--
-- Data for Name: operation_status; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.operation_status (id, order_id, part_id, operation_id, status, started_at, completed_at, created_at, updated_at, operator_id) FROM stdin;
\.


--
-- Data for Name: order_schedule_status; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.order_schedule_status (id, order_id, product_id, active_parts_count, active_inhouse_parts, status, activated_at, updated_at) FROM stdin;
25	32	14	5	5	active	2026-05-27 12:19:42.145957	2026-05-27 12:19:42.145957
26	30	15	1	1	active	2026-05-29 12:18:28.15314	2026-05-29 12:18:27.459646
30	113	60	0	0	inactive	\N	2026-05-13 10:08:14.399498
28	114	61	0	0	inactive	\N	2026-05-13 12:51:04.022083
29	95	47	0	0	inactive	\N	2026-05-13 11:28:24.163637
\.


--
-- Data for Name: part_schedule_status; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.part_schedule_status (id, part_id, sale_order_id, status, start_date, created_at, updated_at) FROM stdin;
117	1434	113	inactive	\N	2026-04-13 10:08:28.535062	2026-04-13 10:10:05.59696
133	1515	30	inactive	\N	2026-05-18 10:23:50.826551	2026-05-27 12:13:32.945114
17	26	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
20	34	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
22	36	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
23	37	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
118	1433	113	inactive	\N	2026-04-13 10:13:32.36316	2026-05-13 10:08:15.411888
120	1440	114	inactive	\N	2026-04-15 09:28:31.952012	2026-05-13 11:54:38.27133
121	1447	114	inactive	\N	2026-04-16 15:53:07.746153	2026-05-13 11:54:38.27133
127	1480	114	inactive	\N	2026-05-08 13:13:26.249317	2026-05-13 11:54:38.27133
128	1479	114	inactive	\N	2026-05-08 13:13:26.249317	2026-05-13 11:54:38.27133
129	1481	114	inactive	\N	2026-05-08 13:13:26.249317	2026-05-13 11:54:38.27133
131	1496	114	inactive	\N	2026-05-13 11:50:26.133454	2026-05-13 11:54:38.27133
24	38	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
25	39	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
26	40	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
27	41	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
28	42	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
29	43	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
30	44	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
31	45	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
32	46	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
33	48	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
34	47	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
35	49	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
36	50	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
37	51	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
38	52	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
39	53	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
42	57	32	inactive	\N	2026-02-26 15:13:23.124205	2026-05-27 12:15:57.754201
104	214	32	inactive	\N	2026-03-26 11:52:04.376387	2026-05-27 12:15:57.754201
15	24	32	active	2026-05-27 12:19:42.145957	2026-02-26 15:13:23.124205	2026-05-27 12:19:42.145957
16	25	32	active	2026-05-27 12:19:42.145957	2026-02-26 15:13:23.124205	2026-05-27 12:19:42.145957
18	28	32	active	2026-05-27 12:19:42.145957	2026-02-26 15:13:23.124205	2026-05-27 12:19:42.145957
19	33	32	active	2026-05-27 12:19:42.145957	2026-02-26 15:13:23.124205	2026-05-27 12:19:42.145957
21	35	32	active	2026-05-27 12:19:42.145957	2026-02-26 15:13:23.124205	2026-05-27 12:19:42.145957
123	1472	114	inactive	\N	2026-04-24 18:32:08.700396	2026-05-13 12:49:59.908566
119	1439	114	inactive	\N	2026-04-13 15:20:42.72154	2026-05-13 12:51:05.013796
135	1519	30	active	2026-05-29 12:18:28.15314	2026-05-22 09:50:29.257839	2026-05-29 12:18:28.15314
115	1409	95	inactive	\N	2026-04-06 15:49:22.013971	2026-05-13 11:28:24.163637
\.


--
-- Data for Name: planned_schedule_items; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.planned_schedule_items (id, part_id, part_number, sale_order_id, sale_order_number, operation_id, machine_id, planned_start_time, planned_end_time, total_quantity, remaining_quantity, status, created_at, schedule_history_id) FROM stdin;
17649	28	005	32	89	54	13	2026-06-12 08:30:00	2026-06-12 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17650	28	005	32	89	54	13	2026-06-15 08:30:00	2026-06-15 10:40:00	1	0	pending	2026-05-29 14:15:34.373024	509
17651	28	005	32	89	55	32	2026-06-15 10:40:00	2026-06-15 12:50:00	1	0	pending	2026-05-29 14:15:34.373024	509
17652	33	001	32	89	15	23	2026-05-27 12:19:42.145957	2026-05-27 16:19:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17653	33	001	32	89	16	36	2026-05-27 16:19:42.145957	2026-05-27 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17654	33	001	32	89	16	36	2026-05-28 08:30:00	2026-05-28 09:49:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17655	35	ASS1 - 01-06	32	89	56	14	2026-05-29 15:44:42.145957	2026-05-29 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17656	35	ASS1 - 01-06	32	89	56	14	2026-06-01 08:30:00	2026-06-01 10:44:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17657	35	ASS1 - 01-06	32	89	351	\N	2026-05-26 09:18:54	2026-05-29 09:18:54	1	0	outsource_pending	2026-05-29 14:15:34.373024	509
17658	35	ASS1 - 01-06	32	89	461	36	2026-05-29 09:18:54	2026-05-29 13:58:54	1	0	pending	2026-05-29 14:15:34.373024	509
17659	1519	0003-3	30	SAMPLE-001	454	33	2026-05-29 12:18:28.15314	2026-05-29 12:27:38.15314	1	0	pending	2026-05-29 14:15:34.373024	509
17660	1519	0003-3	30	SAMPLE-001	470	33	2026-05-29 12:27:38.15314	2026-05-29 12:34:45.15314	1	0	pending	2026-05-29 14:15:34.373024	509
17618	25	003	32	89	19	24	2026-05-27 12:19:42.145957	2026-05-27 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17619	25	003	32	89	19	24	2026-05-28 08:30:00	2026-05-28 08:34:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17620	25	003	32	89	21	24	2026-05-28 08:34:42.145957	2026-05-28 12:14:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17621	25	003	32	89	22	14	2026-05-28 12:14:42.145957	2026-05-28 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17622	25	003	32	89	22	14	2026-05-29 08:30:00	2026-05-29 15:44:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17623	25	003	32	89	23	32	2026-05-29 15:44:42.145957	2026-05-29 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17624	25	003	32	89	23	32	2026-06-01 08:30:00	2026-06-01 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17625	25	003	32	89	23	32	2026-06-02 08:30:00	2026-06-02 13:14:42.145957	1	0	pending	2026-05-29 14:15:34.373024	509
17626	24	002	32	89	17	26	2026-05-27 12:19:42.145957	2026-05-27 16:19:42.145957	10	9	pending	2026-05-29 14:15:34.373024	509
17627	24	002	32	89	17	26	2026-05-27 16:19:42.145957	2026-05-27 17:00:00	10	9	pending	2026-05-29 14:15:34.373024	509
17628	24	002	32	89	17	26	2026-05-28 08:30:00	2026-05-28 15:29:42.145957	10	7	pending	2026-05-29 14:15:34.373024	509
17629	24	002	32	89	17	26	2026-05-28 15:29:42.145957	2026-05-28 17:00:00	10	7	pending	2026-05-29 14:15:34.373024	509
17630	24	002	32	89	17	26	2026-05-29 08:30:00	2026-05-29 14:39:42.145957	10	5	pending	2026-05-29 14:15:34.373024	509
17631	24	002	32	89	17	26	2026-05-29 14:39:42.145957	2026-05-29 17:00:00	10	5	pending	2026-05-29 14:15:34.373024	509
17632	24	002	32	89	17	26	2026-06-01 08:30:00	2026-06-01 13:49:42.145957	10	3	pending	2026-05-29 14:15:34.373024	509
17633	24	002	32	89	17	26	2026-06-01 13:49:42.145957	2026-06-01 17:00:00	10	3	pending	2026-05-29 14:15:34.373024	509
17634	24	002	32	89	17	26	2026-06-02 08:30:00	2026-06-02 16:49:42.145957	10	0	pending	2026-05-29 14:15:34.373024	509
17635	24	002	32	89	18	13	2026-06-03 08:30:00	2026-06-03 16:18:00	10	8	pending	2026-05-29 14:15:34.373024	509
17636	24	002	32	89	18	13	2026-06-03 16:18:00	2026-06-03 17:00:00	10	8	pending	2026-05-29 14:15:34.373024	509
17637	24	002	32	89	18	13	2026-06-04 08:30:00	2026-06-04 15:24:00	10	6	pending	2026-05-29 14:15:34.373024	509
17638	24	002	32	89	18	13	2026-06-04 15:24:00	2026-06-04 17:00:00	10	6	pending	2026-05-29 14:15:34.373024	509
17639	24	002	32	89	18	13	2026-06-05 08:30:00	2026-06-05 14:30:00	10	4	pending	2026-05-29 14:15:34.373024	509
17640	24	002	32	89	18	13	2026-06-05 14:30:00	2026-06-05 17:00:00	10	4	pending	2026-05-29 14:15:34.373024	509
17641	24	002	32	89	18	13	2026-06-08 08:30:00	2026-06-08 13:36:00	10	2	pending	2026-05-29 14:15:34.373024	509
17642	24	002	32	89	18	13	2026-06-08 13:36:00	2026-06-08 17:00:00	10	2	pending	2026-05-29 14:15:34.373024	509
17643	24	002	32	89	18	13	2026-06-09 08:30:00	2026-06-09 12:42:00	10	0	pending	2026-05-29 14:15:34.373024	509
17644	28	005	32	89	51	26	2026-06-03 08:30:00	2026-06-03 08:49:45	1	0	pending	2026-05-29 14:15:34.373024	509
17645	28	005	32	89	52	13	2026-06-09 12:42:00	2026-06-09 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17646	28	005	32	89	52	13	2026-06-10 08:30:00	2026-06-10 14:52:00	1	0	pending	2026-05-29 14:15:34.373024	509
17647	28	005	32	89	53	13	2026-06-10 14:52:00	2026-06-10 17:00:00	1	1	pending	2026-05-29 14:15:34.373024	509
17648	28	005	32	89	53	13	2026-06-11 08:30:00	2026-06-11 16:35:00	1	0	pending	2026-05-29 14:15:34.373024	509
\.


--
-- Data for Name: production_logs; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.production_logs (id, operation_id, operator_id, supervisor_id, notes, remarks, from_date, from_time, to_date, to_time, status, produced_quantity, approved_quantity, created_at, operator_status, supervisor_acknowledged, supervisor_acknowledged_at, rework_quantity, rejected_quantity, remaining_quantity_to_be_produced, operator_acknowledged, operator_acknowledged_at) FROM stdin;
321	454	12	30	done	ok	2026-05-29	14:46:35.281533	2026-05-29	15:02:49.447391	completed	1	1	2026-05-29 14:46:31.801435	completed	t	2026-05-29 15:03:51.43176	0	0	0	t	2026-05-29 15:10:13.923882
322	470	12	30	completed	\N	2026-05-29	15:10:33.13105	2026-05-29	15:20:32.399486	completed	1	1	2026-05-29 15:10:29.638303	completed	t	2026-05-29 15:20:42.68257	0	0	0	t	2026-05-29 15:21:04.336199
323	19	12	30	submitted	\N	2026-05-29	15:30:42.483516	2026-05-29	15:35:01.789781	inprogress	1	0	2026-05-29 15:30:39.021452	completed	t	2026-05-29 15:41:15.789728	1	0	1	t	2026-05-29 15:41:41.481284
324	19	12	30		\N	2026-05-29	15:41:52.346913	2026-05-29	15:42:28.199183	completed	1	1	2026-05-29 15:41:48.891858	completed	t	2026-05-29 15:43:03.211087	0	0	0	t	2026-05-29 15:43:50.743378
\.


--
-- Data for Name: rescheduling_items; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.rescheduling_items (id, order_id, order_number, part_id, part_number, operation_id, operation_number, machine_id, start_time, end_time, total_qty, completed_qty, remaining_qty, status, schedule_version) FROM stdin;
8194	32	89	24	002	17	10	26	2026-05-27 12:19:42.145957	2026-05-27 16:19:42.145957	10	0	9	rescheduled	5
8195	32	89	24	002	17	10	26	2026-05-27 16:19:42.145957	2026-05-27 17:00:00	10	0	9	rescheduled	5
8196	32	89	24	002	17	10	26	2026-05-28 08:30:00	2026-05-28 15:29:42.145957	10	0	7	rescheduled	5
8197	32	89	24	002	17	10	26	2026-05-28 15:29:42.145957	2026-05-28 17:00:00	10	0	7	rescheduled	5
8198	32	89	24	002	17	10	26	2026-05-29 08:30:00	2026-05-29 14:39:42.145957	10	0	5	rescheduled	5
8199	32	89	24	002	17	10	26	2026-05-29 14:39:42.145957	2026-05-29 17:00:00	10	0	5	rescheduled	5
8200	32	89	24	002	17	10	26	2026-06-01 08:30:00	2026-06-01 13:49:42.145957	10	0	3	rescheduled	5
8201	32	89	24	002	17	10	26	2026-06-01 13:49:42.145957	2026-06-01 17:00:00	10	0	3	rescheduled	5
8202	32	89	24	002	17	10	26	2026-06-02 08:30:00	2026-06-02 16:49:42.145957	10	0	0	rescheduled	5
8203	32	89	24	002	18	20	13	2026-06-03 08:30:00	2026-06-03 16:18:00	10	0	8	rescheduled	5
8204	32	89	24	002	18	20	13	2026-06-03 16:18:00	2026-06-03 17:00:00	10	0	8	rescheduled	5
8205	32	89	24	002	18	20	13	2026-06-04 08:30:00	2026-06-04 15:24:00	10	0	6	rescheduled	5
8206	32	89	24	002	18	20	13	2026-06-04 15:24:00	2026-06-04 17:00:00	10	0	6	rescheduled	5
8207	32	89	24	002	18	20	13	2026-06-05 08:30:00	2026-06-05 14:30:00	10	0	4	rescheduled	5
8208	32	89	24	002	18	20	13	2026-06-05 14:30:00	2026-06-05 17:00:00	10	0	4	rescheduled	5
8209	32	89	24	002	18	20	13	2026-06-08 08:30:00	2026-06-08 13:36:00	10	0	2	rescheduled	5
8210	32	89	24	002	18	20	13	2026-06-08 13:36:00	2026-06-08 17:00:00	10	0	2	rescheduled	5
8211	32	89	24	002	18	20	13	2026-06-09 08:30:00	2026-06-09 12:42:00	10	0	0	rescheduled	5
8212	32	89	25	003	21	30	24	2026-05-29 15:42:28.199183	2026-05-29 17:00:00	1	0	1	rescheduled	5
8213	32	89	25	003	21	30	24	2026-06-01 08:30:00	2026-06-01 10:52:28.199183	1	0	0	rescheduled	5
8214	32	89	25	003	22	40	14	2026-06-01 10:52:28.199183	2026-06-01 17:00:00	1	0	1	rescheduled	5
8215	32	89	25	003	22	40	14	2026-06-02 08:30:00	2026-06-02 14:22:28.199183	1	0	0	rescheduled	5
8216	32	89	25	003	23	50	32	2026-06-02 14:22:28.199183	2026-06-02 17:00:00	1	0	1	rescheduled	5
8217	32	89	25	003	23	50	32	2026-06-03 08:30:00	2026-06-03 17:00:00	1	0	1	rescheduled	5
8218	32	89	25	003	23	50	32	2026-06-04 08:30:00	2026-06-04 11:52:28.199183	1	0	0	rescheduled	5
8219	32	89	28	005	51	10	26	2026-06-03 08:30:00	2026-06-03 08:49:45	1	0	0	rescheduled	5
8220	32	89	28	005	52	20	13	2026-06-09 12:42:00	2026-06-09 17:00:00	1	0	1	rescheduled	5
8221	32	89	28	005	52	20	13	2026-06-10 08:30:00	2026-06-10 14:52:00	1	0	0	rescheduled	5
8222	32	89	28	005	53	30	13	2026-06-10 14:52:00	2026-06-10 17:00:00	1	0	1	rescheduled	5
8223	32	89	28	005	53	30	13	2026-06-11 08:30:00	2026-06-11 16:35:00	1	0	0	rescheduled	5
8224	32	89	28	005	54	40	13	2026-06-12 08:30:00	2026-06-12 17:00:00	1	0	1	rescheduled	5
8225	32	89	28	005	54	40	13	2026-06-15 08:30:00	2026-06-15 10:40:00	1	0	0	rescheduled	5
8226	32	89	28	005	55	50	32	2026-06-15 10:40:00	2026-06-15 12:50:00	1	0	0	rescheduled	5
8227	32	89	33	001	15	10	23	2026-05-27 12:19:42.145957	2026-05-27 16:19:42.145957	1	0	0	rescheduled	5
8228	32	89	33	001	16	20	36	2026-05-27 16:19:42.145957	2026-05-27 17:00:00	1	0	1	rescheduled	5
8229	32	89	33	001	16	20	36	2026-05-28 08:30:00	2026-05-28 09:49:42.145957	1	0	0	rescheduled	5
8230	32	89	35	ASS1 - 01-06	56	10	14	2026-06-02 14:22:28.199183	2026-06-02 17:00:00	1	0	1	rescheduled	5
8231	32	89	35	ASS1 - 01-06	56	10	14	2026-06-03 08:30:00	2026-06-03 09:22:28.199183	1	0	0	rescheduled	5
8232	32	89	35	ASS1 - 01-06	351	20	\N	2026-05-26 09:18:54	2026-05-29 09:18:54	1	0	1	rescheduled	5
8233	32	89	35	ASS1 - 01-06	461	30	36	2026-05-29 09:18:54	2026-05-29 13:58:54	1	0	0	rescheduled	5
\.


--
-- Data for Name: schedule_history; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.schedule_history (id, version, is_active, generated_at, message) FROM stdin;
509	1	t	2026-05-29 14:15:37.845443	\N
\.


--
-- Data for Name: shift_hours_configuration; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.shift_hours_configuration (id, date, working_day, number_of_shifts) FROM stdin;
5	2026-01-05	t	1
6	2026-01-06	t	1
7	2026-01-07	t	1
8	2026-01-08	t	1
9	2026-01-09	t	1
1827	2026-04-01	t	1
12	2026-01-12	t	1
13	2026-01-13	t	1
14	2026-01-14	t	1
15	2026-01-15	t	1
16	2026-01-16	t	1
19	2026-01-19	t	1
20	2026-01-20	t	1
21	2026-01-21	t	1
22	2026-01-22	t	1
23	2026-01-23	t	1
45	2026-02-14	f	0
26	2026-01-26	t	1
27	2026-01-27	t	1
28	2026-01-28	t	1
29	2026-01-29	t	1
30	2026-01-30	t	1
1	2026-01-01	t	1
87	2026-03-28	f	0
34	2026-02-03	t	1
36	2026-02-05	t	1
86	2026-03-27	t	1
64	2026-03-05	t	1
40	2026-02-09	t	1
41	2026-02-10	t	1
37	2026-02-06	t	1
35	2026-02-04	t	1
44	2026-02-13	t	1
47	2026-02-16	t	1
49	2026-02-18	t	1
50	2026-02-19	t	1
51	2026-02-20	t	1
48	2026-02-17	t	1
2	2026-01-02	t	1
54	2026-02-23	t	1
55	2026-02-24	t	1
56	2026-02-25	t	1
57	2026-02-26	t	1
58	2026-02-27	t	1
61	2026-03-02	t	1
62	2026-03-03	t	1
63	2026-03-04	t	1
68	2026-03-09	t	1
70	2026-03-11	t	1
71	2026-03-12	t	1
72	2026-03-13	t	1
33	2026-02-02	t	1
76	2026-03-17	t	1
75	2026-03-16	t	1
77	2026-03-18	t	1
79	2026-03-20	t	1
43	2026-02-12	t	1
78	2026-03-19	t	1
82	2026-03-23	t	1
84	2026-03-25	t	1
85	2026-03-26	t	1
89	2026-03-30	t	1
90	2026-03-31	t	1
92	2026-04-02	t	1
83	2026-03-24	t	1
97	2026-04-07	t	1
98	2026-04-08	t	1
65	2026-03-06	t	1
99	2026-04-09	t	1
103	2026-04-13	t	1
104	2026-04-14	t	1
105	2026-04-15	t	1
106	2026-04-16	t	1
107	2026-04-17	t	1
69	2026-03-10	t	1
110	2026-04-20	t	1
111	2026-04-21	t	1
112	2026-04-22	t	1
113	2026-04-23	t	1
114	2026-04-24	t	1
96	2026-04-06	t	1
117	2026-04-27	t	1
118	2026-04-28	t	1
121	2026-05-01	t	1
122	2026-05-02	f	0
125	2026-05-05	t	1
127	2026-05-07	t	1
128	2026-05-08	t	1
100	2026-04-10	t	1
131	2026-05-11	t	1
132	2026-05-12	t	1
133	2026-05-13	t	1
134	2026-05-14	t	1
135	2026-05-15	t	1
93	2026-04-03	t	1
142	2026-05-22	t	1
147	2026-05-27	t	1
148	2026-05-28	t	1
149	2026-05-29	t	1
120	2026-04-30	t	1
152	2026-06-01	t	1
153	2026-06-02	t	1
154	2026-06-03	t	1
155	2026-06-04	t	1
156	2026-06-05	t	1
159	2026-06-08	t	1
160	2026-06-09	t	1
161	2026-06-10	t	1
162	2026-06-11	t	1
163	2026-06-12	t	1
166	2026-06-15	t	1
167	2026-06-16	t	1
168	2026-06-17	t	1
169	2026-06-18	t	1
170	2026-06-19	t	1
173	2026-06-22	t	1
174	2026-06-23	t	1
175	2026-06-24	t	1
176	2026-06-25	t	1
177	2026-06-26	t	1
180	2026-06-29	t	1
181	2026-06-30	t	1
183	2026-07-02	t	1
184	2026-07-03	t	1
187	2026-07-06	t	1
188	2026-07-07	t	1
189	2026-07-08	t	1
190	2026-07-09	t	1
191	2026-07-10	t	1
194	2026-07-13	t	1
195	2026-07-14	t	1
196	2026-07-15	t	1
197	2026-07-16	t	1
198	2026-07-17	t	1
201	2026-07-20	t	1
202	2026-07-21	t	1
203	2026-07-22	t	1
204	2026-07-23	t	1
205	2026-07-24	t	1
208	2026-07-27	t	1
209	2026-07-28	t	1
210	2026-07-29	t	1
211	2026-07-30	t	1
212	2026-07-31	t	1
215	2026-08-03	t	1
216	2026-08-04	t	1
217	2026-08-05	t	1
218	2026-08-06	t	1
219	2026-08-07	t	1
222	2026-08-10	t	1
223	2026-08-11	t	1
224	2026-08-12	t	1
225	2026-08-13	t	1
226	2026-08-14	t	1
229	2026-08-17	t	1
230	2026-08-18	t	1
231	2026-08-19	t	1
232	2026-08-20	t	1
233	2026-08-21	t	1
236	2026-08-24	t	1
237	2026-08-25	t	1
238	2026-08-26	t	1
239	2026-08-27	t	1
240	2026-08-28	t	1
243	2026-08-31	t	1
244	2026-09-01	t	1
245	2026-09-02	t	1
246	2026-09-03	t	1
247	2026-09-04	t	1
250	2026-09-07	t	1
251	2026-09-08	t	1
252	2026-09-09	t	1
253	2026-09-10	t	1
254	2026-09-11	t	1
182	2026-07-01	t	2
3	2026-01-03	t	2
124	2026-05-04	t	1
126	2026-05-06	t	1
146	2026-05-26	t	1
140	2026-05-20	t	2
141	2026-05-21	t	2
138	2026-05-18	t	2
145	2026-05-25	t	1
257	2026-09-14	t	1
258	2026-09-15	t	1
259	2026-09-16	t	1
260	2026-09-17	t	1
261	2026-09-18	t	1
264	2026-09-21	t	1
265	2026-09-22	t	1
266	2026-09-23	t	1
267	2026-09-24	t	1
268	2026-09-25	t	1
271	2026-09-28	t	1
272	2026-09-29	t	1
273	2026-09-30	t	1
274	2026-10-01	t	1
275	2026-10-02	t	1
278	2026-10-05	t	1
279	2026-10-06	t	1
280	2026-10-07	t	1
281	2026-10-08	t	1
282	2026-10-09	t	1
285	2026-10-12	t	1
286	2026-10-13	t	1
287	2026-10-14	t	1
288	2026-10-15	t	1
289	2026-10-16	t	1
292	2026-10-19	t	1
293	2026-10-20	t	1
294	2026-10-21	t	1
295	2026-10-22	t	1
296	2026-10-23	t	1
299	2026-10-26	t	1
300	2026-10-27	t	1
301	2026-10-28	t	1
302	2026-10-29	t	1
303	2026-10-30	t	1
306	2026-11-02	t	1
307	2026-11-03	t	1
308	2026-11-04	t	1
309	2026-11-05	t	1
310	2026-11-06	t	1
313	2026-11-09	t	1
314	2026-11-10	t	1
315	2026-11-11	t	1
316	2026-11-12	t	1
317	2026-11-13	t	1
320	2026-11-16	t	1
321	2026-11-17	t	1
322	2026-11-18	t	1
323	2026-11-19	t	1
324	2026-11-20	t	1
327	2026-11-23	t	1
328	2026-11-24	t	1
329	2026-11-25	t	1
330	2026-11-26	t	1
331	2026-11-27	t	1
334	2026-11-30	t	1
335	2026-12-01	t	1
336	2026-12-02	t	1
337	2026-12-03	t	1
338	2026-12-04	t	1
341	2026-12-07	t	1
342	2026-12-08	t	1
343	2026-12-09	t	1
344	2026-12-10	t	1
345	2026-12-11	t	1
348	2026-12-14	t	1
349	2026-12-15	t	1
350	2026-12-16	t	1
351	2026-12-17	t	1
352	2026-12-18	t	1
355	2026-12-21	t	1
356	2026-12-22	t	1
357	2026-12-23	t	1
358	2026-12-24	t	1
359	2026-12-25	t	1
362	2026-12-28	t	1
363	2026-12-29	t	1
364	2026-12-30	t	1
365	2026-12-31	t	1
366	2027-01-01	t	1
369	2027-01-04	t	1
370	2027-01-05	t	1
371	2027-01-06	t	1
372	2027-01-07	t	1
373	2027-01-08	t	1
376	2027-01-11	t	1
377	2027-01-12	t	1
378	2027-01-13	t	1
379	2027-01-14	t	1
380	2027-01-15	t	1
492	2027-05-07	t	1
383	2027-01-18	t	1
384	2027-01-19	t	1
385	2027-01-20	t	1
386	2027-01-21	t	1
387	2027-01-22	t	1
390	2027-01-25	t	1
391	2027-01-26	t	1
392	2027-01-27	t	1
393	2027-01-28	t	1
394	2027-01-29	t	1
397	2027-02-01	t	1
398	2027-02-02	t	1
399	2027-02-03	t	1
400	2027-02-04	t	1
401	2027-02-05	t	1
404	2027-02-08	t	1
405	2027-02-09	t	1
406	2027-02-10	t	1
407	2027-02-11	t	1
408	2027-02-12	t	1
411	2027-02-15	t	1
412	2027-02-16	t	1
413	2027-02-17	t	1
414	2027-02-18	t	1
415	2027-02-19	t	1
418	2027-02-22	t	1
419	2027-02-23	t	1
420	2027-02-24	t	1
421	2027-02-25	t	1
422	2027-02-26	t	1
425	2027-03-01	t	1
426	2027-03-02	t	1
427	2027-03-03	t	1
428	2027-03-04	t	1
429	2027-03-05	t	1
432	2027-03-08	t	1
433	2027-03-09	t	1
434	2027-03-10	t	1
435	2027-03-11	t	1
436	2027-03-12	t	1
439	2027-03-15	t	1
440	2027-03-16	t	1
441	2027-03-17	t	1
442	2027-03-18	t	1
443	2027-03-19	t	1
446	2027-03-22	t	1
447	2027-03-23	t	1
448	2027-03-24	t	1
449	2027-03-25	t	1
450	2027-03-26	t	1
453	2027-03-29	t	1
454	2027-03-30	t	1
455	2027-03-31	t	1
456	2027-04-01	t	1
457	2027-04-02	t	1
460	2027-04-05	t	1
461	2027-04-06	t	1
462	2027-04-07	t	1
463	2027-04-08	t	1
464	2027-04-09	t	1
467	2027-04-12	t	1
468	2027-04-13	t	1
469	2027-04-14	t	1
470	2027-04-15	t	1
471	2027-04-16	t	1
474	2027-04-19	t	1
475	2027-04-20	t	1
476	2027-04-21	t	1
477	2027-04-22	t	1
478	2027-04-23	t	1
481	2027-04-26	t	1
482	2027-04-27	t	1
483	2027-04-28	t	1
484	2027-04-29	t	1
485	2027-04-30	t	1
488	2027-05-03	t	1
489	2027-05-04	t	1
490	2027-05-05	t	1
491	2027-05-06	t	1
495	2027-05-10	t	1
496	2027-05-11	t	1
497	2027-05-12	t	1
498	2027-05-13	t	1
499	2027-05-14	t	1
502	2027-05-17	t	1
503	2027-05-18	t	1
504	2027-05-19	t	1
505	2027-05-20	t	1
506	2027-05-21	t	1
509	2027-05-24	t	1
510	2027-05-25	t	1
511	2027-05-26	t	1
512	2027-05-27	t	1
513	2027-05-28	t	1
516	2027-05-31	t	1
517	2027-06-01	t	1
518	2027-06-02	t	1
519	2027-06-03	t	1
520	2027-06-04	t	1
523	2027-06-07	t	1
524	2027-06-08	t	1
525	2027-06-09	t	1
526	2027-06-10	t	1
527	2027-06-11	t	1
530	2027-06-14	t	1
531	2027-06-15	t	1
532	2027-06-16	t	1
533	2027-06-17	t	1
534	2027-06-18	t	1
537	2027-06-21	t	1
538	2027-06-22	t	1
539	2027-06-23	t	1
540	2027-06-24	t	1
541	2027-06-25	t	1
544	2027-06-28	t	1
545	2027-06-29	t	1
546	2027-06-30	t	1
547	2027-07-01	t	1
548	2027-07-02	t	1
551	2027-07-05	t	1
552	2027-07-06	t	1
553	2027-07-07	t	1
554	2027-07-08	t	1
555	2027-07-09	t	1
558	2027-07-12	t	1
559	2027-07-13	t	1
560	2027-07-14	t	1
561	2027-07-15	t	1
562	2027-07-16	t	1
565	2027-07-19	t	1
566	2027-07-20	t	1
567	2027-07-21	t	1
568	2027-07-22	t	1
569	2027-07-23	t	1
572	2027-07-26	t	1
573	2027-07-27	t	1
574	2027-07-28	t	1
575	2027-07-29	t	1
576	2027-07-30	t	1
579	2027-08-02	t	1
580	2027-08-03	t	1
581	2027-08-04	t	1
582	2027-08-05	t	1
583	2027-08-06	t	1
586	2027-08-09	t	1
587	2027-08-10	t	1
588	2027-08-11	t	1
589	2027-08-12	t	1
590	2027-08-13	t	1
593	2027-08-16	t	1
594	2027-08-17	t	1
595	2027-08-18	t	1
596	2027-08-19	t	1
597	2027-08-20	t	1
600	2027-08-23	t	1
601	2027-08-24	t	1
602	2027-08-25	t	1
603	2027-08-26	t	1
604	2027-08-27	t	1
607	2027-08-30	t	1
608	2027-08-31	t	1
609	2027-09-01	t	1
610	2027-09-02	t	1
611	2027-09-03	t	1
614	2027-09-06	t	1
615	2027-09-07	t	1
616	2027-09-08	t	1
617	2027-09-09	t	1
618	2027-09-10	t	1
621	2027-09-13	t	1
622	2027-09-14	t	1
623	2027-09-15	t	1
624	2027-09-16	t	1
625	2027-09-17	t	1
628	2027-09-20	t	1
629	2027-09-21	t	1
630	2027-09-22	t	1
631	2027-09-23	t	1
632	2027-09-24	t	1
635	2027-09-27	t	1
636	2027-09-28	t	1
637	2027-09-29	t	1
638	2027-09-30	t	1
639	2027-10-01	t	1
642	2027-10-04	t	1
643	2027-10-05	t	1
644	2027-10-06	t	1
645	2027-10-07	t	1
646	2027-10-08	t	1
649	2027-10-11	t	1
650	2027-10-12	t	1
651	2027-10-13	t	1
652	2027-10-14	t	1
653	2027-10-15	t	1
656	2027-10-18	t	1
657	2027-10-19	t	1
658	2027-10-20	t	1
659	2027-10-21	t	1
660	2027-10-22	t	1
663	2027-10-25	t	1
664	2027-10-26	t	1
665	2027-10-27	t	1
666	2027-10-28	t	1
667	2027-10-29	t	1
670	2027-11-01	t	1
671	2027-11-02	t	1
672	2027-11-03	t	1
673	2027-11-04	t	1
674	2027-11-05	t	1
677	2027-11-08	t	1
678	2027-11-09	t	1
679	2027-11-10	t	1
680	2027-11-11	t	1
681	2027-11-12	t	1
684	2027-11-15	t	1
685	2027-11-16	t	1
686	2027-11-17	t	1
687	2027-11-18	t	1
688	2027-11-19	t	1
691	2027-11-22	t	1
692	2027-11-23	t	1
693	2027-11-24	t	1
694	2027-11-25	t	1
695	2027-11-26	t	1
698	2027-11-29	t	1
699	2027-11-30	t	1
700	2027-12-01	t	1
701	2027-12-02	t	1
702	2027-12-03	t	1
705	2027-12-06	t	1
706	2027-12-07	t	1
707	2027-12-08	t	1
708	2027-12-09	t	1
709	2027-12-10	t	1
712	2027-12-13	t	1
713	2027-12-14	t	1
714	2027-12-15	t	1
715	2027-12-16	t	1
716	2027-12-17	t	1
719	2027-12-20	t	1
720	2027-12-21	t	1
721	2027-12-22	t	1
722	2027-12-23	t	1
723	2027-12-24	t	1
726	2027-12-27	t	1
727	2027-12-28	t	1
728	2027-12-29	t	1
729	2027-12-30	t	1
730	2027-12-31	t	1
733	2028-01-03	t	1
734	2028-01-04	t	1
735	2028-01-05	t	1
736	2028-01-06	t	1
737	2028-01-07	t	1
740	2028-01-10	t	1
741	2028-01-11	t	1
742	2028-01-12	t	1
743	2028-01-13	t	1
744	2028-01-14	t	1
747	2028-01-17	t	1
748	2028-01-18	t	1
749	2028-01-19	t	1
750	2028-01-20	t	1
751	2028-01-21	t	1
754	2028-01-24	t	1
755	2028-01-25	t	1
756	2028-01-26	t	1
757	2028-01-27	t	1
758	2028-01-28	t	1
761	2028-01-31	t	1
762	2028-02-01	t	1
763	2028-02-02	t	1
764	2028-02-03	t	1
765	2028-02-04	t	1
768	2028-02-07	t	1
769	2028-02-08	t	1
770	2028-02-09	t	1
771	2028-02-10	t	1
772	2028-02-11	t	1
775	2028-02-14	t	1
776	2028-02-15	t	1
777	2028-02-16	t	1
778	2028-02-17	t	1
779	2028-02-18	t	1
782	2028-02-21	t	1
783	2028-02-22	t	1
784	2028-02-23	t	1
785	2028-02-24	t	1
786	2028-02-25	t	1
789	2028-02-28	t	1
790	2028-02-29	t	1
791	2028-03-01	t	1
792	2028-03-02	t	1
793	2028-03-03	t	1
796	2028-03-06	t	1
797	2028-03-07	t	1
798	2028-03-08	t	1
799	2028-03-09	t	1
800	2028-03-10	t	1
803	2028-03-13	t	1
804	2028-03-14	t	1
805	2028-03-15	t	1
806	2028-03-16	t	1
807	2028-03-17	t	1
810	2028-03-20	t	1
811	2028-03-21	t	1
812	2028-03-22	t	1
813	2028-03-23	t	1
814	2028-03-24	t	1
817	2028-03-27	t	1
818	2028-03-28	t	1
819	2028-03-29	t	1
820	2028-03-30	t	1
821	2028-03-31	t	1
824	2028-04-03	t	1
825	2028-04-04	t	1
826	2028-04-05	t	1
827	2028-04-06	t	1
828	2028-04-07	t	1
831	2028-04-10	t	1
832	2028-04-11	t	1
833	2028-04-12	t	1
834	2028-04-13	t	1
835	2028-04-14	t	1
838	2028-04-17	t	1
839	2028-04-18	t	1
840	2028-04-19	t	1
841	2028-04-20	t	1
842	2028-04-21	t	1
845	2028-04-24	t	1
846	2028-04-25	t	1
847	2028-04-26	t	1
848	2028-04-27	t	1
849	2028-04-28	t	1
852	2028-05-01	t	1
853	2028-05-02	t	1
854	2028-05-03	t	1
855	2028-05-04	t	1
856	2028-05-05	t	1
859	2028-05-08	t	1
860	2028-05-09	t	1
861	2028-05-10	t	1
862	2028-05-11	t	1
863	2028-05-12	t	1
866	2028-05-15	t	1
867	2028-05-16	t	1
868	2028-05-17	t	1
869	2028-05-18	t	1
870	2028-05-19	t	1
873	2028-05-22	t	1
874	2028-05-23	t	1
875	2028-05-24	t	1
876	2028-05-25	t	1
877	2028-05-26	t	1
880	2028-05-29	t	1
881	2028-05-30	t	1
882	2028-05-31	t	1
883	2028-06-01	t	1
884	2028-06-02	t	1
887	2028-06-05	t	1
888	2028-06-06	t	1
889	2028-06-07	t	1
890	2028-06-08	t	1
891	2028-06-09	t	1
894	2028-06-12	t	1
895	2028-06-13	t	1
896	2028-06-14	t	1
897	2028-06-15	t	1
898	2028-06-16	t	1
901	2028-06-19	t	1
902	2028-06-20	t	1
903	2028-06-21	t	1
904	2028-06-22	t	1
905	2028-06-23	t	1
908	2028-06-26	t	1
909	2028-06-27	t	1
910	2028-06-28	t	1
911	2028-06-29	t	1
912	2028-06-30	t	1
915	2028-07-03	t	1
916	2028-07-04	t	1
917	2028-07-05	t	1
918	2028-07-06	t	1
919	2028-07-07	t	1
922	2028-07-10	t	1
923	2028-07-11	t	1
924	2028-07-12	t	1
925	2028-07-13	t	1
926	2028-07-14	t	1
929	2028-07-17	t	1
930	2028-07-18	t	1
931	2028-07-19	t	1
932	2028-07-20	t	1
933	2028-07-21	t	1
936	2028-07-24	t	1
937	2028-07-25	t	1
938	2028-07-26	t	1
939	2028-07-27	t	1
940	2028-07-28	t	1
943	2028-07-31	t	1
944	2028-08-01	t	1
945	2028-08-02	t	1
946	2028-08-03	t	1
947	2028-08-04	t	1
950	2028-08-07	t	1
951	2028-08-08	t	1
952	2028-08-09	t	1
953	2028-08-10	t	1
954	2028-08-11	t	1
957	2028-08-14	t	1
958	2028-08-15	t	1
959	2028-08-16	t	1
960	2028-08-17	t	1
961	2028-08-18	t	1
964	2028-08-21	t	1
965	2028-08-22	t	1
966	2028-08-23	t	1
967	2028-08-24	t	1
968	2028-08-25	t	1
971	2028-08-28	t	1
972	2028-08-29	t	1
973	2028-08-30	t	1
974	2028-08-31	t	1
975	2028-09-01	t	1
978	2028-09-04	t	1
979	2028-09-05	t	1
980	2028-09-06	t	1
981	2028-09-07	t	1
982	2028-09-08	t	1
985	2028-09-11	t	1
986	2028-09-12	t	1
987	2028-09-13	t	1
988	2028-09-14	t	1
989	2028-09-15	t	1
992	2028-09-18	t	1
993	2028-09-19	t	1
994	2028-09-20	t	1
995	2028-09-21	t	1
996	2028-09-22	t	1
999	2028-09-25	t	1
1000	2028-09-26	t	1
1001	2028-09-27	t	1
1002	2028-09-28	t	1
1003	2028-09-29	t	1
1006	2028-10-02	t	1
1007	2028-10-03	t	1
1008	2028-10-04	t	1
1009	2028-10-05	t	1
1010	2028-10-06	t	1
1013	2028-10-09	t	1
1014	2028-10-10	t	1
1015	2028-10-11	t	1
1016	2028-10-12	t	1
1017	2028-10-13	t	1
1020	2028-10-16	t	1
1021	2028-10-17	t	1
1022	2028-10-18	t	1
1023	2028-10-19	t	1
1024	2028-10-20	t	1
1027	2028-10-23	t	1
1028	2028-10-24	t	1
1029	2028-10-25	t	1
1030	2028-10-26	t	1
1031	2028-10-27	t	1
1034	2028-10-30	t	1
1035	2028-10-31	t	1
1036	2028-11-01	t	1
1037	2028-11-02	t	1
1038	2028-11-03	t	1
1041	2028-11-06	t	1
1042	2028-11-07	t	1
1043	2028-11-08	t	1
1044	2028-11-09	t	1
1045	2028-11-10	t	1
1048	2028-11-13	t	1
1049	2028-11-14	t	1
1050	2028-11-15	t	1
1051	2028-11-16	t	1
1052	2028-11-17	t	1
1055	2028-11-20	t	1
1056	2028-11-21	t	1
1057	2028-11-22	t	1
1058	2028-11-23	t	1
1059	2028-11-24	t	1
1062	2028-11-27	t	1
1063	2028-11-28	t	1
1064	2028-11-29	t	1
1065	2028-11-30	t	1
1066	2028-12-01	t	1
1069	2028-12-04	t	1
1070	2028-12-05	t	1
1071	2028-12-06	t	1
1072	2028-12-07	t	1
1073	2028-12-08	t	1
1076	2028-12-11	t	1
1077	2028-12-12	t	1
1078	2028-12-13	t	1
1079	2028-12-14	t	1
1080	2028-12-15	t	1
1083	2028-12-18	t	1
1084	2028-12-19	t	1
1085	2028-12-20	t	1
1086	2028-12-21	t	1
1087	2028-12-22	t	1
1090	2028-12-25	t	1
1091	2028-12-26	t	1
1092	2028-12-27	t	1
1093	2028-12-28	t	1
1094	2028-12-29	t	1
1097	2029-01-01	t	1
1098	2029-01-02	t	1
1099	2029-01-03	t	1
1100	2029-01-04	t	1
1101	2029-01-05	t	1
1104	2029-01-08	t	1
1105	2029-01-09	t	1
1106	2029-01-10	t	1
1107	2029-01-11	t	1
1108	2029-01-12	t	1
1111	2029-01-15	t	1
1112	2029-01-16	t	1
1113	2029-01-17	t	1
1114	2029-01-18	t	1
1115	2029-01-19	t	1
1118	2029-01-22	t	1
1119	2029-01-23	t	1
1120	2029-01-24	t	1
1121	2029-01-25	t	1
1122	2029-01-26	t	1
1125	2029-01-29	t	1
1126	2029-01-30	t	1
1127	2029-01-31	t	1
1128	2029-02-01	t	1
1129	2029-02-02	t	1
1132	2029-02-05	t	1
1133	2029-02-06	t	1
1134	2029-02-07	t	1
1135	2029-02-08	t	1
1136	2029-02-09	t	1
1139	2029-02-12	t	1
1140	2029-02-13	t	1
1141	2029-02-14	t	1
1142	2029-02-15	t	1
1143	2029-02-16	t	1
1146	2029-02-19	t	1
1147	2029-02-20	t	1
1148	2029-02-21	t	1
1149	2029-02-22	t	1
1150	2029-02-23	t	1
1153	2029-02-26	t	1
1154	2029-02-27	t	1
1155	2029-02-28	t	1
1156	2029-03-01	t	1
1157	2029-03-02	t	1
1160	2029-03-05	t	1
1161	2029-03-06	t	1
1162	2029-03-07	t	1
1163	2029-03-08	t	1
1164	2029-03-09	t	1
1167	2029-03-12	t	1
1168	2029-03-13	t	1
1169	2029-03-14	t	1
1170	2029-03-15	t	1
1171	2029-03-16	t	1
1174	2029-03-19	t	1
1175	2029-03-20	t	1
1176	2029-03-21	t	1
1177	2029-03-22	t	1
1178	2029-03-23	t	1
1181	2029-03-26	t	1
1182	2029-03-27	t	1
1183	2029-03-28	t	1
1184	2029-03-29	t	1
1185	2029-03-30	t	1
1188	2029-04-02	t	1
1189	2029-04-03	t	1
1190	2029-04-04	t	1
1191	2029-04-05	t	1
1192	2029-04-06	t	1
1195	2029-04-09	t	1
1196	2029-04-10	t	1
1197	2029-04-11	t	1
1198	2029-04-12	t	1
1199	2029-04-13	t	1
1202	2029-04-16	t	1
1203	2029-04-17	t	1
1204	2029-04-18	t	1
1205	2029-04-19	t	1
1206	2029-04-20	t	1
1209	2029-04-23	t	1
1210	2029-04-24	t	1
1211	2029-04-25	t	1
1212	2029-04-26	t	1
1213	2029-04-27	t	1
1216	2029-04-30	t	1
1217	2029-05-01	t	1
1218	2029-05-02	t	1
1219	2029-05-03	t	1
1220	2029-05-04	t	1
1223	2029-05-07	t	1
1224	2029-05-08	t	1
1225	2029-05-09	t	1
1226	2029-05-10	t	1
1227	2029-05-11	t	1
1230	2029-05-14	t	1
1231	2029-05-15	t	1
1232	2029-05-16	t	1
1233	2029-05-17	t	1
1234	2029-05-18	t	1
1237	2029-05-21	t	1
1238	2029-05-22	t	1
1239	2029-05-23	t	1
1240	2029-05-24	t	1
1241	2029-05-25	t	1
1244	2029-05-28	t	1
1245	2029-05-29	t	1
1246	2029-05-30	t	1
1247	2029-05-31	t	1
1248	2029-06-01	t	1
1251	2029-06-04	t	1
1252	2029-06-05	t	1
1253	2029-06-06	t	1
1254	2029-06-07	t	1
1255	2029-06-08	t	1
1258	2029-06-11	t	1
1259	2029-06-12	t	1
1260	2029-06-13	t	1
1261	2029-06-14	t	1
1262	2029-06-15	t	1
1265	2029-06-18	t	1
1266	2029-06-19	t	1
1267	2029-06-20	t	1
1268	2029-06-21	t	1
1269	2029-06-22	t	1
1272	2029-06-25	t	1
1273	2029-06-26	t	1
1274	2029-06-27	t	1
1275	2029-06-28	t	1
1276	2029-06-29	t	1
1279	2029-07-02	t	1
1280	2029-07-03	t	1
1281	2029-07-04	t	1
1282	2029-07-05	t	1
1283	2029-07-06	t	1
1286	2029-07-09	t	1
1287	2029-07-10	t	1
1288	2029-07-11	t	1
1289	2029-07-12	t	1
1290	2029-07-13	t	1
1293	2029-07-16	t	1
1294	2029-07-17	t	1
1295	2029-07-18	t	1
1296	2029-07-19	t	1
1297	2029-07-20	t	1
1300	2029-07-23	t	1
1301	2029-07-24	t	1
1302	2029-07-25	t	1
1303	2029-07-26	t	1
1304	2029-07-27	t	1
1307	2029-07-30	t	1
1308	2029-07-31	t	1
1309	2029-08-01	t	1
1310	2029-08-02	t	1
1311	2029-08-03	t	1
1314	2029-08-06	t	1
1315	2029-08-07	t	1
1316	2029-08-08	t	1
1317	2029-08-09	t	1
1318	2029-08-10	t	1
1321	2029-08-13	t	1
1322	2029-08-14	t	1
1323	2029-08-15	t	1
1324	2029-08-16	t	1
1325	2029-08-17	t	1
1328	2029-08-20	t	1
1329	2029-08-21	t	1
1330	2029-08-22	t	1
1331	2029-08-23	t	1
1332	2029-08-24	t	1
1335	2029-08-27	t	1
1336	2029-08-28	t	1
1337	2029-08-29	t	1
1338	2029-08-30	t	1
1339	2029-08-31	t	1
1342	2029-09-03	t	1
1343	2029-09-04	t	1
1344	2029-09-05	t	1
1345	2029-09-06	t	1
1346	2029-09-07	t	1
1349	2029-09-10	t	1
1350	2029-09-11	t	1
1351	2029-09-12	t	1
1352	2029-09-13	t	1
1353	2029-09-14	t	1
1356	2029-09-17	t	1
1357	2029-09-18	t	1
1358	2029-09-19	t	1
1359	2029-09-20	t	1
1360	2029-09-21	t	1
1363	2029-09-24	t	1
1364	2029-09-25	t	1
1365	2029-09-26	t	1
1366	2029-09-27	t	1
1367	2029-09-28	t	1
1370	2029-10-01	t	1
1371	2029-10-02	t	1
1372	2029-10-03	t	1
1373	2029-10-04	t	1
1374	2029-10-05	t	1
1377	2029-10-08	t	1
1378	2029-10-09	t	1
1379	2029-10-10	t	1
1380	2029-10-11	t	1
1381	2029-10-12	t	1
1384	2029-10-15	t	1
1385	2029-10-16	t	1
1386	2029-10-17	t	1
1387	2029-10-18	t	1
1388	2029-10-19	t	1
1391	2029-10-22	t	1
1392	2029-10-23	t	1
1393	2029-10-24	t	1
1394	2029-10-25	t	1
1395	2029-10-26	t	1
1398	2029-10-29	t	1
1399	2029-10-30	t	1
1400	2029-10-31	t	1
1401	2029-11-01	t	1
1402	2029-11-02	t	1
1405	2029-11-05	t	1
1406	2029-11-06	t	1
1407	2029-11-07	t	1
1408	2029-11-08	t	1
1409	2029-11-09	t	1
1412	2029-11-12	t	1
1413	2029-11-13	t	1
1414	2029-11-14	t	1
1415	2029-11-15	t	1
1416	2029-11-16	t	1
1419	2029-11-19	t	1
1420	2029-11-20	t	1
1421	2029-11-21	t	1
1422	2029-11-22	t	1
1423	2029-11-23	t	1
1426	2029-11-26	t	1
1427	2029-11-27	t	1
1428	2029-11-28	t	1
1429	2029-11-29	t	1
1430	2029-11-30	t	1
1433	2029-12-03	t	1
1434	2029-12-04	t	1
1435	2029-12-05	t	1
1436	2029-12-06	t	1
1437	2029-12-07	t	1
1440	2029-12-10	t	1
1441	2029-12-11	t	1
1442	2029-12-12	t	1
1443	2029-12-13	t	1
1444	2029-12-14	t	1
1447	2029-12-17	t	1
1448	2029-12-18	t	1
1449	2029-12-19	t	1
1450	2029-12-20	t	1
1451	2029-12-21	t	1
1454	2029-12-24	t	1
1455	2029-12-25	t	1
1456	2029-12-26	t	1
1457	2029-12-27	t	1
1458	2029-12-28	t	1
1461	2029-12-31	t	1
1462	2030-01-01	t	1
1463	2030-01-02	t	1
1464	2030-01-03	t	1
1465	2030-01-04	t	1
1468	2030-01-07	t	1
1469	2030-01-08	t	1
1470	2030-01-09	t	1
1471	2030-01-10	t	1
1472	2030-01-11	t	1
1475	2030-01-14	t	1
1476	2030-01-15	t	1
1477	2030-01-16	t	1
1478	2030-01-17	t	1
1479	2030-01-18	t	1
1493	2030-02-01	f	0
1482	2030-01-21	t	1
1483	2030-01-22	t	1
1484	2030-01-23	t	1
1485	2030-01-24	t	1
1486	2030-01-25	t	1
1489	2030-01-28	t	1
1490	2030-01-29	t	1
1491	2030-01-30	t	1
1492	2030-01-31	t	1
1496	2030-02-04	t	1
1497	2030-02-05	t	1
1498	2030-02-06	t	1
1499	2030-02-07	t	1
1500	2030-02-08	t	1
1503	2030-02-11	t	1
1504	2030-02-12	t	1
1505	2030-02-13	t	1
1506	2030-02-14	t	1
1507	2030-02-15	t	1
1510	2030-02-18	t	1
1511	2030-02-19	t	1
1512	2030-02-20	t	1
1513	2030-02-21	t	1
1514	2030-02-22	t	1
1517	2030-02-25	t	1
1518	2030-02-26	t	1
1519	2030-02-27	t	1
1520	2030-02-28	t	1
1521	2030-03-01	t	1
1524	2030-03-04	t	1
1525	2030-03-05	t	1
1526	2030-03-06	t	1
1527	2030-03-07	t	1
1528	2030-03-08	t	1
1531	2030-03-11	t	1
1532	2030-03-12	t	1
1533	2030-03-13	t	1
1534	2030-03-14	t	1
1535	2030-03-15	t	1
1538	2030-03-18	t	1
1539	2030-03-19	t	1
1540	2030-03-20	t	1
1541	2030-03-21	t	1
1542	2030-03-22	t	1
1545	2030-03-25	t	1
1546	2030-03-26	t	1
1547	2030-03-27	t	1
1548	2030-03-28	t	1
1549	2030-03-29	t	1
1552	2030-04-01	t	1
1553	2030-04-02	t	1
1554	2030-04-03	t	1
1555	2030-04-04	t	1
1556	2030-04-05	t	1
1559	2030-04-08	t	1
1560	2030-04-09	t	1
1561	2030-04-10	t	1
1562	2030-04-11	t	1
1563	2030-04-12	t	1
1566	2030-04-15	t	1
1567	2030-04-16	t	1
1568	2030-04-17	t	1
1569	2030-04-18	t	1
1570	2030-04-19	t	1
1573	2030-04-22	t	1
1574	2030-04-23	t	1
1575	2030-04-24	t	1
1576	2030-04-25	t	1
1577	2030-04-26	t	1
1580	2030-04-29	t	1
1581	2030-04-30	t	1
1582	2030-05-01	t	1
1583	2030-05-02	t	1
1584	2030-05-03	t	1
1587	2030-05-06	t	1
1588	2030-05-07	t	1
1589	2030-05-08	t	1
1590	2030-05-09	t	1
1591	2030-05-10	t	1
1594	2030-05-13	t	1
1595	2030-05-14	t	1
1596	2030-05-15	t	1
1597	2030-05-16	t	1
1598	2030-05-17	t	1
1601	2030-05-20	t	1
1602	2030-05-21	t	1
1603	2030-05-22	t	1
1604	2030-05-23	t	1
1605	2030-05-24	t	1
1608	2030-05-27	t	1
1609	2030-05-28	t	1
1610	2030-05-29	t	1
1611	2030-05-30	t	1
1612	2030-05-31	t	1
1615	2030-06-03	t	1
1616	2030-06-04	t	1
1617	2030-06-05	t	1
1618	2030-06-06	t	1
1619	2030-06-07	t	1
1622	2030-06-10	t	1
1623	2030-06-11	t	1
1624	2030-06-12	t	1
1625	2030-06-13	t	1
1626	2030-06-14	t	1
1629	2030-06-17	t	1
1630	2030-06-18	t	1
1631	2030-06-19	t	1
1632	2030-06-20	t	1
1633	2030-06-21	t	1
1636	2030-06-24	t	1
1637	2030-06-25	t	1
1638	2030-06-26	t	1
1639	2030-06-27	t	1
1640	2030-06-28	t	1
1643	2030-07-01	t	1
1644	2030-07-02	t	1
1645	2030-07-03	t	1
1646	2030-07-04	t	1
1647	2030-07-05	t	1
1650	2030-07-08	t	1
1651	2030-07-09	t	1
1652	2030-07-10	t	1
1653	2030-07-11	t	1
1654	2030-07-12	t	1
1657	2030-07-15	t	1
1658	2030-07-16	t	1
1659	2030-07-17	t	1
1660	2030-07-18	t	1
1661	2030-07-19	t	1
1664	2030-07-22	t	1
1665	2030-07-23	t	1
1666	2030-07-24	t	1
1667	2030-07-25	t	1
1668	2030-07-26	t	1
1671	2030-07-29	t	1
1672	2030-07-30	t	1
1673	2030-07-31	t	1
1674	2030-08-01	t	1
1675	2030-08-02	t	1
1678	2030-08-05	t	1
1679	2030-08-06	t	1
1680	2030-08-07	t	1
1681	2030-08-08	t	1
1682	2030-08-09	t	1
1685	2030-08-12	t	1
1686	2030-08-13	t	1
1687	2030-08-14	t	1
1688	2030-08-15	t	1
1689	2030-08-16	t	1
1692	2030-08-19	t	1
1693	2030-08-20	t	1
1694	2030-08-21	t	1
1695	2030-08-22	t	1
1696	2030-08-23	t	1
1699	2030-08-26	t	1
1700	2030-08-27	t	1
1701	2030-08-28	t	1
1702	2030-08-29	t	1
1703	2030-08-30	t	1
1706	2030-09-02	t	1
1707	2030-09-03	t	1
1708	2030-09-04	t	1
1709	2030-09-05	t	1
1710	2030-09-06	t	1
1713	2030-09-09	t	1
1714	2030-09-10	t	1
1715	2030-09-11	t	1
1716	2030-09-12	t	1
1717	2030-09-13	t	1
1720	2030-09-16	t	1
1721	2030-09-17	t	1
1722	2030-09-18	t	1
1723	2030-09-19	t	1
1724	2030-09-20	t	1
1727	2030-09-23	t	1
1728	2030-09-24	t	1
1729	2030-09-25	t	1
1730	2030-09-26	t	1
1731	2030-09-27	t	1
1734	2030-09-30	t	1
1735	2030-10-01	t	1
1736	2030-10-02	t	1
1737	2030-10-03	t	1
1738	2030-10-04	t	1
1741	2030-10-07	t	1
1742	2030-10-08	t	1
1743	2030-10-09	t	1
1744	2030-10-10	t	1
1745	2030-10-11	t	1
1748	2030-10-14	t	1
1749	2030-10-15	t	1
1750	2030-10-16	t	1
1751	2030-10-17	t	1
1752	2030-10-18	t	1
1755	2030-10-21	t	1
1756	2030-10-22	t	1
1757	2030-10-23	t	1
1758	2030-10-24	t	1
1759	2030-10-25	t	1
1762	2030-10-28	t	1
1763	2030-10-29	t	1
1764	2030-10-30	t	1
1765	2030-10-31	t	1
1766	2030-11-01	t	1
1769	2030-11-04	t	1
1770	2030-11-05	t	1
1771	2030-11-06	t	1
1772	2030-11-07	t	1
1773	2030-11-08	t	1
1776	2030-11-11	t	1
1777	2030-11-12	t	1
1778	2030-11-13	t	1
1779	2030-11-14	t	1
1780	2030-11-15	t	1
1783	2030-11-18	t	1
1784	2030-11-19	t	1
1785	2030-11-20	t	1
1786	2030-11-21	t	1
1787	2030-11-22	t	1
1790	2030-11-25	t	1
1791	2030-11-26	t	1
1792	2030-11-27	t	1
1793	2030-11-28	t	1
1794	2030-11-29	t	1
1797	2030-12-02	t	1
1798	2030-12-03	t	1
1799	2030-12-04	t	1
1800	2030-12-05	t	1
1801	2030-12-06	t	1
1804	2030-12-09	t	1
1805	2030-12-10	t	1
1806	2030-12-11	t	1
1807	2030-12-12	t	1
1808	2030-12-13	t	1
1811	2030-12-16	t	1
1812	2030-12-17	t	1
1813	2030-12-18	t	1
1814	2030-12-19	t	1
1815	2030-12-20	t	1
1818	2030-12-23	t	1
1819	2030-12-24	t	1
1820	2030-12-25	t	1
1821	2030-12-26	t	1
1822	2030-12-27	t	1
1825	2030-12-30	t	1
1826	2030-12-31	t	1
1669	2030-07-27	f	0
1670	2030-07-28	f	0
1676	2030-08-03	f	0
1677	2030-08-04	f	0
1683	2030-08-10	f	0
1684	2030-08-11	f	0
1690	2030-08-17	f	0
1691	2030-08-18	f	0
1697	2030-08-24	f	0
1698	2030-08-25	f	0
1704	2030-08-31	f	0
1705	2030-09-01	f	0
1711	2030-09-07	f	0
1712	2030-09-08	f	0
1718	2030-09-14	f	0
1719	2030-09-15	f	0
1725	2030-09-21	f	0
1726	2030-09-22	f	0
1732	2030-09-28	f	0
1733	2030-09-29	f	0
1739	2030-10-05	f	0
1740	2030-10-06	f	0
1746	2030-10-12	f	0
1747	2030-10-13	f	0
4	2026-01-04	f	0
10	2026-01-10	f	0
11	2026-01-11	f	0
17	2026-01-17	f	0
18	2026-01-18	f	0
24	2026-01-24	f	0
25	2026-01-25	f	0
31	2026-01-31	f	0
32	2026-02-01	f	0
38	2026-02-07	f	0
39	2026-02-08	f	0
46	2026-02-15	f	0
53	2026-02-22	f	0
59	2026-02-28	f	0
60	2026-03-01	f	0
67	2026-03-08	f	0
74	2026-03-15	f	0
80	2026-03-21	f	0
81	2026-03-22	f	0
88	2026-03-29	f	0
95	2026-04-05	f	0
102	2026-04-12	f	0
116	2026-04-26	f	0
123	2026-05-03	f	0
130	2026-05-10	f	0
136	2026-05-16	f	0
137	2026-05-17	f	0
151	2026-05-31	f	0
157	2026-06-06	f	0
158	2026-06-07	f	0
164	2026-06-13	f	0
165	2026-06-14	f	0
171	2026-06-20	f	0
172	2026-06-21	f	0
178	2026-06-27	f	0
179	2026-06-28	f	0
185	2026-07-04	f	0
186	2026-07-05	f	0
192	2026-07-11	f	0
193	2026-07-12	f	0
199	2026-07-18	f	0
200	2026-07-19	f	0
206	2026-07-25	f	0
207	2026-07-26	f	0
213	2026-08-01	f	0
214	2026-08-02	f	0
220	2026-08-08	f	0
221	2026-08-09	f	0
227	2026-08-15	f	0
228	2026-08-16	f	0
234	2026-08-22	f	0
235	2026-08-23	f	0
241	2026-08-29	f	0
242	2026-08-30	f	0
248	2026-09-05	f	0
249	2026-09-06	f	0
255	2026-09-12	f	0
256	2026-09-13	f	0
262	2026-09-19	f	0
263	2026-09-20	f	0
269	2026-09-26	f	0
270	2026-09-27	f	0
276	2026-10-03	f	0
277	2026-10-04	f	0
283	2026-10-10	f	0
284	2026-10-11	f	0
290	2026-10-17	f	0
291	2026-10-18	f	0
297	2026-10-24	f	0
298	2026-10-25	f	0
304	2026-10-31	f	0
305	2026-11-01	f	0
311	2026-11-07	f	0
312	2026-11-08	f	0
318	2026-11-14	f	0
319	2026-11-15	f	0
325	2026-11-21	f	0
326	2026-11-22	f	0
332	2026-11-28	f	0
333	2026-11-29	f	0
339	2026-12-05	f	0
340	2026-12-06	f	0
346	2026-12-12	f	0
347	2026-12-13	f	0
353	2026-12-19	f	0
354	2026-12-20	f	0
360	2026-12-26	f	0
361	2026-12-27	f	0
367	2027-01-02	f	0
368	2027-01-03	f	0
374	2027-01-09	f	0
375	2027-01-10	f	0
381	2027-01-16	f	0
382	2027-01-17	f	0
388	2027-01-23	f	0
389	2027-01-24	f	0
395	2027-01-30	f	0
396	2027-01-31	f	0
402	2027-02-06	f	0
403	2027-02-07	f	0
409	2027-02-13	f	0
410	2027-02-14	f	0
416	2027-02-20	f	0
417	2027-02-21	f	0
423	2027-02-27	f	0
424	2027-02-28	f	0
430	2027-03-06	f	0
431	2027-03-07	f	0
437	2027-03-13	f	0
438	2027-03-14	f	0
444	2027-03-20	f	0
445	2027-03-21	f	0
451	2027-03-27	f	0
452	2027-03-28	f	0
458	2027-04-03	f	0
459	2027-04-04	f	0
465	2027-04-10	f	0
466	2027-04-11	f	0
472	2027-04-17	f	0
473	2027-04-18	f	0
479	2027-04-24	f	0
480	2027-04-25	f	0
486	2027-05-01	f	0
487	2027-05-02	f	0
493	2027-05-08	f	0
494	2027-05-09	f	0
500	2027-05-15	f	0
501	2027-05-16	f	0
507	2027-05-22	f	0
508	2027-05-23	f	0
514	2027-05-29	f	0
515	2027-05-30	f	0
521	2027-06-05	f	0
522	2027-06-06	f	0
528	2027-06-12	f	0
529	2027-06-13	f	0
535	2027-06-19	f	0
536	2027-06-20	f	0
542	2027-06-26	f	0
543	2027-06-27	f	0
549	2027-07-03	f	0
550	2027-07-04	f	0
150	2026-05-30	f	0
115	2026-04-25	f	0
129	2026-05-09	f	0
143	2026-05-23	t	1
144	2026-05-24	t	1
556	2027-07-10	f	0
557	2027-07-11	f	0
563	2027-07-17	f	0
564	2027-07-18	f	0
570	2027-07-24	f	0
571	2027-07-25	f	0
577	2027-07-31	f	0
578	2027-08-01	f	0
584	2027-08-07	f	0
585	2027-08-08	f	0
591	2027-08-14	f	0
592	2027-08-15	f	0
598	2027-08-21	f	0
599	2027-08-22	f	0
605	2027-08-28	f	0
606	2027-08-29	f	0
612	2027-09-04	f	0
613	2027-09-05	f	0
619	2027-09-11	f	0
620	2027-09-12	f	0
626	2027-09-18	f	0
627	2027-09-19	f	0
633	2027-09-25	f	0
634	2027-09-26	f	0
640	2027-10-02	f	0
641	2027-10-03	f	0
647	2027-10-09	f	0
42	2026-02-11	t	1
52	2026-02-21	f	0
73	2026-03-14	f	0
66	2026-03-07	f	0
94	2026-04-04	f	0
101	2026-04-11	f	0
648	2027-10-10	f	0
654	2027-10-16	f	0
655	2027-10-17	f	0
661	2027-10-23	f	0
662	2027-10-24	f	0
668	2027-10-30	f	0
669	2027-10-31	f	0
675	2027-11-06	f	0
676	2027-11-07	f	0
682	2027-11-13	f	0
683	2027-11-14	f	0
689	2027-11-20	f	0
690	2027-11-21	f	0
696	2027-11-27	f	0
697	2027-11-28	f	0
703	2027-12-04	f	0
704	2027-12-05	f	0
710	2027-12-11	f	0
711	2027-12-12	f	0
717	2027-12-18	f	0
718	2027-12-19	f	0
724	2027-12-25	f	0
725	2027-12-26	f	0
731	2028-01-01	f	0
732	2028-01-02	f	0
738	2028-01-08	f	0
739	2028-01-09	f	0
745	2028-01-15	f	0
746	2028-01-16	f	0
752	2028-01-22	f	0
753	2028-01-23	f	0
759	2028-01-29	f	0
760	2028-01-30	f	0
766	2028-02-05	f	0
767	2028-02-06	f	0
773	2028-02-12	f	0
774	2028-02-13	f	0
780	2028-02-19	f	0
781	2028-02-20	f	0
787	2028-02-26	f	0
788	2028-02-27	f	0
794	2028-03-04	f	0
795	2028-03-05	f	0
801	2028-03-11	f	0
802	2028-03-12	f	0
808	2028-03-18	f	0
809	2028-03-19	f	0
815	2028-03-25	f	0
816	2028-03-26	f	0
822	2028-04-01	f	0
823	2028-04-02	f	0
829	2028-04-08	f	0
830	2028-04-09	f	0
836	2028-04-15	f	0
837	2028-04-16	f	0
843	2028-04-22	f	0
844	2028-04-23	f	0
850	2028-04-29	f	0
851	2028-04-30	f	0
857	2028-05-06	f	0
858	2028-05-07	f	0
864	2028-05-13	f	0
865	2028-05-14	f	0
871	2028-05-20	f	0
872	2028-05-21	f	0
878	2028-05-27	f	0
879	2028-05-28	f	0
885	2028-06-03	f	0
886	2028-06-04	f	0
892	2028-06-10	f	0
893	2028-06-11	f	0
899	2028-06-17	f	0
900	2028-06-18	f	0
906	2028-06-24	f	0
907	2028-06-25	f	0
913	2028-07-01	f	0
914	2028-07-02	f	0
920	2028-07-08	f	0
921	2028-07-09	f	0
927	2028-07-15	f	0
928	2028-07-16	f	0
934	2028-07-22	f	0
935	2028-07-23	f	0
941	2028-07-29	f	0
942	2028-07-30	f	0
948	2028-08-05	f	0
949	2028-08-06	f	0
955	2028-08-12	f	0
956	2028-08-13	f	0
962	2028-08-19	f	0
963	2028-08-20	f	0
969	2028-08-26	f	0
970	2028-08-27	f	0
976	2028-09-02	f	0
977	2028-09-03	f	0
983	2028-09-09	f	0
984	2028-09-10	f	0
990	2028-09-16	f	0
991	2028-09-17	f	0
997	2028-09-23	f	0
998	2028-09-24	f	0
1004	2028-09-30	f	0
1005	2028-10-01	f	0
1011	2028-10-07	f	0
1012	2028-10-08	f	0
1018	2028-10-14	f	0
1019	2028-10-15	f	0
1025	2028-10-21	f	0
1026	2028-10-22	f	0
1032	2028-10-28	f	0
1033	2028-10-29	f	0
1039	2028-11-04	f	0
1040	2028-11-05	f	0
1046	2028-11-11	f	0
1047	2028-11-12	f	0
1053	2028-11-18	f	0
1054	2028-11-19	f	0
1060	2028-11-25	f	0
1061	2028-11-26	f	0
1067	2028-12-02	f	0
1068	2028-12-03	f	0
1074	2028-12-09	f	0
1075	2028-12-10	f	0
1081	2028-12-16	f	0
1082	2028-12-17	f	0
1088	2028-12-23	f	0
1089	2028-12-24	f	0
1095	2028-12-30	f	0
1096	2028-12-31	f	0
1102	2029-01-06	f	0
1103	2029-01-07	f	0
1109	2029-01-13	f	0
1110	2029-01-14	f	0
1116	2029-01-20	f	0
1117	2029-01-21	f	0
1123	2029-01-27	f	0
1124	2029-01-28	f	0
1130	2029-02-03	f	0
1131	2029-02-04	f	0
1137	2029-02-10	f	0
1138	2029-02-11	f	0
1144	2029-02-17	f	0
1145	2029-02-18	f	0
1151	2029-02-24	f	0
1152	2029-02-25	f	0
1158	2029-03-03	f	0
1159	2029-03-04	f	0
1165	2029-03-10	f	0
1166	2029-03-11	f	0
1172	2029-03-17	f	0
1173	2029-03-18	f	0
1179	2029-03-24	f	0
1180	2029-03-25	f	0
1186	2029-03-31	f	0
1187	2029-04-01	f	0
1193	2029-04-07	f	0
1194	2029-04-08	f	0
1200	2029-04-14	f	0
1201	2029-04-15	f	0
1207	2029-04-21	f	0
1208	2029-04-22	f	0
1214	2029-04-28	f	0
1215	2029-04-29	f	0
1221	2029-05-05	f	0
1222	2029-05-06	f	0
1228	2029-05-12	f	0
1229	2029-05-13	f	0
1235	2029-05-19	f	0
1236	2029-05-20	f	0
1242	2029-05-26	f	0
1243	2029-05-27	f	0
1249	2029-06-02	f	0
1250	2029-06-03	f	0
1256	2029-06-09	f	0
1257	2029-06-10	f	0
1263	2029-06-16	f	0
1264	2029-06-17	f	0
1270	2029-06-23	f	0
1271	2029-06-24	f	0
1277	2029-06-30	f	0
1278	2029-07-01	f	0
1284	2029-07-07	f	0
1285	2029-07-08	f	0
1291	2029-07-14	f	0
1292	2029-07-15	f	0
1298	2029-07-21	f	0
1299	2029-07-22	f	0
1305	2029-07-28	f	0
1306	2029-07-29	f	0
1312	2029-08-04	f	0
1313	2029-08-05	f	0
1319	2029-08-11	f	0
1320	2029-08-12	f	0
1326	2029-08-18	f	0
1327	2029-08-19	f	0
1333	2029-08-25	f	0
1334	2029-08-26	f	0
1340	2029-09-01	f	0
1341	2029-09-02	f	0
1347	2029-09-08	f	0
1348	2029-09-09	f	0
1354	2029-09-15	f	0
1355	2029-09-16	f	0
1361	2029-09-22	f	0
1362	2029-09-23	f	0
1368	2029-09-29	f	0
1369	2029-09-30	f	0
1375	2029-10-06	f	0
1376	2029-10-07	f	0
1382	2029-10-13	f	0
1383	2029-10-14	f	0
1389	2029-10-20	f	0
1390	2029-10-21	f	0
1396	2029-10-27	f	0
1397	2029-10-28	f	0
1403	2029-11-03	f	0
1404	2029-11-04	f	0
1410	2029-11-10	f	0
1411	2029-11-11	f	0
1417	2029-11-17	f	0
1418	2029-11-18	f	0
1424	2029-11-24	f	0
1425	2029-11-25	f	0
1431	2029-12-01	f	0
1432	2029-12-02	f	0
1438	2029-12-08	f	0
1439	2029-12-09	f	0
1445	2029-12-15	f	0
1446	2029-12-16	f	0
1452	2029-12-22	f	0
1453	2029-12-23	f	0
1459	2029-12-29	f	0
1460	2029-12-30	f	0
1466	2030-01-05	f	0
1467	2030-01-06	f	0
1473	2030-01-12	f	0
1474	2030-01-13	f	0
1480	2030-01-19	f	0
1481	2030-01-20	f	0
1487	2030-01-26	f	0
1488	2030-01-27	f	0
1494	2030-02-02	f	0
1495	2030-02-03	f	0
1501	2030-02-09	f	0
1502	2030-02-10	f	0
1508	2030-02-16	f	0
1509	2030-02-17	f	0
1515	2030-02-23	f	0
1516	2030-02-24	f	0
1522	2030-03-02	f	0
1523	2030-03-03	f	0
1529	2030-03-09	f	0
1530	2030-03-10	f	0
1536	2030-03-16	f	0
1537	2030-03-17	f	0
1543	2030-03-23	f	0
1544	2030-03-24	f	0
1550	2030-03-30	f	0
1551	2030-03-31	f	0
1557	2030-04-06	f	0
1558	2030-04-07	f	0
1564	2030-04-13	f	0
1565	2030-04-14	f	0
1571	2030-04-20	f	0
1572	2030-04-21	f	0
1578	2030-04-27	f	0
1579	2030-04-28	f	0
1585	2030-05-04	f	0
1586	2030-05-05	f	0
1592	2030-05-11	f	0
1593	2030-05-12	f	0
1599	2030-05-18	f	0
1600	2030-05-19	f	0
1606	2030-05-25	f	0
1607	2030-05-26	f	0
1613	2030-06-01	f	0
1614	2030-06-02	f	0
1620	2030-06-08	f	0
1621	2030-06-09	f	0
1627	2030-06-15	f	0
1628	2030-06-16	f	0
1634	2030-06-22	f	0
1635	2030-06-23	f	0
1641	2030-06-29	f	0
1642	2030-06-30	f	0
1648	2030-07-06	f	0
1649	2030-07-07	f	0
1655	2030-07-13	f	0
1656	2030-07-14	f	0
1662	2030-07-20	f	0
1663	2030-07-21	f	0
1753	2030-10-19	f	0
1754	2030-10-20	f	0
1760	2030-10-26	f	0
1761	2030-10-27	f	0
1767	2030-11-02	f	0
1768	2030-11-03	f	0
1774	2030-11-09	f	0
1775	2030-11-10	f	0
1781	2030-11-16	f	0
1782	2030-11-17	f	0
1788	2030-11-23	f	0
1789	2030-11-24	f	0
1795	2030-11-30	f	0
1796	2030-12-01	f	0
1802	2030-12-07	f	0
1803	2030-12-08	f	0
1809	2030-12-14	f	0
1810	2030-12-15	f	0
1816	2030-12-21	f	0
1817	2030-12-22	f	0
1823	2030-12-28	f	0
1824	2030-12-29	f	0
109	2026-04-19	f	0
108	2026-04-18	f	0
139	2026-05-19	t	2
119	2026-04-29	t	1
\.


--
-- Data for Name: shift_timing_configuration; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.shift_timing_configuration (id, shift_config_id, shift_code, shift_start, shift_end, custom_start, custom_end) FROM stdin;
7	76	GENERAL	08:30:00	17:00:00	\N	\N
8	78	GENERAL	08:30:00	17:00:00	\N	\N
9	89	GENERAL	08:30:00	17:00:00	\N	\N
119	121	GENERAL	08:30:00	17:00:00	\N	\N
20	75	GENERAL	08:30:00	17:00:00	\N	\N
23	93	GENERAL	08:30:00	17:00:00	\N	\N
129	98	GENERAL	08:30:00	17:00:00	\N	\N
130	99	GENERAL	08:30:00	17:00:00	\N	\N
131	100	GENERAL	08:30:00	17:00:00	\N	\N
132	103	GENERAL	08:30:00	17:00:00	\N	\N
28	97	GENERAL	08:30:00	17:00:00	\N	\N
133	104	GENERAL	08:30:00	17:00:00	\N	\N
134	105	GENERAL	08:30:00	17:00:00	\N	\N
135	106	GENERAL	08:30:00	17:00:00	\N	\N
35	107	GENERAL	08:30:00	17:00:00	\N	\N
40	110	GENERAL	08:30:00	17:00:00	\N	\N
41	120	GENERAL	08:30:00	17:00:00	\N	\N
142	492	CUSTOM	07:00:00	16:00:00	07:00:00	16:00:00
48	5	CUSTOM	09:00:00	16:00:00	09:00:00	16:00:00
50	62	GENERAL	08:30:00	17:00:00	\N	\N
51	63	GENERAL	08:30:00	17:00:00	\N	\N
52	64	GENERAL	08:30:00	17:00:00	\N	\N
53	65	GENERAL	08:30:00	17:00:00	\N	\N
54	68	GENERAL	08:30:00	17:00:00	\N	\N
55	69	GENERAL	08:30:00	17:00:00	\N	\N
56	70	GENERAL	08:30:00	17:00:00	\N	\N
57	71	GENERAL	08:30:00	17:00:00	\N	\N
58	72	GENERAL	08:30:00	17:00:00	\N	\N
59	77	GENERAL	08:30:00	17:00:00	\N	\N
60	79	GENERAL	08:30:00	17:00:00	\N	\N
61	82	GENERAL	08:30:00	17:00:00	\N	\N
62	83	GENERAL	08:30:00	17:00:00	\N	\N
63	84	GENERAL	08:30:00	17:00:00	\N	\N
64	85	GENERAL	08:30:00	17:00:00	\N	\N
65	86	GENERAL	08:30:00	17:00:00	\N	\N
66	1827	GENERAL	08:30:00	17:00:00	\N	\N
68	90	CUSTOM	09:00:00	16:00:00	09:00:00	16:00:00
74	2	GENERAL	08:30:00	17:00:00	\N	\N
77	1	GENERAL	08:30:00	17:00:00	\N	\N
78	61	GENERAL	08:30:00	17:00:00	\N	\N
79	6	GENERAL	08:30:00	17:00:00	\N	\N
80	111	GENERAL	08:30:00	17:00:00	\N	\N
81	112	GENERAL	08:30:00	17:00:00	\N	\N
82	113	GENERAL	08:30:00	17:00:00	\N	\N
83	114	GENERAL	08:30:00	17:00:00	\N	\N
84	117	GENERAL	08:30:00	17:00:00	\N	\N
85	118	GENERAL	08:30:00	17:00:00	\N	\N
101	92	GENERAL	08:30:00	17:00:00	\N	\N
143	1588	GENERAL	08:30:00	17:00:00	\N	\N
154	119	GENERAL	08:30:00	17:00:00	\N	\N
155	152	GENERAL	08:30:00	17:00:00	\N	\N
156	153	GENERAL	08:30:00	17:00:00	\N	\N
157	154	GENERAL	08:30:00	17:00:00	\N	\N
158	155	GENERAL	08:30:00	17:00:00	\N	\N
159	156	GENERAL	08:30:00	17:00:00	\N	\N
160	96	GENERAL	08:30:00	17:00:00	\N	\N
161	159	GENERAL	08:30:00	17:00:00	\N	\N
162	160	GENERAL	08:30:00	17:00:00	\N	\N
163	161	GENERAL	08:30:00	17:00:00	\N	\N
164	162	GENERAL	08:30:00	17:00:00	\N	\N
165	163	GENERAL	08:30:00	17:00:00	\N	\N
166	166	GENERAL	08:30:00	17:00:00	\N	\N
167	167	GENERAL	08:30:00	17:00:00	\N	\N
168	168	GENERAL	08:30:00	17:00:00	\N	\N
169	169	GENERAL	08:30:00	17:00:00	\N	\N
170	170	GENERAL	08:30:00	17:00:00	\N	\N
171	173	GENERAL	08:30:00	17:00:00	\N	\N
172	174	GENERAL	08:30:00	17:00:00	\N	\N
173	175	GENERAL	08:30:00	17:00:00	\N	\N
174	176	GENERAL	08:30:00	17:00:00	\N	\N
175	177	GENERAL	08:30:00	17:00:00	\N	\N
176	180	GENERAL	08:30:00	17:00:00	\N	\N
177	181	GENERAL	08:30:00	17:00:00	\N	\N
183	3	GENERAL	08:30:00	17:00:00	\N	\N
184	3	NEXT	17:00:00	21:00:00	\N	\N
187	124	GENERAL	08:30:00	17:00:00	\N	\N
188	125	GENERAL	08:30:00	17:00:00	\N	\N
190	127	GENERAL	08:30:00	17:00:00	\N	\N
191	128	GENERAL	08:30:00	17:00:00	\N	\N
192	131	GENERAL	08:30:00	17:00:00	\N	\N
193	132	GENERAL	08:30:00	17:00:00	\N	\N
194	133	GENERAL	08:30:00	17:00:00	\N	\N
195	134	GENERAL	08:30:00	17:00:00	\N	\N
196	135	GENERAL	08:30:00	17:00:00	\N	\N
201	142	GENERAL	08:30:00	17:00:00	\N	\N
204	126	GENERAL	08:30:00	17:00:00	\N	\N
207	147	GENERAL	08:30:00	17:00:00	\N	\N
208	148	GENERAL	08:30:00	17:00:00	\N	\N
209	149	GENERAL	08:30:00	17:00:00	\N	\N
210	182	GENERAL	08:30:00	17:00:00	\N	\N
211	182	NEXT	17:00:00	21:00:00	\N	\N
215	140	GENERAL	08:30:00	17:00:00	\N	\N
216	140	NEXT	17:00:00	21:00:00	\N	\N
217	143	GENERAL	08:30:00	17:00:00	\N	\N
218	144	GENERAL	08:30:00	17:00:00	\N	\N
219	141	GENERAL	08:30:00	17:00:00	\N	\N
220	141	NEXT	17:00:00	21:00:00	\N	\N
226	139	GENERAL	08:30:00	17:00:00	\N	\N
227	139	NEXT	17:00:00	21:00:00	\N	\N
228	145	GENERAL	08:30:00	17:00:00	\N	\N
229	146	GENERAL	08:30:00	17:00:00	\N	\N
230	138	GENERAL	08:30:00	17:00:00	\N	\N
231	138	NEXT	17:00:00	21:00:00	\N	\N
\.


--
-- Data for Name: status; Type: TABLE DATA; Schema: scheduling; Owner: -
--

COPY scheduling.status (id, name, description) FROM stdin;
1	ON	machine is ON
2	OFF	machine is OFF
\.


--
-- Name: access_users_id_seq; Type: SEQUENCE SET; Schema: accesscontrol; Owner: -
--

SELECT pg_catalog.setval('accesscontrol.access_users_id_seq', 41, true);


--
-- Name: operator_leaves_id_seq; Type: SEQUENCE SET; Schema: accesscontrol; Owner: -
--

SELECT pg_catalog.setval('accesscontrol.operator_leaves_id_seq', 7, true);


--
-- Name: customers_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.customers_id_seq', 39, true);


--
-- Name: machines_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.machines_id_seq', 37, true);


--
-- Name: pokayoke_checklist_items_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.pokayoke_checklist_items_id_seq', 117, true);


--
-- Name: pokayoke_checklists_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.pokayoke_checklists_id_seq', 22, true);


--
-- Name: pokayoke_completed_logs_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.pokayoke_completed_logs_id_seq', 62, true);


--
-- Name: pokayoke_item_responses_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.pokayoke_item_responses_id_seq', 456, true);


--
-- Name: pokayoke_machine_assignments_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.pokayoke_machine_assignments_id_seq', 46, true);


--
-- Name: work_centers_id_seq; Type: SEQUENCE SET; Schema: configuration; Owner: -
--

SELECT pg_catalog.setval('configuration.work_centers_id_seq', 11, true);


--
-- Name: common_documents_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.common_documents_id_seq', 16, true);


--
-- Name: common_folders_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.common_folders_id_seq', 1, true);


--
-- Name: general_documents_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.general_documents_id_seq', 64, true);


--
-- Name: general_folders_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.general_folders_id_seq', 47, true);


--
-- Name: machine_documents_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.machine_documents_id_seq', 37, true);


--
-- Name: machine_folders_id_seq; Type: SEQUENCE SET; Schema: documents; Owner: -
--

SELECT pg_catalog.setval('documents.machine_folders_id_seq', 20, true);


--
-- Name: inventory_requests_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.inventory_requests_id_seq', 22, true);


--
-- Name: inventory_return_requests_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.inventory_return_requests_id_seq', 9, true);


--
-- Name: raw_material_stock_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.raw_material_stock_id_seq', 252, true);


--
-- Name: raw_material_units_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.raw_material_units_id_seq', 602, true);


--
-- Name: raw_material_usage_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.raw_material_usage_id_seq', 104, true);


--
-- Name: raw_materials_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.raw_materials_id_seq', 22, true);


--
-- Name: tool_issue_documents_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.tool_issue_documents_id_seq', 1, true);


--
-- Name: tool_issues_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.tool_issues_id_seq', 7, true);


--
-- Name: tools_list_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.tools_list_id_seq', 3098, true);


--
-- Name: vendors_id_seq; Type: SEQUENCE SET; Schema: inventory; Owner: -
--

SELECT pg_catalog.setval('inventory.vendors_id_seq', 102, true);


--
-- Name: component_issues_id_seq; Type: SEQUENCE SET; Schema: maintenance; Owner: -
--

SELECT pg_catalog.setval('maintenance.component_issues_id_seq', 18, true);


--
-- Name: help_support_id_seq; Type: SEQUENCE SET; Schema: maintenance; Owner: -
--

SELECT pg_catalog.setval('maintenance.help_support_id_seq', 12, true);


--
-- Name: machine_breakdown_id_seq; Type: SEQUENCE SET; Schema: maintenance; Owner: -
--

SELECT pg_catalog.setval('maintenance.machine_breakdown_id_seq', 19, true);


--
-- Name: oee_issues_id_seq; Type: SEQUENCE SET; Schema: maintenance; Owner: -
--

SELECT pg_catalog.setval('maintenance.oee_issues_id_seq', 28, true);


--
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.activity_log_id_seq', 109, true);


--
-- Name: component_issues_notification_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.component_issues_notification_id_seq', 22, true);


--
-- Name: inspection_notifications_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.inspection_notifications_id_seq', 22, true);


--
-- Name: machine_calibration_notification_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.machine_calibration_notification_id_seq', 4, true);


--
-- Name: machine_notifications_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.machine_notifications_id_seq', 8, true);


--
-- Name: mc_notifications_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.mc_notifications_id_seq', 8, true);


--
-- Name: order_notifications_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.order_notifications_id_seq', 72, true);


--
-- Name: pc_notifications_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.pc_notifications_id_seq', 108, true);


--
-- Name: tool_issues_notification_id_seq; Type: SEQUENCE SET; Schema: notifications; Owner: -
--

SELECT pg_catalog.setval('notifications.tool_issues_notification_id_seq', 23, true);


--
-- Name: assemblies_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.assemblies_id_seq', 57, true);


--
-- Name: document_extracted_data_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.document_extracted_data_id_seq', 160, true);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.documents_id_seq', 343, true);


--
-- Name: operation_documents_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.operation_documents_id_seq', 167, true);


--
-- Name: operations_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.operations_id_seq', 470, true);


--
-- Name: order_documents_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.order_documents_id_seq', 91, true);


--
-- Name: order_part_priorities_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.order_part_priorities_id_seq', 1167, true);


--
-- Name: order_parts_raw_material_linked_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.order_parts_raw_material_linked_id_seq', 1, false);


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.order_schedule_status_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.orders_id_seq', 156, true);


--
-- Name: out_source_operation_status_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.out_source_operation_status_id_seq', 4, true);


--
-- Name: out_source_parts_status_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.out_source_parts_status_id_seq', 7, true);


--
-- Name: part_types_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.part_types_id_seq', 3, true);


--
-- Name: parts_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.parts_id_seq', 1575, true);


--
-- Name: process_plans_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.process_plans_id_seq', 1, false);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.products_id_seq', 129, true);


--
-- Name: tools_with_part_id_seq; Type: SEQUENCE SET; Schema: oms; Owner: -
--

SELECT pg_catalog.setval('oms.tools_with_part_id_seq', 186, true);


--
-- Name: machine_live_history_id_seq; Type: SEQUENCE SET; Schema: production_monitoring; Owner: -
--

SELECT pg_catalog.setval('production_monitoring.machine_live_history_id_seq', 177, true);


--
-- Name: machine_live_status_id_seq; Type: SEQUENCE SET; Schema: production_monitoring; Owner: -
--

SELECT pg_catalog.setval('production_monitoring.machine_live_status_id_seq', 38, true);


--
-- Name: oee_issue_id_seq; Type: SEQUENCE SET; Schema: production_monitoring; Owner: -
--

SELECT pg_catalog.setval('production_monitoring.oee_issue_id_seq', 1, false);


--
-- Name: shift_summary_id_seq; Type: SEQUENCE SET; Schema: production_monitoring; Owner: -
--

SELECT pg_catalog.setval('production_monitoring.shift_summary_id_seq', 302, true);


--
-- Name: ftp_status_id_seq; Type: SEQUENCE SET; Schema: quality; Owner: -
--

SELECT pg_catalog.setval('quality.ftp_status_id_seq', 19, true);


--
-- Name: inspection_plan_status_id_seq; Type: SEQUENCE SET; Schema: quality; Owner: -
--

SELECT pg_catalog.setval('quality.inspection_plan_status_id_seq', 43, true);


--
-- Name: master_boc_id_seq; Type: SEQUENCE SET; Schema: quality; Owner: -
--

SELECT pg_catalog.setval('quality.master_boc_id_seq', 816, true);


--
-- Name: notes_id_seq; Type: SEQUENCE SET; Schema: quality; Owner: -
--

SELECT pg_catalog.setval('quality.notes_id_seq', 52, true);


--
-- Name: stage_inspection_id_seq; Type: SEQUENCE SET; Schema: quality; Owner: -
--

SELECT pg_catalog.setval('quality.stage_inspection_id_seq', 483, true);


--
-- Name: efficiency_factor_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.efficiency_factor_id_seq', 1, true);


--
-- Name: machine_downtimes_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.machine_downtimes_id_seq', 107, true);


--
-- Name: machine_operator_shift_assignment_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.machine_operator_shift_assignment_id_seq', 31, true);


--
-- Name: machine_schedule_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.machine_schedule_id_seq', 1, false);


--
-- Name: machine_status_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.machine_status_id_seq', 50, true);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.notifications_id_seq', 1, false);


--
-- Name: operation_status_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.operation_status_id_seq', 4290, true);


--
-- Name: order_schedule_status_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.order_schedule_status_id_seq', 31, true);


--
-- Name: part_schedule_status_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.part_schedule_status_id_seq', 139, true);


--
-- Name: planned_schedule_items_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.planned_schedule_items_id_seq', 17660, true);


--
-- Name: production_logs_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.production_logs_id_seq', 324, true);


--
-- Name: rescheduling_items_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.rescheduling_items_id_seq', 8233, true);


--
-- Name: schedule_history_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.schedule_history_id_seq', 509, true);


--
-- Name: shift_hours_configuration_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.shift_hours_configuration_id_seq', 1827, true);


--
-- Name: shift_timing_configuration_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.shift_timing_configuration_id_seq', 231, true);


--
-- Name: status_id_seq; Type: SEQUENCE SET; Schema: scheduling; Owner: -
--

SELECT pg_catalog.setval('scheduling.status_id_seq', 1, false);


--
-- Name: access_users access_users_gmail_key; Type: CONSTRAINT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.access_users
    ADD CONSTRAINT access_users_gmail_key UNIQUE (gmail);


--
-- Name: access_users access_users_pkey; Type: CONSTRAINT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.access_users
    ADD CONSTRAINT access_users_pkey PRIMARY KEY (id);


--
-- Name: operator_leaves operator_leaves_pkey; Type: CONSTRAINT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.operator_leaves
    ADD CONSTRAINT operator_leaves_pkey PRIMARY KEY (id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: machines machines_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.machines
    ADD CONSTRAINT machines_pkey PRIMARY KEY (id);


--
-- Name: pokayoke_checklist_items pokayoke_checklist_items_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_checklist_items
    ADD CONSTRAINT pokayoke_checklist_items_pkey PRIMARY KEY (id);


--
-- Name: pokayoke_checklists pokayoke_checklists_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_checklists
    ADD CONSTRAINT pokayoke_checklists_pkey PRIMARY KEY (id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_pkey PRIMARY KEY (id);


--
-- Name: pokayoke_item_responses pokayoke_item_responses_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_item_responses
    ADD CONSTRAINT pokayoke_item_responses_pkey PRIMARY KEY (id);


--
-- Name: pokayoke_machine_assignments pokayoke_machine_assignments_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_machine_assignments
    ADD CONSTRAINT pokayoke_machine_assignments_pkey PRIMARY KEY (id);


--
-- Name: work_centers work_centers_pkey; Type: CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.work_centers
    ADD CONSTRAINT work_centers_pkey PRIMARY KEY (id);


--
-- Name: common_documents common_documents_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_documents
    ADD CONSTRAINT common_documents_pkey PRIMARY KEY (id);


--
-- Name: common_folders common_folders_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_folders
    ADD CONSTRAINT common_folders_pkey PRIMARY KEY (id);


--
-- Name: general_documents general_documents_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_documents
    ADD CONSTRAINT general_documents_pkey PRIMARY KEY (id);


--
-- Name: general_folders general_folders_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_folders
    ADD CONSTRAINT general_folders_pkey PRIMARY KEY (id);


--
-- Name: machine_documents machine_documents_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents
    ADD CONSTRAINT machine_documents_pkey PRIMARY KEY (id);


--
-- Name: machine_folders machine_folders_pkey; Type: CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_folders
    ADD CONSTRAINT machine_folders_pkey PRIMARY KEY (id);


--
-- Name: inventory_requests inventory_requests_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_requests
    ADD CONSTRAINT inventory_requests_pkey PRIMARY KEY (id);


--
-- Name: inventory_return_requests inventory_return_requests_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_return_requests
    ADD CONSTRAINT inventory_return_requests_pkey PRIMARY KEY (id);


--
-- Name: raw_material_stock raw_material_stock_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_stock
    ADD CONSTRAINT raw_material_stock_pkey PRIMARY KEY (id);


--
-- Name: raw_material_units raw_material_units_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_units
    ADD CONSTRAINT raw_material_units_pkey PRIMARY KEY (id);


--
-- Name: raw_material_usage raw_material_usage_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_usage
    ADD CONSTRAINT raw_material_usage_pkey PRIMARY KEY (id);


--
-- Name: raw_materials raw_materials_material_name_key; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_materials
    ADD CONSTRAINT raw_materials_material_name_key UNIQUE (material_name);


--
-- Name: raw_materials raw_materials_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_materials
    ADD CONSTRAINT raw_materials_pkey PRIMARY KEY (id);


--
-- Name: tool_issue_documents tool_issue_documents_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issue_documents
    ADD CONSTRAINT tool_issue_documents_pkey PRIMARY KEY (id);


--
-- Name: tool_issues tool_issues_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issues
    ADD CONSTRAINT tool_issues_pkey PRIMARY KEY (id);


--
-- Name: tools_list tools_list_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tools_list
    ADD CONSTRAINT tools_list_pkey PRIMARY KEY (id);


--
-- Name: vendors vendors_company_name_key; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.vendors
    ADD CONSTRAINT vendors_company_name_key UNIQUE (company_name);


--
-- Name: vendors vendors_pkey; Type: CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.vendors
    ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);


--
-- Name: component_issues component_issues_pkey; Type: CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.component_issues
    ADD CONSTRAINT component_issues_pkey PRIMARY KEY (id);


--
-- Name: help_support help_support_pkey; Type: CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_pkey PRIMARY KEY (id);


--
-- Name: machine_breakdown machine_breakdown_pkey; Type: CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.machine_breakdown
    ADD CONSTRAINT machine_breakdown_pkey PRIMARY KEY (id);


--
-- Name: oee_issues oee_issues_pkey; Type: CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.oee_issues
    ADD CONSTRAINT oee_issues_pkey PRIMARY KEY (id);


--
-- Name: activity_log activity_log_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.activity_log
    ADD CONSTRAINT activity_log_pkey PRIMARY KEY (id);


--
-- Name: component_issues_notification component_issues_notification_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.component_issues_notification
    ADD CONSTRAINT component_issues_notification_pkey PRIMARY KEY (id);


--
-- Name: inspection_notifications inspection_notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.inspection_notifications
    ADD CONSTRAINT inspection_notifications_pkey PRIMARY KEY (id);


--
-- Name: machine_calibration_notification machine_calibration_notification_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.machine_calibration_notification
    ADD CONSTRAINT machine_calibration_notification_pkey PRIMARY KEY (id);


--
-- Name: machine_notifications machine_notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.machine_notifications
    ADD CONSTRAINT machine_notifications_pkey PRIMARY KEY (id);


--
-- Name: mc_notifications mc_notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.mc_notifications
    ADD CONSTRAINT mc_notifications_pkey PRIMARY KEY (id);


--
-- Name: order_notifications order_notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.order_notifications
    ADD CONSTRAINT order_notifications_pkey PRIMARY KEY (id);


--
-- Name: pc_notifications pc_notifications_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.pc_notifications
    ADD CONSTRAINT pc_notifications_pkey PRIMARY KEY (id);


--
-- Name: tool_issues_notification tool_issues_notification_pkey; Type: CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.tool_issues_notification
    ADD CONSTRAINT tool_issues_notification_pkey PRIMARY KEY (id);


--
-- Name: assemblies assemblies_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.assemblies
    ADD CONSTRAINT assemblies_pkey PRIMARY KEY (id);


--
-- Name: document_extracted_data document_extracted_data_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.document_extracted_data
    ADD CONSTRAINT document_extracted_data_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: operation_documents operation_documents_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operation_documents
    ADD CONSTRAINT operation_documents_pkey PRIMARY KEY (id);


--
-- Name: operations operations_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT operations_pkey PRIMARY KEY (id);


--
-- Name: order_documents order_documents_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_documents
    ADD CONSTRAINT order_documents_pkey PRIMARY KEY (id);


--
-- Name: order_part_priorities order_part_priorities_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_part_priorities
    ADD CONSTRAINT order_part_priorities_pkey PRIMARY KEY (id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_pkey PRIMARY KEY (id);


--
-- Name: order_schedule_status order_schedule_status_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status
    ADD CONSTRAINT order_schedule_status_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: out_source_operation_status out_source_operation_status_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_operation_status
    ADD CONSTRAINT out_source_operation_status_pkey PRIMARY KEY (id);


--
-- Name: out_source_parts_status out_source_parts_status_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_parts_status
    ADD CONSTRAINT out_source_parts_status_pkey PRIMARY KEY (id);


--
-- Name: part_types part_types_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.part_types
    ADD CONSTRAINT part_types_pkey PRIMARY KEY (id);


--
-- Name: parts parts_part_number_product_key; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_part_number_product_key UNIQUE (part_number, product_id);


--
-- Name: parts parts_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_pkey PRIMARY KEY (id);


--
-- Name: process_plans process_plans_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.process_plans
    ADD CONSTRAINT process_plans_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: tools_with_part tools_with_part_pkey; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.tools_with_part
    ADD CONSTRAINT tools_with_part_pkey PRIMARY KEY (id);


--
-- Name: orders unique_sale_order_number; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT unique_sale_order_number UNIQUE (sale_order_number);


--
-- Name: orders uq_orders_sale_order_number; Type: CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT uq_orders_sale_order_number UNIQUE (sale_order_number);


--
-- Name: machine_live_history machine_live_history_pkey; Type: CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history
    ADD CONSTRAINT machine_live_history_pkey PRIMARY KEY (id);


--
-- Name: machine_live_status machine_live_status_machine_id_key; Type: CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_machine_id_key UNIQUE (machine_id);


--
-- Name: machine_live_status machine_live_status_pkey; Type: CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_pkey PRIMARY KEY (id);


--
-- Name: oee_issue oee_issue_pkey; Type: CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.oee_issue
    ADD CONSTRAINT oee_issue_pkey PRIMARY KEY (id);


--
-- Name: shift_summary shift_summary_pkey; Type: CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.shift_summary
    ADD CONSTRAINT shift_summary_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: ftp_status ftp_status_pkey; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.ftp_status
    ADD CONSTRAINT ftp_status_pkey PRIMARY KEY (id);


--
-- Name: inspection_plan_status inspection_plan_status_pkey; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.inspection_plan_status
    ADD CONSTRAINT inspection_plan_status_pkey PRIMARY KEY (id);


--
-- Name: master_boc master_boc_pkey; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.master_boc
    ADD CONSTRAINT master_boc_pkey PRIMARY KEY (id);


--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (id);


--
-- Name: stage_inspection stage_inspection_pkey; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.stage_inspection
    ADD CONSTRAINT stage_inspection_pkey PRIMARY KEY (id);


--
-- Name: inspection_plan_status uix_inspection_plan_scope; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.inspection_plan_status
    ADD CONSTRAINT uix_inspection_plan_scope UNIQUE (part_number, sales_order_id, op_no);


--
-- Name: ftp_status uix_order_ipid; Type: CONSTRAINT; Schema: quality; Owner: -
--

ALTER TABLE ONLY quality.ftp_status
    ADD CONSTRAINT uix_order_ipid UNIQUE (order_id, ipid);


--
-- Name: efficiency_factor efficiency_factor_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.efficiency_factor
    ADD CONSTRAINT efficiency_factor_pkey PRIMARY KEY (id);


--
-- Name: machine_downtimes machine_downtimes_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_downtimes
    ADD CONSTRAINT machine_downtimes_pkey PRIMARY KEY (id);


--
-- Name: machine_operator_shift_assignment machine_operator_shift_assignment_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_operator_shift_assignment
    ADD CONSTRAINT machine_operator_shift_assignment_pkey PRIMARY KEY (id);


--
-- Name: machine_schedule machine_schedule_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule
    ADD CONSTRAINT machine_schedule_pkey PRIMARY KEY (id);


--
-- Name: machine_status machine_status_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_status
    ADD CONSTRAINT machine_status_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: operation_status operation_status_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT operation_status_pkey PRIMARY KEY (id);


--
-- Name: order_schedule_status order_schedule_status_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.order_schedule_status
    ADD CONSTRAINT order_schedule_status_pkey PRIMARY KEY (id);


--
-- Name: part_schedule_status part_schedule_status_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.part_schedule_status
    ADD CONSTRAINT part_schedule_status_pkey PRIMARY KEY (id);


--
-- Name: planned_schedule_items planned_schedule_items_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_pkey PRIMARY KEY (id);


--
-- Name: production_logs production_logs_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.production_logs
    ADD CONSTRAINT production_logs_pkey PRIMARY KEY (id);


--
-- Name: rescheduling_items rescheduling_items_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_pkey PRIMARY KEY (id);


--
-- Name: schedule_history schedule_history_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.schedule_history
    ADD CONSTRAINT schedule_history_pkey PRIMARY KEY (id);


--
-- Name: shift_hours_configuration shift_hours_configuration_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_hours_configuration
    ADD CONSTRAINT shift_hours_configuration_pkey PRIMARY KEY (id);


--
-- Name: shift_timing_configuration shift_timing_configuration_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_timing_configuration
    ADD CONSTRAINT shift_timing_configuration_pkey PRIMARY KEY (id);


--
-- Name: status status_pkey; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.status
    ADD CONSTRAINT status_pkey PRIMARY KEY (id);


--
-- Name: operation_status uq_operation_status_operation_id; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT uq_operation_status_operation_id UNIQUE (operation_id);


--
-- Name: shift_timing_configuration uq_shift_timing_config_shift; Type: CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_timing_configuration
    ADD CONSTRAINT uq_shift_timing_config_shift UNIQUE (shift_config_id, shift_code);


--
-- Name: ix_accesscontrol_access_users_id; Type: INDEX; Schema: accesscontrol; Owner: -
--

CREATE INDEX ix_accesscontrol_access_users_id ON accesscontrol.access_users USING btree (id);


--
-- Name: ix_accesscontrol_operator_leaves_id; Type: INDEX; Schema: accesscontrol; Owner: -
--

CREATE INDEX ix_accesscontrol_operator_leaves_id ON accesscontrol.operator_leaves USING btree (id);


--
-- Name: ix_configuration_customers_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_customers_id ON configuration.customers USING btree (id);


--
-- Name: ix_configuration_machines_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_machines_id ON configuration.machines USING btree (id);


--
-- Name: ix_configuration_pokayoke_checklist_items_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_pokayoke_checklist_items_id ON configuration.pokayoke_checklist_items USING btree (id);


--
-- Name: ix_configuration_pokayoke_checklists_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_pokayoke_checklists_id ON configuration.pokayoke_checklists USING btree (id);


--
-- Name: ix_configuration_pokayoke_completed_logs_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_pokayoke_completed_logs_id ON configuration.pokayoke_completed_logs USING btree (id);


--
-- Name: ix_configuration_pokayoke_item_responses_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_pokayoke_item_responses_id ON configuration.pokayoke_item_responses USING btree (id);


--
-- Name: ix_configuration_pokayoke_machine_assignments_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_pokayoke_machine_assignments_id ON configuration.pokayoke_machine_assignments USING btree (id);


--
-- Name: ix_configuration_work_centers_id; Type: INDEX; Schema: configuration; Owner: -
--

CREATE INDEX ix_configuration_work_centers_id ON configuration.work_centers USING btree (id);


--
-- Name: ix_documents_common_documents_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_common_documents_id ON documents.common_documents USING btree (id);


--
-- Name: ix_documents_common_folders_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_common_folders_id ON documents.common_folders USING btree (id);


--
-- Name: ix_documents_general_documents_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_general_documents_id ON documents.general_documents USING btree (id);


--
-- Name: ix_documents_general_folders_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_general_folders_id ON documents.general_folders USING btree (id);


--
-- Name: ix_documents_machine_documents_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_machine_documents_id ON documents.machine_documents USING btree (id);


--
-- Name: ix_documents_machine_folders_id; Type: INDEX; Schema: documents; Owner: -
--

CREATE INDEX ix_documents_machine_folders_id ON documents.machine_folders USING btree (id);


--
-- Name: idx_raw_material_units_stock_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX idx_raw_material_units_stock_id ON inventory.raw_material_units USING btree (stock_id);


--
-- Name: idx_raw_material_usage_part_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX idx_raw_material_usage_part_id ON inventory.raw_material_usage USING btree (part_id);


--
-- Name: idx_raw_material_usage_unit_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX idx_raw_material_usage_unit_id ON inventory.raw_material_usage USING btree (raw_material_unit_id);


--
-- Name: ix_inventory_inventory_requests_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_inventory_requests_id ON inventory.inventory_requests USING btree (id);


--
-- Name: ix_inventory_inventory_return_requests_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_inventory_return_requests_id ON inventory.inventory_return_requests USING btree (id);


--
-- Name: ix_inventory_raw_material_stock_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_raw_material_stock_id ON inventory.raw_material_stock USING btree (id);


--
-- Name: ix_inventory_raw_materials_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_raw_materials_id ON inventory.raw_materials USING btree (id);


--
-- Name: ix_inventory_tool_issue_documents_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_tool_issue_documents_id ON inventory.tool_issue_documents USING btree (id);


--
-- Name: ix_inventory_tool_issues_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_tool_issues_id ON inventory.tool_issues USING btree (id);


--
-- Name: ix_inventory_tools_list_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_tools_list_id ON inventory.tools_list USING btree (id);


--
-- Name: ix_inventory_vendors_id; Type: INDEX; Schema: inventory; Owner: -
--

CREATE INDEX ix_inventory_vendors_id ON inventory.vendors USING btree (id);


--
-- Name: ix_maintenance_component_issues_id; Type: INDEX; Schema: maintenance; Owner: -
--

CREATE INDEX ix_maintenance_component_issues_id ON maintenance.component_issues USING btree (id);


--
-- Name: ix_maintenance_help_support_id; Type: INDEX; Schema: maintenance; Owner: -
--

CREATE INDEX ix_maintenance_help_support_id ON maintenance.help_support USING btree (id);


--
-- Name: ix_maintenance_machine_breakdown_id; Type: INDEX; Schema: maintenance; Owner: -
--

CREATE INDEX ix_maintenance_machine_breakdown_id ON maintenance.machine_breakdown USING btree (id);


--
-- Name: ix_maintenance_oee_issues_id; Type: INDEX; Schema: maintenance; Owner: -
--

CREATE INDEX ix_maintenance_oee_issues_id ON maintenance.oee_issues USING btree (id);


--
-- Name: ix_mc_notifications_document_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_mc_notifications_document_id ON notifications.mc_notifications USING btree (document_id);


--
-- Name: ix_mc_notifications_is_acknowledged; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_mc_notifications_is_acknowledged ON notifications.mc_notifications USING btree (is_acknowledged);


--
-- Name: ix_mc_notifications_is_rejected; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_mc_notifications_is_rejected ON notifications.mc_notifications USING btree (is_rejected);


--
-- Name: ix_mc_notifications_mc_user_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_mc_notifications_mc_user_id ON notifications.mc_notifications USING btree (mc_user_id);


--
-- Name: ix_notifications_activity_log_action; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_action ON notifications.activity_log USING btree (action);


--
-- Name: ix_notifications_activity_log_entity_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_entity_id ON notifications.activity_log USING btree (entity_id);


--
-- Name: ix_notifications_activity_log_entity_type; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_entity_type ON notifications.activity_log USING btree (entity_type);


--
-- Name: ix_notifications_activity_log_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_id ON notifications.activity_log USING btree (id);


--
-- Name: ix_notifications_activity_log_order_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_order_id ON notifications.activity_log USING btree (order_id);


--
-- Name: ix_notifications_activity_log_timestamp; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_activity_log_timestamp ON notifications.activity_log USING btree ("timestamp");


--
-- Name: ix_notifications_component_issues_notification_comp_issues_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_component_issues_notification_comp_issues_id ON notifications.component_issues_notification USING btree (comp_issues_id);


--
-- Name: ix_notifications_component_issues_notification_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_component_issues_notification_id ON notifications.component_issues_notification USING btree (id);


--
-- Name: ix_notifications_inspection_notifications_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_inspection_notifications_id ON notifications.inspection_notifications USING btree (id);


--
-- Name: ix_notifications_machine_calibration_notification_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_machine_calibration_notification_id ON notifications.machine_calibration_notification USING btree (id);


--
-- Name: ix_notifications_machine_notifications_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_machine_notifications_id ON notifications.machine_notifications USING btree (id);


--
-- Name: ix_notifications_machine_notifications_machine_breakdown_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_machine_notifications_machine_breakdown_id ON notifications.machine_notifications USING btree (machine_breakdown_id);


--
-- Name: ix_notifications_order_notifications_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_order_notifications_id ON notifications.order_notifications USING btree (id);


--
-- Name: ix_notifications_pc_notifications_activity_log_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_pc_notifications_activity_log_id ON notifications.pc_notifications USING btree (activity_log_id);


--
-- Name: ix_notifications_pc_notifications_created_at; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_pc_notifications_created_at ON notifications.pc_notifications USING btree (created_at);


--
-- Name: ix_notifications_pc_notifications_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_pc_notifications_id ON notifications.pc_notifications USING btree (id);


--
-- Name: ix_notifications_pc_notifications_is_read; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_pc_notifications_is_read ON notifications.pc_notifications USING btree (is_read);


--
-- Name: ix_notifications_pc_notifications_pc_user_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_pc_notifications_pc_user_id ON notifications.pc_notifications USING btree (pc_user_id);


--
-- Name: ix_notifications_tool_issues_notification_id; Type: INDEX; Schema: notifications; Owner: -
--

CREATE INDEX ix_notifications_tool_issues_notification_id ON notifications.tool_issues_notification USING btree (id);


--
-- Name: idx_operations_vendor_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_operations_vendor_id ON oms.operations USING btree (vendor_id);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_orders_user_id ON oms.orders USING btree (user_id);


--
-- Name: idx_out_source_op_status_operation_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_out_source_op_status_operation_id ON oms.out_source_operation_status USING btree (operation_id);


--
-- Name: idx_out_source_op_status_part_order; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_out_source_op_status_part_order ON oms.out_source_operation_status USING btree (part_id, order_id);


--
-- Name: idx_parts_raw_material_unit_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_parts_raw_material_unit_id ON oms.parts USING btree (raw_material_unit_id);


--
-- Name: idx_parts_vendor_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX idx_parts_vendor_id ON oms.parts USING btree (vendor_id);


--
-- Name: ix_oms_assemblies_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_assemblies_id ON oms.assemblies USING btree (id);


--
-- Name: ix_oms_document_extracted_data_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_document_extracted_data_id ON oms.document_extracted_data USING btree (id);


--
-- Name: ix_oms_documents_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_documents_id ON oms.documents USING btree (id);


--
-- Name: ix_oms_operation_documents_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_operation_documents_id ON oms.operation_documents USING btree (id);


--
-- Name: ix_oms_operations_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_operations_id ON oms.operations USING btree (id);


--
-- Name: ix_oms_order_documents_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_order_documents_id ON oms.order_documents USING btree (id);


--
-- Name: ix_oms_order_part_priorities_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_order_part_priorities_id ON oms.order_part_priorities USING btree (id);


--
-- Name: ix_oms_order_parts_raw_material_linked_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_order_parts_raw_material_linked_id ON oms.order_parts_raw_material_linked USING btree (id);


--
-- Name: ix_oms_order_schedule_status_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_order_schedule_status_id ON oms.order_schedule_status USING btree (id);


--
-- Name: ix_oms_orders_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_orders_id ON oms.orders USING btree (id);


--
-- Name: ix_oms_out_source_operation_status_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_out_source_operation_status_id ON oms.out_source_operation_status USING btree (id);


--
-- Name: ix_oms_out_source_parts_status_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_out_source_parts_status_id ON oms.out_source_parts_status USING btree (id);


--
-- Name: ix_oms_part_types_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_part_types_id ON oms.part_types USING btree (id);


--
-- Name: ix_oms_parts_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_parts_id ON oms.parts USING btree (id);


--
-- Name: ix_oms_process_plans_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_process_plans_id ON oms.process_plans USING btree (id);


--
-- Name: ix_oms_products_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_products_id ON oms.products USING btree (id);


--
-- Name: ix_oms_tools_with_part_id; Type: INDEX; Schema: oms; Owner: -
--

CREATE INDEX ix_oms_tools_with_part_id ON oms.tools_with_part USING btree (id);


--
-- Name: ix_production_monitoring_machine_live_history_id; Type: INDEX; Schema: production_monitoring; Owner: -
--

CREATE INDEX ix_production_monitoring_machine_live_history_id ON production_monitoring.machine_live_history USING btree (id);


--
-- Name: ix_production_monitoring_oee_issue_id; Type: INDEX; Schema: production_monitoring; Owner: -
--

CREATE INDEX ix_production_monitoring_oee_issue_id ON production_monitoring.oee_issue USING btree (id);


--
-- Name: ix_production_monitoring_shift_summary_id; Type: INDEX; Schema: production_monitoring; Owner: -
--

CREATE INDEX ix_production_monitoring_shift_summary_id ON production_monitoring.shift_summary USING btree (id);


--
-- Name: ix_quality_ftp_status_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_ftp_status_id ON quality.ftp_status USING btree (id);


--
-- Name: ix_quality_inspection_plan_status_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_inspection_plan_status_id ON quality.inspection_plan_status USING btree (id);


--
-- Name: ix_quality_master_boc_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_master_boc_id ON quality.master_boc USING btree (id);


--
-- Name: ix_quality_notes_document_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_notes_document_id ON quality.notes USING btree (document_id);


--
-- Name: ix_quality_notes_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_notes_id ON quality.notes USING btree (id);


--
-- Name: ix_quality_notes_part_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_notes_part_id ON quality.notes USING btree (part_id);


--
-- Name: ix_quality_stage_inspection_id; Type: INDEX; Schema: quality; Owner: -
--

CREATE INDEX ix_quality_stage_inspection_id ON quality.stage_inspection USING btree (id);


--
-- Name: idx_operation_status_operation_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX idx_operation_status_operation_id ON scheduling.operation_status USING btree (operation_id);


--
-- Name: idx_operation_status_operator_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX idx_operation_status_operator_id ON scheduling.operation_status USING btree (operator_id);


--
-- Name: idx_operation_status_status; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX idx_operation_status_status ON scheduling.operation_status USING btree (status);


--
-- Name: ix_scheduling_efficiency_factor_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_efficiency_factor_id ON scheduling.efficiency_factor USING btree (id);


--
-- Name: ix_scheduling_machine_downtimes_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_machine_downtimes_id ON scheduling.machine_downtimes USING btree (id);


--
-- Name: ix_scheduling_machine_operator_shift_assignment_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_machine_operator_shift_assignment_id ON scheduling.machine_operator_shift_assignment USING btree (id);


--
-- Name: ix_scheduling_machine_schedule_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_machine_schedule_id ON scheduling.machine_schedule USING btree (id);


--
-- Name: ix_scheduling_machine_status_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_machine_status_id ON scheduling.machine_status USING btree (id);


--
-- Name: ix_scheduling_notifications_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_notifications_id ON scheduling.notifications USING btree (id);


--
-- Name: ix_scheduling_operation_status_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_operation_status_id ON scheduling.operation_status USING btree (id);


--
-- Name: ix_scheduling_order_schedule_status_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_order_schedule_status_id ON scheduling.order_schedule_status USING btree (id);


--
-- Name: ix_scheduling_part_schedule_status_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_part_schedule_status_id ON scheduling.part_schedule_status USING btree (id);


--
-- Name: ix_scheduling_planned_schedule_items_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_planned_schedule_items_id ON scheduling.planned_schedule_items USING btree (id);


--
-- Name: ix_scheduling_production_logs_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_production_logs_id ON scheduling.production_logs USING btree (id);


--
-- Name: ix_scheduling_rescheduling_items_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_rescheduling_items_id ON scheduling.rescheduling_items USING btree (id);


--
-- Name: ix_scheduling_schedule_history_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_schedule_history_id ON scheduling.schedule_history USING btree (id);


--
-- Name: ix_scheduling_shift_hours_configuration_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_shift_hours_configuration_id ON scheduling.shift_hours_configuration USING btree (id);


--
-- Name: ix_scheduling_shift_timing_configuration_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_shift_timing_configuration_id ON scheduling.shift_timing_configuration USING btree (id);


--
-- Name: ix_scheduling_status_id; Type: INDEX; Schema: scheduling; Owner: -
--

CREATE INDEX ix_scheduling_status_id ON scheduling.status USING btree (id);


--
-- Name: customers trg_set_updated_at; Type: TRIGGER; Schema: configuration; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON configuration.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: assemblies trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.assemblies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: documents trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: operation_documents trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.operation_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: operations trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.operations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: order_documents trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.order_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: orders trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: part_types trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.part_types FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: parts trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.parts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: products trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tools_with_part trg_set_updated_at; Type: TRIGGER; Schema: oms; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON oms.tools_with_part FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: machine_live_status machine_live_status_history_trigger; Type: TRIGGER; Schema: production_monitoring; Owner: -
--

CREATE TRIGGER machine_live_status_history_trigger BEFORE UPDATE ON production_monitoring.machine_live_status FOR EACH ROW EXECUTE FUNCTION production_monitoring.machine_live_status_history_function();


--
-- Name: order_schedule_status trg_sync_order_status; Type: TRIGGER; Schema: scheduling; Owner: -
--

CREATE TRIGGER trg_sync_order_status AFTER INSERT OR UPDATE OF status ON scheduling.order_schedule_status FOR EACH ROW EXECUTE FUNCTION public.sync_order_status();


--
-- Name: operation_status update_operation_status_updated_at; Type: TRIGGER; Schema: scheduling; Owner: -
--

CREATE TRIGGER update_operation_status_updated_at BEFORE UPDATE ON scheduling.operation_status FOR EACH ROW EXECUTE FUNCTION scheduling.update_updated_at_column();


--
-- Name: operator_leaves operator_leaves_operator_id_fkey; Type: FK CONSTRAINT; Schema: accesscontrol; Owner: -
--

ALTER TABLE ONLY accesscontrol.operator_leaves
    ADD CONSTRAINT operator_leaves_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: customers customers_user_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.customers
    ADD CONSTRAINT customers_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machines machines_user_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.machines
    ADD CONSTRAINT machines_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machines machines_work_center_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.machines
    ADD CONSTRAINT machines_work_center_id_fkey FOREIGN KEY (work_center_id) REFERENCES configuration.work_centers(id);


--
-- Name: pokayoke_checklist_items pokayoke_checklist_items_checklist_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_checklist_items
    ADD CONSTRAINT pokayoke_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES configuration.pokayoke_checklists(id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_assignment_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_assignment_id_fkey FOREIGN KEY (assignment_id) REFERENCES configuration.pokayoke_machine_assignments(id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_checklist_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES configuration.pokayoke_checklists(id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_machine_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_operator_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: pokayoke_completed_logs pokayoke_completed_logs_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_completed_logs
    ADD CONSTRAINT pokayoke_completed_logs_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: pokayoke_item_responses pokayoke_item_responses_approved_by_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_item_responses
    ADD CONSTRAINT pokayoke_item_responses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: pokayoke_item_responses pokayoke_item_responses_item_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_item_responses
    ADD CONSTRAINT pokayoke_item_responses_item_id_fkey FOREIGN KEY (item_id) REFERENCES configuration.pokayoke_checklist_items(id);


--
-- Name: pokayoke_machine_assignments pokayoke_machine_assignments_checklist_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_machine_assignments
    ADD CONSTRAINT pokayoke_machine_assignments_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES configuration.pokayoke_checklists(id);


--
-- Name: pokayoke_machine_assignments pokayoke_machine_assignments_machine_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.pokayoke_machine_assignments
    ADD CONSTRAINT pokayoke_machine_assignments_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: work_centers work_centers_user_id_fkey; Type: FK CONSTRAINT; Schema: configuration; Owner: -
--

ALTER TABLE ONLY configuration.work_centers
    ADD CONSTRAINT work_centers_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: common_documents common_documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_documents
    ADD CONSTRAINT common_documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES documents.common_folders(id);


--
-- Name: common_documents common_documents_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_documents
    ADD CONSTRAINT common_documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.common_documents(id);


--
-- Name: common_folders common_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_folders
    ADD CONSTRAINT common_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.common_folders(id);


--
-- Name: common_documents fk_common_documents_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_documents
    ADD CONSTRAINT fk_common_documents_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: common_folders fk_common_folders_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.common_folders
    ADD CONSTRAINT fk_common_folders_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: general_documents fk_general_documents_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_documents
    ADD CONSTRAINT fk_general_documents_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: general_folders fk_general_folders_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_folders
    ADD CONSTRAINT fk_general_folders_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_documents fk_machine_documents_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents
    ADD CONSTRAINT fk_machine_documents_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_folders fk_machine_folders_user_id; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_folders
    ADD CONSTRAINT fk_machine_folders_user_id FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: general_documents general_documents_general_folder_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_documents
    ADD CONSTRAINT general_documents_general_folder_id_fkey FOREIGN KEY (general_folder_id) REFERENCES documents.general_folders(id);


--
-- Name: general_documents general_documents_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_documents
    ADD CONSTRAINT general_documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.general_documents(id);


--
-- Name: general_folders general_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.general_folders
    ADD CONSTRAINT general_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.general_folders(id);


--
-- Name: machine_documents machine_documents_machine_folder_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents
    ADD CONSTRAINT machine_documents_machine_folder_id_fkey FOREIGN KEY (machine_folder_id) REFERENCES documents.machine_folders(id);


--
-- Name: machine_documents machine_documents_machine_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents
    ADD CONSTRAINT machine_documents_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_documents machine_documents_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_documents
    ADD CONSTRAINT machine_documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.machine_documents(id);


--
-- Name: machine_folders machine_folders_machine_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_folders
    ADD CONSTRAINT machine_folders_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_folders machine_folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: documents; Owner: -
--

ALTER TABLE ONLY documents.machine_folders
    ADD CONSTRAINT machine_folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES documents.machine_folders(id);


--
-- Name: inventory_requests inventory_requests_inventory_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_requests
    ADD CONSTRAINT inventory_requests_inventory_supervisor_id_fkey FOREIGN KEY (inventory_supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: inventory_requests inventory_requests_operator_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_requests
    ADD CONSTRAINT inventory_requests_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: inventory_return_requests inventory_return_requests_inventory_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_return_requests
    ADD CONSTRAINT inventory_return_requests_inventory_supervisor_id_fkey FOREIGN KEY (inventory_supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: inventory_return_requests inventory_return_requests_operator_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_return_requests
    ADD CONSTRAINT inventory_return_requests_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: inventory_return_requests inventory_return_requests_requested_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.inventory_return_requests
    ADD CONSTRAINT inventory_return_requests_requested_id_fkey FOREIGN KEY (requested_id) REFERENCES inventory.inventory_requests(id);


--
-- Name: raw_material_stock raw_material_stock_material_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_stock
    ADD CONSTRAINT raw_material_stock_material_id_fkey FOREIGN KEY (material_id) REFERENCES inventory.raw_materials(id);


--
-- Name: raw_material_stock raw_material_stock_received_vendor_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_stock
    ADD CONSTRAINT raw_material_stock_received_vendor_id_fkey FOREIGN KEY (received_vendor_id) REFERENCES inventory.vendors(id);


--
-- Name: raw_material_stock raw_material_stock_user_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_stock
    ADD CONSTRAINT raw_material_stock_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: raw_material_units raw_material_units_stock_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_units
    ADD CONSTRAINT raw_material_units_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES inventory.raw_material_stock(id) ON DELETE CASCADE;


--
-- Name: raw_material_usage raw_material_usage_part_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_usage
    ADD CONSTRAINT raw_material_usage_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id) ON DELETE CASCADE;


--
-- Name: raw_material_usage raw_material_usage_raw_material_unit_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_usage
    ADD CONSTRAINT raw_material_usage_raw_material_unit_id_fkey FOREIGN KEY (raw_material_unit_id) REFERENCES inventory.raw_material_units(id);


--
-- Name: raw_material_usage raw_material_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.raw_material_usage
    ADD CONSTRAINT raw_material_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: tool_issue_documents tool_issue_documents_tool_issue_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issue_documents
    ADD CONSTRAINT tool_issue_documents_tool_issue_id_fkey FOREIGN KEY (tool_issue_id) REFERENCES inventory.tool_issues(id) ON DELETE CASCADE;


--
-- Name: tool_issues tool_issues_inventory_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issues
    ADD CONSTRAINT tool_issues_inventory_supervisor_id_fkey FOREIGN KEY (inventory_supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: tool_issues tool_issues_operator_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issues
    ADD CONSTRAINT tool_issues_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: tool_issues tool_issues_request_id_fkey; Type: FK CONSTRAINT; Schema: inventory; Owner: -
--

ALTER TABLE ONLY inventory.tool_issues
    ADD CONSTRAINT tool_issues_request_id_fkey FOREIGN KEY (request_id) REFERENCES inventory.inventory_requests(id) ON DELETE CASCADE;


--
-- Name: component_issues component_issues_machine_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.component_issues
    ADD CONSTRAINT component_issues_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: component_issues component_issues_reported_by_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.component_issues
    ADD CONSTRAINT component_issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: help_support help_support_machine_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: help_support help_support_part_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: help_support help_support_production_order_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_production_order_id_fkey FOREIGN KEY (production_order_id) REFERENCES oms.orders(id);


--
-- Name: help_support help_support_replied_by_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_replied_by_fkey FOREIGN KEY (replied_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: help_support help_support_reported_by_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.help_support
    ADD CONSTRAINT help_support_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_breakdown machine_breakdown_machine_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.machine_breakdown
    ADD CONSTRAINT machine_breakdown_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_breakdown machine_breakdown_reported_by_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.machine_breakdown
    ADD CONSTRAINT machine_breakdown_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: oee_issues oee_issues_machine_id_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.oee_issues
    ADD CONSTRAINT oee_issues_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: oee_issues oee_issues_reported_by_fkey; Type: FK CONSTRAINT; Schema: maintenance; Owner: -
--

ALTER TABLE ONLY maintenance.oee_issues
    ADD CONSTRAINT oee_issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES accesscontrol.access_users(id);


--
-- Name: activity_log activity_log_order_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.activity_log
    ADD CONSTRAINT activity_log_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: activity_log activity_log_user_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.activity_log
    ADD CONSTRAINT activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: inspection_notifications inspection_notifications_order_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.inspection_notifications
    ADD CONSTRAINT inspection_notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: machine_calibration_notification machine_calibration_notification_machine_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.machine_calibration_notification
    ADD CONSTRAINT machine_calibration_notification_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: mc_notifications mc_notifications_document_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.mc_notifications
    ADD CONSTRAINT mc_notifications_document_id_fkey FOREIGN KEY (document_id) REFERENCES oms.documents(id);


--
-- Name: mc_notifications mc_notifications_mc_user_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.mc_notifications
    ADD CONSTRAINT mc_notifications_mc_user_id_fkey FOREIGN KEY (mc_user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: pc_notifications pc_notifications_activity_log_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.pc_notifications
    ADD CONSTRAINT pc_notifications_activity_log_id_fkey FOREIGN KEY (activity_log_id) REFERENCES notifications.activity_log(id);


--
-- Name: pc_notifications pc_notifications_pc_user_id_fkey; Type: FK CONSTRAINT; Schema: notifications; Owner: -
--

ALTER TABLE ONLY notifications.pc_notifications
    ADD CONSTRAINT pc_notifications_pc_user_id_fkey FOREIGN KEY (pc_user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: assemblies assemblies_parent_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.assemblies
    ADD CONSTRAINT assemblies_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES oms.assemblies(id);


--
-- Name: assemblies assemblies_product_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.assemblies
    ADD CONSTRAINT assemblies_product_id_fkey FOREIGN KEY (product_id) REFERENCES oms.products(id);


--
-- Name: assemblies assemblies_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.assemblies
    ADD CONSTRAINT assemblies_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: document_extracted_data document_extracted_data_document_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.document_extracted_data
    ADD CONSTRAINT document_extracted_data_document_id_fkey FOREIGN KEY (document_id) REFERENCES oms.documents(id);


--
-- Name: document_extracted_data document_extracted_data_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.document_extracted_data
    ADD CONSTRAINT document_extracted_data_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: documents documents_assembly_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents
    ADD CONSTRAINT documents_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES oms.assemblies(id);


--
-- Name: documents documents_parent_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents
    ADD CONSTRAINT documents_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES oms.documents(id);


--
-- Name: documents documents_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents
    ADD CONSTRAINT documents_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: documents documents_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.documents
    ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: operation_documents fk_operation_documents_parent; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operation_documents
    ADD CONSTRAINT fk_operation_documents_parent FOREIGN KEY (parent_id) REFERENCES oms.operation_documents(id) ON DELETE SET NULL;


--
-- Name: operations fk_operations_machine_id; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT fk_operations_machine_id FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: operations fk_operations_part_type; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT fk_operations_part_type FOREIGN KEY (part_type_id) REFERENCES oms.part_types(id);


--
-- Name: order_documents fk_order_documents_parent; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_documents
    ADD CONSTRAINT fk_order_documents_parent FOREIGN KEY (parent_id) REFERENCES oms.order_documents(id);


--
-- Name: operation_documents operation_documents_operation_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operation_documents
    ADD CONSTRAINT operation_documents_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: operation_documents operation_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operation_documents
    ADD CONSTRAINT operation_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: operations operations_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT operations_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: operations operations_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT operations_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: operations operations_vendor_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.operations
    ADD CONSTRAINT operations_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES inventory.vendors(id);


--
-- Name: order_documents order_documents_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_documents
    ADD CONSTRAINT order_documents_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: order_documents order_documents_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_documents
    ADD CONSTRAINT order_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: order_part_priorities order_part_priorities_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_part_priorities
    ADD CONSTRAINT order_part_priorities_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: order_part_priorities order_part_priorities_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_part_priorities
    ADD CONSTRAINT order_part_priorities_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: order_part_priorities order_part_priorities_product_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_part_priorities
    ADD CONSTRAINT order_part_priorities_product_id_fkey FOREIGN KEY (product_id) REFERENCES oms.products(id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_stock_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_stock_id_fkey FOREIGN KEY (stock_id) REFERENCES inventory.raw_material_stock(id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: order_parts_raw_material_linked order_parts_raw_material_linked_vendor_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_parts_raw_material_linked
    ADD CONSTRAINT order_parts_raw_material_linked_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES inventory.vendors(id);


--
-- Name: order_schedule_status order_schedule_status_operation_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status
    ADD CONSTRAINT order_schedule_status_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: order_schedule_status order_schedule_status_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status
    ADD CONSTRAINT order_schedule_status_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: order_schedule_status order_schedule_status_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status
    ADD CONSTRAINT order_schedule_status_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: order_schedule_status order_schedule_status_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.order_schedule_status
    ADD CONSTRAINT order_schedule_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: orders orders_admin_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES configuration.customers(id);


--
-- Name: orders orders_manufacturing_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_manufacturing_coordinator_id_fkey FOREIGN KEY (manufacturing_coordinator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: orders orders_product_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_product_id_fkey FOREIGN KEY (product_id) REFERENCES oms.products(id);


--
-- Name: orders orders_project_coordinator_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_project_coordinator_id_fkey FOREIGN KEY (project_coordinator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: out_source_operation_status out_source_operation_status_operation_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_operation_status
    ADD CONSTRAINT out_source_operation_status_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: out_source_operation_status out_source_operation_status_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_operation_status
    ADD CONSTRAINT out_source_operation_status_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: out_source_operation_status out_source_operation_status_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_operation_status
    ADD CONSTRAINT out_source_operation_status_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: out_source_parts_status out_source_parts_status_order_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_parts_status
    ADD CONSTRAINT out_source_parts_status_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: out_source_parts_status out_source_parts_status_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.out_source_parts_status
    ADD CONSTRAINT out_source_parts_status_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: part_types part_types_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.part_types
    ADD CONSTRAINT part_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: parts parts_assembly_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES oms.assemblies(id);


--
-- Name: parts parts_product_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_product_id_fkey FOREIGN KEY (product_id) REFERENCES oms.products(id);


--
-- Name: parts parts_raw_material_unit_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_raw_material_unit_id_fkey FOREIGN KEY (raw_material_unit_id) REFERENCES inventory.raw_material_units(id);


--
-- Name: parts parts_type_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_type_id_fkey FOREIGN KEY (type_id) REFERENCES oms.part_types(id);


--
-- Name: parts parts_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: parts parts_vendor_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.parts
    ADD CONSTRAINT parts_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES inventory.vendors(id);


--
-- Name: process_plans process_plans_operation_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.process_plans
    ADD CONSTRAINT process_plans_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: products products_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.products
    ADD CONSTRAINT products_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tools_with_part tools_with_part_operation_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.tools_with_part
    ADD CONSTRAINT tools_with_part_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: tools_with_part tools_with_part_part_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.tools_with_part
    ADD CONSTRAINT tools_with_part_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: tools_with_part tools_with_part_user_id_fkey; Type: FK CONSTRAINT; Schema: oms; Owner: -
--

ALTER TABLE ONLY oms.tools_with_part
    ADD CONSTRAINT tools_with_part_user_id_fkey FOREIGN KEY (user_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_live_history machine_live_history_current_operation_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history
    ADD CONSTRAINT machine_live_history_current_operation_id_fkey FOREIGN KEY (current_operation_id) REFERENCES oms.operations(id);


--
-- Name: machine_live_history machine_live_history_current_order_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history
    ADD CONSTRAINT machine_live_history_current_order_id_fkey FOREIGN KEY (current_order_id) REFERENCES oms.orders(id);


--
-- Name: machine_live_history machine_live_history_current_part_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history
    ADD CONSTRAINT machine_live_history_current_part_id_fkey FOREIGN KEY (current_part_id) REFERENCES oms.parts(id);


--
-- Name: machine_live_history machine_live_history_machine_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_history
    ADD CONSTRAINT machine_live_history_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_live_status machine_live_status_current_operation_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_current_operation_id_fkey FOREIGN KEY (current_operation_id) REFERENCES oms.operations(id);


--
-- Name: machine_live_status machine_live_status_current_order_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_current_order_id_fkey FOREIGN KEY (current_order_id) REFERENCES oms.orders(id);


--
-- Name: machine_live_status machine_live_status_current_part_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_current_part_id_fkey FOREIGN KEY (current_part_id) REFERENCES oms.parts(id);


--
-- Name: machine_live_status machine_live_status_machine_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.machine_live_status
    ADD CONSTRAINT machine_live_status_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: oee_issue oee_issue_machine_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.oee_issue
    ADD CONSTRAINT oee_issue_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: shift_summary shift_summary_machine_id_fkey; Type: FK CONSTRAINT; Schema: production_monitoring; Owner: -
--

ALTER TABLE ONLY production_monitoring.shift_summary
    ADD CONSTRAINT shift_summary_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_downtimes fk_machine_downtimes_status_id; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_downtimes
    ADD CONSTRAINT fk_machine_downtimes_status_id FOREIGN KEY (status_id) REFERENCES scheduling.status(id);


--
-- Name: operation_status fk_operation_status_operator; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT fk_operation_status_operator FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_downtimes machine_downtimes_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_downtimes
    ADD CONSTRAINT machine_downtimes_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_operator_shift_assignment machine_operator_shift_assignment_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_operator_shift_assignment
    ADD CONSTRAINT machine_operator_shift_assignment_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_operator_shift_assignment machine_operator_shift_assignment_operator_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_operator_shift_assignment
    ADD CONSTRAINT machine_operator_shift_assignment_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: machine_operator_shift_assignment machine_operator_shift_assignment_shift_config_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_operator_shift_assignment
    ADD CONSTRAINT machine_operator_shift_assignment_shift_config_id_fkey FOREIGN KEY (shift_config_id) REFERENCES scheduling.shift_hours_configuration(id);


--
-- Name: machine_schedule machine_schedule_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule
    ADD CONSTRAINT machine_schedule_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_schedule machine_schedule_operation_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule
    ADD CONSTRAINT machine_schedule_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: machine_schedule machine_schedule_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule
    ADD CONSTRAINT machine_schedule_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: machine_schedule machine_schedule_part_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_schedule
    ADD CONSTRAINT machine_schedule_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: machine_status machine_status_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_status
    ADD CONSTRAINT machine_status_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: machine_status machine_status_status_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.machine_status
    ADD CONSTRAINT machine_status_status_id_fkey FOREIGN KEY (status_id) REFERENCES scheduling.status(id);


--
-- Name: notifications notifications_operator_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.notifications
    ADD CONSTRAINT notifications_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: notifications notifications_production_log_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.notifications
    ADD CONSTRAINT notifications_production_log_id_fkey FOREIGN KEY (production_log_id) REFERENCES scheduling.production_logs(id);


--
-- Name: notifications notifications_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.notifications
    ADD CONSTRAINT notifications_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: operation_status operation_status_operation_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT operation_status_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: operation_status operation_status_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT operation_status_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: operation_status operation_status_part_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.operation_status
    ADD CONSTRAINT operation_status_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: order_schedule_status order_schedule_status_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.order_schedule_status
    ADD CONSTRAINT order_schedule_status_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: order_schedule_status order_schedule_status_product_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.order_schedule_status
    ADD CONSTRAINT order_schedule_status_product_id_fkey FOREIGN KEY (product_id) REFERENCES oms.products(id);


--
-- Name: part_schedule_status part_schedule_status_part_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.part_schedule_status
    ADD CONSTRAINT part_schedule_status_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: part_schedule_status part_schedule_status_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.part_schedule_status
    ADD CONSTRAINT part_schedule_status_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES oms.orders(id);


--
-- Name: planned_schedule_items planned_schedule_items_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: planned_schedule_items planned_schedule_items_operation_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: planned_schedule_items planned_schedule_items_part_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: planned_schedule_items planned_schedule_items_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES oms.orders(id);


--
-- Name: planned_schedule_items planned_schedule_items_sale_order_number_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_sale_order_number_fkey FOREIGN KEY (sale_order_number) REFERENCES oms.orders(sale_order_number);


--
-- Name: planned_schedule_items planned_schedule_items_schedule_history_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.planned_schedule_items
    ADD CONSTRAINT planned_schedule_items_schedule_history_id_fkey FOREIGN KEY (schedule_history_id) REFERENCES scheduling.schedule_history(id);


--
-- Name: production_logs production_logs_operation_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.production_logs
    ADD CONSTRAINT production_logs_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: production_logs production_logs_operator_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.production_logs
    ADD CONSTRAINT production_logs_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: production_logs production_logs_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.production_logs
    ADD CONSTRAINT production_logs_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES accesscontrol.access_users(id);


--
-- Name: rescheduling_items rescheduling_items_machine_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES configuration.machines(id);


--
-- Name: rescheduling_items rescheduling_items_operation_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_operation_id_fkey FOREIGN KEY (operation_id) REFERENCES oms.operations(id);


--
-- Name: rescheduling_items rescheduling_items_order_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES oms.orders(id);


--
-- Name: rescheduling_items rescheduling_items_order_number_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_order_number_fkey FOREIGN KEY (order_number) REFERENCES oms.orders(sale_order_number);


--
-- Name: rescheduling_items rescheduling_items_part_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.rescheduling_items
    ADD CONSTRAINT rescheduling_items_part_id_fkey FOREIGN KEY (part_id) REFERENCES oms.parts(id);


--
-- Name: shift_timing_configuration shift_timing_configuration_shift_config_id_fkey; Type: FK CONSTRAINT; Schema: scheduling; Owner: -
--

ALTER TABLE ONLY scheduling.shift_timing_configuration
    ADD CONSTRAINT shift_timing_configuration_shift_config_id_fkey FOREIGN KEY (shift_config_id) REFERENCES scheduling.shift_hours_configuration(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 3oIRzv2nDX7sG83Xcjjh2sFp3fnQnYxKCOqRePEUc1BgRGzZajbs5tjLzTiGSQX

