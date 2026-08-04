import React, { useState, useEffect, useRef } from "react";
import {
  Table, Card, Typography, message, Spin, InputNumber,
  Button, Space, Tag, Empty, Modal, Input, Select, Tooltip, Collapse, Tabs, Badge,
} from "antd";
import { api } from '../api/client.js';
import {
  ExclamationCircleOutlined, SwapOutlined,
  OrderedListOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SaveOutlined, HolderOutlined, ArrowRightOutlined,
} from "@ant-design/icons";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Lottie from "lottie-react";
import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig";
import { filterLiveInHouseParts } from "./partPriorityUtils";
import { PartWisePriorityPdfDownload } from "../DownloadReports/PartsPriorityPdfDownload";

// small, hand-built local Lottie animations (no external network calls) —
// see ./lottie/README.md for what each one is and how to swap it out
import loadingAnim from "../components/ui/loading.json";
import successAnim from "../components/ui/success.json";
import cautionAnim from "../components/ui/caution.json";
import blockedAnim from "../components/ui/blocked.json";
import swapAnim from "../components/ui/swap.json";

// ─── status icon helper ────────────────────────────────────────────────────
// reused in the recommendation banner, the pre-swap confirm dialog, and the
// post-swap success summary so the same visual language shows up everywhere
const STATUS_ANIMATIONS = { success: successAnim, caution: cautionAnim, blocked: blockedAnim };

const StatusLottie = ({ kind, size = 48 }) => (
  <Lottie
    animationData={STATUS_ANIMATIONS[kind] || STATUS_ANIMATIONS.caution}
    loop={false}
    autoplay
    style={{ width: size, height: size }}
  />
);

// ─── drag row ────────────────────────────────────────────────────────────────

const Row = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props["data-row-key"] });
  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    cursor: "move",
    ...(isDragging ? { position: "relative", zIndex: 9999 } : {}),
  };
  return <tr {...props} ref={setNodeRef} style={style} {...attributes} {...listeners} />;
};

// ─── priority swap auth (self-contained — no extra files needed) ─────────────

const SESSION_CHANGER_KEY = "priority_changer_user_id";

function parseSwapUserId(obj) {
  if (!obj || typeof obj !== "object") return null;
  const id = obj.id ?? obj.user_id ?? obj.userId ?? obj.access_user_id ?? null;
  if (id == null || id === "") return null;
  const numeric = Number(id);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getPriorityChangerUserId() {
  try {
    const cached = sessionStorage.getItem(SESSION_CHANGER_KEY);
    if (cached) {
      const n = Number(cached);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const fromLogin = parseSwapUserId(user);
    if (fromLogin) return fromLogin;
    return null;
  } catch {
    return null;
  }
}

async function resolvePriorityChangerUserId() {
  const existing = getPriorityChangerUserId();
  if (existing) return existing;
  const entered = window.prompt(
    "Priority swap needs your user ID (admin or manufacturing coordinator).\n" +
      "Enter your access-control user ID (e.g. 16):"
  );
  if (!entered) return null;
  const numeric = Number(String(entered).trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  sessionStorage.setItem(SESSION_CHANGER_KEY, String(numeric));
  return numeric;
}

function formatPriorityChangerRole(role) {
  if (role === "manufacturing_coordinator") return "Manufacturing Coordinator";
  if (role === "admin") return "Admin";
  return role || "User";
}

function getPriorityChangeAuditText(data) {
  if (!data?.name) return null;
  const role = formatPriorityChangerRole(data.priority_changed_by);
  const at = data.priority_changed_at
    ? new Date(data.priority_changed_at).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : null;
  return at
    ? `Priority changed by ${data.name} (${role}) on ${at}`
    : `Priority changed by ${data.name} (${role})`;
}

async function buildPrioritySwapPayload(id1, id2) {
  const priority_changed_by_id = await resolvePriorityChangerUserId();
  if (!priority_changed_by_id) {
    return {
      error:
        "User ID is required for priority swap. Enter a valid admin / manufacturing coordinator user ID.",
    };
  }
  return { payload: { id1, id2, priority_changed_by_id } };
}

// ─── component ───────────────────────────────────────────────────────────────

const PartsPriority = () => {
  const [partData, setPartData] = useState([]);
  const [partLoading, setPartLoading] = useState(false);
  const [partPagination, setPartPagination] = useState({ current: 1, pageSize: 20 });
  const [messageApi, contextHolder] = message.useMessage();
  const [editingId, setEditingId] = useState(null);
  const [editPriorityValue, setEditPriorityValue] = useState(null);
  const [partSearchText, setPartSearchText] = useState("");
  const [filterProject, setFilterProject] = useState(null);
  const [filterPartNumber, setFilterPartNumber] = useState(null);

  // swap modal state
  const [swapModal, setSwapModal] = useState({ open: false });
  const [simActiveTab, setSimActiveTab] = useState("overview");
  // swapModal shape when open:
  // { open: true, phase: 'select'|'simulating'|'result'|'committing',
  //   sourcePart, targetPartId, simResult, pendingDragContext }
  // pendingDragContext: { activeIndex, overIndex, newPriority } — set by drag path

  const hasFetchedParts = useRef(false);

  // reset to Overview tab whenever a new simulation result comes in
  useEffect(() => {
    if (swapModal.phase === "result") setSimActiveTab("overview");
  }, [swapModal.phase]);

  const getCurrentUserId = () => getPriorityChangerUserId();

  const requirePriorityChangerId = () => {
    const id = getCurrentUserId();
    if (!id) {
      messageApi.error("User session not found. Please log in again.");
      return null;
    }
    return id;
  };

  const formatApiDetail = (detail) => {
    if (!detail) return "";
    if (Array.isArray(detail)) return detail.map(d => d?.msg ?? JSON.stringify(d)).join("; ");
    if (typeof detail === "object") return JSON.stringify(detail);
    return String(detail);
  };

  const fetchPartPriorities = async () => {
    setPartLoading(true);
    try {
      const response = await api.get(`/orders/part-priorities/all`);
      setPartData(filterLiveInHouseParts(response.data));
    } catch (error) {
      console.error("Error fetching data:", error);
      messageApi.error("Error connecting to server");
    } finally {
      setPartLoading(false);
    }
  };

  useEffect(() => {
    if (!hasFetchedParts.current) {
      fetchPartPriorities();
      hasFetchedParts.current = true;
    }
  }, []);

  // ── search / filter ──────────────────────────────────────────────────────

  const handlePartSearch = (value) => {
    setPartSearchText((value || "").replace(/[^a-zA-Z0-9 ]/g, "").slice(0, 20));
  };

  const filteredPartData = partData.filter((row, index) => {
    if (filterProject && row.sale_order_number !== filterProject) return false;
    if (filterPartNumber && row.part_number !== filterPartNumber) return false;
    if (!partSearchText) return true;
    const q = partSearchText.toLowerCase();
    return (
      String(index + 1).includes(q) ||
      String(row.project_name || "").toLowerCase().includes(q) ||
      String(row.sale_order_number || "").toLowerCase().includes(q) ||
      String(row.product_name || "").toLowerCase().includes(q) ||
      String(row.part_name || "").toLowerCase().includes(q) ||
      String(row.part_number || "").toLowerCase().includes(q) ||
      String(row.priority || "").includes(q)
    );
  });

  const projectOptions = [...new Set(partData.map(r => r.sale_order_number).filter(Boolean))].sort();
  const partNumberOptions = filterProject
    ? [...new Set(partData.filter(r => r.sale_order_number === filterProject).map(r => r.part_number).filter(Boolean))].sort()
    : [];

  // ── priority update (manual input) ──────────────────────────────────────

  const handleUpdatePriority = async (id, newPriority) => {
    if (!newPriority || newPriority < 1) return;
    try {
      await api.put(
        `/orders/part-priorities/update-global`,
        { id, priority: newPriority },
        { headers: { "Content-Type": "application/json" } }
      );
      messageApi.success("Priority updated successfully");
      fetchPartPriorities();
      setEditingId(null);
    } catch (error) {
      const detail = error?.response?.data?.detail || error?.response?.data?.message || "Failed to update priority";
      messageApi.error(formatApiDetail(detail));
      fetchPartPriorities();
    }
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
      const res = await api.post(
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

  // build a short, readable list of strings out of a warnings array that may
  // contain plain strings or {message} objects
  const normalizeWarningList = (warnings) =>
    (warnings || []).map((w) => (typeof w === "string" ? w : w?.message || JSON.stringify(w)));

  // straightforward post-swap summary built from the real swap response —
  // no re-fetching, just reflects exactly what the API confirmed happened
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
          {getPriorityChangeAuditText(data) && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
              {getPriorityChangeAuditText(data)}
            </div>
          )}
        </div>
      ),
    });
  };

  const commitSwap = async () => {
    const { sourcePart, targetPartId, pendingDragContext } = swapModal;
    const built = await buildPrioritySwapPayload(sourcePart.id, targetPartId);
    if (built.error) {
      messageApi.error(built.error);
      setSwapModal(s => ({ ...s, phase: "result" }));
      return;
    }
    const { id1, id2, priority_changed_by_id } = built.payload;
    if (!priority_changed_by_id) {
      messageApi.error("User ID is required for priority swap. Log in again or enter a valid user ID.");
      setSwapModal(s => ({ ...s, phase: "result" }));
      return;
    }
    setSwapModal(s => ({ ...s, phase: "committing" }));
    try {
      const res = await api.put(
        `${SCHEDULING_API_BASE_URL}/scheduling/part-priorities/swap`,
        { id1, id2, priority_changed_by_id },
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

  // final "are you sure" checkpoint — shown only after the user reviews the
  // simulation, right before the real swap endpoint is hit
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

  // ── drag & drop ──────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 1 } })
  );

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
        const res = await api.post(
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
        const res = await api.post(
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

  // ── table columns ────────────────────────────────────────────────────────

  const columns = [
    {
      key: "sort",
      width: 30,
      render: () => <HolderOutlined style={{ cursor: "grab", color: "#999" }} />,
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
      render: (text) => {
        if (!text) return <span className="text-gray-400">-</span>;
        const d = new Date(text);
        const dd = String(d.getDate()).padStart(2, "0");
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const yyyy = d.getFullYear();
        return <Tag color="orange">{`${dd}-${mm}-${yyyy}`}</Tag>;
      },
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
                    title: "Confirm Priority Change",
                    icon: <ExclamationCircleOutlined />,
                    content: (
                      <div>
                        <p>Change priority for <strong>{record.part_name}</strong>?</p>
                        <p>Current: <strong>{record.priority}</strong> → New: <strong>{editPriorityValue}</strong></p>
                      </div>
                    ),
                    okText: "Yes, Save",
                    cancelText: "Cancel",
                    onOk: () => handleUpdatePriority(record.id, editPriorityValue),
                  });
                }}
              />
              <Button size="small" onClick={() => setEditingId(null)}>X</Button>
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
                type="text" size="small" icon={<OrderedListOutlined />}
                onClick={() => { setEditingId(record.id); setEditPriorityValue(priority); }}
                title="Set specific priority"
              />
              <Button
                type="text" size="small" icon={<ArrowUpOutlined />}
                disabled={index === 0}
                onClick={() => moveRow(index, "up")}
                title="Move Up"
              />
              <Button
                type="text" size="small" icon={<ArrowDownOutlined />}
                disabled={index === partData.length - 1}
                onClick={() => moveRow(index, "down")}
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
  // backend returns "BLOCKED - FORCE SWAP TO SEE IMPACT" for a true block, not the bare
  // word "BLOCKED" — match on prefix so this actually gates the button
  const isRecommendationBlocked = (rec) => (rec || "").toUpperCase().startsWith("BLOCKED");
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
      {/* only show Run Simulation button when user manually picks target (no drag context) */}
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

  // ── table content ────────────────────────────────────────────────────────

  const renderContent = () => {
    if (partLoading) {
      return <div className="p-12 flex justify-center"><Spin size="large" /></div>;
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
              allowClear showSearch size="middle"
              style={{ minWidth: 160 }}
              value={filterProject}
              onChange={(val) => { setFilterProject(val || null); setFilterPartNumber(null); }}
            >
              {projectOptions.map(p => <Select.Option key={p} value={p}>{p}</Select.Option>)}
            </Select>
            <Select
              placeholder="Part Number"
              allowClear showSearch size="middle"
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
          <SortableContext items={partData.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <Table
              components={{ body: { row: Row } }}
              columns={columns}
              dataSource={filteredPartData}
              rowKey="id"
              pagination={{
                current: partPagination.current,
                pageSize: partPagination.pageSize,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                pageSizeOptions: ["10", "20", "50", "100"],
                placement: "bottom",
                responsive: true,
              }}
              onChange={(p) => setPartPagination({ current: p.current, pageSize: p.pageSize })}
              size="small"
              bordered
              className="modern-table"
              locale={{
                emptyText: (
                  <Empty description={partSearchText ? "No parts matching search" : "No parts priority data found"} />
                ),
              }}
              scroll={{ x: 1200 }}
            />
          </SortableContext>
        </DndContext>
      </div>
    );
  };

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-2 sm:p-4 lg:p-6">
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td { background: #f0f8ff !important; }
        .modern-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f0f0f0; }
        @media (max-width: 768px) {
          .ant-table { font-size: 12px; }
          .ant-table-thead > tr > th, .ant-table-tbody > tr > td { padding: 8px 4px; }
        }
        /* make antd modal body scrollable with fixed footer */
        .swap-sim-modal .ant-modal-body { padding: 0 !important; }
        .swap-sim-modal .ant-modal-footer { display: none; }
        .swap-sim-modal .ant-modal-content { display: flex; flex-direction: column; max-height: 90vh; }
      `}</style>

      {contextHolder}

      {/* page header */}
      <div className="bg-white rounded-lg lg:rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 mb-4 lg:mb-6">
        <Typography.Title
          level={2}
          style={{ margin: 0, fontSize: "clamp(18px, 4vw, 24px)" }}
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

      {/* table card */}
      <Card className="shadow-sm rounded-lg lg:rounded-xl border border-gray-100" styles={{ body: { padding: 0 } }}>
        {renderContent()}
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
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", lineHeight: 1.2 }}>{swapModal.sourcePart.part_number}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{swapModal.sourcePart.part_name}</div>
            </div>
            <div style={{ padding: "10px 22px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, background: "#fff" }}>
              <Lottie animationData={swapAnim} loop autoplay style={{ width: 42, height: 30 }} />
              <div style={{ fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: 2 }}>SWAP</div>
            </div>
            <div style={{ flex: 1, padding: "14px 18px", background: "#fff", borderLeft: "1px solid #e2e8f0", textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Displaced</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a", lineHeight: 1.2 }}>{targetPart.part_number}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>{targetPart.part_name}</div>
            </div>
          </div>
        )}

        {/* ── loading: simulating ── */}
        {isSimulating && (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <Lottie animationData={loadingAnim} loop autoplay style={{ width: 120, height: 40, margin: "0 auto" }} />
            <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>Checking machine schedules, due dates, and production logs…</div>
          </div>
        )}

        {/* ── loading: committing ── */}
        {isCommitting && (
          <div style={{ padding: "44px 0", textAlign: "center" }}>
            <Lottie animationData={loadingAnim} loop autoplay style={{ width: 120, height: 40, margin: "0 auto" }} />
            <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>Applying swap and rescheduling affected operations…</div>
          </div>
        )}

        {/* ── idle ── */}
        {!isSimulating && !isCommitting && !hasResult && !swapModal.pendingDragContext && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
            Select a target part and run the simulation to preview the schedule impact.
          </div>
        )}

        {/* ── simulation result ── */}
        {hasResult && (() => {
          const sim     = swapModal.simResult;
          const rec     = sim?.summary?.recommendation || "PROCEED";
          const reason  = sim?.summary?.reason || "";
          const blocked = isRecommendationBlocked(rec);
          const statusColor    = rec === "PROCEED" ? "#16a34a" : rec === "CAUTION" ? "#d97706" : "#dc2626";
          const statusBg       = rec === "PROCEED" ? "#f0fdf4" : rec === "CAUTION" ? "#fffbeb" : "#fff5f5";
          const statusBorder   = rec === "PROCEED" ? "#bbf7d0" : rec === "CAUTION" ? "#fde68a" : "#fecaca";
          const iconKind       = rec === "PROCEED" ? "success" : rec === "CAUTION" ? "caution" : "blocked";
          const recLabel       = rec === "PROCEED" ? "Safe to proceed"
            : rec === "CAUTION" ? "Proceed with caution"
            : blocked ? "Swap blocked"
            : rec.toUpperCase().startsWith("NOT RECOMMENDED") ? "Not recommended"
            : rec;

          const netImpact   = sim?.detailed_analysis?.net_impact_days ?? 0;
          const benefitDays = sim?.detailed_analysis?.total_benefit_days ?? 0;
          const delayDays   = sim?.detailed_analysis?.total_delay_days ?? 0;

          const movedRaw     = sim?.what_changes?.swap_specific_impact?.part_being_moved || sim?.what_changes?.part_being_moved || null;
          const displacedRaw = sim?.what_changes?.swap_specific_impact?.part_being_displaced || sim?.what_changes?.part_being_displaced || null;
          const normPart = (p) => ({
            part_number:    p?.part_number || p?.part_no || "-",
            part_name:      p?.part_name   || p?.name   || "",
            old_priority:   p?.old_priority  ?? p?.priority ?? "-",
            new_priority:   p?.new_priority  ?? "-",
            old_completion: p?.old_completion ?? "-",
            new_completion: p?.new_completion ?? "-",
          });
          const movedNorm     = normPart(movedRaw);
          const displacedNorm = normPart(displacedRaw);

          const dueDateRows = sim?.validation?.due_date_impact || [];
          const machines    = sim?.detailed_analysis?.machines_affected || [];
          const blockedOps  = sim?.blocked_operations || [];
          const cautionOps  = sim?.caution_operations || [];
          const allOps      = [
            ...blockedOps.map(o => ({ ...o, _sev: "blocked" })),
            ...cautionOps.map(o => ({ ...o, _sev: "caution" })),
          ];
          const criticalWarnings = normalizeWarningList(sim?.critical_warnings);

          const logsByOpId = {};
          const logEvidence = sim?.validation?.production_log_evidence || {};
          [...(logEvidence.blocked_operations_with_logs || []), ...(logEvidence.caution_operations_with_logs || [])]
            .forEach(o => { logsByOpId[o.operation_id] = o.production_logs || []; });

          const fmtTime = (date, time) => {
            if (!date) return "-";
            const t = time ? String(time).split(".")[0] : "";
            return `${date}${t ? " " + t : ""}`;
          };

          // ── status + due date tags ──
          const statusTag = (s) => {
            const up = (s || "").toUpperCase();
            const color = up.includes("OVERDUE") ? "red" : up.includes("CANNOT") ? "default" : up.includes("ON TRACK") ? "green" : "default";
            return <Tag color={color}>{s || "-"}</Tag>;
          };
          const impactTag = (s) => {
            const up = (s || "").toUpperCase();
            return <Tag color={up.startsWith("HURTS") ? "red" : up.startsWith("HELPS") ? "green" : "default"}>{s || "-"}</Tag>;
          };

          // ── kpi helper ──
          const kpiColor = (val, positiveIsGood = false) => {
            if (val === 0 || val === null || val === undefined) return "#6b7280";
            return positiveIsGood ? (val > 0 ? "#16a34a" : "#dc2626") : (val > 0 ? "#dc2626" : "#16a34a");
          };
          const kpiLabel = (val, suffix = "d") => val === 0 ? "—" : `${val > 0 ? "+" : ""}${val}${suffix}`;

          const tabCountBadge = (n) => n > 0 ? (
            <span style={{ marginLeft: 6, background: "#e5e7eb", color: "#374151", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 600 }}>
              {n}
            </span>
          ) : null;

          return (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

              {/* ── status banner + KPIs (always visible above tabs) ── */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: statusBg, borderTop: `1px solid ${statusBorder}`,
                borderBottom: `1px solid ${statusBorder}`, padding: "10px 20px",
                margin: "12px 0 0", flexShrink: 0,
              }}>
                {/* left: icon + label + reason */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <StatusLottie kind={iconKind} size={38} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: statusColor, lineHeight: 1.3 }}>{recLabel}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 340, lineHeight: 1.4 }}>{reason}</div>
                  </div>
                </div>
                {/* right: KPI strip */}
                <div style={{ display: "flex", borderLeft: "1px solid #e2e8f0", marginLeft: 12, flexShrink: 0 }}>
                  {[
                    { label: "Net impact",   value: netImpact,   good: false  },
                    { label: "Time saved",   value: benefitDays, good: true   },
                    { label: "Delay added",  value: delayDays,   good: false  },
                  ].map((kpi, i, arr) => (
                    <div key={kpi.label} style={{
                      padding: "4px 18px", textAlign: "center",
                      borderRight: i < arr.length - 1 ? "1px solid #e2e8f0" : "none",
                    }}>
                      <div style={{ fontSize: 11, color: "#9ca3b8", marginBottom: 2 }}>{kpi.label}</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: kpiColor(kpi.value, kpi.good) }}>
                        {kpiLabel(kpi.value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── tabbed detail area ── */}
              <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <Tabs
                  activeKey={simActiveTab}
                  onChange={setSimActiveTab}
                  size="small"
                  style={{ flex: 1, display: "flex", flexDirection: "column" }}
                  tabBarStyle={{ padding: "0 20px", marginBottom: 0, flexShrink: 0 }}
                  items={[
                    {
                      key: "overview",
                      label: "Overview",
                      children: (
                        <div style={{ padding: "14px 20px 0", overflowY: "auto", maxHeight: "calc(90vh - 360px)" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                            {/* left: summary */}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", marginBottom: 10 }}>Summary</div>
                              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.65 }}>
                                {reason || "Review the simulation details before proceeding with the swap."}
                              </div>
                              {criticalWarnings.length > 0 && (
                                <div style={{ marginTop: 12, borderLeft: "3px solid #ef4444", background: "#fef2f2", padding: "10px 14px" }}>
                                  <div style={{ fontWeight: 700, color: "#b91c1c", fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Critical warnings</div>
                                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#b91c1c" }}>
                                    {criticalWarnings.map((w, i) => <li key={`cw-${i}`}>{w}</li>)}
                                  </ul>
                                </div>
                              )}
                              {(() => {
                                const calc   = sim?.validation?.calculation_explanation;
                                const params = sim?.validation?.calculation_parameters;
                                if (!calc && !params) return null;
                                return (
                                  <div style={{ marginTop: 14, fontSize: 11, color: "#9ca3b8", borderTop: "1px dashed #e5e7eb", paddingTop: 10 }}>
                                    {calc?.simulation_scope && <div>{calc.simulation_scope}</div>}
                                    {params?.reference_date && (
                                      <div>Ref. date: {params.reference_date}{params?.working_minutes_per_day ? ` · ${params.working_minutes_per_day} min/day` : ""}</div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* right: parts at a glance */}
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "#1f2937", marginBottom: 10 }}>Parts at a glance</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                                {[
                                  { norm: movedNorm,     accent: "#16a34a", bgNow: "#dcfce7", badge: "↑ Moved up",       badgeColor: "green"  },
                                  { norm: displacedNorm, accent: "#d97706", bgNow: "#fef3c7", badge: "↓ Pushed down",    badgeColor: "orange" },
                                ].map(({ norm, accent, bgNow, badge, badgeColor }) => (
                                  <div key={norm.part_number} style={{ borderTop: `3px solid ${accent}`, paddingTop: 10 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", lineHeight: 1.2 }}>{norm.part_number}</div>
                                    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{norm.part_name}</div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                      <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 10, color: "#9ca3b8" }}>Was</div>
                                        <div style={{ fontWeight: 700, fontSize: 18, color: "#374151" }}>{norm.old_priority}</div>
                                      </div>
                                      <ArrowRightOutlined style={{ color: "#d1d5db", fontSize: 11 }} />
                                      <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 10, color: "#9ca3b8" }}>Now</div>
                                        <div style={{ fontWeight: 700, fontSize: 18, color: accent }}>{norm.new_priority}</div>
                                      </div>
                                      <Tag color={badgeColor} style={{ marginLeft: 2 }}>{badge}</Tag>
                                    </div>
                                    <div style={{ marginTop: 10, borderTop: "1px solid #f3f4f6", paddingTop: 8, fontSize: 12 }}>
                                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                        <span style={{ color: "#9ca3b8" }}>Before</span>
                                        <span style={{ color: "#374151" }}>{norm.old_completion}</span>
                                      </div>
                                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                                        <span style={{ color: "#9ca3b8" }}>After</span>
                                        <span style={{ color: "#374151" }}>{norm.new_completion}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ),
                    },
                    {
                      key: "due_date",
                      label: <span>Due Date Impact{tabCountBadge(dueDateRows.length)}</span>,
                      children: (
                        <div style={{ padding: "14px 20px 0", overflowY: "auto", maxHeight: "calc(90vh - 360px)" }}>
                          {dueDateRows.length === 0 ? (
                            <Empty description="No due date impact data" />
                          ) : (
                            <Table
                              size="small" bordered pagination={false}
                              rowKey={r => `ddi-${r.part_id}`}
                              dataSource={dueDateRows}
                              columns={[
                                {
                                  title: "Part", dataIndex: "part_number", key: "pn",
                                  render: (t, r) => (
                                    <div>
                                      <div style={{ fontWeight: 600 }}>{t || "-"}</div>
                                      <div style={{ fontSize: 11, color: "#94a3b8" }}>Order {r.order_id ?? "-"} · Due {r.due_date || "-"}</div>
                                    </div>
                                  ),
                                },
                                {
                                  title: "Completion (before → after)", key: "comp",
                                  render: (_, r) => (
                                    <span style={{ fontSize: 12 }}>
                                      {r.current_completion || "-"}
                                      <ArrowRightOutlined style={{ fontSize: 10, margin: "0 6px", color: "#cbd5e1" }} />
                                      {r.after_swap_completion || "-"}
                                    </span>
                                  ),
                                },
                                {
                                  title: "Status (before → after)", key: "status",
                                  render: (_, r) => (
                                    <Space size={4}>
                                      {statusTag(r.current_status)}
                                      <ArrowRightOutlined style={{ fontSize: 10, color: "#cbd5e1" }} />
                                      {statusTag(r.after_swap_status)}
                                    </Space>
                                  ),
                                },
                                {
                                  title: "Impact", dataIndex: "swap_impact", key: "impact",
                                  render: t => impactTag(t),
                                },
                              ]}
                            />
                          )}
                        </div>
                      ),
                    },
                                        {
                      key: "machines",
                      label: <span>Machines Affected{tabCountBadge(machines.length)}</span>,
                      children: (
                        <div style={{ padding: "14px 20px 0", overflowY: "auto", maxHeight: "calc(90vh - 360px)" }}>
                          {machines.length === 0 ? (
                            <Empty description="No machines affected" />
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {machines.map(m => {
                                const key = m?.id ?? m;
                                const label = m?.name || `Machine ${m?.id ?? m}`;
                                const parts = m?.parts_affected || [];
                                const ops = m?.operations || [];
                                return (
                                  <div key={key} style={{ 
                                    background: '#f8fafc', 
                                    borderRadius: 8, 
                                    padding: 12,
                                    border: '1px solid #e2e8f0'
                                  }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>
                                      {label}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
                                      Used by parts: {parts.join(', ')}
                                    </div>
                                    {ops.length > 0 && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ fontSize: 11, color: '#9ca3b8', fontWeight: 600 }}>
                                          Operations scheduled on this machine:
                                        </div>
                                        {ops.map((op, idx) => (
                                          <div key={idx} style={{ 
                                            background: '#fff', 
                                            borderRadius: 4, 
                                            padding: 8,
                                            border: '1px solid #e5e7eb'
                                          }}>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                                              {op.part_number} - Op {op.operation_number} ({op.operation_name})
                                            </div>
                                            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>
                                              <span style={{ color: '#9ca3b8' }}>Before swap:</span> {op.current_start_time || '-'} → {op.current_end_time || '-'}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#6b7280' }}>
                                              <span style={{ color: '#9ca3b8' }}>After swap:</span> {op.simulated_start_time || '-'} → {op.simulated_end_time || '-'}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ),
                    },
                    {
                      key: "operations",
                      label: <span>Operations{tabCountBadge(allOps.length)}</span>,
                      children: (
                        <div style={{ padding: "14px 20px 0", overflowY: "auto", maxHeight: "calc(90vh - 360px)" }}>
                          {allOps.length === 0 ? (
                            <Empty description="No operations currently in production" />
                          ) : (
                            <Collapse
                              ghost size="small"
                              defaultActiveKey={allOps.filter(o => o._sev === "blocked").map((o, i) => String(o.operation_id ?? `b${i}`))}
                              items={allOps.map((op, idx) => {
                                const logs   = logsByOpId[op.operation_id] || [];
                                const reason = op.caution_reason || op.block_reason || op.reason || "";
                                const color  = op._sev === "blocked" ? "red" : "orange";
                                return {
                                  key: String(op.operation_id ?? idx),
                                  label: (
                                    <Space size={8} wrap>
                                      <Tag color={color}>{op._sev === "blocked" ? "Blocked" : "Caution"}</Tag>
                                      <span style={{ fontWeight: 600 }}>{op.part_number}</span>
                                      <span style={{ color: "#64748b", fontSize: 12 }}>
                                        Op {op.operation_number} — {(op.operation_name || "").trim()}
                                      </span>
                                    </Space>
                                  ),
                                  children: (
                                    <div style={{ fontSize: 12, color: "#374151" }}>
                                      {reason && <div style={{ marginBottom: logs.length ? 8 : 0 }}>{reason}</div>}
                                      {logs.length > 0 && (
                                        <Table
                                          size="small" pagination={false}
                                          rowKey={r => `log-${r.log_id}`}
                                          dataSource={logs}
                                          columns={[
                                            { title: "Operator status", dataIndex: "operator_status", key: "os", render: v => v || "-" },
                                            { title: "Status",          dataIndex: "status",           key: "st", render: v => v || "-" },
                                            { title: "From", key: "from", render: (_, r) => fmtTime(r.from_date, r.from_time) },
                                            { title: "To",   key: "to",   render: (_, r) => fmtTime(r.to_date,   r.to_time)   },
                                            { title: "Approved qty",  dataIndex: "approved_quantity",  key: "aq", render: v => v ?? "-" },
                                            { title: "Remaining qty", dataIndex: "remaining_quantity", key: "rq", render: v => v ?? "-" },
                                          ]}
                                        />
                                      )}
                                    </div>
                                  ),
                                };
                              })}
                            />
                          )}
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          );
        })()}

        {/* ── sticky footer ── */}
        <div style={{ display: "flex", gap: 10, padding: "12px 20px", borderTop: "1px solid #f0f0f0", background: "#fff", flexShrink: 0 }}>
          {!swapModal.pendingDragContext && swapModal.phase !== "result" && (
            <Button
              type="primary" loading={isSimulating}
              disabled={!swapModal.targetPartId || isSimulating}
              onClick={runSimulation} style={{ flex: 1 }}
            >
              {isSimulating ? "Simulating…" : "Run Simulation"}
            </Button>
          )}
          {hasResult && (
            <Button
              type="primary" loading={isCommitting}
              disabled={!canProceed || isCommitting}
              onClick={confirmCommitSwap}
              style={{ flex: 1, background: canProceed ? "#0f172a" : undefined, borderColor: canProceed ? "#0f172a" : undefined }}
            >
              {isCommitting ? "Applying swap…" : canProceed ? "Proceed with Swap" : "Swap Blocked"}
            </Button>
          )}
          <Button onClick={closeSwapModal} disabled={isCommitting}>Cancel</Button>
        </div>
      </Modal>

    </div>
  );
};

export default PartsPriority;
