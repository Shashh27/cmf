import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Modal, Select, Space, Table, Tooltip, Typography, message } from 'antd';
import { EyeOutlined, FileOutlined, PaperClipOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import { api, authFetch } from '../api/client.js';
import ModelViewer3D from '../ProjectCoordinator Components/PDM Components/ModelViewer3D';
import { downloadUrgentAttachment } from '../utils/urgentJobDownload.js';

const { Text } = Typography;

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
        row.to_dept,
        sentByName(row),
        row.mc_name,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

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
    { title: 'From', dataIndex: 'from_dept', align: 'center', render: (value) => value || '-' },
    { title: 'Dept', dataIndex: 'to_dept', align: 'center', render: (value) => value || '-' },
    { title: 'Sent by', key: 'sent_by', align: 'center', render: (_, record) => sentByName(record) },
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
    { title: 'Activated at', dataIndex: 'activated_at', align: 'center', width: 170, sorter: dateSort((row) => row.activated_at), render: (value) => formatWhen(value) },
    { title: 'Completed at', dataIndex: 'completed_at', align: 'center', width: 170, sorter: dateSort((row) => row.completed_at), render: (value) => formatWhen(value) },
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