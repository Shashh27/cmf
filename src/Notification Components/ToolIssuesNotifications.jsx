import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, message, Spin, Empty } from 'antd';
import dayjs from 'dayjs';
import config from '../Config/config';
import { authFetch } from '../api/client.js';
import {
  ModernTableStyles,
  getNotificationTableProps,
  renderAckCell,
  useLatestCallback,
} from './notificationTableUtils';

const ToolIssuesNotifications = ({ dateRange, onCount, refreshKey = 0, query = '' }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const onCountRef = useLatestCallback(onCount);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const base = `${config.API_BASE_URL}/tool-issues-notifications/`;
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
      if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
      const response = await authFetch(`${base}?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      setNotifications(data);
      onCountRef.current?.(Array.isArray(data) ? data.filter((n) => !n.is_ack).length : 0);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange, onCountRef]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications, refreshKey]);

  const handleAcknowledge = async (id) => {
    try {
      const response = await authFetch(`${config.API_BASE_URL}/tool-issues-notifications/${id}/ack`, {
        method: 'PUT',
      });
      if (!response.ok) throw new Error('Failed to acknowledge notification');
      message.success('Notification acknowledged');
      fetchNotifications();
    } catch (error) {
      message.error(error.message);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: 'Sl No',
        key: 'sl_no',
        sorter: false,
        render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      },
      {
        title: 'Tool Description',
        dataIndex: 'tool_description',
        key: 'tool_description',
        sortValue: (r) => r.tool_description || r.tool_name,
        render: (_, record) => record.tool_description || record.tool_name || '-',
      },
      {
        title: 'Range',
        dataIndex: 'range',
        key: 'range',
        render: (text) => text || '-',
      },
      {
        title: 'ID Code',
        dataIndex: 'identification_code',
        key: 'identification_code',
        render: (text) => text || '-',
      },
      {
        title: 'Quantity',
        dataIndex: 'quantity',
        key: 'quantity',
        sortValue: (r) => r.quantity ?? r.tool_issue_qty,
        render: (_, record) => record.quantity ?? record.tool_issue_qty ?? '-',
      },
      {
        title: 'Created By',
        dataIndex: 'created_by',
        key: 'created_by',
        render: (text) => text || '-',
      },
      {
        title: 'Created At',
        dataIndex: 'created_at',
        key: 'created_at',
        render: (text) => (text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-'),
      },
      {
        title: 'Acknowledged',
        key: 'acknowledged',
        sorter: false,
        render: (_, record) =>
          renderAckCell({
            isAck: !!record.is_ack,
            ackBy: record.ack_by,
            onAcknowledge: () => handleAcknowledge(record.id),
          }),
      },
    ],
    [currentPage, pageSize],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) =>
      [n.tool_description, n.tool_name, n.range, n.identification_code, n.created_by]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [notifications, query]);

  return (
    <Spin spinning={loading}>
      <ModernTableStyles />
      <Table
        {...getNotificationTableProps({
          columns,
          dataSource: filtered,
          rowKey: 'id',
          loading: false,
          pagination: {
            current: currentPage,
            pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          },
        })}
        locale={{ emptyText: <Empty description="No notifications found" /> }}
      />
    </Spin>
  );
};

export default ToolIssuesNotifications;
