import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tooltip, Typography, Upload, message } from 'antd';
import {
  CheckOutlined, EyeOutlined, FileOutlined, PaperClipOutlined, PlayCircleOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined,
} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { api, authFetch } from '../api/client.js';
import ModelViewer3D from '../ProjectCoordinator Components/PDM Components/ModelViewer3D';
import DocumentPreviewer from './Document Components/DocumentPreviewer';
import { downloadUrgentAttachment } from '../Utils/urgentJobDownload.js';

const { Text } = Typography;
const { TextArea } = Input;
const WORK_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx'];

const machineLabel = (machine) => {
  if (!machine) return '-';
  if (machine.make && machine.model) return `(${machine.make}) ${machine.model}`;
  return machine.make || machine.model || machine.type || machine.machine_name || `Machine ${machine.id}`;
};

const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}');
  } catch {
    return {};
  }
};

const getOperatorName = () => {
  const user = readStoredUser();
  return user.user_name || user.name || user.username || '';
};

const getOperatorCenter = () => {
  const user = readStoredUser();
  return user.center ? String(user.center) : '';
};

const slipBorder = '1px solid #d9d9d9';
const slipCell = {
  borderRight: slipBorder,
  padding: '10px 12px',
  minHeight: 92,
};

const projectCell = (record) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
    <span style={{ fontWeight: 500 }}>{record.order_no || '-'}</span>
    {record.project_name ? (
      <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.project_name}</span>
    ) : null}
  </div>
);

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

const textSort = (pick) => (a, b) =>
  String(pick(a) || '').localeCompare(String(pick(b) || ''), undefined, { sensitivity: 'base' });

const dateSort = (pick) => (a, b) => new Date(pick(a) || 0) - new Date(pick(b) || 0);

const formatWhen = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const fileExt = (name) => {
  const value = String(name || '').toLowerCase();
  const idx = value.lastIndexOf('.');
  return idx >= 0 ? value.slice(idx) : '';
};

const is3dPreviewFile = (file) => ['.stl', '.step', '.stp'].includes(fileExt(file?.file_name));

const readError = async (response) => {
  try {
    const data = await response.json();
    if (typeof data.detail === 'string') return data.detail;
  } catch {
    // ignore
  }
  return 'Request failed';
};

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
  const [actingId, setActingId] = useState(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentRows, setAttachmentRows] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [workFiles, setWorkFiles] = useState([]);
  const [createForm] = Form.useForm();

  const loadRows = async () => {
    const operatorId = getOperatorId();
    if (!operatorId) {
      setRows([]);
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
        row.from_dept,
        row.to_dept,
        sentByName(row),
        assignedByName(row),
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

  const openCreate = () => {
    createForm.resetFields();
    setWorkFiles([]);
    createForm.setFieldsValue({ indentor: getOperatorName(), center: getOperatorCenter() });
    setCreateOpen(true);
  };

  const submitJob = async (values) => {
    const operatorId = getOperatorId();
    if (!operatorId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setCreating(true);
    try {
      const selected = machines.find((machine) => Number(machine.id) === Number(values.machine_id));
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          created_by: Number(operatorId),
          project_no: values.proj_no,
          project_name: values.proj_name,
          description: values.description,
          from_dept: values.center || getOperatorCenter() || null,
          to_dept: null,
          machine_id: values.machine_id,
          workcenter_id: selected?.work_center_id || null,
          work_done: true,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      const created = await response.json();
      for (const file of workFiles) {
        const raw = file.originFileObj;
        if (!raw) continue;
        const formData = new FormData();
        formData.append('file', raw);
        formData.append('kind', '2d');
        const upload = await authFetch(`${API_BASE_URL}/urgent-job-indents/${created.id}/attachments`, {
          method: 'POST',
          body: formData,
        });
        if (!upload.ok) {
          message.warning(await readError(upload));
        }
      }
      message.success('Job sent to Manufacturing Coordinator and Supervisor');
      setCreateOpen(false);
      createForm.resetFields();
      setWorkFiles([]);
      await loadRows();
    } catch {
      message.error('Failed to send job');
    } finally {
      setCreating(false);
    }
  };

  const runProgress = async (record, action) => {
    const operatorId = getOperatorId();
    if (!operatorId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setActingId(`${action}-${record.id}`);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/${action}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ operator_id: Number(operatorId) }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success(action === 'activate' ? 'Job activated' : 'Job completed');
      await loadRows();
    } catch {
      message.error(action === 'activate' ? 'Failed to activate job' : 'Failed to complete job');
    } finally {
      setActingId(null);
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
      render: (_, record) => projectCell(record),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      align: 'center',
      ellipsis: true,
      sorter: textSort((row) => row.description),
      render: (value) => value || '-',
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      align: 'center',
      sorter: textSort((row) => row.machine_name),
      render: (value) => value || '-',
    },
    {
      title: 'Center',
      dataIndex: 'from_dept',
      key: 'from_dept',
      align: 'center',
      render: (value) => value || '-',
    },
    {
      title: 'Sent by',
      key: 'sent_by',
      align: 'center',
      sorter: textSort(sentByName),
      render: (_, record) => sentByName(record),
    },
    {
      title: 'Assigned by',
      key: 'assigned_by',
      align: 'center',
      sorter: textSort(assignedByName),
      render: (_, record) => assignedByName(record),
    },
    {
      title: 'Assigned at',
      dataIndex: 'assigned_at',
      key: 'assigned_at',
      align: 'center',
      width: 170,
      sorter: dateSort((row) => row.assigned_at),
      render: (value) => formatWhen(value),
    },
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
      title: 'Activated at',
      dataIndex: 'activated_at',
      key: 'activated_at',
      align: 'center',
      width: 170,
      sorter: dateSort((row) => row.activated_at),
      render: (value) => formatWhen(value),
    },
    {
      title: 'Completed at',
      dataIndex: 'completed_at',
      key: 'completed_at',
      align: 'center',
      width: 170,
      sorter: dateSort((row) => row.completed_at),
      render: (value) => formatWhen(value),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 210,
      fixed: 'right',
      render: (_, record) => {
        const activated = Boolean(record.activated_at);
        const completed = Boolean(record.completed_at);
        return (
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={activated || completed}
              loading={actingId === `activate-${record.id}`}
              onClick={() => runProgress(record, 'activate')}
            >
              Activate
            </Button>
            <Button
              size="small"
              icon={<CheckOutlined />}
              disabled={!activated || completed}
              loading={actingId === `complete-${record.id}`}
              onClick={() => runProgress(record, 'complete')}
            >
              Complete
            </Button>
          </Space>
        );
      },
    },
  ];

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
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Job
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredRows}
          loading={loading}
          components={tableHeader}
          scroll={{ x: 1600 }}
          locale={{ emptyText: 'No right now jobs assigned yet' }}
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
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {String(attachment.kind || '').toUpperCase()}
                        {attachment.file_size ? ` · ${(attachment.file_size / 1024).toFixed(1)} KB` : ''}
                      </Text>
                    </div>
                  </Space>
                  <Space>
                    <Tooltip title="Preview">
                      <Button type="text" icon={<EyeOutlined />} onClick={() => setPreviewFile(attachment)} />
                    </Tooltip>
                    <Button type="link" onClick={() => downloadUrgentAttachment(attachment)}>
                      Download
                    </Button>
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
          <Button key="download" type="primary" onClick={() => downloadUrgentAttachment(previewFile)}>
            Download
          </Button>,
          <Button key="close" onClick={() => setPreviewFile(null)}>Close</Button>,
        ]}
        width="90%"
        style={{ top: 16 }}
        styles={{ body: { height: '80vh', padding: 0, overflow: 'hidden' } }}
        destroyOnClose
      >
        <div style={{ height: '100%' }}>
          {previewFile && is3dPreviewFile(previewFile) ? (
            <div style={{ height: '100%' }}>
              <ModelViewer3D
                modelEndpoint={`/urgent-job-indents/attachments/${previewFile.id}/3d`}
                height="100%"
                showControls
                showEdgeButton
                restrictZoom={false}
              />
            </div>
          ) : previewFile ? (
            <DocumentPreviewer
              url={previewFile.minio_url}
              fileName={previewFile.file_name}
              meta={{ format: previewFile.file_type }}
              height="100%"
            />
          ) : (
            <p>Preview is not available for this file type. Download to open the file.</p>
          )}
        </div>
      </Modal>

      <Modal
        title="Add Right Now Job"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); setWorkFiles([]); }}
        footer={[
          <Button key="close" onClick={() => { setCreateOpen(false); createForm.resetFields(); setWorkFiles([]); }}>Close</Button>,
          <Button key="send" type="primary" loading={creating} onClick={() => createForm.submit()}>Send</Button>,
        ]}
        maskClosable={false}
        destroyOnClose
        width={920}
      >
        <Form form={createForm} layout="vertical" onFinish={submitJob} requiredMark autoComplete="off">
          <div style={{ border: slipBorder, background: '#fff' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={slipCell}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Operator</div>
                <Form.Item name="indentor" style={{ marginBottom: 8 }}>
                  <Input disabled autoComplete="off" />
                </Form.Item>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Center</div>
                <Form.Item name="center" style={{ marginBottom: 0 }}>
                  <Input disabled autoComplete="off" />
                </Form.Item>
              </div>
              <div style={{ ...slipCell, borderRight: 'none' }}>
                <Form.Item name="proj_no" label="Project No. :" style={{ marginBottom: 8 }}>
                  <Input placeholder="Project number" autoComplete="off" />
                </Form.Item>
                <Form.Item name="proj_name" label="Project Name :" style={{ marginBottom: 8 }}>
                  <Input placeholder="Project name" autoComplete="off" />
                </Form.Item>
                <Form.Item
                  name="machine_id"
                  label="Machine :"
                  style={{ marginBottom: 0 }}
                  rules={[{ required: true, message: 'Select machine' }]}
                >
                  <Select
                    showSearch
                    placeholder="Select machine"
                    optionFilterProp="label"
                    options={machineFilterOptions}
                    filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                  />
                </Form.Item>
              </div>
            </div>
            <div style={{ borderTop: slipBorder, padding: 12 }}>
              <Form.Item
                name="description"
                label={<span style={{ fontWeight: 700 }}>Description</span>}
                style={{ marginBottom: 12 }}
                rules={[{ required: true, message: 'Enter a description' }]}
              >
                <TextArea
                  rows={5}
                  maxLength={1000}
                  showCount
                  autoComplete="off"
                  placeholder="Enter the work done. Attach photos, a document, or a PDF below."
                />
              </Form.Item>
              <Form.Item label="Photos, documents or PDF" style={{ marginBottom: 0 }}>
                <Upload
                  multiple
                  fileList={workFiles}
                  beforeUpload={() => false}
                  accept={WORK_EXT.join(',')}
                  onChange={({ fileList }) => {
                    const next = [];
                    let rejected = false;
                    fileList.forEach((file) => {
                      const name = String(file.name || '').toLowerCase();
                      if (WORK_EXT.some((ext) => name.endsWith(ext))) next.push(file);
                      else rejected = true;
                    });
                    if (rejected) message.error('Only photos, PDF, DOC and DOCX files are allowed');
                    setWorkFiles(next);
                  }}
                >
                  <Button icon={<UploadOutlined />}>Upload files</Button>
                </Upload>
                <Text type="secondary" style={{ fontSize: 12 }}>PNG, JPG, WEBP, PDF, DOC, DOCX</Text>
              </Form.Item>
            </div>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default RightNowJobs;
