import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button, DatePicker, Empty, Input, Modal, Select, Spin, Tooltip } from 'antd';
import { Activity, Cpu, Filter, LayoutGrid, Map, PauseCircle, RefreshCw, WifiOff } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { getApiWsUrl } from '../auth/apiUrl';
import { API_BASE_URL } from '../Config/auth';
import { authFetch } from '../api/client.js';
import IsometricMachineView from './IsometricMachineView';

dayjs.extend(relativeTime);
const { Search: SearchInput } = Input;
const { RangePicker } = DatePicker;

const PROCESS_PARAM_OPTIONS = [
  { value: 'feed_rate', label: 'Feed Rate' },
  { value: 'spindle_speed', label: 'Spindle Speed' },
  { value: 'spindle_load', label: 'Spindle Load' },
];

const formatProcessValue = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

/* ─── Status config ─────────────────────────────────────────── */
const STATUS = {
  PRODUCTION: {
    cardBg: '#f0fdf4', cardBorder: '#86efac',
    pillBg: '#16a34a', pillText: '#fff', dot: '#22c55e',
    label: 'Production', pulse: true,
  },
  RUNNING: {
    cardBg: '#f0fdf4', cardBorder: '#86efac',
    pillBg: '#16a34a', pillText: '#fff', dot: '#22c55e',
    label: 'Running', pulse: true,
  },
  ON: {
    cardBg: '#fffbeb', cardBorder: '#fcd34d',
    pillBg: '#f59e0b', pillText: '#fff', dot: '#f59e0b',
    label: 'Idle', pulse: false,
  },
  IDLE: {
    cardBg: '#fffbeb', cardBorder: '#fcd34d',
    pillBg: '#f59e0b', pillText: '#fff', dot: '#f59e0b',
    label: 'Idle', pulse: false,
  },
  OFF: {
    cardBg: '#f8fafc', cardBorder: '#cbd5e1',
    pillBg: '#64748b', pillText: '#fff', dot: '#94a3b8',
    label: 'Offline', pulse: false,
  },
  OFFLINE: {
    cardBg: '#f8fafc', cardBorder: '#cbd5e1',
    pillBg: '#64748b', pillText: '#fff', dot: '#94a3b8',
    label: 'Offline', pulse: false,
  },
  NOT_CONNECTED: {
    cardBg: '#f8fafc', cardBorder: '#cbd5e1',
    pillBg: '#475569', pillText: '#fff', dot: '#94a3b8',
    label: 'Not Connected', pulse: false,
  },
  STOPPED: {
    cardBg: '#fff1f2', cardBorder: '#fca5a5',
    pillBg: '#dc2626', pillText: '#fff', dot: '#ef4444',
    label: 'Stopped', pulse: false,
  },
  MAINTENANCE: {
    cardBg: '#eff6ff', cardBorder: '#93c5fd',
    pillBg: '#2563eb', pillText: '#fff', dot: '#3b82f6',
    label: 'Maintenance', pulse: false,
  },
};
const getS = (s) => STATUS[s] || STATUS.OFFLINE;

const normalizeDisplayStatus = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return 'OFF';
  if (raw === 'ON') return 'IDLE';
  return raw;
};

/* ─── Filter key → matching statuses ───────────────────────── */
const FILTER_MATCH = {
  ALL:        () => true,
  PRODUCTION: (s) => s === 'PRODUCTION' || s === 'RUNNING',
  IDLE:       (s) => s === 'ON' || s === 'IDLE',
  OFFLINE:    (s) => s === 'OFF' || s === 'OFFLINE' || s === 'NOT_CONNECTED',
};

/* ─── Helpers ───────────────────────────────────────────────── */
const formatProgram = (path) => {
  if (path == null) return null;
  const raw = String(path).trim();
  if (!raw) return null;
  if (raw.includes('\\')) return raw.split('\\').pop() || raw;
  if (raw.includes('/')) return raw.split('/').pop() || raw;
  return raw;
};
const safeGet = (obj, key, fallback = null) => {
  if (obj?.[key] != null) return obj[key];
  if (obj?.production_details?.[key] != null) return obj.production_details[key];
  return fallback;
};

const getMonitoringWsUrl = () => getApiWsUrl('monitoring/live/ws');

/* Machines not on machine_live_status — activation comes from production_logs (backend) */
const DISCONNECTED_MACHINE_IDS = new Set([20, 21, 34, 35, 50, 51]);

/* ─── Status Pill ───────────────────────────────────────────── */
const StatusPill = ({ status }) => {
  const s = getS(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 99,
      background: s.pillBg, fontSize: 11, fontWeight: 700,
      color: s.pillText, letterSpacing: '0.05em', textTransform: 'uppercase',
      flexShrink: 0, whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: 'rgba(255,255,255,0.75)', display: 'inline-block',
        boxShadow: s.pulse ? '0 0 0 3px rgba(255,255,255,0.3)' : 'none',
      }} />
      {s.label}
    </span>
  );
};

/* ─── Field ─────────────────────────────────────────────────── */
const Field = ({ label, value, mono }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#64748b', marginBottom: 3 }}>
      {label}
    </div>
    <div style={{
      fontSize: 13, fontWeight: 500, color: value ? '#0f172a' : '#94a3b8',
      fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>
      {value || '—'}
    </div>
  </div>
);

/* ─── Quantity grid (4 equal divs) ──────────────────────────── */
const QuantityGrid = ({ machine, mode = 'activated' }) => {
  const isScheduledOnly = mode === 'scheduled';
  const isEmpty = mode === 'none';
  const items = [
    {
      label: 'Target',
      value: isEmpty ? 0 : safeGet(machine, 'part_qty', 0),
      color: '#334155',
      disabled: isEmpty,
    },
    {
      label: 'Produced',
      value: isScheduledOnly || isEmpty ? null : safeGet(machine, 'produced_qty', 0),
      color: '#2563eb',
      disabled: isScheduledOnly || isEmpty,
    },
    {
      label: 'Approved',
      value: isScheduledOnly || isEmpty ? null : safeGet(machine, 'approved_qty', 0),
      color: '#16a34a',
      disabled: isScheduledOnly || isEmpty,
    },
    {
      label: 'Rejected',
      value: isScheduledOnly || isEmpty ? null : safeGet(machine, 'rejected_qty', 0),
      color: '#dc2626',
      disabled: isScheduledOnly || isEmpty,
    },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background: item.disabled ? 'rgba(241,245,249,0.9)' : 'rgba(255,255,255,0.55)',
            border: `1px solid ${item.disabled ? 'rgba(148,163,184,0.45)' : 'rgba(148,163,184,0.3)'}`,
            borderRadius: 6,
            padding: '6px 4px',
            textAlign: 'center',
            opacity: item.disabled ? 0.55 : 1,
          }}
        >
          <div style={{
            fontSize: 15,
            fontWeight: 800,
            color: item.disabled ? '#94a3b8' : item.color,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {item.value == null ? '—' : item.value}
          </div>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginTop: 3 }}>
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Status pills ──────────────────────────────────────────── */
const OperatorStatusPill = ({ active }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 9px', borderRadius: 99,
    background: active ? '#16a34a' : '#94a3b8',
    fontSize: 10, fontWeight: 700, color: '#fff',
    letterSpacing: '0.05em', textTransform: 'uppercase',
  }}>
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: 'rgba(255,255,255,0.85)', display: 'inline-block',
    }} />
    {active ? 'Activated' : 'Inactive'}
  </span>
);

const ScheduleStatusPill = ({ scheduled }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 9px', borderRadius: 99,
    background: scheduled ? '#2563eb' : '#94a3b8',
    fontSize: 10, fontWeight: 700, color: '#fff',
    letterSpacing: '0.05em', textTransform: 'uppercase',
  }}>
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: 'rgba(255,255,255,0.85)', display: 'inline-block',
    }} />
    {scheduled ? 'Scheduled' : 'Not Scheduled'}
  </span>
);

/* ─── Process data modal (live values + history chart) ──────── */
const ProcessDataModal = ({ machine, open, onClose }) => {
  const [parameter, setParameter] = useState('feed_rate');
  const [dateRange, setDateRange] = useState([dayjs().subtract(1, 'day'), dayjs()]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setParameter('feed_rate');
    setDateRange([dayjs().subtract(1, 'day'), dayjs()]);
    setChartData([]);
    setError(null);
  }, [open, machine?.machine_id]);

  const loadChart = async () => {
    if (!machine?.machine_id || !parameter || !dateRange?.[0] || !dateRange?.[1]) return;
    setLoading(true);
    setError(null);
    try {
      const start = dateRange[0].startOf('day').toISOString();
      const end = dateRange[1].endOf('day').toISOString();
      const url =
        `${API_BASE_URL}/monitoring/process-data/${machine.machine_id}` +
        `?parameter=${encodeURIComponent(parameter)}` +
        `&start=${encodeURIComponent(start)}` +
        `&end=${encodeURIComponent(end)}`;
      const res = await authFetch(url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Failed to load (${res.status})`);
      }
      const data = await res.json();
      setChartData(
        (data.points || []).map((p) => ({
          timestamp: p.timestamp,
          label: dayjs(p.timestamp).format('DD MMM HH:mm'),
          value: p.value == null ? null : Number(p.value),
        }))
      );
    } catch (err) {
      setChartData([]);
      setError(err?.message || 'Failed to load process data');
    } finally {
      setLoading(false);
    }
  };

  const paramLabel = PROCESS_PARAM_OPTIONS.find((o) => o.value === parameter)?.label || parameter;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={820}
      destroyOnClose
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{machine?.machine_name || 'Machine'}</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#64748b', marginTop: 2 }}>
            Process parameters
          </div>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Feed Rate', value: machine?.feed_rate },
          { label: 'Spindle Speed', value: machine?.spindle_speed },
          { label: 'Spindle Load', value: machine?.spindle_load },
        ].map((item) => (
          <div
            key={item.label}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
              {item.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
              {formatProcessValue(item.value)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>
            Parameter
          </div>
          <Select
            value={parameter}
            onChange={setParameter}
            style={{ width: 170 }}
            options={PROCESS_PARAM_OPTIONS}
          />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>
            Date range
          </div>
          <RangePicker
            value={dateRange}
            onChange={(vals) => setDateRange(vals)}
            allowClear={false}
            style={{ width: 280 }}
          />
        </div>
        <Button type="primary" onClick={loadChart} loading={loading}>
          Show graph
        </Button>
      </div>

      {error && (
        <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 10 }}>{error}</div>
      )}

      <div style={{
        height: 320,
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        background: '#fff',
        padding: 12,
      }}>
        {loading ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spin />
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description={error ? 'Could not load data' : 'Select parameter & date range, then Show graph'} />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={28} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={56} />
              <RechartsTooltip
                labelFormatter={(_, payload) => {
                  const ts = payload?.[0]?.payload?.timestamp;
                  return ts ? dayjs(ts).format('DD MMM YYYY HH:mm:ss') : '';
                }}
                formatter={(value) => [formatProcessValue(value), paramLabel]}
              />
              <Line
                type="monotone"
                dataKey="value"
                name={paramLabel}
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Modal>
  );
};

/* ─── Machine Card ──────────────────────────────────────────── */
const MachineCard = ({ machine, onOpenProcess }) => {
  const status = machine.status || 'OFFLINE';
  const s = getS(status);
  const operatorStatus = String(machine.operator_status || 'INACTIVE').toUpperCase();
  const scheduleStatus = String(machine.schedule_status || 'NOT_SCHEDULED').toUpperCase();
  const jobSource = String(machine.job_source || 'NONE').toUpperCase();
  const isActivated = operatorStatus === 'ACTIVATED';
  const isScheduled = scheduleStatus === 'SCHEDULED';
  const hasProcessData = Boolean(machine.has_process_data)
    || machine.feed_rate != null
    || machine.spindle_speed != null
    || machine.spindle_load != null;
  const programLabel = formatProgram(machine.program_name);

  const activeStyle = STATUS.PRODUCTION;
  const scheduledStyle = { cardBg: '#eff6ff', cardBorder: '#93c5fd' };
  const inactiveStyle = STATUS.OFFLINE;
  const bodyStyle = isActivated
    ? activeStyle
    : (isScheduled ? scheduledStyle : inactiveStyle);
  const bodyBorder = bodyStyle.cardBorder;
  const bodyBg = bodyStyle.cardBg;
  const sameBorderColor = s.cardBorder === bodyBorder;

  const order   = safeGet(machine, 'production_order') || safeGet(machine, 'sale_order_number');
  const partNo  = safeGet(machine, 'part_number');
  const opNo    = safeGet(machine, 'operation_number');
  const opDesc  = safeGet(machine, 'operation_description') || safeGet(machine, 'operation_name');
  const qtyMode = jobSource === 'ACTIVATED'
    ? 'activated'
    : (jobSource === 'SCHEDULED' ? 'scheduled' : 'none');

  return (
    <div
      role={hasProcessData ? 'button' : undefined}
      tabIndex={hasProcessData ? 0 : undefined}
      onClick={() => { if (hasProcessData && onOpenProcess) onOpenProcess(machine); }}
      onKeyDown={(e) => {
        if (!hasProcessData || !onOpenProcess) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenProcess(machine);
        }
      }}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: hasProcessData ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s, transform 0.15s',
        minWidth: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      {/* Machine status */}
      <div style={{
        padding: '12px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        background: s.cardBg,
        border: `2.5px solid ${s.cardBorder}`,
        borderRadius: '10px 10px 0 0',
        minHeight: 48,
        boxSizing: 'border-box',
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.3,
            wordBreak: 'break-word',
          }}>
            {machine.machine_name || 'Unknown'}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Scheduled | Operator + job details */}
      <div style={{
        background: bodyBg,
        padding: '10px 14px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
        border: `2.5px solid ${bodyBorder}`,
        borderRadius: '0 0 10px 10px',
        marginTop: sameBorderColor ? -2.5 : 0,
        flex: 1,
        minHeight: 0,
        boxSizing: 'border-box',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#64748b' }}>
              Scheduled
            </div>
            <ScheduleStatusPill scheduled={isScheduled} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#64748b' }}>
              Operator Status
            </div>
            <OperatorStatusPill active={isActivated} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, flex: 1, minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <Field label="Production Order" value={order} />
            <Field label="Part Number" value={partNo} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: programLabel ? '1fr 1fr' : '1fr', gap: '0 14px' }}>
            <Field label="Operation" value={opNo ? `${opNo}${opDesc ? ' · ' + opDesc : ''}` : null} />
            {programLabel && <Field label="Program" value={programLabel} mono />}
          </div>
          <div style={{ marginTop: 'auto' }}>
            <QuantityGrid machine={machine} mode={qtyMode} />
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── KPI Tile ──────────────────────────────────────────────── */
const KpiTile = ({ label, value, icon: Icon, bg, filterKey, activeFilter, onClick }) => {
  const isActive = activeFilter === filterKey;
  return (
    <div
      onClick={onClick}
      style={{
        background: bg,
        borderRadius: 10,
        padding: '16px 20px',
        flex: 1,
        minWidth: 130,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: isActive
          ? '0 0 0 3px rgba(255,255,255,0.9), 0 0 0 5px rgba(255,255,255,0.5), 0 6px 20px rgba(0,0,0,0.25)'
          : '0 2px 8px rgba(0,0,0,0.12)',
        transform: isActive ? 'translateY(-2px)' : 'none',
        outline: isActive ? '2px solid rgba(255,255,255,0.8)' : 'none',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)'; } }}
    >
      <Icon size={28} color="rgba(255,255,255,0.85)" strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#fff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 4 }}>
          {label}
        </div>
      </div>
      {isActive && (
        <div style={{
          position: 'absolute', top: 8, right: 10,
          width: 8, height: 8, borderRadius: '50%',
          background: 'rgba(255,255,255,0.9)',
          boxShadow: '0 0 0 3px rgba(255,255,255,0.3)',
        }} />
      )}
    </div>
  );
};

/* ─── Main ──────────────────────────────────────────────────── */
const MachineDashboard = () => {
  const [machines, setMachines]               = useState([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [filterStatus, setFilterStatus]       = useState('ALL');
  const [searchQuery, setSearchQuery]         = useState('');
  const [refreshing, setRefreshing]           = useState(false);
  const [showFilters, setShowFilters]         = useState(false);
  const [sortOrder, setSortOrder]             = useState('status');
  const [viewMode, setViewMode]               = useState('card');
  const [selectedMachineIds, setSelectedMachineIds] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt]     = useState(null);
  const [isLiveUpdating, setIsLiveUpdating]   = useState(false);
  const [processMachine, setProcessMachine]   = useState(null);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const allowReconnectRef = useRef(true);
  const intentionalCloseRef = useRef(false);
  const updateFlashTimerRef = useRef(null);
  const hasLoadedRef = useRef(false);

  // Keep open process modal in sync with live websocket updates
  useEffect(() => {
    if (!processMachine?.machine_id) return;
    const updated = machines.find((m) => m.machine_id === processMachine.machine_id);
    if (updated) setProcessMachine(updated);
  }, [machines]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyMachines = (raw) => {
    const list = Array.isArray(raw) ? raw : [];
    setMachines(list.map(m => {
      const jobSource = String(m.job_source || 'NONE').toUpperCase();
      const partQty = m.part_qty ?? 0;
      const approvedQty = m.approved_qty ?? 0;
      const isDisconnected = DISCONNECTED_MACHINE_IDS.has(Number(m.machine_id));
      // Disconnected machines: trust backend (production_logs). Others: target===approved → complete
      const jobComplete = !isDisconnected
        && jobSource === 'ACTIVATED'
        && partQty > 0
        && partQty === approvedQty;

      const operatorStatus = jobComplete
        ? 'INACTIVE'
        : String(m.operator_status || 'INACTIVE').toUpperCase();
      const effectiveSource = jobComplete ? 'NONE' : jobSource;
      const scheduleStatus = operatorStatus === 'ACTIVATED'
        ? 'SCHEDULED'
        : (jobComplete
          ? 'NOT_SCHEDULED'
          : String(m.schedule_status || 'NOT_SCHEDULED').toUpperCase());
      const showDetails = effectiveSource === 'ACTIVATED' || effectiveSource === 'SCHEDULED';

      return {
        ...m,
        status: isDisconnected ? 'NOT_CONNECTED' : normalizeDisplayStatus(m.status),
        schedule_status: scheduleStatus,
        operator_status: operatorStatus,
        job_source: effectiveSource,
        is_disconnected: isDisconnected,
        program_name: m.program_name ?? m.programName ?? null,
        production_order: showDetails ? m.sale_order_number : null,
        sale_order_number: showDetails ? m.sale_order_number : null,
        part_number: showDetails ? m.part_number : null,
        operation_description: showDetails ? m.operation_name : null,
        operation_name: showDetails ? m.operation_name : null,
        operation_number: showDetails ? m.operation_number : null,
        part_qty: showDetails ? partQty : 0,
        produced_qty: effectiveSource === 'ACTIVATED' ? (m.produced_qty ?? 0) : 0,
        approved_qty: effectiveSource === 'ACTIVATED' ? approvedQty : 0,
        rejected_qty: effectiveSource === 'ACTIVATED' ? (m.rejected_qty ?? 0) : 0,
      };
    }));
    hasLoadedRef.current = true;
    setIsLoading(false);
    setLastUpdatedAt(dayjs());
    setIsLiveUpdating(true);
    if (updateFlashTimerRef.current) window.clearTimeout(updateFlashTimerRef.current);
    updateFlashTimerRef.current = window.setTimeout(() => setIsLiveUpdating(false), 900);
  };

  const connectSocket = useCallback(() => {
    if (reconnectTimerRef.current != null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      intentionalCloseRef.current = true;
      socketRef.current.close();
    }

    // Only show full-page spinner on the very first load
    if (!hasLoadedRef.current) setIsLoading(true);

    const socket = new WebSocket(getMonitoringWsUrl());
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        applyMachines(JSON.parse(event.data));
      } catch (err) {
        console.error('Failed to parse monitoring websocket payload:', err);
      }
    };

    socket.onerror = () => {
      if (!hasLoadedRef.current) setIsLoading(false);
    };

    socket.onclose = () => {
      if (intentionalCloseRef.current) {
        intentionalCloseRef.current = false;
        return;
      }
      if (allowReconnectRef.current && reconnectTimerRef.current == null) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          connectSocket();
        }, 5000);
      }
    };
  }, []);

  useEffect(() => {
    allowReconnectRef.current = true;
    connectSocket();

    return () => {
      allowReconnectRef.current = false;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (updateFlashTimerRef.current) {
        window.clearTimeout(updateFlashTimerRef.current);
        updateFlashTimerRef.current = null;
      }
      if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
        socketRef.current.close();
      }
    };
  }, [connectSocket]);

  const handleRefresh = () => {
    setRefreshing(true);
    allowReconnectRef.current = true;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connectSocket();
    window.setTimeout(() => setRefreshing(false), 800);
  };

  const handleKpiClick = (key) => {
    // Toggle off if already active
    setFilterStatus(prev => prev === key ? 'ALL' : key);
  };

  const stats = {
    total:      machines.length,
    production: machines.filter(m => FILTER_MATCH.PRODUCTION(m.status)).length,
    idle:       machines.filter(m => FILTER_MATCH.IDLE(m.status)).length,
    offline:    machines.filter(m => FILTER_MATCH.OFFLINE(m.status)).length,
  };

  const sorted = useMemo(() => {
    const getCardPriority = (m) => {
      const status = String(m.status || '').toUpperCase();
      const isActivated = String(m.operator_status || '').toUpperCase() === 'ACTIVATED';
      const isScheduled = String(m.schedule_status || '').toUpperCase() === 'SCHEDULED';
      const isProduction = status === 'PRODUCTION' || status === 'RUNNING';

      // 1) Production / Scheduled / Op Activated first
      if (isProduction || isActivated || isScheduled) {
        if (isProduction) return 0;
        if (isActivated) return 1;
        return 2; // scheduled
      }
      // 2) Idle
      if (status === 'IDLE' || status === 'ON') return 3;
      // 3) Offline
      if (status === 'OFF' || status === 'OFFLINE') return 4;
      // 4) Not Connected
      if (status === 'NOT_CONNECTED') return 5;
      return 6;
    };

    const matchFn = FILTER_MATCH[filterStatus] || FILTER_MATCH.ALL;
    const selectedIds = (selectedMachineIds || [])
      .filter((id) => id !== 'ALL')
      .map((id) => Number(id));
    const hasMachineFilter = selectedIds.length > 0;

    return [...machines]
      .filter((m) => {
        if (!matchFn(m.status)) return false;
        if (searchQuery && !(m.machine_name || '').toLowerCase().includes(searchQuery.toLowerCase())) {
          return false;
        }
        if (hasMachineFilter && !selectedIds.includes(Number(m.machine_id))) {
          return false;
        }
        return true;
      })
      .sort((a, b) =>
        sortOrder === 'name'
          ? (a.machine_name || '').localeCompare(b.machine_name || '')
          : getCardPriority(a) - getCardPriority(b) || (a.machine_name || '').localeCompare(b.machine_name || '')
      );
  }, [machines, filterStatus, searchQuery, sortOrder, selectedMachineIds]);

  return (
    <div style={{
      background: '#f1f5f9',
      height: '100%',
      maxHeight: '100%',
      overflow: viewMode === 'iso' ? 'hidden' : 'auto',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: viewMode === 'iso' ? '12px 16px' : '24px',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: viewMode === 'iso' ? 10 : 20, flexWrap: 'wrap', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 8,
          background: '#fff', border: '1px solid #e2e8f0',
        }}>
          <span className="lm-live-dot" />
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.08em', color: '#15803d' }}>
            LIVE
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
            {lastUpdatedAt ? lastUpdatedAt.format('HH:mm:ss') : dayjs().format('HH:mm:ss')}
          </span>
          <RefreshCw
            size={13}
            color={isLiveUpdating ? '#16a34a' : '#94a3b8'}
            className={isLiveUpdating ? 'lm-refresh-spin' : undefined}
            style={{ opacity: isLiveUpdating ? 1 : 0.45, flexShrink: 0 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select
            mode="multiple"
            placeholder="Select Machines"
            style={{ width: 200, minWidth: 200, maxWidth: 200 }}
            size="small"
            allowClear
            maxTagCount="responsive"
            maxTagPlaceholder={(omitted) => `+${omitted.length} selected`}
            value={selectedMachineIds}
            onChange={(values) => {
              const next = values || [];
              // Selecting ALL clears filter (show every machine)
              if (next.includes('ALL')) {
                setSelectedMachineIds([]);
                return;
              }
              setSelectedMachineIds(next);
            }}
            options={[
              { label: 'ALL', value: 'ALL' },
              ...machines.map(m => ({ label: m.machine_name, value: m.machine_id }))
            ]}
          />
          {/* View toggle */}
          <div style={{
            display: 'flex', background: '#e2e8f0', borderRadius: 7, padding: 3, gap: 2,
          }}>
            <button
              onClick={() => setViewMode('iso')}
              title="Isometric View"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', border: 'none', borderRadius: 5, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: viewMode === 'iso' ? '#fff' : 'transparent',
                color: viewMode === 'iso' ? '#2563eb' : '#64748b',
                boxShadow: viewMode === 'iso' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              <Map size={13} />
              ISO
            </button>
            <button
              onClick={() => setViewMode('card')}
              title="Card View"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', border: 'none', borderRadius: 5, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                background: viewMode === 'card' ? '#fff' : 'transparent',
                color: viewMode === 'card' ? '#2563eb' : '#64748b',
                boxShadow: viewMode === 'card' ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
              }}
            >
              <LayoutGrid size={13} />
              Cards
            </button>
          </div>
          {viewMode === 'card' && (
            <>
              <Button size="small" onClick={handleRefresh} icon={<RefreshCw size={13} style={{ verticalAlign: 'middle' }} />} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                Refresh
              </Button>
              <Button size="small" type={showFilters ? 'primary' : 'default'} onClick={() => setShowFilters(v => !v)} icon={<Filter size={13} style={{ verticalAlign: 'middle' }} />} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                Filters
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Isometric view */}
      {viewMode === 'iso' && (
        <div style={{
          borderRadius: 10, overflow: 'hidden', flex: 1, minHeight: 0,
          border: '1px solid #e2e8f0', background: '#fff',
        }}>
          <IsometricMachineView embedded={true} selectedMachineIds={selectedMachineIds} liveMachines={machines} />
        </div>
      )}

      {/* Card view — KPI, filters, grid */}
      {viewMode === 'card' && (
        <>
          {/* KPI row — clickable tiles filter the grid */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <KpiTile
              label="Total Machines"  value={stats.total}
              icon={Cpu}         bg="#2563eb"
              filterKey="ALL"    activeFilter={filterStatus}
              onClick={() => handleKpiClick('ALL')}
            />
            <KpiTile
              label="In Production"   value={stats.production}
              icon={Activity}    bg="#16a34a"
              filterKey="PRODUCTION"  activeFilter={filterStatus}
              onClick={() => handleKpiClick('PRODUCTION')}
            />
            <KpiTile
              label="Idle"            value={stats.idle}
              icon={PauseCircle} bg="#d97706"
              filterKey="IDLE"   activeFilter={filterStatus}
              onClick={() => handleKpiClick('IDLE')}
            />
            <KpiTile
              label="Offline"         value={stats.offline}
              icon={WifiOff}     bg="#475569"
              filterKey="OFFLINE" activeFilter={filterStatus}
              onClick={() => handleKpiClick('OFFLINE')}
            />
          </div>

          {/* Filters panel */}
          {showFilters && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '13px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>Status</div>
                <Select value={filterStatus} onChange={setFilterStatus} size="small" style={{ width: 140 }}>
                  <Select.Option value="ALL">All</Select.Option>
                  <Select.Option value="PRODUCTION">Production</Select.Option>
                  <Select.Option value="IDLE">Idle</Select.Option>
                  <Select.Option value="OFFLINE">Offline</Select.Option>
                </Select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>Sort</div>
                <Select value={sortOrder} onChange={setSortOrder} size="small" style={{ width: 130 }}>
                  <Select.Option value="status">By Status</Select.Option>
                  <Select.Option value="name">By Name</Select.Option>
                </Select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 5 }}>Search</div>
                <SearchInput placeholder="Search machines…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} size="small" style={{ width: 200 }} allowClear />
              </div>
              {(filterStatus !== 'ALL' || searchQuery) && (
                <Button size="small" type="link" style={{ fontSize: 12, padding: 0 }} onClick={() => { setFilterStatus('ALL'); setSearchQuery(''); }}>Clear all</Button>
              )}
            </div>
          )}

          {/* Grid label */}
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
              {sorted.length} machine{sorted.length !== 1 ? 's' : ''}{(filterStatus !== 'ALL' || searchQuery || selectedMachineIds.length > 0) ? ' · filtered' : ''}
            </span>
          </div>

          {/* Machine grid */}
          {isLoading ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '60px 0', textAlign: 'center' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>Loading machine data…</div>
            </div>
          ) : sorted.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
              gap: 12,
              alignItems: 'stretch',
            }}>
              {sorted.map(machine => (
                <MachineCard
                  key={machine.machine_id}
                  machine={machine}
                  onOpenProcess={setProcessMachine}
                />
              ))}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '60px 0' }}>
              <Empty description={
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>No machines match your filters</span>
                  <Button size="small" onClick={() => { setFilterStatus('ALL'); setSearchQuery(''); }}>Clear filters</Button>
                </div>
              } />
            </div>
          )}
        </>
      )}

      <ProcessDataModal
        machine={processMachine}
        open={Boolean(processMachine)}
        onClose={() => setProcessMachine(null)}
      />

      <style>{`
        @keyframes lmLivePulse {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.55); }
          70% { box-shadow: 0 0 0 9px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        @keyframes lmRefreshSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .lm-live-dot {
          width: 9px; height: 9px; border-radius: 50%;
          background: #22c55e; display: inline-block; flex-shrink: 0;
          animation: lmLivePulse 1.4s ease-out infinite;
        }
        .lm-refresh-spin { animation: lmRefreshSpin 0.8s linear infinite; }
      `}</style>
    </div>
  );
};

export default MachineDashboard;