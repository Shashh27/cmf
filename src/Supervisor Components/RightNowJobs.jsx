import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tooltip, Typography, message } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, FileOutlined, PaperClipOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { api, authFetch } from '../api/client.js';
import ModelViewer3D from '../ProjectCoordinator Components/PDM Components/ModelViewer3D';
import { downloadUrgentAttachment } from '../utils/urgentJobDownload.js';

const { Text } = Typography;
const { TextArea } = Input;

const getUserId = () => {
  try {
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    return stored.id ?? stored.user_id ?? null;
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

const machineLabel = (machine) => {
  if (!machine) return '-';
  if (machine.make && machine.model) return `(${machine.make}) ${machine.model}`;
  return machine.make || machine.model || machine.type || machine.machine_name || `Machine ${machine.id}`;
};

const sentByName = (row) => (
  row?.created_by != null && row?.mc_id != null && Number(row.created_by) !== Number(row.mc_id)
    ? (row.created_by_name || '-')
    : '-'
);

const fromDisplay = (row) => {
  if (row?.from_name) return row.from_name;
  const sent = sentByName(row);
  if (sent && sent !== '-') return sent;
  return row?.created_by_name || '-';
};

const logReviewInfo = (record) => {
  if (record.mc_decision === 'approved') {
    return { label: `Approved by ${record.mc_decision_by || 'MC'}`, color: '#52c41a', remark: record.mc_decision_remark };
  }
  if (record.supervisor_decision === 'approved') {
    return { label: `Approved by ${record.supervisor_decision_by || 'Supervisor'}`, color: '#52c41a', remark: record.supervisor_decision_remark };
  }
  if (record.mc_decision === 'rejected') {
    return { label: `Rejected by ${record.mc_decision_by || 'MC'}`, color: '#ff4d4f', remark: record.mc_decision_remark };
  }
  if (record.supervisor_decision === 'rejected') {
    return { label: `Rejected by ${record.supervisor_decision_by || 'Supervisor'}`, color: '#ff4d4f', remark: record.supervisor_decision_remark };
  }
  return { label: 'Pending', color: '#8c8c8c', remark: null };
};

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const textSort = (pick) => (a, b) =>
  String(pick(a) || '').localeCompare(String(pick(b) || ''), undefined, { sensitivity: 'base' });

const dateSort = (pick) => (a, b) => new Date(pick(a) || 0) - new Date(pick(b) || 0);

const fileExt = (name) => {
  const value = String(name || '').toLowerCase();
  const idx = value.lastIndexOf('.');
  return idx >= 0 ? value.slice(idx) : '';
};

const is3dPreviewFile = (file) => ['.stl', '.step', '.stp'].includes(fileExt(file?.file_name));

const tableHeader = {
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
};

const RightNowJobs = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const [machines, setMachines] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentRows, setAttachmentRows] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
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
        row.from_dept,
        row.from_name,
        row.to_dept,
        sentByName(row),
        row.mc_name,
        row.supervisor_decision,
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
      render: (_text, _record, index) => (page - 1) * pageSize + index + 1,
    },
    {
      title: 'Proj. No.',
      key: 'order_no',
      align: 'center',
      sorter: textSort((row) => row.order_no),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{record.order_no || '-'}</span>
          {record.project_name ? <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.project_name}</span> : null}
        </div>
      ),
    },
    { title: 'Description', dataIndex: 'description', align: 'center', ellipsis: true, render: (value) => value || '-' },
    { title: 'Operator', dataIndex: 'operator_name', align: 'center', sorter: textSort((row) => row.operator_name), render: (value) => value || '-' },
    { title: 'Machine', dataIndex: 'machine_name', align: 'center', sorter: textSort((row) => row.machine_name), render: (value) => value || '-' },
    { title: 'Center', dataIndex: 'from_dept', align: 'center', render: (value) => value || '-' },
    {
      title: 'From',
      key: 'from',
      align: 'center',
      sorter: textSort((row) => fromDisplay(row)),
      render: (_, record) => fromDisplay(record),
    },
    { title: 'Assigned by', dataIndex: 'mc_name', align: 'center', render: (value) => value || '-' },
    {
      title: 'Files',
      key: 'files',
      align: 'center',
      width: 90,
      render: (_, record) => {
        const count = (record.attachments || []).length;
        if (!count) return '-';
        return (
          <Button
            type="link"
            size="small"
            icon={<PaperClipOutlined />}
            onClick={() => {
              setAttachmentRows(record.attachments || []);
              setAttachmentsOpen(true);
            }}
          >
            {count}
          </Button>
        );
      },
    },
    {
      title: 'Duration',
      key: 'duration',
      align: 'center',
      width: 220,
      sorter: dateSort((row) => row.completed_at || row.activated_at),
      render: (_, record) => (
        <div style={{ lineHeight: 1.35 }}>
          <div>From: {formatWhen(record.activated_at)}</div>
          <div>To: {formatWhen(record.completed_at)}</div>
        </div>
      ),
    },
    {
      title: 'Log review',
      key: 'log_review',
      align: 'center',
      width: 160,
      render: (_, record) => {
        const info = logReviewInfo(record);
        return (
          <div style={{ lineHeight: 1.3 }}>
            <span style={{ color: info.color, fontWeight: 600 }}>{info.label}</span>
            {info.remark ? <div style={{ color: '#8c8c8c', fontSize: 12 }}>{info.remark}</div> : null}
          </div>
        );
      },
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const settled = Boolean(record.supervisor_decision || record.mc_decision);
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

  const previewKind = String(previewFile?.file_type || '').toLowerCase();
  const previewName = String(previewFile?.file_name || '').toLowerCase();

  return (
    <div style={{ padding: 24, background: '#f5f5f5', minHeight: '100vh' }}>
      <Card>
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
          loading={loading}
          components={tableHeader}
          scroll={{ x: 1400 }}
          locale={{ emptyText: 'No completed jobs yet' }}
          pagination={{
            current: page,
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            onChange: (nextPage, nextSize) => {
              setPage(nextPage);
              setPageSize(nextSize);
            },
          }}
        />
      </Card>

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

      <Modal
        title="Attachments"
        open={attachmentsOpen}
        onCancel={() => setAttachmentsOpen(false)}
        footer={<Button onClick={() => setAttachmentsOpen(false)}>Close</Button>}
        width={640}
      >
        {attachmentRows.length === 0 ? (
          <Text type="secondary">No files attached</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {attachmentRows.map((attachment) => (
              <Card key={attachment.id} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <Space>
                    <FileOutlined />
                    <div>
                      <div>{attachment.file_name}</div>
                      <Text type="secondary" style={{ fontSize: 12 }}>{String(attachment.kind || '').toUpperCase()}</Text>
                    </div>
                  </Space>
                  <Space>
                    <Tooltip title="Preview">
                      <Button type="text" icon={<EyeOutlined />} onClick={() => setPreviewFile(attachment)} />
                    </Tooltip>
                    <Button type="link" onClick={() => downloadUrgentAttachment(attachment)}>Download</Button>
                  </Space>
                </div>
              </Card>
            ))}
          </Space>
        )}
      </Modal>

      <Modal
        title={previewFile?.file_name || 'Preview'}
        open={Boolean(previewFile)}
        onCancel={() => setPreviewFile(null)}
        footer={[
          <Button key="download" type="primary" onClick={() => downloadUrgentAttachment(previewFile)}>Download</Button>,
          <Button key="close" onClick={() => setPreviewFile(null)}>Close</Button>,
        ]}
        width={is3dPreviewFile(previewFile) ? 1000 : 800}
        destroyOnClose
      >
        {previewFile && (previewKind.startsWith('image/') || ['.png', '.jpg', '.jpeg'].some((ext) => previewName.endsWith(ext))) ? (
          <img src={previewFile.minio_url} alt={previewFile.file_name} style={{ maxWidth: '100%', maxHeight: '60vh' }} />
        ) : previewFile && (previewKind === 'application/pdf' || previewName.endsWith('.pdf')) ? (
          <iframe src={previewFile.minio_url} title={previewFile.file_name} style={{ width: '100%', height: '60vh', border: 'none' }} />
        ) : previewFile && is3dPreviewFile(previewFile) ? (
          <div style={{ height: '60vh' }}>
            <ModelViewer3D
              modelEndpoint={`/urgent-job-indents/attachments/${previewFile.id}/3d`}
              height="100%"
              showControls
              showEdgeButton
              restrictZoom={false}
            />
          </div>
        ) : (
          <p>Preview is not available for this file type. Download to open the file.</p>
        )}
      </Modal>
    </div>
  );
};

export default RightNowJobs;
