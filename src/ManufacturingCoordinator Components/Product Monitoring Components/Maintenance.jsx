import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tabs, Table, Spin, message } from 'antd';
import { API_BASE_URL } from '../Config/auth';

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
  const [activeTab, setActiveTab] = useState('oee');
  const [oeePagination, setOeePagination] = useState({ current: 1, pageSize: 10 });
  const [breakdownPagination, setBreakdownPagination] = useState({ current: 1, pageSize: 10 });
  const [componentPagination, setComponentPagination] = useState({ current: 1, pageSize: 10 });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [oeeRes, brRes, compRes] = await Promise.all([
          fetch(`${API_BASE_URL}/maintenance/oee-issues`, { headers: { accept: 'application/json' } }),
          fetch(`${API_BASE_URL}/maintenance/machine-breakdown`, { headers: { accept: 'application/json' } }),
          fetch(`${API_BASE_URL}/maintenance/component-issues`, { headers: { accept: 'application/json' } }),
        ]);
        const [oeeData, brData, compData] = await Promise.all([
          oeeRes.ok ? oeeRes.json() : [],
          brRes.ok ? brRes.json() : [],
          compRes.ok ? compRes.json() : [],
        ]);
        setOeeIssues(Array.isArray(oeeData) ? oeeData : []);
        setBreakdowns(Array.isArray(brData) ? brData : []);
        setComponents(Array.isArray(compData) ? compData : []);
      } catch {
        message.error('Failed to load maintenance data');
        setOeeIssues([]);
        setBreakdowns([]);
        setComponents([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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
    { title: 'Additional Description', dataIndex: 'additional_reason', key: 'additional_reason', width: 280 },
  ];

  const componentColumns = [
    { title: 'Sl No', key: 'sl', width: 70, render: (_, __, idx) => (componentPagination.current - 1) * componentPagination.pageSize + idx + 1 },
    { title: 'Component Status', dataIndex: 'component_status', key: 'component_status', width: 180 },
    {
      title: 'Production Order',
      key: 'order',
      width: 220,
      render: (_, r) => r.order_name ?? r.production_order_id,
    },
    {
      title: 'Part Name',
      key: 'part',
      width: 220,
      render: (_, r) => r.part_name ?? r.part_id,
    },
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 320,
      render: (v) => <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{titleCase(v)}</span>,
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
                dataSource={oeeIssues}
                rowKey="id"
                scroll={{ x: 1230 }}
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
                dataSource={breakdowns}
                rowKey="id"
                scroll={{ x: 1270 }}
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
                dataSource={components}
                rowKey="id"
                scroll={{ x: 1500 }}
                tableLayout="fixed"
                pagination={{ ...componentPagination, position: ['bottomRight'] }}
                onChange={(pagination) => setComponentPagination({ current: pagination.current ?? 1, pageSize: pagination.pageSize ?? 10 })}
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
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
        />
      </Card>
    </div>
  );
};

export default Maintenance;
