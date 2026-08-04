import React, { useEffect, useMemo, useState, useRef } from "react";
import { Empty, Spin, Input, Select, Button } from "antd";
import { ClockCircleOutlined, AppstoreOutlined, ToolOutlined, PartitionOutlined, SearchOutlined, DollarOutlined, DownOutlined, UpOutlined } from "@ant-design/icons";
import { api } from "../../api/client.js";
import ProductSummaryDownload from "../../DownloadReports/ProductSummaryDownload";
import AdditionalCostsSection from "./AdditionalCostsSection";

// ─── Column Filter Header Component ──────────────────────────────────────────────
const FilterHeader = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  const active = value && value.length > 0;
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setOpen(o => !o)}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 9, color: active ? '#2563eb' : '#aaa' }}>▼</span>
      {active && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: 9, padding: '0 4px', lineHeight: '14px' }}>{value.length}</span>}
      {open && (
        <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #d0d0d0', borderRadius: 0, boxShadow: '0 4px 12px rgba(0,0,0,.15)', zIndex: 9999, minWidth: 180, maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
          <div style={{ padding: '2px 10px', fontSize: 10, color: '#999', borderBottom: '1px solid #f0f0f0', marginBottom: 3 }}>Filter</div>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={value.includes(opt)} onChange={() => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])} />
              {opt}
            </label>
          ))}
          {value.length > 0 && (
            <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 3, padding: '3px 10px' }}>
              <span onClick={() => onChange([])} style={{ fontSize: 10, color: '#2563eb', cursor: 'pointer' }}>Clear</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const border = "1px solid #d0d0d0";
const thStyle = {
  border, padding: "6px 10px", textAlign: "center",
  fontWeight: 700, fontSize: 12, background: "#fff",
  whiteSpace: "nowrap",
};
const tdStyle = {
  border, padding: "5px 10px", fontSize: 11,
  verticalAlign: "middle", textAlign: "center",
};

const tdStyleRight = {
  border, padding: "5px 10px", fontSize: 11,
  verticalAlign: "middle", textAlign: "right",
};

const highlightText = (text, searchTerm) => {
  if (!text || !searchTerm) return text;
  const textStr = String(text);
  const searchLower = searchTerm.toLowerCase();
  const index = textStr.toLowerCase().indexOf(searchLower);
  if (index === -1) return textStr;
  
  const before = textStr.substring(0, index);
  const match = textStr.substring(index, index + searchTerm.length);
  const after = textStr.substring(index + searchTerm.length);
  
  return (
    <span>
      {before}
      <span style={{ backgroundColor: '#fef08a', fontWeight: 600 }}>{match}</span>
      {after}
    </span>
  );
};

const parseHmsToSeconds = (val) => {
  if (!val || typeof val !== "string") return 0;
  const parts = val.split(":");
  if (parts.length < 2) return 0;
  const [hh, mm, ssRaw] = parts;
  const ss = (ssRaw || "0").split(".")[0];
  const h = parseInt(hh, 10), m = parseInt(mm, 10), s = parseInt(ss, 10);
  if ([h, m, s].some((n) => Number.isNaN(n))) return 0;
  return h * 3600 + m * 60 + s;
};

const fmtCost = (val) => val != null ? `Rs.${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

const formatHms = (seconds) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

// ─── Stat Card ──────────────────────────────────────────────────────────────

const StatCard = ({ icon, label, value, iconColor }) => (
  <div
    className="border border-slate-200 shadow-sm rounded"
    style={{ padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, background: "#fff" }}
  >
    <div style={{ color: iconColor, fontSize: 18, lineHeight: 1 }}>{icon}</div>
    <div className="min-w-0">
      <div style={{ fontSize: 11, color: "#64748b", lineHeight: "1.2", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{value}</div>
    </div>
  </div>
);

// ─── Section Header ──────────────────────────────────────────────────────────

const SectionHeader = ({ icon, title, count }) => (
  <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200">
    <div className="flex items-center gap-2">
      <span className="text-blue-600" style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{title}</span>
    </div>
    {count != null && (
      <span style={{ 
        background: "#2563eb", color: "#fff", borderRadius: 4, padding: "2px 8px", 
        fontSize: 11, fontWeight: 600 
      }}>
        {count} rows
      </span>
    )}
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

// productId: the product being summarized
// orderId: the order this summary is being viewed/quoted for — required to
//          load/edit the order's additional project costs (Tooling, Fixture, etc.)
// userId: optional, attached to additional-cost records that get created/edited
const ProductSummary = ({ productId, orderId, userId }) => {
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [partFilter, setPartFilter] = useState([]);
  const [machineFilter, setMachineFilter] = useState([]);
  const [operationFilter, setOperationFilter] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [additionalCosts, setAdditionalCosts] = useState([]);
  const [showAdditionalCosts, setShowAdditionalCosts] = useState(false);
  
  // Column header filters
  const [colMachine, setColMachine] = useState([]);
  const [colPart, setColPart] = useState([]);
  const [colOperation, setColOperation] = useState([]);

  useEffect(() => {
    if (!productId) { setSummaryData(null); return; }

    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);

    // Use lightweight summary-data endpoint - only operations data for hours calculation.
    // Pass order_id (when available) so the backend also returns that order's
    // additional project costs (Tooling/Fixture/Inspection etc.) in one call.
    api
      .get(`/products/${productId}/summary-data`, {
        params: orderId ? { order_id: orderId } : {},
        signal: controller.signal,
      })
      .then((res) => { if (isMounted) setSummaryData(res.data); })
      .catch((e) => {
        if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
          console.error("Product summary fetch error:", e);
          if (isMounted) setSummaryData(null);
        }
      })
      .finally(() => { if (isMounted && !controller.signal.aborted) setLoading(false); });

    return () => { isMounted = false; controller.abort(); };
  }, [productId, orderId]);

  // Sync additional costs whenever a fresh summary load comes in
  useEffect(() => {
    setAdditionalCosts(summaryData?.additional_costs || []);
  }, [summaryData]);

  const additionalCostsSubtotal = useMemo(
    () => additionalCosts.reduce((a, c) => a + (Number(c.cost_value) || 0), 0),
    [additionalCosts]
  );

  const summary = useMemo(() => {
    // New summary-data endpoint returns flat parts array directly
    const parts = summaryData?.parts || [];
    const rows = [];

    parts.forEach((pd) => {
      const part = pd?.part || {};
      const ops = Array.isArray(pd?.operations) ? pd.operations : [];
      ops.forEach((op) => {
        const setupSec = parseHmsToSeconds(op?.setup_time);
        const cycleSec = parseHmsToSeconds(op?.cycle_time);
        const partQty = part?.qty || 1; // Get part quantity, default to 1 if not specified
        
        // Calculate total time for all quantities
        // Setup time is one-time, cycle time is per quantity
        const totalCycleSec = cycleSec * partQty;
        const totalSec = setupSec + totalCycleSec;
        
        // Check if this is an outsource part
        const isOutSource =
          op?.part_type_id === 2 ||
          String(op?.part_type_name || "").toLowerCase().includes("out");
        
        const machineName = op?.machine_name || (op?.machine_id ? `Machine ${op.machine_id}` : "N/A");
        const mhrRate = op?.mhr_rate || 0;
        // Cost = total hours × mhr_rate
        const machineCost = (totalSec / 3600) * mhrRate;
        rows.push({
          key: `${part?.id || "p"}-${op?.id || op?.operation_number || Math.random()}`,
          part_id: part?.id,
          part_number: part?.part_number || "—",
          part_name: part?.part_name || "—",
          operation_number: op?.operation_number || "—",
          operation_name: op?.operation_name || "—",
          setup_time: op?.setup_time || "00:00:00",
          cycle_time: op?.cycle_time || "00:00:00",
          machine_name: machineName,
          machine_id: op?.machine_id || null,
          mhr_rate: mhrRate,
          machine_cost: machineCost,
          part_qty: partQty,
          is_outsource: isOutSource,
          setup_seconds: setupSec,
          cycle_seconds: totalCycleSec,
          total_seconds: totalSec,
        });
      });
    });

    // Apply filters
    let filteredRows = rows;
    
    // Column header filters
    if (colMachine.length > 0) {
      filteredRows = filteredRows.filter(r => colMachine.includes(r.machine_name));
    }
    if (colPart.length > 0) {
      filteredRows = filteredRows.filter(r => colPart.includes(r.part_name));
    }
    if (colOperation.length > 0) {
      filteredRows = filteredRows.filter(r => colOperation.includes(r.operation_name));
    }
    
    // Filter by part
    if (partFilter.length > 0) {
      filteredRows = filteredRows.filter(r => 
        partFilter.includes(r.part_name) || partFilter.includes(String(r.part_id))
      );
    }
    
    // Filter by machine
    if (machineFilter.length > 0) {
      filteredRows = filteredRows.filter(r => 
        machineFilter.includes(r.machine_name) || machineFilter.includes(String(r.machine_id))
      );
    }
    
    // Filter by operation name
    if (operationFilter.length > 0) {
      filteredRows = filteredRows.filter(r => 
        operationFilter.includes(r.operation_name)
      );
    }
    
    // Filter by search term (part name, part number, operation name, machine name)
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filteredRows = filteredRows.filter(r =>
        r.part_name?.toLowerCase().includes(searchLower) ||
        r.part_number?.toLowerCase().includes(searchLower) ||
        r.operation_name?.toLowerCase().includes(searchLower) ||
        r.machine_name?.toLowerCase().includes(searchLower)
      );
    }

    const totalSetup = filteredRows.reduce((a, r) => a + r.setup_seconds, 0);
    const totalCycle = filteredRows.reduce((a, r) => a + r.cycle_seconds, 0);

    const byMachine = new Map();
    filteredRows.forEach((r) => {
      const key = r.machine_id || r.machine_name || "N/A";
      const prev = byMachine.get(key) || { machine_name: r.machine_name, mhr_rate: r.mhr_rate, setup_seconds: 0, cycle_seconds: 0, total_seconds: 0, machine_cost: 0 };
      prev.setup_seconds += r.setup_seconds;
      prev.cycle_seconds += r.cycle_seconds;
      prev.total_seconds += r.total_seconds;
      prev.machine_cost += r.machine_cost;
      byMachine.set(key, prev);
    });

    const machineRows = Array.from(byMachine.values()).sort((a, b) => b.total_seconds - a.total_seconds);

    // Group filtered rows by Machine first, then Part within Machine, then Operations within Part
    const machineGroups = new Map();
    filteredRows.forEach((r) => {
      const machineKey = r.machine_id || r.machine_name || "N/A";
      if (!machineGroups.has(machineKey)) {
        machineGroups.set(machineKey, {
          machine_id: r.machine_id,
          machine_name: r.machine_name,
          parts: new Map()
        });
      }
      
      const machineGroup = machineGroups.get(machineKey);
      const partKey = r.part_id || r.part_name || "unknown";
      if (!machineGroup.parts.has(partKey)) {
        machineGroup.parts.set(partKey, {
          part_id: r.part_id,
          part_name: r.part_name,
          part_number: r.part_number,
          part_qty: r.part_qty,
          operations: []
        });
      }
      machineGroup.parts.get(partKey).operations.push(r);
    });

    // Build flat rows with rowSpan info and calculate totals
    const groupedRows = [];
    let slNo = 0;
    let totalQtyAll = 0;
    
    machineGroups.forEach((machineGroup) => {
      slNo += 1;
      const machineKey = machineGroup.machine_id || machineGroup.machine_name || "N/A";
      
      // Calculate total operations for this machine
      let machineTotalOps = 0;
      machineGroup.parts.forEach((partGroup) => {
        machineTotalOps += partGroup.operations.length;
      });
      
      let isFirstPart = true;
      let isFirstOpInMachine = true;
      
      machineGroup.parts.forEach((partGroup) => {
        const ops = partGroup.operations;
        const partQty = partGroup.part_qty || 1;
        totalQtyAll += partQty;
        
        // Calculate part-level totals
        const totalHoursPart = ops.reduce((sum, op) => sum + op.total_seconds, 0);
        const totalCostPart = ops.reduce((sum, op) => sum + op.machine_cost, 0);
        const totalCostQty = totalCostPart * partQty;
        
        ops.forEach((op, idx) => {
          groupedRows.push({
            ...op,
            slNo,
            machine_name: machineGroup.machine_name,
            machine_id: machineGroup.machine_id,
            machineRowSpan: isFirstOpInMachine ? machineTotalOps : 0,
            partRowSpan: idx === 0 ? ops.length : 0,
            part_qty: partQty,
            total_hours_part: totalHoursPart,
            total_cost_part: totalCostPart,
            total_cost_qty: totalCostQty,
          });
          isFirstOpInMachine = false;
        });
        isFirstPart = false;
      });
    });

    // Extract unique parts, machines and operations for filter options
    const uniqueParts = Array.from(new Set(rows.map(r => r.part_name).filter(p => p))).sort();
    const uniqueMachines = Array.from(new Set(rows.map(r => r.machine_name).filter(m => m && m !== "N/A"))).sort();
    const uniqueOperations = Array.from(new Set(rows.map(r => r.operation_name).filter(o => o))).sort();

    const totalCost = filteredRows.reduce((a, r) => a + (r.machine_cost || 0), 0);

    return { 
      productName: summaryData?.product?.product_name || "", 
      rows: groupedRows, 
      totalSetup, 
      totalCycle, 
      totalAll: totalSetup + totalCycle,
      totalCost,
      machineRows,
      uniqueParts,
      uniqueMachines,
      uniqueOperations,
      allRows: rows,
      totalQtyAll
    };
  }, [summaryData, partFilter, machineFilter, operationFilter, searchTerm, colMachine, colPart, colOperation]);

  // Grand total = machining cost + additional project costs (Tooling/Fixture/Inspection/etc.)
  const grandTotal = summary.totalCost + additionalCostsSubtotal;

  // Bundle passed to the download component so PDF/Excel exports include
  // the additional costs table and the grand total.
  const exportData = useMemo(() => ({
    ...summary,
    additionalCosts,
    additionalCostsSubtotal,
    grandTotal,
  }), [summary, additionalCosts, additionalCostsSubtotal, grandTotal]);

  // ── Empty / Loading states ──────────────────────────────────────────────

  if (!productId) return (
    <div className="h-full w-full flex items-center justify-center">
      <Empty description="Select a product to view summary" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </div>
  );

  if (loading) return (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <Spin tip="Loading product summary..."><div style={{ width: 40, height: 40 }} /></Spin>
    </div>
  );

  if (!summaryData) return (
    <div className="h-full w-full flex items-center justify-center bg-white">
      <Empty description="No summary available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
    </div>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="w-full p-2 flex flex-col gap-2"
      style={{ height: "100%", overflow: "hidden", boxSizing: "border-box" }}
    >

      {/* Product title with search and filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-shrink-0">
          <AppstoreOutlined className="text-blue-600" style={{ fontSize: 14 }} />
          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 11 }} className="truncate max-w-[150px] sm:max-w-[200px]">
            {summary.productName || "Product Summary"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          <Input
            placeholder="Search..."
            prefix={<SearchOutlined className="text-slate-400" />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
            size="small"
            style={{ minWidth: 80, fontSize: 10, flex: 1, fontWeight: 600 }}
          />
          <Select
            mode="multiple"
            placeholder="Machine"
            value={machineFilter}
            onChange={setMachineFilter}
            allowClear
            size="small"
            style={{ minWidth: 80, fontSize: 10, flex: 1, fontWeight: 600 }}
            options={summary.uniqueMachines.map(m => ({ label: m, value: m }))}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            placeholder="Part"
            value={partFilter}
            onChange={setPartFilter}
            allowClear
            size="small"
            style={{ minWidth: 80, fontSize: 10, flex: 1, fontWeight: 600 }}
            options={summary.uniqueParts.map(p => ({ label: p, value: p }))}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            placeholder="Operation"
            value={operationFilter}
            onChange={setOperationFilter}
            allowClear
            size="small"
            style={{ minWidth: 80, fontSize: 10, flex: 1, fontWeight: 600 }}
            options={summary.uniqueOperations.map(o => ({ label: o, value: o }))}
            maxTagCount="responsive"
          />
        </div>
        <ProductSummaryDownload 
          summaryData={exportData} 
          productName={summary.productName}
          fileName={`${summary.productName || "product"}_summary.pdf`}
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <StatCard icon={<ClockCircleOutlined />} iconColor="#f97316" label="Total Setup Time"       value={formatHms(summary.totalSetup)} />
        <StatCard icon={<ClockCircleOutlined />} iconColor="#16a34a" label="Total Cycle Time"       value={formatHms(summary.totalCycle)} />
        <StatCard icon={<ClockCircleOutlined />} iconColor="#2563eb" label="Total (Setup + Cycle)"  value={formatHms(summary.totalAll)}   />
        <StatCard icon={<ToolOutlined />}         iconColor="#7c3aed" label="Total Machining Cost"  value={fmtCost(summary.totalCost)}     />
        <StatCard icon={<DollarOutlined />}       iconColor="#dc2626" label="Grand Total" value={fmtCost(grandTotal)} />
      </div>

      {/* ── Table: Part Operations ──────────────────────────────────── */}
      <div className="bg-white rounded border border-slate-200 shadow-sm flex flex-col" style={{ flex: 1, minHeight: 0, maxHeight: showAdditionalCosts ? "calc(100% - 200px)" : "calc(100% - 60px)" }}>
        <SectionHeader
          icon={<PartitionOutlined />}
          title="Part Operations (ALL)"
          count={summary.rows.length}
        />
        <div style={{ overflowX: "auto", overflowY: "auto", WebkitOverflowScrolling: "touch", flex: 1, minHeight: 0 }}>
          {summary.rows.length === 0 ? (
            <div className="p-4 text-center text-gray-500" style={{ fontSize: 10 }}>No operations found</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1200, tableLayout: "fixed", border }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ ...thStyle, width: 100 }}>
                    <FilterHeader label="Machine" options={summary.uniqueMachines} value={colMachine} onChange={setColMachine} />
                  </th>
                  <th rowSpan={2} style={{ ...thStyle, width: 140, textAlign: "left" }}>
                    <FilterHeader label="Part" options={summary.uniqueParts} value={colPart} onChange={setColPart} />
                  </th>
                  <th rowSpan={2} style={{ ...thStyle, width: 50, textAlign: "right" }}>Qty</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 50, textAlign: "right" }}>Op #</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 140, textAlign: "left" }}>
                    <FilterHeader label="Operation" options={summary.uniqueOperations} value={colOperation} onChange={setColOperation} />
                  </th>
                  <th rowSpan={2} style={{ ...thStyle, width: 75, textAlign: "right" }}>Setup</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 75, textAlign: "right" }}>Cycle</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 85, textAlign: "right" }}>Machining Hr</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 75, textAlign: "right" }}>MHR Rate</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 95, textAlign: "right" }}>Cost/Op</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 85, textAlign: "right" }}>Total Hrs/Part</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 95, textAlign: "right" }}>Cost/Part (1 Qty)</th>
                  <th rowSpan={2} style={{ ...thStyle, width: 95, textAlign: "right" }}>Cost (All Qty)</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.map((row, idx) => (
                  <tr key={row.key} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    {/* Machine cell — rowspan across all parts and operations within machine */}
                    {row.machineRowSpan > 0 && (
                      <td rowSpan={row.machineRowSpan} style={{ ...tdStyle, fontWeight: 600, fontSize: 11 }}>
                        {highlightText(row.machine_name || "N/A", searchTerm)}
                      </td>
                    )}

                    {/* Part cell — rowspan across all its operation rows */}
                    {row.partRowSpan > 0 && (
                      <td rowSpan={row.partRowSpan} style={{ ...tdStyle, fontWeight: 600, textAlign: "left" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontWeight: 500, wordBreak: "break-word", fontSize: 11 }}>
                            {highlightText(row.part_name, searchTerm)}
                          </div>
                          <div style={{ fontSize: 10, fontFamily: "monospace", wordBreak: "break-all" }}>
                            {highlightText(row.part_number, searchTerm)}
                          </div>
                        </div>
                      </td>
                    )}
                    {row.partRowSpan > 0 && (
                      <td rowSpan={row.partRowSpan} style={{ ...tdStyleRight, fontWeight: 600 }}>
                        {row.part_qty || 1}
                      </td>
                    )}

                    {/* Operation cells */}
                    <td style={{ ...tdStyleRight, fontWeight: 600 }}>
                      {row.operation_number}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "left", wordBreak: "break-word", fontWeight: row.is_outsource ? 600 : "normal", fontSize: 11 }}>
                      {highlightText(row.operation_name, searchTerm)} {row.is_outsource && <span style={{ fontWeight: 600, fontSize: 10 }}>(OUT)</span>}
                    </td>
                    <td style={{ ...tdStyleRight }}>
                      {row.setup_time || "00:00:00"}
                    </td>
                    <td style={{ ...tdStyleRight }}>
                      {row.cycle_time || "00:00:00"}
                    </td>
                    <td style={{ ...tdStyleRight }}>
                      {formatHms(row.total_seconds)}
                    </td>
                    <td style={{ ...tdStyleRight }}>
                      {row.mhr_rate ? `Rs.${row.mhr_rate}/hr` : "—"}
                    </td>
                    <td style={{ ...tdStyleRight, fontWeight: 600 }}>
                      {row.machine_cost > 0 ? fmtCost(row.machine_cost) : "—"}
                    </td>
                    {row.partRowSpan > 0 && (
                      <td rowSpan={row.partRowSpan} style={{ ...tdStyleRight, fontWeight: 600 }}>
                        {formatHms(row.total_hours_part)}
                      </td>
                    )}
                    {row.partRowSpan > 0 && (
                      <td rowSpan={row.partRowSpan} style={{ ...tdStyleRight, fontWeight: 600 }}>
                        {row.total_cost_part > 0 ? fmtCost(row.total_cost_part) : "—"}
                      </td>
                    )}
                    {row.partRowSpan > 0 && (
                      <td rowSpan={row.partRowSpan} style={{ ...tdStyleRight, fontWeight: 600 }}>
                        {row.total_cost_qty > 0 ? fmtCost(row.total_cost_qty) : "—"}
                      </td>
                    )}
                  </tr>
                ))}
                {/* Summary row */}
                <tr style={{ background: "#f9fafb", fontWeight: 700 }}>
                  <td colSpan={2} style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>TOTAL</td>
                  <td style={{ ...tdStyleRight, fontWeight: 700 }}>{summary.totalQtyAll}</td>
                  <td colSpan={6} style={{ ...tdStyle }}></td>
                  <td style={{ ...tdStyleRight, fontWeight: 700 }}>
                    {fmtCost(summary.totalCost)}
                  </td>
                  <td colSpan={3} style={{ ...tdStyle }}></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Toggle Button for Additional Project Costs ── */}
      <Button
        type="default"
        size="small"
        icon={showAdditionalCosts ? <UpOutlined /> : <DownOutlined />}
        onClick={() => setShowAdditionalCosts(!showAdditionalCosts)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontWeight: 600,
          fontSize: 11,
          height: 28,
          background: showAdditionalCosts ? "#f1f5f9" : "#fff",
          borderColor: "#cbd5e1",
        }}
      >
        {showAdditionalCosts ? "Hide" : "Show"} Additional Costs
        {additionalCosts.length > 0 && (
          <span style={{
            background: "#2563eb",
            color: "#fff",
            borderRadius: 4,
            padding: "1px 5px",
            fontSize: 9,
            fontWeight: 600,
          }}>
            {additionalCosts.length}
          </span>
        )}
      </Button>

      {/* ── Additional Project Costs (Tooling / Fixture / Inspection / etc.) ── */}
      {showAdditionalCosts && (
        <AdditionalCostsSection
          orderId={orderId}
          costs={additionalCosts}
          onCostsChange={setAdditionalCosts}
          userId={userId}
        />
      )}

    </div>
  );
};

export default ProductSummary;