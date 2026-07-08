import React, { useState, useEffect } from 'react';
import {
  Table, Select, Typography, Button, Tag, Input, Space, message,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, formatDateTime, machineLabel, STATUS_COLORS,
} from './pmUtils';

const { Text } = Typography;
const { Option } = Select;

const PokaYokeCompletedLogs = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [submissions, setSubmissions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });

  useEffect(() => {
    loadSubmissions();
    pmFetch('/checklists').then((data) => setChecklists(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const loadSubmissions = async (machineId = selectedMachine, status = statusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status_filter', status);
      const qs = params.toString();
      const suffix = qs ? `?${qs}` : '';
      const path = machineId
        ? `/machines/${machineId}/submissions${suffix}`
        : `/submissions${suffix}`;
      const data = await pmFetch(path);
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setPagination((p) => ({ ...p, current: 1 }));
    await loadSubmissions();
  };

  const checklistNameFor = (row) => {
    if (row.checklist_name) return row.checklist_name;
    if (row.checklist_id) {
      const found = checklists.find((c) => c.id === row.checklist_id);
      if (found) return found.name;
    }
    return '—';
  };

  const filtered = submissions.filter((s) => {
    const q = searchText.toLowerCase();
    if (!q) return true;
    return (
      checklistNameFor(s).toLowerCase().includes(q) ||
      (s.checklist_item?.item_text || '').toLowerCase().includes(q) ||
      (s.machine_label || '').toLowerCase().includes(q) ||
      (s.response_value || '').toLowerCase().includes(q) ||
      (s.status || '').toLowerCase().includes(q)
    );
  });

  const columns = [
    {
      title: 'SL NO',
      key: 'sl',
      width: 55,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, i) => (pagination.current - 1) * pagination.pageSize + i + 1,
    },
    {
      title: 'CHECKLIST',
      key: 'checklist',
      width: 180,
      className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => checklistNameFor(a).localeCompare(checklistNameFor(b)),
      render: (_, r) => <Text strong style={{ fontSize: 12 }}>{checklistNameFor(r)}</Text>,
    },
    {
      title: 'Checkpoint',
      key: 'checkpoint',
      width: 200,
      className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => (a.checklist_item?.item_text || '').localeCompare(b.checklist_item?.item_text || ''),
      render: (_, r) => <Text style={{ fontSize: 12 }}>{r.checklist_item?.item_text || '—'}</Text>,
    },
    {
      title: 'Machine',
      key: 'machine',
      width: 180,
      className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => (a.machine_label || '').localeCompare(b.machine_label || ''),
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.machine_label || machineLabel(machines.find((m) => m.id === r.machine_id)) || '—'}
        </Text>
      ),
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response',
      width: 90,
      align: 'center',
      className: 'table-header-styled',
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (s) => <Tag color={STATUS_COLORS[s]} style={{ fontSize: 11, borderRadius: 0, margin: 0 }}>{s}</Tag>,
    },
    {
      title: 'Submitted At',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 155,
      className: 'table-header-styled',
      sorter: (a, b) => new Date(a.submitted_at) - new Date(b.submitted_at),
      render: (d) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(d)}</Text>,
    },
    {
      title: 'Reviewed At',
      dataIndex: 'reviewed_at',
      key: 'reviewed_at',
      width: 155,
      className: 'table-header-styled',
      sorter: (a, b) => new Date(a.reviewed_at || 0) - new Date(b.reviewed_at || 0),
      render: (d) => <Text type="secondary" style={{ fontSize: 11 }}>{d ? formatDateTime(d) : '—'}</Text>,
    },
    {
      title: 'Remarks',
      key: 'remarks',
      className: 'table-header-styled',
      ellipsis: true,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {r.supervisor_comments || r.operator_comments || '—'}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ padding: 0, background: PM_T.bg }}>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Machine"
            style={{ width: 220 }}
            loading={machinesLoading}
            value={selectedMachine}
            onFocus={fetchMachines}
            onChange={(v) => { setSelectedMachine(v || null); loadSubmissions(v || null, statusFilter); }}
          >
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>
          <Select
            allowClear
            placeholder="Status"
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v || null); loadSubmissions(selectedMachine, v || null); }}
            options={[
              { value: 'Submitted', label: 'Submitted' },
              { value: 'Approved', label: 'Approved' },
              { value: 'Rejected', label: 'Rejected' },
            ]}
          />
          <Input.Search
            placeholder="Search checklist, checkpoint, machine..."
            allowClear
            style={{ width: 280, borderRadius: 0 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
        <Button icon={<ReloadOutlined />} loading={loading} style={btnSharp} onClick={handleRefresh}>
          Refresh
        </Button>
      </Space>

      <Table
        rowKey="id"
        size="small"
        bordered
        tableLayout="fixed"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '15', '20', '50'],
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        style={{ background: PM_T.surface }}
      />
    </div>
  );
};

export default PokaYokeCompletedLogs;
