import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Spin, message, Row, Col, Statistic, Typography, Tag, Select, Empty, Space } from 'antd';
import {
  ShoppingCartOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ToolOutlined
} from '@ant-design/icons';
import {
  sortLogsByStage,
  getOpQtyTotals,
} from '../../utils/productionLogDisplay';
import { api } from '../../api/client.js';
import ProductionStagesPanel from '../../components/ProductionStagesPanel';

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
const OrderTracking = ({ productId }) => {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [selectedOperationId, setSelectedOperationId] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderTrackingData, setOrderTrackingData] = useState(null);
  const [productionLogsData, setProductionLogsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchOrder, setSearchOrder] = useState('');
  const [searchPart, setSearchPart] = useState('');
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
    
    // Read order ID from local storage
    const storedOrderId = localStorage.getItem('selectedOrderId');
    if (storedOrderId) {
      setSelectedOrderId(parseInt(storedOrderId, 10));
    }
    
    fetchOrders();
  }, []);

  useEffect(() => {
    if (selectedOrderId) {
      // Store selected order ID in local storage
      localStorage.setItem('selectedOrderId', selectedOrderId);
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
      const res = await api.get(`/orders/`);
      const data = Array.isArray(res.data) ? res.data : [];
      
      // Filter orders by productId if provided
      const filteredOrders = productId 
        ? data.filter(order => order.product_id?.toString() === productId?.toString())
        : data;
      
      setOrders(filteredOrders);
      
      // Auto-select the order matching the current product, or the first order
      if (filteredOrders.length > 0 && !selectedOrderId) {
        setSelectedOrderId(filteredOrders[0].id);
      }
    } catch { message.error('Failed to fetch orders'); setOrders([]); }
    finally { setInitialLoading(false); }
  };

  const fetchOrderDetails = async (orderId) => {
    setLoading(true);
    try {
      const res = await api.get(`/orders/${orderId}/hierarchical`);
      setOrderDetails(res.data);
    } catch { message.error('Failed to fetch order details'); }
    finally { setLoading(false); }
  };

  const fetchOrderTrackingData = async (orderId) => {
    try {
      const res = await api.get(`/order-tracking/${orderId}`);
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
    } catch (err) { console.error('Error fetching order tracking data:', err); }
  };

  const partsData = getPartsData(orderDetails, orderTrackingData);
  const selectedPart = partsData.find(p => p.part_id === selectedPartId);

  const getTrackingOperation = (operationId) =>
    orderTrackingData?.parts?.find((p) => p.part_id === selectedPartId)
      ?.operations?.find((o) => o.operation_id === operationId);

  const getOperationLogs = (operationId) =>
    sortLogsByStage(getTrackingOperation(operationId)?.production_logs || []);

  const operationsTableScrollX = 820;

  const totalParts = partsData.length;
  const completedParts = partsData.filter(p => p.status?.toLowerCase() === 'completed').length;
  const inProgressParts = partsData.filter(p => ['in progress', 'started'].includes(p.status?.toLowerCase())).length;
  const pendingParts = partsData.filter(p => ['not started', 'pending'].includes(p.status?.toLowerCase())).length;

  const filteredOrders = orders.filter(o =>
    o.sale_order_number?.toLowerCase().includes(searchOrder.toLowerCase())
  );

  const filteredParts = partsData.filter(p =>
    p.part_name?.toLowerCase().includes(searchPart.toLowerCase()) ||
    p.part_number?.toLowerCase().includes(searchPart.toLowerCase())
  );

  return (
    <div style={{
      padding: '12px',
      background: '#f0f2f5',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      overflow: 'hidden'
    }}>
      {/* Top Header / Stats Row */}
      

      <div style={{ display: 'flex', flex: 1, gap: '12px', overflow: 'hidden', minHeight: 0 }}>
        {/* Middle Column: Parts */}
        <Card
          title={<Space><ToolOutlined /> Parts ({filteredParts.length})</Space>}
          style={{ flex: 1.2, display: 'flex', flexDirection: 'column', borderRadius: '8px', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', height: '100%' }}
          bodyStyle={{ padding: '0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          headStyle={{ padding: '0 16px', flexShrink: 0 }}
        >
          <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <Select
              showSearch
              placeholder="Filter parts..."
              style={{ width: '100%' }}
              onSearch={setSearchPart}
              onChange={setSelectedPartId}
              value={selectedPartId}
              filterOption={false}
            >
              {filteredParts.map(part => (
                <Select.Option key={part.part_id} value={part.part_id}>
                  {part.part_number} - {part.part_name}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <Table
              dataSource={filteredParts}
              pagination={false}
              size="small"
              rowKey="part_id"
              loading={loading}
              columns={[
                {
                  title: 'Sl No',
                  key: 'index',
                  width: 50,
                  align: 'center',
                  render: (_, __, index) => <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>{index + 1}</Text>
                },
                {
                  title: 'Part Number',
                  dataIndex: 'part_number',
                  key: 'part_number',
                  width: 100,
                  render: (text) => <Text strong style={{ fontSize: '12px', color: '#1890ff' }}>{text}</Text>
                },
                {
                  title: 'Part Name',
                  dataIndex: 'part_name',
                  key: 'part_name',
                  ellipsis: true,
                  render: (text) => <Text style={{ fontSize: '12px' }}>{text}</Text>
                },
                {
                  title: 'Assembly',
                  dataIndex: 'assembly_name',
                  key: 'assembly_name',
                  width: 100,
                  ellipsis: true,
                  render: (text) => <Tag color="blue" style={{ fontSize: '10px' }}>{text}</Tag>
                },
                {
                  title: 'Qty',
                  dataIndex: 'qty',
                  key: 'qty',
                  width: 50,
                  align: 'center',
                },
                {
                  title: 'Progress',
                  key: 'progress',
                  width: 100,
                  render: (_, record) => (
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span>{record.completed_operations}/{record.total_operations}</span>
                        <span>{Math.round(record.completion_percentage)}%</span>
                      </div>
                      <div style={{ height: '4px', background: '#f5f5f5', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                        <div style={{
                          height: '100%',
                          background: record.completion_percentage === 100 ? '#52c41a' : '#1890ff',
                          width: `${record.completion_percentage}%`
                        }} />
                      </div>
                    </div>
                  )
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  width: 90,
                  align: 'center',
                  render: (status) => {
                    const colors = {
                      'completed': 'success',
                      'in progress': 'processing',
                      'started': 'processing',
                      'pending': 'warning',
                      'not started': 'default'
                    };
                    return <Tag color={colors[status?.toLowerCase()] || 'default'} style={{ fontSize: '10px', margin: 0 }}>{status || 'Pending'}</Tag>;
                  }
                }
              ]}
              onRow={(record) => ({
                onClick: () => setSelectedPartId(record.part_id),
                style: {
                  cursor: 'pointer',
                  background: selectedPartId === record.part_id ? '#e6f7ff' : 'inherit'
                }
              })}
            />
          </div>
        </Card>

        {/* Right Column: Operations */}
        <Card
          title={<Space><SyncOutlined /> Operations {selectedPart ? `- ${selectedPart.part_number}` : ''}</Space>}
          style={{ flex: 1.5, display: 'flex', flexDirection: 'column', borderRadius: '8px', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', height: '100%' }}
          bodyStyle={{ padding: '0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          headStyle={{ padding: '0 16px', flexShrink: 0 }}
        >
          <div className="ot-ops-scroll" style={{ flex: 1, overflow: 'auto' }}>
            {!selectedPartId ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="Select a part to see operations" />
              </div>
            ) : (
              <>
                <Table
                  className="ot-fit-table"
                  dataSource={selectedPart?.operations || []}
                  pagination={false}
                  size="small"
                  rowKey="id"
                  scroll={{ x: operationsTableScrollX }}
                  expandable={{
                    expandRowByClick: true,
                    expandIconColumnWidth: 24,
                    expandedRowRender: (record) => {
                      const logs = getOperationLogs(record.id);
                      if (logs.length === 0) {
                        return (
                          <div style={{
                            padding: '16px',
                            textAlign: 'center',
                            color: '#999',
                            background: '#fafafa'
                          }}>
                            No production logs found
                          </div>
                        );
                      }
                      return <ProductionStagesPanel logs={logs} />;
                    },
                    rowExpandable: (record) => getOperationLogs(record.id).length > 0,
                  }}
                  columns={[
                    {
                      title: '#',
                      key: 'index',
                      width: 44,
                      align: 'center',
                      fixed: 'left',
                      render: (_, __, index) => <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>{index + 1}</Text>
                    },
                    {
                      title: 'Operation',
                      dataIndex: 'operation_name',
                      key: 'operation_name',
                      width: 140,
                      ellipsis: true,
                      render: (text) => (
                        <Text style={{ fontSize: '12px', color: '#333' }} title={text}>{text}</Text>
                      )
                    },
                    {
                      title: 'Machine',
                      key: 'machine_name',
                      width: 130,
                      ellipsis: true,
                      render: (_, opRecord) => {
                        const operation = getTrackingOperation(opRecord.id);
                        const machineName = operation?.machine_name || `M${opRecord.id}`;

                        return (
                          <Text style={{ fontSize: 11, color: '#1677ff' }} title={machineName} ellipsis>
                            {machineName}
                          </Text>
                        );
                      }
                    },
                    {
                      title: 'Required',
                      key: 'required',
                      width: 76,
                      align: 'center',
                      render: () => <Text style={{ fontSize: '12px', fontWeight: 500 }}>{selectedPart?.qty || 1}</Text>
                    },
                    {
                      title: 'Produced',
                      key: 'produced',
                      width: 76,
                      align: 'center',
                      render: (_, op) => {
                        const { produced } = getOpQtyTotals(getOperationLogs(op.id));
                        return <Text style={{ color: '#1890ff', fontWeight: 'bold', fontSize: '12px' }}>{produced}</Text>;
                      }
                    },
                    {
                      title: 'Approved',
                      key: 'approved',
                      width: 76,
                      align: 'center',
                      render: (_, op) => {
                        const { approved } = getOpQtyTotals(getOperationLogs(op.id));
                        return <Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '12px' }}>{approved}</Text>;
                      }
                    },
                    {
                      title: 'Rework',
                      key: 'rework',
                      width: 68,
                      align: 'center',
                      render: (_, op) => {
                        const { rework } = getOpQtyTotals(getOperationLogs(op.id));
                        return <Text style={{ color: '#fa8c16', fontWeight: 'bold', fontSize: '12px' }}>{rework}</Text>;
                      }
                    },
                    {
                      title: 'Rejected',
                      key: 'rejected',
                      width: 76,
                      align: 'center',
                      render: (_, op) => {
                        const { rejected } = getOpQtyTotals(getOperationLogs(op.id));
                        return <Text style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: '12px' }}>{rejected}</Text>;
                      }
                    },
                    {
                      title: 'Status',
                      key: 'status',
                      width: 100,
                      align: 'center',
                      render: (_, op) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const status = trackingOps?.find(o => o.operation_id === op.id)?.status || 'Not Started';
                        const colors = {
                          'completed': 'success',
                          'in progress': 'processing',
                          'started': 'processing',
                          'pending': 'warning',
                          'not started': 'default'
                        };
                        return <Tag color={colors[status?.toLowerCase()] || 'default'} style={{ fontSize: '10px' }}>{status}</Tag>;
                      }
                    }
                  ]}
                />
              </>
            )}
          </div>
        </Card>
      </div>

      <style>{`
        .truncate {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ant-card-head-title {
          padding: 12px 0 !important;
        }
        ::-webkit-scrollbar {
          width: 6px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        ::-webkit-scrollbar-thumb {
          background: #d9d9d9;
          border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #bfbfbf;
        }
        .ant-table-small .ant-table-thead > tr > th {
          background-color: #fafafa;
          padding: 8px 10px !important;
          font-weight: 600;
          font-size: 12px;
          white-space: nowrap;
        }
        .ant-table-small .ant-table-tbody > tr > td {
          padding: 8px 10px !important;
          vertical-align: middle;
          font-size: 12px;
        }
        .ot-ops-scroll .ant-table-wrapper {
          min-width: 0;
        }
        .ant-table-small .ant-table-row {
          height: 40px;
        }
      `}</style>
    </div>
  );
};

export default OrderTracking;
