import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Spin, Empty, Modal, App, message, Popconfirm, Button, Badge } from "antd";
import { FileOutlined } from "@ant-design/icons";
import { StockForm } from "./RawMaterialsTab";
import QualityDocumentsModal from "./QualityDocumentsModal";
import { api } from '../api/client.js';

const border = "1px solid #d0d0d0";

/** Viewport-aware table density so all columns fit without horizontal scroll */
const useInventoryTableDensity = () => {
  const [width, setWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (width < 768) {
    return { fontSize: 8, pad: "2px 3px", btnFs: 7, btnPad: "0px 2px", iconFs: 8, compact: true };
  }
  if (width < 1100) {
    return { fontSize: 9, pad: "2px 4px", btnFs: 8, btnPad: "1px 3px", iconFs: 9, compact: true };
  }
  if (width < 1400) {
    return { fontSize: 10, pad: "3px 5px", btnFs: 9, btnPad: "1px 4px", iconFs: 10, compact: false };
  }
  return { fontSize: 11, pad: "4px 6px", btnFs: 10, btnPad: "1px 5px", iconFs: 10, compact: false };
};

const fmtDim = (s) => {
  if (!s) return "-";
  if (s.form_type === "Round") return `⌀${s.diameter} × ${s.length}mm`;
  if (s.form_type === "Square") return `${s.length} × ${s.breadth} × ${s.height}mm`;
  if (s.form_type === "Pipe") return `⌀${s.outer_diameter}/${s.inner_diameter} × ${s.length}mm`;
  return "-";
};

/** Orders linked to a non-exhausted unit (usage) or order-sourced stock */
const getUnitOrders = (unit, stock) => {
  const fromUsage = (unit?.usages || []).map((u) => u.order_number).filter(Boolean);
  if (fromUsage.length) return fromUsage;
  if (stock?.source_type === "order" && stock.source_order_number) {
    return stock.source_order_number.split(",").map((o) => o.trim()).filter(Boolean);
  }
  return [];
};

/** Parts linked to a non-exhausted unit (usage) or order-sourced stock */
const getUnitParts = (unit, stock) => {
  const fromUsage = (unit?.usages || []).map((u) => u.part_number).filter(Boolean);
  if (fromUsage.length) return fromUsage;
  if (stock?.source_type === "order" && stock.part_numbers?.length) return stock.part_numbers;
  return [];
};

const unitMatchesOrderPart = (unit, stock, ordArr, prtArr) => {
  if (ordArr.length === 0 && prtArr.length === 0) return true;
  const orders = getUnitOrders(unit, stock);
  const parts = getUnitParts(unit, stock);
  if (ordArr.length > 0 && !ordArr.some((o) => orders.includes(o))) return false;
  if (prtArr.length > 0 && !prtArr.some((p) => parts.includes(p))) return false;
  return true;
};

const statusColor = (s, fontSize = 10) => {
  const base = { borderRadius: 3, padding: "0px 4px", fontSize, display: "inline-block", lineHeight: 1.3, maxWidth: "100%", wordBreak: "break-word" };
  if (s === "available") return { ...base, background: "#f6ffed", color: "#389e0d", border: "1px solid #b7eb8f" };
  if (s === "partially_used") return { ...base, background: "#fff7e6", color: "#d46b08", border: "1px solid #ffd591" };
  if (s === "not_available") return { ...base, background: "#f0f0f0", color: "#595959", border: "1px solid #d9d9d9" };
  return { ...base, background: "#fff1f0", color: "#cf1322", border: "1px solid #ffa39e" };
};

// ── Reusable column filter dropdown ────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange, style = {}, fontSize = 10 }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 2, cursor: "pointer", userSelect: "none", flexWrap: "wrap", justifyContent: "center", ...style }}
      onClick={() => setOpen(o => !o)}>
      <span style={{ fontSize }}>{label}</span>
      <span style={{ fontSize: Math.max(7, fontSize - 2), color: active ? "#2563eb" : "#aaa" }}>▼</span>
      {active && <span style={{ background: "#2563eb", color: "#fff", borderRadius: 8, fontSize: Math.max(7, fontSize - 2), padding: "0 3px", lineHeight: "12px" }}>{value.length}</span>}
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
  rawMaterials = [],
  onFilterOptionsReady, onRowsReady, onInventoryDataReady, onLoadingChange,
}) => {
  const [inventoryData, setInventoryData] = useState([]);
  const [allStock, setAllStock] = useState({});
  const [allUnits, setAllUnits] = useState({});
  const [loading, setLoading] = useState(false);
  const [addStockModal, setAddStockModal] = useState({ open: false, material: null });
  const [qualityDocsModal, setQualityDocsModal] = useState({ open: false, stock: null, unit: null });

  // ── Column header filters ──────────────────────────────────────────────────
  const [colProcess, setColProcess] = useState([]);
  const [colForm, setColForm] = useState([]);
  const [colSource, setColSource] = useState([]);
  const [colStockStatus, setColStockStatus] = useState([]);
  const [colUnitStatus, setColUnitStatus] = useState([]);

  const getCurrentUserId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const u = JSON.parse(stored);
      if (u?.id == null) return null;
      return u.id;
    } catch {
      return null;
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    if (onLoadingChange) onLoadingChange(true);
    try {
      const uid = getCurrentUserId();
      const role = String(JSON.parse(localStorage.getItem('user') || '{}')?.role || '').toLowerCase();
      const params = uid == null ? undefined
        : (role.includes('manufacturing') || role === 'mc')
          ? { }
          : { };
      const r = await api.get(`/rawmaterials/inventory-view`);
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
      if (onInventoryDataReady) onInventoryDataReady(data);
    } finally {
      setLoading(false);
      if (onLoadingChange) onLoadingChange(false);
    }
  }, [onLoadingChange]);

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

  // Derive filter options — Order/Part from order stocks + non-exhausted unit usages only
  useEffect(() => {
    if (!onFilterOptionsReady) return;
    const srcArr = JSON.parse(fSourceKey);
    const ssArr = JSON.parse(fStockStatusKey);
    const orderSet = new Set();
    const partsByOrder = {};

    const addPart = (orderNo, partNo) => {
      if (!orderNo || !partNo) return;
      if (!partsByOrder[orderNo]) partsByOrder[orderNo] = new Set();
      partsByOrder[orderNo].add(partNo);
    };

    Object.entries(allStock).forEach(([matId, stocks]) => {
      stocks.forEach((s) => {
        if (s.status === "not_available") return;
        if (srcArr.length > 0 && !srcArr.includes(s.source_type)) return;
        if (ssArr.length > 0 && !ssArr.includes(s.status)) return;

        // Order-procured stock
        if (s.source_type === "order" && s.source_order_number) {
          s.source_order_number.split(",").map((o) => o.trim()).filter(Boolean).forEach((o) => {
            orderSet.add(o);
            (s.part_numbers || []).forEach((p) => addPart(o, p));
          });
        }

        // General / any stock: only non-exhausted units that are actually used
        (allUnits[s.id] || []).forEach((u) => {
          if (u.status === "exhausted") return;
          (u.usages || []).forEach((usage) => {
            const o = usage.order_number;
            if (o) {
              orderSet.add(o);
              addPart(o, usage.part_number);
            }
          });
        });
      });
    });

    const materialSource = rawMaterials.length > 0 ? rawMaterials : inventoryData;
    const materials = materialSource
      .map((m) => ({ id: m.id, name: m.material_name }))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    onFilterOptionsReady({
      materials,
      orders: Array.from(orderSet).sort(),
      partsByOrder: Object.fromEntries(Object.entries(partsByOrder).map(([k, v]) => [k, Array.from(v).sort()])),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryData, rawMaterials, allStock, allUnits, fSourceKey, fStockStatusKey, onFilterOptionsReady]);

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
        if (s.status === "not_available") return false;
        if (srcArr.length > 0 && !srcArr.includes(s.source_type)) return false;
        if (ssArr.length > 0 && !ssArr.includes(s.status)) return false;
        if (colProcess.length > 0 && !colProcess.includes(s.process_type)) return false;
        if (colForm.length > 0 && !colForm.includes(s.form_type)) return false;
        const srcLabel = s.source_type === "order" ? "Order" : "General";
        if (colSource.length > 0 && !colSource.includes(srcLabel)) return false;
        const ssLabel = s.status?.replace(/_/g, " ");
        if (colStockStatus.length > 0 && !colStockStatus.includes(ssLabel)) return false;
        // Order/Part: stock matches if any visible unit matches (or order stock fields)
        if (ordArr.length > 0 || prtArr.length > 0) {
          const visibleUnits = (allUnits[s.id] || []).filter((u) => u.status !== "exhausted");
          const anyUnit = visibleUnits.some((u) => unitMatchesOrderPart(u, s, ordArr, prtArr));
          if (!anyUnit) {
            // Order stock with no units yet — still match on stock fields
            if (s.source_type === "order") {
              const stockOrders = s.source_order_number
                ? s.source_order_number.split(",").map((o) => o.trim()).filter(Boolean)
                : [];
              const orderOk = ordArr.length === 0 || ordArr.some((o) => stockOrders.includes(o));
              const partOk = prtArr.length === 0 || prtArr.some((p) => (s.part_numbers || []).includes(p));
              if (!(orderOk && partOk)) return false;
            } else {
              return false;
            }
          }
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

      if (matchingStocks.length === 0) {
        // When order/part/source/status filters are active, hide materials with no matching stock
        const hasStockFilters = ordArr.length > 0 || prtArr.length > 0 || srcArr.length > 0 || ssArr.length > 0 || usArr.length > 0;
        if (hasStockFilters) return;
        if (!matchesMaterial) return;
        slNo += 1;
        result.push({ type: "no-stock", material, slNo, matRowSpan: 1, stockRowSpan: 0 });
        return;
      }
      slNo += 1;

      const filterUnits = (s) =>
        (allUnits[s.id] || []).filter(
          (u) =>
            u.status !== "exhausted" &&
            (usArr.length === 0 || usArr.includes(u.status)) &&
            (colUnitStatus.length === 0 || colUnitStatus.includes(u.status?.replace(/_/g, " "))) &&
            unitMatchesOrderPart(u, s, ordArr, prtArr)
        );

      let matTotalRows = 0;
      matchingStocks.forEach((s) => {
        const units = filterUnits(s);
        matTotalRows += units.length > 0 ? units.length : 1;
      });

      let matFirstRow = true;
      matchingStocks.forEach((stock) => {
        const units = filterUnits(stock);
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
      await api.delete(`/rawmaterials/stock/${stockId}`);
      message.success("Stock deleted successfully");
      fetchAll();
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete stock");
    }
  };

  const handleDeleteUnit = async (unitId) => {
    try {
      await api.delete(`/rawmaterials/stock/units/${unitId}`);
      message.success("Unit deleted successfully");
      fetchAll();
    } catch (err) {
      message.error(err.response?.data?.detail || "Failed to delete unit");
    }
  };

  const openQualityDocs = (stock, material, unit = null) => {
    const dimensions = fmtDim(stock);
    setQualityDocsModal({
      open: true,
      stock,
      unit,
      materialName: material?.material_name || '',
      dimensions,
    });
  };

  const closeQualityDocs = () => setQualityDocsModal({ open: false, stock: null, unit: null });

  const density = useInventoryTableDensity();
  const thStyle = {
    border,
    padding: density.pad,
    textAlign: "center",
    fontWeight: 600,
    fontSize: density.fontSize,
    background: "#f0f5ff",
    wordBreak: "break-word",
    lineHeight: 1.25,
    verticalAlign: "middle",
  };
  const tdStyle = {
    border,
    padding: density.pad,
    fontSize: density.fontSize,
    verticalAlign: "middle",
    textAlign: "center",
    color: "#333",
    wordBreak: "break-word",
    lineHeight: 1.25,
  };
  const actionBtn = (colorBorder, colorBg, colorText) => ({
    border: `1px solid ${colorBorder}`,
    background: colorBg,
    color: colorText,
    borderRadius: 3,
    padding: density.btnPad,
    fontSize: density.btnFs,
    cursor: "pointer",
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  });
  const badgeStyle = {
    backgroundColor: "#ff4d4f",
    fontSize: "8px",
    height: "12px",
    minWidth: "12px",
    lineHeight: "12px",
    padding: "0 2px",
    fontWeight: "bold",
  };

  return (
    <App>
    <div className="mt-2 sm:mt-4 bg-white rounded-lg shadow-sm border border-gray-100 p-1.5 sm:p-3 w-full overflow-hidden">
      {loading ? (
        <div className="flex justify-center items-center py-16"><Spin size="large" /></div>
      ) : rows.length === 0 ? (
        <Empty description="No inventory data found" />
      ) : (
        <div className="w-full" style={{ overflow: "hidden" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", border }}>
            <colgroup>
              <col style={{ width: "2.5%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "5.5%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "3%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "4.5%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "4%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "4%" }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2} style={thStyle}>SL</th>
                <th rowSpan={2} style={{ ...thStyle, textAlign: "left" }}>Material</th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Process" options={colFilterOptions.process} value={colProcess} onChange={setColProcess} fontSize={density.fontSize} /></th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Form" options={colFilterOptions.form} value={colForm} onChange={setColForm} fontSize={density.fontSize} /></th>
                <th rowSpan={2} style={thStyle}>Dimensions</th>
                <th rowSpan={2} style={thStyle}>Qty</th>
                <th rowSpan={2} style={thStyle}>Mass</th>
                <th rowSpan={2} style={thStyle}><FilterHeader label="Source" options={colFilterOptions.source} value={colSource} onChange={setColSource} fontSize={density.fontSize} /></th>
                <th rowSpan={2} style={thStyle}><FilterHeader label={density.compact ? "Stk St" : "Stock Status"} options={colFilterOptions.stockStatus} value={colStockStatus} onChange={setColStockStatus} fontSize={density.fontSize} /></th>
                <th rowSpan={2} style={{ ...thStyle, background: "#fff1f0" }}>{density.compact ? "Del" : "Del Stock"}</th>
                <th rowSpan={2} style={{ ...thStyle, background: "#e6f7ff" }}>{density.compact ? "S Docs" : "Stock Docs"}</th>
                <th colSpan={8} style={{ ...thStyle, background: "#f0fff4" }}>Units</th>
              </tr>
              <tr>
                <th style={{ ...thStyle, background: "#f0fff4" }}>Order</th>
                <th style={{ ...thStyle, background: "#f0fff4" }}>Unit</th>
                <th style={{ ...thStyle, background: "#f0fff4" }}>Total</th>
                <th style={{ ...thStyle, background: "#f0fff4" }}>Rem</th>
                <th style={{ ...thStyle, background: "#f0fff4" }}>Used For</th>
                <th style={{ ...thStyle, background: "#f0fff4" }}><FilterHeader label={density.compact ? "U St" : "Unit Status"} options={colFilterOptions.unitStatus} value={colUnitStatus} onChange={setColUnitStatus} style={{ color: "#333" }} fontSize={density.fontSize} /></th>
                <th style={{ ...thStyle, background: "#e6f7ff" }}>{density.compact ? "U Docs" : "Unit Docs"}</th>
                <th style={{ ...thStyle, background: "#fff1f0" }}>Del</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...tdStyle, fontWeight: 700, background: "#f5f5ff" }}>
                      {row.slNo}
                    </td>
                  )}
                  {row.matRowSpan > 0 && (
                    <td rowSpan={row.matRowSpan} style={{ ...tdStyle, fontWeight: 600, textAlign: "left", background: "#f5f5ff" }}>
                      <div style={{ display: "flex", flexDirection: density.compact ? "column" : "row", alignItems: density.compact ? "flex-start" : "center", justifyContent: "space-between", gap: 4 }}>
                        <span style={{ overflowWrap: "anywhere" }}>{row.material.material_name || "-"}</span>
                        <button
                          onClick={() => openAddStock(row.material)}
                          title="Add Stock"
                          style={actionBtn("#2563eb", "#eff6ff", "#2563eb")}
                        >+{density.compact ? "" : " Stock"}</button>
                      </div>
                    </td>
                  )}

                  {row.type === "no-stock" ? (
                    <td colSpan={17} style={{ ...tdStyle, color: "#aaa", fontStyle: "italic" }}>No stock available</td>
                  ) : (
                    <>
                      {row.stockRowSpan > 0 && (
                        <>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.process_type || "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.form_type || "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={{ ...tdStyle, fontFamily: "monospace", fontSize: Math.max(7, density.fontSize - 1) }}>{fmtDim(row.stock)}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.quantity ?? "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.mass != null ? row.stock.mass.toFixed(2) : "-"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>{row.stock.source_type === "order" ? "Order" : "Gen"}</td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>
                            <span style={statusColor(row.stock.status, density.fontSize)}>{row.stock.status?.replace(/_/g, " ")}</span>
                          </td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>
                            <Popconfirm
                              title="Delete this stock and all its units?"
                              onConfirm={() => handleDeleteStock(row.stock.id)}
                              okText="Yes, Delete"
                              okType="danger"
                              cancelText="Cancel"
                            >
                              <button style={actionBtn("#ff4d4f", "#fff1f0", "#cf1322")}>{density.compact ? "X" : "Delete"}</button>
                            </Popconfirm>
                          </td>
                          <td rowSpan={row.stockRowSpan} style={tdStyle}>
                            <Badge
                              count={row.stock.quality_document_count || 0}
                              showZero
                              offset={[0, 0]}
                              style={badgeStyle}
                            >
                              <button
                                onClick={() => openQualityDocs(row.stock, row.material)}
                                style={actionBtn("#1890ff", "#e6f7ff", "#1890ff")}
                                title="Stock quality documents"
                              >
                                <FileOutlined style={{ fontSize: density.iconFs }} />{density.compact ? "" : " Docs"}
                              </button>
                            </Badge>
                          </td>
                        </>
                      )}
                      {row.type === "no-unit" ? (
                        <td colSpan={8} style={{ ...tdStyle, color: "#aaa", fontStyle: "italic" }}>No units</td>
                      ) : (
                        <>
                          <td style={tdStyle}>
                            {row.stock.source_type === "order"
                              ? (row.stock.source_order_number || "-")
                              : (getUnitOrders(row.unit, row.stock)[0] || "-")}
                          </td>
                          <td style={tdStyle}>{density.compact ? row.unitSeq : `U${row.unitSeq}`}</td>
                          <td style={tdStyle}>{row.unit.total_length?.toFixed(1) ?? "-"}</td>
                          <td style={tdStyle}>{row.unit.remaining_length?.toFixed(1) ?? "-"}</td>
                          <td style={{ ...tdStyle, textAlign: "left" }}>
                            {row.unit.usages?.length > 0
                              ? row.unit.usages.map((u) => u.part_number ? `${u.part_number} (${u.used_length?.toFixed(1)}mm)` : null).filter(Boolean).join(", ") || "-"
                              : "-"}
                          </td>
                          <td style={tdStyle}>
                            <span style={statusColor(row.unit.status, density.fontSize)}>{row.unit.status?.replace("_", " ")}</span>
                          </td>
                          <td style={tdStyle}>
                            <Badge
                              count={row.unit.quality_document_count || 0}
                              showZero
                              offset={[0, 0]}
                              style={badgeStyle}
                            >
                              <button
                                onClick={() => openQualityDocs(row.stock, row.material, row.unit)}
                                style={actionBtn("#1890ff", "#e6f7ff", "#1890ff")}
                                title="Unit quality documents"
                              >
                                <FileOutlined style={{ fontSize: density.iconFs }} />{density.compact ? "" : " Docs"}
                              </button>
                            </Badge>
                          </td>
                          <td style={tdStyle}>
                            <Popconfirm
                              title="Delete this unit?"
                              onConfirm={() => handleDeleteUnit(row.unit.id)}
                              okText="Yes"
                              okType="danger"
                              cancelText="No"
                            >
                              <button style={actionBtn("#ff4d4f", "#fff1f0", "#cf1322")}>{density.compact ? "X" : "Del"}</button>
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

      <QualityDocumentsModal
        open={qualityDocsModal.open}
        onClose={closeQualityDocs}
        stock={qualityDocsModal.stock}
        unit={qualityDocsModal.unit}
        materialName={qualityDocsModal.materialName}
        dimensions={qualityDocsModal.dimensions}
        onDocumentsChanged={() => fetchAll()}
      />
    </div>
    </App>
  );
};

export default RawMaterialInventoryView;
