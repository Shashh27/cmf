import React, { useState, useEffect, useMemo } from 'react';
import {
  Table, Select, Typography, Button, Tag, Modal, message, Descriptions, Input, Space, Popconfirm,
} from 'antd';
import { ReloadOutlined, CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, formatDateTime, machineLabel, STATUS_COLORS, itemTypeShort,
  frequencySummary, getCurrentUserId,
} from './pmUtils';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

const PokaYokeSupervisorReview = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState('Approved');
  const [reviewComments, setReviewComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

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
  }, []);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) =>
      (s.checklist_item?.item_text || '').toLowerCase().includes(q) ||
      (s.response_value || '').toLowerCase().includes(q) ||
      (s.machine_label || '').toLowerCase().includes(q)
    );
  }, [submissions, searchText]);

  const openReview = (record, decision) => {
    setSelected(record);
    setReviewAction(decision);
    setReviewComments('');
    setReviewOpen(true);
  };

  const handleReview = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await pmFetch(`/supervisor/submissions/${selected.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          supervisor_id: getCurrentUserId(),
          decision: reviewAction,
          supervisor_comments: reviewComments || null,
        }),
      });
      message.success(reviewAction === 'Approved' ? 'Checkpoint approved' : 'Checkpoint rejected');
      setReviewOpen(false);
      setDetailOpen(false);
      setSelected(null);
      await loadPending();
    } catch (e) {
      message.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const columns = [
    { title: '#', width: 48, align: 'center', render: (_, __, i) => i + 1 },
    {
      title: 'Checkpoint',
      key: 'checkpoint',
      render: (_, r) => <Text strong>{r.checklist_item?.item_text || '—'}</Text>,
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 180,
      render: (_, r) => r.machine_label || machineLabel(machines.find((m) => m.id === r.machine_id)),
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      width: 100,
    },
    {
      title: 'Submitted',
      dataIndex: 'submitted_at',
      width: 160,
      render: (d) => formatDateTime(d),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, r) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => { setSelected(r); setDetailOpen(true); }} />
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            style={{ ...btnSharp, background: PM_T.success, borderColor: PM_T.success }}
            onClick={() => openReview(r, 'Approved')}
          >
            Approve
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            style={btnSharp}
            onClick={() => openReview(r, 'Rejected')}
          >
            Reject
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ background: PM_T.bg }}>
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
            placeholder="Search checkpoint / machine / response..."
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
        rowKey="id"
        size="small"
        bordered
        loading={loading}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 900 }}
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
        title="Submission details"
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        width={640}
        footer={selected?.status === 'Submitted' ? (
          <Space>
            <Button onClick={() => setDetailOpen(false)} style={btnSharp}>Close</Button>
            <Button danger icon={<CloseOutlined />} style={btnSharp} onClick={() => openReview(selected, 'Rejected')}>
              Reject
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              style={{ ...btnSharp, background: PM_T.success, borderColor: PM_T.success }}
              onClick={() => openReview(selected, 'Approved')}
            >
              Approve
            </Button>
          </Space>
        ) : (
          <Button onClick={() => setDetailOpen(false)} style={btnSharp}>Close</Button>
        )}
      >
        {selected && (
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Checkpoint">{selected.checklist_item?.item_text || '—'}</Descriptions.Item>
            <Descriptions.Item label="Type">{itemTypeShort(selected.checklist_item?.item_type)}</Descriptions.Item>
            <Descriptions.Item label="Expected">{selected.checklist_item?.expected_value || '—'}</Descriptions.Item>
            <Descriptions.Item label="Frequency">
              {selected.checklist_item ? frequencySummary(selected.checklist_item) : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Machine">{selected.machine_label || '—'}</Descriptions.Item>
            <Descriptions.Item label="Response"><Text strong>{selected.response_value}</Text></Descriptions.Item>
            <Descriptions.Item label="Operator comments">{selected.operator_comments || '—'}</Descriptions.Item>
            <Descriptions.Item label="Submitted">{formatDateTime(selected.submitted_at)}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={STATUS_COLORS[selected.status]} style={{ borderRadius: 0 }}>{selected.status}</Tag>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      <Modal
        title={reviewAction === 'Approved' ? 'Approve checkpoint' : 'Reject checkpoint'}
        open={reviewOpen}
        onCancel={() => setReviewOpen(false)}
        footer={(
          <Space>
            <Button onClick={() => setReviewOpen(false)} style={btnSharp}>Cancel</Button>
            <Popconfirm
              title={`Confirm ${reviewAction === 'Approved' ? 'approval' : 'rejection'}?`}
              onConfirm={handleReview}
            >
              <Button
                type="primary"
                loading={submitting}
                danger={reviewAction === 'Rejected'}
                style={reviewAction === 'Approved' ? { ...btnSharp, background: PM_T.success, borderColor: PM_T.success } : btnSharp}
              >
                {reviewAction === 'Approved' ? 'Approve' : 'Reject'}
              </Button>
            </Popconfirm>
          </Space>
        )}
      >
        {selected && (
          <>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              {selected.checklist_item?.item_text} — {selected.machine_label}
            </Text>
            <Text style={{ display: 'block', marginBottom: 8 }}>
              Operator response: <Text strong>{selected.response_value}</Text>
            </Text>
            <TextArea
              rows={3}
              placeholder="Supervisor comments (optional)"
              value={reviewComments}
              onChange={(e) => setReviewComments(e.target.value)}
            />
          </>
        )}
      </Modal>
    </div>
  );
};

export default PokaYokeSupervisorReview;
