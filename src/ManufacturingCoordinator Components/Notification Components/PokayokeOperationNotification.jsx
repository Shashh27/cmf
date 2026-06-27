import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Tag, Spin, message, Button, Badge, Empty, Tooltip, Modal, Input } from 'antd';
import { CheckOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons';
import config from '../../Config/config';
import dayjs from 'dayjs';

const PokayokeOperationNotification = ({ onUnacknowledgedCountChange }) => {
  const [pokayokeChecklistNotifications, setPokayokeChecklistNotifications] = useState([]);
  const [pokayokeChecklistLoading, setPokayokeChecklistLoading] = useState(true);
  const [pokayokeChecklistPagination, setPokayokeChecklistPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingChecklistIds, setAcknowledgingChecklistIds] = useState(new Set());
  const [searchText, setSearchText] = useState('');
  const [checklistDetailsModalOpen, setChecklistDetailsModalOpen] = useState(false);
  const [selectedChecklistRecord, setSelectedChecklistRecord] = useState(null);

  useEffect(() => {
    fetchPokayokeChecklistNotifications();
  }, []);

  // Report unacknowledged count to parent
  useEffect(() => {
    const unacknowledgedCount = pokayokeChecklistNotifications.filter(log => !log.mc_ack_by).length;
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
          const isAckA = a.mc_ack_by;
          const isAckB = b.mc_ack_by;
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
      let role = 'mc';
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          role = user.role || 'mc';
          // Map manufacturing_coordinator to mc for backend compatibility
          if (role === 'manufacturing_coordinator') {
            role = 'mc';
          }
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

  const handleViewChecklistDetails = (record) => {
    setSelectedChecklistRecord(record);
    setChecklistDetailsModalOpen(true);
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

  // Search across all relevant fields: order number, product, part number/name,
  // operation name/number, machine, operator, status
  const filteredPokayokeChecklistNotifications = useMemo(() => {
    const trimmedSearch = searchText.trim().toLowerCase();
    if (!trimmedSearch) {
      return pokayokeChecklistNotifications;
    }

    return pokayokeChecklistNotifications.filter((record) => {
      const searchableValues = [
        record.operation?.order?.sale_order_number,
        record.operation?.order?.customer?.customer_name,
        record.operation?.product?.product_name,
        record.operation?.part?.part_name,
        record.operation?.part?.part_number,
        record.operation?.operation_name,
        record.operation?.operation_number,
        record.machine?.make,
        record.machine?.model,
        record.operator?.user_name,
        record.supervisor?.user_name,
        record.status,
      ];

      return searchableValues.some((value) =>
        value !== undefined && value !== null && String(value).toLowerCase().includes(trimmedSearch)
      );
    });
  }, [pokayokeChecklistNotifications, searchText]);

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
      title: 'Operator',
      key: 'operator',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const aVal = a.operator?.user_name || '';
        const bVal = b.operator?.user_name || '';
        return String(aVal).localeCompare(String(bVal));
      },
      render: (_, record) => record.operator?.user_name || '-',
    },
    {
      title: 'Submitted\nAt',
      key: 'submittedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
        const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
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
      title: 'Acknowledged\nAt',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = a.mc_ack_at ? new Date(a.mc_ack_at).getTime() : 0;
        const dateB = b.mc_ack_at ? new Date(b.mc_ack_at).getTime() : 0;
        return dateA - dateB;
      },
      render: (_, record) => {
        if (!record.mc_ack_at) return 'N/A';
        try {
          const date = new Date(record.mc_ack_at);
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
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Tooltip title="View Operator Remarks">
            <Button
              type="default"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handleViewChecklistDetails(record)}
            />
          </Tooltip>
          <Button
            type="primary"
            icon={<CheckOutlined />}
            size="small"
            onClick={() => handleChecklistAcknowledge(record.id)}
            disabled={record.mc_ack_by || acknowledgingChecklistIds.has(record.id)}
          >
            Acknowledge
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Spin spinning={pokayokeChecklistLoading}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Input
          allowClear
          placeholder="Search order no, part no, operation, machine, operator..."
          prefix={<SearchOutlined style={{ color: '#8c8c8c' }} />}
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));
          }}
          style={{ width: 320 }}
        />
      </div>
      <Table
        columns={pokayokeChecklistColumns}
        dataSource={filteredPokayokeChecklistNotifications}
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

      <Modal
        title="Checklist Details"
        open={checklistDetailsModalOpen}
        onCancel={() => {
          setChecklistDetailsModalOpen(false);
          setSelectedChecklistRecord(null);
        }}
        footer={null}
        width={650}
      >
        <Table
          dataSource={selectedChecklistRecord?.checklist_names || []}
          rowKey="checklist_id"
          pagination={false}
          locale={{ emptyText: <Empty description="No checklist data" /> }}
          columns={[
            {
              title: 'Checklist Name',
              dataIndex: 'checklist_name',
              key: 'checklist_name',
              align: 'left',
            },
            {
              title: 'Response',
              dataIndex: 'response',
              key: 'response',
              align: 'left',
              render: (response) => (
                <span style={{ color: response ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
                  {response ? 'Yes' : 'No'}
                </span>
              ),
            },
            {
              title: 'Operator Remarks',
              dataIndex: 'op_remarks',
              key: 'op_remarks',
              align: 'left',
              render: (remarks) => remarks || '-',
            },
          ]}
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
      </Modal>
    </Spin>
  );
};

export default PokayokeOperationNotification;