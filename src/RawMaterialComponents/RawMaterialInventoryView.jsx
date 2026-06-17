import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Spin, Empty, Modal, App, message, Popconfirm } from "antd";
import { StockForm } from "./RawMaterialsTab";

const border = "1px solid #d0d0d0";
const thStyle = {
  border, padding: "5px 8px", textAlign: "center",
  fontWeight: 600, fontSize: 12, background: "#f0f5ff",
  whiteSpace: "nowrap",
};
const tdStyle = {
  border, padding: "4px 8px", fontSize: 11,
  verticalAlign: "middle", textAlign: "center", color: "#333",
};

const fmtDim = (s) => {
  if (!s) return "-";
  if (s.form_type === "Round") return `⌀${s.diameter} × ${s.length}mm`;
  if (s.form_type === "Square") return `${s.breadth} × ${s.height} × ${s.length}mm`;
  if (s.form_type === "Pipe") return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
  return "-";
};

const statusColor = (s) => {
  if (s === "available") return { background: "#f6ffed", color: "#389e0d", border: "1px solid #b7eb8f", borderRadius: 4, padding: "1px 6px", fontSize: 11 };
  if (s === "partially_used") return { background: "#fff7e6", color: "#d46b08", border: "1px solid #ffd591", borderRadius: 4, padding: "1px 6px", fontSize: 11 };
  if (s === "not_available") return { background: "#f0f0f0", color: "#595959", border: "1px solid #d9d9d9", borderRadius: 4, padding: "1px 6px", fontSize: 11 };
  return { background: "#fff1f0", color: "#cf1322", border: "1px solid #ffa39e", borderRadius: 4, padding: "1px 6px", fontSize: 11 };
};

// ── Reusable column filter dropdown ────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange, style = {} }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 3, cursor: "pointer", userSelect: "none", ...style }}
      onClick={() => setOpen(o => !o)}>
      <span>{label}</span>
      <span style={{ fontSize: 9, color: active ? "#2563eb" : "#aaa" }}>▼</span>
      {active && <span style={{ background: "#2563eb", color: "#fff", borderRadius: 8, fontSize: 9, padding: "0 4px", lineHeight: "14px" }}>{value.length}</span>}
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: "50%", transform: "translateX(-50%)", background: "#fff", border: "1px solid #d9d9d9", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,.15)", zIndex: 9999, minWidth: 140, padding: "6px 0" }}>
          <div style={{ padding: "2px 10px", fontSize: 10, color: "#999", borderBottom: "1px solid #f0f0f0", marginBottom: 3 }}>Filter</div>
          {options.map(opt => (
            <label key={opt} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])} />
              {opt}
            </label>
          ))}
          {value.length > 0 && (
            <div style={{ borderTop: "1px solid #f0f0f0", marginTop: 3, padding: "3px 10px" }}>
              <span onClick={() => onChange([])} style={{ fontSize: 10, color: "#2563eb", cursor: "pointer" }}>Clear</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RawMaterialInventoryView = ({
  searchText = "", refreshKey = 0,
  fMaterial = [], fSource = [], fOrder = [],
  fPart = [], fStockStatus = [], fUnitStatus = [],
  onFilterOptionsReady, onRowsReady,
}) => {
  const [inventoryData, setInventoryData] = useState([]);
  const [allStock, setAllStock] = useState({});
  const [allUnits, setAllUnits] = useState({});
  const [loading, setLoading] = useState(false);
  const [addStockModal, setAddStockModal] = useState({ open: false, material: null });
  // ── Column header filters ──────────────────────────────────────────────────
  const [colProcess, setColProcess] = useState([]);
  const [colForm, setColForm] = useState([]);
  const [colSource, setColSource] = useState([]);
  const [colStockStatus, setColStockStatus] = useState([]);
  const [colUnitStatus, setColUnitStatus] = useState([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API_BASE_URL}/rawmaterials/inventory-view`);
      const data = r.data || [];
      // Build stock and unit maps from the nested response
      const stockMap = {};
      const unitMap = {};
      data.forEach((mat) => {
        stockMap[mat.id] = mat.stocks || [];
        (mat.stocks || []).forEach((s) => {
          unitMap[s.id] = s.units || [];
        });
      });
      setAllStock(stockMap);
      setAllUnits(unitMap);
      setInventoryData(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll, refreshKey]);

  // Stable stringified deps to avoid infinite loops from array prop references
  const fSourceKey = JSON.stringify(fSource);
  const fStockStatusKey = JSON.stringify(fStockStatus);
  const fOrderKey = JSON.stringify(fOrder);
  const fMaterialKey = JSON.stringify(fMaterial);
  const fPartKey = JSON.stringify(fPart);
  const fUnitStatusKey = JSON.stringify(fUnitStatus);

  // Derive unique values for column filters
  const colFilterOptions = useMemo(() => {
    const process = new Set(), form = new Set(), source = new Set(), stockSt = new Set(), unitSt = new Set();
    Object.values(allStock).flat().forEach(s => {
      if (s.process_type) process.add(s.process_type);
      if (s.form_type) form.add(s.form_type);
      source.add(s.source_type === "order" ? "Order" : "General");
      if (s.status) stockSt.add(s.status.replace(/_/g, " "));
    });
    Object.values(allUnits).flat().forEach(u => {
      if (u.status) unitSt.add(u.status.replace(/_/g, " "));
    });
    return {
      process: Array.from(process).sort(),
      form: Array.from(form).sort(),
      source: Array.from(source).sort(),
      stockStatus: Array.from(stockSt).sort(),
      unitStatus: Array.from(unitSt).sort(),
    };
  }, [allStock, allUnits]);

  // Derive filter options dynamically — only values that exist in data
  useEffect(() => {
    if (!onFilterOptionsReady) return;
    const srcArr = JSON.parse(fSourceKey);
    const ssArr = JSON.parse(fStockStatusKey);
    const orderSet = new Set();
    const partsByOrder = {};
    const materialIds = new Set();

    Object.entries(allStock).forEach(([matId, stocks]) => {
      stocks.forEach(s => {
        if (srcArr.length > 0 && !srcArr.includes(s.source_type)) return;
        if (ssArr.length > 0 && !ssArr.includes(s.status)) return;
        materialIds.add(Number(matId));
        if (s.source_order_number) {
          s.source_order_number.split(',').map(o => o.trim()).filter(Boolean).forEach(o => {
            orderSet.add(o);
            if (!partsByOrder[o]) partsByOrder[o] = new Set();
            if (s.order_parts_mapping?.[o]) {
              s.order_parts_mapping[o].forEach(p => partsByOrder[o].add(p));
            } else if (s.part_numbers) {
              s.part_numbers.forEach(p => partsByOrder[o].add(p));
            }
          });
        }
      });
    });

    const materials = inventoryData
      .filter(m => materialIds.size === 0 || materialIds.has(m.id))
      .map(m => ({ id: m.id, name: m.material_name }));

    onFilterOptionsReady({
      materials,
      orders: Array.from(orderSet).sort(),
      partsByOrder: Object.fromEntries(Object.entries(partsByOrder).map(([k, v]) => [k, Array.from(v).sort()])),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryData, allStock, fSourceKey, fStockStatusKey, onFilterOptionsReady]);

  // Build flat rows with all filters applied
  const rows = useMemo(() => {
    if (!inventoryData.length) return [];
    const matArr = JSON.parse(fMaterialKey);
    const srcArr = JSON.parse(fSourceKey);
    const ordArr = JSON.parse(fOrderKey);
    const prtArr = JSON.parse(fPartKey);
    const ssArr  = JSON.parse(fStockStatusKey);
    const usArr  = JSON.parse(fUnitStatusKey);

    const result = [];
    const searchLow = searchText.toLowerCase();
    let slNo = 0;

    inventoryData.forEach((material) => {
      if (matArr.length > 0 && !matArr.includes(material.id)) return;

      const stocks = allStock[material.id] || [];
      const matchesMaterial = !searchText || material.material_name?.toLowerCase().includes(searchLow);

      const matchingStocks = stocks.filter((s) => {
        if (srcArr.length > 0 && !srcArr.includes(s.source_type)) return false;
        if (ssArr.length > 0 && !ssArr.includes(s.status)) return false;
        if (colProcess.length > 0 && !colProcess.includes(s.process_type)) return false;
        if (colForm.length > 0 && !colForm.includes(s.form_type)) return false;
        const srcLabel = s.source_type === "order" ? "Order" : "General";
        if (colSource.length > 0 && !colSource.includes(srcLabel)) return false;
        const ssLabel = s.status?.replace(/_/g, " ");
        if (colStockStatus.length > 0 && !colStockStatus.includes(ssLabel)) return false;
        if (ordArr.length > 0) {
          const stockOrders = s.source_order_number ? s.source_order_number.split(',').map(o => o.trim()) : [];
          if (!ordArr.some(o => stockOrders.includes(o))) return false;
        }
        if (prtArr.length > 0) {
          const hasPart = prtArr.some(p =>
            s.part_numbers?.includes(p) ||
            (s.order_parts_mapping && Object.values(s.order_parts_mapping).some(ps => ps.includes(p)))
          );
          if (!hasPart) return false;
        }
        if (searchText && !matchesMaterial) {
          return (
            s.process_type?.toLowerCase().includes(searchLow) ||
            s.form_type?.toLowerCase().includes(searchLow) ||
            s.source_order_number?.toLowerCase().includes(searchLow) ||
            s.status?.toLowerCase().includes(searchLow) ||
            fmtDim(s).toLowerCase().includes(searchLow)
          );
        }
        return true;
      });

      if (!matchesMaterial && matchingStocks.length === 0) return;
      slNo += 1;

      if (matchingStocks.length === 0) {
        result.push({ type: "no-stock", material, slNo, matRowSpan: 1, stockRowSpan: 0 });
        return;
      }

      let matTotalRows = 0;
      matchingStocks.forEach((s) => {
        const units = (allUnits[s.id] || []).filter(u => (usArr.length === 0 || usArr.includes(u.status)) && (colUnitStatus.length === 0 || colUnitStatus.includes(u.status?.replace(/_/g, " "))));
        matTotalRows += units.length > 0 ? units.length : 1;
      });

      let matFirstRow = true;
      matchingStocks.forEach((stock) => {
        const units = (allUnits[stock.id] || []).filter(u => (usArr.length === 0 || usArr.includes(u.status)) && (colUnitStatus.length === 0 || colUnitStatus.includes(u.status?.replace(/_/g, " "))));
        const stockRowSpan = units.length > 0 ? units.length : 1;

        if (units.length === 0) {
          result.push({
            type: "no-unit", material, stock, slNo,
            matRowSpan: matFirstRow ? matTotalRows : 0,
            stockRowSpan,
          });
          matFirstRow = false;
        } else {
          units.forEach((unit, ui) => {
            result.push({
              type: "unit", material, stock, unit, unitSeq: ui + 1, slNo,
              matRowSpan: matFirstRow ? matTotalRows : 0,
              stockRowSpan: ui === 0 ? stockRowSpan : 0,
            });
            matFirstRow = false;
          });
        }
      });
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryData, allStock, allUnits, searchText, fMaterialKey, fSourceKey, fOrderKey, fPartKey, fStockStatusKey, fUnitStatusKey, colProcess, colForm, colSource, colStockStatus, colUnitStatus]);

  useEffect(() => { if (onRowsReady) onRowsReady(rows); }, [rows, onRowsReady]);

  const openAddStock = (material) => setAddStockModal({ open: true, material });
  const closeAddStock = () => setAddStockModal({ open: false, material: null });

  const handleDeleteStock = async (stockId) => {
    try {
      await axios.delete(`${API_BASE_URL}/rawmaterials/stock/${stockId}`);
      message.success("Stock deleted successfully");
      fetchAll();
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete stock");
    }
  };

  const handleDeleteUnit = async (unitId) => {
    try {
      await axios.delete(`${API_BASE_URL}/rawmaterials/stock/units/${unitId}`);
      message.success("Unit deleted successfully");
      fetchAll();
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete unit");
    }
  };

  return (
    <App>
    <div className="mt-4 bg-white rounded-lg shadow-sm border border-gray-100 p-3">
      {loading ? (
        <div className="flex justify-center items-center py-16"><Spin size="large" /></div>
      ) : rows.length === 0 ? (
        <Empty description="No inventory data found" />
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, tableLayout: "auto", border }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 40 }}>SL</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 120, textAlign: "left" }}>Material</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 90 }}><FilterHeader label="Process" options={colFilterOptions.process} value={colProcess} onChange={setColProcess} /></th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 80 }}><FilterHeader label="Form" options={colFilterOptions.form} value={colForm} onChange={setColForm} /></th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 120 }}>Dimensions</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 50 }}>Qty</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 70 }}>Mass (kg)</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 70 }}><FilterHeader label="Source" options={colFilterOptions.source} value={colSource} onChange={setColSource} /></th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 90 }}>Order No</th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 90 }}><FilterHeader label="Stock Status" options={colFilterOptions.stockStatus} value={colStockStatus} onChange={setColStockStatus} /></th>
                <th rowSpan={2} style={{ ...thStyle, minWidth: 60, background: "#fff1f0" }}>Del Stock</th>
                <th colSpan={6} style={{ ...thStyle, background: "#f0fff4" }}>Units</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, minWidth: 55, background: "#f0fff4" }}>Unit</th>
                <th style={{ ...thStyle, minWidth: 80, background: "#f0fff4" }}>Total Len</th>
                <th style={{ ...thStyle, minWidth: 90, background: "#f0fff4" }}>Remaining</th>
                <th style={{ ...thStyle, minWidth: 120, background: "#f0fff4" }}>Used For</th>
                <th style={{ ...thStyle, minWidth: 90, background: "#f0fff4" }}><FilterHeader label="Unit Status" options={colFilterOptions.unitStatus} value={colUnitStatus} onChange={setColUnitStatus} style={{ color: "#333" }} /></th>
                <th style={{ ...thStyle, minWidth: 60, background: "#fff1f0" }}>Del Unit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {/* Material cell — rowspan across all its unit rows */}
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...tdStyle, fontWeight: 700, background: "#f5f5ff" }}>
                      {row.slNo}
                    </td>
                  )}
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...tdStyle, fontWeight: 600, textAlign: "left", background: "#f5f5ff" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <span>{row.material.material_name || "-"}</span>
                        <button
                          onClick={() => openAddStock(row.material)}
                          title="Add Stock"
                          style={{ border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer", whiteSpace: "nowrap" }}
                        >+ Stock</button>
                      </div>
                    </td>
                  )}

                  {/* Stock cells — rowspan across all its unit rows */}
                  {row.type === "no-stock" ? (
                    <td colSpan={8} style={{ ...tdStyle, color: "#aaa", fontStyle: "italic" }}>No stock available</td>
                  ) : (
                    <>
                      {row.stockRowSpan > 0 && (
                        <>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.process_type || "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.form_type || "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={{ ...tdStyle, fontFamily: "monospace" }}>{fmtDim(row.stock)}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.quantity ?? "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.mass != null ? row.stock.mass.toFixed(3) : "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.source_type === "order" ? "Order" : "General"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.source_order_number || "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>
                            <span style={statusColor(row.stock.status)}>{row.stock.status?.replace(/_/g, " ")}</span>
                          </td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>
                            <Popconfirm
                              title="Delete this stock and all its units?"
                              onConfirm={() => handleDeleteStock(row.stock.id)}
                              okText="Yes, Delete"
                              okType="danger"
                              cancelText="Cancel"
                            >
                              <button style={{ border: "1px solid #ff4d4f", background: "#fff1f0", color: "#cf1322", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>Delete</button>
                            </Popconfirm>
                          </td>
                        </>
                      )}
                      {/* Unit cells — one per row */}
                      {row.type === "no-unit" ? (
                        <td colSpan={6} style={{ ...tdStyle, color: "#aaa", fontStyle: "italic" }}>No units</td>
                      ) : (
                        <>
                          <td style={tdStyle}>Unit {row.unitSeq}</td>
                          <td style={tdStyle}>{row.unit.total_length?.toFixed(2) ?? "-"}</td>
                          <td style={tdStyle}>{row.unit.remaining_length?.toFixed(2) ?? "-"}</td>
                          <td style={{ ...tdStyle, textAlign: "left", maxWidth: 160, wordBreak: "break-word" }}>
                            {row.unit.usages?.length > 0
                              ? row.unit.usages.map((u) => u.part_number ? `${u.part_number} (${u.used_length?.toFixed(2)}mm)` : null).filter(Boolean).join(", ") || "-"
                              : "-"}
                          </td>
                          <td style={tdStyle}>
                            <span style={statusColor(row.unit.status)}>{row.unit.status?.replace("_", " ")}</span>
                          </td>
                          <td style={tdStyle}>
                            <Popconfirm
                              title="Delete this unit?"
                              onConfirm={() => handleDeleteUnit(row.unit.id)}
                              okText="Yes"
                              okType="danger"
                              cancelText="No"
                            >
                              <button style={{ border: "1px solid #ff4d4f", background: "#fff1f0", color: "#cf1322", borderRadius: 4, padding: "1px 6px", fontSize: 10, cursor: "pointer" }}>Del</button>
                            </Popconfirm>
                          </td>
                        </>
                      )}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={addStockModal.open}
        onCancel={closeAddStock}
        width="95%"
        style={{ maxWidth: 700 }}
        title={
          <span className="font-bold text-gray-800">
            Add Stock — {addStockModal.material?.material_name}
          </span>
        }
        footer={null}
        destroyOnHidden
      >
        {addStockModal.material && (
          <StockForm
            materialId={addStockModal.material.id}
            materialCost={addStockModal.material.cost_per_kg}
            onSuccess={() => { closeAddStock(); fetchAll(); }}
          />
        )}
      </Modal>
    </div>
    </App>
  );
};

export default RawMaterialInventoryView;
