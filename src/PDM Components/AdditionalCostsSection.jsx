import React, { useState } from "react";
import { Input, InputNumber, Button, Popconfirm, message, Tag } from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CloseOutlined, DollarOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";

// ─── Shared styles (kept consistent with ProductSummary tables) ────────────

const border = "1px solid #d0d0d0";
const thStyle = {
  border, padding: "5px 10px", textAlign: "center",
  fontWeight: 700, fontSize: 12, background: "#fff",
  whiteSpace: "nowrap",
};
const tdStyle = {
  border, padding: "4px 10px", fontSize: 11,
  verticalAlign: "middle", textAlign: "center",
};
const tdStyleLeft = { ...tdStyle, textAlign: "left" };
const tdStyleRight = { ...tdStyle, textAlign: "right" };

const fmtCost = (val) =>
  val != null
    ? `Rs.${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";

// Handle key down for cost value input - only allow numbers and decimal point
export const handleCostKeyDown = (e) => {
  // Allow: Backspace, Delete, Tab, Escape, Enter, Arrow keys
  if ([8, 9, 27, 13, 37, 38, 39, 40].includes(e.keyCode)) {
    return;
  }
  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
  if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) {
    return;
  }
  // Allow: Decimal point (only one)
  if (e.key === '.' && e.target.value && !e.target.value.includes('.')) {
    return;
  }
  // Block: non-digit characters
  if (e.key && !/^\d$/.test(e.key)) {
    e.preventDefault();
  }
};

// Quick-add presets seen commonly on quotations (Tooling / Fixture / Inspection & Documentation etc.)
const PRESET_NAMES = [
  "Tooling Cost",
  "Fixture Cost",
  "Inspection Cost",
  "Documentation Cost",
  "Inspection & Documentation Cost",
  "Packaging Cost",
  "Transportation Cost",
];

/**
 * AdditionalCostsSection
 *
 * Props:
 *  - orderId: number (required to enable add/edit/delete)
 *  - costs: [{ id, cost_name, cost_value }]
 *  - onCostsChange: (newCostsArray) => void   // parent keeps the source of truth
 *  - userId: optional number, attached to created/updated cost rows
 */
const AdditionalCostsSection = ({ orderId, costs = [], onCostsChange, userId }) => {
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editValue, setEditValue] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const subtotal = costs.reduce((a, c) => a + (Number(c.cost_value) || 0), 0);

  // ── Add ──────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { message.warning("Enter a cost name"); return; }
    if (newValue == null || newValue <= 0) { message.warning("Enter a valid cost value (must be greater than 0)"); return; }
    if (!orderId) { message.warning("No order selected"); return; }

    setAdding(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/orders/${orderId}/additional-costs/`, {
        cost_name: name,
        cost_value: newValue,
        user_id: userId ?? null,
      });
      onCostsChange([...costs, res.data]);
      setNewName("");
      setNewValue(null);
      message.success("Cost added");
    } catch (e) {
      message.error(e?.response?.data?.detail || "Failed to add cost");
    } finally {
      setAdding(false);
    }
  };

  // ── Edit ─────────────────────────────────────────────────────────────────
  const startEdit = (row) => {
    setEditingId(row.id);
    setEditName(row.cost_name);
    setEditValue(row.cost_value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditValue(null);
  };

  const saveEdit = async (id) => {
    const name = editName.trim();
    if (!name) { message.warning("Cost name cannot be empty"); return; }
    if (editValue == null || editValue <= 0) { message.warning("Enter a valid cost value (must be greater than 0)"); return; }

    setSavingId(id);
    try {
      const res = await axios.put(`${API_BASE_URL}/orders/${orderId}/additional-costs/${id}`, {
        cost_name: name,
        cost_value: editValue,
        user_id: userId ?? null,
      });
      onCostsChange(costs.map((c) => (c.id === id ? res.data : c)));
      cancelEdit();
      message.success("Cost updated");
    } catch (e) {
      message.error(e?.response?.data?.detail || "Failed to update cost");
    } finally {
      setSavingId(null);
    }
  };

  // ── Delete ───────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/orders/${orderId}/additional-costs/${id}`);
      onCostsChange(costs.filter((c) => c.id !== id));
      message.success("Cost removed");
    } catch (e) {
      message.error(e?.response?.data?.detail || "Failed to delete cost");
    }
  };

  return (
    <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col">
      <div className="flex items-center justify-between px-3 sm:px-4 py-2 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <DollarOutlined className="text-blue-600" style={{ fontSize: 14 }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
            Additional Project Costs
          </span>
        </div>
        <span style={{
          background: "#2563eb", color: "#fff", borderRadius: 4, padding: "2px 8px",
          fontSize: 11, fontWeight: 600
        }}>
          {costs.length} fields
        </span>
      </div>

      <div style={{ overflowX: "auto", padding: 8 }}>
        {!orderId && (
          <div className="text-gray-500" style={{ fontSize: 11, marginBottom: 8 }}>
            Select an order to add project-related costs (Tooling, Fixture, Inspection, etc.)
          </div>
        )}

        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 400, tableLayout: "fixed", border }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: "50%", textAlign: "left" }}>Cost Name</th>
              <th style={{ ...thStyle, width: "30%" }}>Cost Value</th>
              <th style={{ ...thStyle, width: "20%" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {costs.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ ...tdStyle, color: "#94a3b8" }}>No additional costs added yet</td>
              </tr>
            ) : (
              costs.map((row, idx) => (
                <tr key={row.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={tdStyleLeft}>
                    {editingId === row.id ? (
                      <Input
                        size="small"
                        value={editName}
                        onChange={(e) => {
                          // Allow only letters, spaces, and common punctuation (no numbers)
                          const value = e.target.value.replace(/[^a-zA-Z\s&\-()]/g, '');
                          setEditName(value);
                        }}
                        style={{ fontSize: 11 }}
                      />
                    ) : (
                      row.cost_name
                    )}
                  </td>
                  <td style={tdStyleRight}>
                    {editingId === row.id ? (
                      <InputNumber
                        size="small"
                        min={0}
                        precision={2}
                        step={0.01}
                        value={editValue}
                        onChange={setEditValue}
                        style={{ width: "100%" }}
                        prefix="Rs."
                        controls={false}
                        keyboard={false}
                        onKeyDown={handleCostKeyDown}
                      />
                    ) : (
                      <span style={{ fontWeight: 600, fontSize: 11 }}>{fmtCost(row.cost_value)}</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {editingId === row.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="small"
                          type="text"
                          icon={<CheckOutlined style={{ color: "#16a34a" }} />}
                          loading={savingId === row.id}
                          onClick={() => saveEdit(row.id)}
                        />
                        <Button
                          size="small"
                          type="text"
                          icon={<CloseOutlined style={{ color: "#94a3b8" }} />}
                          onClick={cancelEdit}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          size="small"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={() => startEdit(row)}
                        />
                        <Popconfirm
                          title="Remove this cost field?"
                          onConfirm={() => handleDelete(row.id)}
                          okText="Yes"
                          cancelText="No"
                        >
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}

            {/* Subtotal row */}
            <tr style={{ background: "#f9fafb", fontWeight: 700 }}>
              <td style={{ ...tdStyleLeft, fontWeight: 700 }}>SUBTOTAL</td>
              <td style={{ ...tdStyleRight, fontWeight: 700, color: "#7c3aed" }}>{fmtCost(subtotal)}</td>
              <td style={tdStyle}></td>
            </tr>
          </tbody>
        </table>

        {/* Add new cost row */}
        {orderId && (
          <div className="flex flex-col gap-2" style={{ marginTop: 10 }}>
            <div className="flex flex-wrap gap-1">
              {PRESET_NAMES.map((name) => (
                <Tag
                  key={name}
                  style={{ cursor: "pointer", fontSize: 11, padding: "2px 8px" }}
                  onClick={() => setNewName(name)}
                >
                  {name}
                </Tag>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label style={{ fontSize: 11, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Cost Name:</label>
              <Input
                placeholder="e.g. Tooling Cost"
                value={newName}
                onChange={(e) => {
                  // Allow only letters, spaces, and common punctuation (no numbers)
                  const value = e.target.value.replace(/[^a-zA-Z\s&\-()]/g, '');
                  setNewName(value);
                }}
                size="small"
                style={{ flex: 1, minWidth: 120, fontSize: 11 }}
              />
              <label style={{ fontSize: 11, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" }}>Cost Value:</label>
              <InputNumber
                placeholder="0.00"
                min={0}
                precision={2}
                step={0.01}
                value={newValue}
                onChange={setNewValue}
                size="small"
                style={{ flex: 1, minWidth: 100 }}
                prefix="Rs."
                controls={false}
                keyboard={false}
                onKeyDown={handleCostKeyDown}
              />
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                loading={adding}
                onClick={handleAdd}
                style={{ whiteSpace: "nowrap", fontSize: 11 }}
              >
                Add Cost
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdditionalCostsSection;