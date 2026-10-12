import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch, readStoredUser } from '../api/client.js';

const { Text } = Typography;
const { TextArea } = Input;

const PAGE_SIZE = 10;

const statusColor = {
  pending: 'gold',
  accepted: 'green',
  rejected: 'red',
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

const resolveMachineId = () => {
  try {
    const machine = JSON.parse(localStorage.getItem('selectedMachine') || 'null');
    if (!machine) return null;
    const id = machine.id ?? machine.machine_id ?? machine.machineId ?? machine.machine?.id ?? null;
    return id ? Number(id) : null;
  } catch {
    return null;
  }
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

const blankForm = {
  project_name: '',
  order_no: '',
  part_name: '',
  part_no: '',
  description: '',
};

const blockSuggestions = {
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
  'data-lpignore': 'true',
  'data-form-type': 'other',
};

const FreshInput = (props) => {
  const [locked, setLocked] = useState(true);
  return (
    <Input
      {...blockSuggestions}
      {...props}
      readOnly={locked}
      onFocus={(event) => {
        setLocked(false);
        props.onFocus?.(event);
      }}
    />
  );
};

const FreshTextArea = (props) => {
  const [locked, setLocked] = useState(true);
  return (
    <TextArea
      {...blockSuggestions}
      {...props}
      readOnly={locked}
      onFocus={(event) => {
        setLocked(false);
        props.onFocus?.(event);
      }}
    />
  );
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

const OperatorNotes = () => {
  const { user } = useAuth();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);

  const operatorId = resolveUserId(user);

  const loadNotes = async (id = operatorId) => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes?operator_id=${id}`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNotes = () => {
    form.setFieldsValue(blankForm);
    setOpen(true);
  };

  const closeNotes = () => {
    setOpen(false);
    form.resetFields();
  };

  const handleSubmit = async (values) => {
    if (!operatorId) {
      message.error('Operator not found in session. Please log in again.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          operator_id: operatorId,
          machine_id: resolveMachineId(),
          order_no: values.order_no || null,
          project_name: values.project_name || null,
          part_no: values.part_no || null,
          part_name: values.part_name || null,
          description: values.description,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success('Note sent to the supervisor');
      closeNotes();
      setPage(1);
      await loadNotes();
    } catch {
      message.error('Failed to send note');
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
        note.machine_name,
        note.project_name,
        note.order_no,
        note.part_name,
        note.part_no,
        note.description,
        note.status,
        statusLabel(note.status),
        note.supervisor_name,
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

  const textSort = (pick) => (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''));

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 80,
      render: (_, __, index) => (page - 1) * PAGE_SIZE + index + 1,
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
      title: 'Reviewed by',
      dataIndex: 'supervisor_name',
      key: 'supervisor_name',
      sorter: textSort((record) => record.supervisor_name),
      render: (name) => name || '-',
    },
    {
      title: 'Remark',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: { showTitle: false },
      onCell: clipCell,
      sorter: textSort((record) => record.remark),
      render: (remark) => <LongText text={remark} />,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      filters: statusFilters,
      onFilter: (value, record) => (record.status || 'pending') === value,
      render: (status) => (
        <Tag color={statusColor[status] || 'default'}>
          {statusLabel(status)}
        </Tag>
      ),
    },
    {
      title: 'Reviewed at',
      dataIndex: 'reviewed_at',
      key: 'reviewed_at',
      width: 180,
      sorter: (a, b) => new Date(a.reviewed_at || 0) - new Date(b.reviewed_at || 0),
      render: formatWhen,
    },
  ];

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
      <Card
        bordered={false}
        style={{ borderRadius: 8 }}
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
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => loadNotes()} loading={loading} />
            <Button type="primary" icon={<PlusOutlined />} onClick={openNotes}>
              Add Job
            </Button>
          </Space>
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
          scroll={{ x: 1300 }}
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
        open={open}
        title="Notes"
        onCancel={closeNotes}
        footer={null}
        width={720}
        destroyOnClose
        maskClosable={false}
        keyboard={false}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={blankForm} autoComplete="off">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Form.Item name="project_name" label="Project name">
              <FreshInput />
            </Form.Item>
            <Form.Item name="order_no" label="Project number">
              <FreshInput />
            </Form.Item>
            <Form.Item name="part_name" label="Part name">
              <FreshInput />
            </Form.Item>
            <Form.Item name="part_no" label="Part number">
              <FreshInput />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Description" rules={[{ required: true, message: 'Enter a description' }]}>
            <FreshTextArea rows={4} placeholder="Describe the work you want the supervisor to review" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={closeNotes}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Submit
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default OperatorNotes;
