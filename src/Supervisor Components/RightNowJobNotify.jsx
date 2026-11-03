import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Spin, Table, message } from 'antd';
import { CheckOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { api, authFetch } from '../api/client.js';

const machineLabel = (machine) => {
  if (!machine) return '-';
  if (machine.make && machine.model) return `(${machine.make}) ${machine.model}`;
  return machine.make || machine.model || machine.type || machine.machine_name || `Machine ${machine.id}`;
};

const getUserId = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    return storedUser.id ?? storedUser.user_id ?? null;
  } catch {
    return null;
  }
};

const sentByName = (row) => (
  row?.created_by != null && row?.mc_id != null && Number(row.created_by) !== Number(row.mc_id)
    ? (row.created_by_name || '-')
    : '-'
);

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const RightNowJobNotify = ({ onUnreadCountChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const [machines, setMachines] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [ackingAll, setAckingAll] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/?completed=true`);
      if (!response.ok) {
        message.error('Failed to load completed jobs');
        return;
      }
      const data = await response.json();
      setRows(Array.isArray(data) ? data : []);
    } catch {
      message.error('Failed to load completed jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    const loadMachines = async () => {
      try {
        const res = await api.get('/machines/');
        setMachines(Array.isArray(res.data) ? res.data : []);
      } catch {
        setMachines([]);
      }
    };
    loadMachines();
  }, []);

  const machineFilterOptions = useMemo(() => {
    const map = new Map();
    machines.forEach((machine) => {
      if (machine?.id == null) return;
      map.set(Number(machine.id), machineLabel(machine));
    });
    rows.forEach((row) => {
      if (row.machine_id == null || map.has(Number(row.machine_id))) return;
      map.set(Number(row.machine_id), row.machine_name || `Machine ${row.machine_id}`);
    });
    return Array.from(map.entries())
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([value, label]) => ({ value, label }));
  }, [machines, rows]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.supervisor_ack).length, [rows]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selected = (machineFilter || []).map((id) => Number(id));
    return rows.filter((row) => {
      if (selected.length > 0 && !selected.includes(Number(row.machine_id))) return false;
      if (!query) return true;
      return [
        row.order_no,
        row.project_name,
        row.description,
        row.machine_name,
        row.operator_name,
        sentByName(row),
        row.mc_name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

  const acknowledge = async (record) => {
    const userId = getUserId();
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return false;
    }
    setAcknowledgingIds((prev) => new Set(prev).add(record.id));
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ user_id: Number(userId), as_role: 'supervisor' }),
      });
      if (!response.ok) {
        message.error('Failed to acknowledge');
        return false;
      }
      return true;
    } catch {
      message.error('Failed to acknowledge');
      return false;
    } finally {
      setAcknowledgingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const acknowledgeOne = async (record) => {
    const ok = await acknowledge(record);
    if (ok) {
      message.success('Notification acknowledged');
      await loadRows();
    }
  };

  const acknowledgeAll = async () => {
    const pending = rows.filter((row) => !row.supervisor_ack);
    if (!pending.length) return;
    setAckingAll(true);
    try {
      const results = await Promise.all(pending.map((row) => acknowledge(row)));
      if (results.some((ok) => !ok)) message.warning('Some notifications could not be acknowledged');
      else message.success('Notifications acknowledged');
      await loadRows();
    } finally {
      setAckingAll(false);
    }
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl',
      align: 'center',
      width: 70,
      render: (_text, _record, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Proj. No.',
      key: 'order_no',
      align: 'center',
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{record.order_no || '-'}</span>
          {record.project_name ? <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.project_name}</span> : null}
        </div>
      ),
    },
    { title: 'Description', dataIndex: 'description', align: 'center', ellipsis: true, render: (value) => value || '-' },
    { title: 'Operator', dataIndex: 'operator_name', align: 'center', render: (value) => value || '-' },
    { title: 'Machine', dataIndex: 'machine_name', align: 'center', render: (value) => value || '-' },
    { title: 'Sent by', key: 'sent_by', align: 'center', render: (_, record) => sentByName(record) },
    { title: 'Assigned by', dataIndex: 'mc_name', align: 'center', render: (value) => value || '-' },
    { title: 'Activated at', dataIndex: 'activated_at', align: 'center', width: 170, render: (value) => formatWhen(value) },
    { title: 'Completed at', dataIndex: 'completed_at', align: 'center', width: 170, render: (value) => formatWhen(value) },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 140,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<CheckOutlined />}
          disabled={record.supervisor_ack || acknowledgingIds.has(record.id)}
          loading={acknowledgingIds.has(record.id)}
          onClick={() => acknowledgeOne(record)}
        >
          Acknowledge
        </Button>
      ),
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
              setPagination((prev) => ({ ...prev, current: 1 }));
            }}
            style={{ width: 240 }}
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
              setPagination((prev) => ({ ...prev, current: 1 }));
            }}
            options={machineFilterOptions}
            optionFilterProp="label"
            filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            maxTagCount="responsive"
          />
        </Space>
        <Space>
          <Button type="primary" icon={<CheckOutlined />} onClick={acknowledgeAll} loading={ackingAll} disabled={!rows.some((row) => !row.supervisor_ack)}>
            Acknowledge All
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>Refresh</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredRows}
        locale={{ emptyText: 'No completed job notifications' }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        variant="outlined"
        scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
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

export default RightNowJobNotify;
