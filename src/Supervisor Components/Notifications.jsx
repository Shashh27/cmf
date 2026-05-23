import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Tag, Spin, message, Button, Row, Col } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

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

        // Filter to show all logs related to supervisor:
        // - logs where supervisor hasn't responded yet (supervisor_id is null)
        // - logs where supervisor has responded (supervisor_id matches current supervisor)
        // and produced_quantity > 0
        const supervisorLogs = (data || []).filter(
          log => ((log.supervisor_id === null || log.supervisor_id === undefined) ||
                 String(log.supervisor_id) === String(supervisorId)) &&
                 (log.produced_quantity || 0) > 0
        );
        // Sort by acknowledgment status first (unacknowledged at top), then by created_at descending
        const sortedLogs = supervisorLogs.sort((a, b) => {
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

      // Call the PUT endpoint for acknowledgment with supervisor_id as query parameter
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${logId}/acknowledge?supervisor_id=${supervisorId}`, {
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
    if (s === 'in_progress') return 'blue';
    if (s === 'completed') return 'green';
    if (s === 'submitted') return 'cyan';
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
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Operation\nNo',
      key: 'operationNumber',
      align: 'center',
      width: 80,
      render: (text, record) => record.operation?.operation_number || 'N/A',
    },
    {
      title: 'Operation\nName',
      key: 'operationName',
      align: 'center',
      width: 100,
      render: (text, record) => record.operation?.operation_name || 'N/A',
    },
    {
      title: 'Project\nDetails',
      key: 'projectDetails',
      align: 'center',
      width: 100,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.order?.sale_order_number || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.product?.product_name || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part\nDetails',
      key: 'partDetails',
      align: 'center',
      width: 80,
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
      width: 90,
      render: (text, record) => record.operator?.user_name || 'N/A',
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 100,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.machine?.make || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.machine?.model || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part\nQty',
      key: 'partQuantity',
      align: 'center',
      width: 60,
      render: (text, record) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{record.operation?.part?.quantity || 0}</span>
      ),
    },
    {
      title: 'Produced\nQty',
      dataIndex: 'produced_quantity',
      key: 'producedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'From Date\n& Time',
      key: 'fromDateTime',
      align: 'center',
      width: 100,
      render: (text, record) => formatDateTime(record.from_date, record.from_time),
    },
    {
      title: 'To Date\n& Time',
      key: 'toDateTime',
      align: 'center',
      width: 100,
      render: (text, record) => formatDateTime(record.to_date, record.to_time),
    },
    {
      title: 'Approved\nQty',
      dataIndex: 'approved_quantity',
      key: 'approvedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Rework\nQty',
      dataIndex: 'rework_quantity',
      key: 'reworkQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Rejected\nQty',
      dataIndex: 'rejected_quantity',
      key: 'rejectedQuantity',
      align: 'center',
      width: 80,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text || 0}</span>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      align: 'center',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      width: 50,
      fixed: 'right',
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
          <Col>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              size="large"
              onClick={() => fetchNotifications()}
            >
              Refresh
            </Button>
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
              current: pagination.current,
              pageSize: pagination.pageSize,
              pageSizeOptions: [10, 20, 50, 100],
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
              onChange: (page, pageSize) => {
                setPagination({ current: page, pageSize });
              },
              onShowSizeChange: (current, size) => {
                setPagination({ current: 1, pageSize: size });
              },
            }}
            variant="outlined"
            scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
            style={{
              textAlign: 'center',
            }}
            components={{
              header: {
                cell: (props) => (
                  <th {...props} style={{ ...props.style, backgroundColor: '#ffffe0', fontWeight: 'bold' }}>
                    {props.children}
                  </th>
                ),
              },
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default Notifications;
