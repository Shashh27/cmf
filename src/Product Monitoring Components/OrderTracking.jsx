import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import { Card, Table, Spin, message, Row, Col, Statistic, Typography, Tag, Select, Empty, Space } from 'antd';
import { 
  ShoppingCartOutlined, 
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ToolOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

/* ─── STATUS TAG ─────────────────────────────────────────────────────────── */
const getStatusTag = (status) => {
  const colorMap = {
    'completed': 'success',
    'in progress': 'processing',
    'started': 'processing', 
    'pending': 'warning',
    'not started': 'default'
  };
  return <Tag color={colorMap[status?.toLowerCase()] || 'default'} style={{ fontSize: '12px' }}>{status || 'Not Started'}</Tag>;
};

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────────── */
const OrderTracking = () => {
  const [orders, setOrders]                       = useState([]);
  const [selectedOrderId, setSelectedOrderId]     = useState(null);
  const [selectedPartId, setSelectedPartId]       = useState(null);
  const [selectedOperationId, setSelectedOperationId] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [orderDetails, setOrderDetails]           = useState(null);
  const [orderTrackingData, setOrderTrackingData] = useState(null);
  const [productionLogsData, setProductionLogsData] = useState({});
  const [loading, setLoading]                     = useState(false);
  const [initialLoading, setInitialLoading]       = useState(true);
  const [searchOrder, setSearchOrder]             = useState('');
  const [searchPart, setSearchPart]               = useState('');
  const hasFetchedOrders = useRef(false);

  const getCurrentAdminId = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      return JSON.parse(stored)?.id || null;
    } catch { return null; }
  };

  const getUserRole = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const userData = JSON.parse(stored);
      return userData.role || userData.user_role;
    } catch { return null; }
  };

  /* ─── PARTS DATA HELPER ─────────────────────────────────────────────────── */
  const getPartsData = (details, tracking) => {
    if (!details?.product_hierarchy) return [];
    const parts = [];
    const trackingMap = {};
    tracking?.parts?.forEach(p => { trackingMap[p.part_id] = p; });

    const extractPartsFromAssembly = (assembly) => {
      // Add parts from this assembly
      assembly.parts?.forEach(pd => {
        const tp = trackingMap[pd.part.id];
        parts.push({
          key: pd.part.id, part_id: pd.part.id,
          part_name: pd.part.part_name, part_number: pd.part.part_number,
          assembly_name: assembly.assembly?.assembly_name || 'Assembly',
          type_name: pd.part.type_name, qty: pd.part.qty,
          status: tp?.status || 'Not Started',
          completion_percentage: tp?.completion_percentage || 0,
          total_operations: tp?.total_operations || pd.operations?.length || 0,
          completed_operations: tp?.completed_operations || 0,
          operations: pd.operations || [],
        });
      });

      // Recursively add parts from subassemblies
      assembly.subassemblies?.forEach(sub => {
        extractPartsFromAssembly(sub);
      });
    };

    details.product_hierarchy.assemblies?.forEach(assembly => {
      extractPartsFromAssembly(assembly);
    });

    details.product_hierarchy.direct_parts?.forEach(pd => {
      const tp = trackingMap[pd.part.id];
      parts.push({
        key: pd.part.id, part_id: pd.part.id,
        part_name: pd.part.part_name, part_number: pd.part.part_number,
        assembly_name: 'Direct Part', type_name: pd.part.type_name, qty: pd.part.qty,
        status: tp?.status || 'Not Started',
        completion_percentage: tp?.completion_percentage || 0,
        total_operations: tp?.total_operations || pd.operations?.length || 0,
        completed_operations: tp?.completed_operations || 0,
        operations: pd.operations || [],
      });
    });
    return parts;
  };

  useEffect(() => {
    if (hasFetchedOrders.current) return;
    hasFetchedOrders.current = true;
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails(selectedOrderId);
      fetchOrderTrackingData(selectedOrderId);
      setSelectedPartId(null); // Reset part selection when order changes
    } else {
      setOrderDetails(null); 
      setOrderTrackingData(null);
      setProductionLogsData({});
      setSelectedPartId(null);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    if (orderDetails) {
      // Auto-select first part if available
      const parts = getPartsData(orderDetails, orderTrackingData);
      if (parts.length > 0 && !selectedPartId) {
        setSelectedPartId(parts[0].part_id);
      }
    } else {
      setProductionLogsData({});
    }
  }, [orderDetails, orderTrackingData]);

  const fetchOrders = async () => {
    setInitialLoading(true);
    try {
      const userId = getCurrentAdminId();
      const userRole = getUserRole();
      const normalizedRole = (userRole || '').toLowerCase().replace(/_/g, ' ').trim();
      
      // Use manufacturing_coordinator_id for MC users, admin_id for admin users
      const isManufacturingCoordinator = normalizedRole.includes('manufacturing coordinator') || normalizedRole === 'mc';
      const params = userId != null 
        ? (isManufacturingCoordinator ? { manufacturing_coordinator_id: userId } : { admin_id: userId })
        : undefined;
      
      const res = await axios.get(`${API_BASE_URL}/orders/`, { params });
      const data = Array.isArray(res.data) ? res.data : [];
      setOrders(data);
      if (data.length > 0 && !selectedOrderId) {
        setSelectedOrderId(data[0].id);
      }
    } catch { message.error('Failed to fetch orders'); setOrders([]); }
    finally { setInitialLoading(false); }
  };

  const fetchOrderDetails = async (orderId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/orders/${orderId}/hierarchical`);
      setOrderDetails(res.data);
    } catch { message.error('Failed to fetch order details'); }
    finally { setLoading(false); }
  };

  const fetchOrderTrackingData = async (orderId) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/order-tracking/${orderId}`);
      setOrderTrackingData(res.data);
      
      // Extract production logs from tracking data and update state
      // This avoids making multiple separate API calls for each operation
      const logsMap = {};
      res.data.parts?.forEach(part => {
        part.operations?.forEach(op => {
          logsMap[op.operation_id] = op.production_logs || [];
        });
      });
      setProductionLogsData(logsMap);
    } catch { /* non-critical */ }
  };

  const partsData = getPartsData(orderDetails, orderTrackingData);
  const selectedPart = partsData.find(p => p.part_id === selectedPartId);
  const selectedTrackingPart = orderTrackingData?.parts?.find((p) => p.part_id === selectedPartId);

  const formatMachineName = (op) => {
    if (!op) return '-';
    const make = (op.machine_make || '').trim();
    const model = (op.machine_model || '').trim();
    if (make && model && make !== model) return `${make} ${model}`;
    if (model) return model;
    if (make) return make;
    const name = (op.machine_name || '').trim();
    if (!name) return '-';
    // De-dupe values like "Stallion 200 Stallion 200"
    const tokens = name.split(/\s+/);
    const mid = Math.floor(tokens.length / 2);
    if (tokens.length >= 2 && tokens.length % 2 === 0) {
      const left = tokens.slice(0, mid).join(' ');
      const right = tokens.slice(mid).join(' ');
      if (left === right) return left;
    }
    return name;
  };

  const getTrackingOp = (operationId) =>
    selectedTrackingPart?.operations?.find((o) => o.operation_id === operationId);

  /** Prefer latest completed log; otherwise latest log — matches current qty state */
  const getOpQtyTotals = (logs = []) => {
    if (!logs.length) return { produced: 0, approved: 0, rework: 0, rejected: 0 };
    const sorted = [...logs].sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    );
    const preferred =
      sorted.find((l) => String(l.status || '').toLowerCase() === 'completed') || sorted[0];
    return {
      produced: preferred.produced_quantity || 0,
      approved: preferred.approved_quantity || 0,
      rework: preferred.rework_quantity || 0,
      rejected: preferred.rejected_quantity || 0,
    };
  };

  // Prefer tracking ops when available (has machine + production_logs)
  const operationsForTable = (selectedTrackingPart?.operations?.length
    ? selectedTrackingPart.operations.map((op) => ({
        id: op.operation_id,
        operation_name: op.operation_name,
        operation_number: op.operation_number,
        status: op.status,
        machine_name: formatMachineName(op),
        production_logs: op.production_logs || [],
      }))
    : (selectedPart?.operations || []).map((op) => {
        const tracked = getTrackingOp(op.id);
        return {
          id: op.id,
          operation_name: op.operation_name,
          operation_number: op.operation_number,
          status: tracked?.status || op.status || 'Not Started',
          machine_name: formatMachineName(tracked),
          production_logs: tracked?.production_logs || productionLogsData[op.id] || [],
        };
      })
  ).slice().sort((a, b) => Number(a.operation_number || 0) - Number(b.operation_number || 0));

  const totalParts      = partsData.length;
  const completedParts  = partsData.filter(p => p.status?.toLowerCase() === 'completed').length;
  const inProgressParts = partsData.filter(p => ['in progress', 'started'].includes(p.status?.toLowerCase())).length;
  const pendingParts    = partsData.filter(p => ['not started', 'pending'].includes(p.status?.toLowerCase())).length;
  
  const filteredOrders = orders.filter(o => 
    o.sale_order_number?.toLowerCase().includes(searchOrder.toLowerCase())
  );

  const filteredParts = partsData.filter(p => 
    p.part_name?.toLowerCase().includes(searchPart.toLowerCase()) || 
    p.part_number?.toLowerCase().includes(searchPart.toLowerCase())
  );

  const statusColors = {
    completed: 'success',
    'in progress': 'processing',
    started: 'processing',
    pending: 'warning',
    'not started': 'default',
  };

  const partsColumns = [
    {
      title: 'Part No',
      dataIndex: 'part_number',
      key: 'part_number',
      width: '16%',
      ellipsis: true,
      render: (text) => <Text strong style={{ fontSize: 12, color: '#1890ff' }}>{text || '-'}</Text>,
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: '20%',
      ellipsis: true,
      render: (text) => <Text style={{ fontSize: 12 }} title={text}>{text || '-'}</Text>,
    },
    {
      title: 'Assembly',
      dataIndex: 'assembly_name',
      key: 'assembly_name',
      width: '22%',
      ellipsis: true,
      render: (text) => (
        <Text style={{ fontSize: 11, color: '#595959' }} title={text}>{text || '-'}</Text>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 44,
      align: 'center',
    },
    {
      title: 'Progress',
      key: 'progress',
      width: '18%',
      render: (_, record) => (
        <div style={{ width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, gap: 4 }}>
            <span>{record.completed_operations}/{record.total_operations}</span>
            <span>{Math.round(record.completion_percentage)}%</span>
          </div>
          <div style={{ height: 4, background: '#f5f5f5', borderRadius: 2, overflow: 'hidden', marginTop: 2 }}>
            <div
              style={{
                height: '100%',
                background: record.completion_percentage === 100 ? '#52c41a' : '#1890ff',
                width: `${record.completion_percentage}%`,
              }}
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[status?.toLowerCase()] || 'default'} style={{ fontSize: 10, margin: 0 }}>
          {status || 'Pending'}
        </Tag>
      ),
    },
  ];

  const operationsColumns = [
    {
      title: 'Operation',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: '22%',
      ellipsis: true,
      render: (text) => <Text style={{ fontSize: 12, color: '#333' }} title={text}>{text}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      width: '24%',
      ellipsis: true,
      render: (text) => (
        <Text style={{ fontSize: 11, color: '#1677ff' }} title={text}>{text || '-'}</Text>
      ),
    },
    {
      title: 'Req',
      key: 'required',
      width: 42,
      align: 'center',
      render: () => <Text style={{ fontSize: 12, fontWeight: 500 }}>{selectedPart?.qty || 1}</Text>,
    },
    {
      title: 'Prod',
      key: 'produced',
      width: 46,
      align: 'center',
      render: (_, op) => {
        const { produced } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 12 }}>{produced}</Text>;
      },
    },
    {
      title: 'Appr',
      key: 'approved',
      width: 46,
      align: 'center',
      render: (_, op) => {
        const { approved } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: 12 }}>{approved}</Text>;
      },
    },
    {
      title: 'Rew',
      key: 'rework',
      width: 42,
      align: 'center',
      render: (_, op) => {
        const { rework } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#fa8c16', fontWeight: 'bold', fontSize: 12 }}>{rework}</Text>;
      },
    },
    {
      title: 'Rej',
      key: 'rejected',
      width: 42,
      align: 'center',
      render: (_, op) => {
        const { rejected } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: 12 }}>{rejected}</Text>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 96,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[String(status || '').toLowerCase()] || 'default'} style={{ fontSize: 10, margin: 0 }}>
          {status || 'Not Started'}
        </Tag>
      ),
    },
  ];

  return (
    <div className="order-tracking-root">
      <Card
        className="order-tracking-header"
        styles={{ body: { padding: '10px 14px' } }}
      >
        <Row align="middle" justify="space-between" gutter={[8, 8]} wrap>
          <Col xs={24} lg={8}>
            <Space size="middle" wrap>
              <ShoppingCartOutlined style={{ fontSize: 22, color: '#1890ff' }} />
              <Title level={4} style={{ margin: 0, fontSize: 18 }}>Order Tracking Dashboard</Title>
            </Space>
          </Col>
          {selectedOrderId && (
            <Col xs={24} lg={16}>
              <div className="order-tracking-stats">
                <Statistic title="Total Parts" value={totalParts} styles={{ content: { fontSize: 18 } }} />
                <Statistic title="Completed" value={completedParts} styles={{ content: { color: '#52c41a', fontSize: 18 } }} />
                <Statistic title="In Progress" value={inProgressParts} styles={{ content: { color: '#1890ff', fontSize: 18 } }} />
                <Statistic title="Pending" value={pendingParts} styles={{ content: { color: '#faad14', fontSize: 18 } }} />
              </div>
            </Col>
          )}
        </Row>
      </Card>

      <div className="order-tracking-grid">
        {/* Orders */}
        <Card
          title={<Space size={6}><DatabaseOutlined /> Orders</Space>}
          className="order-tracking-panel"
          styles={{
            body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
            header: { padding: '0 12px', minHeight: 42, flexShrink: 0 },
          }}
        >
          <div className="ot-panel-filter">
            <Select
              showSearch
              placeholder="Search orders..."
              style={{ width: '100%' }}
              onSearch={setSearchOrder}
              onChange={setSelectedOrderId}
              value={selectedOrderId}
              filterOption={false}
              loading={initialLoading}
            >
              {filteredOrders.map((order) => (
                <Select.Option key={order.id} value={order.id}>
                  {order.sale_order_number}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div className="ot-panel-scroll">
            {initialLoading ? (
              <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
            ) : filteredOrders.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders" />
            ) : (
              filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className={`ot-order-item${selectedOrderId === order.id ? ' active' : ''}`}
                  onClick={() => setSelectedOrderId(order.id)}
                >
                  <Text strong style={{ color: selectedOrderId === order.id ? '#1890ff' : '#262626', fontSize: 13 }}>
                    {order.sale_order_number}
                  </Text>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Parts */}
        <Card
          title={<Space size={6}><ToolOutlined /> Parts ({filteredParts.length})</Space>}
          className="order-tracking-panel"
          styles={{
            body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
            header: { padding: '0 12px', minHeight: 42, flexShrink: 0 },
          }}
        >
          <div className="ot-panel-filter">
            <Select
              showSearch
              placeholder="Filter parts..."
              style={{ width: '100%' }}
              onSearch={setSearchPart}
              onChange={setSelectedPartId}
              value={selectedPartId}
              filterOption={false}
            >
              {filteredParts.map((part) => (
                <Select.Option key={part.part_id} value={part.part_id}>
                  {part.part_number} - {part.part_name}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div className="ot-panel-scroll">
            <Table
              className="ot-fit-table"
              dataSource={filteredParts}
              pagination={false}
              size="small"
              rowKey="part_id"
              loading={loading}
              tableLayout="fixed"
              columns={partsColumns}
              onRow={(record) => ({
                onClick: () => setSelectedPartId(record.part_id),
                style: {
                  cursor: 'pointer',
                  background: selectedPartId === record.part_id ? '#e6f7ff' : undefined,
                },
              })}
            />
          </div>
        </Card>

        {/* Operations */}
        <Card
          title={
            <Space size={6} wrap>
              <SyncOutlined />
              <span>Operations{selectedPart ? ` · ${selectedPart.part_number}` : ''}</span>
            </Space>
          }
          className="order-tracking-panel"
          styles={{
            body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
            header: { padding: '0 12px', minHeight: 42, flexShrink: 0 },
          }}
        >
          <div className="ot-panel-scroll">
            {!selectedPartId ? (
              <div className="ot-empty-wrap">
                <Empty description="Select a part to see operations" />
              </div>
            ) : operationsForTable.length === 0 ? (
              <div className="ot-empty-wrap">
                <Empty description="No operations for this part" />
              </div>
            ) : (
              <Table
                className="ot-fit-table"
                dataSource={operationsForTable}
                pagination={false}
                size="small"
                rowKey="id"
                tableLayout="fixed"
                expandable={{
                  expandRowByClick: true,
                  expandIconColumnWidth: 28,
                  expandedRowRender: (record) => {
                    const logs = record.production_logs || [];

                    if (logs.length === 0) {
                      return (
                        <div style={{ padding: 12, textAlign: 'center', color: '#999', background: '#fafafa' }}>
                          No production logs found
                        </div>
                      );
                    }

                    return (
                      <div className="ot-log-wrap">
                        <div style={{ marginBottom: 8, fontWeight: 600, color: '#333', fontSize: 12 }}>
                          Production Stages
                        </div>
                        {logs.map((log, index) => (
                          <div key={log.id} className="ot-log-card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
                              <span style={{ fontWeight: 600, color: '#333' }}>Stage {index + 1}</span>
                              <Tag color={log.status === 'completed' ? 'green' : log.status === 'rework' ? 'orange' : 'blue'}>
                                {log.status}
                              </Tag>
                            </div>
                            <div className="ot-log-grid">
                              <div>
                                <span style={{ color: '#666' }}>Produced: </span>
                                <span style={{ color: '#1677ff', fontWeight: 'bold' }}>{log.produced_quantity || 0}</span>
                              </div>
                              <div>
                                <span style={{ color: '#666' }}>Approved: </span>
                                <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{log.approved_quantity || 0}</span>
                              </div>
                              <div>
                                <span style={{ color: '#666' }}>Rework: </span>
                                <span style={{ color: '#fa8c16', fontWeight: 'bold' }}>{log.rework_quantity || 0}</span>
                              </div>
                              <div>
                                <span style={{ color: '#666' }}>Rejected: </span>
                                <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{log.rejected_quantity || 0}</span>
                              </div>
                            </div>
                            <div style={{ marginTop: 8, fontSize: 11, color: '#666' }}>
                              <div>From: {log.from_date} {log.from_time}</div>
                              <div>To: {log.to_date} {log.to_time}</div>
                              {log.notes && <div>Notes: {log.notes}</div>}
                              {log.remarks && <div>Remarks: {log.remarks}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  },
                  rowExpandable: (record) => (record.production_logs || []).length > 0,
                }}
                columns={operationsColumns}
              />
            )}
          </div>
        </Card>
      </div>

      <style>{`
        .order-tracking-root {
          padding: 10px;
          background: #f0f2f5;
          height: calc(100vh - 64px);
          max-height: calc(100vh - 64px);
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          box-sizing: border-box;
          width: 100%;
        }
        .order-tracking-header {
          border-radius: 8px;
          border: none;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          flex-shrink: 0;
        }
        .order-tracking-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px 16px;
          width: 100%;
        }
        .order-tracking-stats .ant-statistic-title {
          font-size: 11px;
          margin-bottom: 0;
        }
        .order-tracking-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(150px, 0.7fr) minmax(0, 1.15fr) minmax(0, 1.85fr);
          gap: 10px;
          width: 100%;
          overflow: hidden;
        }
        .order-tracking-panel {
          border-radius: 8px !important;
          border: none !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          height: 100%;
          min-width: 0;
          min-height: 0;
          display: flex !important;
          flex-direction: column;
          overflow: hidden;
        }
        .order-tracking-panel .ant-card-body {
          min-height: 0;
        }
        .order-tracking-panel .ant-card-head-title {
          padding: 10px 0 !important;
          font-size: 13px;
        }
        .ot-panel-filter {
          padding: 8px 10px;
          border-bottom: 1px solid #f0f0f0;
          flex-shrink: 0;
        }
        .ot-panel-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .ot-order-item {
          padding: 10px 12px;
          cursor: pointer;
          border-left: 3px solid transparent;
          border-bottom: 1px solid #f5f5f5;
          transition: all 0.15s;
          word-break: break-word;
        }
        .ot-order-item:hover { background: #fafafa; }
        .ot-order-item.active {
          background: #e6f7ff;
          border-left-color: #1890ff;
        }
        .ot-empty-wrap {
          height: 100%;
          min-height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ot-fit-table {
          width: 100%;
        }
        .ot-fit-table .ant-table {
          table-layout: fixed !important;
          width: 100% !important;
        }
        .ot-fit-table .ant-table-container,
        .ot-fit-table .ant-table-content {
          overflow-x: hidden !important;
        }
        .ot-fit-table .ant-table-thead > tr > th {
          background: #fafafa !important;
          padding: 6px 6px !important;
          font-weight: 600;
          font-size: 11px;
          white-space: nowrap;
        }
        .ot-fit-table .ant-table-tbody > tr > td {
          padding: 6px 6px !important;
          vertical-align: middle;
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ot-log-wrap {
          padding: 10px;
          background: #fafafa;
          border-radius: 6px;
          margin: 0 6px 8px;
          border: 1px solid #e8e8e8;
        }
        .ot-log-card {
          margin-bottom: 8px;
          padding: 10px;
          background: #fff;
          border-radius: 4px;
          border: 1px solid #d9d9d9;
        }
        .ot-log-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 10px;
          font-size: 12px;
        }
        .order-tracking-root ::-webkit-scrollbar { width: 5px; height: 5px; }
        .order-tracking-root ::-webkit-scrollbar-track { background: transparent; }
        .order-tracking-root ::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 3px; }

        @media (max-width: 1200px) {
          .order-tracking-grid {
            grid-template-columns: minmax(140px, 0.65fr) minmax(0, 1.1fr) minmax(0, 1.7fr);
          }
        }

        @media (max-width: 992px) {
          .order-tracking-root {
            height: auto;
            max-height: none;
            overflow: auto;
            min-height: calc(100vh - 64px);
          }
          .order-tracking-grid {
            grid-template-columns: 1fr;
            overflow: visible;
            flex: none;
          }
          .order-tracking-panel {
            height: auto;
            max-height: 42vh;
          }
          .order-tracking-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 576px) {
          .order-tracking-root { padding: 8px; gap: 8px; }
          .order-tracking-panel { max-height: none; min-height: 240px; }
          .order-tracking-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .ot-log-grid { grid-template-columns: 1fr 1fr; }
        }
      `}</style>
    </div>
  );
};

export default OrderTracking;