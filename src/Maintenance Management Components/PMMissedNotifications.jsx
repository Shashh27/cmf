import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, message, Spin, Empty, Tag, Input, Space, Typography, Segmented,
} from 'antd';
import { CheckCircleOutlined, ReloadOutlined, BellOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { pmFetch, getCurrentUserId, formatDateTime } from './pmUtils';

const { Text } = Typography;

/**
 * Compulsory PM checkpoints not submitted by 5 PM.
 * Mount only inside Preventive Maintenance for the current role.
 * Data: GET /pm/missed-notifications (scheduler creates rows at 17:00).
 */
const PMMissedNotifications = ({ onCount, roleLabel = 'your role' }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [view, setView] = useState('pending'); // pending | all

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const pendingOnly = view === 'pending';
      const data = await pmFetch(`/missed-notifications?pending_only=${pendingOnly}&limit=500`);
      const list = Array.isArray(data) ? data : [];
      setRows(list);
      if (onCount) {
        // Always report unacked count for tab badge (fetch pending snapshot)
        if (pendingOnly) onCount(list.filter((n) => !n.is_ack).length);
        else onCount(list.filter((n) => !n.is_ack).length);
      }
    } catch (e) {
      message.error(e.message || 'Failed to load missed notifications');
      setRows([]);
      if (onCount) onCount(0);
    } finally {
      setLoading(false);
    }
  }, [onCount, view]);

  // Badge count: always poll pending count lightly
  const refreshBadge = useCallback(async () => {
    if (!onCount) return;
    try {
      const data = await pmFetch('/missed-notifications?pending_only=true&limit=500');
      const list = Array.isArray(data) ? data : [];
      onCount(list.filter((n) => !n.is_ack).length);
    } catch {
      /* badge optional */
    }
  }, [onCount]);

  useEffect(() => {
    fetchRows();
    const t = setInterval(() => {
      fetchRows();
      refreshBadge();
    }, 60000);
    return () => clearInterval(t);
  }, [fetchRows, refreshBadge]);

  const handleAck = async (id) => {
    try {
      const uid = getCurrentUserId();
      const qs = uid ? `?ack_by=${encodeURIComponent(String(uid))}` : '';
      await pmFetch(`/missed-notifications/${id}/ack${qs}`, { method: 'POST' });
      message.success('Acknowledged');
      fetchRows();
      refreshBadge();
    } catch (e) {
      message.error(e.message || 'Acknowledge failed');
    }
  };

  const filtered = rows.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [
      r.message,
      r.item_text,
      r.machine_label,
      r.checklist_name,
      r.due_date,
    ].some((v) => String(v || '').toLowerCase().includes(q));
  });

  const columns = [
    {
      title: 'Sl',
      key: 'sl',
      width: 50,
      render: (_, __, i) => (page - 1) * pageSize + i + 1,
    },
    {
      title: 'Due date',
      dataIndex: 'due_date',
      key: 'due_date',
      width: 110,
      render: (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—'),
    },
    {
      title: 'Machine',
      dataIndex: 'machine_label',
      key: 'machine',
      width: 170,
      ellipsis: true,
      render: (t) => t || '—',
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist_name',
      key: 'checklist',
      width: 130,
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
          <div style={{ fontWeight: 600 }}>{t || '—'}</div>
          {r.message ? (
            <Text type="secondary" style={{ fontSize: 11 }}>{r.message}</Text>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'is_ack',
      key: 'status',
      width: 120,
      render: (ack) => (
        ack
          ? <Tag color="success">Acknowledged</Tag>
          : <Tag color="error">Missed</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created',
      width: 140,
      render: (d) => (d ? formatDateTime(d) : '—'),
    },
    {
      title: 'Action',
      key: 'action',
      width: 110,
      render: (_, r) => (
        r.is_ack ? (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ) : (
          <Button
            type="primary"
            size="small"
            ghost
            icon={<CheckCircleOutlined />}
            onClick={() => handleAck(r.id)}
            style={{ borderRadius: 6 }}
          >
            Ack
          </Button>
        )
      ),
    },
  ];

  return (
    <div style={{ width: '100%' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 14,
        alignItems: 'flex-start',
      }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          >
            <BellOutlined />
          </div>
          <div>
            <Text strong style={{ fontSize: 15, color: '#1e3a5f' }}>
              Compulsory missed notifications
            </Text>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              Compulsory checkpoints not submitted by 5 PM.
            </div>
          </div>
        </div>
        <Space wrap>
          <Segmented
            value={view}
            onChange={(v) => { setView(v); setPage(1); }}
            options={[
              { label: 'Pending', value: 'pending' },
              { label: 'All', value: 'all' },
            ]}
          />
          <Input.Search
            allowClear
            placeholder="Search machine / checkpoint"
            style={{ width: 240 }}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchRows} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
      ) : filtered.length === 0 ? (
        <Empty description={view === 'pending' ? 'No pending compulsory misses' : 'No missed notifications'} />
      ) : (
        <Table
          size="small"
          bordered
          rowKey="id"
          columns={columns}
          dataSource={filtered}
          scroll={{ x: 960 }}
          pagination={{
            current: page,
            pageSize,
            total: filtered.length,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50],
            onChange: (p, s) => { setPage(p); setPageSize(s); },
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t}`,
          }}
        />
      )}
    </div>
  );
};

export default PMMissedNotifications;
