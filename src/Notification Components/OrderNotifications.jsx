import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, message, Spin, Empty } from 'antd';
import dayjs from 'dayjs';
import config from '../Config/config';
import { filterOwnCreatedNotifications, getStoredUser } from '../utils/notificationFilters';
import { authFetch } from '../api/client.js';
import {
  ModernTableStyles,
  getNotificationTableProps,
  renderAckCell,
  getOrderAckState,
  normalizeUserRole,
  getCurrentUserInfo,
  useLatestCallback,
} from './notificationTableUtils';

const OrderNotifications = ({ dateRange, onCount, refreshKey = 0, query = '' }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const onCountRef = useLatestCallback(onCount);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const base = `${config.API_BASE_URL}/order-notifications/`;
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
      if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());

      const response = await authFetch(`${base}?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch notifications');
      const data = await response.json();
      const currentUser = getStoredUser();
      const filteredData = filterOwnCreatedNotifications(data, currentUser);
      setNotifications(filteredData);
      if (onCountRef.current) {
        const userRole = String(currentUser?.role || currentUser?.user_role || '').toLowerCase();
        const pending = Array.isArray(filteredData)
          ? filteredData.filter((n) => {
              if (userRole.includes('manufacturing')) return !n.mc_is_ack;
              if (userRole.includes('project')) return !n.pc_is_ack;
              if (userRole.includes('admin')) return !n.admin_is_ack;
              return !n.is_ack;
            }).length
          : 0;
        onCountRef.current(pending);
      }
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
      const currentUser = getCurrentUserInfo();
      if (!currentUser.username || !currentUser.role) {
        message.error('User information not found. Please log in again.');
        return;
      }
      const response = await authFetch(`${config.API_BASE_URL}/order-notifications/${id}/ack`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: normalizeUserRole(currentUser.role),
          user_name: currentUser.username,
        }),
      });
      if (!response.ok) throw new Error('Failed to acknowledge notification');
      message.success('Notification acknowledged');
      fetchNotifications();
    } catch (error) {
      message.error(error.message);
    }
  };

  const columns = useMemo(() => {
    const currentUser = getCurrentUserInfo();
    return [
      {
        title: 'Sl No',
        key: 'sl_no',
        width: 70,
        sorter: false,
        render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
      },
      {
        title: 'Project Number',
        dataIndex: 'sale_order_number',
        key: 'sale_order_number',
        render: (text) => text || '-',
      },
      {
        title: 'Project Name',
        dataIndex: 'project_name',
        key: 'project_name',
        sortValue: (r) => r.project_name || r.product_name,
        render: (_, record) => record.project_name || record.product_name || '-',
      },
      {
        title: 'Customer',
        dataIndex: 'customer_name',
        key: 'customer_name',
        render: (text) => text || '-',
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
        render: (_, record) => {
          const { isAck, ackBy } = getOrderAckState(record, currentUser.role);
          return renderAckCell({
            isAck,
            ackBy,
            onAcknowledge: () => handleAcknowledge(record.id),
          });
        },
      },
    ];
  }, [currentPage, pageSize]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notifications;
    return notifications.filter((n) =>
      [n.sale_order_number, n.project_name, n.product_name, n.customer_name, n.created_by]
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
        locale={{ emptyText: <Empty description="No project notifications found" /> }}
      />
    </Spin>
  );
};

export default OrderNotifications;
