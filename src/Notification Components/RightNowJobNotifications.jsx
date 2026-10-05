import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Spin, Table, Tag, Tooltip, message } from 'antd';
import { CheckOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch, readStoredUser } from '../api/client.js';

const statusColor = {
  pending: 'gold',
  accepted: 'green',
  rejected: 'red',
};

const statusFilters = [
  { text: 'Pending', value: 'pending' },
  { text: 'Rejected', value: 'rejected' },
  { text: 'Approved', value: 'accepted' },
];

const statusLabel = (status) => {
  if (status === 'accepted') return 'Approved';
  const value = status || 'pending';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const textSort = (pick) => (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''));

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const resolveUserId = (authUser) => {
  const candidates = [authUser, readStoredUser()];
  try {
    const raw = localStorage.getItem('user');
    if (raw) candidates.push(JSON.parse(raw));
  } catch {
    // ignore malformed session
  }
  for (const user of candidates) {
    const id = user?.id ?? user?.user_id ?? user?.operator_id;
    if (id) return Number(id);
  }
  return null;
};

const clipCell = () => ({
  style: {
    maxWidth: 220,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
});

const LongText = ({ text }) => {
  const value = text || '-';
  return (
    <Tooltip title={text && text.length > 24 ? text : undefined} placement="topLeft">
      <span style={{ display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {value}
      </span>
    </Tooltip>
  );
};

const RightNowJobNotifications = ({ audience, onUnreadCountChange }) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ackingId, setAckingId] = useState(null);
  const [ackingAll, setAckingAll] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const userId = resolveUserId(user);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const query = audience === 'operator' && userId ? `?operator_id=${userId}` : '';
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes${query}`);
      if (!response.ok) {
        message.error('Failed to load Right Now Jobs');
        return;
      }
      const data = await response.json();
      const list = audience === 'operator'
        ? (data || []).filter((note) => note.status && note.status !== 'pending')
        : (data || []);
      list.sort((a, b) => new Date(b.reviewed_at || b.created_at || 0) - new Date(a.reviewed_at || a.created_at || 0));
      setNotes(list);
    } catch {
      message.error('Failed to load Right Now Jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, userId]);

  const machineOptions = useMemo(() => {
    const machineMap = new Map();
    notes.forEach((note) => {
      if (note.machine_id == null || machineMap.has(note.machine_id)) return;
      machineMap.set(note.machine_id, note.machine_name || `Machine ${note.machine_id}`);
    });
    return Array.from(machineMap.entries()).map(([value, label]) => ({ value, label }));
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (machineFilter.length > 0 && !machineFilter.includes(note.machine_id)) return false;
      if (!query) return true;
      return [
        note.operator_name,
        note.machine_name,
        note.project_name,
        note.order_no,
        note.part_name,
        note.part_no,
        note.description,
        note.status,
        statusLabel(note.status),
        note.remark,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [notes, machineFilter, search]);

  const unreadCount = useMemo(() => notes.filter((note) => (
    audience === 'operator' ? !note.operator_ack : note.status === 'pending' && !note.supervisor_ack
  )).length, [notes, audience]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const acknowledge = async (record) => {
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setAckingId(record.id);
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/${record.id}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ user_id: userId, role: audience }),
      });
      if (!response.ok) {
        message.error('Failed to acknowledge');
        return;
      }
      message.success('Notification acknowledged');
      await loadNotes();
    } catch {
      message.error('Failed to acknowledge');
    } finally {
      setAckingId(null);
    }
  };

  const pendingNotes = notes.filter((note) => (
    audience === 'operator'
      ? note.status && note.status !== 'pending' && !note.operator_ack
      : note.status === 'pending' && !note.supervisor_ack
  ));

  const acknowledgeAll = async () => {
    if (!pendingNotes.length) return;
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setAckingAll(true);
    try {
      const results = await Promise.allSettled(pendingNotes.map((record) =>
        authFetch(`${API_BASE_URL}/maintenance/notes/${record.id}/acknowledge`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ user_id: userId, role: audience }),
        }).then((response) => {
          if (!response.ok) throw new Error('failed');
        })
      ));
      const failed = results.filter((result) => result.status === 'rejected').length;
      await loadNotes();
      if (failed) message.warning(`Acknowledged ${pendingNotes.length - failed} of ${pendingNotes.length}`);
      else message.success('All notifications acknowledged');
    } catch {
      message.error('Failed to acknowledge');
    } finally {
      setAckingAll(false);
    }
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 70,
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    ...(audience === 'supervisor' ? [{
      title: 'Operator',
      dataIndex: 'operator_name',
      key: 'operator_name',
      sorter: textSort((record) => record.operator_name || `Operator #${record.operator_id}`),
      render: (name, record) => name || `Operator #${record.operator_id}`,
    }] : []),
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      sorter: textSort((record) => record.machine_name),
      render: (name) => name || '-',
    },
    {
      title: 'Project',
      key: 'project',
      sorter: textSort((record) => `${record.project_name || ''} ${record.order_no || ''}`),
      render: (_, record) => record.project_name || record.order_no || '-',
    },
    {
      title: 'Part',
      key: 'part',
      sorter: textSort((record) => `${record.part_name || ''} ${record.part_no || ''}`),
      render: (_, record) => record.part_name || record.part_no || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 220,
      ellipsis: { showTitle: false },
      onCell: clipCell,
      sorter: textSort((record) => record.description),
      render: (text) => <LongText text={text} />,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      filters: statusFilters,
      onFilter: (value, record) => (record.status || 'pending') === value,
      render: (status) => <Tag color={statusColor[status] || 'default'}>{statusLabel(status)}</Tag>,
    },
    {
      title: 'Remarks',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: { showTitle: false },
      onCell: clipCell,
      sorter: textSort((record) => record.remark),
      render: (value) => <LongText text={value} />,
    },
    {
      title: audience === 'operator' ? 'Reviewed at' : 'Sent at',
      key: 'when',
      width: 180,
      sorter: (a, b) => {
        const pick = audience === 'operator' ? 'reviewed_at' : 'created_at';
        return new Date(a[pick] || 0) - new Date(b[pick] || 0);
      },
      render: (_, record) => formatWhen(audience === 'operator' ? record.reviewed_at : record.created_at),
    },
    {
      title: 'Acknowledged at',
      key: 'ack_at',
      width: 180,
      sorter: (a, b) => {
        const pick = audience === 'operator' ? 'operator_ack_at' : 'supervisor_ack_at';
        return new Date(a[pick] || 0) - new Date(b[pick] || 0);
      },
      render: (_, record) => formatWhen(audience === 'operator' ? record.operator_ack_at : record.supervisor_ack_at),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => {
        const done = audience === 'operator' ? Boolean(record.operator_ack) : Boolean(record.supervisor_ack);
        return (
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            disabled={done}
            loading={ackingId === record.id}
            onClick={() => acknowledge(record)}
          >
            Acknowledge
          </Button>
        );
      },
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '16px 16px 0' }}>
        <Space wrap>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            style={{ width: 280 }}
          />
          <Select
            mode="multiple"
            showSearch
            allowClear
            placeholder="Filter by machine"
            style={{ minWidth: 220, maxWidth: 320 }}
            value={machineFilter}
            onChange={(value) => {
              setMachineFilter(value || []);
              setPage(1);
            }}
            options={machineOptions}
            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
          />
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={acknowledgeAll}
            loading={ackingAll}
            disabled={!pendingNotes.length}
          >
            Acknowledge All
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadNotes} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredNotes}
        pagination={{
          current: page,
          pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          onChange: (nextPage, nextSize) => {
            setPage(nextPage);
            setPageSize(nextSize);
          },
          onShowSizeChange: (_current, size) => {
            setPage(1);
            setPageSize(size);
          },
        }}
        variant="outlined"
        tableLayout="fixed"
        scroll={{ x: 1600, y: 'calc(100vh - 400px)' }}
        style={{ textAlign: 'center' }}
        locale={{ emptyText: audience === 'operator' ? 'No job updates yet' : 'No job notes yet' }}
        components={{
          header: {
            cell: (props) => (
              <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                {props.children}
              </th>
            ),
          },
        }}
      />
    </Spin>
  );
};

export default RightNowJobNotifications;
