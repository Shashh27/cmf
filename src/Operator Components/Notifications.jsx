import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Tag, Spin, message, Button, Tabs, Badge, Select, Space } from 'antd';
import { CheckOutlined, ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import { API_BASE_URL } from '../Config/auth.js';
import NotificationPokaYoke from './NotificationPokaYoke';
import OTNotification from './OTNotification';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [activeTab, setActiveTab] = useState('production');
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [productionMachineFilter, setProductionMachineFilter] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedOperations, setSelectedOperations] = useState([]);
  const [pokayokeChecklistUnacknowledgedCount, setPokayokeChecklistUnacknowledgedCount] = useState(0);
  const [otUnacknowledgedCount, setOtUnacknowledgedCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
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

  const selectedSaleOrder = useMemo(() => {
    if (!selectedProjectId) return null;
    return orders.find((o) => o.id === selectedProjectId)?.sale_order_number ?? null;
  }, [selectedProjectId, orders]);

  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setPagination((prev) => ({ ...prev, current: 1 }));

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
        // Show logs that have been reviewed (supervisor_id, user_id/reviewer) and produced_quantity > 0
        const supervisorRespondedLogs = (data || []).filter((log) => {
          const hasReviewer =
            (log.supervisor_id !== null && log.supervisor_id !== undefined) ||
            (log.user_id !== null && log.user_id !== undefined) ||
            Boolean(log.supervisor) ||
            Boolean(log.reviewer);
          return hasReviewer && (log.produced_quantity || 0) > 0;
        });
        // Sort by acknowledgment status first (unacknowledged at top), then by created_at descending
        const sortedLogs = supervisorRespondedLogs.sort((a, b) => {
          const isAckA = a.operator_acknowledged_at || a.operator_acknowledged || a.acknowledged;
          const isAckB = b.operator_acknowledged_at || b.operator_acknowledged || b.acknowledged;
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
        await fetchNotifications();
        // Remove from acknowledging set after refresh completes
        setAcknowledgingIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(logId);
          return newSet;
        });
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

  // Build a de-duplicated list of machines present in the production logs, for the dropdown
  const productionMachineOptions = useMemo(() => {
    const machineMap = new Map();
    notifications.forEach((record) => {
      const machine = record.machine;
      if (machine && machine.id !== undefined && machine.id !== null && !machineMap.has(machine.id)) {
        const label = [machine.make, machine.model].filter(Boolean).join(' - ') || `Machine ${machine.id}`;
        machineMap.set(machine.id, label);
      }
    });
    return Array.from(machineMap.entries()).map(([id, label]) => ({ value: id, label }));
  }, [notifications]);

  const productionOperationOptions = useMemo(() => {
    const opMap = new Map();
    notifications.forEach((record) => {
      if (selectedSaleOrder && record.operation?.order?.sale_order_number !== selectedSaleOrder) return;
      if (selectedParts.length > 0 && !selectedParts.includes(record.operation?.part?.part_number)) return;

      const opNum = record.operation?.operation_number;
      if (opNum === undefined || opNum === null || opMap.has(opNum)) return;

      const opName = record.operation?.operation_name;
      const label = opName ? `${opName} (#${opNum})` : `#${opNum}`;
      opMap.set(opNum, label);
    });
    return Array.from(opMap.entries()).map(([value, label]) => ({ value, label }));
  }, [notifications, selectedSaleOrder, selectedParts]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((record) => {
      if (productionMachineFilter.length > 0) {
        if (!record.machine?.id || !productionMachineFilter.includes(record.machine.id)) {
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
  }, [notifications, productionMachineFilter, selectedSaleOrder, selectedParts, selectedOperations]);

  const hasProductionFilters = useMemo(() => (
    productionMachineFilter.length > 0 ||
    selectedProjectId != null ||
    selectedParts.length > 0 ||
    selectedOperations.length > 0
  ), [productionMachineFilter, selectedProjectId, selectedParts, selectedOperations]);

  const clearProductionFilters = () => {
    setProductionMachineFilter([]);
    setSelectedProjectId(null);
    setSelectedParts([]);
    setSelectedOperations([]);
    setParts([]);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns = [
    {
      title: 'Sl\nNo',
      key: 'slNo',
      align: 'center',
      width: 50,
      render: (text, record, index) =>
        (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Project\nDetails',
      key: 'projectDetails',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const orderA = a.operation?.order?.sale_order_number || '';
        const orderB = b.operation?.order?.sale_order_number || '';
        return orderA.localeCompare(orderB);
      },
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
      sorter: (a, b) => {
        const partA = a.operation?.part?.part_name || '';
        const partB = b.operation?.part?.part_name || '';
        return partA.localeCompare(partB);
      },
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.part?.part_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.part?.part_number || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Operation\nDetails',
      key: 'operationDetails',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const opA = a.operation?.operation_name || '';
        const opB = b.operation?.operation_name || '';
        return opA.localeCompare(opB);
      },
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.operation_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.operation_number ? `#${record.operation.operation_number}` : 'N/A'}</div>
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
      sorter: (a, b) => {
        const dateA = new Date(`${a.from_date} ${a.from_time}`);
        const dateB = new Date(`${b.from_date} ${b.from_time}`);
        return dateA - dateB;
      },
      render: (text, record) => formatDateTime(record.from_date, record.from_time),
    },
    {
      title: 'To Date\n& Time',
      key: 'toDateTime',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const dateA = new Date(`${a.to_date} ${a.to_time}`);
        const dateB = new Date(`${b.to_date} ${b.to_time}`);
        return dateA - dateB;
      },
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
      filters: [
        { text: 'Completed', value: 'completed' },
        { text: 'In Progress', value: 'inprogress' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
      render: (text) => (
        <Tag color={getStatusColor(text)}>
          {(text || 'N/A').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Approved By',
      key: 'supervisorName',
      align: 'center',
      width: 100,
      render: (text, record) =>
        record.supervisor?.user_name || record.reviewer?.user_name || 'N/A',
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
      title: 'Acknowledged At',
      dataIndex: 'operator_acknowledged_at',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.operator_acknowledged_at);
        const dateB = new Date(b.operator_acknowledged_at);
        return dateA - dateB;
      },
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
      render: (text, record) => (
        <Button
          type="primary"
          icon={<CheckOutlined />}
          size="small"
          onClick={() => handleAcknowledge(record.id)}
          disabled={record.operator_acknowledged_at || record.operator_acknowledged || record.acknowledged || acknowledgingIds.has(record.id)}
        >
          Acknowledge
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>

      {/* Tabs Section */}
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: '0 16px' } }}
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
                  <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '16px 16px 0' }}>
                    <Space wrap>
                      <Select
                        mode="multiple"
                        showSearch
                        allowClear
                        placeholder="Filter by machine"
                        style={{ minWidth: 220, maxWidth: 320 }}
                        value={productionMachineFilter}
                        onChange={(value) => {
                          setProductionMachineFilter(value || []);
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                        options={productionMachineOptions}
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
                          setPagination((prev) => ({ ...prev, current: 1 }));
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
                          setPagination((prev) => ({ ...prev, current: 1 }));
                        }}
                        style={{ minWidth: 220, maxWidth: 320 }}
                        options={productionOperationOptions}
                      />
                      {hasProductionFilters && (
                        <Button icon={<ClearOutlined />} onClick={clearProductionFilters}>
                          Clear
                        </Button>
                      )}
                    </Space>
                    <Button icon={<ReloadOutlined />} onClick={fetchNotifications} loading={loading}>
                      Refresh
                    </Button>
                  </div>
                  <Table
                    columns={columns}
                    dataSource={filteredNotifications}
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
                          <th {...props} style={{ ...props.style, background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)', fontWeight: 'bold', borderBottom: '2px solid #1890ff' }}>
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
              key: 'pokayoke-checklist',
              label: (
                <Badge count={pokayokeChecklistUnacknowledgedCount} showZero={false}>
                  PokaYoke Checklist
                </Badge>
              ),
              children: (
                <NotificationPokaYoke onUnacknowledgedCountChange={setPokayokeChecklistUnacknowledgedCount} />
              ),
            },
            {
              key: 'ot-assignments',
              label: (
                <Badge count={otUnacknowledgedCount} showZero={false}>
                  OT Assignments
                </Badge>
              ),
              children: (
                <OTNotification onUnacknowledgedCountChange={setOtUnacknowledgedCount} />
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
};

export default Notifications;