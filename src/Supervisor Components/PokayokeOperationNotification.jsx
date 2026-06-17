import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Tag, Spin, message, Button, Badge, Empty } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import config from '../Config/config';
import dayjs from 'dayjs';

const PokayokeOperationNotification = ({ onUnacknowledgedCountChange }) => {
  const [pokayokeChecklistNotifications, setPokayokeChecklistNotifications] = useState([]);
  const [pokayokeChecklistLoading, setPokayokeChecklistLoading] = useState(true);
  const [pokayokeChecklistPagination, setPokayokeChecklistPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingChecklistIds, setAcknowledgingChecklistIds] = useState(new Set());

  useEffect(() => {
    fetchPokayokeChecklistNotifications();
  }, []);

  // Report unacknowledged count to parent
  useEffect(() => {
    const unacknowledgedCount = pokayokeChecklistNotifications.filter(log => !log.supervisor_ack_by).length;
    if (onUnacknowledgedCountChange) {
      onUnacknowledgedCountChange(unacknowledgedCount);
    }
  }, [pokayokeChecklistNotifications, onUnacknowledgedCountChange]);

  const fetchPokayokeChecklistNotifications = async () => {
    setPokayokeChecklistLoading(true);
    try {
      const apiUrl = `${config.API_BASE_URL}/operation-checklists/submissions`;
      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Sort by acknowledgment status first (unacknowledged at top), then by submitted_at descending
        const sortedLogs = (data || []).sort((a, b) => {
          const isAckA = a.supervisor_ack_by;
          const isAckB = b.supervisor_ack_by;
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return dateB - dateA;
        });
        setPokayokeChecklistNotifications(sortedLogs || []);
      } else {
        message.error('Failed to fetch PokaYoke Checklist notifications');
        setPokayokeChecklistNotifications([]);
      }
    } catch (error) {
      console.error('Error fetching PokaYoke Checklist notifications:', error);
      message.error('Failed to fetch PokaYoke Checklist notifications');
      setPokayokeChecklistNotifications([]);
    } finally {
      setPokayokeChecklistLoading(false);
    }
  };

  const handleChecklistAcknowledge = async (submissionId) => {
    try {
      setAcknowledgingChecklistIds(prev => new Set(prev).add(submissionId));

      // Get role from localStorage
      const storedUser = localStorage.getItem('user');
      let role = 'supervisor';
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          role = user.role || 'supervisor';
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }

      const response = await fetch(`${config.API_BASE_URL}/operation-checklists/submissions/${submissionId}/acknowledge`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      });

      if (response.ok) {
        message.success('PokaYoke Checklist acknowledged');
        fetchPokayokeChecklistNotifications();
      } else {
        const errorData = await response.json();
        console.error('Acknowledgment error:', errorData);
        let errorMessage = 'Unknown error';
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        message.error(`Failed to acknowledge: ${errorMessage}`);
        setAcknowledgingChecklistIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging checklist:', error);
      message.error('Failed to acknowledge checklist');
      setAcknowledgingChecklistIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(submissionId);
        return newSet;
      });
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
        return 'processing';
      default:
        return 'default';
    }
  };

  const pokayokeChecklistColumns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Order\nNumber',
      key: 'orderNumber',
      align: 'center',
      width: 100,
      render: (_, record) => record.operation?.order?.sale_order_number || '-',
    },
    {
      title: 'Part\nName',
      key: 'partName',
      align: 'center',
      width: 120,
      render: (_, record) => record.operation?.part?.part_name || '-',
    },
    {
      title: 'Operation\nName',
      key: 'operationName',
      align: 'center',
      width: 120,
      render: (_, record) => record.operation?.operation_name || '-',
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 100,
      render: (_, record) => {
        if (record.machine) {
          return `(${record.machine.make}) ${record.machine.model}`.trim() || '-';
        }
        return '-';
      },
    },
    {
      title: 'Operator',
      key: 'operator',
      align: 'center',
      width: 100,
      render: (_, record) => record.operator?.user_name || '-',
    },
    {
      title: 'Submitted\nAt',
      key: 'submittedAt',
      align: 'center',
      width: 120,
      render: (_, record) => {
        if (!record.submitted_at) return 'N/A';
        try {
          const date = new Date(record.submitted_at);
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
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 80,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
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
      render: (_, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleChecklistAcknowledge(record.id)}
          disabled={record.supervisor_ack_by || acknowledgingChecklistIds.has(record.id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <Spin spinning={pokayokeChecklistLoading}>
      <Table
        columns={pokayokeChecklistColumns}
        dataSource={pokayokeChecklistNotifications}
        rowKey="id"
        pagination={{
          current: pokayokeChecklistPagination.current,
          pageSize: pokayokeChecklistPagination.pageSize,
          pageSizeOptions: [10, 20, 50, 100],
          showSizeChanger: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          onChange: (page, pageSize) => {
            setPokayokeChecklistPagination({ current: page, pageSize });
          },
          onShowSizeChange: (current, size) => {
            setPokayokeChecklistPagination({ current: 1, pageSize: size });
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
              <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
                {props.children}
              </th>
            ),
          },
        }}
      />
    </Spin>
  );
};

export default PokayokeOperationNotification;
