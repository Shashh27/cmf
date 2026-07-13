import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Spin, message, Button, Space, Select } from 'antd';
import { CheckOutlined, ReloadOutlined, ClearOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../../Config/schedulingconfig';
import { API_BASE_URL } from '../../Config/auth.js';

const formatDateTime = (date, time) => {
  if (!date || !time) return 'N/A';
  try {
    const timeStr = time.replace('.000Z', '');
    const dateTime = new Date(`${date} ${timeStr}`);
    if (isNaN(dateTime.getTime())) return 'N/A';

    return dateTime.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return 'N/A';
  }
};

const getCurrentUserId = () => {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    try {
      const user = JSON.parse(storedUser);
      return user.id ?? user.user_id ?? user.userId ?? null;
    } catch (e) {
      console.error('Error parsing user from localStorage', e);
    }
  }
  return localStorage.getItem('user_id') || localStorage.getItem('supervisor_id');
};

const ProductionLogNotification = ({ onCount }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [acknowledgingIds, setAcknowledgingIds] = useState(new Set());
  const [productionMachineFilter, setProductionMachineFilter] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedParts, setSelectedParts] = useState([]);
  const [selectedOperations, setSelectedOperations] = useState([]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const userId = getCurrentUserId();
      if (!userId) {
        message.error('User not found in session. Please log in again.');
        setNotifications([]);
        if (onCount) onCount(0);
        return;
      }

      const response = await fetch(`${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true`);
      if (!response.ok) {
        message.error('Failed to fetch production logs');
        setNotifications([]);
        if (onCount) onCount(0);
        return;
      }

      const data = await response.json();
      const filteredLogs = (data || []).filter((log) => {
        const noSupervisorAssigned =
          log.supervisor_id === null || log.supervisor_id === undefined;
        const matchesUser =
          String(log.supervisor_id) === String(userId) ||
          String(log.user_id) === String(userId);
        return (noSupervisorAssigned || matchesUser) && ((log.produced_quantity || 0) > 0 || (log.operator_rework_quantity || 0) > 0);
      });

      const sortedLogs = filteredLogs.sort((a, b) => {
        const isAckA = a.supervisor_acknowledged_at || a.acknowledged_at || a.acknowledged;
        const isAckB = b.supervisor_acknowledged_at || b.acknowledged_at || b.acknowledged;
        if (isAckA !== isAckB) return isAckA ? 1 : -1;
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      setNotifications(sortedLogs);
      if (onCount) {
        onCount(
          sortedLogs.filter((log) => {
            const approvedByName = log.supervisor?.user_name || log.reviewer?.user_name;
            return (
              !approvedByName &&
              !log.supervisor_acknowledged_at &&
              !log.acknowledged_at &&
              !log.acknowledged
            );
          }).length
        );
      }
    } catch (error) {
      console.error('Error fetching production logs:', error);
      message.error('Failed to fetch production logs');
      setNotifications([]);
      if (onCount) onCount(0);
    } finally {
      setLoading(false);
    }
  }, [onCount]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

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

  const handleAcknowledge = async (logId) => {
    try {
      setAcknowledgingIds((prev) => new Set(prev).add(logId));

      const userId = getCurrentUserId();
      if (!userId) {
        message.error('User not found in session. Please log in again.');
        setAcknowledgingIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
        return;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/production-logs/${logId}/acknowledge?user_id=${userId}`,
        {
          method: 'PUT',
          headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        message.success('Notification acknowledged');
        fetchNotifications();
      } else {
        const errorData = await response.json();
        let errorMessage = 'Unknown error';
        if (Array.isArray(errorData.detail)) {
          errorMessage = errorData.detail.map((err) => err.msg || err.message || err).join(', ');
        } else if (typeof errorData.detail === 'string') {
          errorMessage = errorData.detail;
        } else if (errorData.message) {
          errorMessage = errorData.message;
        } else if (errorData.error) {
          errorMessage = errorData.error;
        }
        message.error(`Failed to acknowledge notification: ${errorMessage}`);
        setAcknowledgingIds((prev) => {
          const next = new Set(prev);
          next.delete(logId);
          return next;
        });
      }
    } catch (error) {
      console.error('Error acknowledging notification:', error);
      message.error('Failed to acknowledge notification');
      setAcknowledgingIds((prev) => {
        const next = new Set(prev);
        next.delete(logId);
        return next;
      });
    }
  };

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

  const hasProductionFilters = useMemo(
    () =>
      productionMachineFilter.length > 0 ||
      selectedProjectId != null ||
      selectedParts.length > 0 ||
      selectedOperations.length > 0,
    [productionMachineFilter, selectedProjectId, selectedParts, selectedOperations]
  );

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
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
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
      render: (_, record) => (
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
      render: (_, record) => (
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
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.operation_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            {record.operation?.operation_number ? `#${record.operation.operation_number}` : 'N/A'}
          </div>
        </div>
      ),
    },
    {
      title: 'Operator',
      key: 'operatorName',
      align: 'center',
      width: 90,
      render: (_, record) => record.operator?.user_name || 'N/A',
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 100,
      render: (_, record) => (
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
      render: (_, record) => formatDateTime(record.from_date, record.from_time),
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
      render: (_, record) => formatDateTime(record.to_date, record.to_time),
    },
    {
      title: 'Part\nQty',
      key: 'partQuantity',
      align: 'center',
      width: 70,
      render: (_, record) => {
        const total = record.operation?.part?.quantity || 0;
        const remaining = record.remaining_to_close;
        return (
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 'bold' }}>{total}</div>
            {remaining !== null && remaining !== undefined && (
              <div style={{ color: remaining === 0 ? '#52c41a' : '#1677ff', fontSize: 11 }}>
                Left: {remaining}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'New\nProduced',
      dataIndex: 'produced_quantity',
      key: 'producedQuantity',
      align: 'center',
      width: 70,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{text ?? 0}</span>
      ),
    },
    {
      title: 'Rework\nSubmit',
      dataIndex: 'operator_rework_quantity',
      key: 'operatorReworkQuantity',
      align: 'center',
      width: 70,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: text > 0 ? '#FA8C16' : undefined }}>
          {text ?? 0}
        </span>
      ),
    },
    {
      title: 'Presented',
      key: 'presented',
      align: 'center',
      width: 70,
      render: (_, record) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {(record.produced_quantity || 0) + (record.operator_rework_quantity || 0)}
        </span>
      ),
    },
    {
      title: 'Approved\nQty',
      dataIndex: 'approved_quantity',
      key: 'approvedQuantity',
      align: 'center',
      width: 70,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: text > 0 ? '#52c41a' : undefined }}>
          {text ?? '-'}
        </span>
      ),
    },
    {
      title: 'Rework\n(rev.)',
      dataIndex: 'rework_quantity',
      key: 'reworkQuantity',
      align: 'center',
      width: 70,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: text > 0 ? '#FA8C16' : undefined }}>
          {text ?? '-'}
        </span>
      ),
    },
    {
      title: 'Rejected',
      dataIndex: 'rejected_quantity',
      key: 'rejectedQuantity',
      align: 'center',
      width: 70,
      render: (text) => (
        <span style={{ fontWeight: 'bold', fontSize: '14px', color: text > 0 ? '#ff4d4f' : undefined }}>
          {text ?? '-'}
        </span>
      ),
    },
    {
      title: 'Due',
      key: 'ledgerDue',
      align: 'center',
      width: 80,
      render: (_, record) => (
        <div style={{ fontSize: 11 }}>
          {(record.rework_due > 0) && <div style={{ color: '#FA8C16' }}>Rw: {record.rework_due}</div>}
          {(record.reject_due > 0) && <div style={{ color: '#ff4d4f' }}>Rej: {record.reject_due}</div>}
          {!record.rework_due && !record.reject_due && <span>-</span>}
        </div>
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
      title: 'Approved By',
      key: 'approvedBy',
      align: 'center',
      width: 100,
      sorter: (a, b) => {
        const nameA = a.supervisor?.user_name || a.reviewer?.user_name || '';
        const nameB = b.supervisor?.user_name || b.reviewer?.user_name || '';
        return nameA.localeCompare(nameB);
      },
      render: (_, record) => record.supervisor?.user_name || record.reviewer?.user_name || 'N/A',
    },
    {
      title: 'Acknowledged At',
      key: 'acknowledgedAt',
      align: 'center',
      width: 120,
      sorter: (a, b) => {
        const dateA = new Date(a.acknowledged_at || a.supervisor_acknowledged_at || 0);
        const dateB = new Date(b.acknowledged_at || b.supervisor_acknowledged_at || 0);
        return dateA - dateB;
      },
      render: (_, record) => {
        const value = record.acknowledged_at || record.supervisor_acknowledged_at;
        if (!value) return 'N/A';
        try {
          const date = new Date(value);
          return date.toLocaleString('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
        } catch {
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
      render: (_, record) => {
        const approvedByName = record.supervisor?.user_name || record.reviewer?.user_name;
        return (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            size="small"
            onClick={() => handleAcknowledge(record.id)}
            disabled={
              Boolean(approvedByName) ||
              record.supervisor_acknowledged_at ||
              record.acknowledged_at ||
              record.acknowledged ||
              acknowledgingIds.has(record.id)
            }
          >
            Acknowledge
          </Button>
        );
      },
    },
  ];

  return (
    <Spin spinning={loading}>
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
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
          onShowSizeChange: (_, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
        variant="outlined"
        scroll={{ x: 'max-content', y: 'calc(100vh - 400px)' }}
        style={{ textAlign: 'center' }}
        components={{
          header: {
            cell: (props) => (
              <th
                {...props}
                style={{
                  ...props.style,
                  background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)',
                  fontWeight: 'bold',
                  borderBottom: '2px solid #1890ff',
                }}
              >
                {props.children}
              </th>
            ),
          },
        }}
      />
    </Spin>
  );
};

export default ProductionLogNotification;
