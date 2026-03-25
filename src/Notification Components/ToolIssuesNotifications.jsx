import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, message, Spin, Empty, Tag, Input } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import config from '../Config/config';
import dayjs from 'dayjs';

const ToolIssuesNotifications = ({ dateRange, onCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const base = `${config.API_BASE_URL}/tool-issues-notifications/`;
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
      if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
      const url = `${base}?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      const data = await response.json();
      setNotifications(data);
      if (onCount) onCount(Array.isArray(data) ? data.filter(n => !n.is_ack).length : 0);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleAcknowledge = async (id) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/tool-issues-notifications/${id}/ack`, {
        method: 'PUT',
      });
      if (!response.ok) {
        throw new Error('Failed to acknowledge notification');
      }
      message.success('Notification acknowledged');
      fetchNotifications();
    } catch (error) {
      message.error(error.message);
    }
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      width: 90,
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      render: (text) => text || '-',
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Tool Issue Qty',
      dataIndex: 'tool_issue_qty',
      key: 'tool_issue_qty',
      render: (text) => text ?? '-',
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    // Removed Tool Issue Status column as requested
    {
      title: 'Status',
      dataIndex: 'is_ack',
      key: 'is_ack',
      render: (is_ack) => (
        <Tag color={is_ack ? 'green' : 'orange'}>
          {is_ack ? 'Acknowledged' : 'Pending'}
        </Tag>
      ),
      filters: [
        { text: 'Acknowledged', value: true },
        { text: 'Pending', value: false },
      ],
      onFilter: (value, record) => record.is_ack === value,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Created By',
      dataIndex: 'created_by',
      key: 'created_by',
      render: (text) => text || '-',
      responsive: ['sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
      responsive: ['sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Acknowledged',
      key: 'acknowledged',
      render: (_, record) => (
        record.is_ack ? (
          <div>
            <CheckCircleOutlined style={{ color: 'green' }} /> By: {record.ack_by}
          </div>
        ) : (
          <div>
            <span style={{ color: 'red', marginRight: 8 }}>●</span>
            <span>By:</span>
            <Button
              type="primary"
              onClick={() => handleAcknowledge(record.id)}
              size="small"
              style={{ marginLeft: 8 }}
            >
              Acknowledge
            </Button>
          </div>
        )
      ),
      filters: [
        { text: 'Acknowledged', value: true },
        { text: 'Unacknowledged', value: false },
      ],
      onFilter: (value, record) => record.is_ack === value,
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
  ];

  return (
    <Spin spinning={loading}>
      <style>{`
        @media (max-width: 768px) {
          .ant-table {
            font-size: 12px;
          }
          .ant-table-thead > tr > th,
          .ant-table-tbody > tr > td {
            padding: 8px 6px;
          }
        }
      `}</style>
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end' }}>
        <Input.Search
          placeholder="Search tools"
          allowClear
          maxLength={20}
          onSearch={(val) => setQuery(val)}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <Table
        columns={columns.map(col => ({ ...col, title: <span style={{ fontWeight: 'bold' }}>{col.title}</span> }))}
        dataSource={notifications.filter(n => (n.tool_name || '').toLowerCase().includes(query.trim().toLowerCase()))}
        rowKey="id"
        pagination={{
          current: currentPage,
          pageSize,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          responsive: true,
          onChange: (page, size) => {
            setCurrentPage(page);
            setPageSize(size);
          }
        }}
        scroll={{ x: 1000 }}
        locale={{ emptyText: <Empty description="No notifications found" /> }}
      />
    </Spin>
  );
};

export default ToolIssuesNotifications;
