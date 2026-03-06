import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, message, Spin, Empty, Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import config from '../Config/config';
import dayjs from 'dayjs';

const OrderNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const url = `${config.API_BASE_URL}/order-notifications/`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }
      const data = await response.json();
      setNotifications(data);
    } catch (error) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleAcknowledge = async (id) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/order-notifications/${id}/ack`, {
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
      title: 'Order',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text) => text || '-',
      responsive: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      render: (text) => text || '-',
      responsive: ['sm', 'md', 'lg', 'xl'],
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
      dataIndex: 'order_status',
      key: 'order_status',
      render: (status) => {
        const color = status === 'Completed' ? 'green' : status === 'Ongoing' ? 'blue' : 'orange';
        return <Tag color={color}>{status || '-'}</Tag>;
      },
      filters: [
        { text: 'Ongoing', value: 'Ongoing' },
        { text: 'Pending', value: 'Pending' },
        { text: 'Completed', value: 'Completed' },
      ],
      onFilter: (value, record) => record.order_status === value,
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
      <Table
        columns={columns.map(col => ({ ...col, title: <span style={{ fontWeight: 'bold' }}>{col.title}</span> }))}
        dataSource={notifications}
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
