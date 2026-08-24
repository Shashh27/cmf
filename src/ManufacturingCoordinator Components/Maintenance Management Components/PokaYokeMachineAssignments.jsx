import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import {
  Button, Modal, Form, Select, message, Typography, Space, Tag, Checkbox, Popconfirm, Spin, Badge, Tooltip, Collapse, DatePicker, Input, Table,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, DeleteOutlined, CalendarOutlined, RightOutlined, SearchOutlined,
  CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, UnorderedListOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, getCurrentUserId, formatDate, formatDateTime,
  machineLabel, frequencySummary, STATUS_COLORS, isDateInRange,
  disableFutureDates, normalizeDateRange,
  FREQUENCY_TYPES, INTERVAL_UNITS, validateAssignFrequency, isRejectedResponse,
  isPastSubmissionDeadline, indexMachineAvailability, isMachineBreakdownOnDay,
} from './pmUtils';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { Grid } from 'react-window';
import CheckpointDetailModal from './CheckpointDetailModal';
import PmDownloadButton from './PmDownloadButton';
import { buildAssignmentsReportConfig } from './pmReportDownload';

const ASSIGN_ROW_H = 64;

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
  narrow,
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
        padding: '4px 8px',
      }}
    >
      <div
        style={{
          height: '100%',
          border: `1px solid ${selected ? '#93C5FD' : '#E5E7EB'}`,
          background: selected ? '#F8FBFF' : '#fff',
          borderRadius: 8,
          padding: narrow ? '8px 10px' : '0 12px',
          display: 'flex',
          flexDirection: narrow ? 'column' : 'row',
          alignItems: narrow ? 'stretch' : 'center',
          gap: narrow ? 8 : 12,
          boxShadow: selected ? '0 1px 2px rgba(37, 99, 235, 0.08)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <Checkbox
            checked={selected}
            onChange={(e) => onPatch(r.checklist_item_id, {
              is_required: e.target.checked,
              ...(e.target.checked && !r.frequency_type
                ? { frequency_type: 'Time Based', interval_value: 1, interval_unit: 'Week', trigger_hours: null }
                : {}),
            })}
          />
          <span
            style={{
              flexShrink: 0,
              minWidth: 58,
              padding: '2px 8px',
              borderRadius: 6,
              background: selected ? '#DBEAFE' : '#F1F5F9',
              color: '#1e3a5f',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.2,
              textAlign: 'center',
            }}
          >
            {highlightText(r.item_code || '—', q)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              title={r.item_text}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0f172a',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {highlightText(r.item_text, q)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
              {r.checklist_name}
              <span style={{ color: '#94a3b8' }}> · #{r.sequence_number}</span>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          paddingLeft: narrow ? 28 : 0,
        }}
        >
          <Checkbox
            disabled={!selected}
            checked={!!r.is_compulsory}
            onChange={(e) => onPatch(r.checklist_item_id, { is_compulsory: e.target.checked })}
          >
            <span style={{ fontSize: 12, color: selected ? '#334155' : '#94a3b8' }}>Compulsory</span>
          </Checkbox>

          <Select
            size="small"
            disabled={!selected}
            style={{ width: narrow ? '100%' : 140 }}
            placeholder="Frequency"
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
                style={{ width: 88 }}
                value={r.interval_unit || undefined}
                options={INTERVAL_UNITS.map((u) => ({ value: u, label: u }))}
                onChange={(v) => onPatch(r.checklist_item_id, { interval_unit: v })}
              />
              <Input
                size="small"
                type="number"
                min={1}
                style={{ width: 64 }}
                placeholder="Every"
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
              style={{ width: 88 }}
              placeholder="Hours"
              suffix="hrs"
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
        checkpointCode: ci.item_code || '',
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
          <Text strong style={{ fontSize: 12, lineHeight: 1.2 }} ellipsis>
            {item.checkpointCode ? `${item.checkpointCode} — ` : ''}{item.checkpointName}
          </Text>
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
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusMachineFilter, setStatusMachineFilter] = useState([]);
  const [statusChecklistFilter, setStatusChecklistFilter] = useState([]);
  const [statusSearch, setStatusSearch] = useState('');
  const [statusPage, setStatusPage] = useState(1);
  const [statusPageSize, setStatusPageSize] = useState(10);
  const [availabilityById, setAvailabilityById] = useState({});
  const [statusViewportW, setStatusViewportW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200,
  );
  const [form] = Form.useForm();
  const statusIsNarrow = statusViewportW < 768;

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
          item_code: item.item_code || '',
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
          row.item_code,
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
  const assignColCount = 1;
  const assignRowCount = filteredCheckpointRows.length;
  const assignListNarrow = assignGridSize.width > 0 && assignGridSize.width < 760;

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

  const checkpointStatusRows = useMemo(() => {
    const dateKey = selectedDate.format('YYYY-MM-DD');
    return selectedDayItems.map((item) => {
      const ai = item.assignmentItem;
      const ci = ai?.checklist_item;
      const mid = item.assignment?.machine_id;
      const m = machines.find((x) => x.id === mid);
      const daySubs = item.submissions || [];
      const latest = daySubs[daySubs.length - 1];
      const expected = ci?.expected_value ?? 'yes';
      let status = 'pending';
      if (latest && latest.response_value != null && String(latest.response_value).trim() !== '') {
        status = isRejectedResponse(latest.response_value, expected) ? 'rejected' : 'completed';
      } else if (isMachineBreakdownOnDay(availabilityById, mid, dateKey, dayjs().format('YYYY-MM-DD'))) {
        status = 'breakdown';
      } else if (isPastSubmissionDeadline(dateKey)) {
        status = 'missed';
      } else {
        status = 'pending';
      }
      return {
        key: item.key || `ai-${ai?.id}-${dateKey}`,
        assignment_item_id: ai?.id,
        machine_id: mid,
        machine_label: machineLabel(m) || `Machine ${mid}`,
        checklist_name: item.checklistName || '—',
        code: item.checkpointCode || ci?.item_code || '',
        checkpoint: item.checkpointName || ci?.item_text || 'Checkpoint',
        frequency: frequencySummary(ai) || frequencySummary(ci) || '—',
        is_compulsory: !!ai?.is_compulsory,
        status,
        response_value: latest?.response_value ?? null,
        operator_name: latest?.operator_name || (latest?.operator_id ? `#${latest.operator_id}` : null),
        submitted_at: latest?.submitted_at || null,
        indication: item.indication,
        dateKey,
      };
    }).sort((a, b) => {
      const mCmp = (a.machine_label || '').localeCompare(b.machine_label || '');
      if (mCmp !== 0) return mCmp;
      const cCmp = (a.checklist_name || '').localeCompare(b.checklist_name || '');
      if (cCmp !== 0) return cCmp;
      return (a.checkpoint || '').localeCompare(b.checkpoint || '');
    });
  }, [selectedDayItems, selectedDate, machines, availabilityById]);

  const dayStatusBadge = useMemo(() => {
    let missed = 0;
    let pending = 0;
    checkpointStatusRows.forEach((r) => {
      if (r.status === 'missed') missed += 1;
      else if (r.status === 'pending') pending += 1;
    });
    return { missed, pending };
  }, [checkpointStatusRows]);

  const statusBaseRows = useMemo(() => {
    let list = checkpointStatusRows;
    if (statusMachineFilter.length > 0) {
      const set = new Set(statusMachineFilter);
      list = list.filter((r) => set.has(r.machine_id));
    }
    if (statusChecklistFilter.length > 0) {
      const set = new Set(statusChecklistFilter);
      list = list.filter((r) => set.has(r.checklist_name));
    }
    const q = statusSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        (r.code || '').toLowerCase().includes(q)
        || (r.checkpoint || '').toLowerCase().includes(q)
        || (r.machine_label || '').toLowerCase().includes(q)
        || (r.checklist_name || '').toLowerCase().includes(q)
        || (r.operator_name || '').toLowerCase().includes(q));
    }
    return list;
  }, [checkpointStatusRows, statusMachineFilter, statusChecklistFilter, statusSearch]);

  const checkpointStatusSummary = useMemo(() => {
    const summary = {
      total: statusBaseRows.length,
      completed: 0,
      pending: 0,
      missed: 0,
      rejected: 0,
      breakdown: 0,
    };
    statusBaseRows.forEach((r) => {
      if (r.status === 'completed') summary.completed += 1;
      else if (r.status === 'rejected') summary.rejected += 1;
      else if (r.status === 'missed') summary.missed += 1;
      else if (r.status === 'breakdown') summary.breakdown += 1;
      else summary.pending += 1;
    });
    return summary;
  }, [statusBaseRows]);

  const statusMachineOptions = useMemo(() => {
    const map = new Map();
    checkpointStatusRows.forEach((r) => {
      if (r.machine_id != null) map.set(r.machine_id, r.machine_label);
    });
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [checkpointStatusRows]);

  const statusChecklistOptions = useMemo(() => {
    const set = new Set();
    checkpointStatusRows.forEach((r) => {
      if (r.checklist_name) set.add(r.checklist_name);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [checkpointStatusRows]);

  const filteredStatusRows = useMemo(() => {
    if (!statusFilter || statusFilter === 'all') return statusBaseRows;
    return statusBaseRows.filter((r) => r.status === statusFilter);
  }, [statusBaseRows, statusFilter]);

  useEffect(() => {
    setStatusPage(1);
  }, [statusFilter, statusMachineFilter, statusChecklistFilter, statusSearch, selectedDate]);

  useEffect(() => {
    if (!statusOpen) return undefined;
    const onResize = () => setStatusViewportW(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [statusOpen]);

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
      const [data, submissionData, avail] = await Promise.all([
        pmFetch('/assignments'),
        pmFetch('/submissions'),
        pmFetch('/machine-availability').catch(() => []),
      ]);
      const enriched = (Array.isArray(data) ? data : []).map((detail) => ({
        ...detail,
        checklistName: detail.checklist?.name || 'Unknown',
        itemsCount: detail.assignment_items?.length || 0,
      }));
      setAssignments(enriched);
      setSubmissions(submissionData || []);
      setAvailabilityById(indexMachineAvailability(avail));
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
          <div style={{
            padding: '6px 10px',
            borderBottom: `1px solid ${PM_T.border}`,
            background: '#fff',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
          >
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 12 }}>Assigned Checkpoints — {dateLabel}</Text>
              <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
                {machinesGroupedForDate.length === 0
                  ? 'No machines with assignments on this date'
                  : `${machinesGroupedForDate.length} machine(s) — expand to view checkpoints`}
              </Text>
            </div>
            <Badge
              count={dayStatusBadge.missed || dayStatusBadge.pending}
              overflowCount={999}
              offset={[-2, 2]}
              style={{ backgroundColor: dayStatusBadge.missed ? '#6366f1' : '#F5B800' }}
            >
              <Button
                size="small"
                icon={<UnorderedListOutlined />}
                onClick={() => {
                  setStatusFilter('all');
                  setStatusMachineFilter([]);
                  setStatusChecklistFilter([]);
                  setStatusSearch('');
                  setStatusPage(1);
                  setStatusOpen(true);
                }}
                style={{ ...btnSharp, flexShrink: 0 }}
                disabled={!checkpointStatusRows.length}
              >
                Status
              </Button>
            </Badge>
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
          <div style={{ paddingRight: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e3a5f' }}>Assign Checkpoints to Machines</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400, marginTop: 2 }}>
              {assignLoadingCheckpoints
                ? 'Loading checkpoints…'
                : `${assignSelectedCount} selected · ${filteredCheckpointRows.length} shown · ${checkpointConfig.length} total`}
            </div>
          </div>
        )}
        open={assignOpen}
        onCancel={closeAssignModal}
        footer={null}
        width="min(1080px, 96vw)"
        style={{ top: 16, paddingBottom: 0, maxWidth: '100%' }}
        styles={{
          body: {
            padding: '12px 16px 14px',
            height: 'calc(100vh - 110px)',
            maxHeight: 720,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          },
          content: { borderRadius: 12 },
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
              gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <Form.Item
              name="machine_ids"
              label={<span style={{ fontSize: 12, fontWeight: 600 }}>Machines</span>}
              rules={[{ required: true, message: 'Select at least one machine' }]}
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
              label={<span style={{ fontSize: 12, fontWeight: 600 }}>Search checkpoints</span>}
              style={{ marginBottom: 0 }}
            >
              <Input
                allowClear
                size="middle"
                prefix={<SearchOutlined style={{ color: '#9CA3AF' }} />}
                placeholder="Code or name (CL-01, coolant…)"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
              />
            </Form.Item>
          </div>

          <div style={{ flexShrink: 0, marginBottom: 10 }}>
            <div style={{
              display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4,
              WebkitOverflowScrolling: 'touch',
            }}
            >
              <button
                type="button"
                onClick={() => onAssignChecklistFilterChange(null)}
                style={{
                  border: assignChecklistFilter == null ? '1px solid #2563eb' : '1px solid #e2e8f0',
                  background: assignChecklistFilter == null ? '#eff6ff' : '#fff',
                  color: assignChecklistFilter == null ? '#1d4ed8' : '#475569',
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                All ({checkpointConfig.length})
              </button>
              {checklists.map((c) => {
                const count = (c.items || []).length;
                const active = assignChecklistFilter === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onAssignChecklistFilterChange(c.id)}
                    style={{
                      border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
                      background: active ? '#eff6ff' : '#fff',
                      color: active ? '#1d4ed8' : '#475569',
                      borderRadius: 999,
                      padding: '4px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {c.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{
            flexShrink: 0,
            display: assignListNarrow ? 'none' : 'grid',
            gridTemplateColumns: '28px 70px minmax(0, 1fr) auto',
            gap: 12,
            padding: '6px 20px 6px 20px',
            fontSize: 11,
            fontWeight: 700,
            color: '#64748b',
            background: '#f8fafc',
            border: `1px solid ${PM_T.border}`,
            borderBottom: 'none',
            borderRadius: '8px 8px 0 0',
          }}
          >
            <span />
            <span>Code</span>
            <span>Checkpoint</span>
            <span style={{ textAlign: 'right', paddingRight: 8 }}>Compulsory / Frequency</span>
          </div>

          <div
            ref={assignGridRef}
            style={{
              flex: 1,
              minHeight: 0,
              border: `1px solid ${PM_T.border}`,
              borderRadius: assignListNarrow ? 8 : '0 0 8px 8px',
              background: '#F8FAFC',
              overflow: 'hidden',
            }}
          >
            {assignLoadingCheckpoints ? (
              <div style={{ padding: 40, textAlign: 'center' }}><Spin size="large" /></div>
            ) : filteredCheckpointRows.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
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
                  narrow: assignListNarrow,
                }}
                columnCount={assignColCount}
                columnWidth="100%"
                rowCount={assignRowCount}
                rowHeight={assignListNarrow ? 110 : ASSIGN_ROW_H}
                overscanCount={6}
                style={{ height: assignGridSize.height, width: assignGridSize.width }}
              />
            ) : null}
          </div>

          <div style={{
            flexShrink: 0,
            marginTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            paddingTop: 4,
          }}
          >
            <Text type="secondary" style={{ fontSize: 12 }}>
              Tick checkpoints → set frequency → Assign
            </Text>
            <Space>
              <Button onClick={closeAssignModal} style={{ borderRadius: 8 }}>Cancel</Button>
              <Button
                type="primary"
                htmlType="submit"
                disabled={!checkpointConfig.some((c) => c.is_required) || assignLoadingCheckpoints}
                style={{ borderRadius: 8, background: PM_T.primary, borderColor: PM_T.primary, fontWeight: 600 }}
              >
                Assign ({assignSelectedCount})
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

      <Modal
        open={statusOpen}
        onCancel={() => setStatusOpen(false)}
        footer={null}
        width={statusIsNarrow ? '100%' : 'min(1100px, 96vw)'}
        style={{ top: statusIsNarrow ? 0 : 20, maxWidth: '100%', paddingBottom: 0 }}
        styles={{
          body: {
            padding: statusIsNarrow ? 10 : 16,
            maxHeight: statusIsNarrow ? 'calc(100dvh - 72px)' : 'calc(100vh - 100px)',
            overflowY: 'auto',
            overflowX: 'hidden',
          },
        }}
        destroyOnClose
        title={(
          <div style={{ paddingRight: 28 }}>
            <div style={{ fontWeight: 700, fontSize: statusIsNarrow ? 13 : 15, color: '#1e3a5f' }}>
              Checkpoint Status — {dateLabel}
            </div>
            <div style={{ fontSize: statusIsNarrow ? 11 : 12, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>
              {selectedDate.format('DD MMM YYYY')}
              {' · '}
              {checkpointStatusSummary.total} total
              {' · '}
              {checkpointStatusSummary.pending} pending
              {' · '}
              {checkpointStatusSummary.missed} missed
              {checkpointStatusSummary.breakdown ? ` · ${checkpointStatusSummary.breakdown} breakdown` : ''}
            </div>
          </div>
        )}
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: statusIsNarrow ? '1fr 1fr' : 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8,
          marginBottom: 12,
        }}
        >
          {[
            {
              key: 'all',
              label: 'Total',
              value: checkpointStatusSummary.total,
              color: '#1e3a5f',
              bg: '#f1f5f9',
              icon: <UnorderedListOutlined />,
            },
            {
              key: 'completed',
              label: 'Completed',
              value: checkpointStatusSummary.completed,
              color: '#16a34a',
              bg: '#f0fdf4',
              icon: <CheckCircleOutlined />,
            },
            {
              key: 'pending',
              label: 'Pending',
              value: checkpointStatusSummary.pending,
              color: '#ca8a04',
              bg: '#fefce8',
              icon: <ClockCircleOutlined />,
            },
            {
              key: 'missed',
              label: 'Missed',
              value: checkpointStatusSummary.missed,
              color: '#6366f1',
              bg: '#eef2ff',
              icon: <ClockCircleOutlined />,
            },
            {
              key: 'breakdown',
              label: 'Breakdown',
              value: checkpointStatusSummary.breakdown,
              color: '#64748b',
              bg: '#f1f5f9',
              icon: <StopOutlined />,
            },
            {
              key: 'rejected',
              label: 'Rejected',
              value: checkpointStatusSummary.rejected,
              color: '#dc2626',
              bg: '#fef2f2',
              icon: <CloseCircleOutlined />,
            },
          ].map((card) => {
            const active = statusFilter === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  setStatusFilter(card.key);
                  setStatusPage(1);
                }}
                style={{
                  border: active ? `2px solid ${card.color}` : '1px solid #e2e8f0',
                  background: card.bg,
                  borderRadius: 8,
                  padding: statusIsNarrow ? '10px 10px' : '12px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: card.color, fontSize: 11, fontWeight: 600 }}>
                  {card.icon}
                  {card.label}
                </div>
                <div style={{ fontSize: statusIsNarrow ? 20 : 24, fontWeight: 800, color: card.color, lineHeight: 1.2, marginTop: 4 }}>
                  {card.value}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: statusIsNarrow ? '1fr' : 'minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.2fr)',
          gap: 8,
          marginBottom: 12,
        }}
        >
          <Select
            mode="multiple"
            allowClear
            showSearch
            maxTagCount="responsive"
            placeholder="Machines (multi)"
            value={statusMachineFilter}
            onChange={(v) => setStatusMachineFilter(v || [])}
            optionFilterProp="children"
            style={{ width: '100%' }}
          >
            {statusMachineOptions.map((m) => (
              <Option key={m.id} value={m.id}>{m.label}</Option>
            ))}
          </Select>
          <Select
            mode="multiple"
            allowClear
            showSearch
            maxTagCount="responsive"
            placeholder="Checklists (multi)"
            value={statusChecklistFilter}
            onChange={(v) => setStatusChecklistFilter(v || [])}
            optionFilterProp="children"
            style={{ width: '100%' }}
          >
            {statusChecklistOptions.map((name) => (
              <Option key={name} value={name}>{name}</Option>
            ))}
          </Select>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            placeholder="Search code / checkpoint / operator"
            value={statusSearch}
            onChange={(e) => setStatusSearch(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 8, fontSize: 12, color: '#64748b' }}>
          Showing {filteredStatusRows.length} of {checkpointStatusSummary.total}
        </div>

        {statusIsNarrow ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredStatusRows
              .slice((statusPage - 1) * statusPageSize, statusPage * statusPageSize)
              .map((r) => (
                <div
                  key={r.key}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    padding: '10px 12px',
                    background: '#fff',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                    <Text strong style={{ fontSize: 13, wordBreak: 'break-word' }}>
                      {r.code ? <span style={{ color: '#1e3a5f', marginRight: 6 }}>{r.code}</span> : null}
                      {r.checkpoint}
                    </Text>
                    {r.status === 'completed' && <Tag color="success">Completed</Tag>}
                    {r.status === 'rejected' && <Tag color="error">Rejected</Tag>}
                    {r.status === 'missed' && <Tag color="processing">Missed</Tag>}
                    {r.status === 'breakdown' && <Tag color="default">Breakdown</Tag>}
                    {r.status === 'pending' && <Tag color="warning">Pending</Tag>}
                  </div>
                  <div style={{ fontSize: 12, color: '#475569', display: 'grid', gap: 4 }}>
                    <div><span style={{ color: '#94a3b8' }}>Machine: </span>{r.machine_label}</div>
                    <div><span style={{ color: '#94a3b8' }}>Checklist: </span>{r.checklist_name}</div>
                    <div>
                      <span style={{ color: '#94a3b8' }}>Response: </span>
                      <span style={{
                        fontWeight: 700,
                        color: r.status === 'rejected' ? '#dc2626' : r.status === 'completed' ? '#16a34a' : '#64748b',
                      }}
                      >
                        {r.response_value ?? '—'}
                      </span>
                    </div>
                    <div><span style={{ color: '#94a3b8' }}>Operator: </span>{r.operator_name || '—'}</div>
                    <div><span style={{ color: '#94a3b8' }}>Submitted: </span>{r.submitted_at ? formatDateTime(r.submitted_at) : '—'}</div>
                  </div>
                </div>
              ))}
            {filteredStatusRows.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>No checkpoints for these filters.</div>
            )}
            {filteredStatusRows.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
                <Space>
                  <Button
                    size="small"
                    disabled={statusPage <= 1}
                    onClick={() => setStatusPage((p) => Math.max(1, p - 1))}
                    style={btnSharp}
                  >
                    Prev
                  </Button>
                  <Text style={{ fontSize: 12 }}>
                    {statusPage} / {Math.max(1, Math.ceil(filteredStatusRows.length / statusPageSize))}
                  </Text>
                  <Button
                    size="small"
                    disabled={statusPage >= Math.ceil(filteredStatusRows.length / statusPageSize)}
                    onClick={() => setStatusPage((p) => p + 1)}
                    style={btnSharp}
                  >
                    Next
                  </Button>
                  <Select
                    size="small"
                    value={statusPageSize}
                    onChange={(v) => { setStatusPageSize(v); setStatusPage(1); }}
                    style={{ width: 88 }}
                    options={[10, 20, 50, 100].map((n) => ({ value: n, label: `${n}/page` }))}
                  />
                </Space>
              </div>
            )}
          </div>
        ) : (
          <Table
            size="small"
            bordered
            rowKey="key"
            tableLayout="fixed"
            dataSource={filteredStatusRows}
            locale={{ emptyText: 'No checkpoints for these filters.' }}
            pagination={{
              current: statusPage,
              pageSize: statusPageSize,
              total: filteredStatusRows.length,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total}`,
              onChange: (page, size) => {
                setStatusPage(page);
                setStatusPageSize(size || 10);
              },
              position: ['bottomCenter'],
            }}
            columns={[
              {
                title: 'Machine',
                dataIndex: 'machine_label',
                key: 'machine',
                width: '18%',
                ellipsis: true,
              },
              {
                title: 'Checklist',
                dataIndex: 'checklist_name',
                key: 'checklist',
                width: '12%',
                ellipsis: true,
              },
              {
                title: 'Code',
                dataIndex: 'code',
                key: 'code',
                width: 88,
                ellipsis: true,
                render: (v) => (
                  <span style={{ fontWeight: 700, color: '#1e3a5f' }}>{v || '—'}</span>
                ),
              },
              {
                title: 'Checkpoint',
                dataIndex: 'checkpoint',
                key: 'checkpoint',
                ellipsis: true,
              },
              {
                title: 'Status',
                dataIndex: 'status',
                key: 'status',
                width: 100,
                render: (s) => {
                  if (s === 'completed') return <Tag color="success">Completed</Tag>;
                  if (s === 'rejected') return <Tag color="error">Rejected</Tag>;
                  if (s === 'missed') return <Tag color="processing">Missed</Tag>;
                  if (s === 'breakdown') return <Tag>Breakdown</Tag>;
                  return <Tag color="warning">Pending</Tag>;
                },
              },
              {
                title: 'Response',
                dataIndex: 'response_value',
                key: 'response',
                width: 90,
                render: (v, r) => (
                  <span style={{
                    fontWeight: 600,
                    color: r.status === 'rejected' ? '#dc2626' : r.status === 'completed' ? '#16a34a' : '#64748b',
                  }}
                  >
                    {v ?? '—'}
                  </span>
                ),
              },
              {
                title: 'Operator',
                dataIndex: 'operator_name',
                key: 'operator',
                width: 100,
                ellipsis: true,
                render: (v) => v || '—',
              },
              {
                title: 'Submitted',
                dataIndex: 'submitted_at',
                key: 'submitted',
                width: 120,
                render: (d) => (d ? dayjs(d).format('DD MMM HH:mm') : '—'),
              },
            ]}
          />
        )}
      </Modal>
    </div>
  );
};

export default PokaYokeMachineAssignments;