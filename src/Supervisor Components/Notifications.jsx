import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Tag, Spin, message, Button, Row, Col } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      // Get supervisor ID from localStorage
      let supervisorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      if (!supervisorId) {
        message.error('Supervisor not found in session. Please log in again.');
        setLoading(false);
        return;
      }

      // Fetch all production logs with hierarchical data
      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Filter to show only logs where supervisor hasn't responded yet (supervisor_id is null)
        // and produced_quantity > 0
        const pendingLogs = (data || []).filter(
          log => (log.supervisor_id === null || log.supervisor_id === undefined) &&
                 (log.produced_quantity || 0) > 0
        );
        // Sort by acknowledgment status first (unacknowledged at top), then by created_at descending
        const sortedLogs = pendingLogs.sort((a, b) => {
          const isAckA = a.supervisor_acknowledged_at || a.acknowledged;
          const isAckB = b.supervisor_acknowledged_at || b.acknowledged;
          // Unacknowledged (false) comes before acknowledged (true)
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          // Within same acknowledgment status, sort by created_at descending
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
        setNotifications(sortedLogs || []);
      } else {
        message.error('Failed to fetch notifications');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      message.error('Failed to fetch notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (logId) => {
    try {
      // Get supervisor ID from localStorage
      const storedUser = localStorage.getItem('user');
      let supervisorId = null;
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          supervisorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');

      // Call the PUT endpoint for acknowledgment with operator_id as query parameter
      // (using the same parameter as operator since the endpoint expects operator_id)
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${logId}/acknowledge?operator_id=${supervisorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Notification acknowledged');
        // Refresh the notifications list to update the UI
        fetchNotifications();
      } else {
        const errorData = await response.json();
        console.error('Acknowledgment error:', errorData);
        let errorMessage = 'Unknown error';
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map(err => err.msg || err.message || err).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        message.error(`Failed to acknowledge notification: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error acknowledging notification:', error);
      message.error('Failed to acknowledge notification');
    }
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'success';
    if (s === 'pending') return 'processing';
    if (s === 'rework') return 'warning';
    if (s === 'rejected') return 'error';
    return 'default';
  };

  const formatDateTime = (date, time) => {
    if (!date || !time) return 'N/A';
    try {
      const dateStr = date;
      const timeStr = time.replace('.000Z', '');
      const dateTimeStr = `${dateStr} ${timeStr}`;
      const dateTime = new Date(dateTimeStr);
      if (isNaN(dateTime.getTime())) return 'N/A';

      return dateTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'N/A';
    }
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'slNo',
      align: 'center',
      width: 70,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Operation No',
      key: 'operationNumber',
      align: 'center',
      width: 120,
      render: (text, record) => record.operation?.operation_number || 'N/A',
    },
    {
      title: 'Operation Name',
      key: 'operationName',
      align: 'center',
      width: 140,
      render: (text, record) => record.operation?.operation_name || 'N/A',
    },
    {
      title: 'Project Details',
      key: 'projectDetails',
      align: 'center',
      width: 140,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.order?.sale_order_number || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.product?.product_name || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part Details',
      key: 'partDetails',
      align: 'center',
      width: 120,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.part?.part_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.part?.part_number || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Operator',
      key: 'operatorName',
      align: 'center',
      width: 120,
      render: (text, record) => record.operator?.user_name || 'N/A',
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 140,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.machine?.make || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.machine?.model || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part Qty',
      key: 'partQuantity',
      align: 'center',
      width: 100,
      render: (text, record) => record.operation?.part?.quantity || 0,
    },
    {
      title: 'Produced Qty',
      dataIndex: 'produced_quantity',
      key: 'producedQuantity',
      align: 'center',
      width: 120,
      render: (text) => text || 0,
    },
    {
      title: 'From Date & Time',
      key: 'fromDateTime',
      align: 'center',
      width: 150,
      render: (text, record) => formatDateTime(record.from_date, record.from_time),
    },
    {
      title: 'To Date & Time',
      key: 'toDateTime',
      align: 'center',
      width: 140,
      render: (text, record) => formatDateTime(record.to_date, record.to_time),
    },
    {
      title: 'Approved Qty',
      dataIndex: 'approved_quantity',
      key: 'approvedQuantity',
      align: 'center',
      width: 140,
      render: (text) => text || 0,
    },
    {
      title: 'Rework Qty',
      dataIndex: 'rework_quantity',
      key: 'reworkQuantity',
      align: 'center',
      width: 120,
      render: (text) => text || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (text) => (
        <Tag color={getStatusColor(text)}>
          {(text || 'N/A').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      align: 'center',
      width: 200,
      render: (text) => text || '-',
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 120,
      render: (text, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleAcknowledge(record.id)}
          disabled={record.supervisor_acknowledged_at || record.acknowledged}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header Card */}
      <Card
        style={{ borderRadius: 8, marginBottom: '16px' }}
        styles={{ body: { padding: '16px' } }}
      >
        <Row justify="space-between" align="middle">
          <Col>
            <div>
              <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>
                <BellOutlined /> Notifications
              </Title>
              <Text type="secondary">
                View new production logs from operators and acknowledge them
              </Text>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Table Section */}
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={notifications}
            rowKey="id"
            pagination={{
              pageSize: 10,
              pageSizeOptions: ['10', '20', '50', '100'],
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            }}
            variant="outlined"
            scroll={{ x: true }}
            style={{
              textAlign: 'center',
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default Notifications;
