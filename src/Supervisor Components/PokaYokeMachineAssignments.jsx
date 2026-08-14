import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  Button, Modal, Form, Select, message, Typography, Space, Tag, Checkbox, Popconfirm, Spin, Badge, Tooltip, Collapse, DatePicker, Input,
} from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, CalendarOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, getCurrentUserId, formatDate, formatDateTime,
  machineLabel, frequencySummary, STATUS_COLORS, isDateInRange,
  disableFutureDates, normalizeDateRange,
  FREQUENCY_TYPES, INTERVAL_UNITS, validateAssignFrequency,
} from './pmUtils';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { Grid } from 'react-window';
import CheckpointDetailModal from './CheckpointDetailModal';
import PmDownloadButton from './PmDownloadButton';
import { buildAssignmentsReportConfig } from './pmReportDownload';

const ASSIGN_ROW_H = 92;

const highlightText = (text, q) => {
  if (!q || !text) return text || '';
  const lower = String(text).toLowerCase();
  const qi = lower.indexOf(q.toLowerCase());
  if (qi < 0) return text;
  return (
    <>
      {text.slice(0, qi)}
      <mark style={{ background: '#FEF08A', padding: 0 }}>{text.slice(qi, qi + q.length)}</mark>
      {text.slice(qi + q.length)}
    </>
  );
};

const AssignCheckpointCell = memo(function AssignCheckpointCell({
  ariaAttributes,
  columnIndex,
  rowIndex,
  style,
  rows,
  colCount,
  onPatch,
  searchQ,
}) {
  const idx = rowIndex * colCount + columnIndex;
  const r = rows[idx];
  if (!r) {
    return <div style={{ ...style, boxSizing: 'border-box' }} {...ariaAttributes} />;
  }
  const selected = !!r.is_required;
  const q = searchQ.trim();

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        boxSizing: 'border-box',
        padding: 4,
      }}
    >
      <div
        style={{
          height: '100%',
          border: `1px solid ${selected ? '#93C5FD' : '#E5E7EB'}`,
          background: selected ? '#F0F7FF' : '#fff',
          borderRadius: 4,
          padding: '6px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
          <Checkbox
            checked={selected}
            onChange={(e) => onPatch(r.checklist_item_id, {
              is_required: e.target.checked,
              ...(e.target.checked && !r.frequency_type
                ? { frequency_type: 'Time Based', interval_value: 1, interval_unit: 'Week', trigger_hours: null }
                : {}),
            })}
            style={{ marginTop: 1 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: '#6B7280', fontWeight: 600, lineHeight: 1.2 }}>
              {r.checklist_name}
              <span style={{ fontWeight: 400 }}> · #{r.sequence_number}</span>
            </div>
            <div
              title={r.item_text}
              style={{
                fontSize: 12,
                color: '#111827',
                lineHeight: 1.25,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {highlightText(r.item_text, q)}
            </div>
          </div>
          <Checkbox
            disabled={!selected}
            checked={!!r.is_compulsory}
            onChange={(e) => onPatch(r.checklist_item_id, { is_compulsory: e.target.checked })}
            style={{ flexShrink: 0 }}
          >
            <span style={{ fontSize: 10 }}>Comp.</span>
          </Checkbox>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', marginTop: 'auto' }}>
          <Select
            size="small"
            disabled={!selected}
            style={{ flex: '1 1 110px', minWidth: 100 }}
            placeholder="Freq *"
            value={selected ? (r.frequency_type || undefined) : undefined}
            options={FREQUENCY_TYPES}
            onChange={(v) => onPatch(r.checklist_item_id, {
              frequency_type: v,
              interval_value: v === 'Usage Based' ? null : (r.interval_value || 1),
              interval_unit: v === 'Usage Based' ? null : (r.interval_unit || 'Week'),
              trigger_hours: v === 'Usage Based' ? (r.trigger_hours || 100) : null,
            })}
          />
          {selected && ['Time Based', 'Condition Based'].includes(r.frequency_type) ? (
            <>
              <Select
                size="small"
                style={{ width: 78 }}
                value={r.interval_unit || undefined}
                options={INTERVAL_UNITS.map((u) => ({ value: u, label: u }))}
                onChange={(v) => onPatch(r.checklist_item_id, { interval_unit: v })}
              />
              <Input
                size="small"
                type="number"
                min={1}
                style={{ width: 52 }}
                value={r.interval_value ?? ''}
                onChange={(e) => onPatch(r.checklist_item_id, {
                  interval_value: e.target.value === '' ? null : Number(e.target.value),
                })}
              />
            </>
          ) : null}
          {selected && r.frequency_type === 'Usage Based' ? (
            <Input
              size="small"
              type="number"
              min={1}
              style={{ width: 72 }}
              placeholder="Hrs"
              value={r.trigger_hours ?? ''}
              onChange={(e) => onPatch(r.checklist_item_id, {
                trigger_hours: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});

const { Text } = Typography;
const { Option } = Select;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const CAL = {
  weekend: '#F9FAFB',
  warningBg: '#FEF3C7',
  warningText: '#92400E',
  radius: '12px',
};

function getDaysInMonth(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, cur: true });
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) cells.push({ day: d, cur: false });
  return cells;
}

const INDICATION_ORDER = ['assigned', 'condition', 'daily', 'weekly', 'monthly', 'yearly', 'usage', 'scheduled'];

/** Calendar day summary — Assigned + frequency only (no Completed on dates). */
function summarizeDayItems(items) {
  if (!items.length) return null;

  const isAssignDay = items.some((i) => i.indication === 'assigned');

  if (isAssignDay) {
    return {
      count: items.length,
      breakdown: [{ type: 'assigned', count: items.length }],
    };
  }

  const byType = {};
  items.forEach((i) => {
    if (i.indication && i.indication !== 'completed') {
      byType[i.indication] = (byType[i.indication] || 0) + 1;
    }
  });
  const breakdown = INDICATION_ORDER
    .filter((t) => byType[t])
    .map((t) => ({ type: t, count: byType[t] }));

  return breakdown.length ? { count: items.length, breakdown } : null;
}

const INDICATION_META = {
  assigned: { color: '#16A34A', label: 'Assigned', bg: '#DCFCE7', glow: 'rgba(22,163,74,0.25)' },
  condition: { color: '#9333EA', label: 'Condition', bg: '#F3E8FF', glow: 'rgba(147,51,234,0.22)' },
  daily: { color: '#4F46E5', label: 'Daily', bg: '#EEF2FF', glow: 'rgba(79,70,229,0.22)' },
  weekly: { color: '#D97706', label: 'Weekly', bg: '#FEF3C7', glow: 'rgba(217,119,6,0.22)' },
  monthly: { color: '#DB2777', label: 'Monthly', bg: '#FCE7F3', glow: 'rgba(219,39,119,0.2)' },
  yearly: { color: '#0891B2', label: 'Yearly', bg: '#CFFAFE', glow: 'rgba(8,145,178,0.2)' },
  usage: { color: '#EA580C', label: 'Usage', bg: '#FFEDD5', glow: 'rgba(234,88,12,0.2)' },
  scheduled: { color: '#64748B', label: 'Scheduled', bg: '#F1F5F9', glow: 'rgba(100,116,139,0.18)' },
  completed: { color: '#2563EB', label: 'Completed', bg: '#DBEAFE', glow: 'rgba(37,99,235,0.22)' },
};

const pillVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 6 },
  show: (i) => ({
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  }),
};

const IndicationPill = ({ type, count, index = 0 }) => {
  const meta = INDICATION_META[type];
  if (!meta) return null;
  return (
    <motion.div
      custom={index}
      variants={pillVariants}
      initial="hidden"
      animate="show"
      whileHover={{ scale: 1.04 }}
      style={{ display: 'inline-block' }}
    >
      <Badge
        count={count}
        size="small"
        overflowCount={99}
        style={{
          backgroundColor: meta.color,
          fontSize: 9,
          fontWeight: 700,
          boxShadow: `0 2px 6px ${meta.glow}`,
        }}
        offset={[6, -4]}
      >
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1.2,
          padding: '3px 8px',
          borderRadius: 16,
          color: meta.color,
          background: `linear-gradient(135deg, ${meta.bg} 0%, #fff 120%)`,
          border: `1px solid ${meta.color}28`,
          boxShadow: `0 2px 8px ${meta.glow}`,
          whiteSpace: 'nowrap',
        }}>
          <motion.span
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: meta.color,
              flexShrink: 0,
              boxShadow: `0 0 0 3px ${meta.bg}`,
            }}
          />
          {meta.label}
        </span>
      </Badge>
    </motion.div>
  );
};

const DayCellIndicators = ({ summary }) => {
  if (!summary?.breakdown?.length) return null;
  const { breakdown, count } = summary;
  const visible = breakdown.slice(0, 2);
  const extra = breakdown.length - visible.length;

  const tooltipLines = breakdown.map(
    ({ type, count: c }) => `${INDICATION_META[type].label}: ${c}`
  );

  return (
    <Tooltip
      title={(
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{count} checkpoint(s)</div>
          {tooltipLines.map((line) => <div key={line}>{line}</div>)}
          <div style={{ marginTop: 4, opacity: 0.85 }}>Click for details</div>
        </div>
      )}
      placement="top"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start', width: '100%' }}
      >
        {visible.map(({ type, count: c }, i) => (
          <IndicationPill key={type} type={type} count={c} index={i} />
        ))}
        {extra > 0 && (
          <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 600, paddingLeft: 2 }}>
            +{extra} more
          </span>
        )}
      </motion.div>
    </Tooltip>
  );
};

function isConditionBased(ci) {
  return ci?.frequency_type === 'Condition Based';
}

/** Time Based every 1 Day */
function isTimeDaily(ci) {
  return ci?.frequency_type === 'Time Based' && ci.interval_value === 1 && ci.interval_unit === 'Day';
}

/** Shown every day from assignment (condition or time-daily) */
function isEveryDayCheckpoint(ci) {
  return isConditionBased(ci) || isTimeDaily(ci);
}

/** Map checkpoint frequency to calendar indication key */
function getFrequencyIndication(ci) {
  if (!ci) return 'scheduled';
  if (isConditionBased(ci)) return 'condition';
  if (isTimeDaily(ci)) return 'daily';
  if (ci.frequency_type === 'Usage Based') return 'usage';
  const iu = ci.interval_unit;
  if (iu === 'Week') return 'weekly';
  if (iu === 'Month') return 'monthly';
  if (iu === 'Year') return 'yearly';
  if (iu === 'Day') return 'daily';
  return 'scheduled';
}

function isScheduledDueOnDate(ci, schedule, dateKey) {
  if (!ci || !schedule?.next_due_date || isEveryDayCheckpoint(ci)) return false;
  const due = dayjs(schedule.next_due_date);
  const target = dayjs(dateKey);
  if (target.isBefore(due, 'day')) return false;

  if (ci.frequency_type === 'Usage Based') {
    return target.isSame(due, 'day');
  }

  const iv = ci.interval_value || 1;
  const iu = ci.interval_unit || 'Day';

  if (iu === 'Day') {
    const days = target.diff(due, 'day');
    return days >= 0 && days % iv === 0;
  }
  if (iu === 'Week') {
    if (target.day() !== due.day()) return false;
    const weeks = target.diff(due.startOf('week'), 'week');
    const dueWeeks = due.diff(due.startOf('week'), 'week');
    return weeks >= dueWeeks && (weeks - dueWeeks) % iv === 0;
  }
  if (iu === 'Month') {
    if (target.date() !== due.date()) return false;
    const months = target.diff(due, 'month');
    return months >= 0 && months % iv === 0;
  }
  if (iu === 'Year') {
    if (target.month() !== due.month() || target.date() !== due.date()) return false;
    const years = target.diff(due, 'year');
    return years >= 0 && years % iv === 0;
  }
  return target.isSame(due, 'day');
}

/** Checkpoints visible on a calendar day with indication type */
export function getCheckpointsForDate(assignments, submissions, date) {
  const dateKey = dayjs(date).format('YYYY-MM-DD');
  const items = [];

  assignments.forEach((assignment) => {
    const assignedDay = dayjs(assignment.assigned_at).format('YYYY-MM-DD');
    if (dateKey < assignedDay) return;

    const checklistName = assignment.checklist?.name || assignment.checklistName || '';
    const isAssignDay = dateKey === assignedDay;

    (assignment.assignment_items || []).forEach((ai) => {
      const ci = ai.checklist_item;
      if (!ci) return;
      // Prefer frequency set at assign-time; fall back to master for legacy rows
      const freq = ai.frequency_type
        ? {
          frequency_type: ai.frequency_type,
          interval_value: ai.interval_value,
          interval_unit: ai.interval_unit,
          trigger_hours: ai.trigger_hours,
        }
        : ci;

      const isCondition = isConditionBased(freq);
      const isDaily = isTimeDaily(freq);
      let indication = null;

      if (isAssignDay) {
        indication = 'assigned';
      } else if (isCondition) {
        indication = 'condition';
      } else if (isDaily) {
        indication = 'daily';
      } else if (isScheduledDueOnDate(freq, ai.schedule, dateKey)) {
        indication = getFrequencyIndication(freq);
      }

      if (!indication) return;

      const daySubs = (submissions || []).filter(
        (s) => s.assignment_item_id === ai.id && dayjs(s.submitted_at).format('YYYY-MM-DD') === dateKey
      );
      const allItemSubs = (submissions || []).filter((s) => s.assignment_item_id === ai.id);
      const latestSub = daySubs[daySubs.length - 1];
      const submissionStatus = latestSub ? 'completed' : null;

      items.push({
        key: `${indication}-${assignment.id}-${ai.id}-${dateKey}`,
        indication,
        submissionStatus,
        assignment,
        assignmentItem: ai,
        checkpointName: ci.item_text || 'Checkpoint',
        checklistName,
        submissions: daySubs,
        hasSubmissions: allItemSubs.length > 0,
        dueDay: ai.schedule?.next_due_date,
        dateKey,
      });
    });
  });

  const order = { assigned: 0, condition: 1, daily: 2, weekly: 3, monthly: 4, yearly: 5, usage: 6, scheduled: 7 };
  items.sort((a, b) => {
    const oa = order[a.indication] ?? 9;
    const ob = order[b.indication] ?? 9;
    if (oa !== ob) return oa - ob;
    return a.checkpointName.localeCompare(b.checkpointName);
  });

  return items;
}

const CheckpointListCard = ({ item, onClick, onDelete, active, hideAssignedTag = false }) => {
  const meta = INDICATION_META[item.indication] || INDICATION_META.scheduled;
  const latestSub = item.submissions[item.submissions.length - 1];
  const showIndicationTag = !(hideAssignedTag && item.indication === 'assigned');

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (item.hasSubmissions) {
      message.error('This checkpoint cannot be removed because an operator has already submitted a response for it.');
      return;
    }
  };

  const statusTag = (() => {
    if (!latestSub) return null;
    return <Tag color="success" style={{ margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 5px', borderRadius: 0 }}>Completed</Tag>;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      style={{
        background: active ? PM_T.primaryBg : '#fff',
        border: `1px solid ${active ? PM_T.primary : PM_T.border}`,
        borderLeft: `3px solid ${meta.color}`,
        padding: '6px 8px',
        marginBottom: 4,
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#F8FAFF'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = '#fff'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <Text strong style={{ fontSize: 12, lineHeight: 1.2 }} ellipsis>{item.checkpointName}</Text>
          {showIndicationTag && (
            <Tag style={{
              margin: 0, fontSize: 9, lineHeight: '14px', padding: '0 5px', borderRadius: 8,
              border: `1px solid ${meta.color}40`, background: meta.bg, color: meta.color,
            }}>
              {meta.label}
            </Tag>
          )}
          {statusTag}
        </div>
        <Space size={2} onClick={(e) => e.stopPropagation()}>
          {onDelete && (
            item.hasSubmissions ? (
              <Tooltip title="Cannot remove — operator has submitted">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ ...btnSharp, padding: 0, width: 22, height: 22, opacity: 0.45 }}
                  onClick={handleDeleteClick}
                />
              </Tooltip>
            ) : (
              <Popconfirm
                title="Remove checkpoint from this machine?"
                description="This will unassign the checkpoint from the machine."
                onConfirm={() => onDelete(item)}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  style={{ ...btnSharp, padding: 0, width: 22, height: 22 }}
                  onClick={(e) => e.stopPropagation()}
                />
              </Popconfirm>
            )
          )}
          <RightOutlined style={{ color: PM_T.textMuted, fontSize: 10 }} />
        </Space>
      </div>
      <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2, lineHeight: 1.2 }} ellipsis>
        {item.checklistName}
      </Text>
    </div>
  );
};

const PokaYokeMachineAssignments = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectedChecklistFilter, setSelectedChecklistFilter] = useState(null);
  const [assignDateRange, setAssignDateRange] = useState(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [viewYear, setViewYear] = useState(dayjs().year());
  const [viewMonth, setViewMonth] = useState(dayjs().month());
  const [checkpointConfig, setCheckpointConfig] = useState([]);
  const [assignChecklistFilter, setAssignChecklistFilter] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignLoadingCheckpoints, setAssignLoadingCheckpoints] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [form] = Form.useForm();

  const buildCheckpointConfig = (list, filterId = null) => {
    const source = filterId
      ? (list || []).filter((c) => c.id === filterId)
      : (list || []);
    const rows = [];
    source.forEach((cl) => {
      const items = [...(cl.items || [])].sort(
        (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
      );
      items.forEach((item) => {
        rows.push({
          checklist_item_id: item.id,
          checklist_id: cl.id,
          checklist_name: cl.name,
          item_text: item.item_text,
          sequence_number: item.sequence_number,
          item_type: item.item_type,
          expected_value: item.expected_value,
          remarks: item.remarks,
          is_required: false,
          is_compulsory: false,
          frequency_type: null,
          interval_value: null,
          interval_unit: null,
          trigger_hours: null,
        });
      });
    });
    return rows;
  };

  const checkpointsByChecklist = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    const map = new Map();
    checkpointConfig.forEach((row) => {
      if (q) {
        const hay = [
          row.item_text,
          row.checklist_name,
          row.frequency_type,
          row.interval_unit,
          row.expected_value,
          row.remarks,
          row.item_type,
          String(row.interval_value ?? ''),
          String(row.trigger_hours ?? ''),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return;
      }
      const key = row.checklist_id;
      if (!map.has(key)) {
        map.set(key, { id: key, name: row.checklist_name || `Checklist #${key}`, items: [] });
      }
      map.get(key).items.push(row);
    });
    return Array.from(map.values());
  }, [checkpointConfig, assignSearch]);

  const filteredCheckpointRows = useMemo(
    () => checkpointsByChecklist.flatMap((g) => g.items),
    [checkpointsByChecklist],
  );

  const assignSelectedCount = useMemo(
    () => checkpointConfig.filter((c) => c.is_required).length,
    [checkpointConfig],
  );

  const closeAssignModal = () => {
    setAssignOpen(false);
    form.resetFields();
    setCheckpointConfig([]);
    setAssignChecklistFilter(null);
    setAssignSearch('');
  };

  const patchAssignCheckpoint = useCallback((checklistItemId, patch) => {
    setCheckpointConfig((prev) => prev.map((x) => (
      x.checklist_item_id === checklistItemId ? { ...x, ...patch } : x
    )));
  }, []);

  const assignGridRef = useRef(null);
  const [assignGridSize, setAssignGridSize] = useState({ width: 0, height: 0 });
  const assignColCount = assignGridSize.width >= 1200 ? 3 : (assignGridSize.width >= 640 ? 2 : 1);
  const assignRowCount = Math.ceil(filteredCheckpointRows.length / Math.max(assignColCount, 1));

  useEffect(() => {
    if (!assignOpen) return undefined;
    const el = assignGridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      setAssignGridSize({
        width: Math.max(0, Math.floor(cr.width)),
        height: Math.max(0, Math.floor(cr.height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [assignOpen, assignLoadingCheckpoints, filteredCheckpointRows.length]);

  const assignedChecklists = useMemo(() => {
    const map = new Map();
    const source = selectedMachine
      ? assignments.filter((a) => a.machine_id === selectedMachine)
      : assignments;
    source.forEach((a) => {
      const id = a.checklist_id || a.checklist?.id;
      const name = a.checklist?.name || a.checklistName;
      if (id) map.set(id, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments, selectedMachine]);

  const activeAssignments = useMemo(() => {
    let list = assignments;
    if (selectedMachine) list = list.filter((a) => a.machine_id === selectedMachine);
    if (selectedChecklistFilter) {
      list = list.filter((a) => (a.checklist_id || a.checklist?.id) === selectedChecklistFilter);
    }
    if (assignDateRange?.[0] && assignDateRange?.[1]) {
      list = list.filter((a) => isDateInRange(a.assigned_at, normalizeDateRange(assignDateRange)));
    }
    return list;
  }, [assignments, selectedMachine, selectedChecklistFilter, assignDateRange]);

  const activeSubmissions = useMemo(() => {
    if (!selectedMachine && !selectedChecklistFilter) return submissions;
    const itemIds = new Set();
    activeAssignments.forEach((a) => {
      (a.assignment_items || []).forEach((ai) => itemIds.add(ai.id));
    });
    return submissions.filter((s) => itemIds.has(s.assignment_item_id));
  }, [submissions, activeAssignments, selectedMachine, selectedChecklistFilter]);

  const selectedDayItems = useMemo(
    () => getCheckpointsForDate(activeAssignments, activeSubmissions, selectedDate),
    [activeAssignments, activeSubmissions, selectedDate]
  );

  const machinesGroupedForDate = useMemo(() => {
    const map = new Map();
    selectedDayItems.forEach((item) => {
      const mid = item.assignment?.machine_id;
      if (!mid) return;
      const m = machines.find((x) => x.id === mid);
      const label = machineLabel(m) || `Machine ${mid}`;
      if (!map.has(mid)) map.set(mid, { id: mid, label, items: [] });
      map.get(mid).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [selectedDayItems, machines]);

  const dateLabel = useMemo(() => {
    if (selectedDate.isSame(dayjs(), 'day')) return 'Today';
    if (selectedDate.isSame(dayjs().add(1, 'day'), 'day')) return 'Tomorrow';
    return selectedDate.format('DD MMM YYYY');
  }, [selectedDate]);

  const calendarCells = useMemo(() => getDaysInMonth(viewYear, viewMonth), [viewYear, viewMonth]);

  const getDaySummary = (year, month, day, cur) => {
    if (!cur) return null;
    const items = getCheckpointsForDate(
      activeAssignments,
      activeSubmissions,
      dayjs(new Date(year, month, day))
    );
    return summarizeDayItems(items);
  };

  const handleDateClick = (year, month, day, cur) => {
    if (!cur) return;
    setSelectedDate(dayjs(new Date(year, month, day)));
    setDetailItem(null);
  };

  useEffect(() => {
    fetchMachines?.();
    loadAllAssignments();
  }, []);

  useEffect(() => {
    setSelectedDate((prev) => {
      if (prev.year() === viewYear && prev.month() === viewMonth) return prev;
      const maxDay = dayjs(new Date(viewYear, viewMonth + 1, 0)).date();
      const day = Math.min(prev.date(), maxDay);
      return dayjs(new Date(viewYear, viewMonth, day));
    });
    setDetailItem(null);
  }, [viewYear, viewMonth]);

  const loadAllAssignments = async () => {
    setLoading(true);
    try {
      const [data, submissionData] = await Promise.all([
        pmFetch('/assignments'),
        pmFetch('/submissions'),
      ]);
      const enriched = (Array.isArray(data) ? data : []).map((detail) => ({
        ...detail,
        checklistName: detail.checklist?.name || 'Unknown',
        itemsCount: detail.assignment_items?.length || 0,
      }));
      setAssignments(enriched);
      setSubmissions(submissionData || []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCheckpoint = async (item) => {
    const assignmentId = item.assignment?.id;
    const assignmentItemId = item.assignmentItem?.id;
    if (!assignmentId || !assignmentItemId) return;
    if (item.hasSubmissions) {
      message.error('This checkpoint cannot be removed because an operator has already submitted a response for it.');
      return;
    }

    try {
      await pmFetch(`/assignments/${assignmentId}/items/${assignmentItemId}`, { method: 'DELETE' });
      message.success('Checkpoint removed from machine');
      await loadAllAssignments();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleRefresh = async () => {
    await loadAllAssignments();
    message.success('Refreshed');
  };

  const openAssignModal = async () => {
    fetchMachines?.();
    form.setFieldsValue({ machine_ids: selectedMachine ? [selectedMachine] : [] });
    setAssignChecklistFilter(null);
    setAssignSearch('');
    setAssignOpen(true);
    setAssignLoadingCheckpoints(true);
    try {
      const list = await pmFetch('/checklists');
      const arr = Array.isArray(list) ? list : [];
      setChecklists(arr);
      setCheckpointConfig(buildCheckpointConfig(arr, null));
    } catch (e) {
      message.error(e.message || 'Failed to load checkpoints');
      setCheckpointConfig([]);
    } finally {
      setAssignLoadingCheckpoints(false);
    }
  };

  const onAssignChecklistFilterChange = (checklistId) => {
    const filterId = checklistId || null;
    setAssignChecklistFilter(filterId);
    setCheckpointConfig(buildCheckpointConfig(checklists, filterId));
  };

  const handleAssign = async (values) => {
    if (!checkpointConfig.length) return message.error('No checkpoints available');
    const toAssign = checkpointConfig.filter((c) => c.is_required);
    if (!toAssign.length) return message.error('Select at least one checkpoint to assign');

    for (const row of toAssign) {
      const err = validateAssignFrequency(row);
      if (err) {
        return message.error(`${row.item_text || 'Checkpoint'}: ${err}`);
      }
    }

    const machineIds = values.machine_ids || [];
    if (!machineIds.length) return message.error('Select at least one machine');

    const byChecklist = new Map();
    toAssign.forEach((row) => {
      if (!byChecklist.has(row.checklist_id)) byChecklist.set(row.checklist_id, []);
      byChecklist.get(row.checklist_id).push(row);
    });

    let ok = 0;
    let fail = 0;
    for (const machineId of machineIds) {
      for (const [checklistId, rows] of byChecklist.entries()) {
        try {
          await pmFetch('/assignments', {
            method: 'POST',
            body: JSON.stringify({
              machine_id: machineId,
              checklist_id: checklistId,
              assigned_by: getCurrentUserId(),
              items: rows.map((c) => ({
                checklist_item_id: c.checklist_item_id,
                is_required: true,
                is_compulsory: !!c.is_compulsory,
                frequency_type: c.frequency_type,
                interval_value: c.interval_value != null ? Number(c.interval_value) : null,
                interval_unit: c.interval_unit || null,
                trigger_hours: c.trigger_hours != null ? Number(c.trigger_hours) : null,
              })),
            }),
          });
          ok += 1;
        } catch (e) {
          fail += 1;
          message.error(
            `${machineLabel(machines.find((m) => m.id === machineId))} / ${rows[0]?.checklist_name || checklistId}: ${e.message}`,
          );
        }
      }
    }
    if (ok) message.success(`Created ${ok} assignment(s)${fail ? ` (${fail} failed)` : ''}`);
    setAssignOpen(false);
    form.resetFields();
    setCheckpointConfig([]);
    setAssignChecklistFilter(null);
    setAssignSearch('');
    await loadAllAssignments();
    if (!selectedMachine && machineIds.length === 1) setSelectedMachine(machineIds[0]);
  };

  const legendItems = ['assigned', 'condition', 'daily', 'weekly', 'monthly', 'yearly', 'usage'];

  const renderCalendarCell = ({ day, cur }, idx) => {
    const date = new Date(viewYear, cur ? viewMonth : (idx < 7 ? viewMonth - 1 : viewMonth + 1), day);
    const dow = date.getDay();
    const isSunday = dow === 0;
    const today = dayjs();
    const isToday = cur && day === today.date() && viewMonth === today.month() && viewYear === today.year();
    const isSelected = cur && selectedDate
      && selectedDate.date() === day
      && selectedDate.month() === viewMonth
      && selectedDate.year() === viewYear;

    const summary = cur ? getDaySummary(viewYear, viewMonth, day, cur) : null;

    return (
      <div
        key={idx}
        onClick={() => handleDateClick(viewYear, viewMonth, day, cur)}
        style={{
          position: 'relative',
          height: '100%',
          minHeight: 88,
          padding: '5px 6px 6px',
          background: isSelected ? PM_T.primaryBg
            : isSunday && cur ? CAL.weekend
            : cur ? '#fff' : 'transparent',
          borderRight: `1px solid ${PM_T.border}`,
          borderBottom: `1px solid ${PM_T.border}`,
          cursor: cur ? 'pointer' : 'default',
          opacity: cur ? 1 : 0.35,
          outline: isSelected ? `2px solid ${PM_T.primary}` : isToday ? `2px solid ${PM_T.primary}` : 'none',
          outlineOffset: -2,
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => {
          if (cur && !isSelected) e.currentTarget.style.background = '#F5F7FF';
        }}
        onMouseLeave={(e) => {
          if (cur && !isSelected) {
            e.currentTarget.style.background = isSunday ? CAL.weekend : '#fff';
          }
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{
            fontSize: 13,
            fontWeight: isToday ? 700 : 500,
            color: isToday ? '#fff' : isSunday ? PM_T.textMuted : PM_T.textMid,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: isToday ? PM_T.primary : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {day}
          </span>
          {isSunday && cur && (
            <span style={{
              fontSize: 9, fontWeight: 700, color: CAL.warningText,
              background: CAL.warningBg, borderRadius: 4, padding: '1px 5px',
            }}>
              OFF
            </span>
          )}
        </div>

        {cur && summary && (
          <DayCellIndicators summary={summary} />
        )}
      </div>
    );
  };

  return (
    <div>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Text strong>Machine:</Text>
          <Select allowClear showSearch placeholder="Filter by machine (optional)" style={{ width: 240 }} loading={machinesLoading}
            value={selectedMachine} onFocus={fetchMachines} onChange={(v) => { setSelectedMachine(v || null); setSelectedChecklistFilter(null); }} optionFilterProp="children">
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>
          <Select allowClear showSearch placeholder="Filter by checklist" style={{ width: 220 }}
            value={selectedChecklistFilter} onChange={setSelectedChecklistFilter} optionFilterProp="children"
            disabled={assignedChecklists.length === 0}>
            {assignedChecklists.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>
          <DatePicker.RangePicker
            allowClear
            placeholder={['Assigned from', 'Assigned to']}
            value={assignDateRange}
            disabledDate={disableFutureDates}
            onChange={(v) => setAssignDateRange(normalizeDateRange(v))}
            style={{ width: 260, borderRadius: 0 }}
          />
        </Space>
        <Space>
          <PmDownloadButton
            getReportConfig={() => {
              const meta = [];
              if (selectedMachine) {
                const m = machines.find((x) => x.id === selectedMachine);
                meta.push(`Machine filter: ${machineLabel(m) || selectedMachine}`);
              }
              if (selectedChecklistFilter) {
                const c = assignedChecklists.find((x) => x.id === selectedChecklistFilter);
                meta.push(`Checklist filter: ${c?.name || selectedChecklistFilter}`);
              }
              if (assignDateRange?.[0] && assignDateRange?.[1]) {
                meta.push(`Assigned date range: ${assignDateRange[0].format('DD MMM YYYY')} – ${assignDateRange[1].format('DD MMM YYYY')}`);
              }
              return buildAssignmentsReportConfig(activeAssignments, machines, meta);
            }}
            disabled={!activeAssignments.length}
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={handleRefresh} style={btnSharp}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} style={{ ...btnSharp, background: PM_T.primary, borderColor: PM_T.primary }}
            onClick={openAssignModal}>
            New Assignment
          </Button>
        </Space>
      </Space>

      <div className="pm-assignments-layout" style={{ display: 'grid', gap: 10, alignItems: 'stretch', minHeight: 420, width: '100%' }}>
        <div style={{
          background: PM_T.bg,
          border: `1px solid ${PM_T.border}`,
          borderRadius: CAL.radius,
          boxShadow: PM_T.shadow,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 420,
        }}>
            {/* Calendar header — MC style */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: `1px solid ${PM_T.border}`,
              background: '#fff',
              flexWrap: 'wrap',
              gap: 8,
            }}>
              <Space size={8}>
                <CalendarOutlined style={{ color: PM_T.primary, fontSize: 16 }} />
                <Text strong style={{ fontSize: 14 }}>Assignment Calendar</Text>
              </Space>
              <Space wrap size={8}>
                <Select size="small" value={viewYear} onChange={setViewYear} style={{ width: 88 }}>
                  {Array.from({ length: 11 }, (_, i) => dayjs().year() - 5 + i).map((y) => (
                    <Option key={y} value={y}>{y}</Option>
                  ))}
                </Select>
                <Select size="small" value={viewMonth} onChange={setViewMonth} style={{ width: 110 }}>
                  {MONTHS.map((m, i) => <Option key={m} value={i}>{m}</Option>)}
                </Select>
              </Space>
            </div>

          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', flex: 1 }}><Spin /></div>
          ) : (
              <>
                <style>{`
                  .pm-assignments-layout { grid-template-columns: 1fr; width: 100%; }
                  @media (min-width: 992px) {
                    .pm-assignments-layout { grid-template-columns: minmax(0, 1fr) minmax(260px, 380px); }
                  }
                `}</style>
                {/* Day headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${PM_T.border}`, background: '#fafafa' }}>
                  {DAYS_SHORT.map((d, i) => (
                    <div
                      key={d}
                      style={{
                        textAlign: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        color: i === 0 ? PM_T.textMuted : PM_T.textSub,
                        padding: '6px 0',
                        borderRight: i < 6 ? `1px solid ${PM_T.border}` : 'none',
                      }}
                    >
                      {d}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gridTemplateRows: 'repeat(6, 1fr)',
                  flex: 1,
                  minHeight: 480,
                }}>
                  {calendarCells.map((cell, idx) => renderCalendarCell(cell, idx))}
                </div>
                {/* Legend */}
                <div style={{
                  display: 'flex',
                  gap: 12,
                  padding: '8px 12px',
                  borderTop: `1px solid ${PM_T.border}`,
                  flexWrap: 'wrap',
                  background: '#fff',
                }}>
                  {legendItems.map((k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 3,
                        background: INDICATION_META[k].color, display: 'inline-block',
                      }} />
                      <span style={{ fontSize: 11, color: PM_T.textSub }}>{INDICATION_META[k].label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

        <div style={{ border: `1px solid ${PM_T.border}`, background: '#fafafa', minHeight: 300, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 10px', borderBottom: `1px solid ${PM_T.border}`, background: '#fff', flexShrink: 0 }}>
            <Text strong style={{ fontSize: 12 }}>Assigned Checkpoints — {dateLabel}</Text>
            <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
              {machinesGroupedForDate.length === 0
                ? 'No machines with assignments on this date'
                : `${machinesGroupedForDate.length} machine(s) — expand to view checkpoints`}
            </Text>
          </div>
          <div style={{ padding: 6, flex: 1, overflowY: 'auto', maxHeight: '58vh' }}>
            {machinesGroupedForDate.length === 0 ? (
              <Text type="secondary" style={{ fontSize: 10, padding: 4 }}>Nothing on this date.</Text>
            ) : (
              <Collapse
                size="small"
                bordered={false}
                style={{ background: 'transparent' }}
                items={machinesGroupedForDate.map((m) => ({
                  key: String(m.id),
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: 8, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11 }} ellipsis>{m.label}</Text>
                      <Tag color="blue" style={{ margin: 0, fontSize: 10, borderRadius: 0 }}>{m.items.length}</Tag>
                    </div>
                  ),
                  children: (
                    <div style={{ paddingTop: 2 }}>
                      {m.items.map((item) => (
                        <CheckpointListCard
                          key={item.key}
                          item={item}
                          active={detailItem?.key === item.key}
                          hideAssignedTag
                          onClick={() => setDetailItem(item)}
                          onDelete={handleDeleteCheckpoint}
                        />
                      ))}
                    </div>
                  ),
                }))}
              />
            )}
          </div>
        </div>
      </div>

      <CheckpointDetailModal
        item={detailItem}
        allSubmissions={activeSubmissions}
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        onDelete={handleDeleteCheckpoint}
      />

      <Modal
        title={(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingRight: 28 }}>
            <span>New Assignment</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
              {assignLoadingCheckpoints
                ? 'Loading…'
                : `${filteredCheckpointRows.length.toLocaleString()} shown · ${assignSelectedCount.toLocaleString()} selected of ${checkpointConfig.length.toLocaleString()}`}
            </Text>
          </div>
        )}
        open={assignOpen}
        onCancel={closeAssignModal}
        footer={null}
        width="92vw"
        style={{ top: 24, paddingBottom: 0, maxWidth: 1280 }}
        styles={{
          body: {
            padding: '8px 10px 10px',
            height: 'calc(100vh - 120px)',
            maxHeight: 780,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          content: { borderRadius: 8 },
        }}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAssign}
          style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
        >
          <div
            className="pm-assign-top"
            style={{
              flexShrink: 0,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
              gap: 8,
              marginBottom: 6,
            }}
          >
            <Form.Item
              name="machine_ids"
              label={<span style={{ fontSize: 12 }}>Machines</span>}
              rules={[{ required: true }]}
              style={{ marginBottom: 0 }}
            >
              <Select
                mode="multiple"
                showSearch
                maxTagCount="responsive"
                placeholder="Select machine(s)"
                optionFilterProp="children"
                size="middle"
              >
                {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
              </Select>
            </Form.Item>
            <Form.Item
              label={<span style={{ fontSize: 12 }}>Search</span>}
              style={{ marginBottom: 0 }}
            >
              <Input
                allowClear
                size="middle"
                prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
                placeholder="oil, coolant, hydraulic…"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
            </Form.Item>
          </div>

          <div style={{ flexShrink: 0, marginBottom: 6 }}>
            <div style={{
              display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2,
              WebkitOverflowScrolling: 'touch',
            }}
            >
              <Tag
                color={assignChecklistFilter == null ? 'blue' : 'default'}
                style={{ cursor: 'pointer', margin: 0, borderRadius: 0, userSelect: 'none', flexShrink: 0, fontSize: 11 }}
                onClick={() => onAssignChecklistFilterChange(null)}
              >
                All ({checkpointConfig.length})
              </Tag>
              {checklists.map((c) => {
                const count = (c.items || []).length;
                const active = assignChecklistFilter === c.id;
                return (
                  <Tag
                    key={c.id}
                    color={active ? 'blue' : 'default'}
                    style={{ cursor: 'pointer', margin: 0, borderRadius: 0, userSelect: 'none', flexShrink: 0, fontSize: 11 }}
                    onClick={() => onAssignChecklistFilterChange(c.id)}
                  >
                    {c.name} ({count})
                  </Tag>
                );
              })}
            </div>
            <Text type="secondary" style={{ fontSize: 10 }}>
              {assignColCount} col · {filteredCheckpointRows.length.toLocaleString()} shown
              {assignSearch.trim() ? ` · “${assignSearch.trim()}”` : ''}
              {' · select + set frequency'}
            </Text>
          </div>

          <div
            ref={assignGridRef}
            style={{ flex: 1, minHeight: 0, border: `1px solid ${PM_T.border}`, background: '#F8FAFC', overflow: 'hidden' }}
          >
            {assignLoadingCheckpoints ? (
              <div style={{ padding: 32, textAlign: 'center' }}><Spin size="large" /></div>
            ) : filteredCheckpointRows.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <Text type="secondary">
                  {assignSearch.trim() ? `No checkpoints match “${assignSearch.trim()}”.` : 'No checkpoints found.'}
                </Text>
              </div>
            ) : assignGridSize.width > 0 && assignGridSize.height > 0 ? (
              <Grid
                cellComponent={AssignCheckpointCell}
                cellProps={{
                  rows: filteredCheckpointRows,
                  colCount: assignColCount,
                  onPatch: patchAssignCheckpoint,
                  searchQ: assignSearch,
                }}
                columnCount={assignColCount}
                columnWidth={`${100 / assignColCount}%`}
                rowCount={assignRowCount}
                rowHeight={ASSIGN_ROW_H}
                overscanCount={4}
                style={{ height: assignGridSize.height, width: assignGridSize.width }}
              />
            ) : null}
          </div>

          <div style={{
            flexShrink: 0,
            marginTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
          >
            <Text type="secondary" style={{ fontSize: 11 }}>
              {assignSelectedCount.toLocaleString()} selected
            </Text>
            <Space>
              <Button onClick={closeAssignModal} style={btnSharp}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!checkpointConfig.some((c) => c.is_required) || assignLoadingCheckpoints}
                style={{ ...btnSharp, background: PM_T.primary, borderColor: PM_T.primary }}
              >
                Assign
              </Button>
            </Space>
          </div>
        </Form>
        <style>{`
          @media (max-width: 720px) {
            .pm-assign-top { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </Modal>
    </div>
  );
};

export default PokaYokeMachineAssignments;