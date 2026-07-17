import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { message, Button, Input, Card, Space, Table, Tag } from "antd";
import { SaveOutlined } from "@ant-design/icons";
import MachineMHRsMatrixExport from "../DownloadReports/MachineMHRsMatrixExport";

const handleInputKeyDown = (e) => {
  if ([8, 9, 27, 13, 37, 39].includes(e.keyCode)) return;
  if (e.ctrlKey && [65, 67, 86, 88].includes(e.keyCode)) return;
  if (e.key === ".") return;
  if (e.key && !/^\d$/.test(e.key)) e.preventDefault();
};

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "-";
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function machineLabel(m) {
  const parts = [m.make, m.model].filter(Boolean);
  return parts.length ? parts.join(" ") : m.type || `M${m.id}`;
}

const cellInputStyle = (dirty) => ({
  width: "100%",
  minWidth: "4.5rem",
  maxWidth: "9rem",
  border: dirty ? "1px solid #1890ff" : "1px solid #d9d9d9",
  borderRadius: 4,
  padding: "4px 6px",
  fontSize: 13,
  textAlign: "right",
  background: dirty ? "#e6f4ff" : "#fff",
  boxSizing: "border-box",
});

const MachineMHRs = ({ userId }) => {
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [editedValues, setEditedValues] = useState({});
  const [editedRecommendedMhr, setEditedRecommendedMhr] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchMachinesWithMHR();
  }, []);

  const fetchMachinesWithMHR = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/machines/with-mhr`);
      setMachines(response.data || []);
      setEditedValues({});
      setEditedRecommendedMhr({});
    } catch (error) {
      console.error("Error fetching machines with MHR:", error);
      message.error("Failed to load machine MHR data");
      setMachines([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredMachines = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return machines;
    return machines.filter((m) =>
      [m.work_center_name, m.type, m.make, m.model, String(m.mhr ?? ""), String(m.recommended_mhr ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [machines, searchText]);

  const particulars = useMemo(() => {
    const map = new Map();
    machines.forEach((m) => {
      (m.mhr_particulars || []).forEach((p, idx) => {
        if (!map.has(p.code)) {
          map.set(p.code, {
            code: p.code,
            name: p.name,
            formula: p.formula,
            unit: p.unit,
            is_input: p.is_input,
            sequence: p.sequence_override ?? idx,
            particular_id: p.particular_id,
          });
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  }, [machines]);

  const valueLookup = useMemo(() => {
    const byMachine = {};
    machines.forEach((m) => {
      const byCode = {};
      (m.mhr_particulars || []).forEach((p) => {
        byCode[p.code] = p;
      });
      byMachine[m.id] = byCode;
    });
    return byMachine;
  }, [machines]);

  const pendingChangeCount =
    Object.keys(editedValues).length + Object.keys(editedRecommendedMhr).length;

  const handleInputChange = (machineId, particularId, newValue) => {
    setEditedValues((prev) => ({
      ...prev,
      [`${machineId}-${particularId}`]: newValue,
    }));
  };

  const handleRecommendedMhrChange = (machineId, newValue) => {
    setEditedRecommendedMhr((prev) => ({ ...prev, [machineId]: newValue }));
  };

  const getCell = (machineId, particular) => {
    const rec = valueLookup[machineId]?.[particular.code];
    if (!rec) return { value: null, particularId: null, isInput: particular.is_input, dirty: false };
    const key = `${machineId}-${rec.particular_id}`;
    if (rec.is_input) {
      const edited = editedValues[key];
      return {
        value: edited !== undefined ? edited : rec.input_value,
        particularId: rec.particular_id,
        isInput: true,
        dirty: edited !== undefined,
      };
    }
    return {
      value: rec.computed_value,
      particularId: rec.particular_id,
      isInput: false,
      dirty: false,
    };
  };

  const saveAllChanges = async () => {
    if (pendingChangeCount === 0) {
      message.info("No changes to save");
      return;
    }

    const byMachine = {};
    Object.entries(editedValues).forEach(([key, value]) => {
      const [machineIdStr, particularIdStr] = key.split("-");
      const machineId = Number(machineIdStr);
      if (!byMachine[machineId]) byMachine[machineId] = [];
      byMachine[machineId].push({
        particular_id: Number(particularIdStr),
        value,
      });
    });

    setSaving(true);
    try {
      for (const [machineId, updates] of Object.entries(byMachine)) {
        await axios.put(
          `${API_BASE_URL}/machines/${machineId}/mhr/values`,
          updates
        );
      }
      for (const [machineId, recommended] of Object.entries(editedRecommendedMhr)) {
        await axios.put(
          `${API_BASE_URL}/machines/${machineId}/mhr/recommended-mhr`,
          null,
          { params: { recommended_mhr: recommended } }
        );
      }
      message.success("All MHR changes saved");
      await fetchMachinesWithMHR();
    } catch (error) {
      console.error("Error saving MHR matrix:", error);
      message.error(error?.response?.data?.detail || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const dataSource = useMemo(() => {
    const rows = particulars.map((p, idx) => ({
      key: p.code,
      rowType: "particular",
      sl: idx + 1,
      name: p.name,
      unit: p.unit,
      code: p.code,
      formula: p.is_input ? null : p.formula,
      is_input: p.is_input,
      particular: p,
    }));

    rows.push({
      key: "__calc_mhr",
      rowType: "calc_mhr",
      sl: null,
      name: "Calculated MHR",
      code: "MHR*",
      formula: null,
      is_input: false,
    });

    rows.push({
      key: "__rec_mhr",
      rowType: "rec_mhr",
      sl: null,
      name: "Recommended MHR",
      code: "REC",
      formula: null,
      is_input: true,
    });

    return rows;
  }, [particulars]);

  const columns = useMemo(() => {
    const base = [
      {
        title: "SL",
        dataIndex: "sl",
        key: "sl",
        align: "center",
        render: (sl) =>
          sl != null ? <span style={{ fontWeight: 600, color: "#1890ff" }}>{sl}</span> : null,
      },
      {
        title: "PARTICULARS",
        dataIndex: "name",
        key: "name",
        render: (name, record) => (
          <span style={{ fontWeight: record.rowType === "particular" ? 500 : 700, whiteSpace: "nowrap" }}>
            {name}
            {record.unit ? (
              <span style={{ fontWeight: 400, color: "#8c8c8c" }}> ({record.unit})</span>
            ) : null}
          </span>
        ),
      },
      {
        title: "CODE",
        dataIndex: "code",
        key: "code",
        align: "center",
        render: (code) => <Tag color="blue">{code}</Tag>,
      },
      {
        title: "CALCULATION",
        dataIndex: "formula",
        key: "formula",
        render: (formula, record) =>
          record.rowType !== "particular" ? (
            <span style={{ color: "#8c8c8c" }}>—</span>
          ) : formula ? (
            <span style={{ fontWeight: 400, color: "#595959", fontSize: 12, whiteSpace: "nowrap" }}>
              {formula}
            </span>
          ) : (
            <Tag>Input</Tag>
          ),
      },
    ];

    const machineCols = filteredMachines.map((m) => ({
      title: (
        <div style={{ lineHeight: 1.25, whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 11, fontWeight: 400, color: "#8c8c8c" }}>
            {m.work_center_name || "—"}
          </div>
          <div style={{ fontWeight: 600 }}>{machineLabel(m)}</div>
        </div>
      ),
      key: `m_${m.id}`,
      align: "center",
      render: (_, record) => {
        if (record.rowType === "calc_mhr") {
          return (
            <span style={{ fontWeight: 700, color: "#1890ff", whiteSpace: "nowrap" }}>
              {m.mhr != null ? `₹${m.mhr}` : "—"}
            </span>
          );
        }

        if (record.rowType === "rec_mhr") {
          const dirty = editedRecommendedMhr[m.id] !== undefined;
          const val = dirty ? editedRecommendedMhr[m.id] : m.recommended_mhr;
          return (
            <input
              type="text"
              inputMode="decimal"
              value={val !== null && val !== undefined ? String(val) : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "" || /^\d*\.?\d*$/.test(v)) {
                  handleRecommendedMhrChange(m.id, v === "" ? null : parseFloat(v));
                }
              }}
              disabled={saving}
              onKeyDown={handleInputKeyDown}
              placeholder="—"
              style={cellInputStyle(dirty)}
            />
          );
        }

        const cell = getCell(m.id, record.particular);
        if (cell.isInput) {
          return (
            <input
              type="text"
              inputMode="decimal"
              value={cell.value !== null && cell.value !== undefined ? String(cell.value) : ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^\d*\.?\d*$/.test(val)) {
                  handleInputChange(
                    m.id,
                    cell.particularId,
                    val === "" ? null : parseFloat(val)
                  );
                }
              }}
              disabled={saving || !cell.particularId}
              onKeyDown={handleInputKeyDown}
              style={cellInputStyle(cell.dirty)}
            />
          );
        }

        return <span style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{fmt(cell.value)}</span>;
      },
    }));

    return [...base, ...machineCols];
  }, [filteredMachines, editedValues, editedRecommendedMhr, saving, valueLookup]);

  return (
    <Card
      title={<span className="text-lg font-bold">Machine Hour Rates</span>}
      extra={
        <Space wrap>
          <Input.Search
            placeholder="Search machines..."
            allowClear
            style={{ width: "min(220px, 100%)" }}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveAllChanges}
            loading={saving}
            disabled={pendingChangeCount === 0}
          >
            Save All ({pendingChangeCount})
          </Button>
          <MachineMHRsMatrixExport
            particulars={particulars}
            machines={filteredMachines}
            valueLookup={valueLookup}
            editedValues={editedValues}
            editedRecommendedMhr={editedRecommendedMhr}
          />
        </Space>
      }
      variant="borderless"
      className="shadow-sm overflow-hidden mhr-matrix-card"
      styles={{
        header: { padding: "12px 16px" },
        body: { padding: "0 12px 12px" },
      }}
    >
      <style>{`
        .mhr-matrix-card {
          width: 100%;
        }

        .mhr-matrix-table {
          width: 100%;
        }

        .mhr-matrix-table .ant-table {
          width: 100% !important;
        }

        .mhr-matrix-table .ant-table-container {
          width: 100%;
        }

        .mhr-matrix-table .ant-table-content {
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
        }

        .mhr-matrix-table table {
          width: max-content !important;
          min-width: 100% !important;
          table-layout: auto !important;
        }

        .mhr-matrix-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff) !important;
          font-weight: 600;
          border-bottom: 2px solid #1890ff !important;
          white-space: nowrap !important;
          vertical-align: bottom;
          width: auto !important;
        }

        .mhr-matrix-table .ant-table-tbody > tr > td {
          white-space: nowrap;
          width: auto !important;
        }

        .mhr-matrix-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }

        .mhr-matrix-table .ant-table-cell {
          padding: 8px 12px !important;
        }

        .mhr-matrix-table .ant-table-body {
          max-height: calc(100vh - 260px);
          overflow-y: auto !important;
        }

        @media (max-width: 992px) {
          .mhr-matrix-table .ant-table-cell {
            padding: 7px 8px !important;
            font-size: 12px;
          }
        }

        @media (max-width: 768px) {
          .mhr-matrix-card .ant-card-head {
            flex-wrap: wrap;
          }
          .mhr-matrix-card .ant-card-extra {
            margin-left: 0 !important;
            padding: 8px 0 0;
            width: 100%;
          }
          .mhr-matrix-table .ant-table-cell {
            padding: 6px 6px !important;
            font-size: 12px;
          }
          .mhr-matrix-table .ant-table-body {
            max-height: calc(100vh - 300px);
          }
        }

        @media (max-width: 576px) {
          .mhr-matrix-table .ant-table-cell {
            padding: 5px 4px !important;
            font-size: 11px;
          }
        }
      `}</style>

      <Table
        className="modern-table responsive-table mhr-matrix-table"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        pagination={false}
        bordered
        size="middle"
        tableLayout="auto"
        scroll={{ x: true }}
        locale={{ emptyText: "No machine MHR data found" }}
      />
    </Card>
  );
};

export default MachineMHRs;
