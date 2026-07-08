import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import {
  Modal,
  Table,
  InputNumber,
  Input,
  Checkbox,
  Button,
  message,
  Popconfirm,
  Space,
  Divider,
  Alert,
} from "antd";
import { PlusOutlined, DeleteOutlined, CalculatorOutlined } from "@ant-design/icons";

const emptyRow = (sequence_number = 0) => ({
  id: null,
  code: "",
  label: "",
  unit: "",
  value: null,
  is_applicable: true,
  sequence_number,
});

const PAIRED_CODES = [["power_kw", "power_rate"]];

const MachineMhrPanel = ({ machine, isOpen, onClose, onCalculated }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [breakdown, setBreakdown] = useState(null);
  const [mhr, setMhr] = useState(null);

  useEffect(() => {
    if (isOpen && machine) {
      fetchParameters();
    }
  }, [isOpen, machine]);

  const fetchParameters = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/machines/${machine.id}/mhr`);
      setRows(res.data.parameters.length ? res.data.parameters : [emptyRow()]);
      setMhr(res.data.mhr);
      setBreakdown(null);
      setIsDirty(false);
    } catch (error) {
      console.error("Error fetching MHR parameters:", error);
      message.error("Failed to load MHR parameters");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (index, field, value) => {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setIsDirty(true);
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(prev.length)]);
    setIsDirty(true);
  };

  const deleteRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  // Client-side pre-check so the user gets instant feedback instead of
  // waiting on a round trip just to find out a code is duplicated.
  const validateRows = () => {
    const codes = new Set();
    for (const row of rows) {
      const code = (row.code || "").trim().toLowerCase();
      const label = (row.label || "").trim();
      if (!code || !label) {
        message.error("Every parameter needs both a code and a label");
        return false;
      }
      if (codes.has(code)) {
        message.error(`Duplicate parameter code '${code}' — codes must be unique`);
        return false;
      }
      codes.add(code);
      if (row.value != null && row.value < 0) {
        message.error(`'${label}' cannot have a negative value`);
        return false;
      }
    }
    for (const [a, b] of PAIRED_CODES) {
      const rowA = rows.find((r) => (r.code || "").trim().toLowerCase() === a);
      const rowB = rows.find((r) => (r.code || "").trim().toLowerCase() === b);
      const aOn = !!rowA?.is_applicable;
      const bOn = !!rowB?.is_applicable;
      if (aOn !== bOn) {
        message.error(`'${a}' and '${b}' must both be applicable together, or both off`);
        return false;
      }
    }
    return true;
  };

  const saveParameters = async () => {
    if (!validateRows()) return false;
    setSaving(true);
    try {
      const payload = {
        parameters: rows.map((r, i) => ({ ...r, sequence_number: i })),
      };
      const res = await axios.put(
        `${API_BASE_URL}/machines/${machine.id}/mhr/parameters`,
        payload
      );
      setRows(res.data);
      setIsDirty(false);
      message.success("Parameters saved");
      return true;
    } catch (error) {
      console.error("Error saving MHR parameters:", error);
      message.error(error?.response?.data?.detail || "Failed to save parameters");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Calculate always saves first if there are unsaved edits, so the
  // breakdown shown is never calculated from stale data.
  const calculateMhr = async () => {
    if (isDirty) {
      const saved = await saveParameters();
      if (!saved) return;
    }
    setCalculating(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/machines/${machine.id}/mhr/calculate`);
      setMhr(res.data.mhr);
      setBreakdown(res.data.breakdown);
      message.success("MHR calculated");
      onCalculated && onCalculated(res.data.mhr);
    } catch (error) {
      console.error("Error calculating MHR:", error);
      message.error(error?.response?.data?.detail || "Failed to calculate MHR");
    } finally {
      setCalculating(false);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      Modal.confirm({
        title: "Discard unsaved changes?",
        content: "You have unsaved parameter edits. Closing now will discard them.",
        okText: "Discard",
        okButtonProps: { danger: true },
        cancelText: "Keep editing",
        onOk: onClose,
      });
      return;
    }
    onClose();
  };

  const columns = [
    {
      title: "Applicable",
      key: "is_applicable",
      width: 90,
      align: "center",
      render: (_, record, index) => (
        <Checkbox
          checked={record.is_applicable}
          onChange={(e) => updateRow(index, "is_applicable", e.target.checked)}
        />
      ),
    },
    {
      title: "Parameter",
      key: "label",
      render: (_, record, index) => (
        <Input
          value={record.label}
          placeholder="e.g. Investment cost"
          status={!record.label?.trim() ? "error" : ""}
          onChange={(e) => updateRow(index, "label", e.target.value)}
        />
      ),
    },
    {
      title: "Code",
      key: "code",
      width: 160,
      render: (_, record, index) => (
        <Input
          value={record.code}
          placeholder="investment_cost"
          status={!record.code?.trim() ? "error" : ""}
          onChange={(e) => updateRow(index, "code", e.target.value)}
        />
      ),
    },
    {
      title: "Value",
      key: "value",
      width: 140,
      render: (_, record, index) => (
        <InputNumber
          style={{ width: "100%" }}
          min={0}
          value={record.value}
          onChange={(val) => updateRow(index, "value", val)}
        />
      ),
    },
    {
      title: "Unit",
      key: "unit",
      width: 100,
      render: (_, record, index) => (
        <Input
          value={record.unit}
          placeholder="Rs / KW / Hrs"
          onChange={(e) => updateRow(index, "unit", e.target.value)}
        />
      ),
    },
    {
      title: "",
      key: "actions",
      width: 50,
      align: "center",
      render: (_, record, index) => (
        <Popconfirm title="Remove this parameter?" onConfirm={() => deleteRow(index)}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={`MHR Parameters — ${machine?.type || ""} ${machine?.model || ""}`}
      open={isOpen}
      onCancel={handleClose}
      width="90%"
      style={{ maxWidth: 900 }}
      footer={null}
      destroyOnHidden
      centered
    >
      {isDirty && (
        <Alert
          type="warning"
          showIcon
          message="You have unsaved changes"
          style={{ marginBottom: 12 }}
        />
      )}

      <Table
        columns={columns}
        dataSource={rows}
        rowKey={(r, i) => r.id ?? `new-${i}`}
        pagination={false}
        loading={loading}
        size="small"
        bordered
      />

      <div style={{ marginTop: 12 }}>
        <Button icon={<PlusOutlined />} onClick={addRow}>
          Add parameter
        </Button>
      </div>

      <Divider />

      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={saveParameters}>
            Save parameters
          </Button>
        </Space>
        <Button
          type="primary"
          ghost
          icon={<CalculatorOutlined />}
          loading={calculating || saving}
          onClick={calculateMhr}
        >
          Calculate MHR
        </Button>
      </Space>

      {breakdown && (
        <div style={{ marginTop: 16, background: "#fafafa", padding: 12, borderRadius: 6 }}>
          <p style={{ margin: 0, fontWeight: 600 }}>MHR = ₹{mhr} /hr</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8c8c8c" }}>
            Power charges: ₹{breakdown.power_charges} · Utilization hrs:{" "}
            {breakdown.utilization_hours} · Machine utilization cost: ₹
            {breakdown.machine_utilization_cost} · Machine hour rate: ₹
            {breakdown.machine_hour_rate}
            {breakdown.wage_rate != null ? ` · Wage rate: ₹${breakdown.wage_rate}` : ""}
          </p>
        </div>
      )}
    </Modal>
  );
};

export default MachineMhrPanel;