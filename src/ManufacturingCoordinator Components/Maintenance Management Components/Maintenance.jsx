import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Table, Spin, message, Select, Button, Modal, Input, Badge, Typography, Space, Tooltip } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../Config/auth';

const { TextArea } = Input;
const { Text } = Typography;

const formatIST = (iso) => {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
        .formatToParts(d)
        .map((p) => [p.type, p.value])
    );
    return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod?.toUpperCase() ?? ''}`.trim();
  } catch {
    return String(iso);
  }
};

const titleCase = (s) => {
  if (!s) return '-';
  const str = Array.isArray(s) ? s.join(', ') : String(s);
  return str
    .toLowerCase()
    .split(/(\s+|-|,)/)
    .map((p) => (/[a-zA-Z]/.test(p) ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join('');
};

const highlightText = (text, query) => {
  if (!query || !text) return text ?? '-';
  const str = String(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return str;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#bae0ff', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
};

const Maintenance = () => {
  const [loading, setLoading] = useState(false);
  const [oeeIssues, setOeeIssues] = useState([]);
  const [breakdowns, setBreakdowns] = useState([]);
  const [components, setComponents] = useState([]);
  const [helpSupport, setHelpSupport] = useState([]);
  const [activeTab, setActiveTab] = useState('oee');
  const [oeePagination, setOeePagination] = useState({ current: 1, pageSize: 10 });
  const [breakdownPagination, setBreakdownPagination] = useState({ current: 1, pageSize: 10 });
  const [componentPagination, setComponentPagination] = useState({ current: 1, pageSize: 10 });
  const [helpSupportPagination, setHelpSupportPagination] = useState({ current: 1, pageSize: 10 });
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedHelpRequest, setSelectedHelpRequest] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [searchText, setSearchText] = useState('');

  const loadMaintenanceData = async () => {
    setLoading(true);
    try {
      const [oeeRes, brRes, compRes, helpRes] = await Promise.all([
        fetch(`${API_BASE_URL}/maintenance/oee-issues`, { headers: { accept: 'application/json' } }),
        fetch(`${API_BASE_URL}/maintenance/machine-breakdown`, { headers: { accept: 'application/json' } }),
        fetch(`${API_BASE_URL}/maintenance/component-issues`, { headers: { accept: 'application/json' } }),
        fetch(`${API_BASE_URL}/maintenance/help-support`, { headers: { accept: 'application/json' } }),
      ]);
      const [oeeData, brData, compData, helpData] = await Promise.all([
        oeeRes.ok ? oeeRes.json() : [],
        brRes.ok ? brRes.json() : [],
        compRes.ok ? compRes.json() : [],
        helpRes.ok ? helpRes.json() : [],
      ]);
      setOeeIssues(Array.isArray(oeeData) ? oeeData.sort((a, b) => new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)) : []);
      setBreakdowns(Array.isArray(brData) ? brData.sort((a, b) => new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)) : []);
      setComponents(Array.isArray(compData) ? compData.sort((a, b) => new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)) : []);
      setHelpSupport(Array.isArray(helpData) ? helpData.sort((a, b) => new Date(b.reported_at || b.created_at) - new Date(a.reported_at || a.created_at)) : []);
    } catch {
      message.error('Failed to load maintenance data');
      setOeeIssues([]);
      setBreakdowns([]);
      setComponents([]);
      setHelpSupport([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaintenanceData();
  }, []);

  const handleReplyClick = (record) => {
    setSelectedHelpRequest(record);
    setReplyText(record.mc_reply || '');
    setReplyModalVisible(true);
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) {
      message.warning('Please enter a reply');
      return;
    }

    setSubmittingReply(true);
    try {
      const storedUser = localStorage.getItem('user');
      const user = storedUser ? JSON.parse(storedUser) : null;
      const repliedBy = user?.id || 1; // Fallback to 1 if no user found

      const response = await fetch(`${API_BASE_URL}/maintenance/help-support/${selectedHelpRequest.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          mc_reply: replyText,
          replied_by: repliedBy,
        }),
      });

      if (response.ok) {
        message.success('Reply sent successfully');
        setReplyModalVisible(false);
        setReplyText('');
        loadMaintenanceData();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to send reply');
      }
    } catch (error) {
      console.error('Error sending reply:', error);
      message.error('An error occurred while sending the reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const machineOptions = useMemo(() => {
    const names = new Set();
    [...oeeIssues, ...breakdowns, ...components, ...helpSupport].forEach((item) => {
      if (item.machine_name) names.add(item.machine_name);
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [oeeIssues, breakdowns, components, helpSupport]);

  const filteredOee = useMemo(() => {
    let result = oeeIssues;
    if (selectedMachines.length > 0) {
      result = result.filter(item => selectedMachines.includes(item.machine_name));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(record => {
        const searchableFields = [
          record.order_name,
          record.production_order_id,
          record.product_name,
          record.part_name,
          record.part_id,
          record.part_number,
          record.operation_name,
          record.operation_number,
          record.machine_name,
          record.machine_id,
          record.operator_name,
          record.reported_by,
          record.description,
          record.issue_category,
          record.issue_reason,
          record.machine_status,
          record.component_status,
          record.mc_reply,
          record.replied_by_name,
        ];
        return searchableFields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }
    return result;
  }, [oeeIssues, selectedMachines, searchText]);

  const filteredBreakdowns = useMemo(() => {
    let result = breakdowns;
    if (selectedMachines.length > 0) {
      result = result.filter(item => selectedMachines.includes(item.machine_name));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(record => {
        const searchableFields = [
          record.order_name,
          record.production_order_id,
          record.product_name,
          record.part_name,
          record.part_id,
          record.part_number,
          record.operation_name,
          record.operation_number,
          record.machine_name,
          record.machine_id,
          record.operator_name,
          record.reported_by,
          record.description,
          record.issue_category,
          record.issue_reason,
          record.machine_status,
          record.component_status,
          record.mc_reply,
          record.replied_by_name,
        ];
        return searchableFields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }
    return result;
  }, [breakdowns, selectedMachines, searchText]);

  const filteredComponents = useMemo(() => {
    let result = components;
    if (selectedMachines.length > 0) {
      result = result.filter(item => selectedMachines.includes(item.machine_name));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(record => {
        const searchableFields = [
          record.order_name,
          record.production_order_id,
          record.product_name,
          record.part_name,
          record.part_id,
          record.part_number,
          record.operation_name,
          record.operation_number,
          record.machine_name,
          record.machine_id,
          record.operator_name,
          record.reported_by,
          record.description,
          record.issue_category,
          record.issue_reason,
          record.machine_status,
          record.component_status,
          record.mc_reply,
          record.replied_by_name,
        ];
        return searchableFields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }
    return result;
  }, [components, selectedMachines, searchText]);

  const filteredHelpSupport = useMemo(() => {
    let result = helpSupport;
    if (selectedMachines.length > 0) {
      result = result.filter(item => selectedMachines.includes(item.machine_name));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(record => {
        const searchableFields = [
          record.order_name,
          record.production_order_id,
          record.product_name,
          record.part_name,
          record.part_id,
          record.part_number,
          record.operation_name,
          record.operation_number,
          record.machine_name,
          record.machine_id,
          record.operator_name,
          record.reported_by,
          record.description,
          record.issue_category,
          record.issue_reason,
          record.machine_status,
          record.component_status,
          record.mc_reply,
          record.replied_by_name,
        ];
        return searchableFields.some(f => f && String(f).toLowerCase().includes(q));
      });
    }
    return result;
  }, [helpSupport, selectedMachines, searchText]);


  const getNewHelpRequestsCount = () => {
    return helpSupport.filter(item => !item.mc_reply).length;
  };

  const oeeColumns = [
    { title: 'Sl No', key: 'sl', width: 70, render: (_, __, idx) => (oeePagination.current - 1) * oeePagination.pageSize + idx + 1 },
    { title: 'Category', key: 'issue_category', width: 140, 
      filters: [
        { text: 'Availability', value: 'availability' },
        { text: 'Performance', value: 'performance' },
        { text: 'Quality', value: 'quality' },
      ],
      onFilter: (value, record) => (record.issue_category ?? '').toLowerCase() === value,
      render: (_, r) => titleCase(r.issue_category) },
    {
      title: 'Description',
      key: 'desc',
      width: 280,
      render: (_, r) => (
        <Tooltip title={titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 200,
      sorter: (a, b) => (a.machine_name ?? a.machine_id ?? '').localeCompare(b.machine_name ?? b.machine_id ?? ''),
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Start Time',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 190,
      sorter: (a, b) => new Date(a.start_time ?? 0) - new Date(b.start_time ?? 0),
      render: (v) => formatIST(v),
    },
    {
      title: 'End Time',
      dataIndex: 'end_time',
      key: 'end_time',
      width: 190,
      sorter: (a, b) => new Date(a.end_time ?? 0) - new Date(b.end_time ?? 0),
      render: (v) => formatIST(v),
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 160,
      sorter: (a, b) => (a.operator_name ?? a.reported_by ?? '').localeCompare(b.operator_name ?? b.reported_by ?? ''),
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 190,
      sorter: (a, b) => new Date(a.reported_at ?? 0) - new Date(b.reported_at ?? 0),
      render: (v) => formatIST(v),
    },
  ];

  const breakdownColumns = [
    { title: 'Sl No', key: 'sl', width: 70, render: (_, __, idx) => (breakdownPagination.current - 1) * breakdownPagination.pageSize + idx + 1 },
    { title: 'Category', key: 'issue_category', width: 140, 
      filters: [
        { text: 'Availability', value: 'availability' },
        { text: 'Performance', value: 'performance' },
        { text: 'Quality', value: 'quality' },
      ],
      onFilter: (value, record) => (record.issue_category ?? '').toLowerCase() === value,
      render: (_, r) => titleCase(r.issue_category) },
    {
      title: 'Description',
      key: 'desc',
      width: 260,
      render: (_, r) => (
        <Tooltip title={titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}
          </span>
        </Tooltip>
      ),
    },
    { title: 'Machine Status', dataIndex: 'machine_status', key: 'machine_status', width: 160,
      filters: [
        { text: 'ON', value: 'ON' },
        { text: 'OFF', value: 'OFF' },
      ],
      onFilter: (value, record) => record.machine_status === value,
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 200,
      sorter: (a, b) => (a.machine_name ?? a.machine_id ?? '').localeCompare(b.machine_name ?? b.machine_id ?? ''),
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 160,
      sorter: (a, b) => (a.operator_name ?? a.reported_by ?? '').localeCompare(b.operator_name ?? b.reported_by ?? ''),
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 190,
      sorter: (a, b) => new Date(a.reported_at ?? 0) - new Date(b.reported_at ?? 0),
      render: (v) => formatIST(v),
    },
    { title: 'Additional Description', dataIndex: 'additional_reason', key: 'additional_reason', width: 280, 
      render: (v) => (
        <Tooltip title={v || '-'}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v || '-'}
          </span>
        </Tooltip>
      )
    },
  ];

  const componentColumns = [
    { title: 'Sl No', key: 'sl', width: 60, render: (_, __, idx) => (componentPagination.current - 1) * componentPagination.pageSize + idx + 1 },
    { title: 'Component Status', dataIndex: 'component_status', key: 'component_status', width: 140, 
      filters: [
        { text: 'Available', value: 'available' },
        { text: 'Not Available', value: 'not available' },
      ],
      onFilter: (value, record) => (record.component_status ?? '').toLowerCase() === value,
      render: (v) => titleCase(v),
    },
    {
      title: 'Order Details',
      key: 'order_details',
      width: 160,
      sorter: (a, b) => (a.order_name ?? a.production_order_id ?? '').localeCompare(b.order_name ?? b.production_order_id ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.order_name ?? r.production_order_id ?? '-'}</Text>
          {r.product_name && <Text type="secondary" style={{ fontSize: 12 }}>{r.product_name}</Text>}
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      width: 160,
      sorter: (a, b) => (a.part_name ?? a.part_id ?? '').localeCompare(b.part_name ?? b.part_id ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.part_name ?? r.part_id ?? '-'}</Text>
          {r.part_number && <Text type="secondary" style={{ fontSize: 12 }}>{r.part_number}</Text>}
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      width: 160,
      sorter: (a, b) => (a.operation_name ?? '').localeCompare(b.operation_name ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.operation_name ?? '-'}</Text>
          {r.operation_number && <Text type="secondary" style={{ fontSize: 12 }}>#{r.operation_number}</Text>}
        </Space>
      ),
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 140,
      sorter: (a, b) => (a.machine_name ?? a.machine_id ?? '').localeCompare(b.machine_name ?? b.machine_id ?? ''),
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 120,
      sorter: (a, b) => (a.operator_name ?? a.reported_by ?? '').localeCompare(b.operator_name ?? b.reported_by ?? ''),
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 140,
      sorter: (a, b) => new Date(a.reported_at ?? 0) - new Date(b.reported_at ?? 0),
      render: (v) => formatIST(v),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (v) => (
        <Tooltip title={titleCase(v)}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleCase(v)}
          </span>
        </Tooltip>
      ),
    },
  ];

  const helpSupportColumns = [
    { title: 'Sl No', key: 'sl', width: 60, render: (_, __, idx) => (helpSupportPagination.current - 1) * helpSupportPagination.pageSize + idx + 1 },
    {
      title: 'Order Details',
      key: 'order_details',
      width: 160,
      sorter: (a, b) => (a.order_name ?? a.production_order_id ?? '').localeCompare(b.order_name ?? b.production_order_id ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.order_name ?? r.production_order_id ?? '-'}</Text>
          {r.product_name && <Text type="secondary" style={{ fontSize: 12 }}>{r.product_name}</Text>}
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      width: 160,
      sorter: (a, b) => (a.part_name ?? a.part_id ?? '').localeCompare(b.part_name ?? b.part_id ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.part_name ?? r.part_id ?? '-'}</Text>
          {r.part_number && <Text type="secondary" style={{ fontSize: 12 }}>{r.part_number}</Text>}
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      width: 160,
      sorter: (a, b) => (a.operation_name ?? '').localeCompare(b.operation_name ?? ''),
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.operation_name ?? '-'}</Text>
          {r.operation_number && <Text type="secondary" style={{ fontSize: 12 }}>#{r.operation_number}</Text>}
        </Space>
      ),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 170,
      render: (v) => (
        <Tooltip title={titleCase(v)}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleCase(v)}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 140,
      sorter: (a, b) => (a.machine_name ?? a.machine_id ?? '').localeCompare(b.machine_name ?? b.machine_id ?? ''),
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 120,
      sorter: (a, b) => (a.operator_name ?? a.reported_by ?? '').localeCompare(b.operator_name ?? b.reported_by ?? ''),
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 140,
      sorter: (a, b) => new Date(a.reported_at ?? 0) - new Date(b.reported_at ?? 0),
      render: (v) => formatIST(v),
    },
    {
      title: 'Reply',
      dataIndex: 'mc_reply',
      key: 'mc_reply',
      width: 180,
      render: (v) => (
        <Tooltip title={v || '-'}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {v || '-'}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Replied At',
      dataIndex: 'replied_at',
      key: 'replied_at',
      width: 140,
      sorter: (a, b) => new Date(a.replied_at ?? 0) - new Date(b.replied_at ?? 0),
      render: (v) => v ? formatIST(v) : '-',
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button 
          type="primary" 
          size="small" 
          onClick={() => handleReplyClick(record)}
        >
          {record.mc_reply ? 'Edit Reply' : 'Reply'}
        </Button>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'oee',
      label: 'OEE Issues',
      children: (
        <div className="maintenance-tab-content">
          {loading ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div className="maintenance-table-scroll">
              <Table
                columns={oeeColumns}
                dataSource={filteredOee}
                rowKey="id"
                scroll={{ x: 1420 }}
                tableLayout="fixed"
                className="modern-table"
                pagination={{ ...oeePagination, position: ['bottomRight'] }}
                onChange={(pagination) => setOeePagination({ current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 10 })}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'breakdown',
      label: 'Machine Breakdown',
      children: (
        <div className="maintenance-tab-content">
          {loading ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div className="maintenance-table-scroll">
              <Table
                columns={breakdownColumns}
                dataSource={filteredBreakdowns}
                rowKey="id"
                scroll={{ x: 1460 }}
                tableLayout="fixed"
                className="modern-table"
                pagination={{ ...breakdownPagination, position: ['bottomRight'] }}
                onChange={(pagination) => setBreakdownPagination({ current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 10 })}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'component',
      label: 'Component Issues',
      children: (
        <div className="maintenance-tab-content">
          {loading ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div className="maintenance-table-scroll">
              <Table
                columns={componentColumns}
                dataSource={filteredComponents}
                rowKey="id"
                scroll={{ x: 1380 }}
                tableLayout="fixed"
                className="modern-table"
                pagination={{ ...componentPagination, position: ['bottomRight'] }}
                onChange={(pagination) => setComponentPagination({ current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 10 })}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'help-support',
      label: (
        <span>
          <Badge 
            count={getNewHelpRequestsCount()} 
            offset={[8, -2]} 
            style={{ backgroundColor: '#faad14' }}
          >
            <span>Help & Support</span>
          </Badge>
        </span>
      ),
      children: (
        <div className="maintenance-tab-content">
          {loading ? (
            <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
              <Spin size="large" />
            </div>
          ) : (
            <div className="maintenance-table-scroll">
              <Table
                columns={helpSupportColumns}
                dataSource={filteredHelpSupport}
                rowKey="id"
                scroll={{ x: 1380 }}
                tableLayout="fixed"
                className="modern-table"
                pagination={{ ...helpSupportPagination, position: ['bottomRight'] }}
                onChange={(pagination) => setHelpSupportPagination({ current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 10 })}
              />
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="maintenance-page">
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td { background: #f0f8ff !important; }
        .modern-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f0f0f0; }
      `}</style>
      <Card
        className="maintenance-card"
        style={{ borderRadius: 16 }}
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'nowrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>Filter by Machine:</span>
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 250, maxWidth: 400, flex: 1 }}
              placeholder="Select machines"
              options={machineOptions}
              value={selectedMachines}
              onChange={setSelectedMachines}
            />
            <Input
              placeholder="Search..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ minWidth: 180, maxWidth: 250, flex: 1 }}
            />
          </div>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadMaintenanceData}
            loading={loading}
            style={{ whiteSpace: 'nowrap' }}
          >
            Refresh
          </Button>
        </div>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
        />
      </Card>

      <Modal
        title={selectedHelpRequest?.mc_reply ? "Edit Reply" : "Reply to Help Request"}
        open={replyModalVisible}
        onOk={handleSendReply}
        onCancel={() => setReplyModalVisible(false)}
        confirmLoading={submittingReply}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <strong>Operator Description:</strong>
          <div style={{ marginTop: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
            {selectedHelpRequest?.description}
          </div>
        </div>
        <div>
          <strong>Your Reply:</strong>
          <TextArea
            rows={4}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Type your reply here..."
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Maintenance;
