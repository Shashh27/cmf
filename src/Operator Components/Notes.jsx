import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Tooltip, Typography, message, Popconfirm, Upload } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined, EditOutlined, DeleteOutlined, UploadOutlined, FileOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuth } from '../auth/AuthContext.jsx';
import { API_BASE_URL } from '../Config/auth.js';
import { authFetch, readStoredUser } from '../api/client.js';

const { RangePicker } = DatePicker;
const { Text } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

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
  const [dateRange, setDateRange] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [attachmentsModalOpen, setAttachmentsModalOpen] = useState(false);
  const [selectedNoteAttachments, setSelectedNoteAttachments] = useState([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

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
    setEditingNote(null);
    form.setFieldsValue(blankForm);
    setOpen(true);
  };

  const openEditNote = (note) => {
    setEditingNote(note);
    form.setFieldsValue({
      project_name: note.project_name || '',
      order_no: note.order_no || '',
      part_name: note.part_name || '',
      part_no: note.part_no || '',
      description: note.description || '',
    });
    setOpen(true);
  };

  const closeNotes = () => {
    setOpen(false);
    setEditingNote(null);
    form.resetFields();
  };

  const handleSubmit = async (values) => {
    if (!operatorId) {
      message.error('Operator not found in session. Please log in again.');
      return;
    }
    setSubmitting(true);
    try {
      const isEdit = editingNote !== null;
      const url = isEdit ? `${API_BASE_URL}/maintenance/notes/${editingNote.id}` : `${API_BASE_URL}/maintenance/notes`;
      const method = isEdit ? 'PUT' : 'POST';
      const body = isEdit
        ? {
            order_no: values.order_no || null,
            project_name: values.project_name || null,
            part_no: values.part_no || null,
            part_name: values.part_name || null,
            description: values.description,
          }
        : {
            operator_id: operatorId,
            machine_id: resolveMachineId(),
            order_no: values.order_no || null,
            project_name: values.project_name || null,
            part_no: values.part_no || null,
            part_name: values.part_name || null,
            description: values.description,
          };

      const response = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }

      const noteData = await response.json();
      const noteId = isEdit ? editingNote.id : noteData.id;

      // Upload files if any
      if (fileList.length > 0) {
        const uploadPromises = fileList.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file.originFileObj);

          const uploadResponse = await authFetch(`${API_BASE_URL}/maintenance/notes/${noteId}/attachments`, {
            method: 'POST',
            body: formData,
          });

          if (!uploadResponse.ok) {
            throw new Error(await readError(uploadResponse));
          }

          return uploadResponse.json();
        });

        try {
          await Promise.all(uploadPromises);
        } catch (error) {
          message.error(error.message || 'Failed to upload some files');
        }
      }

      message.success(isEdit ? 'Note updated successfully' : 'Note sent to the supervisor');
      closeNotes();
      setPage(1);
      await loadNotes();
    } catch {
      message.error(isEdit ? 'Failed to update note' : 'Failed to send note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (noteId) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success('Note deleted successfully');
      setPage(1);
      await loadNotes();
    } catch {
      message.error('Failed to delete note');
    }
  };

  const handleUpload = async (noteId) => {
    if (fileList.length === 0) {
      message.error('Please select files to upload');
      return;
    }

    setUploading(true);
    const uploadPromises = fileList.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file.originFileObj);

      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/${noteId}/attachments`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      return response.json();
    });

    try {
      await Promise.all(uploadPromises);
      message.success('Files uploaded successfully');
      setFileList([]);
      await loadNotes();
    } catch (error) {
      message.error(error.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const loadAttachments = async (noteId) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/${noteId}/attachments`);
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      setSelectedNoteAttachments(await response.json());
      setAttachmentsModalOpen(true);
    } catch {
      message.error('Failed to load attachments');
    }
  };

  const deleteAttachment = async (attachmentId) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/maintenance/notes/attachments/${attachmentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success('Attachment deleted');
      setSelectedNoteAttachments(selectedNoteAttachments.filter((att) => att.id !== attachmentId));
    } catch {
      message.error('Failed to delete attachment');
    }
  };

  const openPreview = (attachment) => {
    setPreviewFile(attachment);
    setPreviewModalOpen(true);
  };

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return notes.filter((note) => {
      if (machineFilter.length > 0 && !machineFilter.includes(note.machine_id)) return false;
      if (dateRange && dateRange.length === 2) {
        const noteDate = dayjs(note.created_at);
        const [startDate, endDate] = dateRange;
        if (noteDate.isBefore(startDate, 'day') || noteDate.isAfter(endDate, 'day')) return false;
      }
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
  }, [notes, search, machineFilter, dateRange]);

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
    {
      title: 'Actions',
      key: 'actions',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status === 'pending' && (
            <>
              <Tooltip title="Edit">
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  size="small"
                  onClick={() => openEditNote(record)}
                />
              </Tooltip>
              <Popconfirm
                title="Delete this note?"
                description="Are you sure you want to delete this note?"
                onConfirm={() => handleDelete(record.id)}
                okText="Yes"
                cancelText="No"
              >
                <Tooltip title="Delete">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                  />
                </Tooltip>
              </Popconfirm>
            </>
          )}
          <Tooltip title="View Attachments">
            <Button
              type="text"
              icon={<FileOutlined />}
              size="small"
              onClick={() => loadAttachments(record.id)}
            />
          </Tooltip>
        </Space>
      ),
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
            <RangePicker
              allowClear
              placeholder={['From date', 'To date']}
              value={dateRange}
              onChange={(value) => {
                setDateRange(value);
                setPage(1);
              }}
              style={{ width: 260 }}
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
          scroll={{ x: 1500 }}
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
        title={editingNote ? 'Edit Note' : 'Notes'}
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
          <Form.Item label="Attachments (PDF, Images, Videos)">
            <Dragger
              multiple
              fileList={fileList}
              onChange={({ fileList }) => setFileList(fileList)}
              beforeUpload={() => false}
              accept=".pdf,.jpg,.jpeg,.png,.gif,.mp4,.mov,.avi"
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">Click or drag files to upload</p>
              <p className="ant-upload-hint">Support for PDF, images, and videos</p>
            </Dragger>
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={closeNotes}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={submitting}>
              Submit
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal
        title="Attachments"
        open={attachmentsModalOpen}
        onCancel={() => setAttachmentsModalOpen(false)}
        footer={null}
        width={600}
      >
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {selectedNoteAttachments.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#999' }}>No attachments</p>
          ) : (
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {selectedNoteAttachments.map((attachment) => (
                <Card
                  key={attachment.id}
                  size="small"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Space>
                    <FileOutlined />
                    <Text>{attachment.file_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      ({(attachment.file_size / 1024).toFixed(1)} KB)
                    </Text>
                  </Space>
                  <Space>
                    <Tooltip title="Preview">
                      <Button
                        type="text"
                        icon={<EyeOutlined />}
                        size="small"
                        onClick={() => openPreview(attachment)}
                      />
                    </Tooltip>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      size="small"
                      onClick={() => deleteAttachment(attachment.id)}
                    />
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </div>
      </Modal>

      <Modal
        title={previewFile?.file_name || 'Preview'}
        open={previewModalOpen}
        onCancel={() => setPreviewModalOpen(false)}
        footer={[
          <Button key="download" type="primary" href={previewFile?.minio_url} target="_blank" rel="noopener noreferrer">
            Download
          </Button>,
          <Button key="close" onClick={() => setPreviewModalOpen(false)}>
            Close
          </Button>,
        ]}
        width={800}
      >
        {previewFile && (
          <div style={{ textAlign: 'center' }}>
            {previewFile.file_type.startsWith('image/') ? (
              <img
                src={previewFile.minio_url}
                alt={previewFile.file_name}
                style={{ maxWidth: '100%', maxHeight: '60vh' }}
              />
            ) : previewFile.file_type.startsWith('video/') ? (
              <video
                src={previewFile.minio_url}
                controls
                style={{ maxWidth: '100%', maxHeight: '60vh' }}
              />
            ) : previewFile.file_type === 'application/pdf' ? (
              <iframe
                src={previewFile.minio_url}
                style={{ width: '100%', height: '60vh', border: 'none' }}
                title={previewFile.file_name}
              />
            ) : (
              <p>Preview not available for this file type. Please download to view.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OperatorNotes;
