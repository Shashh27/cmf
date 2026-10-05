import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Table, Tooltip, Typography, message } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch, readStoredUser } from '../api/client.js';

const { Text } = Typography;
const { TextArea } = Input;

const PAGE_SIZE = 10;

const statusTextColor = {
  pending: '#d48806',
  accepted: '#52c41a',
  rejected: '#ff4d4f',
};

const statusLabel = (status) => {
  if (status === 'accepted') return 'Approved';
  const value = status || 'pending';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const statusFilters = [
  { text: 'Pending', value: 'pending' },
  { text: 'Rejected', value: 'rejected' },
  { text: 'Approved', value: 'accepted' },
];

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const formatStatusWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date
    .toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
    .replace(/\b(AM|PM)\b/g, (match) => match.toLowerCase());
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
    const id = user?.id ?? user?.user_id;
    if (id) return Number(id);
  }
  return null;
};

const readError = async (response) => {
  try {
    const data = await response.json();
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg).filter(Boolean).join(', ');
    }
  } catch {
    // ignore
  }
  return 'Request failed';
};

const textSort = (pick) => (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''));

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

const SupervisorNotes = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState(null);
  const [remark, setRemark] = useState('');
  const [remarkError, setRemarkError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes`);
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      setNotes(await response.json());
    } catch {
      message.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const submitReview = async (record, status, remarkText = '') => {
    if (status === 'rejected' && !remarkText.trim()) {
      setRemarkError(true);
      message.error('Remarks are required to reject');
      throw new Error('remarks required');
    }
    const supervisorId = resolveUserId(user);
    if (!supervisorId) {
      message.error('Supervisor not found in session. Please log in again.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/${record.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          supervisor_id: supervisorId,
          status,
          remark: remarkText.trim() || null,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success(status === 'accepted' ? 'Note approved' : 'Note rejected');
      setReview(null);
      setRemark('');
      await loadNotes();
    } catch {
      message.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

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
  }, [notes, search, machineFilter]);

  const machineOptions = useMemo(() => {
    const machineMap = new Map();
    notes.forEach((note) => {
      if (note.machine_id == null || machineMap.has(note.machine_id)) return;
      machineMap.set(note.machine_id, note.machine_name || `Machine ${note.machine_id}`);
    });
    return Array.from(machineMap.entries()).map(([value, label]) => ({ value, label }));
  }, [notes]);

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 80,
      render: (_, __, index) => (page - 1) * PAGE_SIZE + index + 1,
    },
    {
      title: 'Operator',
      dataIndex: 'operator_name',
      key: 'operator_name',
      sorter: textSort((record) => record.operator_name || `Operator #${record.operator_id}`),
      render: (name, record) => name || `Operator #${record.operator_id}`,
    },
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
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.project_name || '-'}</div>
          <Text type="secondary">{record.order_no || '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Part',
      key: 'part',
      sorter: textSort((record) => `${record.part_name || ''} ${record.part_no || ''}`),
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.part_name || '-'}</div>
          <Text type="secondary">{record.part_no || '-'}</Text>
        </div>
      ),
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
      title: 'Submitted at',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      sorter: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
      render: formatWhen,
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
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      align: 'center',
      filters: statusFilters,
      onFilter: (value, record) => (record.status || 'pending') === value,
      render: (status, record) => {
        const value = status || 'pending';
        const when = value === 'pending' ? record.created_at : (record.reviewed_at || record.created_at);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
            <span style={{ color: statusTextColor[value] || '#595959', fontWeight: 600 }}>
              {statusLabel(value)}
            </span>
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              {formatStatusWhen(when)}
            </span>
          </div>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, record) => {
        const pending = record.status === 'pending';
        const idleStyle = { color: '#bfbfbf', cursor: 'not-allowed' };
        return (
          <Space size={4}>
            <Tooltip title={pending ? 'Approve' : 'Already reviewed'}>
              <Button
                type="text"
                icon={<CheckOutlined />}
                disabled={!pending}
                style={pending ? { color: '#52c41a' } : idleStyle}
                onClick={() => {
                  setReview({ record, status: 'accepted' });
                  setRemark('');
                  setRemarkError(false);
                }}
              />
            </Tooltip>
            <Tooltip title={pending ? 'Reject' : 'Already reviewed'}>
              <Button
                type="text"
                icon={<CloseOutlined />}
                disabled={!pending}
                style={pending ? { color: '#ff4d4f' } : idleStyle}
                onClick={() => {
                  setReview({ record, status: 'rejected' });
                  setRemark('');
                  setRemarkError(false);
                }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
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
          <Button icon={<ReloadOutlined />} onClick={loadNotes} loading={loading} />
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredNotes}
          loading={loading}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            showSizeChanger: false,
            onChange: (nextPage) => setPage(nextPage),
          }}
          tableLayout="fixed"
          scroll={{ x: 1400 }}
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
      </Card>

      <Modal
        title={(
          <Space align="center">
            {review?.status === 'accepted' ? (
              <CheckOutlined style={{ color: '#52c41a' }} />
            ) : (
              <CloseOutlined style={{ color: '#ff4d4f' }} />
            )}
            <span>{review?.status === 'accepted' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
          </Space>
        )}
        open={Boolean(review)}
        onCancel={() => {
          setReview(null);
          setRemark('');
          setRemarkError(false);
        }}
        onOk={() => submitReview(review.record, review.status, remark)}
        okText={review?.status === 'accepted' ? 'Approve' : 'Reject'}
        okButtonProps={review?.status === 'accepted'
          ? { style: { backgroundColor: '#52c41a', borderColor: '#52c41a' }, loading: submitting }
          : { danger: true, loading: submitting }}
        cancelText="Cancel"
        confirmLoading={submitting}
        maskClosable={false}
        keyboard={false}
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#595959' }}>
          {review?.status === 'accepted'
            ? 'Are you sure you want to approve this job note?'
            : 'Are you sure you want to reject this job note?'}
        </p>
        <Text strong style={{ display: 'block', marginBottom: 6 }}>
          Remarks{' '}
          {review?.status === 'rejected' ? (
            <Text type="danger" style={{ fontWeight: 400 }}>*</Text>
          ) : (
            <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text>
          )}
        </Text>
        <TextArea
          rows={4}
          maxLength={500}
          showCount
          status={remarkError ? 'error' : undefined}
          placeholder={review?.status === 'rejected' ? 'Enter remarks for this rejection' : 'Enter your remarks here...'}
          value={remark}
          onChange={(event) => {
            setRemark(event.target.value);
            if (event.target.value.trim()) setRemarkError(false);
          }}
        />
        {remarkError && (
          <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
            Remarks are required to reject
          </Text>
        )}
      </Modal>
    </div>
  );
};

export default SupervisorNotes;
