import React, { useEffect, useMemo, useState } from "react";
import { Card, Empty, Spin, Table, Tag, Typography } from "antd";
import { ToolOutlined, ClockCircleOutlined, AppstoreOutlined } from "@ant-design/icons";
import axios from "axios";
import { API_BASE_URL } from "../../Config/auth";

const { Text } = Typography;

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

const FitTable = ({ columns, dataSource, scrollX, locale, rowKey, className, maxHeight }) => {
  const containerStyle = maxHeight
    ? { maxHeight, overflowY: "auto", overflowX: "hidden" }
    : undefined;

  return (
    <div className="w-full" style={containerStyle}>
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey={rowKey}
        pagination={false}
        size="small"
        scroll={scrollX ? { x: scrollX } : undefined}
        locale={locale}
        className={className}
      />
    </div>
  );
};

const parseHmsToSeconds = (val) => {
  if (!val) return 0;
  if (typeof val !== "string") return 0;
  const parts = val.split(":");
  if (parts.length < 2) return 0;
  const [hh, mm, ssRaw] = parts;
  const ss = (ssRaw || "0").split(".")[0];
  const h = parseInt(hh, 10);
  const m = parseInt(mm, 10);
  const s = parseInt(ss, 10);
  if ([h, m, s].some((n) => Number.isNaN(n))) return 0;
  return h * 3600 + m * 60 + s;
};

const formatHours = (seconds) => `${(seconds / 3600).toFixed(2)} hrs`;

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

const ProductSummary = ({ productId, initialHierarchy }) => {
  const [loading, setLoading] = useState(false);
  const [hierarchy, setHierarchy] = useState(initialHierarchy || null);

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

  useEffect(() => {
    if (!productId) {
      setHierarchy(null);
      return;
    }

    // If BOM has already loaded hierarchy, use it and skip fetch
    if (initialHierarchy) {
      setHierarchy(initialHierarchy);
      setLoading(false);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    setLoading(true);
    // Do not filter by user_id: admin, project coordinator, and manufacturing coordinator all see the same product hierarchy
    axios
      .get(`${API_BASE_URL}/products/${productId}/hierarchical`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (isMounted) setHierarchy(res.data);
      })
      .catch((e) => {
        if (e?.name !== "CanceledError" && e?.name !== "AbortError") {
          console.error("Product summary fetch error:", e);
          if (isMounted) setHierarchy(null);
        }
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) setLoading(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [productId, initialHierarchy]);

  const summary = useMemo(() => {
    const parts = hierarchy ? flattenPartsFromHierarchy(hierarchy) : [];
    const rows = [];

    parts.forEach((pd) => {
      const part = pd?.part || {};
      const ops = Array.isArray(pd?.operations) ? pd.operations : [];

      ops.forEach((op) => {
        const isOutSource = op?.part_type_id === 2 || String(op?.part_type_name || "").toLowerCase().includes("out");
        if (isOutSource) return;
        const setupSec = parseHmsToSeconds(op?.setup_time);
        const cycleSec = parseHmsToSeconds(op?.cycle_time);
        const totalSec = setupSec + cycleSec;
        const machineName = op?.machine_name || (op?.machine_id ? `Machine ${op.machine_id}` : "N/A");
        const machineId = op?.machine_id || null;

        rows.push({
          key: `${part?.id || "p"}-${op?.id || op?.operation_number || Math.random()}`,
          part_number: part?.part_number || "—",
          part_name: part?.part_name || "—",
          operation_number: op?.operation_number || "—",
          operation_name: op?.operation_name || "—",
          setup_time: op?.setup_time || "00:00:00",
          cycle_time: op?.cycle_time || "00:00:00",
          machine_name: machineName,
          machine_id: machineId,
          setup_seconds: setupSec,
          cycle_seconds: cycleSec,
          total_seconds: totalSec,
        });
      });
    });

    const totalSetup = rows.reduce((acc, r) => acc + (r.setup_seconds || 0), 0);
    const totalCycle = rows.reduce((acc, r) => acc + (r.cycle_seconds || 0), 0);
    const totalAll = totalSetup + totalCycle;

    const byMachine = new Map();
    rows.forEach((r) => {
      const key = r.machine_id || r.machine_name || "N/A";
      const prev = byMachine.get(key) || {
        machine_name: r.machine_name,
        setup_seconds: 0,
        cycle_seconds: 0,
        total_seconds: 0,
      };
      prev.setup_seconds += r.setup_seconds || 0;
      prev.cycle_seconds += r.cycle_seconds || 0;
      prev.total_seconds += r.total_seconds || 0;
      byMachine.set(key, prev);
    });

    const machineRows = Array.from(byMachine.values()).sort((a, b) => b.total_seconds - a.total_seconds);

    return {
      productName: hierarchy?.product?.product_name || "",
      productNumber: hierarchy?.product?.product_number || "",
      rows,
      totalSetup,
      totalCycle,
      totalAll,
      machineRows,
    };
  }, [hierarchy]);

  if (!productId) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Empty description="Select a product to view summary" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <Spin tip="Loading product summary...">
          <div style={{ width: 40, height: 40 }} />
        </Spin>
      </div>
    );
  }

  if (!hierarchy) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-white">
        <Empty description="No summary available" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    );
  }

  const opColumns = [
    { title: "Part", key: "part", render: (_, r) => (
      <div className="min-w-0">
        <div className="font-medium text-slate-800 truncate">{r.part_name}</div>
        <div className="text-xs text-slate-500 font-mono truncate">{r.part_number}</div>
      </div>
    )},
    { title: "Op #", dataIndex: "operation_number", key: "operation_number", width: 80, render: (t) => <Tag color="cyan" className="m-0 font-mono">{t}</Tag> },
    { title: "Operation", dataIndex: "operation_name", key: "operation_name", ellipsis: true },
    { title: "Setup", dataIndex: "setup_time", key: "setup_time", width: 110, render: (t) => <Tag color="orange" className="m-0">{t || "00:00:00"}</Tag> },
    { title: "Cycle", dataIndex: "cycle_time", key: "cycle_time", width: 110, render: (t) => <Tag color="green" className="m-0">{t || "00:00:00"}</Tag> },
    { title: "Machine", dataIndex: "machine_name", key: "machine_name", width: 200, render: (t) => <Tag color="geekblue" className="m-0 whitespace-normal">{t || "N/A"}</Tag> },
    { title: "Total", key: "total", width: 110, render: (_, r) => <span className="font-mono text-slate-700">{formatHms(r.total_seconds)}</span> },
  ];

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

  return (
    <div className="h-full w-full overflow-auto flex flex-col p-2 sm:p-4">
      <div className="flex items-baseline gap-2 mb-2 sm:mb-3">
        <AppstoreOutlined className="text-blue-600 text-base sm:text-lg" />
        <span className="font-semibold text-slate-800 truncate text-sm sm:text-base">
          {summary.productName || "Product"}
        </span>
        <span className="text-[10px] sm:text-xs text-slate-500 font-mono truncate">
          ({summary.productNumber || productId})
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 sm:mb-3">
        <Card
          size="small"
          className="border border-slate-200 shadow-sm"
          styles={{ body: { padding: 10, display: "flex", alignItems: "center", gap: 8 } }}
        >
          <div className="flex items-center gap-2">
            <ClockCircleOutlined className="text-orange-500" />
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-500">
                Total Setup Time (HH:MM:SS)
              </div>
              <div className="font-semibold text-slate-800 text-sm sm:text-base">
                {formatHms(summary.totalSetup)}
              </div>
            </div>
          </div>
        </Card>
        <Card
          size="small"
          className="border border-slate-200 shadow-sm"
          styles={{ body: { padding: 10, display: "flex", alignItems: "center", gap: 8 } }}
        >
          <div className="flex items-center gap-2">
            <ClockCircleOutlined className="text-green-600" />
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-500">
                Total Cycle Time (HH:MM:SS)
              </div>
              <div className="font-semibold text-slate-800 text-sm sm:text-base">
                {formatHms(summary.totalCycle)}
              </div>
            </div>
          </div>
        </Card>
        <Card
          size="small"
          className="border border-slate-200 shadow-sm"
          styles={{ body: { padding: 10, display: "flex", alignItems: "center", gap: 8 } }}
        >
          <div className="flex items-center gap-2">
            <ClockCircleOutlined className="text-blue-600" />
            <div className="min-w-0">
              <div className="text-[11px] sm:text-xs text-slate-500">
                Total (Setup + Cycle) (HH:MM:SS)
              </div>
              <div className="font-semibold text-slate-800 text-sm sm:text-base">
                {formatHms(summary.totalAll)}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <style>{`
        .product-summary-table .ant-table-thead > tr > th { white-space: nowrap; }
        .product-summary-table .ant-table-tbody > tr > td { vertical-align: top; }
        @media (max-width: 640px) {
          .product-summary-table .ant-table-thead > tr > th,
          .product-summary-table .ant-table-tbody > tr > td {
            padding: 6px 8px !important;
            font-size: 11px !important;
          }
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0 overflow-hidden">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm" style={{ display: "flex", flexDirection: "column" }}>
          <SectionHeader
            icon={<ToolOutlined />}
            title="Machine-wise Total Hours"
            count={summary.machineRows.length}
          />
          <div style={{ overflowY: "auto", overflowX: "auto", maxHeight: 320 }}>
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

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-0 shadow-sm">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] sm:text-xs font-semibold text-slate-700">
              Part operations (IN-House)
            </span>
          </div>
          <FitTable
            columns={opColumns}
            dataSource={summary.rows}
            rowKey="key"
            scrollX={900}
            maxHeight="55vh"
            tableLayout="auto"
            locale={{ emptyText: <Empty description="No IN-House operations found" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            className="product-summary-table"
          />
        </div>
      </div>
    </div>
  );
};

export default ProductSummary;

