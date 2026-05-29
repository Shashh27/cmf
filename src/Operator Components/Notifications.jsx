import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Tag, Spin, message, Button, Row, Col, Tabs, Badge } from 'antd';
import { BellOutlined, CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import config from '../Config/config';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [pokayokeNotifications, setPokayokeNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pokayokeLoading, setPokayokeLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [pokayokePagination, setPokayokePagination] = useState({ current: 1, pageSize: 10 });
  const [activeTab, setActiveTab] = useState('production');
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());

  useEffect(() => {
    fetchNotifications();
    fetchPokayokeNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      // Get operator ID from localStorage
      let operatorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operatorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setLoading(false);
        return;
      }

      // Fetch production logs with hierarchical data
      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true&operator_id=${operatorId}`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Filter to show only logs where supervisor has responded (supervisor_id is not null)
        // and produced_quantity > 0
        const supervisorRespondedLogs = (data || []).filter(
          log => (log.supervisor_id !== null && log.supervisor_id !== undefined) &&
                 (log.produced_quantity || 0) > 0
        );
        // Sort by acknowledgment status first (unacknowledged at top), then by created_at descending
        const sortedLogs = supervisorRespondedLogs.sort((a, b) => {
          const isAckA = a.operator_acknowledged_at || a.acknowledged;
          const isAckB = b.operator_acknowledged_at || b.acknowledged;
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

  const fetchPokayokeNotifications = async () => {
    setPokayokeLoading(true);
    try {
      // Get operator ID from localStorage
      let operatorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operatorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setPokayokeLoading(false);
        return;
      }

      // Get machine ID from localStorage
      let machineId = null;
      const storedMachine = localStorage.getItem('selectedMachine');
      if (storedMachine) {
        try {
          const machine = JSON.parse(storedMachine);
          machineId = machine.id;
        } catch (e) {
          console.error("Error parsing machine_id from local storage", e);
        }
      }
      if (!machineId) machineId = localStorage.getItem('machine_id');

      if (!machineId) {
        message.error('Machine ID not found in session. Please log in again.');
        setPokayokeLoading(false);
        return;
      }

      // Fetch Pokayoke completed logs for specific machine
      const apiUrl = `${config.API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs/simple`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Show all logs where supervisor has responded, sort by acknowledgment status first (unacknowledged at top), then by completed_at descending
        const sortedLogs = (data || []).filter(
          log => log.overall_status !== 'pending'
        ).sort((a, b) => {
          const isAckA = a.operator_acknowledged;
          const isAckB = b.operator_acknowledged;
          // Unacknowledged (false) comes before acknowledged (true)
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          // Within same acknowledgment status, sort by completed_at descending
          const dateA = new Date(a.completed_at).getTime();
          const dateB = new Date(b.completed_at).getTime();
          return dateB - dateA;
        });
        setPokayokeNotifications(sortedLogs || []);
      } else {
        message.error('Failed to fetch Pokayoke notifications');
        setPokayokeNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching Pokayoke notifications:', error);
      message.error('Failed to fetch Pokayoke notifications');
      setPokayokeNotifications([]);
    } finally {
      setPokayokeLoading(false);
    }
  };

  const handleAcknowledge = async (logId) => {
    try {
      // Add to acknowledging set to disable button
      setAcknowledgingIds(prev => new Set(prev).add(logId));

      // Get operator ID from localStorage
      let operatorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operatorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      // Call the PUT endpoint for acknowledgment with operator_id as query parameter
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/${logId}/acknowledge?operator_id=${operatorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Notification acknowledged');
        // Refresh from server to ensure data consistency
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
        // Remove from acknowledging set on error
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(logId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging notification:', error);
      message.error('Failed to acknowledge notification');
      // Remove from acknowledging set on error
      setAcknowledgingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(logId);
        return newSet;
      });
    }
  };

  const handlePokayokeAcknowledge = async (logId) => {
    try {
      // Add to acknowledging set to disable button
      setAcknowledgingIds(prev => new Set(prev).add(logId));

      // Get operator ID from localStorage
      const storedUser = localStorage.getItem('user');
      let operatorId = null;
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operatorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      // Call the PUT endpoint for Pokayoke acknowledgment with operator_id as query parameter
      const response = await fetch(`${config.API_BASE_URL}/pokayoke-completed-logs/${logId}/acknowledge?operator_id=${operatorId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Pokayoke notification acknowledged');
        // Refresh the Pokayoke notifications list to update the UI
        fetchPokayokeNotifications();
      } else {
        const errorData = await response.json();
        console.error('Pokayoke acknowledgment error:', errorData);
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
        message.error(`Failed to acknowledge Pokayoke notification: ${errorMessage}`);
        // Remove from acknowledging set on error
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(logId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging Pokayoke notification:', error);
      message.error('Failed to acknowledge Pokayoke notification');
      // Remove from acknowledging set on error
      setAcknowledgingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(logId);
        return newSet;
      });
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
      title: 'Supervisor',
      key: 'supervisorName',
      align: 'center',
      width: 100,
      render: (text, record) => record.supervisor?.user_name || 'N/A',
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
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
          disabled={record.operator_acknowledged_at || record.acknowledged || acknowledgingIds.has(record.id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  const pokayokeColumns = [
    {
      title: 'Sl No',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Checklist Name',
      dataIndex: 'checklist_name',
      key: 'checklistName',
      align: 'center',
      width: 120,
    },
    {
      title: 'Machine Name',
      dataIndex: 'machine_name',
      key: 'machineName',
      align: 'center',
      width: 100,
    },
    {
      title: 'Supervisor Name',
      dataIndex: 'supervisor_name',
      key: 'supervisorName',
      align: 'center',
      width: 100,
      render: (text) => text || 'N/A',
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completedAt',
      align: 'center',
      width: 120,
      render: (text) => {
        if (!text) return 'N/A';
        try {
          const date = new Date(text);
          return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        } catch (error) {
          return 'N/A';
        }
      },
    },
    {
      title: 'Overall Status',
      dataIndex: 'overall_status',
      key: 'overallStatus',
      align: 'center',
      width: 80,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.overall_status?.toLowerCase() === value,
      render: (text) => (
        <Tag color={getStatusColor(text)}>
          {(text || 'N/A').toUpperCase()}
        </Tag>
      ),
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
          onClick={() => handlePokayokeAcknowledge(record.log_id)}
          disabled={record.operator_acknowledged || acknowledgingIds.has(record.log_id)}
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
                View and acknowledge supervisor responses
              </Text>
            </div>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              size="large"
              onClick={() => {
                fetchNotifications();
                fetchPokayokeNotifications();
              }}
            >
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {/* Tabs Section */}
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          items={[
            {
              key: 'production',
              label: 'Production Logs',
              children: (
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
                          <th {...props} style={{ ...props.style, backgroundColor: '#e6f7ff', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                            {props.children}
                          </th>
                        ),
                      },
                    }}
                  />
                </Spin>
              ),
            },
            {
              key: 'pokayoke',
              label: (
                <Badge count={pokayokeNotifications.filter(log => !log.operator_acknowledged).length} showZero={false}>
                  Pokayoke Checklists
                </Badge>
              ),
              children: (
                <Spin spinning={pokayokeLoading}>
                  <Table
                    columns={pokayokeColumns}
                    dataSource={pokayokeNotifications}
                    rowKey="log_id"
                    pagination={{
                      current: pokayokePagination.current,
                      pageSize: pokayokePagination.pageSize,
                      pageSizeOptions: [10, 20, 50, 100],
                      showSizeChanger: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                      onChange: (page, pageSize) => {
                        setPokayokePagination({ current: page, pageSize });
                      },
                      onShowSizeChange: (current, size) => {
                        setPokayokePagination({ current: 1, pageSize: size });
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
                          <th {...props} style={{ ...props.style, backgroundColor: '#e6f7ff', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                            {props.children}
                          </th>
                        ),
                      },
                    }}
                  />
                </Spin>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default Notifications;
