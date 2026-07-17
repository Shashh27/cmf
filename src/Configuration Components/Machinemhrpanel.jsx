import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import {
  Modal,
  Table,
  InputNumber,
  Button,
  message,
  Space,
  Divider,
  Alert,
  Tag,
  Select,
  Input,
  Popconfirm,
} from "antd";
import { CalculatorOutlined, SaveOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import MachineMhrExport from "../DownloadReports/MachineMhrExport.jsx";

const handleInputKeyDown = (e) => {
  // Allow: Backspace, Delete, Tab, Escape, Enter, Arrow keys
  if ([8, 9, 27, 13, 37, 38, 39, 40].includes(e.keyCode)) {
    return;
  }
  // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
  if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) {
    return;
  }
  // Allow: Decimal point for float values
  if (e.key === '.') {
    return;
  }
  // Block: non-digit characters
  if (e.key && !/^\d$/.test(e.key)) {
    e.preventDefault();
  }
};

const MachineMhrPanel = ({ machine, isOpen, onClose, onCalculated, userId }) => {
  const [values, setValues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalMhr, setFinalMhr] = useState(null);
  const [recommendedMhr, setRecommendedMhr] = useState(null);
  const [mhrCalculatedAt, setMhrCalculatedAt] = useState(null);
  const [availableParticulars, setAvailableParticulars] = useState([]);
  const [selectedParticular, setSelectedParticular] = useState(null);
  const [editedValues, setEditedValues] = useState({});

  useEffect(() => {
    if (isOpen && machine) {
      fetchMhrData();
      fetchAvailableParticulars();
    }
  }, [isOpen, machine]);

  const fetchMhrData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/machines/${machine.id}/mhr`);
      setValues(res.data.values || []);
      setFinalMhr(res.data.final_mhr);
      setRecommendedMhr(res.data.recommended_mhr);
      setMhrCalculatedAt(res.data.mhr_calculated_at);
      setEditedValues({}); // Reset edited values on fresh load
    } catch (error) {
      console.error("Error fetching MHR data:", error);
      message.error("Failed to load MHR data");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableParticulars = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/machines/${machine.id}/mhr/available-particulars`);
      setAvailableParticulars(res.data || []);
    } catch (error) {
      console.error("Error fetching available particulars:", error);
    }
  };

  const handleInputChange = (valueId, newValue) => {
    const valueRecord = values.find(v => v.id === valueId);
    if (!valueRecord) return;
    setEditedValues(prev => ({
      ...prev,
      [valueRecord.particular_id]: newValue
    }));
  };

  const saveAllChanges = async () => {
    if (Object.keys(editedValues).length === 0) {
      message.info("No changes to save");
      return;
    }

    setSaving(true);
    try {
      const updates = Object.entries(editedValues).map(([particularId, value]) => ({
        particular_id: parseInt(particularId),
        value: value
      }));

      const res = await axios.put(
        `${API_BASE_URL}/machines/${machine.id}/mhr/values`,
        updates
      );
      await fetchMhrData();
      message.success("All values updated and MHR recalculated");
      // Use the updated MHR from the API response
      const updatedMhr = res.data?.final_mhr || finalMhr;
      onCalculated && onCalculated(updatedMhr);
    } catch (error) {
      console.error("Error updating values:", error);
      message.error(error?.response?.data?.detail || "Failed to update values");
    } finally {
      setSaving(false);
    }
  };

  const toggleApplicable = async (valueId, isApplicable) => {
    const valueRecord = values.find(v => v.id === valueId);
    if (!valueRecord) return;

    setSaving(true);
    try {
      await axios.post(
        `${API_BASE_URL}/machines/${machine.id}/mhr/particulars/${valueRecord.particular_id}/toggle`,
        null,
        { params: { is_applicable: isApplicable } }
      );
      await fetchMhrData();
      message.success("Particular toggled");
    } catch (error) {
      console.error("Error toggling particular:", error);
      message.error(error?.response?.data?.detail || "Failed to toggle particular");
    } finally {
      setSaving(false);
    }
  };

  const addParticular = async () => {
    if (!selectedParticular) {
      message.error("Please select a particular to add");
      return;
    }

    setSaving(true);
    try {
      await axios.post(
        `${API_BASE_URL}/machines/${machine.id}/mhr/particulars/${selectedParticular}`
      );
      await fetchMhrData();
      await fetchAvailableParticulars();
      setSelectedParticular(null);
      message.success("Particular added");
    } catch (error) {
      console.error("Error adding particular:", error);
      message.error(error?.response?.data?.detail || "Failed to add particular");
    } finally {
      setSaving(false);
    }
  };

  const removeParticular = async (particularId) => {
    setSaving(true);
    try {
      await axios.delete(
        `${API_BASE_URL}/machines/${machine.id}/mhr/particulars/${particularId}`
      );
      await fetchMhrData();
      await fetchAvailableParticulars();
      message.success("Particular removed");
    } catch (error) {
      console.error("Error removing particular:", error);
      message.error(error?.response?.data?.detail || "Failed to remove particular");
    } finally {
      setSaving(false);
    }
  };

  const updateRecommendedMhr = async (newValue) => {
    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/machines/${machine.id}/mhr/recommended-mhr`,
        null,
        { params: { recommended_mhr: newValue } }
      );
      setRecommendedMhr(newValue);
      message.success("Recommended MHR updated");
    } catch (error) {
      console.error("Error updating recommended MHR:", error);
      message.error(error?.response?.data?.detail || "Failed to update recommended MHR");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: "Code",
      key: "code",
      render: (_, record) => (
        <Tag color="blue" style={{ fontSize: 11 }}>{record.particular?.code || "-"}</Tag>
      ),
    },
    {
      title: "Name",
      key: "name",
      ellipsis: true,
      render: (_, record) => (
        <span style={{ fontSize: 12 }}>{record.particular?.name || "-"}</span>
      ),
    },
    {
      title: "Type",
      key: "type",
      render: (_, record) => (
        <Tag color={record.particular?.is_input ? "green" : "orange"} style={{ fontSize: 11 }}>
          {record.particular?.is_input ? "In" : "Fm"}
        </Tag>
      ),
    },
    {
      title: "Value",
      key: "value",
      render: (_, record) => {
        if (!record.particular?.is_input) {
          return <span style={{ fontSize: 12, color: "#999" }}>{record.computed_value?.toFixed(2) || "-"}</span>;
        }
        const displayValue = editedValues[record.particular_id] !== undefined 
          ? editedValues[record.particular_id] 
          : record.input_value;
        const hasChanges = editedValues[record.particular_id] !== undefined;
        return (
          <InputNumber
            style={{ width: "100%", border: hasChanges ? '2px solid #1890ff' : undefined, fontSize: 13 }}
            value={displayValue}
            onChange={(val) => handleInputChange(record.id, val)}
            disabled={saving}
            size="small"
            controls={false}
            keyboard={false}
            onKeyDown={handleInputKeyDown}
            placeholder="Enter value"
          />
        );
      },
    },
    {
      title: "Unit",
      key: "unit",
      render: (_, record) => (
        <span style={{ fontSize: 11 }}>{record.particular?.unit || "-"}</span>
      ),
    },
    {
      title: "Formula",
      key: "formula",
      ellipsis: true,
      render: (_, record) => (
        <span style={{ fontSize: 11, color: "#666" }}>
          {record.particular?.formula || "-"}
        </span>
      ),
    },
  ];

  return (
    <Modal
      title={`MHR Configuration — ${machine?.type || ""} ${machine?.model || ""}`}
      open={isOpen}
      onCancel={onClose}
      width="98vw"
      style={{ maxWidth: 1600, top: 10 }}
      footer={null}
      destroyOnClose
      centered
      bodyStyle={{ padding: '8px', height: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Controls Row - Side by Side */}
        <div style={{ marginBottom: 6, display: 'flex', gap: 12, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
          {/* Calculated MHR */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <label style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>Calculated MHR:</label>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1890ff' }}>₹{finalMhr || 0}/hr</span>
          </div>

          {/* Recommended MHR Override */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <label style={{ fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>Recommended MHR:</label>
            <Space.Compact>
              <InputNumber
                style={{ width: 80 }}
                value={recommendedMhr}
                onChange={(val) => setRecommendedMhr(val)}
                placeholder="Override"
                disabled={saving}
                size="small"
                controls={false}
                onKeyDown={(e) => {
                  // Allow only numbers, backspace, delete, and navigation keys
                  if (
                    !/^[0-9]$/.test(e.key) &&
                    !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) &&
                    !e.ctrlKey && !e.metaKey
                  ) {
                    e.preventDefault();
                  }
                }}
              />
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                onClick={() => updateRecommendedMhr(recommendedMhr)}
                loading={saving}
              >
                {recommendedMhr ? "Update" : "Save"}
              </Button>
            </Space.Compact>
          </div>

          {/* Add Particular */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 200 }}>
            <label style={{ fontWeight: 500, fontSize: 12, whiteSpace: 'nowrap' }}>Add Particular:</label>
            <Select
              style={{ flex: 1, minWidth: 120 }}
              placeholder="Select particular"
              value={selectedParticular}
              onChange={setSelectedParticular}
              disabled={saving || availableParticulars.length === 0}
              size="small"
              options={availableParticulars.map(p => ({
                label: `${p.code} - ${p.name} (${p.is_input ? 'Input' : 'Formula'})`,
                value: p.id
              }))}
            />
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={addParticular}
              disabled={!selectedParticular || saving}
            >
              Add
            </Button>
            {availableParticulars.length === 0 && (
              <span style={{ fontSize: 10, color: '#999' }}>
                All assigned
              </span>
            )}
          </div>

          {/* Save All Changes Button */}
          <Button
            type="primary"
            size="small"
            icon={<SaveOutlined />}
            onClick={saveAllChanges}
            disabled={Object.keys(editedValues).length === 0 || saving}
            loading={saving}
          >
            Save All Changes ({Object.keys(editedValues).length})
          </Button>

          {/* Export Button */}
          <MachineMhrExport
            values={values}
            machine={machine}
            finalMhr={finalMhr}
            recommendedMhr={recommendedMhr}
          />
        </div>

        <Divider style={{ margin: '4px 0', flexShrink: 0 }} />

        {/* MHR Values Table */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Table
            columns={columns}
            dataSource={values}
            rowKey="id"
            pagination={false}
            loading={loading}
            size="small"
            bordered
            scroll={{ x: 'max-content' }}
            style={{ fontSize: 12 }}
          />
        </div>

        <div style={{ marginTop: 6, textAlign: 'right', flexShrink: 0 }}>
          <Button size="small" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
};

export default MachineMhrPanel;