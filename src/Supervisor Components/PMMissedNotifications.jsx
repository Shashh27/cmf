import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, message, Spin, Empty, Tag, Input, Typography, Segmented,
  DatePicker, Select, Modal,
} from 'antd';
import {
  CheckCircleOutlined, ReloadOutlined, BellOutlined, ClearOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { pmFetch, getCurrentUserLabel, formatDateTime, disableFutureDates } from './pmUtils';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const filterCtrl = {
  flex: '1 1 120px',
  minWidth: 110,
  maxWidth: 200,
};

/**
 * Compulsory PM checkpoints not submitted by 5 PM.
 * Always loads full list so Ack keeps rows visible (marked Acknowledged).
 */
const PMMissedNotifications = ({ onCount }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ackAllLoading, setAckAllLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [view, setView] = useState('pending'); // pending | all
  const [dateRange, setDateRange] = useState(null);
  const [machineFilter, setMachineFilter] = useState([]);
  const [checkpointFilter, setCheckpointFilter] = useState([]);
  const [checklistFilter, setChecklistFilter] = useState([]);
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 720 : false,
  );

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 720);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const reportBadge = useCallback((list) => {
    if (onCount) onCount(list.filter((n) => !n.is_ack).length);
  }, [onCount]);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      // Always load all — Pending/All is client filter so Ack does not remove rows
      const data = await pmFetch('/missed-notifications?pending_only=false&limit=500');
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      reportBadge(list);
    } catch (e) {
      message.error(e.message || 'Failed to load missed notifications');
      setRows([]);
      reportBadge([]);
    } finally {
      setLoading(false);
    }
  }, [reportBadge]);

  useEffect(() => {
    fetchRows();
    const t = setInterval(fetchRows, 60000);
    return () => clearInterval(t);
  }, [fetchRows]);

  const markAckedLocally = (ids, ackByName) => {
    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();
    setRows((prev) => {
      const next = prev.map((r) => (
        idSet.has(r.id)
          ? {
            ...r,
            is_ack: true,
            ack_by: ackByName,
            ack_by_name: ackByName,
            ack_at: nowIso,
          }
          : r
      ));
      reportBadge(next);
      return next;
    });
    setView('all');
  };

  const ackQuery = () => {
    const label = getCurrentUserLabel();
    return label ? `?ack_by=${encodeURIComponent(String(label))}` : '';
  };

  const machineOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const label = r.machine_label || (r.machine_id != null ? `Machine ${r.machine_id}` : null);
      if (label) map.set(label, label);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const checkpointOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { if (r.item_text) set.add(r.item_text); });
    return Array.from(set).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const checklistOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => { if (r.checklist_name) set.add(r.checklist_name); });
    return Array.from(set).sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const [from, to] = dateRange || [];
    const machineSet = machineFilter.length ? new Set(machineFilter) : null;
    const checkpointSet = checkpointFilter.length ? new Set(checkpointFilter) : null;
    const checklistSet = checklistFilter.length ? new Set(checklistFilter) : null;

    return rows.filter((r) => {
      if (view === 'pending' && r.is_ack) return false;

      if (machineSet) {
        const label = r.machine_label || (r.machine_id != null ? `Machine ${r.machine_id}` : '');
        if (!machineSet.has(label)) return false;
      }
      if (checkpointSet && !checkpointSet.has(r.item_text || '')) return false;
      if (checklistSet && !checklistSet.has(r.checklist_name || '')) return false;

      if (from || to) {
        const due = r.due_date ? dayjs(r.due_date).startOf('day') : null;
        if (!due || !due.isValid()) return false;
        if (from && due.isBefore(dayjs(from).startOf('day'))) return false;
        if (to && due.isAfter(dayjs(to).endOf('day'))) return false;
      }

      if (!q) return true;
      return [
        r.message, r.item_text, r.machine_label, r.checklist_name, r.due_date,
      ].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [rows, query, dateRange, machineFilter, checkpointFilter, checklistFilter, view]);

  const pendingFiltered = useMemo(() => filtered.filter((r) => !r.is_ack), [filtered]);
  const pendingTotal = useMemo(() => rows.filter((r) => !r.is_ack).length, [rows]);

  const hasActiveFilters = !!(
    query.trim()
    || (dateRange && dateRange.length)
    || machineFilter.length
    || checkpointFilter.length
    || checklistFilter.length
  );

  const clearFilters = () => {
    setQuery('');
    setDateRange(null);
    setMachineFilter([]);
    setCheckpointFilter([]);
    setChecklistFilter([]);
    setPage(1);
  };

  const handleAck = async (id) => {
    try {
      const label = getCurrentUserLabel();
      await pmFetch(`/missed-notifications/${id}/ack${ackQuery()}`, { method: 'POST' });
      message.success('Acknowledged');
      markAckedLocally([id], label);
    } catch (e) {
      message.error(e.message || 'Acknowledge failed');
    }
  };

  const runAckAll = async (ids) => {
    setAckAllLoading(true);
    try {
      const label = getCurrentUserLabel();
      const res = await pmFetch(`/missed-notifications/ack-all${ackQuery()}`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      const count = res?.count ?? ids.length;
      message.success(count ? `Acknowledged ${count} notification(s)` : 'No pending notifications to acknowledge');
      markAckedLocally(ids, label);
    } catch (e) {
      message.error(e.message || 'Acknowledge all failed');
    } finally {
      setAckAllLoading(false);
    }
  };

  const handleAckAll = () => {
    const targets = pendingFiltered;
    if (!targets.length) {
      message.info('No pending notifications to acknowledge');
      return;
    }
    const scopeNote = hasActiveFilters
      ? `the ${targets.length} filtered pending notification(s)`
      : `all ${targets.length} pending notification(s)`;
    Modal.confirm({
      title: 'Acknowledge all?',
      content: `This will acknowledge ${scopeNote}. Rows stay visible as Acknowledged.`,
      okText: 'Acknowledge all',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: () => runAckAll(targets.map((r) => r.id)),
    });
  };

  const columns = [
    {
      title: 'Sl',
      key: 'sl',
      width: 44,
      render: (_, __, i) => (page - 1) * pageSize + i + 1,
    },
    {
      title: 'Due',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 96,
      render: (d) => (d ? dayjs(d).format('DD MMM YY') : '—'),
    },
    {
      title: 'Machine',
      dataIndex: 'machine_label',
      key: 'machine',
      width: 140,
      ellipsis: true,
      render: (t) => t || '—',
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist_name',
      key: 'checklist',
      width: 110,
      ellipsis: true,
      render: (t) => t || '—',
    },
    {
      title: 'Checkpoint',
      dataIndex: 'item_text',
      key: 'item',
      ellipsis: true,
      render: (t, r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{t || '—'}</div>
          {r.message ? (
            <Text type="secondary" style={{ fontSize: 10 }}>{r.message}</Text>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_ack',
      key: 'status',
      width: 108,
      render: (ack) => (
        ack
          ? <Tag color="success" style={{ margin: 0, fontSize: 11 }}>Acknowledged</Tag>
          : <Tag color="error" style={{ margin: 0, fontSize: 11 }}>Missed</Tag>
      ),
    },
    {
      title: 'Ack by',
      key: 'ack_by',
      width: 110,
      ellipsis: true,
      render: (_, r) => (
        r.is_ack
          ? <Text style={{ fontSize: 12 }}>{r.ack_by_name || r.ack_by || '—'}</Text>
          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
      ),
    },
    {
      title: 'Ack at',
      dataIndex: 'ack_at',
      key: 'ack_at',
      width: 120,
      render: (d, r) => (
        r.is_ack
          ? <Text style={{ fontSize: 11 }}>{d ? formatDateTime(d) : '—'}</Text>
          : <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created',
      width: 120,
      render: (d) => (d ? formatDateTime(d) : '—'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 72,
      fixed: isNarrow ? undefined : 'right',
      render: (_, r) => (
        r.is_ack ? (
          <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
        ) : (
          <Button
            type="primary"
            size="small"
            ghost
            icon={<CheckCircleOutlined />}
            onClick={() => handleAck(r.id)}
          >
            Ack
          </Button>
        )
      ),
    },
  ];

  const filterBar = (
    <div
      className="pm-missed-filters"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        flex: '1 1 280px',
        minWidth: 0,
      }}
    >
      <RangePicker
        size="small"
        value={dateRange}
        onChange={(v) => { setDateRange(v); setPage(1); }}
        format="DD/MM/YY"
        allowClear
        disabledDate={disableFutureDates}
        placeholder={['From', 'To']}
        style={{ ...filterCtrl, flex: '1 1 160px', maxWidth: 210, minWidth: 150 }}
      />
      <Select
        size="small"
        mode="multiple"
        allowClear
        maxTagCount={1}
        placeholder="Machine"
        options={machineOptions}
        value={machineFilter}
        onChange={(v) => { setMachineFilter(v); setPage(1); }}
        style={filterCtrl}
        showSearch
        optionFilterProp="label"
      />
      <Select
        size="small"
        mode="multiple"
        allowClear
        maxTagCount={1}
        placeholder="Checkpoint"
        options={checkpointOptions}
        value={checkpointFilter}
        onChange={(v) => { setCheckpointFilter(v); setPage(1); }}
        style={filterCtrl}
        showSearch
        optionFilterProp="label"
      />
      <Select
        size="small"
        mode="multiple"
        allowClear
        maxTagCount={1}
        placeholder="Checklist"
        options={checklistOptions}
        value={checklistFilter}
        onChange={(v) => { setChecklistFilter(v); setPage(1); }}
        style={{ ...filterCtrl, maxWidth: 160 }}
        showSearch
        optionFilterProp="label"
      />
      <Input.Search
        size="small"
        allowClear
        placeholder="Search…"
        style={{ ...filterCtrl, maxWidth: 160 }}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1); }}
      />
      {hasActiveFilters ? (
        <Button size="small" icon={<ClearOutlined />} onClick={clearFilters}>
          Clear
        </Button>
      ) : null}
    </div>
  );

  const actionsBar = (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      alignItems: 'center',
      flexShrink: 0,
    }}
    >
      <Segmented
        size="small"
        value={view}
        onChange={(v) => { setView(v); setPage(1); }}
        options={[
          { label: `Pending (${pendingTotal})`, value: 'pending' },
          { label: 'All', value: 'all' },
        ]}
      />
      <Button
        type="primary"
        size="small"
        icon={<CheckCircleOutlined />}
        loading={ackAllLoading}
        disabled={!pendingFiltered.length}
        onClick={handleAckAll}
      >
        {isNarrow
          ? `Ack all${pendingFiltered.length ? ` (${pendingFiltered.length})` : ''}`
          : `Acknowledge all${pendingFiltered.length ? ` (${pendingFiltered.length})` : ''}`}
      </Button>
      <Button size="small" icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>
        Refresh
      </Button>
    </div>
  );

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <style>{`
        .pm-missed-filters .ant-picker,
        .pm-missed-filters .ant-select,
        .pm-missed-filters .ant-input-search {
          font-size: 12px;
        }
        .pm-missed-card {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fff;
          padding: 10px 12px;
        }
        @media (max-width: 720px) {
          .pm-missed-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .pm-missed-filters {
            width: 100%;
          }
          .pm-missed-filters > * {
            flex: 1 1 calc(50% - 6px) !important;
            max-width: none !important;
            min-width: 0 !important;
          }
        }
      `}</style>

      <div
        className="pm-missed-header"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flex: '1 1 220px',
          minWidth: 0,
          flexWrap: 'wrap',
        }}
        >
          <div style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexShrink: 0,
          }}
          >
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: '#fef2f2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
            }}
            >
              <BellOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <Text strong style={{ fontSize: 13, color: '#1e3a5f', display: 'block', lineHeight: 1.2 }}>
                Compulsory missed notifications
              </Text>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Not submitted by 5 PM
              </Text>
            </div>
          </div>
          {filterBar}
        </div>
        {actionsBar}
      </div>

      <div style={{ marginBottom: 8, fontSize: 11, color: '#64748b' }}>
        Showing {filtered.length} of {rows.length}
        {pendingFiltered.length ? ` · ${pendingFiltered.length} pending in view` : ''}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin size="small" /></div>
      ) : filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={view === 'pending' ? 'No pending compulsory misses' : 'No missed notifications'}
        />
      ) : isNarrow ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered
            .slice((page - 1) * pageSize, page * pageSize)
            .map((r) => (
              <div key={r.id} className="pm-missed-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <Text strong style={{ fontSize: 12, wordBreak: 'break-word' }}>{r.item_text || '—'}</Text>
                  {r.is_ack
                    ? <Tag color="success" style={{ margin: 0, fontSize: 11 }}>Acknowledged</Tag>
                    : <Tag color="error" style={{ margin: 0, fontSize: 11 }}>Missed</Tag>}
                </div>
                <div style={{ fontSize: 11, color: '#475569', display: 'grid', gap: 3 }}>
                  <div><span style={{ color: '#94a3b8' }}>Due: </span>{r.due_date ? dayjs(r.due_date).format('DD MMM YYYY') : '—'}</div>
                  <div><span style={{ color: '#94a3b8' }}>Machine: </span>{r.machine_label || '—'}</div>
                  <div><span style={{ color: '#94a3b8' }}>Checklist: </span>{r.checklist_name || '—'}</div>
                  <div><span style={{ color: '#94a3b8' }}>Created: </span>{r.created_at ? formatDateTime(r.created_at) : '—'}</div>
                  {r.is_ack ? (
                    <>
                      <div><span style={{ color: '#94a3b8' }}>Ack by: </span>{r.ack_by_name || r.ack_by || '—'}</div>
                      <div><span style={{ color: '#94a3b8' }}>Ack at: </span>{r.ack_at ? formatDateTime(r.ack_at) : '—'}</div>
                    </>
                  ) : null}
                </div>
                {!r.is_ack && (
                  <div style={{ marginTop: 8 }}>
                    <Button
                      type="primary"
                      size="small"
                      ghost
                      block
                      icon={<CheckCircleOutlined />}
                      onClick={() => handleAck(r.id)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                )}
              </div>
            ))}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 4, flexWrap: 'wrap' }}>
            <Button size="small" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
            <Text style={{ fontSize: 11, lineHeight: '24px' }}>
              {page} / {Math.max(1, Math.ceil(filtered.length / pageSize))}
            </Text>
            <Button
              size="small"
              disabled={page >= Math.ceil(filtered.length / pageSize)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Select
              size="small"
              value={pageSize}
              onChange={(v) => { setPageSize(v); setPage(1); }}
              style={{ width: 84 }}
              options={[10, 20, 50].map((n) => ({ value: n, label: `${n}/page` }))}
            />
          </div>
        </div>
      ) : (
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 1040 }}
          pagination={{
            current: page,
            pageSize,
            total: filtered.length,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
            size: 'small',
          }}
        />
      )}
    </div>
  );
};

export default PMMissedNotifications;
