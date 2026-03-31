import React, { useEffect, useMemo, useState } from "react";
import { Card, Row, Col, Select, Table, Tag, Typography, Space, Spin, message, Tabs, Button, Modal, Input, DatePicker, Tooltip } from "antd";
import { ToolOutlined, ExclamationCircleFilled, SaveOutlined, EditOutlined, DownOutlined, UpOutlined } from "@ant-design/icons";
import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import { API_BASE_URL } from "../Config/auth";
import dayjs from "dayjs";
import axios from "axios";

const ProcessPlanning = ({ initialOrderId }) => {
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderSummary, setOrderSummary] = useState(null);
  const [orderPartsMetadata, setOrderPartsMetadata] = useState(null);
  const [isActive, setIsActive] = useState(false);

  const [activeIds, setActiveIds] = useState([]);
  const [partStatuses, setPartStatuses] = useState({});
  const [selectedInIds, setSelectedInIds] = useState([]);
  const isOrderActiveDerived = useMemo(() => {
    return Object.values(partStatuses).some(v => String(v).toLowerCase() === "active");
  }, [partStatuses]);
  const [outStatusMap, setOutStatusMap] = useState({});
  const [outEditing, setOutEditing] = useState({});

  const [partOpDetails, setPartOpDetails] = useState({});
  const [partOpLoading, setPartOpLoading] = useState({});
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  // ================================
  // FETCH ORDERS
  // ================================
  useEffect(() => {
    const fetchOrders = async () => {
      setOrdersLoading(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/orders/`);
        setOrders(res.data || []);
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
    setOrderPartsMetadata(null);
    try {
      const res = await axios.get(`${API_BASE_URL}/orders/${id}/hierarchical`);
      setOrderDetails(res.data || null);
    } catch {}
    setDetailsLoading(false);
  };

  // ================================
  // FETCH ORDER SUMMARY (SOURCE OF TRUTH)
  // ================================
  const fetchOrderSummary = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await axios.get(`${SCHEDULING_API_BASE_URL}/scheduling/order-summary/${orderId}`);
      if (res.status === 200) {
        const data = res.data;
        setOrderSummary(data);
        setIsActive(data.status === "active");
      }
    } catch {}
  };

  // ================================
  // FETCH ORDER PARTS METADATA
  // ================================
  const fetchOrderPartsMetadata = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await axios.get(`${SCHEDULING_API_BASE_URL}/scheduling/order-parts-metadata/${orderId}`);
      if (res.status === 200) {
        setOrderPartsMetadata(res.data);
      }
    } catch {}
  };

  // ================================
  // FETCH PART OPERATION DETAILS
  // ================================
  const fetchPartOperationDetails = async (partId) => {
    if (!selectedOrderId || !partId) return;
    if (partOpDetails[partId]) return;

    setPartOpLoading(prev => ({ ...prev, [partId]: true }));
    try {
      const res = await axios.get(`${SCHEDULING_API_BASE_URL}/scheduling/part-operation-details/${selectedOrderId}/${partId}`);
      if (res.status === 200) {
        setPartOpDetails(prev => ({ ...prev, [partId]: res.data.operations || [] }));
      }
    } catch {
      // ignore
    }
    setPartOpLoading(prev => ({ ...prev, [partId]: false }));
  };

  // ================================
  // FETCH ACTIVE PARTS
  // ================================
  const fetchActiveParts = async (orderId) => {
    if (!orderId) return;
    try {
      const res = await axios.get(`${SCHEDULING_API_BASE_URL}/scheduling/active-parts/${orderId}`);
      const data = res.data;
      const ids = (data.active_parts || [])
        .filter(p => p.status === "active")
        .map(p => p.part_id);
      setActiveIds(ids);
    } catch {}
  };

  // When order selected
  useEffect(() => {
    if (!selectedOrderId) return;
    fetchOrderDetails(selectedOrderId);
    fetchOrderSummary(selectedOrderId);
    fetchActiveParts(selectedOrderId);
    fetchOutSourceStatuses(selectedOrderId);
    fetchOrderPartsMetadata(selectedOrderId);
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
        qty: p.qty || 0,
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

  // Function to get assembly names for a part
  const getAssemblyNamesForPart = (partId) => {
    const h = orderDetails?.product_hierarchy || {};
    const assemblyNames = [];
    
    // Check direct parts first
    if (Array.isArray(h.direct_parts)) {
      const directPartFound = h.direct_parts.some(p => p.part?.id === partId || p.id === partId);
      if (directPartFound) {
        assemblyNames.push('Direct Parts');
      }
    }
    
    // Enhanced walk function that tracks assembly hierarchy
    const walk = (assemblies, parentPath = []) => {
      if (!Array.isArray(assemblies)) return;
      assemblies.forEach(a => {
        // Get the current assembly name from the nested structure
        const currentAssembly = a.assembly || {};
        const currentAssemblyName = currentAssembly.assembly_name || currentAssembly.name || 
                                  currentAssembly.assembly || currentAssembly.part_name || 
                                  currentAssembly.product_name || currentAssembly.display_name || 
                                  currentAssembly.title || currentAssembly.label || currentAssembly.description;
        
        // Build the full path for this assembly
        const currentPath = currentAssemblyName ? [...parentPath, currentAssemblyName] : parentPath;
        
        // Check parts in this assembly
        if (Array.isArray(a.parts)) {
          const partFound = a.parts.some(p => p.part?.id === partId || p.id === partId);
          if (partFound) {
            // Display the full hierarchy path
            if (currentPath.length > 0) {
              assemblyNames.push(currentPath.join('/'));
            } else {
              assemblyNames.push('Unnamed Assembly');
            }
          }
        }
        
        // Recursively check subassemblies
        if (Array.isArray(a.subassemblies)) {
          walk(a.subassemblies, currentPath);
        }
      });
    };
    
    walk(h.assemblies);
    
    // If still no assembly names found, try a comprehensive search
    if (assemblyNames.length === 0) {
      const comprehensiveSearch = (obj, currentPath = []) => {
        if (!obj || typeof obj !== 'object') return;
        
        Object.keys(obj).forEach(key => {
          const value = obj[key];
          
          // Check if this is a parts array
          if (key === 'parts' && Array.isArray(value)) {
            const partFound = value.some(p => p.part?.id === partId || p.id === partId);
            if (partFound && currentPath.length > 0) {
              assemblyNames.push(currentPath.join('/'));
            }
          } else if (key === 'assembly' && typeof value === 'object' && value !== null) {
            // Found an assembly object, extract its name and continue searching
            const assemblyName = value.assembly_name || value.name || value.assembly || 
                                value.part_name || value.product_name || value.display_name || 
                                value.title || value.label || value.description;
            
            if (assemblyName) {
              const newPath = [...currentPath, assemblyName];
              // Continue searching in the parent object
              comprehensiveSearch(obj, newPath);
            }
          } else if (Array.isArray(value)) {
            value.forEach(item => {
              if (typeof item === 'object' && item !== null) {
                comprehensiveSearch(item, currentPath);
              }
            });
          } else if (typeof value === 'object' && value !== null) {
            comprehensiveSearch(value, currentPath);
          }
        });
      };
      
      comprehensiveSearch(h);
    }
    
    // Return a comma-separated string, not an array
    return assemblyNames.length > 0 ? assemblyNames.join(', ') : '-';
  };

  const inHouseParts = useMemo(() =>
    allParts
      .filter(p => p.type_name.includes("in"))
      .map(p => ({
        ...p,
        assemblies: getAssemblyNamesForPart(p.id)
      }))
      .sort((a, b) => String(a.part_number).localeCompare(String(b.part_number), undefined, { numeric: true, sensitivity: 'base' })),
    [allParts, orderDetails]
  );

  // Fetch all part operation details for in-house parts to get start/end times
  useEffect(() => {
    if (!selectedOrderId || inHouseParts.length === 0) return;
    
    inHouseParts.forEach(part => {
      if (!partOpDetails[part.id]) {
        fetchPartOperationDetails(part.id);
      }
    });
  }, [selectedOrderId, inHouseParts.length]);

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
      const res = await axios.get(`${API_BASE_URL}/out-source-parts-status/order/${orderId}`);
      if (res.status !== 200) return;
      const rows = res.data;
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
        res = await axios.put(`${API_BASE_URL}/out-source-parts-status/${existing.id}`, payload);
      } else {
        res = await axios.post(`${API_BASE_URL}/out-source-parts-status/`, payload);
      }
      if (res.status !== 200 && res.status !== 201) {
        let errMsg = "Failed to save";
        errMsg = res.data?.detail || errMsg;
        throw new Error(errMsg);
      }
      message.success("Out source status saved");
      await fetchOutSourceStatuses(selectedOrderId);
      await fetchOrderPartsMetadata(selectedOrderId);
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
      const res = await axios.post(
        `${SCHEDULING_API_BASE_URL}/scheduling/set-order-status/${selectedOrderId}?status=${next}`
      );

      if (res.status !== 200) throw new Error();

      message.success(`Order status changed to ${next}`);

      await fetchOrderSummary(selectedOrderId);
      await fetchActiveParts(selectedOrderId);
      await fetchOrderPartsMetadata(selectedOrderId);

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
          axios.put(`${SCHEDULING_API_BASE_URL}/scheduling/update-part-status/${selectedOrderId}/${pid}?status=${status}`)
        )
      );

      message.success("Parts updated");

      await fetchActiveParts(selectedOrderId);
      await fetchOrderSummary(selectedOrderId);
      await fetchOrderPartsMetadata(selectedOrderId);

      setSelectedInIds([]);
    } catch {
      message.error("Failed updating parts");
    }
  };

  const showPartStatusPopup = () => {
    if (!selectedInIds || selectedInIds.length === 0) {
      Modal.warning({
        title: "Select Parts",
        content: "Please select at least one part.",
        okText: "OK",
      });
      return;
    }

    const modal = Modal.confirm({
      title: "Update Parts Status",
      icon: <ExclamationCircleFilled style={{ color: "#faad14" }} />,
      content: "Choose an action for the selected parts.",
      footer: (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={() => modal.destroy()}>Cancel</Button>
          <Button onClick={() => { applyPartStatus("inactive"); modal.destroy(); }}>Inactivate</Button>
          <Button type="primary" onClick={() => { applyPartStatus("active"); modal.destroy(); }}>Activate</Button>
        </div>
      ),
    });
  };

  // ================================
  // TABLE COLUMNS
  // ================================
  const inHouseColumns = [
    { title: "Part No", dataIndex: "part_number" },
    { title: "Part Name", dataIndex: "part_name" },
    { title: "Assemblies", dataIndex: "assemblies" },
    {
      title: "Start Time",
      render: (_, record) => {
        const ops = partOpDetails[record.id] || [];
        if (ops.length === 0) return "-";
        const startTimes = ops.map(o => o.planned_start_time).filter(Boolean);
        if (startTimes.length === 0) return "-";
        return dayjs(startTimes.sort()[0]).format("DD-MM-YYYY, HH:mm");
      }
    },
    {
      title: "End Time",
      render: (_, record) => {
        const ops = partOpDetails[record.id] || [];
        if (ops.length === 0) return "-";
        const endTimes = ops.map(o => o.planned_end_time).filter(Boolean);
        if (endTimes.length === 0) return "-";
        return dayjs(endTimes.sort().reverse()[0]).format("DD-MM-YYYY, HH:mm");
      }
    },
    { title: "Part Qty", dataIndex: "qty" },
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
            <Tooltip title="Save">
              <Button
                type="link"
                icon={<SaveOutlined />}
                onClick={() => handleSaveOutSource(r)}
              />
            </Tooltip>
          );
        }
        return (
          <Tooltip title="Edit">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => startEditOutSource(r)}
            />
          </Tooltip>
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
    const totalInHousePartsCount = (orderPartsMetadata?.active_inhouse_parts ?? 0) + (orderPartsMetadata?.inactive_inhouse_parts ?? 0);
    return {
      projectNo: order.sale_order_number || order.order_number || order.production_order_number || "-",
      projectName: part.part_name || order.product_name || order.project_name || "-",
      customer: order.customer_name || order.company_name || "-",
      launchedQuantity: order.launched_quantity ?? order.quantity ?? "-",
      startDate: dateOnly(order.order_date || order.start_date),
      dueDate: dateOnly(order.due_date),
      pdc: order.pdc || order.pdc_date || "Not yet scheduled",
      totalActiveParts: orderPartsMetadata?.active_inhouse_parts ?? "-",
      inactiveParts: orderPartsMetadata?.inactive_inhouse_parts ?? "-",
      totalOutsourceParts: orderPartsMetadata?.total_outsource_parts ?? "-",
      totalInHousePartsCount: totalInHousePartsCount > 0 ? totalInHousePartsCount : "-",
    };
  }, [orderDetails, orderPartsMetadata]);

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
          <span>Select Project:</span>
          <Select
            showSearch
            placeholder="Search or Select Project"
            optionFilterProp="children"
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
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
                ["Quantity", summary.launchedQuantity],
                ["Start Date", summary.startDate || "Not yet scheduled"],
                ["Due Date", summary.dueDate || "Not yet scheduled"],
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
                ["PDC", (String(summary.pdc).toLowerCase().includes("not yet")
                  ? <span key="pdc-tag" style={{ color: "#555", fontWeight: 600 }}>{summary.pdc}</span>
                  : <span key="pdc-tag" style={{ color: "#1677FF", fontWeight: 600 }}>{summary.pdc}</span>)],
                ["Total Active Parts", summary.totalActiveParts],
                ["Inactive Parts", summary.inactiveParts],
                ["Total In-House Parts", summary.totalInHousePartsCount],
                ["Total Outsource Parts", summary.totalOutsourceParts],
                
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
                <Button type="primary" onClick={showPartStatusPopup}>Update Status</Button>
              </div>

              <Table
                columns={inHouseColumns}
                dataSource={inHouseParts}
                rowKey="id"
                scroll={{ x: "max-content" }}
                style={{ width: "100%" }}
                onRow={(record) => ({
                  onClick: () => {
                    const isExpanded = expandedRowKeys.includes(record.id);
                    const nextExpandedKeys = isExpanded
                      ? expandedRowKeys.filter(k => k !== record.id)
                      : [...expandedRowKeys, record.id];
                    setExpandedRowKeys(nextExpandedKeys);
                    if (!isExpanded) {
                      fetchPartOperationDetails(record.id);
                    }
                  },
                })}
                pagination={{
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} parts`,
                }}
                rowSelection={{
                  selectedRowKeys: selectedInIds,
                  onChange: setSelectedInIds,
                  onClick: (e) => e.stopPropagation(), // Don't trigger row click when selecting
                }}
                expandedRowKeys={expandedRowKeys}
                onExpand={(expanded, record) => {
                  const nextExpandedKeys = expanded
                    ? [...expandedRowKeys, record.id]
                    : expandedRowKeys.filter(k => k !== record.id);
                  setExpandedRowKeys(nextExpandedKeys);
                  if (expanded) {
                    fetchPartOperationDetails(record.id);
                  }
                }}
                expandable={{
                  expandIconColumnIndex: 8,
                  expandIcon: ({ expanded, onExpand, record }) =>
                    expanded ? (
                      <UpOutlined onClick={e => { e.stopPropagation(); onExpand(record, e); }} style={{ fontSize: "14px", color: "#666", cursor: "pointer" }} />
                    ) : (
                      <DownOutlined onClick={e => { e.stopPropagation(); onExpand(record, e); }} style={{ fontSize: "14px", color: "#666", cursor: "pointer" }} />
                    ),
                  expandedRowRender: (record) => {
                    const rawData = partOpDetails[record.id] || [];
                    
                    // Grouping logic: same operation ID and name
                    const groupedData = [];
                    const groups = {};

                    rawData.forEach(op => {
                      const key = `${op.operation_id}-${op.operation}`;
                      if (!groups[key]) {
                        groups[key] = { ...op };
                        groupedData.push(groups[key]);
                      } else {
                        // Update start/end times with min/max
                        if (op.planned_start_time && (!groups[key].planned_start_time || dayjs(op.planned_start_time).isBefore(dayjs(groups[key].planned_start_time)))) {
                          groups[key].planned_start_time = op.planned_start_time;
                        }
                        if (op.planned_end_time && (!groups[key].planned_end_time || dayjs(op.planned_end_time).isAfter(dayjs(groups[key].planned_end_time)))) {
                          groups[key].planned_end_time = op.planned_end_time;
                        }
                      }
                    });

                    const loading = partOpLoading[record.id];
                    const columns = [
                      { title: "Operation Name", dataIndex: "operation" },
                      { title: "Machine Name", dataIndex: "machine" },
                      {
                        title: "Start Time",
                        dataIndex: "planned_start_time",
                        render: (v) => v ? dayjs(v).format("DD-MM-YYYY, HH:mm") : "-"
                      },
                      {
                        title: "End Time",
                        dataIndex: "planned_end_time",
                        render: (v) => v ? dayjs(v).format("DD-MM-YYYY, HH:mm") : "-"
                      },
                    ];
                    return (
                      <Table
                        columns={columns}
                        dataSource={groupedData}
                        pagination={false}
                        loading={loading}
                        size="small"
                        rowKey={(op) => `${op.operation_id}-${op.operation}`}
                      />
                    );
                  },
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
                pagination={{
                  showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} parts`,
                }}
              />
            </Tabs.TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  );
};

export default ProcessPlanning;