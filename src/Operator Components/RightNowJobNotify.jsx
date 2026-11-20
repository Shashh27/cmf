import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Spin, Table, message } from 'antd';
import { CheckOutlined, ClearOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch } from '../api/client.js';

const getOperatorId = () => {
  try {
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    return storedUser.id ?? storedUser.user_id ?? null;
  } catch {
    return null;
  }
};

const isFromPc = (row) => (
  row?.created_by != null
  && row?.mc_id != null
  && Number(row.created_by) !== Number(row.mc_id)
);

const sentByName = (row) => (isFromPc(row) ? (row.created_by_name || '-') : '-');
const assignedByName = (row) => row?.mc_name || '-';

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const readError = async (response) => {
  try {
    const data = await response.json();
    if (typeof data.detail === 'string') return data.detail;
  } catch {
    // ignore
  }
  return 'Request failed';
};

const RightNowJobNotify = ({ onUnreadCountChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [ackingAll, setAckingAll] = useState(false);

  const loadRows = async () => {
    const operatorId = getOperatorId();
    if (!operatorId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/?operator_id=${operatorId}`);
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      const data = await response.json();
      const list = (Array.isArray(data) ? data : []).filter((row) => (
        ['assigned', 'accepted'].includes(String(row.status || '').toLowerCase())
        && Number(row.created_by) !== Number(operatorId)
      ));
      setRows(list);
    } catch {
      message.error('Failed to load right now jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const unreadCount = useMemo(
    () => rows.filter((row) => !row.operator_ack).length,
    [rows],
  );

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const machineOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (row.machine_id == null) return;
      map.set(Number(row.machine_id), row.machine_name || `Machine ${row.machine_id}`);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [rows]);

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
        sentByName(row),
        assignedByName(row),
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

  const acknowledge = async (record) => {
    const operatorId = getOperatorId();
    if (!operatorId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setAcknowledgingIds((prev) => new Set(prev).add(record.id));
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ user_id: Number(operatorId), as_role: 'operator' }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success('Notification acknowledged');
      await loadRows();
    } catch {
      message.error('Failed to acknowledge');
    } finally {
      setAcknowledgingIds((prev) => {
        const next = new Set(prev);
        next.delete(record.id);
        return next;
      });
    }
  };

  const acknowledgeAll = async () => {
    const operatorId = getOperatorId();
    const pending = rows.filter((row) => !row.operator_ack);
    if (!operatorId || !pending.length) return;
    setAckingAll(true);
    try {
      const results = await Promise.all(pending.map((row) => authFetch(
        `${API_BASE_URL}/urgent-job-indents/${row.id}/acknowledge`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ user_id: Number(operatorId), as_role: 'operator' }),
        },
      )));
      if (results.some((response) => !response.ok)) {
        message.warning('Some notifications could not be acknowledged');
      } else {
        message.success('Notifications acknowledged');
      }
      await loadRows();
    } catch {
      message.error('Failed to acknowledge');
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
    {
      title: 'Description',
      dataIndex: 'description',
      align: 'center',
      ellipsis: true,
      render: (value) => value || '-',
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      align: 'center',
      render: (value) => value || '-',
    },
    {
      title: 'Sent by',
      key: 'sent_by',
      align: 'center',
      render: (_, record) => sentByName(record),
    },
    {
      title: 'Assigned by',
      key: 'assigned_by',
      align: 'center',
      render: (_, record) => assignedByName(record),
    },
    {
      title: 'Assigned at',
      dataIndex: 'assigned_at',
      align: 'center',
      width: 170,
      render: (value) => formatWhen(value),
    },
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
          disabled={record.operator_ack || acknowledgingIds.has(record.id)}
          loading={acknowledgingIds.has(record.id)}
          onClick={() => acknowledge(record)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: '16px 16px 0',
        }}
      >
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
            options={machineOptions}
            optionFilterProp="label"
          />
          {(search || machineFilter.length > 0) && (
            <Button
              icon={<ClearOutlined />}
              onClick={() => {
                setSearch('');
                setMachineFilter([]);
                setPagination((prev) => ({ ...prev, current: 1 }));
              }}
            >
              Clear
            </Button>
          )}
        </Space>
        <Space>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={acknowledgeAll}
            loading={ackingAll}
            disabled={!rows.some((row) => !row.operator_ack)}
          >
            Acknowledge All
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
            Refresh
          </Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filteredRows}
        locale={{ emptyText: 'No right now job notifications' }}
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
              <th
                {...props}
                style={{
                  ...props.style,
                  background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)',
                  fontWeight: 'bold',
                  borderBottom: '2px solid #1890ff',
                }}
              >
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
