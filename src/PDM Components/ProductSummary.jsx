import React, { useEffect, useMemo, useState } from "react";
import { Card, Empty, Spin, Table, Tag, Typography, Input, Select } from "antd";
import { ClockCircleOutlined, AppstoreOutlined, ToolOutlined, PartitionOutlined, SearchOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import ProductSummaryDownload from "../DownloadReports/ProductSummaryDownload";

const { Text } = Typography;

// ─── Helpers ────────────────────────────────────────────────────────────────

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
  <Card
    size="small"
    className="border border-slate-200 shadow-sm"
    styles={{ body: { padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 } }}
  >
    <div style={{ color: iconColor, fontSize: 20, lineHeight: 1 }}>{icon}</div>
    <div className="min-w-0">
      <div style={{ fontSize: 13, color: "#64748b", lineHeight: "1.3", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>{value}</div>
    </div>
  </Card>
);

// ─── Section Header ──────────────────────────────────────────────────────────

const SectionHeader = ({ icon, title, count }) => (
  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
    <div className="flex items-center gap-2">
      <span className="text-blue-600">{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{title}</span>
    </div>
    {count != null && (
      <Tag color="blue" style={{ margin: 0, fontFamily: "monospace", fontSize: 13 }}>{count} rows</Tag>
    )}
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────

const ProductSummary = ({ productId }) => {
  const [loading, setLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);
  const [machineFilter, setMachineFilter] = useState(null);
  const [operationFilter, setOperationFilter] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!productId) { setSummaryData(null); return; }

    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);

    // Use lightweight summary-data endpoint - only operations data for hours calculation
    axios
      .get(`${API_BASE_URL}/products/${productId}/summary-data`, { signal: controller.signal })
      .then((res) => { if (isMounted) setSummaryData(res.data); })
      .catch((e) => {
        if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
          console.error("Product summary fetch error:", e);
          if (isMounted) setSummaryData(null);
        }
      })
      .finally(() => { if (isMounted && !controller.signal.aborted) setLoading(false); });

    return () => { isMounted = false; controller.abort(); };
  }, [productId]);

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
    
    // Filter by machine
    if (machineFilter) {
      filteredRows = filteredRows.filter(r => 
        r.machine_name === machineFilter || r.machine_id === machineFilter
      );
    }
    
    // Filter by operation name
    if (operationFilter) {
      filteredRows = filteredRows.filter(r => 
        r.operation_name === operationFilter
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

    // Extract unique machines and operations for filter options
    const uniqueMachines = Array.from(new Set(rows.map(r => r.machine_name).filter(m => m && m !== "N/A"))).sort();
    const uniqueOperations = Array.from(new Set(rows.map(r => r.operation_name).filter(o => o))).sort();

    const totalCost = filteredRows.reduce((a, r) => a + (r.machine_cost || 0), 0);

    return { 
      productName: summaryData?.product?.product_name || "", 
      rows: filteredRows, 
      totalSetup, 
      totalCycle, 
      totalAll: totalSetup + totalCycle,
      totalCost,
      machineRows,
      uniqueMachines,
      uniqueOperations,
      allRows: rows
    };
  }, [summaryData, machineFilter, operationFilter, searchTerm]);

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

  // ── Column definitions ──────────────────────────────────────────────────

  // Machine table — same orange/green colors as operation table
  const machineColumns = [
    {
      title: "Machine",
      dataIndex: "machine_name",
      key: "machine_name",
      width: 120,
      render: (t) => (
        <Tag color="geekblue" style={{ margin: 0, whiteSpace: "normal", fontSize: 11, lineHeight: "1.3" }}>
          {highlightText(t || "N/A", searchTerm)}
        </Tag>
      ),
    },
    {
      title: "Setup Time",
      key: "setup",
      width: 100,
      render: (_, r) => (
        // ✅ Same orange Tag as op table's setup column
        <Tag color="orange" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>
          {formatHms(r.setup_seconds)}
        </Tag>
      ),
    },
    {
      title: "Cycle Time",
      key: "cycle",
      width: 100,
      render: (_, r) => (
        // ✅ Same green Tag as op table's cycle column
        <Tag color="green" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>
          {formatHms(r.cycle_seconds)}
        </Tag>
      ),
    },
    {
      title: "Total",
      key: "total",
      width: 100,
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#1e293b", fontSize: 11 }}>
          {formatHms(r.total_seconds)}
        </span>
      ),
    },
    {
      title: "MHR Rate",
      key: "mhr_rate",
      width: 90,
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7c3aed" }}>
          {r.mhr_rate ? `Rs.${r.mhr_rate}/hr` : <span style={{ color: "#94a3b8" }}>—</span>}
        </span>
      ),
    },
    {
      title: "Machine Cost",
      key: "machine_cost",
      width: 110,
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: r.machine_cost > 0 ? "#15803d" : "#94a3b8", fontSize: 11 }}>
          {r.machine_cost > 0 ? fmtCost(r.machine_cost) : "—"}
        </span>
      ),
    },
  ];

  // Operations table
  const opColumns = [
    {
      title: "Part",
      key: "part",
      width: 140,
      render: (_, r) => (
        <div className="min-w-0">
          <div style={{ fontWeight: 500, color: "#1e293b", wordBreak: "break-word", lineHeight: "1.3", fontSize: 11 }}>
            {highlightText(r.part_name, searchTerm)}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", wordBreak: "break-all" }}>
            {highlightText(r.part_number, searchTerm)}
          </div>
        </div>
      ),
    },
    {
      title: "Op #",
      dataIndex: "operation_number",
      key: "op_num",
      width: 60,
      render: (t) => (
        <Tag color="cyan" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>{t}</Tag>
      ),
    },
    {
      title: "Operation",
      dataIndex: "operation_name",
      key: "op_name",
      width: 150,
      render: (t, r) => (
        <span style={{ 
          wordBreak: "break-word", 
          fontSize: 11, 
          lineHeight: "1.3",
          color: r.is_outsource ? "#dc2626" : "#1e293b",
          fontWeight: r.is_outsource ? 600 : "normal"
        }}>
          {highlightText(t, searchTerm)} {r.is_outsource && "(OUTSOURCE)"}
        </span>
      ),
    },
    {
      title: "Qty",
      key: "qty",
      width: 50,
      render: (_, r) => (
        <Tag color="blue" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>
          {r.part_qty || 1}
        </Tag>
      ),
    },
    {
      title: "Machine",
      dataIndex: "machine_name",
      key: "machine",
      width: 120,
      render: (t) => (
        <Tag color="geekblue" style={{ margin: 0, whiteSpace: "normal", fontSize: 10, lineHeight: "1.3" }}>
          {highlightText(t || "N/A", searchTerm)}
        </Tag>
      ),
    },
    {
      title: "Setup",
      dataIndex: "setup_time",
      key: "setup",
      width: 90,
      render: (t) => (
        // ✅ Orange Tag — reference color for machine table
        <Tag color="orange" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>
          {t || "00:00:00"}
        </Tag>
      ),
    },
    {
      title: "Cycle",
      dataIndex: "cycle_time",
      key: "cycle",
      width: 90,
      render: (t) => (
        // ✅ Green Tag — reference color for machine table
        <Tag color="green" style={{ margin: 0, fontFamily: "monospace", fontSize: 11 }}>
          {t || "00:00:00"}
        </Tag>
      ),
    },
    {
      title: "Total",
      key: "total",
      width: 90,
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", color: "#475569", fontSize: 11 }}>
          {formatHms(r.total_seconds)}
        </span>
      ),
    },
    {
      title: "Cost",
      key: "machine_cost",
      width: 110,
      render: (_, r) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: r.machine_cost > 0 ? "#15803d" : "#94a3b8", fontSize: 11 }}>
          {r.machine_cost > 0 ? fmtCost(r.machine_cost) : "—"}
        </span>
      ),
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .ps-scroll-root {
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
        }
        /* ── Unified font size for ALL table cells and headers ── */
        .ps-table .ant-table-thead > tr > th {
          background: #f8fafc;
          font-size: 11px !important;
          font-weight: 600;
          color: #475569;
          padding: 6px 8px !important;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .ps-table .ant-table-tbody > tr > td {
          padding: 6px 8px !important;
          font-size: 11px !important;
          vertical-align: middle;
        }
        .ps-table .ant-table-tbody > tr:hover > td {
          background: #f0f7ff !important;
        }
        /* Scrollbar styling - more visible and user-friendly */
        .ps-table-scroll::-webkit-scrollbar { 
          width: 8px; 
          height: 8px; 
        }
        .ps-table-scroll::-webkit-scrollbar-track { 
          background: #f1f5f9; 
          border-radius: 4px;
          border: 1px solid #e2e8f0;
        }
        .ps-table-scroll::-webkit-scrollbar-thumb { 
          background: #94a3b8; 
          border-radius: 4px;
          border: 1px solid #cbd5e1;
        }
        .ps-table-scroll::-webkit-scrollbar-thumb:hover { 
          background: #64748b; 
        }
        .ps-table-scroll::-webkit-scrollbar-corner {
          background: #f1f5f9;
        }
        /* Add subtle shadow to indicate scrollable content */
        .ps-table-scroll {
          box-shadow: inset -1px 0 2px rgba(0,0,0,0.05);
        }
        /* Ensure Ant Design Tag text respects font size override */
        .ps-table .ant-tag {
          font-size: 11px !important;
        }
      `}</style>

      {/* Outer scroll container */}
      <div
        className="ps-scroll-root w-full p-3 sm:p-5 flex flex-col gap-4"
        style={{ height: "100%", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}
      >

        {/* Product title with search and filters */}
        <div className="flex items-center gap-2 flex-wrap justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <AppstoreOutlined className="text-blue-600 text-lg" />
            <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }} className="truncate">
              {summary.productName || "Product Summary"}
            </span>
            <Input
              placeholder="Search part, operation, machine..."
              prefix={<SearchOutlined className="text-slate-400" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              size="small"
              style={{ width: 250 }}
            />
            <Select
              placeholder="Filter by Machine"
              value={machineFilter}
              onChange={setMachineFilter}
              allowClear
              size="small"
              style={{ minWidth: 150 }}
              options={summary.uniqueMachines.map(m => ({ label: m, value: m }))}
            />
            <Select
              placeholder="Filter by Operation"
              value={operationFilter}
              onChange={setOperationFilter}
              allowClear
              size="small"
              style={{ minWidth: 150 }}
              options={summary.uniqueOperations.map(o => ({ label: o, value: o }))}
            />
          </div>
          <ProductSummaryDownload 
            summaryData={summary} 
            productName={summary.productName}
            fileName={`${summary.productName || "product"}_summary.pdf`}
          />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<ClockCircleOutlined />} iconColor="#f97316" label="Total Setup Time"       value={formatHms(summary.totalSetup)} />
          <StatCard icon={<ClockCircleOutlined />} iconColor="#16a34a" label="Total Cycle Time"       value={formatHms(summary.totalCycle)} />
          <StatCard icon={<ClockCircleOutlined />} iconColor="#2563eb" label="Total (Setup + Cycle)"  value={formatHms(summary.totalAll)}   />
          <StatCard icon={<ToolOutlined />}         iconColor="#7c3aed" label="Total Machining Cost"  value={fmtCost(summary.totalCost)}     />
        </div>

        {/* ── Table 1: Machine-wise ─────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader
            icon={<ToolOutlined />}
            title="Machine-wise Total Hours"
            count={summary.machineRows.length}
          />
          <div className="ps-table-scroll" style={{ overflowY: "auto", overflowX: "auto", maxHeight: 320 }}>
            <Table
              className="ps-table"
              columns={machineColumns}
              dataSource={summary.machineRows}
              rowKey={(r) => r.machine_name}
              pagination={false}
              size="small"
              scroll={{ x: 620 }}
              locale={{ emptyText: <Empty description="No IN-House operations" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>

        {/* ── Table 2: Part Operations ──────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader
            icon={<PartitionOutlined />}
            title="Part Operations (ALL)"
            count={summary.rows.length}
          />
          <div className="ps-table-scroll" style={{ overflowY: "auto", overflowX: "auto", maxHeight: 420 }}>
            <Table
              className="ps-table"
              columns={opColumns}
              dataSource={summary.rows}
              rowKey="key"
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
              locale={{ emptyText: <Empty description="No operations found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>

      </div>
    </>
  );
};

export default ProductSummary;