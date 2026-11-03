import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table, Tooltip, Typography, Upload, message,
} from 'antd';
import {
  CheckOutlined, CloseOutlined, DeleteOutlined, EditOutlined, EyeOutlined, FileOutlined,
  PaperClipOutlined, PlusOutlined, ReloadOutlined, SearchOutlined, UploadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext.jsx';
import { api, authFetch, readStoredUser } from '../api/client.js';
import { API_BASE_URL } from '../Config/auth.js';
import ModelViewer3D from '../ProjectCoordinator Components/PDM Components/ModelViewer3D';
import { downloadUrgentAttachment } from '../Utils/urgentJobDownload.js';
import UrgentJobsPdfDownload from '../DownloadReports/UrgentJobsPdfDownload.jsx';

const { Text } = Typography;
const { TextArea } = Input;

const TWO_D_EXT = ['.pdf', '.png', '.jpg', '.jpeg', '.dwg', '.dxf'];
const THREE_D_EXT = ['.stl', '.step', '.stp', '.obj'];

const statusTextColor = {
  pending: '#d48806',
  accepted: '#52c41a',
  assigned: '#52c41a',
  rejected: '#ff4d4f',
};

const slipBorder = '1px solid #d9d9d9';
const slipBg = '#fff';
const slipCell = {
  borderRight: slipBorder,
  padding: '10px 12px',
  minHeight: 92,
};

const statusLabel = (status) => {
  const value = status || 'pending';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

const resolveUserId = (authUser) => {
  const candidates = [authUser, readStoredUser()];
  try {
    const raw = localStorage.getItem('user');
    if (raw) candidates.push(JSON.parse(raw));
  } catch {
    // ignore
  }
  for (const user of candidates) {
    const id = user?.id ?? user?.user_id;
    if (id) return Number(id);
  }
  return null;
};

const resolveUserName = (authUser) => {
  const candidates = [authUser, readStoredUser()];
  try {
    const raw = localStorage.getItem('user');
    if (raw) candidates.push(JSON.parse(raw));
  } catch {
    // ignore
  }
  for (const user of candidates) {
    const name = user?.user_name || user?.username || user?.name;
    if (name) return String(name);
  }
  return '';
};

const resolveUserCenter = (authUser) => {
  const candidates = [authUser, readStoredUser()];
  try {
    const raw = localStorage.getItem('user');
    if (raw) candidates.push(JSON.parse(raw));
  } catch {
    // ignore
  }
  for (const user of candidates) {
    const center = user?.center;
    if (center) return String(center);
  }
  return '';
};

const textSort = (pick) => (a, b) =>
  String(pick(a) || '').localeCompare(String(pick(b) || ''), undefined, { sensitivity: 'base' });

const dateSort = (pick) => (a, b) => new Date(pick(a) || 0) - new Date(pick(b) || 0);

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
  const day = date.toLocaleDateString('en-GB');
  const time = date
    .toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase();
  return { day, time };
};

const isLockedStatus = (status) => {
  const value = String(status || 'pending').toLowerCase();
  return value === 'accepted' || value === 'rejected' || value === 'assigned';
};

/** MC can still edit/delete own assigned jobs until the operator activates. */
const isManageRowLocked = (record, { audience } = {}) => {
  const status = String(record?.status || 'pending').toLowerCase();
  if (status === 'rejected') return true;
  if (record?.activated_at || record?.completed_at) return true;
  if (audience === 'mc') return false;
  return isLockedStatus(status);
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

const isOperatorRole = (role) => String(role || '').toLowerCase().includes('operator');

const machineLabel = (machine) => {
  if (!machine) return '-';
  if (machine.make && machine.model) return `(${machine.make}) ${machine.model}`;
  return machine.make || machine.model || machine.type || `Machine ${machine.id}`;
};

const fileExt = (name) => {
  const value = String(name || '').toLowerCase();
  const idx = value.lastIndexOf('.');
  return idx >= 0 ? value.slice(idx) : '';
};

const is3dPreviewFile = (file) => ['.stl', '.step', '.stp'].includes(fileExt(file?.file_name));

const keepAllowedFiles = (list, allowed) => {
  const next = [];
  let rejected = false;
  list.forEach((file) => {
    if (file.existingId || file.url || allowed.includes(fileExt(file.name))) {
      next.push(file);
    } else {
      rejected = true;
    }
  });
  if (rejected) {
    message.error(`Only ${allowed.join(', ')} files are allowed`);
  }
  return next;
};

const toUploadItem = (attachment) => ({
  uid: `att-${attachment.id}`,
  name: attachment.file_name,
  status: 'done',
  url: attachment.minio_url,
  existingId: attachment.id,
});

const UrgentJobs = ({ audience = 'mc', onUnreadCountChange }) => {
  const { user } = useAuth();
  const userId = resolveUserId(user);
  const indentorName = resolveUserName(user);
  const indentorCenter = resolveUserCenter(user);
  const isManagePage = audience === 'pc' || audience === 'mc';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState([]);
  const [filterMachines, setFilterMachines] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [files2d, setFiles2d] = useState([]);
  const [files3d, setFiles3d] = useState([]);

  const [review, setReview] = useState(null);
  const [reviewForm] = Form.useForm();
  const [completionReview, setCompletionReview] = useState(null);
  const [completionForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [operators, setOperators] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const [ackingId, setAckingId] = useState(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentRows, setAttachmentRows] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  const loadRows = async () => {
    setLoading(true);
    try {
      if ((audience === 'pc' || audience === 'operator') && !userId) {
        setRows([]);
        return;
      }
      const params = new URLSearchParams();
      if (audience === 'pc' && userId) params.set('created_by', String(userId));
      if (audience === 'operator' && userId) params.set('operator_id', String(userId));
      if (audience === 'mc' && userId) params.set('for_mc_id', String(userId));
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/?${params.toString()}`);
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      const visible = audience === 'operator'
        ? list.filter((row) => ['assigned', 'accepted'].includes(row.status))
        : audience === 'mc-notify'
          ? list.filter((row) => Number(row.created_by) !== Number(userId) && (
            row.mc_id == null || Number(row.created_by) !== Number(row.mc_id)
          ))
          : audience === 'mc'
            ? list.filter((row) => (
              Number(row.created_by) === Number(userId)
              || row.mc_id == null
              || Number(row.created_by) !== Number(row.mc_id)
            ))
            : list.filter((row) => Number(row.created_by) === Number(userId));
      setRows(visible);
    } catch {
      message.error('Failed to load right now jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, userId]);

  useEffect(() => {
    if (audience !== 'mc') return;
    const loadFilterMachines = async () => {
      try {
        const res = await api.get('/machines/');
        setFilterMachines(Array.isArray(res.data) ? res.data : []);
      } catch {
        setFilterMachines([]);
      }
    };
    loadFilterMachines();
  }, [audience]);

  useEffect(() => {
    if (createOpen && indentorName) {
      createForm.setFieldValue('indentor', indentorName);
      createForm.setFieldValue('center', indentorCenter);
    }
  }, [createOpen, indentorName, indentorCenter, createForm]);

  const unreadCount = useMemo(() => {
    if (audience === 'mc-notify') return rows.filter((row) => !row.mc_ack).length;
    if (audience === 'operator') return rows.filter((row) => ['assigned', 'accepted'].includes(row.status) && !row.operator_ack).length;
    return 0;
  }, [rows, audience]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const openCreate = async () => {
    createForm.resetFields();
    setEditingRecord(null);
    setFiles2d([]);
    setFiles3d([]);
    setCreateOpen(true);
    createForm.setFieldsValue({
      indentor: indentorName,
      center: indentorCenter,
    });
    setMachines([]);
    if (audience === 'mc') {
      await loadAssignOptions();
    }
  };

  const openEdit = async (record) => {
    if (isManageRowLocked(record, { audience })) return;
    createForm.resetFields();
    setEditingRecord(record);
    const attachments = Array.isArray(record.attachments) ? record.attachments : [];
    setFiles2d(attachments.filter((item) => item.kind === '2d').map(toUploadItem));
    setFiles3d(attachments.filter((item) => item.kind === '3d').map(toUploadItem));
    setCreateOpen(true);
    createForm.setFieldsValue({
      indentor: record.created_by_name || indentorName,
      center: record.from_dept || indentorCenter,
      proj_no: record.order_no,
      proj_name: record.project_name,
      description: record.description,
      operator_id: record.operator_id,
      machine_id: record.machine_id,
    });
    if (audience === 'mc') {
      await loadAssignOptions();
    }
  };

  const deleteRow = async (record) => {
    if (isManageRowLocked(record, { audience })) {
      message.error(
        record?.activated_at || record?.completed_at
          ? 'Activated or completed jobs cannot be deleted'
          : 'Approved or rejected jobs cannot be deleted',
      );
      return;
    }
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}`, { method: 'DELETE' });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success('Job deleted');
      await loadRows();
    } catch {
      message.error('Failed to delete job');
    }
  };

  const removeExistingFile = async (file) => {
    if (!file?.existingId) return true;
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/attachments/${file.existingId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        message.error(await readError(response));
        return false;
      }
      return true;
    } catch {
      message.error('Failed to remove file');
      return false;
    }
  };

  const uploadFiles = async (indentId, list, kind) => {
    for (const file of list) {
      if (file.existingId) continue;
      const raw = file.originFileObj;
      if (!raw) continue;
      const formData = new FormData();
      formData.append('file', raw);
      formData.append('kind', kind);
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${indentId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
    }
  };

  const submitCreate = async (values) => {
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setCreating(true);
    try {
      const isEdit = Boolean(editingRecord);
      const payload = {
        project_no: values.proj_no,
        project_name: values.proj_name,
        description: values.description,
        from_dept: values.center || indentorCenter,
        operator_id: audience === 'mc' ? values.operator_id : null,
        workcenter_id: audience === 'mc'
          ? (machines.find((machine) => Number(machine.id) === Number(values.machine_id))?.work_center_id || null)
          : null,
        machine_id: audience === 'mc' ? values.machine_id : null,
      };
      const response = await authFetch(
        isEdit ? `${API_BASE_URL}/urgent-job-indents/${editingRecord.id}` : `${API_BASE_URL}/urgent-job-indents/`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(isEdit ? payload : { created_by: userId, ...payload }),
        },
      );
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      const saved = await response.json();
      try {
        await uploadFiles(saved.id, files2d, '2d');
        await uploadFiles(saved.id, files3d, '3d');
        message.success(isEdit ? 'Right now job updated' : audience === 'mc' ? 'Right now job created' : 'Right now job sent to Manufacturing Coordinator');
      } catch (error) {
        message.warning(error.message || 'Job saved, but some files failed to upload');
      }
      setCreateOpen(false);
      setEditingRecord(null);
      await loadRows();
    } catch {
      message.error('Failed to send indent');
    } finally {
      setCreating(false);
    }
  };

  const loadAssignOptions = async () => {
    setMachinesLoading(true);
    try {
      const [usersRes, machineRes] = await Promise.all([
        api.get('/access-users/'),
        api.get('/machines/'),
      ]);
      const users = Array.isArray(usersRes.data) ? usersRes.data : [];
      setOperators(users.filter((u) => isOperatorRole(u.role)));
      setMachines(Array.isArray(machineRes.data) ? machineRes.data : []);
    } catch {
      setOperators([]);
      setMachines([]);
    } finally {
      setMachinesLoading(false);
    }
  };

  const openReview = async (record, status) => {
    reviewForm.resetFields();
    setMachines([]);
    setReview({ record, status });
    if (status === 'accepted') {
      await loadAssignOptions();
    }
  };

  const openCompletionReview = (record, status) => {
    completionForm.resetFields();
    setCompletionReview({ record, status });
  };

  const submitCompletionReview = async (values) => {
    if (!userId || !completionReview?.record) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    if (completionReview.status === 'rejected' && !String(values.remark || '').trim()) {
      message.error('Remarks are required to reject');
      return;
    }
    setSubmitting(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${completionReview.record.id}/completion-review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          as_role: 'mc',
          status: completionReview.status,
          remark: values.remark || null,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success(completionReview.status === 'approved' ? 'Log approved' : 'Log rejected');
      setCompletionReview(null);
      await loadRows();
    } catch {
      message.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (values) => {
    if (!userId || !review?.record) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    if (review.status === 'rejected' && !String(values.remark || '').trim()) {
      message.error('Remarks are required to reject');
      return;
    }
    setSubmitting(true);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${review.record.id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          mc_id: userId,
          status: review.status,
          remark: values.remark || null,
          operator_id: review.status === 'accepted' ? values.operator_id : null,
          workcenter_id: review.status === 'accepted'
            ? (machines.find((machine) => Number(machine.id) === Number(values.machine_id))?.work_center_id || null)
            : null,
          machine_id: review.status === 'accepted' ? values.machine_id : null,
        }),
      });
      if (!response.ok) {
        message.error(await readError(response));
        return;
      }
      message.success(review.status === 'accepted' ? 'Indent accepted and assigned' : 'Indent rejected');
      setReview(null);
      await loadRows();
    } catch {
      message.error('Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const acknowledge = async (record) => {
    if (!userId) {
      message.error('User not found in session. Please log in again.');
      return;
    }
    setAckingId(record.id);
    try {
      const response = await authFetch(`${API_BASE_URL}/urgent-job-indents/${record.id}/acknowledge`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ user_id: userId, as_role: audience === 'mc-notify' ? 'mc' : 'operator' }),
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
      setAckingId(null);
    }
  };

  const openAttachments = (record) => {
    setAttachmentRows(Array.isArray(record.attachments) ? record.attachments : []);
    setAttachmentsOpen(true);
  };

  const machineFilterOptions = useMemo(() => {
    const map = new Map();
    filterMachines.forEach((machine) => {
      if (machine?.id == null) return;
      map.set(Number(machine.id), machineLabel(machine));
    });
    rows.forEach((row) => {
      if (row.machine_id == null) return;
      const id = Number(row.machine_id);
      if (!map.has(id)) map.set(id, row.machine_name || `Machine ${id}`);
    });
    return Array.from(map.entries())
      .sort((a, b) => String(a[1]).localeCompare(String(b[1])))
      .map(([value, label]) => ({ value, label }));
  }, [filterMachines, rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const selectedMachines = (machineFilter || []).map((id) => Number(id));
    return rows.filter((row) => {
      if (selectedMachines.length > 0 && !selectedMachines.includes(Number(row.machine_id))) return false;
      if (!query) return true;
      return [
        row.order_no,
        row.project_name,
        row.part_name,
        row.part_no,
        row.description,
        row.status,
        row.operator_name,
        row.machine_name,
        row.workcenter_name,
        row.created_by_name,
        row.mc_remark,
        row.from_dept,
        row.from_name,
        row.mc_decision,
        row.to_dept,
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [rows, search, machineFilter]);

  const statusColumn = {
    title: isManagePage ? 'STATUS' : 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 160,
    align: 'center',
    filters: [
      { text: 'Pending', value: 'pending' },
      { text: 'Accepted', value: 'accepted' },
      { text: 'Assigned', value: 'assigned' },
      { text: 'Rejected', value: 'rejected' },
    ],
    onFilter: (value, record) => (record.status || 'pending') === value,
    render: (status, record) => {
      const value = status || 'pending';
      const when = value === 'pending' ? record.created_at : (record.reviewed_at || record.assigned_at || record.created_at);
      const parts = formatStatusWhen(when);
      const actor = record.mc_name || record.created_by_name;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.3 }}>
          <span style={{ color: statusTextColor[value] || '#595959', fontWeight: 600 }}>
            {statusLabel(value)}
          </span>
          {parts !== '-' && (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>
              {parts.day},<br />{parts.time}
            </span>
          )}
          {value !== 'pending' && actor && (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>by {actor}</span>
          )}
        </div>
      );
    },
  };

  const columns = [
    {
      title: isManagePage ? 'SL NO' : 'Sl No',
      key: 'sl_no',
      width: 80,
      align: 'center',
      render: (_, __, index) => (page - 1) * pageSize + index + 1,
    },
    ...(audience === 'pc' ? [] : [{
      title: isManagePage ? 'FROM' : 'From',
      key: 'from',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.from_name || record.created_by_name),
      render: (_, record) => {
        const name = record.from_name
          || (record.created_by != null && record.mc_id != null && Number(record.created_by) !== Number(record.mc_id)
            ? record.created_by_name
            : null)
          || record.created_by_name
          || '-';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isManagePage ? 'center' : 'flex-start', lineHeight: 1.3 }}>
            <span>{name}</span>
            {!record.from_name && record.from_dept ? (
              <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.from_dept}</span>
            ) : null}
          </div>
        );
      },
    }]),
    {
      title: isManagePage ? 'PROJECT NO.' : 'Proj. No.',
      dataIndex: 'order_no',
      key: 'order_no',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.order_no),
      render: (value, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isManagePage ? 'center' : 'flex-start', lineHeight: 1.3 }}>
          <span style={{ fontWeight: 500 }}>{value || '-'}</span>
          {record.project_name && (
            <span style={{ color: '#8c8c8c', fontSize: 12 }}>{record.project_name}</span>
          )}
        </div>
      ),
    },
    {
      title: isManagePage ? 'DESCRIPTION' : 'Description',
      dataIndex: 'description',
      key: 'description',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.description),
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <span>{text || '-'}</span>
        </Tooltip>
      ),
    },
    {
      title: isManagePage ? 'FILES' : 'Files',
      key: 'files',
      width: 90,
      align: isManagePage ? 'center' : undefined,
      render: (_, record) => {
        const count = (record.attachments || []).length;
        if (!count) return '-';
        return (
          <Button type="link" size="small" icon={<PaperClipOutlined />} onClick={() => openAttachments(record)}>
            {count}
          </Button>
        );
      },
    },
    ...(audience === 'mc' ? [{
      title: isManagePage ? 'OPERATOR' : 'Operator',
      dataIndex: 'operator_name',
      key: 'operator_name',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.operator_name),
      render: (name) => name || '-',
    }] : []),
    ...(audience === 'mc' ? [{
      title: isManagePage ? 'MACHINE' : 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.machine_name),
      render: (name) => name || '-',
    }] : []),
    ...(audience === 'mc' ? [{
      title: isManagePage ? 'DURATION' : 'Duration',
      key: 'duration',
      align: isManagePage ? 'center' : undefined,
      width: 220,
      sorter: dateSort((record) => record.completed_at || record.activated_at),
      render: (_, record) => (
        <div style={{ lineHeight: 1.35 }}>
          <div>From: {formatWhen(record.activated_at)}</div>
          <div>To: {formatWhen(record.completed_at)}</div>
        </div>
      ),
    }] : []),
    ...(audience === 'mc' ? [{
      title: isManagePage ? 'LOG REVIEW' : 'Log review',
      key: 'log_review',
      align: isManagePage ? 'center' : undefined,
      width: 160,
      render: (_, record) => {
        if (!record.completed_at) return '-';
        let label = 'Pending';
        let color = '#8c8c8c';
        let remark = null;
        if (record.mc_decision === 'approved') {
          label = `Approved by ${record.mc_decision_by || 'MC'}`;
          color = '#52c41a';
          remark = record.mc_decision_remark;
        } else if (record.supervisor_decision === 'approved') {
          label = `Approved by ${record.supervisor_decision_by || 'Supervisor'}`;
          color = '#52c41a';
          remark = record.supervisor_decision_remark;
        } else if (record.mc_decision === 'rejected') {
          label = `Rejected by ${record.mc_decision_by || 'MC'}`;
          color = '#ff4d4f';
          remark = record.mc_decision_remark;
        } else if (record.supervisor_decision === 'rejected') {
          label = `Rejected by ${record.supervisor_decision_by || 'Supervisor'}`;
          color = '#ff4d4f';
          remark = record.supervisor_decision_remark;
        }
        return (
          <div style={{ lineHeight: 1.3 }}>
            <span style={{ color, fontWeight: 600 }}>{label}</span>
            {remark ? <div style={{ color: '#8c8c8c', fontSize: 12 }}>{remark}</div> : null}
          </div>
        );
      },
    }] : []),
    ...(audience === 'pc' ? [{
      title: isManagePage ? 'SENT AT' : 'Sent at',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 170,
      align: isManagePage ? 'center' : undefined,
      sorter: dateSort((record) => record.created_at),
      render: (value) => formatWhen(value),
    }] : []),
    {
      title: isManagePage ? 'REMARKS' : 'Remarks',
      dataIndex: 'mc_remark',
      key: 'mc_remark',
      align: isManagePage ? 'center' : undefined,
      sorter: textSort((record) => record.mc_remark),
      ellipsis: true,
      render: (text) => text || '-',
    },
    statusColumn,
    {
      title: isManagePage ? 'ACTIONS' : 'Action',
      key: 'action',
      width: 110,
      align: 'center',
      fixed: 'right',
      render: (_, record) => {
        if (isManagePage) {
          const locked = isManageRowLocked(record, { audience });
          const lockReason = record?.activated_at || record?.completed_at
            ? 'Locked after operator activation'
            : 'Locked after approval or rejection';
          const canReview = audience === 'mc' && record.status === 'pending' && Number(record.created_by) !== Number(userId);
          const logSettled = Boolean(record.mc_decision || record.supervisor_decision);
          const canCompletionReview = audience === 'mc'
            && Boolean(record.completed_at)
            && !logSettled
            && (record.mc_id == null || Number(record.mc_id) === Number(userId));
          if (canReview) {
            return (
              <Space>
                <Tooltip title="Approve">
                  <Button type="text" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => openReview(record, 'accepted')} />
                </Tooltip>
                <Tooltip title="Reject">
                  <Button type="text" danger icon={<CloseOutlined />} onClick={() => openReview(record, 'rejected')} />
                </Tooltip>
              </Space>
            );
          }
          if (canCompletionReview) {
            return (
              <Space>
                <Tooltip title="Approve log">
                  <Button type="text" icon={<CheckOutlined />} style={{ color: '#52c41a' }} onClick={() => openCompletionReview(record, 'approved')} />
                </Tooltip>
                <Tooltip title="Reject log">
                  <Button type="text" danger icon={<CloseOutlined />} onClick={() => openCompletionReview(record, 'rejected')} />
                </Tooltip>
              </Space>
            );
          }
          if (audience === 'mc' && record.completed_at && logSettled) {
            return (
              <Space>
                <Tooltip title="Already reviewed">
                  <Button type="text" icon={<CheckOutlined />} disabled />
                </Tooltip>
                <Tooltip title="Already reviewed">
                  <Button type="text" icon={<CloseOutlined />} disabled />
                </Tooltip>
              </Space>
            );
          }
          return (
            <Space>
              <Tooltip title={locked ? lockReason : 'Edit'}>
                <Button type="text" icon={<EditOutlined />} disabled={locked} onClick={() => openEdit(record)} />
              </Tooltip>
              <Popconfirm
                title="Delete job"
                description="Are you sure you want to delete this job?"
                onConfirm={() => deleteRow(record)}
                okText="Yes"
                cancelText="No"
                okButtonProps={{ danger: true }}
                disabled={locked}
              >
                <Tooltip title={locked ? lockReason : 'Delete'}>
                  <Button type="text" danger icon={<DeleteOutlined />} disabled={locked} />
                </Tooltip>
              </Popconfirm>
            </Space>
          );
        }
        if (audience === 'mc-notify') {
          return (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              disabled={Boolean(record.mc_ack)}
              loading={ackingId === record.id}
              onClick={() => acknowledge(record)}
            >
              Acknowledge
            </Button>
          );
        }
        if (audience === 'operator' && ['assigned', 'accepted'].includes(record.status)) {
          return (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              disabled={Boolean(record.operator_ack)}
              loading={ackingId === record.id}
              onClick={() => acknowledge(record)}
            >
              Acknowledge
            </Button>
          );
        }
        return <Text type="secondary">-</Text>;
      },
    },
  ];

  const previewKind = String(previewFile?.file_type || '').toLowerCase();
  const previewName = String(previewFile?.file_name || '').toLowerCase();

  const tablePagination = {
    current: page,
    pageSize,
    size: isManagePage ? 'small' : undefined,
    responsive: true,
    showSizeChanger: true,
    showQuickJumper: isManagePage,
    pageSizeOptions: isManagePage ? ['10', '20', '50', '100'] : [10, 20, 50],
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
    onChange: (nextPage, nextSize) => {
      setPage(nextPage);
      setPageSize(nextSize);
    },
    onShowSizeChange: (_, size) => {
      setPage(1);
      setPageSize(size);
    },
  };

  const tableLocale = {
    emptyText: audience === 'operator'
      ? 'No right now jobs assigned yet'
      : audience === 'mc'
        ? 'No right now jobs from Project Coordinator'
        : 'No right now jobs sent yet',
  };

  const toolbar = isManagePage ? (
    <div className="flex flex-wrap items-center justify-between gap-3 w-full">
      <div className="flex flex-wrap items-center gap-3">
        <Input.Search
          placeholder="Search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          style={{ width: 250 }}
          allowClear
        />
        {audience === 'mc' && (
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
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <UrgentJobsPdfDownload
          rows={filteredRows}
          rowCount={filteredRows.length}
          label={audience === 'mc' ? 'MC Right Now Jobs' : 'PC Right Now Jobs'}
        />
        <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
          Refresh
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          Request
        </Button>
      </div>
    </div>
  ) : (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
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
      <Space wrap>
        <UrgentJobsPdfDownload
          rows={filteredRows}
          rowCount={filteredRows.length}
          label="Right Now Jobs"
        />
        <Button icon={<ReloadOutlined />} onClick={loadRows} loading={loading}>
          Refresh
        </Button>
      </Space>
    </div>
  );

  const tableNode = (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={filteredRows}
      loading={isManagePage ? loading : false}
      pagination={tablePagination}
      bordered={isManagePage}
      size={isManagePage ? 'middle' : undefined}
      scroll={{ x: isManagePage ? 1200 : 1400 }}
      className={isManagePage ? 'pc-right-now-jobs-table' : undefined}
      locale={tableLocale}
    />
  );

  return (
    <div className={isManagePage ? 'p-4 sm:p-6 lg:p-8' : undefined}>
      {isManagePage ? (
        <Card
          variant="borderless"
          className="shadow-sm"
          styles={{
            body: { padding: '12px' },
          }}
        >
          <div style={{ marginBottom: 16 }}>{toolbar}</div>
          <style>{`
            .pc-right-now-jobs-table .ant-table-thead > tr > th {
              background: linear-gradient(to bottom, #f0f5ff, #e6f0ff) !important;
              font-weight: 600;
              border-bottom: 2px solid #1890ff !important;
              white-space: nowrap;
            }
            .pc-right-now-jobs-table .ant-table-cell-fix-right {
              background: #fff !important;
            }
            .pc-right-now-jobs-table .ant-table-thead .ant-table-cell-fix-right {
              background: linear-gradient(to bottom, #f0f5ff, #e6f0ff) !important;
            }
          `}</style>
          {tableNode}
        </Card>
      ) : (
        <Spin spinning={loading}>
          {toolbar}
          {tableNode}
        </Spin>
      )}

      <Modal
        title={editingRecord ? 'Edit Right Now Job' : 'Right Now Job Indent'}
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setEditingRecord(null); createForm.resetFields(); setFiles2d([]); setFiles3d([]); }}
        footer={[
          <Button key="close" onClick={() => { setCreateOpen(false); setEditingRecord(null); createForm.resetFields(); setFiles2d([]); setFiles3d([]); }}>Close</Button>,
          <Button key="send" type="primary" loading={creating} onClick={() => createForm.submit()}>
            {editingRecord ? 'Update' : 'Send'}
          </Button>,
        ]}
        maskClosable={false}
        keyboard={false}
        destroyOnClose
        width={920}
      >
        <Form form={createForm} layout="vertical" onFinish={submitCreate} requiredMark autoComplete="off">
          <div style={{ border: slipBorder, background: slipBg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              <div style={slipCell}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Indentor</div>
                <Form.Item name="indentor" style={{ marginBottom: 8 }}>
                  <Input disabled autoComplete="off" />
                </Form.Item>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Center</div>
                <Form.Item name="center" style={{ marginBottom: 0 }}>
                  <Input disabled autoComplete="off" />
                </Form.Item>
              </div>
              <div style={{ ...slipCell, borderRight: 'none' }}>
                <Form.Item
                  name="proj_no"
                  label="Project No. :"
                  style={{ marginBottom: 8 }}
                  rules={[{ required: true, message: 'Enter project number' }]}
                >
                  <Input placeholder="Project number" autoComplete="off" />
                </Form.Item>
                <Form.Item
                  name="proj_name"
                  label="Project Name :"
                  style={{ marginBottom: 0 }}
                >
                  <Input placeholder="Project name" autoComplete="off" />
                </Form.Item>
                {audience === 'mc' && (
                  <>
                    <Form.Item
                      name="operator_id"
                      label="Operator :"
                      style={{ marginTop: 8, marginBottom: 8 }}
                      rules={[{ required: true, message: 'Select operator' }]}
                    >
                      <Select
                        showSearch
                        placeholder="Select operator"
                        optionFilterProp="label"
                        options={operators.map((op) => ({
                          value: op.id,
                          label: op.user_name || op.gmail || `User ${op.id}`,
                        }))}
                      />
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
                        loading={machinesLoading}
                        optionFilterProp="label"
                        options={machines.map((machine) => ({
                          value: machine.id,
                          label: machineLabel(machine),
                        }))}
                      />
                    </Form.Item>
                  </>
                )}
              </div>
            </div>
            <div style={{ borderTop: slipBorder, padding: 12, minHeight: 260 }}>
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
                  placeholder="Enter Instructions. Attach 2D drawing / 3D model below."
                />
              </Form.Item>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item label="2D drawing" style={{ marginBottom: 0 }}>
                  <Upload
                    multiple
                    fileList={files2d}
                    beforeUpload={() => false}
                    accept={TWO_D_EXT.join(',')}
                    onRemove={removeExistingFile}
                    onChange={({ fileList }) => setFiles2d(keepAllowedFiles(fileList, TWO_D_EXT))}
                  >
                    <Button icon={<UploadOutlined />}>Upload 2D</Button>
                  </Upload>
                  <Text type="secondary" style={{ fontSize: 12 }}>PDF, PNG, JPG, DWG, DXF</Text>
                </Form.Item>
                <Form.Item label="3D model" style={{ marginBottom: 0 }}>
                  <Upload
                    multiple
                    fileList={files3d}
                    beforeUpload={() => false}
                    accept={THREE_D_EXT.join(',')}
                    onRemove={removeExistingFile}
                    onChange={({ fileList }) => setFiles3d(keepAllowedFiles(fileList, THREE_D_EXT))}
                  >
                    <Button icon={<UploadOutlined />}>Upload 3D</Button>
                  </Upload>
                  <Text type="secondary" style={{ fontSize: 12 }}>STL, STEP, STP, OBJ</Text>
                </Form.Item>
              </div>
            </div>
          </div>
        </Form>
      </Modal>

      <Modal
        title={review?.status === 'accepted' ? 'Accept and assign' : 'Reject indent'}
        open={Boolean(review)}
        onCancel={() => setReview(null)}
        onOk={() => reviewForm.submit()}
        okText={review?.status === 'accepted' ? 'Accept & assign' : 'Reject'}
        okButtonProps={{ danger: review?.status === 'rejected' }}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={reviewForm} layout="vertical" onFinish={submitReview} requiredMark>
          {review?.status === 'accepted' && (
            <>
              <Form.Item name="operator_id" label="Operator" rules={[{ required: true, message: 'Select operator' }]}>
                <Select
                  showSearch
                  placeholder="Select operator"
                  optionFilterProp="label"
                  options={operators.map((op) => ({
                    value: op.id,
                    label: op.user_name || op.gmail || `User ${op.id}`,
                  }))}
                />
              </Form.Item>
              <Form.Item name="machine_id" label="Machine" rules={[{ required: true, message: 'Select machine' }]}>
                <Select
                  showSearch
                  placeholder="Select machine"
                  loading={machinesLoading}
                  optionFilterProp="label"
                  options={machines.map((machine) => ({
                    value: machine.id,
                    label: machineLabel(machine),
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Form.Item
            name="remark"
            label="Remarks"
            rules={review?.status === 'rejected' ? [{ required: true, message: 'Remarks are required to reject' }] : []}
          >
            <TextArea rows={3} placeholder={review?.status === 'rejected' ? 'Reason for rejection' : 'Optional remarks'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={completionReview?.status === 'approved' ? 'Approve log' : 'Reject log'}
        open={Boolean(completionReview)}
        onCancel={() => setCompletionReview(null)}
        onOk={() => completionForm.submit()}
        okText={completionReview?.status === 'approved' ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: completionReview?.status === 'rejected' }}
        confirmLoading={submitting}
        destroyOnClose
      >
        <Form form={completionForm} layout="vertical" onFinish={submitCompletionReview}>
          <Form.Item
            name="remark"
            label="Remarks"
            rules={completionReview?.status === 'rejected' ? [{ required: true, message: 'Remarks are required to reject' }] : []}
          >
            <TextArea
              rows={3}
              placeholder={completionReview?.status === 'rejected' ? 'Reason for rejection' : 'Optional remarks'}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Attachments"
        open={attachmentsOpen}
        onCancel={() => setAttachmentsOpen(false)}
        footer={null}
        width={560}
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
          <p>Preview is not available for this file type. Download to open the 2D / 3D file.</p>
        )}
      </Modal>
    </div>
  );
};

export default UrgentJobs;
