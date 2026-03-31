import React, { useState, useRef } from "react";
import {
  Button,
  Modal,
  Upload,
  Table,
  Input,
  InputNumber,
  Select,
  Tag,
  Typography,
  Space,
  Alert,
  Spin,
  Tooltip,
  message,
  Popconfirm,
  Progress,
} from "antd";
import {
  UploadOutlined,
  FileWordOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  LoadingOutlined,
  PlusOutlined,
  InboxOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

const { Text, Title } = Typography;
const { Dragger } = Upload;

// ─────────────────────────────────────────────────────────────────────────────
// Inline editable cell
// ─────────────────────────────────────────────────────────────────────────────
const EditableCell = ({ value, onChange, type = "text", placeholder = "" }) => {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  if (type === "number") {
    return (
      <InputNumber
        size="small"
        min={1}
        value={value}
        onChange={onChange}
        style={{ width: 72 }}
      />
    );
  }

  if (!editing) {
    return (
      <span
        onClick={() => {
          setEditing(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        style={{ cursor: "text", minWidth: 60, display: "inline-block" }}
        className={`hover:bg-blue-50 rounded px-1 py-0.5 transition-colors ${
          !value ? "border border-dashed border-gray-300 min-h-[24px] inline-flex items-center" : ""
        }`}
      >
        {value || (
          <span className="text-blue-500 text-xs italic font-medium">
            {placeholder || "Click to enter"}
          </span>
        )}
      </span>
    );
  }

  return (
    <Input
      ref={inputRef}
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => setEditing(false)}
      onPressEnter={() => setEditing(false)}
      placeholder={placeholder}
      style={{ minWidth: 80 }}
    />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const AssemblyPartsUploadPanel = ({
  selectedItem,     // { id, itemType, label/name, product_id }
  partTypes = [],   // [{ id, type_name }]
  onPartsCreated,   // callback after successful creation
}) => {
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [step, setStep]                   = useState("upload"); // "upload" | "review"

  const [parsing, setParsing]             = useState(false);
  const [parseError, setParseError]       = useState(null);
  const [rows, setRows]                   = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  const [submitting, setSubmitting]       = useState(false);
  const [submitResults, setSubmitResults] = useState(null); // { created, duplicates, errors }

  // New state for delete parts functionality
  const [deletingParts, setDeletingParts] = useState(false);

  // ── helpers ───────────────────────────────────────────────────────────────
  const getCurrentUserId = () => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return u?.id ?? null;
    } catch {
      return null;
    }
  };

  const resetAll = () => {
    setStep("upload");
    setParsing(false);
    setParseError(null);
    setRows([]);
    setSelectedRowKeys([]);
    setSubmitResults(null);
  };

  // ── parse uploaded file ───────────────────────────────────────────────────
  const handleFileUpload = async (file) => {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["doc", "docx"].includes(ext)) {
      message.error("Only .doc or .docx files are supported");
      return false;
    }

    setParsing(true);
    setParseError(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await axios.post(`${API_BASE_URL}/parts/parse-doc`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const extracted = (res.data?.parts || []).map((p, i) => ({
        _key: i,
        ...p,
        _status: "pending", // "pending" | "success" | "duplicate" | "error"
        _error: null,
      }));

      if (extracted.length === 0) {
        setParseError(
          "No part rows were found in this file. Make sure the BOM table has the expected column headers."
        );
        setParsing(false);
        return false;
      }

      setRows(extracted);
      setSelectedRowKeys(extracted.map((r) => r._key));
      setStep("review");
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || "Failed to parse document";
      setParseError(String(msg));
    } finally {
      setParsing(false);
    }
    return false; // prevent antd auto-upload
  };

  // ── update / remove rows ─────────────────────────────────────────────────
  const updateRow = (key, field, value) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r._key === key) {
          const updatedRow = { ...r, [field]: value };
          
          // Clear error status if user is fixing required fields
          if (field === 'part_name' || field === 'part_number') {
            if (updatedRow.part_name?.trim() && updatedRow.part_number?.trim()) {
              return { ...updatedRow, _status: "pending", _error: null };
            } else if (r._status === "error" && r._error === "Part Name and Part Number are required") {
              // Only clear error if this specific error is being fixed
              return { ...updatedRow, _status: "pending", _error: null };
            }
          }
          
          return updatedRow;
        }
        return r;
      })
    );
  };

  const removeRow = (key) => {
    setRows((prev) => prev.filter((r) => r._key !== key));
    setSelectedRowKeys((prev) => prev.filter((k) => k !== key));
  };

  // ── BULK submit ───────────────────────────────────────────────────────────
  const handleCreateParts = async () => {
    const toCreate = rows.filter(
      (r) => selectedRowKeys.includes(r._key) && r._status === "pending"
    );

    if (toCreate.length === 0) {
      message.warning("No pending rows selected");
      return;
    }

    // Validate required fields before sending
    const invalid = toCreate.filter(
      (r) => !r.part_name?.trim() || !r.part_number?.trim()
    );
    if (invalid.length > 0) {
      message.error(
        `${invalid.length} row(s) are missing Part Name or Part Number.`
      );
      setRows((prev) =>
        prev.map((r) =>
          invalid.find((inv) => inv._key === r._key)
            ? {
                ...r,
                _status: "error",
                _error: "Part Name and Part Number are required",
              }
            : r
        )
      );
      return;
    }

    setSubmitting(true);
    const uid = getCurrentUserId();

    // Build the single bulk payload
    const bulkPayload = {
      parts: toCreate.map((row) => ({
        part_name:       row.part_name,
        part_number:     row.part_number,
        type_id:         row.type_id || 1,
        raw_material_id: row.raw_material_id ?? null,
        part_detail:     row.part_detail ?? null,
        assembly_id:     selectedItem?.id ?? null,
        product_id:      selectedItem?.product_id ?? null,
        user_id:         uid,
        size:            row.size || null,
        qty:             row.qty || 1,
      })),
    };

    try {
      const res = await axios.post(`${API_BASE_URL}/parts/bulk`, bulkPayload);
      const { created = [], duplicates = [], errors = [] } = res.data;

      // Build lookup maps by part_number for quick status update
      const createdNums   = new Set(created.map((p) => p.part_number));
      const duplicateNums = new Set(duplicates);
      const errorMap      = Object.fromEntries(
        errors.map((e) => [e.part_number, e.error])
      );

      setRows((prev) =>
        prev.map((r) => {
          if (!toCreate.find((tc) => tc._key === r._key)) return r;
          if (createdNums.has(r.part_number))
            return { ...r, _status: "success", _error: null };
          if (duplicateNums.has(r.part_number))
            return {
              ...r,
              _status: "duplicate",
              _error: `Part number "${r.part_number}" already exists`,
            };
          if (errorMap[r.part_number])
            return { ...r, _status: "error", _error: errorMap[r.part_number] };
          return r;
        })
      );

      setSubmitResults({ created, duplicates, errors });

      if (created.length > 0) {
        message.success(`${created.length} part(s) created successfully`);
        onPartsCreated?.();
      }
      if (duplicates.length > 0) {
        message.warning(`${duplicates.length} part(s) skipped — already exist`);
      }
      if (errors.length > 0) {
        message.error(`${errors.length} part(s) failed — see table for details`);
      }

      // Auto-close if everything succeeded
      const allSucceeded =
        created.length === toCreate.length &&
        duplicates.length === 0 &&
        errors.length === 0;
      if (allSucceeded) {
        setTimeout(() => {
          setIsModalOpen(false);
          resetAll();
        }, 600);
      }
    } catch (e) {
      const msg =
        e?.response?.data?.detail || e?.message || "Bulk create failed";
      message.error(String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  // ── BULK DELETE PARTS ─────────────────────────────────────────────────────
  const handleBulkDeleteParts = async () => {
    if (!selectedItem || selectedItem.itemType !== "assembly") return;
    
    setDeletingParts(true);
    try {
      const response = await axios.delete(`${API_BASE_URL}/parts/bulk-by-assembly/${selectedItem.id}`);
      const { deleted_count, part_ids } = response.data;
      
      if (deleted_count > 0) {
        message.success(`${deleted_count} part(s) deleted successfully`);
        onPartsCreated?.(); // Refresh parts list if callback exists
      } else {
        message.info("No parts found to delete for this assembly");
      }
    } catch (e) {
      console.error("Error bulk deleting parts", e);
      const errorMsg = e?.response?.data?.detail || e?.message || "Failed to delete parts";
      message.error(errorMsg);
    } finally {
      setDeletingParts(false);
    }
  };

  // ── column definitions ────────────────────────────────────────────────────
  const statusTag = (record) => {
    if (record._status === "success")
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          Created
        </Tag>
      );
    if (record._status === "duplicate")
      return (
        <Tooltip title={record._error}>
          <Tag color="warning" icon={<ExclamationCircleOutlined />}>
            Duplicate
          </Tag>
        </Tooltip>
      );
    if (record._status === "error")
      return (
        <Tooltip title={record._error}>
          <Tag color="error" icon={<ExclamationCircleOutlined />}>
            Error
          </Tag>
        </Tooltip>
      );
    return null;
  };

  const columns = [
    {
      title: <span className="text-xs font-semibold">PART NUMBER</span>,
      dataIndex: "part_number",
      key: "part_number",
      width: 150,
      render: (val, record) => (
        <div className="flex flex-col gap-1">
          <EditableCell
            value={val}
            placeholder="e.g. 0001-2"
            onChange={(v) => updateRow(record._key, "part_number", v)}
          />
          {statusTag(record)}
        </div>
      ),
    },
    {
      title: <span className="text-xs font-semibold">PART NAME</span>,
      dataIndex: "part_name",
      key: "part_name",
      width: 180,
      render: (val, record) => (
        <EditableCell
          value={val}
          placeholder="e.g. Housing"
          onChange={(v) => updateRow(record._key, "part_name", v)}
        />
      ),
    },
    {
      title: <span className="text-xs font-semibold">SIZE</span>,
      dataIndex: "size",
      key: "size",
      width: 160,
      render: (val, record) => (
        <EditableCell
          value={val}
          placeholder="e.g. 25x25x160"
          onChange={(v) => updateRow(record._key, "size", v)}
        />
      ),
    },
    {
      title: <span className="text-xs font-semibold">QTY</span>,
      dataIndex: "qty",
      key: "qty",
      width: 80,
      render: (val, record) => (
        <EditableCell
          type="number"
          value={val}
          onChange={(v) => updateRow(record._key, "qty", v)}
        />
      ),
    },
    {
      title: <span className="text-xs font-semibold">MATERIAL (info)</span>,
      dataIndex: "raw_material_name",
      key: "raw_material_name",
      width: 140,
      render: (val) => (
        <Text type="secondary" className="text-xs">
          {val || "—"}
        </Text>
      ),
    },
    {
      title: <span className="text-xs font-semibold">TYPE</span>,
      dataIndex: "type_id",
      key: "type_id",
      width: 140,
      render: (val, record) => (
        <Select
          size="small"
          value={val || 1}
          onChange={(v) => updateRow(record._key, "type_id", v)}
          style={{ width: 130 }}
          options={
            partTypes.length > 0
              ? partTypes.map((pt) => ({ value: pt.id, label: pt.type_name }))
              : [{ value: 1, label: "In-house (default)" }]
          }
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      fixed: "right",
      render: (_, record) =>
        record._status !== "success" ? (
          <Popconfirm
            title="Remove this row?"
            onConfirm={() => removeRow(record._key)}
            okText="Yes"
            cancelText="No"
          >
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              className="hover:bg-red-50"
            />
          </Popconfirm>
        ) : null,
    },
  ];

  // Derived counts
  const pendingSelected = rows.filter(
    (r) => selectedRowKeys.includes(r._key) && r._status === "pending"
  ).length;
  const successCount   = rows.filter((r) => r._status === "success").length;
  const dupCount       = rows.filter((r) => r._status === "duplicate").length;
  const errorCount     = rows.filter((r) => r._status === "error").length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Trigger buttons container */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="small"
          icon={<FileWordOutlined />}
          onClick={() => {
            resetAll();
            setIsModalOpen(true);
          }}
          className="border-indigo-300 text-indigo-600 hover:border-indigo-500 hover:bg-indigo-50"
        >
          Upload Parts
        </Button>
        
        <Popconfirm
          title="Delete All Parts"
          description={`Delete all parts for "${selectedItem?.label || selectedItem?.name || 'this assembly'}"? This cannot be undone.`}
          onConfirm={handleBulkDeleteParts}
          okText="Yes, Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true }}
        >
          <Button
            type="primary"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deletingParts}
            className="bg-red-600 hover:bg-red-700 border-red-600"
          >
            {deletingParts ? "Deleting…" : "Delete Parts"}
          </Button>
        </Popconfirm>
      </div>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <FileWordOutlined className="text-indigo-500" />
            <span>
              {step === "upload"
                ? "Upload Parts from BOM Document"
                : `Review Extracted Parts — ${
                    selectedItem?.label || selectedItem?.name || "Assembly"
                  }`}
            </span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => {
          if (submitting) return;
          setIsModalOpen(false);
          resetAll();
        }}
        footer={null}
        destroyOnHidden
        width="95%"
        style={{ maxWidth: 1100, top: 24 }}
      >
        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="py-4">
            <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
              <Text className="text-xs text-indigo-700">
                Upload a <strong>.docx</strong> BOM file. Parts are extracted
                from <strong>all pages</strong> of tables with columns:{" "}
                <em>
                  "Name of Part", "No. of Parts", "Size", "Part (Assy) No.,
                  Drg. Size"
                </em>
                . All extracted parts are sent to the server in a{" "}
                <strong>single bulk request</strong>.
              </Text>
            </div>

            {parseError && (
              <Alert
                type="error"
                message={parseError}
                className="mb-4"
                closable
                onClose={() => setParseError(null)}
              />
            )}

            <Dragger
              accept=".doc,.docx"
              multiple={false}
              showUploadList={false}
              beforeUpload={handleFileUpload}
              disabled={parsing}
              className="border-2 border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 transition-colors"
            >
              <div className="py-8 flex flex-col items-center gap-3">
                {parsing ? (
                  <>
                    <Spin
                      indicator={
                        <LoadingOutlined
                          style={{ fontSize: 40, color: "#6366f1" }}
                          spin
                        />
                      }
                    />
                    <Text className="text-indigo-600 font-medium">
                      Parsing document…
                    </Text>
                    <Text type="secondary" className="text-xs">
                      Extracting parts from all pages
                    </Text>
                  </>
                ) : (
                  <>
                    <InboxOutlined className="text-5xl text-indigo-400" />
                    <Text strong className="text-base text-gray-700">
                      Click or drag your BOM file here
                    </Text>
                    <Text type="secondary" className="text-sm">
                      Supports <strong>.doc</strong> and{" "}
                      <strong>.docx</strong>
                    </Text>
                  </>
                )}
              </div>
            </Dragger>
          </div>
        )}

        {/* ── STEP 2: Review ── */}
        {step === "review" && (
          <div>
            {/* Summary bar */}
            <div className="flex items-center justify-between mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
              <div className="flex items-center gap-3 flex-wrap">
                <Tag color="blue">{rows.length} rows extracted</Tag>
                {successCount > 0 && (
                  <Tag color="green">{successCount} created</Tag>
                )}
                {dupCount > 0 && (
                  <Tag color="orange">{dupCount} duplicates</Tag>
                )}
                {errorCount > 0 && (
                  <Tag color="red">{errorCount} errors</Tag>
                )}
                <Tag color="purple" icon={<ThunderboltOutlined />}>
                  Bulk API — 1 request
                </Tag>
              </div>
              <Text type="secondary" className="text-xs">
                Click any cell to edit · Select rows to create
              </Text>
            </div>

            {submitResults &&
              submitResults.created.length > 0 &&
              errorCount === 0 &&
              dupCount === 0 && (
                <Alert
                  type="success"
                  icon={<CheckCircleOutlined />}
                  message={`All ${submitResults.created.length} parts created successfully in one request!`}
                  className="mb-3"
                />
              )}

            <Table
              dataSource={rows}
              rowKey="_key"
              columns={columns}
              size="small"
              pagination={false}
              scroll={{ x: "max-content", y: "calc(70vh - 220px)" }}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
                getCheckboxProps: (record) => ({
                  disabled: record._status === "success",
                }),
              }}
              rowClassName={(record) => {
                if (record._status === "success")
                  return "bg-green-50 opacity-60";
                if (record._status === "error") return "bg-red-50";
                if (record._status === "duplicate") return "bg-yellow-50";
                return "";
              }}
              className="border border-slate-100 rounded-lg overflow-hidden"
            />

            {/* Footer actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-4 border-t border-slate-100 mt-3">
              <div className="flex items-center gap-2">
                <Button
                  size="small"
                  onClick={resetAll}
                  disabled={submitting}
                >
                  ← Re-upload
                </Button>
                <Text type="secondary" className="text-xs">
                  {pendingSelected} row(s) selected for creation
                </Text>
              </div>
              <Space>
                <Button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetAll();
                  }}
                  disabled={submitting}
                >
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  loading={submitting}
                  disabled={pendingSelected === 0}
                  onClick={handleCreateParts}
                  className="bg-indigo-600 hover:bg-indigo-700 border-indigo-600"
                >
                  {submitting
                    ? "Creating…"
                    : `Bulk Create ${pendingSelected} Part${
                        pendingSelected !== 1 ? "s" : ""
                      }`}
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default AssemblyPartsUploadPanel;