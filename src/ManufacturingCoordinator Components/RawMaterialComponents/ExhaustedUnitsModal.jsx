import React, { useState, useMemo } from "react";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";
import { Modal, Spin, Empty, Popconfirm, message } from "antd";

const thStyle = {
  border: "2px solid #d1d5db",
  padding: "6px 8px",
  background: "#f9fafb",
  fontWeight: 600,
  fontSize: "11px",
  textAlign: "center",
  whiteSpace: "nowrap",
};

const tdStyle = {
  border: "1px solid #d1d5db",
  padding: "4px 8px",
  fontSize: "11px",
  textAlign: "center",
};

const rowSpanTdStyle = {
  border: "2px solid #d1d5db",
  padding: "4px 8px",
  fontSize: "11px",
  textAlign: "center",
  fontWeight: 600,
};

const statusColor = (status) => {
  const colors = {
    available: { color: "#059669", background: "#ecfdf5" },
    partially_used: { color: "#d97706", background: "#fef3c7" },
    exhausted: { color: "#dc2626", background: "#fee2e2" },
    not_available: { color: "#6b7280", background: "#f3f4f6" },
  };
  return colors[status] || { color: "#333", background: "#fff" };
};

const ExhaustedUnitsModal = ({ open, onClose, inventoryData }) => {
  const [loading, setLoading] = useState(false);

  const handleDeleteUnit = async (unitId) => {
    try {
      await axios.delete(`${API_BASE_URL}/rawmaterials/stock/units/${unitId}`);
      message.success("Unit deleted successfully");
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete unit");
    }
  };

  // Build row-spanned table data for exhausted units
  const tableData = useMemo(() => {
    const result = [];
    let slNo = 1;

    inventoryData.forEach((material) => {
      const exhaustedStocks = (material.stocks || []).filter((stock) =>
        (stock.units || []).some((u) => u.status === "exhausted")
      );

      if (exhaustedStocks.length === 0) return;

      let matTotalRows = 0;
      exhaustedStocks.forEach((s) => {
        const exhaustedUnits = (s.units || []).filter((u) => u.status === "exhausted");
        matTotalRows += exhaustedUnits.length;
      });

      let matFirstRow = true;
      exhaustedStocks.forEach((stock) => {
        const exhaustedUnits = (stock.units || []).filter((u) => u.status === "exhausted");
        const stockRowSpan = exhaustedUnits.length;

        exhaustedUnits.forEach((unit, ui) => {
          result.push({
            type: "unit",
            material,
            stock,
            unit,
            unitSeq: ui + 1,
            slNo,
            matRowSpan: matFirstRow ? matTotalRows : 0,
            stockRowSpan: ui === 0 ? stockRowSpan : 0,
          });
          matFirstRow = false;
        });
      });

      slNo += 1;
    });

    return result;
  }, [inventoryData]);

  const fmtDim = (s) => {
    if (s.form_type === "Round") {
      if (s.inner_diameter) {
        return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
      }
      return `⌀${s.diameter} × ${s.length}mm`;
    }
    if (s.form_type === "Square") {
      return `${s.breadth} × ${s.height} × ${s.length}mm`;
    }
    if (s.form_type === "Pipe") {
      return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
    }
    return "-";
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Exhausted Raw Material Units"
      width="80%"
      style={{ top: 30 }}
      footer={null}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Spin size="large" />
        </div>
      ) : tableData.length === 0 ? (
        <Empty description="No exhausted units found" />
      ) : (
        <div style={{ overflowX: "auto", maxHeight: "60vh" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "auto" }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...thStyle, width: "4%" }}>SL</th>
                <th rowSpan={2} style={{ ...thStyle, width: "12%", textAlign: "left" }}>Material</th>
                <th rowSpan={2} style={{ ...thStyle, width: "8%" }}>Process</th>
                <th rowSpan={2} style={{ ...thStyle, width: "7%" }}>Form</th>
                <th rowSpan={2} style={{ ...thStyle, width: "12%" }}>Dimensions</th>
                <th rowSpan={2} style={{ ...thStyle, width: "8%" }}>Mass (kg)</th>
                <th rowSpan={2} style={{ ...thStyle, width: "8%" }}>Source</th>
                <th rowSpan={2} style={{ ...thStyle, width: "10%" }}>Order No</th>
                <th colSpan={4} style={{ ...thStyle, background: "#fee2e2" }}>Exhausted Units</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, width: "6%", background: "#fee2e2" }}>Unit</th>
                <th style={{ ...thStyle, width: "8%", background: "#fee2e2" }}>Total Len</th>
                <th style={{ ...thStyle, width: "16%", background: "#fee2e2" }}>Used For</th>
                <th style={{ ...thStyle, width: "6%", background: "#fff1f0" }}>Delete</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {/* Material cell — rowspan */}
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...rowSpanTdStyle, background: "#fef2f2" }}>
                      {row.slNo}
                    </td>
                  )}
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...rowSpanTdStyle, textAlign: "left", background: "#fef2f2" }}>
                      {row.material.material_name || "-"}
                    </td>
                  )}

                  {/* Stock cells — rowspan */}
                  {row.stockRowSpan > 0 && (
                    <>
                      <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.process_type || "-"}</td>
                      <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.form_type || "-"}</td>
                      <td rowSpan={row.stockRowSpan} style={{ ...rowSpanTdStyle, fontFamily: "monospace" }}>{fmtDim(row.stock)}</td>
                      <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.mass != null ? row.stock.mass.toFixed(3) : "-"}</td>
                      <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.source_type || "-"}</td>
                      <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.source_order_number || "-"}</td>
                    </>
                  )}

                  {/* Unit cells */}
                  <td style={tdStyle}>{row.unit.id}</td>
                  <td style={tdStyle}>{row.unit.total_length?.toFixed(2) || "-"}</td>
                  <td style={{ ...tdStyle, textAlign: "left" }}>
                    {row.unit.usages && row.unit.usages.length > 0
                      ? row.unit.usages.map((u) => `${u.part_number} (${u.used_length?.toFixed(2)}mm)`).join(", ")
                      : "-"}
                  </td>
                  <td style={tdStyle}>
                    <Popconfirm
                      title="Delete this exhausted unit?"
                      onConfirm={() => handleDeleteUnit(row.unit.id)}
                      okText="Yes, Delete"
                      okType="danger"
                      cancelText="Cancel"
                    >
                      <button style={{ border: "1px solid #ff4d4f", background: "#fff1f0", color: "#cf1322", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>Delete</button>
                    </Popconfirm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
            Total: {tableData.length} exhausted units
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ExhaustedUnitsModal;
