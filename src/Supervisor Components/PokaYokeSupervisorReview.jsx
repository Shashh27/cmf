import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Select, Typography, Button, Modal, message, Input, Space, Tooltip, Card, Tag,
} from 'antd';
import {
  ReloadOutlined, CheckOutlined, CloseOutlined, EyeOutlined, SafetyCertificateOutlined,
  CalendarOutlined, ClockCircleOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, formatDateTime, machineLabel, getCurrentUserId,
} from './pmUtils';
import { API_BASE_URL } from '../Config/auth';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

function freqLabel(item) {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based') {
    return item.trigger_hours ? `Every ${item.trigger_hours} hrs` : 'Usage Based';
  }
  if (ft === 'condition based') {
    return item.inspection_interval ? `${item.inspection_interval} inspection` : 'Condition Based';
  }
  return '—';
}

function freqIcon(item) {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') return <CalendarOutlined style={{ fontSize: 11 }} />;
  if (ft === 'usage based') return <ThunderboltOutlined style={{ fontSize: 11 }} />;
  if (ft === 'condition based') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
}

function freqColor(item) {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') return { color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
  if (ft === 'usage based') return { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' };
  if (ft === 'condition based') return { color: '#059669', bg: '#d1fae5', border: '#6ee7b7' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
}

function renderFrequencyBadge(item) {
  if (!item) return '—';
  const fc = freqColor(item);
  const label = freqLabel(item);
  return (
    <Tooltip title={label}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, color: fc.color, background: fc.bg,
        border: `1px solid ${fc.border}`, borderRadius: 4, padding: '2px 6px',
        maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
      >
        {freqIcon(item)} {label}
      </span>
    </Tooltip>
  );
}

function groupPendingSubmissions(submissions) {
  const groups = new Map();
  (submissions || []).forEach((s) => {
    const key = `${s.checklist_id}-${s.machine_id}-${s.operator_id}-${s.submitted_at}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        checklist_id: s.checklist_id,
        checklist_name: s.checklist_name,
        machine_id: s.machine_id,
        machine_label: s.machine_label,
        operator_id: s.operator_id,
        operator_name: s.operator_name,
        submitted_at: s.submitted_at,
        items: [],
      });
    }
    groups.get(key).items.push(s);
  });
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      items: g.items.sort(
        (a, b) => (a.checklist_item?.sequence_number || 0) - (b.checklist_item?.sequence_number || 0),
      ),
    }))
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

const PokaYokeSupervisorReview = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [userMap, setUserMap] = useState({});
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState(null);
  const [selectedCheckpointIds, setSelectedCheckpointIds] = useState([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTargets, setReviewTargets] = useState([]);
  const [reviewAction, setReviewAction] = useState('Approved');
  const [reviewComments, setReviewComments] = useState('');

  const loadPending = async (machineId = selectedMachine) => {
    setLoading(true);
    try {
      const qs = machineId ? `?machine_id=${machineId}` : '';
      const data = await pmFetch(`/supervisor/submissions/pending${qs}`);
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
    fetch(`${API_BASE_URL}/access-users/`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const map = {};
        (Array.isArray(data) ? data : []).forEach((u) => {
          map[u.id] = u.user_name || u.name || u.username;
        });
        setUserMap(map);
      })
      .catch(() => {});
  }, []);

  const operatorName = useCallback((row) => {
    if (row.operator_name) return row.operator_name;
    if (row.operator_id && userMap[row.operator_id]) return userMap[row.operator_id];
    return row.operator_id ? `Operator #${row.operator_id}` : '—';
  }, [userMap]);

  const batches = useMemo(() => groupPendingSubmissions(submissions), [submissions]);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim();
    if (!q) return batches;
    return batches.filter((b) =>
      (b.checklist_name || '').toLowerCase().includes(q) ||
      (b.machine_label || '').toLowerCase().includes(q) ||
      operatorName(b).toLowerCase().includes(q)
    );
  }, [batches, searchText, operatorName]);

  const reviewSubmissions = async (items, decision, comments = null) => {
    const supervisorId = getCurrentUserId();
    await Promise.all(
      items.map((item) =>
        pmFetch(`/supervisor/submissions/${item.id}/review`, {
          method: 'POST',
          body: JSON.stringify({
            supervisor_id: supervisorId,
            decision,
            supervisor_comments: comments,
          }),
        }),
      ),
    );
  };

  const openReviewModal = (items, decision) => {
    if (!items.length) {
      message.warning('Select at least one checkpoint');
      return;
    }
    setReviewTargets(items);
    setReviewAction(decision);
    setReviewComments('');
    setReviewOpen(true);
  };

  const handleReviewConfirm = async () => {
    setBulkSubmitting(true);
    try {
      await reviewSubmissions(reviewTargets, reviewAction, reviewComments || null);
      message.success(
        reviewAction === 'Approved'
          ? `${reviewTargets.length} checkpoint(s) approved`
          : `${reviewTargets.length} checkpoint(s) rejected`,
      );
      setReviewOpen(false);
      setReviewTargets([]);
      setSelectedCheckpointIds([]);
      if (detailOpen && activeBatch) {
        const remaining = activeBatch.items.filter((i) => !reviewTargets.some((t) => t.id === i.id));
        if (remaining.length === 0) {
          setDetailOpen(false);
          setActiveBatch(null);
        } else {
          setActiveBatch({ ...activeBatch, items: remaining });
        }
      }
      await loadPending();
    } catch (e) {
      message.error(e.message);
    } finally {
      setBulkSubmitting(false);
    }
  };

  const handleView = (batch) => {
    setActiveBatch(batch);
    setSelectedCheckpointIds([]);
    setDetailOpen(true);
  };

  const activeItems = activeBatch?.items || [];

  const batchColumns = [
    {
      title: 'Sl No',
      key: 'sl',
      width: 60,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, i) => (pagination.current - 1) * pagination.pageSize + i + 1,
    },
    {
      title: 'CHECKLIST NAME',
      key: 'checklist',
      width: 160,
      className: 'table-header-styled',
      ellipsis: true,
      render: (_, r) => (
        <Tooltip title={r.checklist_name}>
          <Text strong style={{ fontSize: 12 }}>{r.checklist_name || '—'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'MACHINE NAME',
      key: 'machine',
      width: 200,
      className: 'table-header-styled',
      ellipsis: true,
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.machine_label || machineLabel(machines.find((m) => m.id === r.machine_id)) || '—'}
        </Text>
      ),
    },
    {
      title: 'OPERATOR NAME',
      key: 'operator',
      width: 150,
      className: 'table-header-styled',
      ellipsis: true,
      render: (_, r) => <Text style={{ fontSize: 12 }}>{operatorName(r)}</Text>,
    },
    {
      title: 'SUBMITTED TIME',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 165,
      className: 'table-header-styled',
      render: (d) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(d)}</Text>,
    },
    {
      title: 'ACTIONS',
      key: 'actions',
      width: 70,
      align: 'center',
      fixed: 'right',
      className: 'table-header-styled',
      render: (_, r) => (
        <Tooltip title="View checkpoints">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            style={{ color: PM_T.primary }}
            onClick={() => handleView(r)}
          />
        </Tooltip>
      ),
    },
  ];

  const renderResponseTag = (v) => {
    const lower = String(v || '').toLowerCase();
    if (['yes', 'true', '1'].includes(lower)) {
      return <Tag color="success" style={{ margin: 0, borderRadius: 4 }}>Yes</Tag>;
    }
    if (['no', 'false', '0'].includes(lower)) {
      return <Tag color="error" style={{ margin: 0, borderRadius: 4 }}>No</Tag>;
    }
    return <Tag style={{ margin: 0, borderRadius: 4 }}>{v || '—'}</Tag>;
  };

  const checkpointColumns = [
    {
      title: 'SL NO',
      key: 'sl',
      width: 55,
      align: 'center',
      render: (_, r, i) => r.checklist_item?.sequence_number ?? i + 1,
    },
    {
      title: 'Checkpoint Name',
      key: 'name',
      ellipsis: { showTitle: false },
      render: (_, r) => {
        const name = r.checklist_item?.item_text || '—';
        return (
          <Tooltip title={name} placement="topLeft">
            <Text strong ellipsis style={{ display: 'block', maxWidth: '100%' }}>
              {name}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: 'Freq',
      key: 'freq',
      width: 128,
      render: (_, r) => renderFrequencyBadge(r.checklist_item),
    },
    {
      title: 'Expected',
      key: 'expected',
      width: 80,
      align: 'center',
      render: (_, r) => <Text>{r.checklist_item?.expected_value || '—'}</Text>,
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response',
      width: 90,
      align: 'center',
      render: (v) => renderResponseTag(v),
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_, r) => (
        <Space size={2}>
          <Tooltip title="Approve">
            <Button
              type="text"
              size="small"
              icon={<CheckOutlined />}
              style={{ color: PM_T.success }}
              onClick={() => openReviewModal([r], 'Approved')}
            />
          </Tooltip>
          <Tooltip title="Reject">
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              style={{ color: '#DC2626' }}
              onClick={() => openReviewModal([r], 'Rejected')}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ background: PM_T.bg }}>
      <style>{`
        .pm-checklist-detail-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .pm-checklist-detail-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        .pm-checklist-detail-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .pm-checklist-detail-table .ant-table-content {
          overflow-x: hidden !important;
        }
      `}</style>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Filter by machine"
            style={{ width: 240 }}
            loading={machinesLoading}
            value={selectedMachine}
            onFocus={fetchMachines}
            onChange={(v) => { setSelectedMachine(v || null); loadPending(v || null); }}
          >
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>
          <Input.Search
            placeholder="Search checklist, machine, operator..."
            allowClear
            style={{ width: 280, borderRadius: 0 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
        <Button icon={<ReloadOutlined />} loading={loading} style={btnSharp} onClick={() => loadPending()}>
          Refresh
        </Button>
      </Space>

      <Table
        rowKey="key"
        size="small"
        bordered
        loading={loading}
        columns={batchColumns}
        dataSource={filtered}
        scroll={{ x: 800 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showTotal: (t, r) => `${r[0]}-${r[1]} of ${t}`,
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        style={{ background: PM_T.surface }}
      />

      <Modal
        title={(
          <Space align="center">
            <SafetyCertificateOutlined style={{ color: '#1890ff', fontSize: 18 }} />
            <span>Checklist Details</span>
          </Space>
        )}
        open={detailOpen}
        zIndex={1000}
        onCancel={() => { setDetailOpen(false); setActiveBatch(null); setSelectedCheckpointIds([]); }}
        width={760}
        footer={null}
        destroyOnClose
      >
        {activeBatch && (
          <Card className="shadow-sm" styles={{ body: { padding: '12px 16px 16px' } }}>
            {selectedCheckpointIds.length > 0 && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
                gap: 8, marginBottom: 10,
              }}
              >
                <Button
                  size="small"
                  style={{ ...btnSharp, background: PM_T.success, borderColor: PM_T.success, color: '#fff' }}
                  onClick={() => {
                    const items = activeItems.filter((i) => selectedCheckpointIds.includes(i.id));
                    openReviewModal(items, 'Approved');
                  }}
                >
                  Approve All
                </Button>
                <Button
                  size="small"
                  danger
                  style={btnSharp}
                  onClick={() => {
                    const items = activeItems.filter((i) => selectedCheckpointIds.includes(i.id));
                    openReviewModal(items, 'Rejected');
                  }}
                >
                  Reject All
                </Button>
              </div>
            )}
            <Table
              className="pm-checklist-detail-table"
              rowKey="id"
              size="small"
              bordered={false}
              tableLayout="fixed"
              pagination={false}
              columns={checkpointColumns}
              dataSource={activeItems}
              rowSelection={{
                selectedRowKeys: selectedCheckpointIds,
                onChange: setSelectedCheckpointIds,
              }}
            />
          </Card>
        )}
      </Modal>

      <Modal
        title={reviewAction === 'Approved' ? 'Approve checkpoint(s)' : 'Reject checkpoint(s)'}
        open={reviewOpen}
        zIndex={2000}
        onCancel={() => setReviewOpen(false)}
        onOk={handleReviewConfirm}
        okText={reviewAction === 'Approved' ? 'Approve' : 'Reject'}
        okButtonProps={{
          loading: bulkSubmitting,
          danger: reviewAction === 'Rejected',
          style: reviewAction === 'Approved'
            ? { ...btnSharp, background: PM_T.success, borderColor: PM_T.success }
            : btnSharp,
        }}
        cancelButtonProps={{ style: btnSharp }}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {reviewTargets.length} checkpoint(s) will be {reviewAction === 'Approved' ? 'approved' : 'rejected'}.
        </Text>
        <TextArea
          rows={3}
          placeholder="Supervisor comments (optional)"
          value={reviewComments}
          onChange={(e) => setReviewComments(e.target.value)}
        />
      </Modal>
    </div>
  );
};

export default PokaYokeSupervisorReview;
