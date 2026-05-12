import React, { useEffect, useMemo, useRef, useState } from 'react';
import {Modal,Button,Typography,message} from 'antd';
import {CheckCircleOutlined,CloseOutlined,FileTextOutlined,CheckOutlined} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import config from '../Config/config.js';
import PokaYokeChecklistSelector from './PokaYokeChecklistSelector.jsx';
import PokaYokeChecklistForm from './PokaYokeChecklistForm.jsx';

const { Title, Text } = Typography;

const PokaYokeChecklist = ({
  open,
  onClose,
  machineId: propMachineId,
  // Pre-fetched data passed from Dashboard — prevents duplicate API calls
  initialAssignments = [],
  initialLogs = [],
  initialApprovalStatuses = {},
}) => {
  const nowIST = () => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    const ms = String(new Date().getMilliseconds()).padStart(3, '0');
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
  };

  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [completedTodayIds, setCompletedTodayIds] = useState(new Set());
  const [approvalStatuses, setApprovalStatuses] = useState({});
  const [selected, setSelected] = useState(null);
  const [namesByChecklistId, setNamesByChecklistId] = useState({});
  const [items, setItems] = useState([]);
  const [activeStep, setActiveStep] = useState(1);
  const [responses, setResponses] = useState({});
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [comments, setComments] = useState('');
  const [parts, setParts] = useState([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMeta, setSuccessMeta] = useState({ orderText: '', partText: '' });
  // Display labels for the order/part in redo mode (read from rejection_details)
  const [redoOrderLabel, setRedoOrderLabel] = useState('');
  const [redoPartLabel, setRedoPartLabel] = useState('');

  const isRedo = useMemo(() => {
    if (!selected) return false;
    const cid =
      selected?.checklist_id ??
      selected?.pokayoke_checklist_id ??
      selected?.checklistId ??
      selected?.checklist?.id ??
      null;
    const freq = (selected?.frequency || '').toLowerCase();
    const shift = (selected?.shift || '').toLowerCase();
    const key = `${cid}-${freq}-${shift}`;
    return approvalStatuses[key]?.status === 'rejected';
  }, [selected, approvalStatuses]);

  // Tracks whether we've already run the fetch for the current open session.
  // Prevents running again on modal close (open: true → false) or extra renders.
  const prevOpenRef = useRef(false);
  // Tracks whether the operator submitted a checklist in this session.
  // Used to tell Dashboard whether to re-fetch status on close.
  const submittedRef = useRef(false);

  // parent re-render (e.g. Dashboard re-fetching after close) doesn't cause this
  // component's effect to re-run and flash a reload.
  const snapshotRef = useRef({ assignments: [], logs: [], approvalStatuses: {} });
  if (!prevOpenRef.current && open) {
    // Capture snapshot at open time before prevOpenRef is set
    snapshotRef.current = {
      assignments: initialAssignments,
      logs: initialLogs,
      approvalStatuses: initialApprovalStatuses,
    };
  }

  const machineId = useMemo(() => {
    if (propMachineId) return propMachineId;
    try {
      const stored = localStorage.getItem('selectedMachine');
      if (!stored) return null;
      const m = JSON.parse(stored);
      return m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
    } catch {
      return null;
    }
  }, [propMachineId]);

  const operatorId = useMemo(() => {
    try {
      const storedRaw =
        localStorage.getItem('selectedOperator') ??
        localStorage.getItem('operator') ??
        localStorage.getItem('selectedUser') ??
        localStorage.getItem('user');
      if (!storedRaw) return null;
      let o = null;
      try {
        o = JSON.parse(storedRaw);
      } catch {
        o = storedRaw;
      }
      return (
        o?.id ??
        o?.operator_id ??
        o?.operatorId ??
        o?.user_id ??
        o?.userId ??
        o?.user?.id ??
        null
      );
    } catch {
      return null;
    }
  }, []);

  // Reset success screen and submission flag when modal closes
  useEffect(() => {
    if (!open) {
      setShowSuccess(false);
      setSuccessMeta({ orderText: '', partText: '' });
      // Reset the open guard so next open triggers a fresh fetch
      prevOpenRef.current = false;
      submittedRef.current = false;
    }
  }, [open]);

  // ─── Main data fetch ──────────────────────────────────────────────────────
  // Runs ONLY when the modal transitions from closed → open (prevOpenRef guard).
  useEffect(() => {
    const fetchAssignments = async () => {
      // Modal is closing — do nothing
      if (!open) return;

      // Already ran for this open session — skip
      if (prevOpenRef.current) return;
      prevOpenRef.current = true;

      if (!machineId) {
        setAssignments([]);
        return;
      }

      setLoading(true);
      try {
        // ── Step 1: Assignments ──────────────────────────────────────────────
        const { assignments: snapAssignments, logs: snapLogs, approvalStatuses: snapApprovalStatuses } = snapshotRef.current;

        let rawArr;
        if (snapAssignments.length > 0) {
          rawArr = snapAssignments;
        } else {
          const res = await fetch(
            `${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`,
            { headers: { accept: 'application/json' } }
          );
          const data = await res.json();
          rawArr = Array.isArray(data) ? data : [];
        }

        // Filter by frequency / scheduled day (same logic as Dashboard)
        const today = new Date();
        const istOptions = { timeZone: 'Asia/Kolkata' };
        const dayOfWeek = today.toLocaleDateString('en-US', { ...istOptions, weekday: 'long' });
        const dayOfMonth = today.toLocaleDateString('en-US', { ...istOptions, day: 'numeric' });

        const arr = rawArr.filter(item => {
          const frequency = (item?.frequency || '').toLowerCase();
          const scheduledDay = (item?.scheduled_day || '');

          if (frequency === 'daily') return true;
          if (frequency === 'weekly') return scheduledDay.toLowerCase() === dayOfWeek.toLowerCase();
          if (frequency === 'monthly') return String(scheduledDay) === String(dayOfMonth);
          return true;
        });

        setAssignments(arr);

        // ── Step 2: Completed logs ───────────────────────────────────────────
        let logs;
        if (snapLogs.length > 0) {
          logs = snapLogs;
        } else {
          try {
            const logsRes = await fetch(
              `${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`
            );
            const logsData = await logsRes.json();
            logs = Array.isArray(logsData) ? logsData : [];
          } catch {
            logs = [];
          }
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const idsSet = new Set(
          logs
            .filter(log => new Date(log.completed_at) >= startOfToday)
            .map(log => {
              const cid = String(log.checklist_id);
              const freq = (log.frequency || '').toLowerCase();
              const shift = (log.shift || '').toLowerCase();
              return `${cid}-${freq}-${shift}`;
            })
        );
        setCompletedTodayIds(idsSet);

        // ── Step 3: Approval statuses ────────────────────────────────────────
        if (Object.keys(snapApprovalStatuses).length > 0) {
          setApprovalStatuses(snapApprovalStatuses);
        } else {
          const statuses = {};
          for (const item of arr) {
            const cid = String(
              item?.checklist_id ??
              item?.pokayoke_checklist_id ??
              item?.checklistId ??
              item?.checklist?.id
            );
            const freq = (item?.frequency || '').toLowerCase();
            const shift = (item?.shift || '').toLowerCase();
            const key = `${cid}-${freq}-${shift}`;

            if (idsSet.has(key)) {
              try {
                const approvalRes = await fetch(
                  `${config.API_BASE_URL}/pokayoke-completed-logs/checklists/${cid}/approval-status`
                );
                if (approvalRes.ok) {
                  const approvalData = await approvalRes.json();
                  const cLogs = approvalData.completed_logs || [];
                  const latestLog = cLogs
                    .filter(l => l.machine_id === machineId && new Date(l.completed_at) >= startOfToday)
                    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];

                  if (latestLog) {
                    statuses[key] = {
                      status: latestLog.overall_approval_status,
                      rejection_details: latestLog,
                    };
                  }
                }
              } catch (err) {
                console.error('Error fetching approval status:', err);
              }
            }
          }
          setApprovalStatuses(statuses);
        }

        // ── Step 4: Checklist names ──────────────────────────────────────────
        const ids = arr
          .map(it => it?.checklist_id ?? it?.pokayoke_checklist_id ?? it?.checklistId ?? it?.checklist?.id ?? null)
          .filter(id => id !== null);
        const missing = ids.filter(id => namesByChecklistId[String(id)] === undefined);
        if (missing.length > 0) {
          const results = await Promise.all(
            missing.map(async (id) => {
              try {
                const r = await fetch(`${API_BASE_URL}/pokayoke-checklists/${id}`, {
                  headers: { accept: 'application/json' },
                });
                const d = await r.json();
                const nm = d?.name ?? d?.title ?? `Checklist #${id}`;
                return [String(id), nm];
              } catch {
                return [String(id), `Checklist #${id}`];
              }
            })
          );
          const merged = { ...namesByChecklistId };
          results.forEach(([id, nm]) => {
            merged[id] = nm;
          });
          setNamesByChecklistId(merged);
        }
      } catch {
        setAssignments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAssignments();
  }, [open, machineId]);

  useEffect(() => {
    const run = async () => {
      if (!selected) {
        setItems([]);
        setActiveStep(1);
        return;
      }
      setActiveStep(2);
      const checklistId =
        selected?.checklist_id ??
        selected?.pokayoke_checklist_id ??
        selected?.checklistId ??
        selected?.checklist?.id ??
        null;
      if (!checklistId) {
        setItems([]);
        return;
      }
      try {
        const res = await fetch(`${API_BASE_URL}/pokayoke-checklists/${checklistId}/items`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setItems(arr);
        
        // Pre-fill responses if rejected
        const freq = (selected.frequency || '').toLowerCase();
        const shift = (selected.shift || '').toLowerCase();
        const key = `${checklistId}-${freq}-${shift}`;
        const approval = approvalStatuses[key];

        if (approval && approval.status === 'rejected') {
          const prevResponses = {};
          const rejectionDetails = approval.rejection_details || {};
          
          // Map responses using both ID and Item Text to be as robust as possible
          (rejectionDetails.items || []).forEach(oldItem => {
            const itemId = oldItem.item_id;
            const itemText = oldItem.item_text;
            const value = oldItem.response_value;
            
            // Try to find the matching item in the fresh items list
            const matchingItem = arr.find(it => 
              (itemId && it.id === itemId) || 
              (itemText && (it.item_text === itemText || it.name === itemText))
            );
            
            if (matchingItem) {
              const responseKey = matchingItem.id ?? matchingItem.item_text ?? matchingItem.name ?? 'Item';
              prevResponses[responseKey] = value;
            }
          });
          setResponses(prevResponses);
          
          if (rejectionDetails.production_order_id) {
            setSelectedOrderId(rejectionDetails.production_order_id);
          }
          if (rejectionDetails.part_id) {
            setSelectedPartId(rejectionDetails.part_id);
          }
          if (rejectionDetails.comments) {
            setComments(rejectionDetails.comments);
          }

          // Try to set labels from existing orders list first
          const existingOrder = orders.find(o => o.id === rejectionDetails.production_order_id);
          if (existingOrder) {
            const label = existingOrder.sale_order_number ?? existingOrder.order_number ?? existingOrder.name ?? existingOrder.title ?? `Order #${rejectionDetails.production_order_id}`;
            setRedoOrderLabel(label);
          }

          // Fetch order label for redo display if not found or to ensure latest
          if (rejectionDetails.production_order_id) {
            try {
              const orderRes = await fetch(`${API_BASE_URL}/orders/${rejectionDetails.production_order_id}`, {
                headers: { accept: 'application/json' },
              });
              if (orderRes.ok) {
                const orderData = await orderRes.json();
                const label = orderData?.sale_order_number ?? orderData?.order_number ?? orderData?.name ?? orderData?.title ?? `Order #${rejectionDetails.production_order_id}`;
                setRedoOrderLabel(label);

                if (rejectionDetails.part_id) {
                  try {
                    const saleOrderNumber = orderData?.sale_order_number ?? orderData?.order_number ?? orderData?.id;
                    const partsRes = await fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`, {
                      headers: { accept: 'application/json' },
                    });
                    if (partsRes.ok) {
                      const partsData = await partsRes.json();
                      const partsArr = Array.isArray(partsData) ? partsData : [];
                      setParts(partsArr);
                      const partObj = partsArr.find(p => String(p?.part_id ?? p?.id) === String(rejectionDetails.part_id));
                      const partLabel = partObj?.part_name ?? partObj?.name ?? partObj?.part_number ?? `Part #${rejectionDetails.part_id}`;
                      setRedoPartLabel(partLabel);
                    }
                  } catch (e) { console.error('Error fetching redo parts:', e); }
                }
              }
            } catch (e) { console.error('Error fetching redo order:', e); }
          }
        } else {
          setResponses({});
          setRedoOrderLabel('');
          setRedoPartLabel('');
        }
      } catch {
        setItems([]);
      }
    };
    run();
  }, [selected]);

  useEffect(() => {
    const loadOrders = async () => {
      if (activeStep !== 2) return;
      setOrdersLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setOrders(arr);
      } catch {
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    };
    loadOrders();
  }, [activeStep]);

  useEffect(() => {
    const loadParts = async () => {
      if (!isRedo) {
        setSelectedPartId(null);
      }
      setParts([]);
      if (!selectedOrderId) return;
      setPartsLoading(true);
      try {
        const orderObj = orders.find(o => o.id === selectedOrderId);
        const saleOrderNumber = orderObj?.sale_order_number || orderObj?.order_number || orderObj?.id;
        if (!saleOrderNumber) {
           setParts([]);
           return;
        }
        const res = await fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`, {
          headers: { accept: 'application/json' },
        });
        const data = await res.json();
        const arr = Array.isArray(data) ? data : [];
        setParts(arr);
      } catch {
        setParts([]);
      } finally {
        setPartsLoading(false);
      }
    };
    loadParts();
  }, [selectedOrderId, orders]);

  // Compute if any response is non-conforming
  const hasNonConforming = useMemo(() => {
    const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
    const falsy = new Set(['false', 'no', 'n', '0', 'off']);
    return items.some((it) => {
      const required = it?.is_required ?? it?.required ?? it?.mandatory ?? false;
      if (!required) return false;

      const id = it?.id ?? it?.item_text ?? it?.name ?? 'Item';
      const val = responses[id];
      const exp = it?.expected_value ?? it?.expected ?? it?.expectedValue;
      const typeRaw = (it?.item_type ?? it?.type ?? '').toLowerCase();
      if (val === undefined || val === null) return false;
      if (typeRaw.includes('bool')) {
        const v = String(val).toLowerCase();
        const e = exp != null ? String(exp).toLowerCase() : 'true';
        const vBool = truthy.has(v) ? true : falsy.has(v) ? false : null;
        const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
        if (vBool === null) return true;
        return vBool !== eBool;
      } else if (typeRaw.includes('num')) {
        const vNum = typeof val === 'number' ? val : parseFloat(String(val));
        const expStr = String(exp).trim();
        
        if (Number.isNaN(vNum)) return false;
        
        if (expStr.startsWith('<=')) {
          const eNum = parseFloat(expStr.substring(2).trim());
          return Number.isNaN(eNum) || vNum > eNum;
        } else if (expStr.startsWith('>=')) {
          const eNum = parseFloat(expStr.substring(2).trim());
          return Number.isNaN(eNum) || vNum < eNum;
        } else if (expStr.startsWith('<')) {
          const eNum = parseFloat(expStr.substring(1).trim());
          return Number.isNaN(eNum) || vNum >= eNum;
        } else if (expStr.startsWith('>')) {
          const eNum = parseFloat(expStr.substring(1).trim());
          return Number.isNaN(eNum) || vNum <= eNum;
        } else if (expStr.includes('-')) {
          const rangeParts = expStr.split('-');
          if (rangeParts.length === 2) {
            const min = parseFloat(rangeParts[0].trim());
            const max = parseFloat(rangeParts[1].trim());
            return Number.isNaN(min) || Number.isNaN(max) || vNum < min || vNum > max;
          }
        }
        
        const eNum = parseFloat(expStr);
        return Number.isNaN(eNum) || vNum !== eNum;
      } else {
        if (exp == null) return false;
        return String(val).toLowerCase().trim() !== String(exp).toLowerCase().trim();
      }
    });
  }, [items, responses]);

  // Check if all required items are completed
  const allRequiredComplete = useMemo(() => {
    return items
      .filter((it) => it?.is_required ?? it?.required ?? it?.mandatory ?? false)
      .every((it) => {
        const id = it?.id;
        const text = it?.item_text ?? it?.name ?? 'Item';
        
        // Check responses by ID first, then by text
        const valById = id !== undefined && id !== null ? responses[String(id)] : undefined;
        const valByText = responses[text];
        const val = valById !== undefined ? valById : valByText;

        return val !== undefined && val !== null && val !== '';
      });
  }, [items, responses]);

  const checklistId =
    selected?.checklist_id ??
    selected?.pokayoke_checklist_id ??
    selected?.checklistId ??
    selected?.checklist?.id ??
    null;

  const canSubmit = useMemo(() => {
    const hasBaseFields =
      Boolean(machineId) &&
      Boolean(checklistId) &&
      Boolean(selectedOrderId) &&
      Boolean(operatorId) &&
      allRequiredComplete;

    if (!hasBaseFields) return false;

    // In redo mode, we should have a part ID if it was originally there.
    // Otherwise, if the parts list has loaded and has entries, one must be selected.
    const hasPartSelection = isRedo ? Boolean(selectedPartId) : (parts.length === 0 || Boolean(selectedPartId));
    
    return hasPartSelection;
  }, [machineId, checklistId, selectedOrderId, operatorId, allRequiredComplete, isRedo, selectedPartId, parts.length]);

  const handleSubmit = async () => {
    if (!canSubmit || submitLoading) return;
    setSubmitLoading(true);
    try {
      const selectedAssignment = selected;
      const assignmentId = selectedAssignment?.id ?? null;
      const assignmentFrequency = selectedAssignment?.frequency ?? null;
      const assignmentShift = selectedAssignment?.shift ?? null;
      
      const freq = (assignmentFrequency || '').toLowerCase();
      const shift = (assignmentShift || '').toLowerCase();
      const key = `${checklistId}-${freq}-${shift}`;
      const approval = approvalStatuses[key];
      const isRedo = approval?.status === 'rejected';
      
      const rejectedItemIds = isRedo 
        ? new Set((approval?.rejection_details?.items || [])
            .filter(i => i.approval_status === 'rejected')
            .map(i => String(i.item_id)))
        : null;
      
      const payload = {
        machine_id: machineId ?? null,
        checklist_id: checklistId,
        assignment_id: assignmentId,
        frequency: assignmentFrequency,
        shift: assignmentShift,
        production_order_id: selectedOrderId,
        order_id: selectedOrderId,
        part_id: selectedPartId ?? null,
        operator_id: operatorId ?? null,
        comments: comments ?? '',
        completed_at: nowIST(),
        all_items_passed: !hasNonConforming && allRequiredComplete,
        responses: items
          .map((it) => {
            const id = it?.id;
            const text = it?.item_text ?? it?.name ?? 'Item';
            
            // Consistent lookup with allRequiredComplete
            const valById = id !== undefined && id !== null ? responses[String(id)] : undefined;
            const valByText = responses[text];
            const value = valById !== undefined ? valById : valByText;

            if (value === undefined || value === null) return null;
            
            // Only send the rejected items if we are in redo mode
            if (isRedo && id && !rejectedItemIds.has(String(id))) return null;
            
            return {
              item_id: id,
              value,
            };
          })
          .filter(Boolean),
      };
      const res = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = 'Submission failed';
        try {
          const err = await res.json();
          detail = err?.detail ? JSON.stringify(err.detail) : detail;
        } catch {
          const errText = await res.text();
          detail = errText || detail;
        }
        throw new Error(detail);
      }
      let created;
      try {
        created = await res.json();
      } catch {
        created = null;
      }
      const createdId =
        created?.id ??
        created?.log_id ??
        created?.pokayoke_completed_log_id ??
        created?.data?.id ??
        null;
      if (createdId && Array.isArray(payload.responses) && payload.responses.length > 0) {
        const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
        const falsy = new Set(['false', 'no', 'n', '0', 'off']);
        for (const r of payload.responses) {
          try {
            const item = items.find((it) => (it?.id ?? null) === r.item_id);
            const typeRaw = (item?.item_type ?? item?.type ?? '').toLowerCase();
            const expected = item?.expected_value ?? item?.expected ?? item?.expectedValue ?? null;
            const valStr = String(r.value);
            let isConfirming = false;
            if (typeRaw.includes('bool')) {
              const vBool = truthy.has(valStr.toLowerCase()) ? true : falsy.has(valStr.toLowerCase()) ? false : null;
              const e = expected != null ? String(expected).toLowerCase() : 'true';
              const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
              isConfirming = vBool !== null && vBool === eBool;
            } else if (typeRaw.includes('num')) {
              const vNum = parseFloat(valStr);
              const expStr = String(expected).trim();
              
              if (Number.isNaN(vNum)) {
                isConfirming = false;
              } else {
                if (expStr.startsWith('<=')) {
                  const eNum = parseFloat(expStr.substring(2).trim());
                  isConfirming = !Number.isNaN(eNum) && vNum <= eNum;
                } else if (expStr.startsWith('>=')) {
                  const eNum = parseFloat(expStr.substring(2).trim());
                  isConfirming = !Number.isNaN(eNum) && vNum >= eNum;
                } else if (expStr.startsWith('<')) {
                  const eNum = parseFloat(expStr.substring(1).trim());
                  isConfirming = !Number.isNaN(eNum) && vNum < eNum;
                } else if (expStr.startsWith('>')) {
                  const eNum = parseFloat(expStr.substring(1).trim());
                  isConfirming = !Number.isNaN(eNum) && vNum > eNum;
                } else if (expStr.includes('-')) {
                  const rangeParts = expStr.split('-');
                  if (rangeParts.length === 2) {
                    const min = parseFloat(rangeParts[0].trim());
                    const max = parseFloat(rangeParts[1].trim());
                    isConfirming = !Number.isNaN(min) && !Number.isNaN(max) && vNum >= min && vNum <= max;
                  } else {
                    isConfirming = false;
                  }
                } else {
                  const eNum = parseFloat(expStr);
                  isConfirming = !Number.isNaN(eNum) && vNum === eNum;
                }
              }
            } else {
              isConfirming =
                expected != null &&
                valStr.toLowerCase().trim() === String(expected).toLowerCase().trim();
            }
            const singlePayload = {
              completed_log_id: createdId,
              item_id: r.item_id,
              response_value: valStr,
              is_confirming: Boolean(isConfirming),
              timestamp: nowIST(),
            };
            await fetch(`${API_BASE_URL}/pokayoke-completed-logs/item-responses`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(singlePayload),
            });
          } catch {
          }
        }
      }
      const chosenOrder = orders.find((o) => String(o?.id) === String(selectedOrderId));
      const orderText =
        chosenOrder?.sale_order_number ??
        chosenOrder?.order_number ??
        chosenOrder?.order_name ??
        chosenOrder?.name ??
        chosenOrder?.title ??
        (selectedOrderId != null ? String(selectedOrderId) : '');

      const chosenPart = parts.find((p) => String(p?.part_id ?? p?.id) === String(selectedPartId));
      const partText =
        chosenPart?.part_number ??
        chosenPart?.part_name ??
        chosenPart?.name ??
        (selectedPartId != null ? String(selectedPartId) : '');

      setSuccessMeta({ orderText, partText });
      setShowSuccess(true);
      
      // Optimistically update local state so the selector reflects submission
      if (checklistId) {
        const submitFreq = (assignmentFrequency || '').toLowerCase();
        const submitShift = (assignmentShift || '').toLowerCase();
        const submitKey = `${String(checklistId)}-${submitFreq}-${submitShift}`;
        setCompletedTodayIds(prev => new Set([...prev, submitKey]));
        setApprovalStatuses(prev => ({
          ...prev,
          [submitKey]: { status: 'pending', rejection_details: null }
        }));
      }

      message.success('Checklist submitted');
      submittedRef.current = true;
      setSubmitLoading(false);
    } catch (e) {
      message.error(String(e?.message || 'Submit failed'));
      setSubmitLoading(false);
    }
  };

  const handleNewChecklist = () => {
    setShowSuccess(false);
    setSuccessMeta({ orderText: '', partText: '' });
    setSelected(null);
    setItems([]);
    setResponses({});
    setActiveStep(1);
    setSelectedOrderId(null);
    setRedoOrderLabel('');
    setRedoPartLabel('');
    setComments('');
  };

  return (
    <Modal
      open={open}
      onCancel={() => onClose(submittedRef.current)}
      footer={null}
      width={780}
      closable={false}
      styles={{
        content: { padding: 0, borderRadius: 12, overflow: 'hidden' },
      }}
    >
      {/* Header */}
      <div
        style={{
          background: showSuccess ? '#fff' : '#1677FF',
          padding: showSuccess ? '14px 20px' : '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: showSuccess ? '1px solid #eef2f7' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {showSuccess ? (
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 9,
                border: '2px solid #1677FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1677FF',
                fontSize: 12,
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              ✓
            </div>
          ) : (
            <CheckCircleOutlined style={{ color: '#fff', fontSize: 20 }} />
          )}
          <span
            style={{
              color: showSuccess ? '#0f172a' : '#fff',
              fontWeight: 600,
              fontSize: showSuccess ? 14 : 16,
            }}
          >
            Poka Yoke Checklist
          </span>
        </div>
        <button
          onClick={() => onClose(submittedRef.current)}
          style={{
            background: 'transparent',
            border: 'none',
            color: showSuccess ? '#94a3b8' : '#fff',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            fontSize: showSuccess ? 16 : 18,
          }}
        >
          <CloseOutlined />
        </button>
      </div>

      <div
        style={{
          padding: showSuccess ? 28 : 24,
          maxHeight: showSuccess ? undefined : '70vh',
          overflowY: showSuccess ? undefined : 'auto',
        }}
      >
        {showSuccess ? (
          <div
            style={{
              minHeight: 260,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 84,
                height: 84,
                borderRadius: 42,
                background: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              <CheckOutlined style={{ color: '#fff', fontSize: 38 }} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>
              Checklist Completed Successfully!
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              {successMeta?.orderText ? `Production Order: ${successMeta.orderText}` : 'Production Order: —'}
              {successMeta?.partText ? ` | Part: ${successMeta.partText}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <Button type="primary" onClick={handleNewChecklist} style={{ borderRadius: 8 }}>
                New Checklist
              </Button>
              <Button onClick={() => onClose(submittedRef.current)} style={{ borderRadius: 8 }}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <>
        {/* Title block */}
        <div
          style={{
            background: '#E6F4FF',
            border: '1px solid #dbeafe',
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <FileTextOutlined style={{ fontSize: 24, color: '#1677FF' }} />
            <Title level={4} style={{ margin: 0 }}>
              Poka Yoke Checklist
            </Title>
          </div>
          <Text style={{ color: '#64748b', fontSize: 14 }}>
            Complete the required checklist items to ensure quality standards are met.
          </Text>
        </div>

        {/* Step indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: activeStep === 2 ? '#1677FF' : '#E6F4FF',
                border: '2px solid #1677FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeStep === 2 ? '#fff' : '#1677FF',
                fontSize: activeStep === 2 ? 18 : 16,
                fontWeight: 600,
              }}
            >
              {activeStep === 2 ? <CheckOutlined /> : '1'}
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>Select Checklist</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Choose from assigned checklists
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 60,
              height: 2,
              background: activeStep === 2 ? '#1677FF' : '#e2e8f0',
              marginTop: 18,
              marginLeft: 8,
              marginRight: 8,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: activeStep === 2 ? '#E6F4FF' : '#f1f5f9',
                border: `2px solid ${activeStep === 2 ? '#1677FF' : '#e2e8f0'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeStep === 2 ? '#1677FF' : '#94a3b8',
                fontSize: 16,
                fontWeight: 600,
              }}
            >
              2
            </div>
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, color: activeStep === 2 ? '#0f172a' : '#94a3b8' }}>
                Complete Items
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                Fill all required items
              </div>
            </div>
          </div>
        </div>

        {/* Step 1: Checklist list */}
        {activeStep === 1 && (
          <PokaYokeChecklistSelector
            loading={loading}
            assignments={assignments}
            namesByChecklistId={namesByChecklistId}
            onSelectChecklist={setSelected}
            completedTodayIds={completedTodayIds}
            approvalStatuses={approvalStatuses}
          />
        )}

        {/* Step 2: Complete items */}
        {activeStep === 2 && selected && (
          <PokaYokeChecklistForm
            items={items}
            responses={responses}
            setResponses={setResponses}
            orders={orders}
            ordersLoading={ordersLoading}
            selectedOrderId={selectedOrderId}
            setSelectedOrderId={setSelectedOrderId}
            parts={parts}
            partsLoading={partsLoading}
            selectedPartId={selectedPartId}
            setSelectedPartId={setSelectedPartId}
            comments={comments}
            setComments={setComments}
            hasNonConforming={hasNonConforming}
            canSubmit={canSubmit}
            submitLoading={submitLoading}
            onSubmit={handleSubmit}
            onBack={() => setSelected(null)}
            approvalInfo={approvalStatuses[`${selected?.checklist_id ?? selected?.pokayoke_checklist_id ?? selected?.checklistId ?? selected?.checklist?.id}-${(selected?.frequency || '').toLowerCase()}-${(selected?.shift || '').toLowerCase()}`]}
            redoOrderLabel={redoOrderLabel}
            redoPartLabel={redoPartLabel}
          />
        )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default PokaYokeChecklist;