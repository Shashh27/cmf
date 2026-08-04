import React, { useState, useMemo } from "react";
import { Modal, Empty, Badge, App } from "antd";
import { FileOutlined } from "@ant-design/icons";
import QualityDocumentsModal from "./QualityDocumentsModal";
import { api } from "../../api/client.js";

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

const ExhaustedUnitsModal = ({ open, onClose, inventoryData, onDocumentsChanged }) => {
  const [qualityDocsModal, setQualityDocsModal] = useState({
    open: false,
    stock: null,
    materialName: "",
    dimensions: "",
  });
  const [docCountOverrides, setDocCountOverrides] = useState({});

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
      return `${s.length} × ${s.breadth} × ${s.height}mm`;
    }
    if (s.form_type === "Pipe") {
      return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
    }
    return "-";
  };

  const getOrderNo = (stock, unit) => {
    const fromUsages = [
      ...new Set(
        (unit?.usages || [])
          .map((u) => u.order_number || (u.order_numbers || [])[0])
          .filter(Boolean)
      ),
    ];
    if (fromUsages.length) return fromUsages.join(", ");
    if (stock?.source_type === "order" && stock?.source_order_number) return stock.source_order_number;
    return "-";
  };

  const getDocCount = (stock) =>
    docCountOverrides[stock.id] != null
      ? docCountOverrides[stock.id]
      : (stock.quality_document_count || 0);

  const openQualityDocs = (stock, material) => {
    setQualityDocsModal({
      open: true,
      stock,
      materialName: material?.material_name || "",
      dimensions: fmtDim(stock),
    });
  };

  const closeQualityDocs = () => {
    setQualityDocsModal({ open: false, stock: null, materialName: "", dimensions: "" });
  };

  const handleDocumentsChanged = async (stockId) => {
    try {
      const response = await api.get(`/stock-quality-documents/stock/${stockId}`);
      setDocCountOverrides((prev) => ({
        ...prev,
        [stockId]: (response.data || []).length,
      }));
    } catch {
      // keep previous count
    }
    onDocumentsChanged?.(stockId);
  };

  return (
    <App>
      <Modal
        open={open}
        onCancel={onClose}
        title="Exhausted Raw Material Units"
        width="80%"
        style={{ top: 30 }}
        footer={null}
      >
        {tableData.length === 0 ? (
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
                  <th rowSpan={2} style={{ ...thStyle, width: "8%", background: "#e6f7ff" }}>Quality Docs</th>
                  <th rowSpan={2} style={{ ...thStyle, width: "10%" }}>Order No</th>
                  <th colSpan={3} style={{ ...thStyle, background: "#fee2e2" }}>Exhausted Units</th>
                </tr>
                <tr>
                  <th style={{ ...thStyle, width: "6%", background: "#fee2e2" }}>Unit</th>
                  <th style={{ ...thStyle, width: "8%", background: "#fee2e2" }}>Total Len</th>
                  <th style={{ ...thStyle, width: "16%", background: "#fee2e2" }}>Used For</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((row, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
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

                    {row.stockRowSpan > 0 && (
                      <>
                        <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.process_type || "-"}</td>
                        <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.form_type || "-"}</td>
                        <td rowSpan={row.stockRowSpan} style={{ ...rowSpanTdStyle, fontFamily: "monospace" }}>{fmtDim(row.stock)}</td>
                        <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.mass != null ? row.stock.mass.toFixed(3) : "-"}</td>
                        <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>{row.stock.source_type || "-"}</td>
                        <td rowSpan={row.stockRowSpan} style={rowSpanTdStyle}>
                          <Badge
                            count={getDocCount(row.stock)}
                            showZero
                            offset={[0, 0]}
                            style={{
                              backgroundColor: "#ff4d4f",
                              fontSize: "9px",
                              height: "14px",
                              minWidth: "14px",
                              lineHeight: "14px",
                              padding: "0 3px",
                              fontWeight: "bold",
                            }}
                          >
                            <button
                              onClick={() => openQualityDocs(row.stock, row.material)}
                              style={{
                                border: "1px solid #1890ff",
                                background: "#e6f7ff",
                                color: "#1890ff",
                                borderRadius: 4,
                                padding: "1px 4px",
                                fontSize: 9,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <FileOutlined style={{ fontSize: 10 }} /> Docs
                            </button>
                          </Badge>
                        </td>
                      </>
                    )}

                    <td style={tdStyle}>{getOrderNo(row.stock, row.unit)}</td>
                    <td style={tdStyle}>{row.unit.id}</td>
                    <td style={tdStyle}>{row.unit.total_length?.toFixed(2) || "-"}</td>
                    <td style={{ ...tdStyle, textAlign: "left" }}>
                      {row.unit.usages && row.unit.usages.length > 0
                        ? row.unit.usages.map((u) => `${u.part_number} (${u.used_length?.toFixed(2)}mm)`).join(", ")
                        : "-"}
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

      <QualityDocumentsModal
        open={qualityDocsModal.open}
        onClose={closeQualityDocs}
        stock={qualityDocsModal.stock}
        materialName={qualityDocsModal.materialName}
        dimensions={qualityDocsModal.dimensions}
        onDocumentsChanged={handleDocumentsChanged}
      />
    </App>
  );
};

export default ExhaustedUnitsModal;
