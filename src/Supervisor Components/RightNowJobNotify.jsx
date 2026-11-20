import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Spin, Table, Tooltip, message } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { api, authFetch } from '../api/client.js';

const { TextArea } = Input;

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

const readError = async (response) => {
  try {
    const data = await response.json();
    if (typeof data.detail === 'string') return data.detail;
  } catch {
    // ignore
  }
  return 'Request failed';
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

const isPendingReview = (row) => !row.supervisor_decision && !row.mc_decision;

const fromDisplay = (row) => {
  if (row?.from_name) return row.from_name;
  const sent = sentByName(row);
  if (sent && sent !== '-') return sent;
  return row?.created_by_name || '-';
};

const RightNowJobNotify = ({ onUnreadCountChange }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const [machines, setMachines] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [review, setReview] = useState(null);
  const [reviewForm] = Form.useForm();
  const [reviewing, setReviewing] = useState(false);

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

  const unreadCount = useMemo(() => rows.filter(isPendingReview).length, [rows]);

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
        row.from_name,
        sentByName(row),
        row.mc_name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

  const openReview = (record, status) => {
    reviewForm.resetFields();
    setReview({ record, status });
  };

  const submitReview = async (values) => {
    const userId = getUserId();
    if (!userId || !review?.record) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    if (review.status === 'rejected' && !String(values.remark || '').trim()) {
      message.error('Remarks are required to reject');
      return;
    }
    setReviewing(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${review.record.id}/completion-review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          user_id: Number(userId),
          as_role: 'supervisor',
          status: review.status,
          remark: values.remark || null,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success(review.status === 'approved' ? 'Log approved' : 'Log rejected');
      setReview(null);
      await loadRows();
    } catch {
      message.error('Failed to submit review');
    } finally {
      setReviewing(false);
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
    { title: 'From', key: 'from', align: 'center', render: (_, record) => fromDisplay(record) },
    { title: 'Assigned by', dataIndex: 'mc_name', align: 'center', render: (value) => value || '-' },
    {
      title: 'Duration',
      key: 'duration',
      align: 'center',
      width: 220,
      render: (_, record) => (
        <div style={{ lineHeight: 1.35 }}>
          <div>From: {formatWhen(record.activated_at)}</div>
          <div>To: {formatWhen(record.completed_at)}</div>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const settled = !isPendingReview(record);
        return (
          <Space>
            <Tooltip title={settled ? 'Already reviewed' : 'Approve'}>
              <Button
                type="text"
                icon={<CheckOutlined />}
                style={settled ? undefined : { color: '#52c41a' }}
                disabled={settled}
                onClick={() => openReview(record, 'approved')}
              />
            </Tooltip>
            <Tooltip title={settled ? 'Already reviewed' : 'Reject'}>
              <Button
                type="text"
                danger={!settled}
                icon={<CloseOutlined />}
                disabled={settled}
                onClick={() => openReview(record, 'rejected')}
              />
            </Tooltip>
          </Space>
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
        <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>Refresh</Button>
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

      <Modal
        title={review?.status === 'approved' ? 'Approve log' : 'Reject log'}
        open={Boolean(review)}
        onCancel={() => setReview(null)}
        onOk={() => reviewForm.submit()}
        confirmLoading={reviewing}
        okText={review?.status === 'approved' ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: review?.status === 'rejected' }}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical" onFinish={submitReview}>
          <Form.Item
            name="remark"
            label="Remarks"
            rules={review?.status === 'rejected' ? [{ required: true, message: 'Remarks are required to reject' }] : []}
          >
            <TextArea
              rows={3}
              placeholder={review?.status === 'rejected' ? 'Reason for rejection' : 'Optional remarks'}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Spin>
  );
};

export default RightNowJobNotify;
