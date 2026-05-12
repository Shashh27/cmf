import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Table, Spin, message, Select, Button, Modal, Input, Badge } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../Config/auth';

const { TextArea } = Input;

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
    if (selectedMachines.length === 0) return oeeIssues;
    return oeeIssues.filter(item => selectedMachines.includes(item.machine_name));
  }, [oeeIssues, selectedMachines]);

  const filteredBreakdowns = useMemo(() => {
    if (selectedMachines.length === 0) return breakdowns;
    return breakdowns.filter(item => selectedMachines.includes(item.machine_name));
  }, [breakdowns, selectedMachines]);

  const filteredComponents = useMemo(() => {
    if (selectedMachines.length === 0) return components;
    return components.filter(item => selectedMachines.includes(item.machine_name));
  }, [components, selectedMachines]);

  const filteredHelpSupport = useMemo(() => {
    if (selectedMachines.length === 0) return helpSupport;
    return helpSupport.filter(item => selectedMachines.includes(item.machine_name));
  }, [helpSupport, selectedMachines]);

  const getNewHelpRequestsCount = () => {
    return helpSupport.filter(item => !item.mc_reply).length;
  };

  const oeeColumns = [
    { title: 'Sl No', key: 'sl', width: 70, render: (_, __, idx) => (oeePagination.current - 1) * oeePagination.pageSize + idx + 1 },
    { title: 'Category', key: 'issue_category', width: 140, render: (_, r) => titleCase(r.issue_category) },
    {
      title: 'Description',
      key: 'desc',
      width: 280,
      render: (_, r) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}</span>,
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 200,
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Start Time',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 190,
      render: (v) => formatIST(v),
    },
    {
      title: 'End Time',
      dataIndex: 'end_time',
      key: 'end_time',
      width: 190,
      render: (v) => formatIST(v),
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 160,
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 190,
      render: (v) => formatIST(v),
    },
  ];

  const breakdownColumns = [
    { title: 'Sl No', key: 'sl', width: 70, render: (_, __, idx) => (breakdownPagination.current - 1) * breakdownPagination.pageSize + idx + 1 },
    { title: 'Category', key: 'issue_category', width: 140, render: (_, r) => titleCase(r.issue_category) },
    {
      title: 'Description',
      key: 'desc',
      width: 260,
      render: (_, r) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{titleCase(Array.isArray(r.issue_reason) ? r.issue_reason : r.issue_reason)}</span>,
    },
    { title: 'Machine Status', dataIndex: 'machine_status', key: 'machine_status', width: 160 },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 200,
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 160,
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 190,
      render: (v) => formatIST(v),
    },
    { title: 'Additional Description', dataIndex: 'additional_reason', key: 'additional_reason', width: 280, render: (v) => v || '-' },
  ];

  const componentColumns = [
    { title: 'Sl No', key: 'sl', width: 60, render: (_, __, idx) => (componentPagination.current - 1) * componentPagination.pageSize + idx + 1 },
    { title: 'Component Status', dataIndex: 'component_status', key: 'component_status', width: 140 },
    {
      title: 'Production Order',
      key: 'order',
      width: 160,
      render: (_, r) => r.order_name ?? r.production_order_id,
    },
    {
      title: 'Part Name',
      key: 'part',
      width: 160,
      render: (_, r) => r.part_name ?? r.part_id,
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 140,
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 120,
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 140,
      render: (v) => formatIST(v),
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (v) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{titleCase(v)}</span>,
    },
  ];

  const helpSupportColumns = [
    { title: 'Sl No', key: 'sl', width: 60, render: (_, __, idx) => (helpSupportPagination.current - 1) * helpSupportPagination.pageSize + idx + 1 },
    {
      title: 'Production Order',
      key: 'order',
      width: 160,
      render: (_, r) => r.order_name ?? r.production_order_id,
    },
    {
      title: 'Part Name',
      key: 'part',
      width: 160,
      render: (_, r) => r.part_name ?? r.part_id,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      render: (v) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{titleCase(v)}</span>,
    },
    {
      title: 'Machine Name',
      key: 'machine_name',
      width: 140,
      render: (_, r) => r.machine_name ?? r.machine_id,
    },
    {
      title: 'Reported By',
      key: 'reported_by',
      width: 120,
      render: (_, r) => r.operator_name ?? r.reported_by,
    },
    {
      title: 'Reported At',
      dataIndex: 'reported_at',
      key: 'reported_at',
      width: 140,
      render: (v) => formatIST(v),
    },
    {
      title: 'Reply',
      dataIndex: 'mc_reply',
      key: 'mc_reply',
      width: 180,
      render: (v) => v || '-',
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
                scroll={{ x: 1200 }}
                tableLayout="fixed"
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
                scroll={{ x: 1200 }}
                tableLayout="fixed"
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
      <Card
        className="maintenance-card"
        style={{ borderRadius: 16 }}
        bodyStyle={{ padding: 0, overflow: 'hidden' }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontWeight: 500 }}>Filter by Machine:</span>
            <Select
              mode="multiple"
              allowClear
              style={{ minWidth: 300, maxWidth: 600 }}
              placeholder="Select one or more machines"
              options={machineOptions}
              value={selectedMachines}
              onChange={setSelectedMachines}
            />
          </div>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={loadMaintenanceData}
            loading={loading}
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
