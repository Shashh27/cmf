import React, { useEffect, useMemo, useState } from "react";
import { Card, Empty, Spin, Table, Tag, Typography } from "antd";
import { ClockCircleOutlined, AppstoreOutlined, ToolOutlined, PartitionOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Text } = Typography;

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const formatHms = (seconds) => {
  const sec = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const flattenPartsFromHierarchy = (data) => {
  const parts = [];
  const directParts = data?.direct_parts || data?.parts || [];
  parts.push(...directParts);
  const walkAssemblies = (assemblies) => {
    (assemblies || []).forEach((asm) => {
      if (asm?.parts) parts.push(...asm.parts);
      if (asm?.subassemblies) walkAssemblies(asm.subassemblies);
    });
  };
  walkAssemblies(data?.assemblies || []);
  return parts;
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

const ProductSummary = ({ productId, initialHierarchy }) => {
  const [loading, setLoading] = useState(false);
  const [hierarchy, setHierarchy] = useState(initialHierarchy || null);

  useEffect(() => {
    if (!productId) { setHierarchy(null); return; }
    if (initialHierarchy) { setHierarchy(initialHierarchy); setLoading(false); return; }

    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);

    axios
      .get(`${API_BASE_URL}/products/${productId}/hierarchical`, { signal: controller.signal })
      .then((res) => { if (isMounted) setHierarchy(res.data); })
      .catch((e) => {
        if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
          console.error("Product summary fetch error:", e);
          if (isMounted) setHierarchy(null);
        }
      })
      .finally(() => { if (isMounted && !controller.signal.aborted) setLoading(false); });

    return () => { isMounted = false; controller.abort(); };
  }, [productId, initialHierarchy]);

  const summary = useMemo(() => {
    const parts = hierarchy ? flattenPartsFromHierarchy(hierarchy) : [];
    const rows = [];

    parts.forEach((pd) => {
      const part = pd?.part || {};
      const ops = Array.isArray(pd?.operations) ? pd.operations : [];
      ops.forEach((op) => {
        const isOutSource =
          op?.part_type_id === 2 ||
          String(op?.part_type_name || "").toLowerCase().includes("out");
        if (isOutSource) return;
        const setupSec = parseHmsToSeconds(op?.setup_time);
        const cycleSec = parseHmsToSeconds(op?.cycle_time);
        const machineName = op?.machine_name || (op?.machine_id ? `Machine ${op.machine_id}` : "N/A");
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
          setup_seconds: setupSec,
          cycle_seconds: cycleSec,
          total_seconds: setupSec + cycleSec,
        });
      });
    });

    const totalSetup = rows.reduce((a, r) => a + r.setup_seconds, 0);
    const totalCycle = rows.reduce((a, r) => a + r.cycle_seconds, 0);

    const byMachine = new Map();
    rows.forEach((r) => {
      const key = r.machine_id || r.machine_name || "N/A";
      const prev = byMachine.get(key) || { machine_name: r.machine_name, setup_seconds: 0, cycle_seconds: 0, total_seconds: 0 };
      prev.setup_seconds += r.setup_seconds;
      prev.cycle_seconds += r.cycle_seconds;
      prev.total_seconds += r.total_seconds;
      byMachine.set(key, prev);
    });

    const machineRows = Array.from(byMachine.values()).sort((a, b) => b.total_seconds - a.total_seconds);

    return { productName: hierarchy?.product?.product_name || "", rows, totalSetup, totalCycle, totalAll: totalSetup + totalCycle, machineRows };
  }, [hierarchy]);

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

  if (!hierarchy) return (
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
          {t || "N/A"}
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
            {r.part_name}
          </div>
          <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", wordBreak: "break-all" }}>
            {r.part_number}
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
      render: (t) => <span style={{ wordBreak: "break-word", fontSize: 11, lineHeight: "1.3" }}>{t}</span>,
    },
    {
      title: "Machine",
      dataIndex: "machine_name",
      key: "machine",
      width: 120,
      render: (t) => (
        <Tag color="geekblue" style={{ margin: 0, whiteSpace: "normal", fontSize: 10, lineHeight: "1.3" }}>
          {t || "N/A"}
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
          font-size: 13px !important;
          font-weight: 600;
          color: #475569;
          padding: 8px 12px !important;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .ps-table .ant-table-tbody > tr > td {
          padding: 8px 12px !important;
          font-size: 13px !important;
          vertical-align: middle;
        }
        .ps-table .ant-table-tbody > tr:hover > td {
          background: #f0f7ff !important;
        }
        /* Scrollbar styling */
        .ps-table-scroll::-webkit-scrollbar { width: 6px; }
        .ps-table-scroll::-webkit-scrollbar-track { background: #f1f5f9; border-radius: 4px; }
        .ps-table-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
        .ps-table-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
        /* Ensure Ant Design Tag text respects font size override */
        .ps-table .ant-tag {
          font-size: 13px !important;
        }
      `}</style>

      {/* Outer scroll container */}
      <div
        className="ps-scroll-root w-full p-3 sm:p-5 flex flex-col gap-4"
        style={{ height: "100%", overflowY: "auto", overflowX: "hidden", boxSizing: "border-box" }}
      >

        {/* Product title */}
        <div className="flex items-center gap-2">
          <AppstoreOutlined className="text-blue-600 text-lg" />
          <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 13 }} className="truncate">
            {summary.productName || "Product Summary"}
          </span>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard icon={<ClockCircleOutlined />} iconColor="#f97316" label="Total Setup Time"       value={formatHms(summary.totalSetup)} />
          <StatCard icon={<ClockCircleOutlined />} iconColor="#16a34a" label="Total Cycle Time"       value={formatHms(summary.totalCycle)} />
          <StatCard icon={<ClockCircleOutlined />} iconColor="#2563eb" label="Total (Setup + Cycle)"  value={formatHms(summary.totalAll)}   />
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
              scroll={{ x: 420 }}
              locale={{ emptyText: <Empty description="No IN-House operations" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>

        {/* ── Table 2: Part Operations ──────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader
            icon={<PartitionOutlined />}
            title="Part Operations (IN-House)"
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
              scroll={{ x: 740 }}
              locale={{ emptyText: <Empty description="No IN-House operations found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
          </div>
        </div>

      </div>
    </>
  );
};

export default ProductSummary;

