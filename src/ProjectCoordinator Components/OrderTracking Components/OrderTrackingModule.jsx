import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../../Config/auth';
import { Card, Table, Spin, message, Row, Col, Statistic, Typography, Tag, Select, Empty, Space } from 'antd';
import { ShoppingCartOutlined, SyncOutlined,CheckCircleOutlined,ClockCircleOutlined,DatabaseOutlined,ToolOutlined} from '@ant-design/icons';

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
const OrderTrackingModule = () => {
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

      // Use project_coordinator_id for PC users, manufacturing_coordinator_id for MC users, admin_id for admin users
      const isManufacturingCoordinator = normalizedRole.includes('manufacturing coordinator') || normalizedRole === 'mc';
      const isProjectCoordinator = normalizedRole.includes('project coordinator') || normalizedRole === 'pc';
      const params = userId != null
        ? (isManufacturingCoordinator ? { manufacturing_coordinator_id: userId }
          : isProjectCoordinator ? { project_coordinator_id: userId }
          : { admin_id: userId })
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
    } catch (err) { console.error('Error fetching order tracking data:', err); }
  };

  const partsData = getPartsData(orderDetails, orderTrackingData);
  const selectedPart = partsData.find(p => p.part_id === selectedPartId);

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
      <Card styles={{ body: { padding: '12px 24px' } }} style={{ borderRadius: '8px', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', flexShrink: 0 }}>
        <Row align="middle" justify="space-between">
          <Col>
            <Space size="middle">
              <ShoppingCartOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
              <Title level={4} style={{ margin: 0 }}>Order Tracking Dashboard</Title>
            </Space>
          </Col>
          {selectedOrderId && (
            <Col>
              <Space size="large">
                <Statistic title="Total Parts" value={totalParts} styles={{ content: { fontSize: '20px' } }} />
                <Statistic title="Completed" value={completedParts} styles={{ content: { color: '#52c41a', fontSize: '20px' } }} />
                <Statistic title="In Progress" value={inProgressParts} styles={{ content: { color: '#1890ff', fontSize: '20px' } }} />
                <Statistic title="Pending" value={pendingParts} styles={{ content: { color: '#faad14', fontSize: '20px' } }} />
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      <div style={{ display: 'flex', flex: 1, gap: '12px', overflow: 'hidden', minHeight: 0 }}>
        {/* Left Column: Orders */}
        <Card 
          title={<Space><DatabaseOutlined /> Orders</Space>}
          style={{ width: '280px', display: 'flex', flexDirection: 'column', borderRadius: '8px', border: 'none', boxShadow: '0 1px 2px rgba(0,0,0,0.03)', height: '100%' }}
          styles={{ body: { padding: '0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }, header: { padding: '0 16px', flexShrink: 0 } }}
        >
          <div style={{ padding: '12px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
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
              {filteredOrders.map(order => (
                <Select.Option key={order.id} value={order.id}>
                  {order.sale_order_number}
                </Select.Option>
              ))}
            </Select>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {initialLoading ? (
              <div style={{ textAlign: 'center', padding: '20px' }}><Spin /></div>
            ) : filteredOrders.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No orders" />
            ) : (
              filteredOrders.map(order => (
                <div 
                  key={order.id}
                  onClick={() => setSelectedOrderId(order.id)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: selectedOrderId === order.id ? '#e6f7ff' : 'transparent',
                    borderLeft: selectedOrderId === order.id ? '4px solid #1890ff' : '4px solid transparent',
                    transition: 'all 0.2s',
                    borderBottom: '1px solid #f5f5f5'
                  }}
                >
                  <Text strong style={{ color: selectedOrderId === order.id ? '#1890ff' : '#262626', fontSize: '13px' }}>
                    {order.sale_order_number}
                  </Text>
                </div>
              ))
            )}
          </div>
        </Card>

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
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedPartId ? (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Empty description="Select a part to see operations" />
              </div>
            ) : (
              <>
                <Table
                  dataSource={selectedPart?.operations || []}
                  pagination={false}
                  size="small"
                  rowKey="id"
                  expandable={{
                    expandRowByClick: true,
                    expandIconColumnWidth: 24,
                    expandedRowRender: (record) => {
                      const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                      const operation = trackingOps?.find(o => o.operation_id === record.id);
                      const logs = operation?.production_logs || [];
                      
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
                      
                      return (
                        <div style={{ 
                          padding: '16px', 
                          background: '#fafafa',
                          borderRadius: '6px',
                          margin: '0 8px 12px',
                          border: '1px solid #e8e8e8'
                        }}>
                          <div style={{ marginBottom: '12px', fontWeight: 'bold', color: '#333' }}>
                            Production Stages
                          </div>
                          {logs.map((log, index) => (
                            <div key={log.id} style={{ 
                              marginBottom: '8px', 
                              padding: '12px', 
                              background: '#fff', 
                              borderRadius: '4px',
                              border: '1px solid #d9d9d9'
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontWeight: 'bold', color: '#333' }}>Stage {index + 1}</span>
                                <Tag color={log.status === 'completed' ? 'green' : log.status === 'rework' ? 'orange' : 'blue'}>
                                  {log.status}
                                </Tag>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px', fontSize: '12px' }}>
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
                              <div style={{ marginTop: '8px', fontSize: '11px', color: '#666' }}>
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
                    rowExpandable: (record) => {
                      const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                      const operation = trackingOps?.find(o => o.operation_id === record.id);
                      const logs = operation?.production_logs || [];
                      return logs && logs.length > 0;
                    }
                  }}
                  columns={[
                    {
                      title: '#',
                      key: 'index',
                      width: 50,
                      align: 'center',
                      render: (_, __, index) => <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>{index + 1}</Text>
                    },
                    {
                      title: 'Operation Name',
                      dataIndex: 'operation_name',
                      key: 'operation_name',
                      width: 150,
                      ellipsis: true,
                      render: (text) => (
                        <Text style={{ fontSize: '12px', color: '#333' }}>{text}</Text>
                      )
                    },
                    {
                      title: 'Machine Name',
                      key: 'machine_name',
                      width: 140,
                      align: 'center',
                      render: (_, opRecord) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const operation = trackingOps?.find(o => o.operation_id === opRecord.id);
                        const machineName = operation?.machine_name || `M${opRecord.id}`;

                        return (
                          <div style={{
                            maxWidth: '140px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            <Tag
                              color="blue"
                              style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                borderRadius: '3px',
                                padding: '2px 6px',
                                margin: 0
                              }}
                            >
                              {machineName}
                            </Tag>
                          </div>
                        );
                      }
                    },
                    {
                      title: 'Required',
                      key: 'required',
                      width: 73,
                      align: 'center',
                      render: (_, op) => <Text style={{ fontSize: '12px', fontWeight: 500 }}>{selectedPart?.qty || 1}</Text>
                    },
                    {
                      title: 'Produced',
                      key: 'produced',
                      width: 80,
                      align: 'center',
                      render: (_, op) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const operation = trackingOps?.find(o => o.operation_id === op.id);
                        const logs = operation?.production_logs || [];
                        return <Text style={{ color: '#1890ff', fontWeight: 'bold', fontSize: '12px' }}>{logs.reduce((s, l) => s + (l.produced_quantity || 0), 0)}</Text>;
                      }
                    },
                    {
                      title: 'Approved',
                      key: 'approved',
                      width: 80,
                      align: 'center',
                      render: (_, op) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const operation = trackingOps?.find(o => o.operation_id === op.id);
                        const logs = operation?.production_logs || [];
                        return <Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: '12px' }}>{logs.reduce((s, l) => s + (l.approved_quantity || 0), 0)}</Text>;
                      }
                    },
                    {
                      title: 'Rework',
                      key: 'rework',
                      width: 75,
                      align: 'center',
                      render: (_, op) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const operation = trackingOps?.find(o => o.operation_id === op.id);
                        const logs = operation?.production_logs || [];
                        return <Text style={{ color: '#fa8c16', fontWeight: 'bold', fontSize: '12px' }}>{logs.reduce((s, l) => s + (l.rework_quantity || 0), 0)}</Text>;
                      }
                    },
                    {
                      title: 'Rejected',
                      key: 'rejected',
                      width: 75,
                      align: 'center',
                      render: (_, op) => {
                        const trackingOps = orderTrackingData?.parts?.find(p => p.part_id === selectedPartId)?.operations;
                        const operation = trackingOps?.find(o => o.operation_id === op.id);
                        const logs = operation?.production_logs || [];
                        return <Text style={{ color: '#ff4d4f', fontWeight: 'bold', fontSize: '12px' }}>{logs.reduce((s, l) => s + (l.rejected_quantity || 0), 0)}</Text>;
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
          padding: 8px 12px !important;
          font-weight: 600;
          font-size: 11px;
        }
        .ant-table-small .ant-table-tbody > tr > td {
          padding: 8px 12px !important;
          vertical-align: middle;
        }
        .ant-table-small .ant-table-row {
          height: 40px;
        }
      `}</style>
    </div>
  );
};

export default OrderTrackingModule;