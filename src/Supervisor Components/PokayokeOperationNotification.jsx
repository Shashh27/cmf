import React, { useState, useEffect, useMemo } from 'react';
import { Table, Tag, Spin, message, Button, Select, Space } from 'antd';
import { CheckOutlined, ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import config from '../Config/config';
import { API_BASE_URL } from '../Config/auth.js';

const PokayokeOperationNotification = ({ onUnacknowledgedCountChange }) => {
  const [pokayokeChecklistNotifications, setPokayokeChecklistNotifications] = useState([]);
  const [pokayokeChecklistLoading, setPokayokeChecklistLoading] = useState(true);
  const [pokayokeChecklistPagination, setPokayokeChecklistPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingChecklistIds, setAcknowledgingChecklistIds] = useState(new Set());
  const [machineFilter, setMachineFilter] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedOperations, setSelectedOperations] = useState([]);

  useEffect(() => {
    fetchPokayokeChecklistNotifications();
  }, []);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`);
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error('Error fetching orders:', e);
      }
    };
    fetchOrders();
  }, []);

  useEffect(() => {
    const unacknowledgedCount = pokayokeChecklistNotifications.filter((log) => !log.supervisor_ack_by).length;
    onUnacknowledgedCountChange?.(unacknowledgedCount);
  }, [pokayokeChecklistNotifications, onUnacknowledgedCountChange]);

  const selectedSaleOrder = useMemo(() => {
    if (!selectedProjectId) return null;
    return orders.find((o) => o.id === selectedProjectId)?.sale_order_number ?? null;
  }, [selectedProjectId, orders]);

  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));

    if (!orderId) return;

    const order = orders.find((o) => o.id === orderId);
    const saleOrder = order?.sale_order_number;
    if (!saleOrder) return;

    fetch(`${API_BASE_URL}/orders/sale-order/${saleOrder}/parts`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : (d.parts || []);
        setParts(list);
      })
      .catch(() => setParts([]));
  };

  const fetchPokayokeChecklistNotifications = async () => {    setPokayokeChecklistLoading(true);
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

  const machineOptions = useMemo(() => {
    const machineMap = new Map();
    pokayokeChecklistNotifications.forEach((record) => {
      const machine = record.machine;
      if (machine && machine.id !== undefined && machine.id !== null && !machineMap.has(machine.id)) {
        const label = [machine.make, machine.model].filter(Boolean).join(' - ') || `Machine ${machine.id}`;
        machineMap.set(machine.id, label);
      }
    });
    return Array.from(machineMap.entries()).map(([id, label]) => ({ value: id, label }));
  }, [pokayokeChecklistNotifications]);

  const operationOptions = useMemo(() => {
    const opMap = new Map();
    pokayokeChecklistNotifications.forEach((record) => {
      if (selectedSaleOrder && record.operation?.order?.sale_order_number !== selectedSaleOrder) return;
      if (selectedParts.length > 0 && !selectedParts.includes(record.operation?.part?.part_number)) return;

      const opNum = record.operation?.operation_number;
      if (opNum === undefined || opNum === null || opMap.has(opNum)) return;

      const opName = record.operation?.operation_name;
      const label = opName ? `${opName} (#${opNum})` : `#${opNum}`;
      opMap.set(opNum, label);
    });
    return Array.from(opMap.entries()).map(([value, label]) => ({ value, label }));
  }, [pokayokeChecklistNotifications, selectedSaleOrder, selectedParts]);

  const filteredPokayokeChecklistNotifications = useMemo(() => {
    return pokayokeChecklistNotifications.filter((record) => {
      if (machineFilter.length > 0) {
        if (!record.machine?.id || !machineFilter.includes(record.machine.id)) {
          return false;
        }
      }

      if (selectedSaleOrder && record.operation?.order?.sale_order_number !== selectedSaleOrder) {
        return false;
      }

      if (selectedParts.length > 0 && !selectedParts.includes(record.operation?.part?.part_number)) {
        return false;
      }

      if (selectedOperations.length > 0 && !selectedOperations.includes(record.operation?.operation_number)) {
        return false;
      }

      return true;
    });
  }, [pokayokeChecklistNotifications, machineFilter, selectedSaleOrder, selectedParts, selectedOperations]);

  const hasActiveFilters = useMemo(() => (
    machineFilter.length > 0 ||
    selectedProjectId != null ||
    selectedParts.length > 0 ||
    selectedOperations.length > 0
  ), [machineFilter, selectedProjectId, selectedParts, selectedOperations]);

  const clearFilters = () => {
    setMachineFilter([]);
    setSelectedProjectId(null);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));
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

  // Helper to render a two-line "stacked" cell: bold primary line on top,
  // muted secondary line below (matches the Project/Part/Operation Details look).
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
      render: (text, record, index) =>
        (pokayokeChecklistPagination.current - 1) * pokayokeChecklistPagination.pageSize + index + 1,
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
        const dateA = a.supervisor_ack_at ? new Date(a.supervisor_ack_at).getTime() : 0;
        const dateB = b.supervisor_ack_at ? new Date(b.supervisor_ack_at).getTime() : 0;
        return dateA - dateB;
      },
      render: (_, record) => {
        if (!record.supervisor_ack_at) return 'N/A';
        try {
          const date = new Date(record.supervisor_ack_at);
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
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '16px 16px 0' }}>
        <Space wrap>
          <Select
            mode="multiple"
            showSearch
            allowClear
            placeholder="Filter by machine"
            style={{ minWidth: 220, maxWidth: 320 }}
            value={machineFilter}
            onChange={(value) => {
              setMachineFilter(value || []);
              setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));
            }}
            options={machineOptions}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            placeholder="Select Project"
            showSearch
            allowClear
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedProjectId}
            onChange={handleProjectChange}
            style={{ minWidth: 180 }}
            options={orders.map((o) => ({
              value: o.id,
              label: o.sale_order_number || `Order ${o.id}`,
            }))}
          />
          <Select
            mode="multiple"
            placeholder="Select Parts"
            showSearch
            allowClear
            disabled={!selectedProjectId}
            maxTagCount={1}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedParts}
            onChange={(val) => {
              setSelectedParts(val);
              setSelectedOperations([]);
              setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));
            }}
            style={{ minWidth: 220, maxWidth: 320 }}
            options={parts.map((p) => ({
              value: p.part_number,
              label: p.part_name ? `${p.part_name} (${p.part_number})` : p.part_number,
            }))}
          />
          <Select
            mode="multiple"
            placeholder="Select Operations"
            showSearch
            allowClear
            disabled={!selectedProjectId}
            maxTagCount={1}
            filterOption={(input, option) =>
              (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedOperations}
            onChange={(val) => {
              setSelectedOperations(val);
              setPokayokeChecklistPagination((prev) => ({ ...prev, current: 1 }));
            }}
            style={{ minWidth: 220, maxWidth: 320 }}
            options={operationOptions}
          />
          {hasActiveFilters && (
            <Button icon={<ClearOutlined />} onClick={clearFilters}>
              Clear
            </Button>
          )}
        </Space>
        <Button icon={<ReloadOutlined />} onClick={fetchPokayokeChecklistNotifications} loading={pokayokeChecklistLoading}>
          Refresh
        </Button>
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
    </Spin>
  );
};

export default PokayokeOperationNotification;