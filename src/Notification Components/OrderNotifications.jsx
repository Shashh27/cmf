import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, message, Spin, Empty, Tag, Input } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import config from '../Config/config';
import dayjs from 'dayjs';

const OrderNotifications = ({ dateRange, onCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');

  const getCurrentUser = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        return {
          username: user.username || user.user_name || user.name,
          role: user.role || user.user_role
        };
      } catch (e) {
        console.error('Error parsing user from localStorage', e);
      }
    }
    return { username: null, role: null };
  };

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const base = `${config.API_BASE_URL}/order-notifications/`;
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
      if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
      
      // Add role-based filtering based on user's role
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          const userRole = (user.role || user.user_role || '').toLowerCase();
          // Pass the appropriate role ID based on the user's role
          if (userRole.includes('manufacturing') || userRole === 'mc') {
            if (user.id) params.set('mc_id', user.id);
          } else if (userRole.includes('project') || userRole === 'pc') {
            if (user.id) params.set('pc_id', user.id);
          } else if (userRole.includes('admin')) {
            if (user.id) params.set('admin_id', user.id);
          }
        } catch (e) {
          console.error('Error parsing user from localStorage', e);
        }
      }
      
      const url = `${base}?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      const data = await response.json();

      // Filter out notifications created by the current user
      const currentUser = getCurrentUser();
      const filteredData = currentUser.username
        ? data.filter(n => n.created_by?.toLowerCase() !== currentUser.username.toLowerCase())
        : data;

      setNotifications(filteredData);
      if (onCount) onCount(Array.isArray(filteredData) ? filteredData.filter(n => !n.is_ack).length : 0);
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
      const currentUser = getCurrentUser();
      if (!currentUser.username || !currentUser.role) {
        message.error('User information not found. Please log in again.');
        return;
      }

      // Normalize role to match backend expectations
      let normalizedRole = currentUser.role.toLowerCase();
      if (normalizedRole.includes('manufacturing')) {
        normalizedRole = 'mc';
      } else if (normalizedRole.includes('project')) {
        normalizedRole = 'pc';
      } else if (normalizedRole.includes('admin')) {
        normalizedRole = 'admin';
      }

      const response = await fetch(`${config.API_BASE_URL}/order-notifications/${id}/ack`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: normalizedRole,
          user_name: currentUser.username,
        }),
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
      title: 'Order',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text) => text || '-',
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Product',
      dataIndex: 'product_name',
      key: 'product_name',
      render: (text) => text || '-',
      responsive: ['md', 'lg', 'xl'],
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (text) => dayjs(text).format('DD/MM/YYYY HH:mm'),
      responsive: ['sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Status',
      key: 'status',
      render: (_, record) => {
        const currentUser = getCurrentUser();
        const userRole = (currentUser.role || '').toLowerCase();
        
        // Check if current user's role has acknowledged
        let isAcknowledgedByCurrentRole = false;
        if (userRole.includes('manufacturing') && record.mc_is_ack) {
          isAcknowledgedByCurrentRole = true;
        } else if (userRole.includes('project') && record.pc_is_ack) {
          isAcknowledgedByCurrentRole = true;
        } else if (userRole.includes('admin') && record.admin_is_ack) {
          isAcknowledgedByCurrentRole = true;
        }

        return (
          <Tag color={isAcknowledgedByCurrentRole ? 'green' : 'orange'}>
            {isAcknowledgedByCurrentRole ? 'Acknowledged' : 'Pending'}
          </Tag>
        );
      },
      filters: [
        { text: 'Acknowledged', value: true },
        { text: 'Pending', value: false },
      ],
      onFilter: (value, record) => {
        const currentUser = getCurrentUser();
        const userRole = (currentUser.role || '').toLowerCase();
        
        if (userRole.includes('manufacturing')) {
          return value ? record.mc_is_ack : !record.mc_is_ack;
        } else if (userRole.includes('project')) {
          return value ? record.pc_is_ack : !record.pc_is_ack;
        } else if (userRole.includes('admin')) {
          return value ? record.admin_is_ack : !record.admin_is_ack;
        }
        return false;
      },
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Created By',
      dataIndex: 'created_by',
      key: 'created_by',
      render: (text) => text || '-',
      responsive: ['lg', 'xl'],
    },
    {
      title: 'Acknowledged',
      key: 'acknowledged',
      render: (_, record) => {
        const currentUser = getCurrentUser();
        const userRole = (currentUser.role || '').toLowerCase();
        
        // Check if current user's role has already acknowledged using role-specific status
        let isAcknowledgedByCurrentRole = false;
        if (userRole.includes('manufacturing') && record.mc_is_ack) {
          isAcknowledgedByCurrentRole = true;
        } else if (userRole.includes('project') && record.pc_is_ack) {
          isAcknowledgedByCurrentRole = true;
        } else if (userRole.includes('admin') && record.admin_is_ack) {
          isAcknowledgedByCurrentRole = true;
        }

        return (
          <Button
            type="primary"
            onClick={() => handleAcknowledge(record.id)}
            size="small"
            disabled={isAcknowledgedByCurrentRole}
          >
            {isAcknowledgedByCurrentRole ? 'Acknowledged' : 'Acknowledge'}
          </Button>
        );
      },
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
          placeholder="Search orders"
          allowClear
          maxLength={20}
          onSearch={(val) => setQuery(val)}
          onChange={(e) => setQuery(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <Table
        columns={columns.map(col => ({ ...col, title: <span style={{ fontWeight: 'bold' }}>{col.title}</span> }))}
        dataSource={notifications.filter(n => (n.sale_order_number || '').toLowerCase().includes(query.trim().toLowerCase()))}
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

export default OrderNotifications;