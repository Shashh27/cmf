import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table, Select, Typography, Button, Tag, Input, Space, message, DatePicker,
} from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import {
  PM_T, btnSharp, pmFetch, formatDateTime, machineLabel, itemTypeShort,
  disableFutureDates, normalizeDateRange,
} from './pmUtils';
import dayjs from 'dayjs';
import PmDownloadButton from './PmDownloadButton';
import { buildSubmissionsReportConfig } from './pmReportDownload';

const { Text } = Typography;
const { Option } = Select;

function groupSubmissions(submissions) {
  const groups = new Map();
  submissions.forEach((s) => {
    const dateKey = dayjs(s.submitted_at).format('YYYY-MM-DD');
    const key = `${s.machine_id}|${s.checklist_id}|${dateKey}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        machine_id: s.machine_id,
        machine_label: s.machine_label,
        checklist_id: s.checklist_id,
        checklist_name: s.checklist_name,
        dateKey,
        items: [],
      });
    }
    groups.get(key).items.push(s);
  });

  return Array.from(groups.values())
    .map((g) => {
      const times = g.items.map((i) => new Date(i.submitted_at).getTime());
      const operatorNames = [...new Set(
        g.items.map((i) => i.operator_name || (i.operator_id ? `User #${i.operator_id}` : '—')),
      )];
      return {
        ...g,
        checkpointCount: g.items.length,
        operators: operatorNames.join(', '),
        submitted_at: new Date(Math.max(...times)).toISOString(),
      };
    })
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

const PokaYokeCompletedLogs = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [submissions, setSubmissions] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 15 });
  const [expandedRowKeys, setExpandedRowKeys] = useState([]);

  useEffect(() => {
    fetchMachines?.();
    loadSubmissions();
    pmFetch('/checklists').then((data) => setChecklists(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const loadSubmissions = async (machineId = selectedMachine, month = selectedMonth, range = dateRange) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const normalized = normalizeDateRange(range);
      if (normalized?.[0] && normalized?.[1]) {
        params.set('start_date', normalized[0].format('YYYY-MM-DD'));
        params.set('end_date', normalized[1].format('YYYY-MM-DD'));
      } else if (month) {
        params.set('month', String(month.month() + 1));
        params.set('year', String(month.year()));
      }
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
    setExpandedRowKeys([]);
    await loadSubmissions();
  };

  const checklistNameFor = useCallback((row) => {
    if (row.checklist_name) return row.checklist_name;
    if (row.checklist_id) {
      const found = checklists.find((c) => c.id === row.checklist_id);
      if (found) return found.name;
    }
    return '—';
  }, [checklists]);

  const grouped = useMemo(() => groupSubmissions(submissions), [submissions]);

  const filtered = useMemo(() => {
    const q = searchText.toLowerCase().trim();
    if (!q) return grouped;
    return grouped.filter((g) => {
      const checklistName = checklistNameFor(g);
      const checkpointTexts = g.items.map((i) => i.checklist_item?.item_text || '').join(' ');
      return (
        checklistName.toLowerCase().includes(q) ||
        checkpointTexts.toLowerCase().includes(q) ||
        (g.machine_label || '').toLowerCase().includes(q) ||
        (g.operators || '').toLowerCase().includes(q) ||
        g.items.some((i) =>
          (i.response_value || '').toLowerCase().includes(q) ||
          (i.operator_comments || '').toLowerCase().includes(q),
        )
      );
    });
  }, [grouped, searchText, checklistNameFor]);

  const toggleRow = (key) => {
    setExpandedRowKeys((prev) => (
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    ));
  };

  const getReportConfig = () => {
    const meta = [];
    if (selectedMachine) {
      const m = machines.find((x) => x.id === selectedMachine);
      meta.push(`Machine filter: ${machineLabel(m) || selectedMachine}`);
    }
    if (dateRange?.[0] && dateRange?.[1]) {
      meta.push(`Date range: ${dateRange[0].format('DD MMM YYYY')} – ${dateRange[1].format('DD MMM YYYY')}`);
    } else if (selectedMonth) {
      meta.push(`Month filter: ${selectedMonth.format('MMMM YYYY')}`);
    }
    if (searchText.trim()) meta.push(`Search: ${searchText.trim()}`);
    return buildSubmissionsReportConfig(filtered, checklistNameFor, meta);
  };

  const detailColumns = [
    {
      title: 'Checkpoint',
      key: 'checkpoint',
      ellipsis: true,
      render: (_, r) => <Text style={{ fontSize: 12 }}>{r.checklist_item?.item_text || '—'}</Text>,
    },
    {
      title: 'Type',
      key: 'type',
      width: 80,
      render: (_, r) => <Text style={{ fontSize: 11 }}>{itemTypeShort(r.checklist_item?.item_type)}</Text>,
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response',
      width: 90,
      render: (v) => <Text style={{ fontSize: 12 }}>{v || '—'}</Text>,
    },
    {
      title: 'Operator',
      key: 'operator',
      width: 120,
      ellipsis: true,
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.operator_name || (r.operator_id ? `User #${r.operator_id}` : '—')}
        </Text>
      ),
    },
    {
      title: 'Submitted At',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
      width: 150,
      render: (d) => <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(d)}</Text>,
    },
    {
      title: 'Remarks',
      key: 'remarks',
      ellipsis: true,
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{r.operator_comments || '—'}</Text>
      ),
    },
  ];

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
      title: 'Machine',
      key: 'machine',
      width: 160,
      className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => (a.machine_label || '').localeCompare(b.machine_label || ''),
      render: (_, r) => (
        <Text strong style={{ fontSize: 12 }}>
          {r.machine_label || machineLabel(machines.find((m) => m.id === r.machine_id)) || '—'}
        </Text>
      ),
    },
    {
      title: 'Checklist',
      key: 'checklist',
      width: 160,
      className: 'table-header-styled',
      ellipsis: true,
      sorter: (a, b) => checklistNameFor(a).localeCompare(checklistNameFor(b)),
      render: (_, r) => <Text style={{ fontSize: 12 }}>{checklistNameFor(r)}</Text>,
    },
    {
      title: 'Checkpoints',
      key: 'checkpoints',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (_, r) => (
        <Tag color="blue" style={{ margin: 0, fontSize: 11, borderRadius: 0 }}>{r.checkpointCount}</Tag>
      ),
    },
    {
      title: 'Operator',
      key: 'operator',
      width: 130,
      className: 'table-header-styled',
      ellipsis: true,
      render: (_, r) => <Text style={{ fontSize: 12 }}>{r.operators || '—'}</Text>,
    },
    {
      title: 'Submitted At',
      key: 'submitted_at',
      width: 170,
      className: 'table-header-styled',
      sorter: (a, b) => new Date(a.submitted_at) - new Date(b.submitted_at),
      render: (_, r) => (
        <Text type="secondary" style={{ fontSize: 11 }}>{formatDateTime(r.submitted_at)}</Text>
      ),
    },
  ];

  return (
    <div style={{ padding: 0, background: PM_T.bg, width: '100%', overflowX: 'auto' }}>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Machine"
            style={{ width: 200, minWidth: 160 }}
            loading={machinesLoading}
            value={selectedMachine}
            onFocus={fetchMachines}
            onChange={(v) => { setSelectedMachine(v || null); loadSubmissions(v || null, selectedMonth); }}
          >
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>
          <DatePicker
            picker="month"
            allowClear
            placeholder="Filter by month"
            value={selectedMonth}
            disabled={!!(dateRange?.[0] && dateRange?.[1])}
            onChange={(v) => {
              setSelectedMonth(v);
              setDateRange(null);
              loadSubmissions(selectedMachine, v, null);
            }}
            style={{ width: 160, borderRadius: 0 }}
          />
          <DatePicker.RangePicker
            allowClear
            placeholder={['From date', 'To date']}
            value={dateRange}
            disabledDate={disableFutureDates}
            onChange={(v) => {
              const normalized = normalizeDateRange(v);
              setDateRange(normalized);
              if (normalized?.[0] && normalized?.[1]) setSelectedMonth(null);
              loadSubmissions(selectedMachine, normalized ? null : selectedMonth, normalized);
            }}
            style={{ width: 260, borderRadius: 0 }}
          />
          <Input.Search
            placeholder="Search machine, checklist, operator..."
            allowClear
            style={{ width: 260, minWidth: 180, borderRadius: 0 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </Space>
        <Space>
          <PmDownloadButton getReportConfig={getReportConfig} disabled={!filtered.length} />
          <Button icon={<ReloadOutlined />} loading={loading} style={btnSharp} onClick={handleRefresh}>
            Refresh
          </Button>
        </Space>
      </Space>

      <Table
        rowKey="key"
        size="small"
        bordered
        tableLayout="fixed"
        loading={loading}
        columns={columns}
        dataSource={filtered}
        scroll={{ x: 'max-content' }}
        onRow={(record) => ({
          onClick: () => toggleRow(record.key),
          style: { cursor: 'pointer' },
        })}
        expandable={{
          showExpandColumn: false,
          expandedRowKeys,
          onExpandedRowsChange: setExpandedRowKeys,
          expandedRowRender: (record) => (
            <Table
              rowKey="id"
              size="small"
              columns={detailColumns}
              dataSource={record.items.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))}
              pagination={false}
              bordered
              style={{ margin: 0 }}
            />
          ),
          rowExpandable: (record) => record.items.length > 0,
        }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} groups`,
          pageSizeOptions: ['10', '15', '20', '50'],
          onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
        }}
        style={{ background: PM_T.surface }}
      />
    </div>
  );
};

export default PokaYokeCompletedLogs;
