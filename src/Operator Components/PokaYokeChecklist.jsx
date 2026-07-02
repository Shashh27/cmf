import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Modal, Button, Typography, message, Tabs, Tooltip, Spin, Drawer,
} from 'antd';
import {
  CheckCircleOutlined, CloseOutlined, CheckCircleFilled,
  CloseCircleFilled, InfoCircleOutlined, ExclamationCircleOutlined,
  CalendarOutlined, ClockCircleOutlined, ThunderboltOutlined,
  PlusOutlined, MinusOutlined,
} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import PokayokeHistory from './PokayokeHistory.jsx';

const { Title, Text } = Typography;

/* ─── IST timestamp helper ─────────────────────────────────────────────── */
const nowIST = () => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const ms = String(new Date().getMilliseconds()).padStart(3, '0');
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${ms}`;
};

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

/* ─── Conformance checker ────────────────────────────────────────────────── */
const getConformance = (cp, val) => {
  if (val === undefined || val === null || val === '') return null;
  const expected = cp.expected_value ?? null;
  const typeRaw  = (cp.item_type ?? '').toLowerCase();
  const truthy   = new Set(['true', 'yes', 'y', '1', 'on']);
  const falsy    = new Set(['false', 'no', 'n', '0', 'off']);

  if (typeRaw.includes('bool')) {
    const vBool = truthy.has(String(val).toLowerCase()) ? true
                : falsy.has(String(val).toLowerCase())  ? false : null;
    const e     = expected != null ? String(expected).toLowerCase() : 'true';
    const eBool = truthy.has(e) ? true : falsy.has(e) ? false : true;
    return vBool !== null && vBool === eBool;
  }
  if (typeRaw.includes('num')) {
    const vNum   = parseFloat(String(val));
    const expStr = String(expected ?? '').trim();
    if (Number.isNaN(vNum)) return false;
    if (expStr.startsWith('<=')) return vNum <= parseFloat(expStr.slice(2));
    if (expStr.startsWith('>=')) return vNum >= parseFloat(expStr.slice(2));
    if (expStr.startsWith('<'))  return vNum <  parseFloat(expStr.slice(1));
    if (expStr.startsWith('>'))  return vNum >  parseFloat(expStr.slice(1));
    if (expStr.includes('-')) {
      const [mn, mx] = expStr.split('-').map(Number);
      return vNum >= mn && vNum <= mx;
    }
    return vNum === parseFloat(expStr);
  }
  return expected != null &&
    String(val).toLowerCase().trim() === String(expected).toLowerCase().trim();
};

/* ─── Submit Drawer ─────────────────────────────────────────────────────── */
const SubmitDrawer = ({
  open, onClose,
  checklistName, dueCheckpoints,
  machineId, operatorId, checklistId, assignmentId,
  onSuccess,
}) => {
  const [pendingResponses, setPendingResponses] = useState({});
  const [submitting, setSubmitting]             = useState(false);
  const [comments, setComments]                 = useState('');

  useEffect(() => {
    if (open) { setPendingResponses({}); setComments(''); }
  }, [open]);

  const setResponse = (itemId, val) =>
    setPendingResponses((prev) => ({ ...prev, [String(itemId)]: val }));

  const requiredItems   = dueCheckpoints.filter((cp) => cp.is_required ?? true);
  const allRequiredDone = requiredItems.every((cp) => pendingResponses[String(cp.id)] !== undefined);

  const handleSubmit = async () => {
    if (!allRequiredDone || submitting) return;
    setSubmitting(true);
    try {
      const hasNonConforming = dueCheckpoints.some(
        (cp) => (cp.is_required ?? true) && getConformance(cp, pendingResponses[String(cp.id)]) === false
      );

      // Always create a new log
      const logPayload = {
        checklist_id:    Number(checklistId),
        machine_id:      machineId,
        assignment_id:   assignmentId ?? null,
        operator_id:     operatorId,
        comments,
        completed_at:    nowIST(),
        all_items_passed: !hasNonConforming,
        read: false,
        operator_acknowledged: false,
        supervisor_acknowledged: false,
      };

      const logRes = await fetch(`${API_BASE_URL}/pokayoke-completed-logs/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(logPayload),
      });

      if (!logRes.ok) {
        const err = await logRes.json().catch(() => ({}));
        throw new Error(err?.detail ? JSON.stringify(err.detail) : 'Log creation failed');
      }

      const createdLog = await logRes.json();
      const completedLogId = createdLog?.id ?? createdLog?.log_id;
      if (!completedLogId) throw new Error('No log ID returned from server');

      await Promise.all(
        dueCheckpoints.map(async (cp) => {
          const val = pendingResponses[String(cp.id)];
          if (val === undefined || val === null) return;
          const isConf = getConformance(cp, val);
          await fetch(`${API_BASE_URL}/pokayoke-completed-logs/item-responses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({
              completed_log_id: completedLogId,
              item_id:          cp.id,
              response_value:   String(val),
              is_confirming:    Boolean(isConf),
              timestamp:        nowIST(),
            }),
          });
        })
      );

      message.success('Checklist submitted successfully!');
      onSuccess(pendingResponses, dueCheckpoints);
      onClose();
    } catch (e) {
      message.error(String(e?.message || 'Submit failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
            {checklistName}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>
            {dueCheckpoints.length} checkpoint{dueCheckpoints.length !== 1 ? 's' : ''} to submit — required items marked <span style={{ color: '#ef4444' }}>*</span>
          </div>
        </div>
      }
      width={480}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button
            type="primary"
            disabled={!allRequiredDone}
            loading={submitting}
            onClick={handleSubmit}
          >
            Submit
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {dueCheckpoints.map((cp, i) => {
          const id       = String(cp.id);
          const val      = pendingResponses[id];
          const required = cp.is_required ?? true;
          const type     = (cp.item_type ?? '').toLowerCase();
          const expected = cp.expected_value ?? null;
          const conf     = getConformance(cp, val);

          return (
            <div key={id} style={{
              border: '1px solid',
              borderColor: conf === false ? '#fca5a5' : conf === true ? '#86efac' : '#e5e7eb',
              borderRadius: 8, padding: '12px 14px',
              background:   conf === false ? '#fff5f5' : conf === true ? '#f0fdf4' : '#fff',
              transition: 'all .2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginRight: 6 }}>#{i + 1}</span>
                  {required && <span style={{ color: '#ef4444', fontWeight: 700, marginRight: 4 }}>*</span>}
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#111827' }}>{cp.item_text ?? cp.name}</span>
                </div>
                {conf === true  && <CheckCircleFilled style={{ color: '#22c55e', fontSize: 16, flexShrink: 0 }} />}
                {conf === false && <CloseCircleFilled  style={{ color: '#ef4444', fontSize: 16, flexShrink: 0 }} />}
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: '#0284c7', background: '#e0f2fe',
                  border: '1px solid #7dd3fc', borderRadius: 4, padding: '1px 7px',
                }}>
                  {freqIcon(cp)} {freqLabel(cp)}
                </span>
                {expected && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: '#374151', background: '#f3f4f6',
                    border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 7px',
                  }}>
                    <InfoCircleOutlined style={{ fontSize: 10 }} />
                    Expected: <strong>{expected}</strong>
                  </span>
                )}
              </div>

              {cp.remarks && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{cp.remarks}</div>
              )}

              {type.includes('bool') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['yes', 'no'].map((opt) => (
                    <button key={opt} onClick={() => setResponse(cp.id, opt)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, border: '2px solid',
                      borderColor: val === opt ? (opt === 'yes' ? '#22c55e' : '#ef4444') : '#e5e7eb',
                      background:  val === opt ? (opt === 'yes' ? '#f0fdf4' : '#fff5f5') : '#fafafa',
                      color:       val === opt ? (opt === 'yes' ? '#15803d' : '#dc2626') : '#6b7280',
                      transition: 'all .15s',
                    }}>
                      {opt === 'yes' ? '✓ Yes' : '✗ No'}
                    </button>
                  ))}
                </div>
              )}

              {type.includes('num') && (
                <input type="number" value={val ?? ''} onChange={(e) => setResponse(cp.id, e.target.value)}
                  placeholder={expected ? `Expected: ${expected}` : 'Enter value'}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
                    border: `1.5px solid ${conf === false ? '#fca5a5' : conf === true ? '#86efac' : '#d1d5db'}`,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              )}

              {type.includes('text') && (
                <input type="text" value={val ?? ''} onChange={(e) => setResponse(cp.id, e.target.value)}
                  placeholder={expected ? `Expected: ${expected}` : 'Enter value'}
                  style={{
                    width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
                    border: `1.5px solid ${conf === false ? '#fca5a5' : conf === true ? '#86efac' : '#d1d5db'}`,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              )}

              {!type.includes('bool') && !type.includes('num') && !type.includes('text') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['yes', 'no'].map((opt) => (
                    <button key={opt} onClick={() => setResponse(cp.id, opt)} style={{
                      flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, border: '2px solid',
                      borderColor: val === opt ? (opt === 'yes' ? '#22c55e' : '#ef4444') : '#e5e7eb',
                      background:  val === opt ? (opt === 'yes' ? '#f0fdf4' : '#fff5f5') : '#fafafa',
                      color:       val === opt ? (opt === 'yes' ? '#15803d' : '#dc2626') : '#6b7280',
                      transition: 'all .15s',
                    }}>
                      {opt === 'yes' ? '✓ Yes' : '✗ No'}
                    </button>
                  ))}
                </div>
              )}

              {conf === false && (
                <div style={{ marginTop: 8, fontSize: 11, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ExclamationCircleOutlined /> Non-conforming — supervisor review required
                </div>
              )}
            </div>
          );
        })}

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Comments (optional)</div>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={3}
            placeholder="Add any observations or remarks…"
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 6, fontSize: 13,
              border: '1.5px solid #d1d5db', outline: 'none', resize: 'vertical',
              boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>

        {!allRequiredDone && (
          <div style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#854d0e' }}>
            <ExclamationCircleOutlined style={{ marginRight: 6 }} />
            Fill all required (<span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>) checkpoints to submit.
          </div>
        )}
      </div>
    </Drawer>
  );
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
  const [latestResponseMap, setLatestResponseMap] = useState({});
  const [submittedTodayMap, setSubmittedTodayMap] = useState({});
  const [approvalByChecklist, setApprovalByChecklist] = useState({});
  const [activeTab, setActiveTab]                 = useState('1');
  const [drawerOpen, setDrawerOpen]               = useState(false);
  const [drawerData, setDrawerData]               = useState(null);
  const [expandedIds, setExpandedIds]             = useState(new Set());
  const [todayItemIds, setTodayItemIds]         = useState(new Set());

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

  const machineMeta = useMemo(() => {
    try {
      const m = JSON.parse(localStorage.getItem('selectedMachine') || 'null');
      return {
        make:  m?.make  ?? m?.machine_make  ?? null,
        model: m?.model ?? m?.machine_model ?? null,
        name:  m?.name  ?? m?.machine_name  ?? null,
        code:  m?.code  ?? m?.machine_code  ?? null,
      };
    } catch { return {}; }
  }, []);

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

  const currentDate  = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear  = currentDate.getFullYear();
  const monthLabel   = currentDate.toLocaleString('default', { month: 'long' });

  /* ── Data fetch ── */
  useEffect(() => {
    const run = async () => {
      if (!open || prevOpenRef.current) return;
      prevOpenRef.current = true;
      if (!machineId) { setAssignments([]); return; }
      setLoading(true);

      try {
        let rawAssignments = initialAssignments;
        if (!rawAssignments.length) {
          const res  = await fetch(
            `${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`,
            { headers: { accept: 'application/json' } }
          );
          const data = await res.json();
          rawAssignments = Array.isArray(data) ? data : [];
        }
        setAssignments(rawAssignments);

        // Also fetch today's assignments to determine which checkpoints are due today
        try {
          const todayRes = await fetch(
            `${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/today-assignments`,
            { headers: { accept: 'application/json' } }
          );
          const todayData = await todayRes.json();
          const todayAssignments = Array.isArray(todayData) ? todayData : [];

          // The endpoint returns the FULL checklist (all items), not just
          // the ones due today — so we still have to filter by next_due_date
          // ourselves. Only keep items whose next_due_date's calendar date
          // matches today's calendar date.
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);

          const todayItemIds = new Set();
          todayAssignments.forEach(assignment => {
            if (assignment.checklist?.items) {
              assignment.checklist.items.forEach(item => {
                if (!item.next_due_date) return; // no due date -> not "due today"
                const due = new Date(item.next_due_date);
                // Include items due today OR overdue (past due)
                if (due < todayEnd) {
                  todayItemIds.add(item.id);
                }
              });
            }
          });

          // Store today's item IDs for filtering submit buttons
          setTodayItemIds(todayItemIds);
        } catch (e) {
          console.warn('Could not fetch today assignments:', e);
          setTodayItemIds(new Set());
        }

        try {
          const lr      = await fetch(
            `${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs/simple`,
            { headers: { accept: 'application/json' } }
          );
          const rawLogs = await lr.json();

          // Sort newest-first so that when multiple logs exist for the same
          // checklist/item, the most recent one wins when we do `if (!map[key])`.
          const logs = (Array.isArray(rawLogs) ? rawLogs : [])
            .slice()
            .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const respMap  = {};
          const todayMap = {};
          const apMap    = {};

          for (const log of logs) {
            const cid     = String(log.checklist_id);
            const logDate = new Date(log.completed_at);
            logDate.setHours(0, 0, 0, 0);
            const isToday = logDate.getTime() === today.getTime();

            // FIX: only treat a checklist as having a "status" (approved /
            // rejected / pending) if that status came from a log completed
            // TODAY. Previously this ran unconditionally, so an old log
            // (e.g. yesterday's "approved") could keep showing as today's
            // status and would incorrectly disable the Submit button.
            if (isToday && !apMap[cid]) apMap[cid] = log.overall_status;

            for (const item of (log.items ?? [])) {
              const key = String(item.item_id);
              // latestResponseMap intentionally stays all-time — it's only
              // used as a fallback to compute next-due-dates for time-based
              // frequencies, so history is fine here.
              if (!respMap[key]) {
                respMap[key] = {
                  response_value:  item.response_value,
                  approval_status: item.approval_status,
                  completed_at:    log.completed_at,
                };
              }
              if (isToday && !todayMap[key]) {
                todayMap[key] = {
                  response_value:  item.response_value,
                  approval_status: item.approval_status,
                };
              }
            }
          }

          setLatestResponseMap(respMap);
          setSubmittedTodayMap(todayMap);
          setApprovalByChecklist(apMap);
        } catch (e) {
          console.warn('Could not fetch completed logs:', e);
        }
      } catch (e) {
        console.error('PokaYoke fetch error:', e);
        setAssignments([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [open, machineId]);
  /* ── Due logic ── */
  const itemIsDue = useCallback((item) => {
    if (submittedTodayMap[String(item.id)]) return false;

    // PRIMARY: the item itself carries next_due_date — trust that first.
    // Only an item whose next_due_date's calendar date equals today counts
    // as due; a null/future/past next_due_date means it is NOT due today.
    if (item.next_due_date) {
      const today   = new Date(); today.setHours(0, 0, 0, 0);
      const dueDate = new Date(item.next_due_date); dueDate.setHours(0, 0, 0, 0);
      return today.getTime() >= dueDate.getTime();
    }

    // Use todayItemIds from today-assignments endpoint to check if item is due today
    if (todayItemIds.has(item.id)) return true;

    // Fallback to checking next_due_date from latest response
    const latest = latestResponseMap[String(item.id)];
    // If no previous response exists (newly assigned checklist), consider it due
    if (!latest) return true;

    if (latest.next_due_date) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dueDate = new Date(latest.next_due_date); dueDate.setHours(0, 0, 0, 0);
      return today.getTime() >= dueDate.getTime();
    }
    // Fallback to manual calculation for condition based or time based without next_due_date
    if (item.frequency_type === 'Condition Based') return true;
    if (item.frequency_type === 'Time Based' && item.interval_value && item.interval_unit) {
      const today2   = new Date(); today2.setHours(0, 0, 0, 0);
      const lastDate = new Date(latest.completed_at); lastDate.setHours(0, 0, 0, 0);
      const unit     = (item.interval_unit ?? '').toLowerCase();
      const val      = item.interval_value;
      const nextDue  = new Date(lastDate);
      if (unit.startsWith('day'))        nextDue.setDate(nextDue.getDate() + val);
      else if (unit.startsWith('week'))  nextDue.setDate(nextDue.getDate() + val * 7);
      else if (unit.startsWith('month')) nextDue.setMonth(nextDue.getMonth() + val);
      else if (unit.startsWith('year'))  nextDue.setFullYear(nextDue.getFullYear() + val);
      return today2 >= nextDue;
    }
    return false;
  }, [submittedTodayMap, latestResponseMap, todayItemIds]);



  useEffect(() => {
    if (!open) {
      prevOpenRef.current  = false;
      submittedRef.current = false;
      setActiveTab('1');
      setExpandedIds(new Set());
    }
  }, [open]);

  if (!open) return null;

  /* ── Toggle expand ── */
  const toggleExpand = (cid) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(cid) ? next.delete(cid) : next.add(cid);
      return next;
    });
  };

  /* ── Due logic ── */

  /* ── Open submit drawer ── */
  const openSubmitDrawer = (assignment, e) => {
    e?.stopPropagation();
    const cid   = String(assignment?.checklist_id ?? assignment?.checklist?.id ?? assignment?.id);
    const name  = assignment?.checklist?.name ?? `Checklist #${cid}`;
    const items = assignment?.checklist?.items ?? [];
    const status = approvalByChecklist[cid];

    // If rejected, show rejected items for resubmission
    if (status === 'rejected') {
      const rejectedItems = items.filter(item => {
        const response = submittedTodayMap[String(item.id)];
        return response && response.approval_status === 'rejected';
      });
      if (rejectedItems.length === 0) {
        message.info('No rejected items found for resubmission.');
        return;
      }
      setDrawerData({
        checklistId: cid,
        name, assignment,
        dueCheckpoints: rejectedItems
      });
      setDrawerOpen(true);
      return;
    }

    // Normal flow: show due items
    const dueToday = items.filter(itemIsDue);
    if (dueToday.length === 0) {
      message.info('All checkpoints for this checklist are either submitted today or not yet due.');
      return;
    }
    setDrawerData({ checklistId: cid, name, assignment, dueCheckpoints: dueToday });
    setDrawerOpen(true);
  };

  /* ── After drawer submit ── */
  const handleDrawerSuccess = (submittedResponses, dueCheckpoints) => {
    const newTodayMap = { ...submittedTodayMap };
    for (const cp of dueCheckpoints) {
      const val = submittedResponses[String(cp.id)];
      if (val !== undefined) {
        newTodayMap[String(cp.id)] = { response_value: String(val), approval_status: 'pending' };
      }
    }
    setSubmittedTodayMap(newTodayMap);
    if (drawerData?.checklistId) {
      setApprovalByChecklist((prev) => ({ ...prev, [String(drawerData.checklistId)]: 'pending' }));
    }
    submittedRef.current = true;
  };

  /* ── Status badge ── */
  const getStatusBadge = (assignment) => {
    const cid    = String(assignment?.checklist_id ?? assignment?.checklist?.id ?? '');
    const status = approvalByChecklist[cid];
    const items  = assignment?.checklist?.items ?? [];
    const doneCount = items.filter((it) => !!submittedTodayMap[String(it.id)]).length;
    const dueCount  = items.filter((it) => itemIsDue(it)).length;

    if (status === 'approved') return { label: 'Approved',       color: '#15803d', bg: '#dcfce7', border: '#86efac' };
    if (status === 'rejected') return { label: 'Rejected',       color: '#dc2626', bg: '#fee2e2', border: '#fca5a5' };
    if (status === 'pending')  return { label: 'Pending Review', color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
    if (doneCount > 0)         return { label: `${doneCount}/${items.length} done`, color: '#d97706', bg: '#fef3c7', border: '#fcd34d' };
    return null;
  };

  /* ── CMF header ── */
  const cmfHeader = (
    <div style={{ border: '2px solid #1e3a5f', marginBottom: 0, background: '#fff' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f' }}>
        <div style={{
          width: 180, minWidth: 180, padding: '10px 16px',
          borderRight: '1px solid #1e3a5f',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img
            src="/src/assets/cmtis.png" alt="CMTI Logo"
            style={{ maxWidth: 120, maxHeight: 48, objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'block'; }}
          />
          <span style={{ display: 'none', fontWeight: 900, fontSize: 20, color: '#1e3a5f', fontStyle: 'italic' }}>cmti</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 16px' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#1e3a5f', letterSpacing: 0.5 }}>CENTRAL MANUFACTURING FACILITY (CMF)</div>
          <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>ISO 9001-2015</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginTop: 4, borderTop: '1px solid #e5e7eb', paddingTop: 4, width: '100%', textAlign: 'center' }}>
            Preventive Maintenance Checklist
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', borderTop: '1px solid #d1d5db' }}>
        {[
          { label: 'Machine',    value: [machineMeta.make, machineMeta.model].filter(Boolean).join(' — ') || machineMeta.name || `ID ${machineId}` },
          // { label: 'Machine ID', value: machineMeta.code || machineId || '—' },
          { label: 'Month',      value: monthLabel },
          { label: 'Year',       value: currentYear },
          { label: 'Location',   value: 'Workshop' },
        ].map(({ label, value }, i, arr) => (
          <div key={label} style={{
            flex: label === 'Machine' ? 2 : 1,
            padding: '6px 12px',
            borderRight: i < arr.length - 1 ? '1px solid #d1d5db' : 'none',
            fontSize: 12,
          }}>
            <span style={{ fontWeight: 700 }}>{label}:</span>
            <span style={{ marginLeft: 4, color: '#1d4ed8', textDecoration: 'underline' }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );

  /* ── Shared TH style ── */
  const TH = {
    background: '#f3f4f6', fontWeight: 700, fontSize: 12,
    color: '#374151', padding: '10px 14px', textAlign: 'left',
    borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap',
  };

  /* ── Main expandable table ── */
  const mainTable = (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 48, textAlign: 'center' }}></th>
            <th style={{ ...TH, width: 200 }}>Checklist Name</th>
            <th style={{ ...TH, textAlign: 'center', width: 120 }}>Check Points</th>
            <th style={{ ...TH, textAlign: 'center', width: 180 }}>Status</th>
            <th style={{ ...TH, textAlign: 'center', width: 160 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} style={{ padding: 48, textAlign: 'center' }}>
                <Spin size="large" />
              </td>
            </tr>
          ) : assignments.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                No checklists assigned to this machine.
              </td>
            </tr>
          ) : (
            assignments.map((assignment, ai) => {
              const cid      = String(assignment?.checklist_id ?? assignment?.checklist?.id ?? ai);
              const cName    = assignment?.checklist?.name ?? `Checklist #${cid}`;
              const items    = assignment?.checklist?.items ?? [];
              const badge    = getStatusBadge(assignment);
              const expanded = expandedIds.has(cid);
              const dueToday = items.filter(itemIsDue);
              const allDone  = dueToday.length === 0 && items.length > 0;
              const apStatus = approvalByChecklist[cid];
              const canSubmit = !allDone && !['approved', 'pending'].includes(apStatus);

              return (
                <React.Fragment key={cid}>
                  {/* ── Checklist row — fully clickable ── */}
                  <tr
                    onClick={() => toggleExpand(cid)}
                    style={{
                      borderBottom: expanded ? 'none' : '1px solid #e5e7eb',
                      background: expanded ? '#f0f4ff' : ai % 2 === 0 ? '#fff' : '#fafafa',
                      transition: 'background .15s',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                    onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = '#f5f7ff'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = expanded ? '#f0f4ff' : ai % 2 === 0 ? '#fff' : '#fafafa'; }}
                  >
                    {/* Expand toggle button */}
                    <td style={{ textAlign: 'center', padding: '12px 0', verticalAlign: 'middle' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleExpand(cid); }}
                        style={{
                          width: 26, height: 26, borderRadius: 6, border: '1.5px solid #d1d5db',
                          background: expanded ? '#1e3a5f' : '#fff',
                          color: expanded ? '#fff' : '#374151',
                          cursor: 'pointer', display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 700, transition: 'all .15s',
                        }}
                      >
                        {expanded ? <MinusOutlined style={{ fontSize: 11 }} /> : <PlusOutlined style={{ fontSize: 11 }} />}
                      </button>
                    </td>

                    {/* Name */}
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: '#111827', verticalAlign: 'middle' }}>
                      {cName}
                    </td>

                    {/* Count */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <span style={{
                        display: 'inline-block', minWidth: 32, padding: '2px 10px',
                        borderRadius: 20, background: '#e0f2fe', color: '#0369a1',
                        fontWeight: 700, fontSize: 12, border: '1px solid #bae6fd',
                      }}>
                        {items.length}
                      </span>
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {badge ? (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20,
                          background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                        }}>
                          {badge.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>—</span>
                      )}
                    </td>

                    {/* Fill & Submit */}
                    <td style={{ padding: '12px 14px', textAlign: 'center', verticalAlign: 'middle' }}>
                      {apStatus === 'rejected' ? (
                        <Button
                          size="small"
                          type="primary"
                          danger
                          style={{ borderRadius: 16, fontSize: 12, height: 28, paddingInline: 14 }}
                          onClick={(e) => openSubmitDrawer(assignment, e)}
                        >
                          Resubmit
                        </Button>
                      ) : canSubmit ? (
                        <Button
                          size="small"
                          type="primary"
                          style={{ borderRadius: 16, fontSize: 12, height: 28, paddingInline: 14 }}
                          onClick={(e) => openSubmitDrawer(assignment, e)}
                        >
                          Fill &amp; Submit
                          {dueToday.length > 0 && (
                            <span style={{
                              marginLeft: 6, background: 'rgba(255,255,255,0.25)',
                              borderRadius: 10, padding: '0 6px', fontSize: 11,
                            }}>
                              {dueToday.length}
                            </span>
                          )}
                        </Button>
                      ) : (
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>
                          {allDone ? 'All done' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* ── Expanded checkpoint rows ── */}
                  {expanded && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0, borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ background: '#f8faff', borderTop: '1px solid #e0e7ff' }}>
                          {items.length === 0 ? (
                            <div style={{ padding: '16px 56px', color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
                              No checkpoints in this checklist.
                            </div>
                          ) : (
                            <div style={{ fontSize: 12 }}>
                              {/* Inner header */}
                              <div style={{
                                display: 'flex', alignItems: 'center',
                                background: '#eef2ff', borderBottom: '1px solid #e5e7eb',
                                padding: '7px 0',
                              }}>
                                <div style={{ width: 48, flexShrink: 0, textAlign: 'center', fontSize: 11, color: '#6b7280', fontWeight: 700 }}>#</div>
                                <div style={{ flex: 1, minWidth: 0, maxWidth: 300, padding: '0 14px', fontSize: 11, color: '#6b7280', fontWeight: 700 }}>Checkpoint</div>
                                <div style={{ width: 140, flexShrink: 0, padding: '0 14px', fontSize: 11, color: '#6b7280', fontWeight: 700 }}>Frequency</div>
                                <div style={{ width: 70, flexShrink: 0, textAlign: 'center', fontSize: 11, color: '#6b7280', fontWeight: 700 }}>Today</div>
                              </div>

                              {/* Inner rows */}
                              {items.map((cp, ci) => {
                                const submittedToday = submittedTodayMap[String(cp.id)];
                                const required       = cp.is_required ?? true;
                                const fc             = freqColor(cp);

                                return (
                                  <div key={cp.id ?? ci} style={{
                                    display: 'flex', alignItems: 'center',
                                    borderBottom: ci < items.length - 1 ? '1px solid #e5e7eb' : 'none',
                                    background: ci % 2 === 0 ? '#fff' : '#f8faff',
                                    minHeight: 40,
                                  }}>
                                    {/* Serial */}
                                    <div style={{ width: 48, flexShrink: 0, textAlign: 'center', color: '#9ca3af', fontWeight: 600, padding: '8px 0' }}>
                                      {ci + 1}
                                    </div>

                                    {/* Checkpoint name */}
                                    <div style={{ flex: 1, minWidth: 0, padding: '8px 14px', color: '#111827' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                        {required && <span style={{ color: '#ef4444', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>*</span>}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {cp.item_text ?? cp.name}
                                        </span>
                                      </div>
                                      {cp.remarks && (
                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {cp.remarks}
                                        </div>
                                      )}
                                    </div>

                                    {/* Frequency pill */}
                                    <div style={{ width: 140, flexShrink: 0, padding: '8px 14px' }}>
                                      <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        fontSize: 11, color: fc.color, background: fc.bg,
                                        border: `1px solid ${fc.border}`, borderRadius: 4,
                                        padding: '2px 8px', whiteSpace: 'nowrap',
                                      }}>
                                        {freqIcon(cp)} {freqLabel(cp)}
                                      </span>
                                    </div>

                                    {/* Today status icon */}
                                    <div style={{ width: 70, flexShrink: 0, textAlign: 'center', padding: '8px 0' }}>
                                      {submittedToday ? (
                                        submittedToday.approval_status === 'rejected'
                                          ? <CloseCircleFilled style={{ color: '#ef4444', fontSize: 15 }} />
                                          : <CheckCircleFilled style={{ color: '#22c55e', fontSize: 15 }} />
                                      ) : (
                                        <span style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid #d1d5db', display: 'inline-block', verticalAlign: 'middle' }} />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );

  /* ── Legend ── */
  const legend = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '0 0 12px', flexWrap: 'wrap' }}>
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
      {!isPage && (
        <div style={{ background: '#1e3a5f', padding: '11px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

      <div style={{ padding: isPage ? 0 : '16px 20px' }}>
        <div style={{ marginBottom: 14 }}>{cmfHeader}</div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.05)' }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: '1',
                label: 'Preventive Maintenance',
                children: <>{legend}{mainTable}</>,
              },
              {
                key: '2',
                label: 'Checklist History',
                children: <PokayokeHistory machineId={machineId} />,
              },
            ]}
          />
        </div>
      </div>

      {drawerData && (
        <SubmitDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          checklistName={drawerData.name}
          dueCheckpoints={drawerData.dueCheckpoints}
          machineId={machineId}
          operatorId={operatorId}
          checklistId={drawerData.checklistId}
          assignmentId={drawerData.assignment?.id ?? null}
          onSuccess={handleDrawerSuccess}
        />
      )}
    </>
  );

  if (isPage) return <div style={{ padding: 24, width: '100%' }}>{content}</div>;

  return (
    <Modal
      open={open}
      onCancel={() => onClose(submittedRef.current)}
      footer={null}
      width={1000}
      closable={false}
      styles={{ content: { padding: 0, borderRadius: 10, overflow: 'hidden' } }}
    >
      {content}
    </Modal>
  );
};

export default PokaYokeChecklist;