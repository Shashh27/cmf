import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Modal, Button, message, Tabs, Spin, Pagination,
} from 'antd';
import {
  CheckCircleOutlined, CloseOutlined, CheckCircleFilled,
  CloseCircleFilled,
  CalendarOutlined, ClockCircleOutlined, ThunderboltOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import PokayokeHistory from './PokayokeHistory.jsx';

/* ─── Frequency helpers ─────────────────────────────────────────────────── */
const freqLabel = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based') {
    return item.trigger_hours ? `Every ${item.trigger_hours} hrs` : 'Usage Based';
  }
  if (ft === 'condition based') {
    return item.inspection_interval ? `${item.inspection_interval} inspection` : 'Condition Based';
  }
  return '—';
};

const freqIcon = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based')      return <CalendarOutlined style={{ fontSize: 11 }} />;
  if (ft === 'usage based')     return <ThunderboltOutlined style={{ fontSize: 11 }} />;
  if (ft === 'condition based') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
};

const freqColor = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based')      return { color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
  if (ft === 'usage based')     return { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' };
  if (ft === 'condition based') return { color: '#059669', bg: '#d1fae5', border: '#6ee7b7' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
};

const todayDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const isRejectedCheckpoint = (item) =>
  item?.needs_resubmit === true
  || String(item?.latest_submission_status ?? '').toLowerCase() === 'rejected';

const getCheckpointResponseValue = (item) =>
  item?.latest_response_value
  ?? item?.last_response_value
  ?? item?.response_value
  ?? item?.latest_submission?.response_value
  ?? '';

const formatResponseLabel = (val) => {
  const v = String(val ?? '').toLowerCase().trim();
  if (['yes', 'y', 'true', '1', 'on'].includes(v)) return 'Yes';
  if (['no', 'n', 'false', '0', 'off'].includes(v)) return 'No';
  if (!v) return null;
  return String(val);
};

const normalizeCheckpoint = (cp) => ({
  id: cp.checklist_item_id ?? cp.assignment_item_id ?? cp.id,
  assignment_item_id: cp.assignment_item_id,
  schedule_id: cp.schedule_id,
  checklist_item_id: cp.checklist_item_id,
  sequence_number: cp.sequence_number,
  item_text: cp.item_text,
  name: cp.item_text,
  item_type: cp.item_type,
  expected_value: cp.expected_value,
  frequency_type: cp.frequency_type,
  interval_value: cp.interval_value,
  interval_unit: cp.interval_unit,
  trigger_hours: cp.trigger_hours,
  inspection_interval: cp.inspection_interval,
  remarks: cp.remarks,
  is_required: cp.is_required ?? true,
  last_completed_date: cp.last_completed_date,
  next_due_date: cp.next_due_date,
  is_due: cp.is_due,
  has_pending_submission: cp.has_pending_submission,
  latest_submission_status: cp.latest_submission_status,
  needs_resubmit: cp.needs_resubmit ?? false,
  rejection_comments: cp.rejection_comments,
  latest_response_value: getCheckpointResponseValue(cp),
});

const normalizeAssignment = (raw) => {
  if (raw?.checklist?.items?.length) return raw;

  const checkpoints = (raw.checkpoints ?? raw.checklist?.items ?? []).map(normalizeCheckpoint);

  return {
    id: raw.assignment_id ?? raw.id,
    assignment_id: raw.assignment_id ?? raw.id,
    machine_id: raw.machine_id,
    checklist_id: raw.checklist_id,
    assigned_at: raw.assigned_at,
    checklist: {
      id: raw.checklist_id,
      name: raw.checklist_name ?? raw.checklist?.name,
      description: raw.checklist_description ?? raw.checklist?.description,
      items: checkpoints,
    },
  };
};

const buildTodayStateFromAssignments = (assignments) => {
  const today = todayDateStr();
  const todayItemIds = new Set();
  const todayMap = {};
  const approvalMap = {};

  assignments.forEach((assignment) => {
    const cid = String(assignment.checklist_id ?? assignment.checklist?.id ?? '');
    let hasPending = false;

    (assignment.checklist?.items ?? []).forEach((item) => {
      const key = String(item.id);
      if (item.is_due || isRejectedCheckpoint(item)) todayItemIds.add(item.id);
      if (item.has_pending_submission) {
        todayMap[key] = {
          response_value: getCheckpointResponseValue(item),
          approval_status: 'pending',
        };
        hasPending = true;
      } else if (isRejectedCheckpoint(item)) {
        todayMap[key] = {
          response_value: getCheckpointResponseValue(item),
          approval_status: 'rejected',
        };
        approvalMap[cid] = 'rejected';
      } else {
        const status = String(item.latest_submission_status ?? '').toLowerCase();
        if (status === 'approved' || status === 'pending') {
          todayMap[key] = {
            response_value: getCheckpointResponseValue(item),
            approval_status: status,
          };
          if (status === 'pending') hasPending = true;
        } else if (item.last_completed_date === today) {
          todayMap[key] = {
            response_value: getCheckpointResponseValue(item),
            approval_status: 'approved',
          };
        }
      }
    });

    if (hasPending) approvalMap[cid] = 'pending';
  });

  return { todayItemIds, todayMap, approvalMap };
};

/* ─── Main Component ─────────────────────────────────────────────────────── */
const PokaYokeChecklist = ({
  open,
  onClose,
  machineId: propMachineId,
  initialAssignments = [],
  isPage = false,
}) => {
  const [loading, setLoading]                     = useState(false);
  const [assignments, setAssignments]             = useState([]);
  const [submittedTodayMap, setSubmittedTodayMap] = useState({});
  const [approvalByChecklist, setApprovalByChecklist] = useState({});
  const [activeTab, setActiveTab]                 = useState('1');
  const [selectedChecklistId, setSelectedChecklistId] = useState(null);
  const [pendingResponses, setPendingResponses]   = useState({});
  const [submitting, setSubmitting]               = useState(false);
  const [todayItemIds, setTodayItemIds]           = useState(new Set());
  const [checkpointPage, setCheckpointPage]       = useState(1);
  const [checkpointPageSize, setCheckpointPageSize] = useState(10);

  const prevOpenRef  = useRef(false);
  const submittedRef = useRef(false);

  /* ── Machine / operator from localStorage ── */
  const machineId = useMemo(() => {
    if (propMachineId) return propMachineId;
    try {
      const m = JSON.parse(localStorage.getItem('selectedMachine') || 'null');
      return m?.id ?? m?.machine_id ?? m?.machineId ?? m?.machine?.id ?? null;
    } catch { return null; }
  }, [propMachineId]);

  const operatorId = useMemo(() => {
    try {
      const raw = localStorage.getItem('selectedOperator')
               ?? localStorage.getItem('operator')
               ?? localStorage.getItem('selectedUser')
               ?? localStorage.getItem('user');
      if (!raw) return null;
      let o; try { o = JSON.parse(raw); } catch { o = raw; }
      return o?.id ?? o?.operator_id ?? o?.operatorId ?? o?.user_id ?? o?.userId ?? o?.user?.id ?? null;
    } catch { return null; }
  }, []);

  /* ── Data fetch ── */
  const loadAssignments = useCallback(async () => {
    if (!machineId) { setAssignments([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/pm/operator/assignments?machine_id=${machineId}`,
        { headers: { accept: 'application/json' } }
      );
      if (!res.ok) throw new Error('Failed to fetch assignments');
      const data = await res.json();
      const rawList = Array.isArray(data)
        ? data
        : Array.isArray(data?.assignments)
          ? data.assignments
          : Array.isArray(data?.data)
            ? data.data
            : initialAssignments.length
              ? initialAssignments
              : [];
      const normalizedAssignments = rawList.map(normalizeAssignment);
      setAssignments(normalizedAssignments);

      const { todayItemIds: apiTodayIds, todayMap: apiTodayMap, approvalMap: apiApprovalMap } =
        buildTodayStateFromAssignments(normalizedAssignments);
      setTodayItemIds(apiTodayIds);
      setSubmittedTodayMap(apiTodayMap);
      setApprovalByChecklist(apiApprovalMap);
    } catch (e) {
      console.error('PokaYoke fetch error:', e);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [machineId, initialAssignments]);

  useEffect(() => {
    if (!open || prevOpenRef.current) return;
    prevOpenRef.current = true;
    loadAssignments();
  }, [open, loadAssignments]);

  useEffect(() => {
    if (assignments.length === 0) {
      setSelectedChecklistId(null);
      return;
    }
    setSelectedChecklistId((prev) => {
      const ids = assignments.map((a) => String(a.checklist_id ?? a.checklist?.id ?? ''));
      if (prev && ids.includes(prev)) return prev;
      return ids[0];
    });
  }, [assignments]);

  useEffect(() => {
    setCheckpointPage(1);
  }, [selectedChecklistId]);

  /* ── Due logic ── */
  const itemIsDue = useCallback((item) => {
    if (item.has_pending_submission) return false;
    if (isRejectedCheckpoint(item)) return true;

    const submitted = submittedTodayMap[String(item.id)];
    if (submitted?.approval_status === 'approved' || submitted?.approval_status === 'pending') return false;

    if (item.is_due === true) return true;
    if (item.is_due === false) return false;

    if (item.next_due_date) {
      const today   = new Date(); today.setHours(0, 0, 0, 0);
      const dueDate = new Date(item.next_due_date); dueDate.setHours(0, 0, 0, 0);
      return today.getTime() >= dueDate.getTime();
    }

    if (todayItemIds.has(item.id)) return true;

    if ((item.frequency_type ?? '').toLowerCase() === 'condition based') return true;
    return false;
  }, [submittedTodayMap, todayItemIds]);



  useEffect(() => {
    if (!open) {
      prevOpenRef.current  = false;
      submittedRef.current = false;
      setActiveTab('1');
      setPendingResponses({});
      setSelectedChecklistId(null);
    }
  }, [open]);

  const selectedAssignment = useMemo(() => {
    if (!selectedChecklistId) return null;
    return assignments.find(
      (a) => String(a.checklist_id ?? a.checklist?.id ?? '') === selectedChecklistId
    ) ?? null;
  }, [assignments, selectedChecklistId]);

  if (!open) return null;

  const setCheckpointResponse = (checklistId, itemId, val) => {
    const cid = String(checklistId);
    const iid = String(itemId);
    setPendingResponses((prev) => ({
      ...prev,
      [cid]: { ...(prev[cid] ?? {}), [iid]: val },
    }));
  };

  const getSubmittableItems = (assignment) =>
    (assignment?.checklist?.items ?? []).filter(itemIsDue);

  const handleSubmitChecklist = async () => {
    if (!selectedAssignment || submitting) return;
    const cid = String(selectedAssignment.checklist_id ?? selectedAssignment.checklist?.id ?? '');
    const dueCheckpoints = getSubmittableItems(selectedAssignment);
    if (dueCheckpoints.length === 0) {
      message.info('No checkpoints to submit for this checklist.');
      return;
    }

    const responses = pendingResponses[cid] ?? {};
    const requiredItems = dueCheckpoints.filter((cp) => cp.is_required ?? true);
    const allRequiredDone = requiredItems.every(
      (cp) => responses[String(cp.id)] !== undefined && responses[String(cp.id)] !== ''
    );
    if (!allRequiredDone) {
      message.warning('Fill all required checkpoints before submitting.');
      return;
    }
    if (!operatorId) {
      message.error('Operator not found in session. Please log in again.');
      return;
    }

    setSubmitting(true);
    try {
      const submissions = dueCheckpoints
        .map((cp) => {
          const val = responses[String(cp.id)];
          if (val === undefined || val === null || val === '') return null;
          if (!cp.schedule_id || !cp.assignment_item_id) {
            throw new Error(`Missing schedule or assignment info for checkpoint: ${cp.item_text ?? cp.name ?? cp.id}`);
          }
          return {
            schedule_id: cp.schedule_id,
            assignment_item_id: cp.assignment_item_id,
            response_value: String(val).toLowerCase(),
            operator_comments: '',
          };
        })
        .filter(Boolean);

      const res = await fetch(`${API_BASE_URL}/pm/operator/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operator_id: Number(operatorId),
          submissions,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err?.detail;
        throw new Error(
          typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Submission failed'
        );
      }

      const newTodayMap = { ...submittedTodayMap };
      for (const cp of dueCheckpoints) {
        const val = responses[String(cp.id)];
        if (val !== undefined) {
          newTodayMap[String(cp.id)] = { response_value: String(val), approval_status: 'pending' };
        }
      }
      setSubmittedTodayMap(newTodayMap);
      setApprovalByChecklist((prev) => ({ ...prev, [cid]: 'pending' }));
      setPendingResponses((prev) => ({ ...prev, [cid]: {} }));
      submittedRef.current = true;
      message.success('Checklist submitted successfully!');
    } catch (e) {
      message.error(String(e?.message || 'Submit failed'));
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Shared TH style (matches Inventory) ── */
  const TH = {
    background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)',
    fontWeight: 'bold',
    fontSize: 12,
    color: '#374151',
    padding: '10px 14px',
    textAlign: 'left',
    borderBottom: '2px solid #1890ff',
    whiteSpace: 'nowrap',
  };

  const renderResponseCell = (cp, checklistId, editable) => {
    const iid = String(cp.id);
    const cid = String(checklistId);
    const submittedToday = submittedTodayMap[iid];
    const val = (pendingResponses[cid] ?? {})[iid];
    const type = (cp.item_type ?? '').toLowerCase();

    if (submittedToday && !editable) {
      const isRejected = submittedToday.approval_status === 'rejected';
      const isPending = submittedToday.approval_status === 'pending';
      const responseLabel = formatResponseLabel(
        submittedToday.response_value ?? cp.latest_response_value ?? cp.response_value
      );
      const color = isRejected ? '#dc2626' : isPending ? '#d97706' : '#15803d';

      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {isRejected
            ? <CloseCircleFilled style={{ color: '#ef4444', fontSize: 16 }} />
            : isPending
              ? <ClockCircleOutlined style={{ color: '#d97706', fontSize: 16 }} />
              : <CheckCircleFilled style={{ color: '#22c55e', fontSize: 16 }} />}
          <span style={{ fontSize: 12, color, fontWeight: 600 }}>
            {responseLabel ?? (isPending ? 'Pending' : '—')}
          </span>
        </div>
      );
    }

    const apiStatus = String(cp.latest_submission_status ?? '').toLowerCase();
    if (!editable && apiStatus === 'approved') {
      const responseLabel = formatResponseLabel(cp.latest_response_value ?? cp.response_value);
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <CheckCircleFilled style={{ color: '#22c55e', fontSize: 16 }} />
          <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>
            {responseLabel ?? '—'}
          </span>
        </div>
      );
    }

    if (!editable) {
      return <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>;
    }

    if (type.includes('num')) {
      return (
        <input
          type="number"
          value={val ?? ''}
          onChange={(e) => setCheckpointResponse(cid, cp.id, e.target.value)}
          placeholder={cp.expected_value ? `Expected: ${cp.expected_value}` : 'Value'}
          style={{
            width: '100%', maxWidth: 120, padding: '6px 8px', borderRadius: 6, fontSize: 12,
            border: '1.5px solid #d1d5db', outline: 'none', boxSizing: 'border-box',
          }}
        />
      );
    }

    if (type.includes('text')) {
      return (
        <input
          type="text"
          value={val ?? ''}
          onChange={(e) => setCheckpointResponse(cid, cp.id, e.target.value)}
          placeholder={cp.expected_value ? `Expected: ${cp.expected_value}` : 'Enter value'}
          style={{
            width: '100%', maxWidth: 140, padding: '6px 8px', borderRadius: 6, fontSize: 12,
            border: '1.5px solid #d1d5db', outline: 'none', boxSizing: 'border-box',
          }}
        />
      );
    }

    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
        {['yes', 'no'].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setCheckpointResponse(cid, cp.id, opt)}
            style={{
              minWidth: 52, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, border: '1.5px solid',
              borderColor: val === opt ? '#1677ff' : '#d1d5db',
              background: val === opt ? '#e6f4ff' : '#fff',
              color: val === opt ? '#1677ff' : '#6b7280',
              transition: 'all .15s',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  };

  const selectedCid = selectedAssignment
    ? String(selectedAssignment.checklist_id ?? selectedAssignment.checklist?.id ?? '')
    : '';
  const selectedItems = selectedAssignment?.checklist?.items ?? [];
  const selectedName = selectedAssignment?.checklist?.name ?? 'Checklist';
  const submittableItems = selectedAssignment ? getSubmittableItems(selectedAssignment) : [];
  const submittableIds = new Set(submittableItems.map((cp) => String(cp.id)));
  const selectedResponses = pendingResponses[selectedCid] ?? {};
  const requiredSubmittable = submittableItems.filter((cp) => cp.is_required ?? true);
  const canSubmitSelected = requiredSubmittable.every(
    (cp) => selectedResponses[String(cp.id)] !== undefined && selectedResponses[String(cp.id)] !== ''
  );
  const showSubmitBtn = submittableItems.length > 0;
  const needsRedo = submittableItems.some(isRejectedCheckpoint);

  const paginatedItems = selectedItems.slice(
    (checkpointPage - 1) * checkpointPageSize,
    checkpointPage * checkpointPageSize
  );

  const handleCheckpointPageChange = (page, pageSize) => {
    setCheckpointPage(page);
    setCheckpointPageSize(pageSize);
  };

  /* ── Split-pane preventive maintenance panel ── */
  const pmPanel = (
    <div style={{
      display: 'flex',
      height: '100%',
      minHeight: 0,
      minWidth: 0,
      background: '#f5f6fa',
      overflow: 'hidden',
      gap: 12,
      boxSizing: 'border-box',
    }}>
      {/* Left — checklist list */}
      <div style={{
        width: 240,
        minWidth: 240,
        flexShrink: 0,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e8eaed',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          fontSize: 15,
          fontWeight: 600,
          color: '#1a1a2e',
          flexShrink: 0,
        }}>
          Checklist
        </div>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>
          ) : assignments.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              No checklists assigned.
            </div>
          ) : (
            assignments.map((assignment, idx) => {
              const cid = String(assignment.checklist_id ?? assignment.checklist?.id ?? idx);
              const cName = assignment.checklist?.name ?? `Checklist #${cid}`;
              const active = cid === selectedChecklistId;
              const dueCount = (assignment.checklist?.items ?? []).filter(itemIsDue).length;

              return (
                <div
                  key={cid}
                  onClick={() => setSelectedChecklistId(cid)}
                  style={{
                    padding: '10px 14px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    borderBottom: '1px solid #f0f0f0',
                    background: active ? '#e6f4ff' : 'transparent',
                    borderRadius: active ? 8 : 0,
                    margin: active ? '2px 6px' : 0,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#f5f8ff'; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: '#1a1a2e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {cName}
                  </div>
                  {dueCount > 0 && (
                    <div style={{ fontSize: 11, color: '#1677ff', marginTop: 2, fontWeight: 600 }}>
                      {dueCount} due
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Right — selected checklist detail */}
      <div style={{
        flex: 1,
        background: '#fff',
        borderRadius: 10,
        border: '1px solid #e8eaed',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
        minHeight: 0,
      }}>
        {!selectedAssignment ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#8c8c8c', fontSize: 14,
          }}>
            Select a checklist from the left
          </div>
        ) : (
          <>
            <div style={{
              padding: '12px 20px 8px',
              borderBottom: '1px solid #f0f0f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
              flexWrap: 'wrap',
            }}>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', margin: 0, flex: '1 1 auto', minWidth: 160, lineHeight: 1.2 }}>
                {selectedName}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 13, color: '#595959' }}>Total checkpoints</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 28, height: 28, borderRadius: '50%',
                  background: '#e6f4ff', color: '#1677ff', fontWeight: 700, fontSize: 13,
                  border: '1px solid #91caff',
                }}>
                  {selectedItems.length}
                </span>
                <Button
                  icon={<ReloadOutlined />}
                  size="small"
                  loading={loading}
                  onClick={loadAssignments}
                  style={{ borderRadius: 7 }}
                />
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ ...TH, width: 56, textAlign: 'center' }}>SL No</th>
                      <th style={{ ...TH, width: '32%' }}>Checkpoint Name</th>
                      <th style={{ ...TH, width: '20%' }}>Frequency</th>
                      <th style={{ ...TH, width: '12%', textAlign: 'center' }}>Expected</th>
                      <th style={{ ...TH, width: '26%', textAlign: 'center' }}>Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                          No checkpoints in this checklist.
                        </td>
                      </tr>
                    ) : (
                      paginatedItems.map((cp, ci) => {
                        const fc = freqColor(cp);
                        const required = cp.is_required ?? true;
                        const editable = submittableIds.has(String(cp.id));
                        const slNo = (checkpointPage - 1) * checkpointPageSize + ci + 1;

                        return (
                          <tr
                            key={cp.id ?? ci}
                            style={{ borderBottom: '1px solid #f0f0f0', background: '#fff' }}
                          >
                            <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle', color: '#6b7280', fontWeight: 600 }}>
                              {slNo}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {required && editable && (
                                  <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>
                                )}
                                <span style={{ color: '#111827', fontWeight: 500 }}>{cp.item_text ?? cp.name}</span>
                              </div>
                              {cp.remarks && (
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{cp.remarks}</div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, color: fc.color, background: fc.bg,
                                border: `1px solid ${fc.border}`, borderRadius: 4, padding: '2px 8px',
                              }}>
                                {freqIcon(cp)} {freqLabel(cp)}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center', verticalAlign: 'middle', color: '#374151', fontWeight: 600 }}>
                              {cp.expected_value ?? '—'}
                            </td>
                            <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                              {renderResponseCell(cp, selectedCid, editable)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {showSubmitBtn && (
                <div style={{
                  padding: '12px 20px',
                  borderTop: '1px solid #f0f0f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  flexShrink: 0,
                  background: '#fff',
                }}>
                  <Button
                    type="primary"
                    danger={needsRedo}
                    loading={submitting}
                    disabled={!canSubmitSelected}
                    onClick={handleSubmitChecklist}
                    style={{ borderRadius: 7, minWidth: 100 }}
                  >
                    {needsRedo ? 'Redo' : 'Submit'}
                  </Button>
                </div>
              )}

              {selectedItems.length > 0 && (
                <Pagination
                  current={checkpointPage}
                  pageSize={checkpointPageSize}
                  total={selectedItems.length}
                  showSizeChanger
                  pageSizeOptions={[5, 10, 15, 20, 50]}
                  showTotal={(total, range) => `${range[0]}-${range[1]} of ${total} items`}
                  size="small"
                  onChange={handleCheckpointPageChange}
                  style={{
                    padding: '8px 20px',
                    margin: 0,
                    flexShrink: 0,
                    borderTop: '1px solid #f0f0f0',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  /* ── Legend ── */
  const legend = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0 12px', flexWrap: 'wrap', flexShrink: 0 }}>
      {[
        { icon: <CheckCircleFilled style={{ color: '#22c55e', fontSize: 13 }} />,     label: 'Submitted today' },
        { icon: <CloseCircleFilled  style={{ color: '#ef4444', fontSize: 13 }} />,     label: 'Rejected' },
        { icon: <CalendarOutlined   style={{ fontSize: 13, color: '#0284c7' }} />,     label: 'Time based' },
        { icon: <ThunderboltOutlined style={{ fontSize: 13, color: '#7c3aed' }} />,    label: 'Usage based' },
        { icon: <ClockCircleOutlined style={{ fontSize: 13, color: '#059669' }} />,    label: 'Condition based' },
        { icon: <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>,           label: 'Required' },
      ].map(({ icon, label }) => (
        <span key={label} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          {icon} {label}
        </span>
      ))}
    </div>
  );

  /* ── Content ── */
  const content = (
    <>
      <style>{`
        .pm-checklist-tabs { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
        .pm-checklist-tabs .ant-tabs-nav { flex-shrink: 0; margin-bottom: 8px; }
        .pm-checklist-tabs .ant-tabs-content-holder { flex: 1; min-height: 0; overflow: hidden; }
        .pm-checklist-tabs .ant-tabs-content { height: 100%; }
        .pm-checklist-tabs .ant-tabs-tabpane { height: 100%; overflow: hidden; }
      `}</style>
      {!isPage && (
        <div style={{ background: '#1e3a5f', padding: '11px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircleOutlined style={{ color: '#fff', fontSize: 20 }} />
            <span style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Preventive Maintenance</span>
          </div>
          <button
            onClick={() => onClose(submittedRef.current)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, fontSize: 18 }}
          >
            <CloseOutlined />
          </button>
        </div>
      )}

      <div style={{
        padding: isPage ? '0 0 8px' : '12px 16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        boxSizing: 'border-box',
      }}>
        <div style={{
          background: '#fff',
          border: '1px solid #e8eaed',
          borderRadius: 10,
          padding: '14px 16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Tabs
            className="pm-checklist-tabs"
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: '1',
                label: 'Preventive Maintenance',
                children: (
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                    {legend}
                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      {pmPanel}
                    </div>
                  </div>
                ),
              },
              {
                key: '2',
                label: 'Checklist History',
                children: (
                  <div style={{ height: '100%', overflow: 'auto', minHeight: 0 }}>
                    <PokayokeHistory machineId={machineId} />
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </>
  );

  if (isPage) {
    return (
      <div style={{
        width: '100%',
        height: 'calc(100vh - 100px)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {content}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onCancel={() => onClose(submittedRef.current)}
      footer={null}
      width={1100}
      closable={false}
      centered
      styles={{
        content: { padding: 0, borderRadius: 10, overflow: 'hidden' },
        body: {
          overflow: 'hidden',
          padding: 0,
          height: 'calc(100vh - 120px)',
          maxHeight: 'calc(100vh - 120px)',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {content}
    </Modal>
  );
};

export default PokaYokeChecklist;