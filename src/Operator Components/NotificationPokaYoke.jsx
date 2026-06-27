import React, { useState, useEffect } from 'react';
import { Table, Tag, Spin, message, Button } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import config from '../Config/config';

const NotificationPokaYoke = () => {
  const [pokayokeChecklist, setPokayokeChecklist] = useState([]);
  const [pokayokeChecklistLoading, setPokayokeChecklistLoading] = useState(true);
  const [pokayokeChecklistPagination, setPokayokeChecklistPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());

  useEffect(() => {
    fetchPokayokeChecklist();
  }, []);

  const fetchPokayokeChecklist = async () => {
    setPokayokeChecklistLoading(true);
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

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setPokayokeChecklistLoading(false);
        return;
      }

      // Fetch operation-checklists submissions filtered by operator
      const apiUrl = `${config.API_BASE_URL}/operation-checklists/submissions?operator=${operatorId}`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Sort by acknowledgment status first (unacknowledged at top), then by submitted_at descending
        const sortedLogs = (data || []).sort((a, b) => {
          const isAckA = a.operator_ack_by;
          const isAckB = b.operator_ack_by;
          // Unacknowledged (null) comes before acknowledged (not null)
          if (isAckA !== isAckB) {
            return isAckA ? 1 : -1;
          }
          // Within same acknowledgment status, sort by submitted_at descending
          const dateA = new Date(a.submitted_at).getTime();
          const dateB = new Date(b.submitted_at).getTime();
          return dateB - dateA;
        });
        setPokayokeChecklist(sortedLogs || []);
      } else {
        message.error('Failed to fetch PokaYoke Checklist');
        setPokayokeChecklist([]);
      }
    } catch (error) {
      console.error('Error fetching PokaYoke Checklist:', error);
      message.error('Failed to fetch PokaYoke Checklist');
      setPokayokeChecklist([]);
    } finally {
      setPokayokeChecklistLoading(false);
    }
  };

  const handlePokayokeChecklistAcknowledge = async (submissionId) => {
    try {
      // Add to acknowledging set to disable button
      setAcknowledgingIds(prev => new Set(prev).add(submissionId));

      // Get role from localStorage
      const storedUser = localStorage.getItem('user');
      let role = 'operator';
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          role = user.role || 'operator';
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }

      // Call the PUT endpoint for operation-checklists acknowledgment
      const response = await fetch(`${config.API_BASE_URL}/operation-checklists/submissions/${submissionId}/acknowledge`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role }),
      });

      if (response.ok) {
        message.success('PokaYoke Checklist acknowledged');
        // Refresh the Pokayoke Checklist list to update the UI
        await fetchPokayokeChecklist();
        // Remove from acknowledging set after refresh completes
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
      } else {
        const errorData = await response.json();
        console.error('PokaYoke Checklist acknowledgment error:', errorData);
        let errorMessage = 'Unknown error';
        if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
        message.error(`Failed to acknowledge PokaYoke Checklist: ${errorMessage}`);
        // Remove from acknowledging set on error
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(submissionId);
          return newSet;
        });
      }
    } catch (error) {
      console.error('Error acknowledging PokaYoke Checklist:', error);
      message.error('Failed to acknowledge PokaYoke Checklist');
      // Remove from acknowledging set on error
      setAcknowledgingIds(prev => {
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

  // Helper to render a two-line "stacked" cell
  const renderStackedCell = (primary, secondary) => (
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600, color: '#1f1f1f' }}>{primary || '-'}</div>
      <div style={{ fontSize: 12, color: '#8c8c8c' }}>{secondary || '-'}</div>
    </div>
  );

  const pokayokeChecklistColumns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Project Details',
      key: 'projectDetails',
      align: 'left',
      width: 180,
      sorter: (a, b) => {
        const orderA = a.operation?.order?.sale_order_number || '';
        const orderB = b.operation?.order?.sale_order_number || '';
        return orderA.localeCompare(orderB);
      },
      render: (_, record) => {
        const orderNumber = record.operation?.order?.sale_order_number;
        const productName = record.operation?.product?.product_name;
        return renderStackedCell(orderNumber, productName);
      },
    },
    {
      title: 'Part Details',
      key: 'partDetails',
      align: 'left',
      width: 160,
      sorter: (a, b) => {
        const partA = a.operation?.part?.part_name || '';
        const partB = b.operation?.part?.part_name || '';
        return partA.localeCompare(partB);
      },
      render: (_, record) => {
        const partName = record.operation?.part?.part_name;
        const partNumber = record.operation?.part?.part_number;
        return renderStackedCell(partName, partNumber);
      },
    },
    {
      title: 'Operation Details',
      key: 'operationDetails',
      align: 'left',
      width: 170,
      sorter: (a, b) => {
        const opA = a.operation?.operation_name || '';
        const opB = b.operation?.operation_name || '';
        return opA.localeCompare(opB);
      },
      render: (_, record) => {
        const operationName = record.operation?.operation_name;
        const operationNumber = record.operation?.operation_number;
        return renderStackedCell(operationName, operationNumber ? `#${operationNumber}` : null);
      },
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
      title: 'Submitted\nAt',
      key: 'submittedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.submitted_at);
        const dateB = new Date(b.submitted_at);
        return dateA - dateB;
      },
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
            second: '2-digit',
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
      title: 'Acknowledged At',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.operator_ack_at);
        const dateB = new Date(b.operator_ack_at);
        return dateA - dateB;
      },
      render: (_, record) => {
        if (!record.operator_ack_at) return 'N/A';
        try {
          const date = new Date(record.operator_ack_at);
          return date.toLocaleString('en-GB', {
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
      },
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
          onClick={() => handlePokayokeChecklistAcknowledge(record.id)}
          disabled={record.operator_ack_by || acknowledgingIds.has(record.id)}
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
        dataSource={pokayokeChecklist}
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

export default NotificationPokaYoke;