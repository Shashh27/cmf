import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Table, Card, Typography, message, Spin, InputNumber, Button, Space, Tag, Empty, Modal, Input, Select, Tooltip, Collapse, Tabs, Badge } from "antd";
import { ExclamationCircleOutlined, SwapOutlined, OrderedListOutlined, ArrowUpOutlined, ArrowDownOutlined, SaveOutlined, HolderOutlined, ArrowRightOutlined } from "@ant-design/icons";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import axios from "axios";
import Lottie from "lottie-react";
import { API_BASE_URL } from "../../Config/auth";
import { SCHEDULING_API_BASE_URL } from "../../Config/schedulingconfig";
import { PartWisePriorityPdfDownload } from "../../DownloadReports/PartsPriorityPdfDownload";

// Local Lottie animations
import loadingAnim from "../../components/ui/loading.json";
import successAnim from "../../components/ui/success.json";
import cautionAnim from "../../components/ui/caution.json";
import blockedAnim from "../../components/ui/blocked.json";
import swapAnim from "../../components/ui/swap.json";

const STATUS_ANIMATIONS = { success: successAnim, caution: cautionAnim, blocked: blockedAnim };

const StatusLottie = ({ kind, size = 48 }) => (
  <Lottie
    animationData={STATUS_ANIMATIONS[kind] || STATUS_ANIMATIONS.caution}
    loop={false}
    autoplay
    style={{ width: size, height: size }}
  />
);

const Row = (props) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: props['data-row-key'],
    });

    const style = {
        ...props.style,
        transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
        transition,
        cursor: 'move',
        ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
    };

    return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};

const PartsPriority = () => {
  const [searchParams] = useSearchParams();
  const [partData, setPartData] = useState([]);
  const [partLoading, setPartLoading] = useState(false);
  const [partPagination, setPartPagination] = useState({ current: 1, pageSize: 20 });
  const [messageApi, contextHolder] = message.useMessage();
  const [editingId, setEditingId] = useState(null);
  const [editPriorityValue, setEditPriorityValue] = useState(null);
  const hasFetchedPartWise = useRef(false);
  const [partSearchText, setPartSearchText] = useState("");
  const [filterProject, setFilterProject] = useState(null);
  const [filterPartNumber, setFilterPartNumber] = useState(null);

  // swap modal state
  const [swapModal, setSwapModal] = useState({ open: false });
  const [simActiveTab, setSimActiveTab] = useState("overview");

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

  const formatApiDetail = (detail) => {
    if (!detail) return "";
    if (Array.isArray(detail)) return detail.map(d => d?.msg ?? JSON.stringify(d)).join("; ");
    if (typeof detail === "object") return JSON.stringify(detail);
    return String(detail);
  };

  // reset to Overview tab whenever a new simulation result comes in
  useEffect(() => {
    if (swapModal.phase === "result") setSimActiveTab("overview");
  }, [swapModal.phase]);


  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 1,
        },
    })
  );

  const fetchPartPriorities = async () => {
    setPartLoading(true);
    try {
      const uid = getCurrentUserId();
      const response = await axios.get(`${API_BASE_URL}/orders/part-priorities/all`, {
        // For manufacturing coordinator view, filter by manufacturing_coordinator_id instead of admin_id
        params: uid != null ? { manufacturing_coordinator_id: uid } : undefined,
      });
      const result = response.data;
      const filtered = result.filter(
        (item) =>
          item.part_type_name &&
          item.part_type_name.toLowerCase() === "in-house"
      );
      setPartData(filtered);
    } catch (error) {
      console.error("Error fetching data:", error);
      messageApi.error("Error connecting to server");
    } finally {
      setPartLoading(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (!hasFetchedPartWise.current) {
        await fetchPartPriorities();
        hasFetchedPartWise.current = true;
      }
    };
    loadData();
  }, []);

  const handlePartSearch = (value) => {
    const filteredValue = (value || '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 20);
    setPartSearchText(filteredValue);
  };

  const projectOptions = [...new Set(partData.map(r => r.sale_order_number).filter(Boolean))].sort();
  const partNumberOptions = filterProject
    ? [...new Set(partData.filter(r => r.sale_order_number === filterProject).map(r => r.part_number).filter(Boolean))].sort()
    : [];

  const filteredPartData = partData.filter((row, index) => {
    if (filterProject && row.sale_order_number !== filterProject) return false;
    if (filterPartNumber && row.part_number !== filterPartNumber) return false;
    if (!partSearchText) return true;
    const q = partSearchText.toLowerCase();
    
    // SL NO (index + 1)
    const slNo = String(index + 1);
    
    // Project Name & Number
    const pn = String(row.project_name || "").toLowerCase();
    const so = String(row.sale_order_number || "").toLowerCase();
    
    // Product Name & Number
    const prod = String(row.product_name || "").toLowerCase();
    
    // Part Name & Number
    const part = String(row.part_name || "").toLowerCase();
    const partNum = String(row.part_number || "").toLowerCase();
    
    // Priority
    const priority = String(row.priority || "");
    
    return (
      slNo.includes(q) ||
      pn.includes(q) ||
      so.includes(q) ||
      prod.includes(q) ||
      part.includes(q) ||
      partNum.includes(q) ||
      priority.includes(q)
    );
  });


  const handleUpdatePriority = async (id, newPriority) => {
    if (!newPriority || newPriority < 1) return;
    
    try {
      const uid = getCurrentUserId();
      await axios.put(
        `${API_BASE_URL}/orders/part-priorities/update-global`,
        {
          id: id,
          priority: newPriority,
          // Track who updated using manufacturing_coordinator_id in this view
          manufacturing_coordinator_id: uid,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      messageApi.success("Priority updated successfully");
      fetchPartPriorities();
      setEditingId(null);
    } catch (error) {
      console.error("Error updating priority:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Failed to update priority";
      messageApi.error(detail);
      fetchPartPriorities();
    }
  };

  const onPartDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const activeIndex = partData.findIndex(i => i.id === active.id);
    const overIndex = partData.findIndex(i => i.id === over.id);
    const sourcePart = partData[activeIndex];
    const targetPart = partData[overIndex];
    openSwapModal(sourcePart, targetPart.id, { activeIndex, overIndex });
    // immediately run simulation since we already know both parts
    setTimeout(async () => {
      try {
        const res = await axios.post(
          `${SCHEDULING_API_BASE_URL}/scheduling/part-priorities/simulate-swap`,
          { id1: sourcePart.id, id2: targetPart.id },
          { headers: { "Content-Type": "application/json" } }
        );
        setSwapModal(s => ({ ...s, phase: "result", simResult: res.data }));
      } catch (err) {
        const raw = err?.response?.data?.detail || err?.message || "Simulation failed";
        messageApi.error(formatApiDetail(raw));
        setSwapModal(s => ({ ...s, phase: "select" }));
      }
    }, 0);
  };

  const moveRow = (index, direction) => {
    const swapWithIndex = direction === "up" ? index - 1 : index + 1;
    if (swapWithIndex < 0 || swapWithIndex >= partData.length) return;
    const sourcePart = partData[index];
    const targetPart = partData[swapWithIndex];
    openSwapModal(sourcePart, targetPart.id, { activeIndex: index, overIndex: swapWithIndex });
    setTimeout(async () => {
      try {
        const res = await axios.post(
          `${SCHEDULING_API_BASE_URL}/scheduling/part-priorities/simulate-swap`,
          { id1: sourcePart.id, id2: targetPart.id },
          { headers: { "Content-Type": "application/json" } }
        );
        setSwapModal(s => ({ ...s, phase: "result", simResult: res.data }));
      } catch (err) {
        const raw = err?.response?.data?.detail || err?.message || "Simulation failed";
        messageApi.error(formatApiDetail(raw));
        setSwapModal(s => ({ ...s, phase: "select" }));
      }
    }, 0);
  };

  // ── swap helpers ─────────────────────────────────────────────────────────

  const openSwapModal = (sourcePart, targetPartId = null, dragContext = null) => {
    setSwapModal({
      open: true,
      phase: "select",
      sourcePart,
      targetPartId,
      simResult: null,
      pendingDragContext: dragContext,
    });
  };

  const closeSwapModal = () => setSwapModal({ open: false });

  const runSimulation = async () => {
    const { sourcePart, targetPartId } = swapModal;
    if (!sourcePart || !targetPartId) {
      messageApi.warning("Please select the target part first");
      return;
    }
    setSwapModal(s => ({ ...s, phase: "simulating" }));
    try {
      const res = await axios.post(
        `${SCHEDULING_API_BASE_URL}/scheduling/part-priorities/simulate-swap`,
        { id1: sourcePart.id, id2: targetPartId },
        { headers: { "Content-Type": "application/json" } }
      );
      setSwapModal(s => ({ ...s, phase: "result", simResult: res.data }));
    } catch (err) {
      const raw = err?.response?.data?.detail || err?.message || "Simulation failed";
      messageApi.error(formatApiDetail(raw));
      setSwapModal(s => ({ ...s, phase: "select" }));
    }
  };

  const normalizeWarningList = (warnings) =>
    (warnings || []).map((w) => (typeof w === "string" ? w : w?.message || JSON.stringify(w)));

  const showSwapSuccess = (data) => {
    const moved = data?.impact_analysis?.swap_specific_impact?.part_being_moved;
    const displaced = data?.impact_analysis?.swap_specific_impact?.part_being_displaced;
    const warnings = normalizeWarningList(data?.warnings);
    const netImpact = data?.impact_analysis?.net_impact_days ?? 0;
    const benefiting = data?.impact_analysis?.parts_benefiting ?? 0;
    const delayed = data?.impact_analysis?.parts_delayed ?? 0;

    const partBox = (label, part, accent) => (
      <div style={{ background: "#f8fafc", borderRadius: 8, padding: 10, flex: 1 }}>
        <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
        <div style={{ fontWeight: 700, color: "#1f2937" }}>{part?.part_number || "-"}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>{part?.part_name || ""}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Priority <strong>{part?.old_priority ?? "-"}</strong>
          {" → "}
          <strong style={{ color: accent }}>{part?.new_priority ?? "-"}</strong>
        </div>
      </div>
    );

    Modal.success({
      title: data?.message || "Priorities shifted successfully",
      icon: <StatusLottie kind="success" size={32} />,
      width: 460,
      okText: "Done",
      content: (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            {partBox("Moved", moved, "#10b981")}
            {partBox("Displaced", displaced, "#f59e0b")}
          </div>
          {(benefiting > 0 || delayed > 0 || netImpact !== 0) && (
            <div style={{ fontSize: 13, color: "#374151", marginBottom: warnings.length ? 10 : 0 }}>
              {benefiting} part(s) benefiting, {delayed} part(s) delayed — net impact{" "}
              {netImpact > 0 ? `+${netImpact}` : netImpact}d.
            </div>
          )}
          {warnings.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, color: "#92400e", fontSize: 12, marginBottom: 4 }}>Warnings</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#92400e" }}>
                {warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      ),
    });
  };

  const commitSwap = async () => {
    const { sourcePart, targetPartId, pendingDragContext } = swapModal;
    setSwapModal(s => ({ ...s, phase: "committing" }));
    try { 
      const res = await axios.put(
        `${SCHEDULING_API_BASE_URL}/scheduling/part-priorities/swap`,
        { id1: sourcePart.id, id2: targetPartId },
        { headers: { "Content-Type": "application/json" } }
      );

      // optimistic UI update for drag path
      if (pendingDragContext) {
        const { activeIndex, overIndex } = pendingDragContext;
        setPartData(prev => {
          const newItems = arrayMove(prev, activeIndex, overIndex);
          return newItems.map((item, idx) => ({ ...item, priority: idx + 1 }));
        });
      }

      closeSwapModal();
      showSwapSuccess(res.data);
      fetchPartPriorities();
    } catch (err) {
      const raw = err?.response?.data?.detail || err?.message || "Swap failed";
      messageApi.error(formatApiDetail(raw));
      setSwapModal(s => ({ ...s, phase: "result" }));
    }
  };

  const isRecommendationBlocked = (rec) => (rec || "").toUpperCase().startsWith("BLOCKED");

  const confirmCommitSwap = () => {
    const rec = swapModal.simResult?.summary?.recommendation || "PROCEED";
    const reason = swapModal.simResult?.summary?.reason || "";
    const criticalWarnings = normalizeWarningList(swapModal.simResult?.critical_warnings);
    const cautionOps = swapModal.simResult?.caution_operations || [];
    const movedLabel = swapModal.sourcePart?.part_number;
    const displacedLabel = partData.find(p => p.id === swapModal.targetPartId)?.part_number;
    const iconKind = rec === "PROCEED" ? "success" : isRecommendationBlocked(rec) ? "blocked" : "caution";

    Modal.confirm({
      title: "Confirm priority swap",
      icon: <StatusLottie kind={iconKind} size={32} />,
      width: 480,
      okText: "Yes, swap",
      cancelText: "Cancel",
      okButtonProps: { danger: rec !== "PROCEED" },
      content: (
        <div>
          <p style={{ marginBottom: 6 }}>
            Swap <strong>{movedLabel}</strong> with <strong>{displacedLabel}</strong>?
          </p>
          {reason && (
            <p style={{ color: "#6b7280", fontSize: 13, marginBottom: (criticalWarnings.length || cautionOps.length) ? 10 : 0 }}>
              {reason}
            </p>
          )}
          {criticalWarnings.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: 10, marginBottom: cautionOps.length ? 8 : 0 }}>
              <div style={{ fontWeight: 600, color: "#b91c1c", fontSize: 12, marginBottom: 4 }}>Critical warnings</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#b91c1c" }}>
                {criticalWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {cautionOps.length > 0 && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 10 }}>
              <div style={{ fontWeight: 600, color: "#92400e", fontSize: 12, marginBottom: 4 }}>
                {cautionOps.length} operation(s) in production need caution
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#92400e" }}>
                {cautionOps.map((op, i) => (
                  <li key={op.operation_id ?? i}>
                    {op.part_number} — Op {op.operation_number} ({(op.operation_name || "").trim()}): {op.caution_reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
      onOk: commitSwap,
    });
  };

  const columns = [
    {
        key: 'sort',
        width: 30,
        render: () => <HolderOutlined style={{ cursor: 'grab', color: '#999' }} />,
    },
    {
      title: <span className="font-semibold text-gray-700">SL NO</span>,
      key: "index",
      width: 80,
      render: (_, __, index) => {
        const { current, pageSize } = partPagination;
        return <span className="text-gray-500 font-mono">{(current - 1) * pageSize + index + 1}</span>;
      },
    },
    {
      title: <span className="font-semibold text-gray-700">Project Number</span>,
      dataIndex: "sale_order_number",
      key: "sale_order_number",
      render: (text) => <span className="font-medium text-gray-800">{text || "-"}</span>,
    },
   
    {
      title: <span className="font-semibold text-gray-700">Project Name</span>,
      dataIndex: "product_name",
      key: "product_name",
      ellipsis: true,
      render: (text) => <span className="text-blue-600 font-medium">{text || "-"}</span>,
    },
     {
      title: <span className="font-semibold text-gray-700">Due Date</span>,
      dataIndex: "due_date",
      key: "due_date",
      width: 120,
      render: (text) => { if (!text) return <span className="text-gray-400">-</span>; const d = new Date(text); const dd = String(d.getDate()).padStart(2,'0'); const mm = String(d.getMonth()+1).padStart(2,'0'); const yyyy = d.getFullYear(); return <Tag color="orange">{`${dd}-${mm}-${yyyy}`}</Tag>; },
    },
    {
      title: <span className="font-semibold text-gray-700">Part Name</span>,
      dataIndex: "part_name",
      key: "part_name",
      ellipsis: true,
      render: (text) => <span className="text-gray-700">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Part Number</span>,
      dataIndex: "part_number",
      key: "part_number",
      ellipsis: true,
      render: (text) => <span className="text-gray-600 font-medium">{text || "-"}</span>,
    },
    {
      title: <span className="font-semibold text-gray-700">Priority</span>,
      dataIndex: "priority",
      key: "priority",
      width: 150,
      render: (priority, record, index) => {
        if (editingId === record.id) {
            return (
                <Space.Compact>
                    <InputNumber 
                        min={1} 
                        value={editPriorityValue} 
                        onChange={setEditPriorityValue}
                        size="small"
                        style={{ width: 80 }}
                    />
                    <Button 
                        type="primary" 
                        size="small" 
                        icon={<SaveOutlined />} 
                        onClick={() => {
                            Modal.confirm({
                                title: 'Confirm Priority Change',
                                icon: <ExclamationCircleOutlined />,
                                content: (
                                    <div>
                                        <p>Are you sure you want to change the priority for <strong>{record.part_name}</strong>?</p>
                                        <p>Current Priority: <strong>{record.priority}</strong></p>
                                        <p>New Priority: <strong>{editPriorityValue}</strong></p>
                                    </div>
                                ),
                                okText: 'Yes, Save',
                                cancelText: 'Cancel',
                                onOk: () => {
                                    handleUpdatePriority(record.id, editPriorityValue);
                                },
                            });
                        }}
                    />
                    <Button 
                        size="small" 
                        onClick={() => setEditingId(null)}
                    >X</Button>
                </Space.Compact>
            );
        }
        return (
            <div className="flex items-center gap-2 group">
                <Tag color="blue" className="min-w-[40px] text-center text-sm font-semibold m-0">
                    {priority}
                </Tag>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<OrderedListOutlined />} 
                        onClick={() => {
                            setEditingId(record.id);
                            setEditPriorityValue(priority);
                        }}
                        title="Set specific priority"
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<ArrowUpOutlined />} 
                        disabled={index === 0}
                        onClick={() => moveRow(index, 'up')}
                        title="Move Up"
                    />
                    <Button 
                        type="text" 
                        size="small" 
                        icon={<ArrowDownOutlined />} 
                        disabled={index === partData.length - 1}
                        onClick={() => moveRow(index, 'down')}
                        title="Move Down"
                    />
                    <Tooltip title="Simulate swap with another part">
                        <Button
                            type="text" size="small" icon={<SwapOutlined />}
                            onClick={() => openSwapModal(record)}
                            title="Simulate Swap"
                        />
                    </Tooltip>
                </div>
            </div>
        );
      },
    },
  ];

  // ── modal derived state ──────────────────────────────────────────────────

  const isSimulating = swapModal.phase === "simulating";
  const isCommitting = swapModal.phase === "committing";
  const hasResult = swapModal.phase === "result" && swapModal.simResult;
  const canProceed = hasResult && !isRecommendationBlocked(swapModal.simResult?.summary?.recommendation);
  const targetPart = swapModal.targetPartId
    ? partData.find(p => p.id === swapModal.targetPartId)
    : null;

  const modalTitle = swapModal.sourcePart
    ? `Swap Priority — ${swapModal.sourcePart.part_number}`
    : "Swap Priority";

  // ── modal footer (sticky, never scrolls) ────────────────────────────────

  const modalFooter = (
    <div
      style={{
        display: "flex",
        gap: 10,
        padding: "14px 24px 16px",
        borderTop: "1px solid #f0f0f0",
        background: "#fff",
      }}
    >
      {!swapModal.pendingDragContext && swapModal.phase !== "result" && (
        <Button
          type="primary"
          loading={isSimulating}
          disabled={!swapModal.targetPartId || isSimulating}
          onClick={runSimulation}
          style={{ flex: 1 }}
        >
          {isSimulating ? "Simulating…" : "Run Simulation"}
        </Button>
      )}

      {hasResult && (
        <Button
          type="primary"
          loading={isCommitting}
          disabled={!canProceed || isCommitting}
          onClick={confirmCommitSwap}
          style={{
            flex: 1,
            background: canProceed ? "#0f172a" : undefined,
            borderColor: canProceed ? "#0f172a" : undefined,
          }}
        >
          {isCommitting ? "Applying swap…" : canProceed ? "Proceed with Swap" : "Swap Blocked"}
        </Button>
      )}

      <Button onClick={closeSwapModal} disabled={isCommitting}>
        Cancel
      </Button>
    </div>
  );




  const renderPartWiseContent = () => {
    if (partLoading) {
      return (
        <div className="p-12 flex justify-center">
          <Spin size="large" />
        </div>
      );
    }

    return (
      <div className="p-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-2 sm:px-3 pt-0 pb-1 gap-2">
          <Typography.Text className="font-semibold text-gray-700 text-sm sm:text-base">
            Part Wise Priority
          </Typography.Text>
          <Space className="w-full sm:w-auto flex-col sm:flex-row gap-2" wrap>
            <Input.Search
              placeholder="Search..."
              allowClear
              size="middle"
              className="w-full sm:w-64"
              onSearch={handlePartSearch}
              onChange={(e) => handlePartSearch(e.target.value)}
              value={partSearchText}
              maxLength={20}
            />
            <Select
              placeholder="Project Number"
              allowClear
              showSearch
              size="middle"
              style={{ minWidth: 160 }}
              value={filterProject}
              onChange={(val) => { setFilterProject(val || null); setFilterPartNumber(null); }}
            >
              {projectOptions.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <Select
              placeholder="Part Number"
              allowClear
              showSearch
              size="middle"
              style={{ minWidth: 160 }}
              value={filterPartNumber}
              disabled={!filterProject}
              onChange={(val) => setFilterPartNumber(val || null)}
            >
              {partNumberOptions.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <PartWisePriorityPdfDownload data={partData} />
          </Space>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onPartDragEnd}>
          <SortableContext items={partData.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <Table
              components={{
                body: {
                  row: Row,
                },
              }}
              columns={columns}
              dataSource={filteredPartData}
              rowKey="id"
              pagination={{
                current: partPagination.current,
                pageSize: partPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                pageSizeOptions: ['10', '20', '50', '100'],
                placement: 'bottom',
                responsive: true,
              }}
              onChange={(paginationConfig) => {
                setPartPagination({
                  current: paginationConfig.current,
                  pageSize: paginationConfig.pageSize,
                });
              }}
              size="small"
              bordered
              className="modern-table"
              locale={{ emptyText: <Empty description={partSearchText ? "No parts found matching your search" : "No parts priority data found"} /> }}
              scroll={{ x: 1200 }}
            />
          </SortableContext>
        </DndContext>
      </div>
    );
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            padding: 8px 4px;
          }
        }
        /* make antd modal body scrollable with fixed footer */
        .swap-sim-modal .ant-modal-body { padding: 0 !important; }
        .swap-sim-modal .ant-modal-footer { display: none; }
        .swap-sim-modal .ant-modal-content { display: flex; flex-direction: column; max-height: 90vh; }
      `}</style>

      {contextHolder}

      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="w-full sm:w-auto">
                <Typography.Title 
                  level={2} 
                  style={{ margin: 0, fontSize: 'clamp(18px, 4vw, 24px)' }} 
                  className="flex items-center gap-2 sm:gap-3 text-gray-800"
                >
                    <OrderedListOutlined className="text-blue-600" />
                    <span className="hidden sm:inline">Parts Priority Management</span>
                    <span className="sm:hidden">Parts Priority</span>
                </Typography.Title>
                <Typography.Text className="text-gray-500 mt-1 block text-xs sm:text-sm">
                    Manage and reorder manufacturing priorities for all parts across projects
                </Typography.Text>
            </div>
        </div>
      </div>

      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }}>
        {renderPartWiseContent()}
      </Card>

      {/* ── swap simulation modal ── */}
      <Modal
        className="swap-sim-modal"
        title={modalTitle}
        open={swapModal.open}
        onCancel={isCommitting ? undefined : closeSwapModal}
        closable={!isCommitting}
        maskClosable={!isCommitting}
        footer={null}
        width={740}
        style={{ top: 28 }}
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column", maxHeight: "calc(90vh - 110px)" } }}
      >
        {/* ── target selector (manual swap only) ── */}
        {!swapModal.pendingDragContext && (
          <div style={{ padding: "16px 20px 0" }}>
            <div style={{ marginBottom: 6, fontWeight: 600, fontSize: 13, color: "#374151" }}>
              Select target part to swap with
            </div>
            <Select
              showSearch
              placeholder="Search by part number or name…"
              style={{ width: "100%" }}
              value={swapModal.targetPartId}
              onChange={(val) => setSwapModal(s => ({ ...s, targetPartId: val, simResult: null, phase: "select" }))}
              filterOption={(input, option) =>
                (option?.children || "").toLowerCase().includes(input.toLowerCase())
              }
              disabled={isSimulating || isCommitting}
            >
              {partData.filter(p => p.id !== swapModal.sourcePart?.id).map(p => (
                <Select.Option key={p.id} value={p.id}>
                  {`${p.part_number} — ${p.part_name} (Priority ${p.priority})`}
                </Select.Option>
              ))}
            </Select>
          </div>
        )}

        {/* ── context strip ── */}
        {swapModal.sourcePart && targetPart && (
          <div style={{ display: "flex", margin: "16px 20px 0", border: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ flex: 1, padding: "14px 18px", background: "#eff6ff", borderRight: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Moving up</div>
              <div style={{ fontWeight: 700, color: "#1f2937" }}>{swapModal.sourcePart.part_number}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{swapModal.sourcePart.part_name}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                Priority <strong>{swapModal.sourcePart.priority}</strong>
              </div>
            </div>
            <div style={{ flex: 1, padding: "14px 18px", background: "#fef3c7" }}>
              <div style={{ fontSize: 10, color: "#d97706", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Moving down</div>
              <div style={{ fontWeight: 700, color: "#1f2937" }}>{targetPart.part_number}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{targetPart.part_name}</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                Priority <strong>{targetPart.priority}</strong>
              </div>
            </div>
          </div>
        )}

        {/* ── simulation result ── */}
        {hasResult && (
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
            <Tabs activeKey={simActiveTab} onChange={setSimActiveTab} size="small">
              <Tabs.TabPane tab="Overview" key="overview">
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <StatusLottie 
                      kind={swapModal.simResult?.summary?.recommendation === "PROCEED" ? "success" : isRecommendationBlocked(swapModal.simResult?.summary?.recommendation) ? "blocked" : "caution"} 
                      size={48} 
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#1f2937" }}>
                        {swapModal.simResult?.summary?.recommendation || "PROCEED"}
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280" }}>
                        {swapModal.simResult?.summary?.reason || ""}
                      </div>
                    </div>
                  </div>
                  {swapModal.simResult?.impact_analysis && (
                    <div style={{ background: "#f8fafc", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, color: "#374151" }}>Impact Analysis</div>
                      <div style={{ fontSize: 13, color: "#4b5563" }}>
                        Net impact: <strong>{swapModal.simResult.impact_analysis.net_impact_days ?? 0} days</strong>
                      </div>
                      <div style={{ fontSize: 13, color: "#4b5563" }}>
                        Parts benefiting: <strong>{swapModal.simResult.impact_analysis.parts_benefiting ?? 0}</strong>
                      </div>
                      <div style={{ fontSize: 13, color: "#4b5563" }}>
                        Parts delayed: <strong>{swapModal.simResult.impact_analysis.parts_delayed ?? 0}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </Tabs.TabPane>
              <Tabs.TabPane tab="Details" key="details">
                <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {swapModal.simResult?.warnings && swapModal.simResult.warnings.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Warnings</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {normalizeWarningList(swapModal.simResult.warnings).map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                  {swapModal.simResult?.caution_operations && swapModal.simResult.cautions_operations?.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Operations Requiring Caution</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {swapModal.simResult.cautions_operations.map((op, i) => (
                          <li key={op.operation_id ?? i}>
                            {op.part_number} — Op {op.operation_number} ({op.operation_name}): {op.caution_reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Tabs.TabPane>
            </Tabs>
          </div>
        )}

        {/* ── loading state ── */}
        {isSimulating && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Lottie animationData={loadingAnim} loop={true} style={{ width: 80, height: 80 }} />
            <div style={{ marginTop: 16, fontSize: 14, color: "#6b7280" }}>Simulating priority swap...</div>
          </div>
        )}

        {/* ── committing state ── */}
        {isCommitting && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <Lottie animationData={swapAnim} loop={true} style={{ width: 80, height: 80 }} />
            <div style={{ marginTop: 16, fontSize: 14, color: "#6b7280" }}>Applying swap...</div>
          </div>
        )}

        {/* ── footer ── */}
        {modalFooter}
      </Modal>
    </div>
  );
};

export default PartsPriority;
