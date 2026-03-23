import React, { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Select, Table, Tag, Typography, Space, Spin, message, Tabs, Button, Modal, Input, DatePicker } from "antd";
import { ToolOutlined, ExclamationCircleFilled, SaveOutlined, EditOutlined } from "@ant-design/icons";
import { SCHEDULING_API_BASE_URL } from "../../Config/schedulingconfig.js";
import { API_BASE_URL } from "../../Config/auth";
import dayjs from "dayjs";

const ProcessPlanning = ({ initialOrderId }) => {
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);
  const [isActive, setIsActive] = useState(false);

  const [activeIds, setActiveIds] = useState([]);
  const [partStatuses, setPartStatuses] = useState({});
  const [selectedInIds, setSelectedInIds] = useState([]);
  const isOrderActiveDerived = useMemo(() => {
    return Object.values(partStatuses).some(v => String(v).toLowerCase() === "active");
  }, [partStatuses]);
  const [outStatusMap, setOutStatusMap] = useState({});
  const [outEditing, setOutEditing] = useState({});

  // ================================
  // FETCH ORDERS
  // ================================
  useEffect(() => {
    const fetchOrders = async () => {
      setOrdersLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`);
        const data = await res.json();
        setOrders(data || []);
      } catch {}
      setOrdersLoading(false);
    };
    fetchOrders();
  }, []);

  // Auto-select order when initialOrderId provided
  useEffect(() => {
    if (!initialOrderId || !orders?.length) return;
    const numericId = Number(initialOrderId);
    const exists = orders.some(o => Number(o.id) === numericId);
    if (exists) {
      setSelectedOrderId(numericId);
    }
  }, [initialOrderId, orders]);

  const isLockedToInitialOrder = initialOrderId != null && String(initialOrderId).trim() !== "";
  const visibleOrders = isLockedToInitialOrder
    ? orders.filter(o => Number(o.id) === Number(initialOrderId))
    : orders;

  // ================================
  // FETCH ORDER DETAILS (hierarchy)
  // ================================
  const fetchOrderDetails = async (id) => {
    if (!id) return;
    setDetailsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${id}/hierarchical`);
      const data = await res.json();
      setOrderDetails(data || null);
    } catch {}
    setDetailsLoading(false);
  };

  // ================================
  // FETCH ORDER SUMMARY (SOURCE OF TRUTH)
  // ================================
  const fetchOrderSummary = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/order-summary/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        setOrderSummary(data);
        setIsActive(data.status === "active");
      }
    } catch {}
  };

  // ================================
  // FETCH ACTIVE PARTS
  // ================================
  const fetchActiveParts = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/active-parts/${orderId}`);
      const data = await res.json();
      const ids = (data.active_parts || [])
        .filter(p => p.status === "active")
        .map(p => p.part_id);
      setActiveIds(ids);
    } catch {}
  };

  // ================================
  // WHEN ORDER SELECTED
  // ================================
  useEffect(() => {
    if (!selectedOrderId) return;
    fetchOrderDetails(selectedOrderId);
    fetchOrderSummary(selectedOrderId);
    fetchActiveParts(selectedOrderId);
    fetchOutSourceStatuses(selectedOrderId);
  }, [selectedOrderId]);

  // ================================
  // PART LIST FROM HIERARCHY
  // ================================
  const getAllParts = (od) => {
    const h = od?.product_hierarchy || {};
    const list = [];

    const pushPart = (item) => {
      const p = item?.part || item;
      if (!p) return;
      list.push({
        id: p.id,
        part_number: p.part_number,
        part_name: p.part_name,
        type_name: (p.type_name || "").toLowerCase()
      });
    };

    const walk = (assemblies) => {
      if (!Array.isArray(assemblies)) return;
      assemblies.forEach(a => {
        if (Array.isArray(a.parts)) a.parts.forEach(pushPart);
        if (Array.isArray(a.subassemblies)) walk(a.subassemblies);
      });
    };

    if (Array.isArray(h.direct_parts)) h.direct_parts.forEach(pushPart);
    walk(h.assemblies);

    return list;
  };

  const allParts = useMemo(() => getAllParts(orderDetails), [orderDetails]);
  const inHouseParts = useMemo(() => allParts.filter(p => p.type_name.includes("in")), [allParts]);
  const outSourceParts = useMemo(() => allParts.filter(p => p.type_name.includes("out")), [allParts]);

  // ================================
  // MAP PART STATUS
  // ================================
  useEffect(() => {
    const map = {};
    const set = new Set(activeIds);
    allParts.forEach(p => {
      map[p.id] = set.has(p.id) ? "Active" : "Inactive";
    });
    setPartStatuses(map);
  }, [activeIds, allParts]);

  // ================================
  // OUT SOURCE STATUS (fetch/save)
  // ================================
  const fetchOutSourceStatuses = async (orderId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/out-source-parts-status/order/${orderId}`);
      if (!res.ok) return;
      const rows = await res.json();
      const map = {};
      (rows || []).forEach(x => {
        map[x.part_id] = {
          id: x.id,
          start_date: x.start_date,
          to_date: x.to_date,
          status: x.status,
        };
      });
      setOutStatusMap(map);
    } catch {
      // ignore
    }
  };

  const startEditOutSource = (part) => {
    const existing = outStatusMap[part.id] || {};
    setOutEditing(prev => ({
      ...prev,
      [part.id]: {
        editing: true,
        start_date: existing.start_date ? String(existing.start_date).slice(0, 10) : "",
        to_date: existing.to_date ? String(existing.to_date).slice(0, 10) : "",
        status: existing.status || "",
      }
    }));
  };

  const handleSaveOutSource = async (part) => {
    const edit = outEditing[part.id] || {};
    const toISODate = (v) => {
      if (!v) return null;
      try {
        // Expect YYYY-MM-DD from <input type=\"date\" />, normalize to 'YYYY-MM-DDT00:00:00'
        return `${v}T00:00:00`;
      } catch {
        return null;
      }
    };
    const payload = {
      part_id: Number(part.id),
      order_id: Number(selectedOrderId),
      start_date: toISODate(edit.start_date),
      to_date: toISODate(edit.to_date),
      status: (edit.status || "").trim(),
    };
    try {
      if (!payload.status) {
        message.error("Please select a status before saving");
        return;
      }
      const existing = outStatusMap[part.id];
      let res;
      if (existing?.id) {
        res = await fetch(`${API_BASE_URL}/out-source-parts-status/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_BASE_URL}/out-source-parts-status/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      if (!res.ok) {
        let errMsg = "Failed to save";
        try {
          const e = await res.json();
          errMsg = e?.detail || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      message.success("Out source status saved");
      await fetchOutSourceStatuses(selectedOrderId);
      setOutEditing(prev => {
        const next = { ...prev };
        delete next[part.id];
        return next;
      });
    } catch (e) {
      message.error(`Failed to save out source status: ${e?.message || ""}`.trim());
    }
  };

  // ================================
  // UPDATE ORDER STATUS
  // ================================
  const updateOrderStatus = async (next) => {
    if (!selectedOrderId) return;

    try {
      const res = await fetch(
        `${SCHEDULING_API_BASE_URL}/scheduling/set-order-status/${selectedOrderId}?status=${next}`,
        { method: "POST" }
      );

      if (!res.ok) throw new Error();

      message.success(`Order status changed to ${next}`);

      await fetchOrderSummary(selectedOrderId);
      await fetchActiveParts(selectedOrderId);

    } catch {
      message.error("Failed to update order status");
    }
  };

  const confirmStatusChange = (next) => {
    const orderNo = (orderDetails?.order?.sale_order_number) || (orderDetails?.sale_order_number) || selectedOrderId;
    Modal.confirm({
      title: "Confirm Status Change",
      icon: <ExclamationCircleFilled style={{ color: "#faad14" }} />,
      content: (
        <div>
          Are you sure you want to change the status of Project {orderNo} to {String(next).toLowerCase()}?
        </div>
      ),
      okText: "OK",
      cancelText: "Cancel",
      onOk: () => updateOrderStatus(next)
    });
  };

  // ================================
  // UPDATE PART STATUS
  // ================================
  const applyPartStatus = async (status) => {
    if (!selectedOrderId) return;
    if (!selectedInIds || selectedInIds.length === 0) {
      Modal.warning({
        title: "Select Parts",
        content: "Please select at least one part.",
        okText: "OK",
      });
      return;
    }

    try {
      await Promise.all(
        selectedInIds.map(pid =>
          fetch(`${SCHEDULING_API_BASE_URL}/scheduling/update-part-status/${selectedOrderId}/${pid}?status=${status}`, { method: "PUT" })
        )
      );

      message.success("Parts updated");

      await fetchActiveParts(selectedOrderId);
      await fetchOrderSummary(selectedOrderId);

      setSelectedInIds([]);
    } catch {
      message.error("Failed updating parts");
    }
  };

  // ================================
  // TABLE COLUMNS
  // ================================
  const inHouseColumns = [
    { title: "Part No", dataIndex: "part_number" },
    { title: "Part Name", dataIndex: "part_name" },
    {
      title: "Status",
      render: (_, r) => {
        const st = partStatuses[r.id] || "Inactive";
        return <Tag color={st === "Active" ? "green" : "default"}>{st}</Tag>;
      }
    }
  ];
  const outSourceColumns = [
    { title: "Part No", dataIndex: "part_number" },
    { title: "Part Name", dataIndex: "part_name" }
  ];
  const outSourceColumnsExtended = [
    { title: "Part No", dataIndex: "part_number" },
    { title: "Part Name", dataIndex: "part_name" },
    {
      title: "Start Date",
      render: (_, r) => {
        const st = outEditing[r.id];
        const val = (st?.start_date ?? outStatusMap[r.id]?.start_date) || "";
        if (st?.editing) {
          return (
            <DatePicker
              size="small"
              value={val ? dayjs(String(val).slice(0, 10), "YYYY-MM-DD") : null}
              onChange={(d) =>
                setOutEditing(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), editing: true, start_date: d ? d.format("YYYY-MM-DD") : "" } }))
              }
              style={{ minWidth: 140 }}
              format="DD-MM-YYYY"
            />
          );
        }
        return val ? dayjs(String(val).slice(0, 10), "YYYY-MM-DD").format("DD-MM-YYYY") : "-";
      }
    },
    {
      title: "To Date",
      render: (_, r) => {
        const st = outEditing[r.id];
        const val = (st?.to_date ?? outStatusMap[r.id]?.to_date) || "";
        if (st?.editing) {
          return (
            <DatePicker
              size="small"
              value={val ? dayjs(String(val).slice(0, 10), "YYYY-MM-DD") : null}
              onChange={(d) =>
                setOutEditing(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), editing: true, to_date: d ? d.format("YYYY-MM-DD") : "" } }))
              }
              style={{ minWidth: 140 }}
              format="DD-MM-YYYY"
              disabledDate={(current) => {
                const s = (outEditing[r.id]?.start_date ?? outStatusMap[r.id]?.start_date) || "";
                if (!s) return false;
                const start = dayjs(String(s).slice(0, 10), "YYYY-MM-DD");
                return current && current.isBefore(start, "day");
              }}
            />
          );
        }
        return val ? dayjs(String(val).slice(0, 10), "YYYY-MM-DD").format("DD-MM-YYYY") : "-";
      }
    },
    {
      title: "Status",
      render: (_, r) => {
        const st = outEditing[r.id];
        const val = (st?.status ?? outStatusMap[r.id]?.status) || "";
        if (st?.editing) {
          return (
            <Select
              size="small"
              style={{ minWidth: 180 }}
              value={val || undefined}
              onChange={(v) =>
                setOutEditing(prev => ({ ...prev, [r.id]: { ...(prev[r.id] || {}), editing: true, status: v } }))
              }
              options={[
                { label: "Purchase Order", value: "Purchase Order" },
                { label: "Purchase Request", value: "Purchase Request" },
                { label: "Part Received", value: "Part Received" },
              ]}
              placeholder="Select status"
            />
          );
        }
        return val || "-";
      }
    },
    {
      title: "Action",
      align: "center",
      render: (_, r) => {
        const st = outEditing[r.id];
        if (st?.editing) {
          return (
            <Button
              type="link"
              icon={<SaveOutlined />}
              onClick={() => handleSaveOutSource(r)}
            />
          );
        }
        return (
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => startEditOutSource(r)}
          />
        );
      }
    }
  ];

  const summary = useMemo(() => {
    const d = orderDetails || {};
    const order = d.order || d.production_order || d || {};
    const part = d.part || d.product || {};
    const dateOnly = (v) => {
      if (!v) return "-";
      try {
        const base = typeof v === "string" && v.includes("T") ? v.split("T")[0] : String(v).slice(0, 10);
        const d = dayjs(base, "YYYY-MM-DD", true);
        return d.isValid() ? d.format("DD-MM-YYYY") : base;
      } catch {
        return String(v);
      }
    };
    return {
      projectNo: order.sale_order_number || order.order_number || order.production_order_number || "-",
      projectName: order.project_name || "-",
      customer: order.customer_name || order.company_name || "-",
      product: part.part_name || order.product_name || "-",
      launchedQuantity: order.launched_quantity ?? order.quantity ?? "-",
      startDate: dateOnly(order.order_date || order.start_date),
      dueDate: dateOnly(order.due_date),
      pdc: order.pdc || order.pdc_date || "Not yet scheduled",
    };
  }, [orderDetails]);

  // ================================
  // UI
  // ================================
  return (
    <div>
      <style>{`
        .pp-summary-card { --tw-bg-opacity: 1; background: rgb(254 252 232 / var(--tw-bg-opacity)); border: 1px solid #e5e7eb; }
        .pp-summary-card.active { --tw-bg-opacity: 1; background: rgb(240 253 244 / var(--tw-bg-opacity)); border: 1px solid #b7eb8f; }
        .pp-summary-grid { display: grid; grid-template-columns: repeat(6, minmax(140px, 1fr)); gap: 0; }
        @media (max-width: 1200px) { .pp-summary-grid { grid-template-columns: repeat(3, minmax(160px, 1fr)); } }
        @media (max-width: 768px) { .pp-summary-grid { grid-template-columns: repeat(2, minmax(160px, 1fr)); } }
        @media (max-width: 480px) { .pp-summary-grid { grid-template-columns: 1fr; } }
      `}</style>
      <Card>
        <Space>
          <span>Select Order:</span>
          <Select
            style={{ width: 300 }}
            value={selectedOrderId}
            onChange={isLockedToInitialOrder ? undefined : setSelectedOrderId}
            disabled={isLockedToInitialOrder}
            options={visibleOrders.map(o => ({
              value: o.id,
              label: `${o.sale_order_number}`
            }))}
          />
        </Space>
      </Card>

      {orderDetails && (
        <Card style={{ marginTop: 16 }}>
          <Typography.Title level={5} style={{ margin: 0, marginBottom: 8 }}>
            Order Details
          </Typography.Title>
          <Card className={`pp-summary-card ${isOrderActiveDerived ? "active" : ""}`} style={{ marginTop: 16 }}>
            <div
              className="pp-summary-grid"
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}
            >
              {[
                ["Project No.", summary.projectNo],
                ["Project Name", summary.projectName],
                ["Customer", summary.customer],
                ["Product", summary.product],
                ["Quantity", summary.launchedQuantity],
                ["Status",
                  <div key="order-status-cell" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Tag color={isOrderActiveDerived ? "green" : "default"}>
                      {isOrderActiveDerived ? "Active" : "Inactive"}
                    </Tag>
                    <Button
                      size="small"
                      type={isOrderActiveDerived ? "default" : "primary"}
                      onClick={() => confirmStatusChange(isOrderActiveDerived ? "inactive" : "active")}
                    >
                      {isOrderActiveDerived ? "Inactive" : "Active"}
                    </Button>
                  </div>
                ],
                ["Start Date", summary.startDate || "Not yet scheduled"],
                ["Due Date", summary.dueDate || "Not yet scheduled"],
                ["PDC", (String(summary.pdc).toLowerCase().includes("not yet")
                  ? <span key="pdc-tag" style={{ color: "#555", fontWeight: 600 }}>{summary.pdc}</span>
                  : <span key="pdc-tag" style={{ color: "#1677FF", fontWeight: 600 }}>{summary.pdc}</span>)],
              ].map(([label, value], idx) => (
                <React.Fragment key={idx}>
                  <div
                    style={{
                      padding: 12,
                      background: "rgba(255,255,255,0.6)",
                      borderRight: "1px solid #e5e7eb",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 700,
                      color: "#374151",
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      padding: 12,
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    {value}
                  </div>
                </React.Fragment>
              ))}
            </div>
          </Card>

          <Tabs defaultActiveKey="1">
            <Tabs.TabPane tab="In House Parts" key="1">
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginBottom: 12 }}>
                <Button type="primary" onClick={() => applyPartStatus("active")}>Parts Active</Button>
                <Button onClick={() => applyPartStatus("inactive")}>Parts Inactive</Button>
              </div>

              <Table
                columns={inHouseColumns}
                dataSource={inHouseParts}
                rowKey="id"
                scroll={{ x: "max-content" }}
                style={{ width: "100%" }}
                rowSelection={{
                  selectedRowKeys: selectedInIds,
                  onChange: setSelectedInIds
                }}
              />
            </Tabs.TabPane>
            <Tabs.TabPane tab="Out Source Parts" key="2">
              <Table
                columns={outSourceColumnsExtended}
                dataSource={outSourceParts}
                rowKey="id"
                scroll={{ x: "max-content" }}
                style={{ width: "100%" }}
              />
            </Tabs.TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  );
};

export default ProcessPlanning;
