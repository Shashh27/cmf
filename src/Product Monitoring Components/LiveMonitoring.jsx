import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Button, Empty, Input, Modal, Select, Spin, Tooltip } from 'antd';
import { Activity, Cpu, Filter, LayoutGrid, Map, PauseCircle, RefreshCw, WifiOff } from 'lucide-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { API_BASE_URL } from '../Config/auth';
import { getApiWsUrl } from '../auth/apiUrl';
import IsometricMachineView from './IsometricMachineView';

dayjs.extend(relativeTime);
const { Search: SearchInput } = Input;

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
  OFFLINE:    (s) => s === 'OFF' || s === 'OFFLINE',
};

/* ─── Helpers ───────────────────────────────────────────────── */
const formatProgram = (path) => {
  if (!path) return null;
  if (path.includes('\\')) return path.split('\\').pop();
  if (path.includes('/')) return path.split('/').pop();
  return path;
};
const safeGet = (obj, key, fallback = null) => {
  if (obj?.[key] != null) return obj[key];
  if (obj?.production_details?.[key] != null) return obj.production_details[key];
  return fallback;
};

const getMonitoringWsUrl = () => getApiWsUrl('monitoring/live/ws');

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
const QuantityGrid = ({ machine }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
    {[
      { label: 'Target', value: safeGet(machine, 'part_qty', 0), color: '#334155' },
      { label: 'Produced', value: safeGet(machine, 'produced_qty', 0), color: '#2563eb' },
      { label: 'Approved', value: safeGet(machine, 'approved_qty', 0), color: '#16a34a' },
      { label: 'Rejected', value: safeGet(machine, 'rejected_qty', 0), color: '#dc2626' },
    ].map((item) => (
      <div
        key={item.label}
        style={{
          background: 'rgba(255,255,255,0.55)',
          border: '1px solid rgba(148,163,184,0.3)',
          borderRadius: 6,
          padding: '6px 4px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 800, color: item.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {item.value}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b', marginTop: 3 }}>
          {item.label}
        </div>
      </div>
    ))}
  </div>
);

/* ─── Machine Card ──────────────────────────────────────────── */
const MachineCard = ({ machine, onClick }) => {
  const status = machine.status || 'OFFLINE';
  const s = getS(status);
  const order   = safeGet(machine, 'production_order') || safeGet(machine, 'sale_order_number');
  const partNo  = safeGet(machine, 'part_number');
  const opNo    = safeGet(machine, 'operation_number');
  const opDesc  = safeGet(machine, 'operation_description') || safeGet(machine, 'operation_name');
  const rawProg = safeGet(machine, 'active_program') || safeGet(machine, 'program_number') || safeGet(machine, 'selected_program');
  const prog    = formatProgram(rawProg);

  return (
    <div
      onClick={onClick}
      style={{
        background: s.cardBg, border: `1.5px solid ${s.cardBorder}`,
        borderRadius: 10, cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s', overflow: 'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 18px rgba(0,0,0,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ padding: '12px 14px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.3, wordBreak: 'break-word' }}>
            {machine.machine_name || 'Unknown'}
          </div>
        </div>
        <StatusPill status={status} />
      </div>
      <div style={{ height: 1, background: s.cardBorder, opacity: 0.5, margin: '0 14px' }} />
      <div style={{ padding: '11px 14px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
          <Field label="Production Order" value={order} />
          <Field label="Part Number" value={partNo} />
        </div>
        <Field label="Operation" value={opNo ? `${opNo}${opDesc ? ' · ' + opDesc : ''}` : null} />
        <QuantityGrid machine={machine} />
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

/* ─── Machine Details Modal ─────────────────────────────────── */
const MachineModal = ({ machine, onClose }) => {
  if (!machine) return null;
  const status = machine.status || 'OFFLINE';
  const s = getS(status);
  const order   = safeGet(machine, 'production_order') || safeGet(machine, 'sale_order_number');
  const partNo  = safeGet(machine, 'part_number');
  const opNo    = safeGet(machine, 'operation_number');
  const opDesc  = safeGet(machine, 'operation_description') || safeGet(machine, 'operation_name');
  const rawProg = safeGet(machine, 'active_program') || safeGet(machine, 'program_number') || safeGet(machine, 'selected_program');
  const prog    = formatProgram(rawProg);

  const MRow = ({ label, value, mono }) => (
    <div style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: value ? '#0f172a' : '#cbd5e1', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}>
        {value || 'Not assigned'}
      </div>
    </div>
  );

  return (
    <Modal open={!!machine} onCancel={onClose} footer={null} width={560} centered styles={{ body: { padding: 0 } }} title={null}>
      <div style={{ padding: '18px 22px 14px', background: s.cardBg, borderBottom: `2px solid ${s.cardBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>Machine Details</div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{machine.machine_name || 'Unknown'}</h2>
        </div>
        <StatusPill status={status} />
      </div>
      <div style={{ padding: '18px 22px 22px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <MRow label="Production Order" value={order} />
          <MRow label="Part Number" value={partNo} />
          <MRow label="Operation" value={opNo ? `${opNo}${opDesc ? ' · ' + opDesc : ''}` : null} />
        </div>

        <div style={{ marginBottom: 16 }}>
          <QuantityGrid machine={machine} />
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8' }}>
          Last updated: <span style={{ color: '#475569', fontWeight: 600 }}>{dayjs(machine.last_updated).format('YYYY-MM-DD HH:mm:ss')}</span>
        </div>
      </div>
    </Modal>
  );
};

/* ─── Main ──────────────────────────────────────────────────── */
const MachineDashboard = () => {
  const [machines, setMachines]               = useState([]);
  const [isLoading, setIsLoading]             = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [filterStatus, setFilterStatus]       = useState('ALL');
  const [searchQuery, setSearchQuery]         = useState('');
  const [refreshing, setRefreshing]           = useState(false);
  const [showFilters, setShowFilters]         = useState(false);
  const [sortOrder, setSortOrder]             = useState('status');
  const [viewMode, setViewMode]               = useState('iso');
  const [selectedMachineIds, setSelectedMachineIds] = useState([]);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const allowReconnectRef = useRef(true);

  const applyMachines = (raw) => {
    const list = Array.isArray(raw) ? raw : [];
    setMachines(list.map(m => ({
      ...m,
      status: normalizeDisplayStatus(m.status),
      production_order: m.sale_order_number,
      operation_description: m.operation_name,
      part_qty: m.part_qty ?? 0,
      produced_qty: m.produced_qty ?? 0,
      approved_qty: m.approved_qty ?? 0,
      rejected_qty: m.rejected_qty ?? 0,
    })));
  };

  const connectSocket = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState < WebSocket.CLOSING) {
      socketRef.current.close();
    }

    setIsLoading(true);
    const socket = new WebSocket(getMonitoringWsUrl());
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        applyMachines(JSON.parse(event.data));
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to parse monitoring websocket payload:', err);
      }
    };

    socket.onerror = () => {
      setIsLoading(false);
    };

    socket.onclose = () => {
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
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
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
    const PRI = { PRODUCTION: 0, RUNNING: 0, ON: 1, IDLE: 1, STOPPED: 2, MAINTENANCE: 3, OFF: 4, OFFLINE: 4 };
    const matchFn = FILTER_MATCH[filterStatus] || FILTER_MATCH.ALL;
    return [...machines]
      .filter(m =>
        matchFn(m.status) &&
        (!searchQuery || (m.machine_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) =>
        sortOrder === 'name'
          ? (a.machine_name || '').localeCompare(b.machine_name || '')
          : (PRI[a.status] ?? 9) - (PRI[b.status] ?? 9)
      );
  }, [machines, filterStatus, searchQuery, sortOrder]);

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', padding: '24px' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 0 3px #22c55e28' }} />
            <span style={{ fontSize: 14, color: '#0f172a' }}>Live · {dayjs().format('HH:mm:ss')}</span>
          </div>
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
            onChange={(values) => setSelectedMachineIds(values || [])}
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
        <div style={{ borderRadius: 10, overflow: 'hidden', height: 'calc(100vh - 120px)', border: '1px solid #e2e8f0' }}>
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
              {sorted.length} machine{sorted.length !== 1 ? 's' : ''}{filterStatus !== 'ALL' || searchQuery ? ' · filtered' : ''}
            </span>
          </div>

          {/* Machine grid */}
          {isLoading ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '60px 0', textAlign: 'center' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, fontSize: 13, color: '#94a3b8' }}>Loading machine data…</div>
            </div>
          ) : sorted.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))', gap: 12 }}>
              {sorted.map(machine => (
                <MachineCard key={machine.machine_id} machine={machine} onClick={() => setSelectedMachine(machine)} />
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

          <MachineModal machine={selectedMachine} onClose={() => setSelectedMachine(null)} />
        </>
      )}
    </div>
  );
};

export default MachineDashboard;