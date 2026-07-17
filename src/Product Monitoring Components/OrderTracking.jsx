import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import { Card, Table, Spin, message, Typography, Tag, Select, Empty, Space } from 'antd';
import { 
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ToolOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import {
  getOpQtyTotals,
} from '../utils/productionLogDisplay';
import ProductionStagesPanel from '../components/ProductionStagesPanel';

const { Text } = Typography;

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
  const [partStatusFilter, setPartStatusFilter]   = useState('all');
  const hasFetchedOrders = useRef(false);

  const matchesPartStatusFilter = (part, filter) => {
    const status = (part.status || '').toLowerCase();
    if (filter === 'all') return true;
    if (filter === 'completed') return status === 'completed';
    if (filter === 'in_progress') return ['in progress', 'started'].includes(status);
    if (filter === 'pending') return ['not started', 'pending'].includes(status);
    return true;
  };

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
    setPartStatusFilter('all');
    setSelectedPartId(null);
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
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      const uid = storedUser?.id;
      const role = String(storedUser?.role || '').toLowerCase();
      const params = uid == null ? undefined
        : (role.includes('manufacturing') || role === 'mc') ? { manufacturing_coordinator_id: uid }
        : (role.includes('project') || role === 'pc') ? { project_coordinator_id: uid }
        : { admin_id: uid };
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

  const filteredParts = partsData
    .filter((p) => matchesPartStatusFilter(p, partStatusFilter))
    .filter((p) =>
      p.part_name?.toLowerCase().includes(searchPart.toLowerCase())
      || p.part_number?.toLowerCase().includes(searchPart.toLowerCase()),
    );

  const kpiItems = [
    { key: 'all', label: 'Total Parts', value: totalParts, color: '#1677ff', icon: <AppstoreOutlined /> },
    { key: 'completed', label: 'Completed', value: completedParts, color: '#52c41a', icon: <CheckCircleOutlined /> },
    { key: 'in_progress', label: 'In Progress', value: inProgressParts, color: '#1890ff', icon: <SyncOutlined /> },
    { key: 'pending', label: 'Pending', value: pendingParts, color: '#faad14', icon: <ClockCircleOutlined /> },
  ];

  useEffect(() => {
    if (selectedPartId && !filteredParts.some((p) => p.part_id === selectedPartId)) {
      setSelectedPartId(null);
    }
  }, [filteredParts, selectedPartId]);

  const statusColors = {
    completed: 'success',
    'in progress': 'processing',
    inprogress: 'processing',
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
      width: 140,
      ellipsis: true,
      fixed: 'left',
      render: (text) => <Text style={{ fontSize: 12, color: '#333' }} title={text}>{text}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      width: 130,
      ellipsis: true,
      render: (text) => (
        <Text style={{ fontSize: 11, color: '#1677ff' }} title={text}>{text || '-'}</Text>
      ),
    },
    {
      title: 'Required',
      key: 'required',
      width: 76,
      align: 'center',
      render: () => <Text style={{ fontSize: 12, fontWeight: 500 }}>{selectedPart?.qty || 1}</Text>,
    },
    {
      title: 'Produced',
      key: 'produced',
      width: 76,
      align: 'center',
      render: (_, op) => {
        const { produced } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 12 }}>{produced}</Text>;
      },
    },
    {
      title: 'Approved',
      key: 'approved',
      width: 76,
      align: 'center',
      render: (_, op) => {
        const { approved } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: 12 }}>{approved}</Text>;
      },
    },
    {
      title: 'Rework',
      key: 'rework',
      width: 68,
      align: 'center',
      render: (_, op) => {
        const { rework } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#fa8c16', fontWeight: 'bold', fontSize: 12 }}>{rework}</Text>;
      },
    },
    {
      title: 'Rejected',
      key: 'rejected',
      width: 76,
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
      width: 100,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[String(status || '').toLowerCase()] || 'default'} style={{ fontSize: 10, margin: 0 }}>
          {status || 'Not Started'}
        </Tag>
      ),
    },
  ];

  const operationsTableScrollX = 140 + 130 + 76 + 76 + 76 + 68 + 76 + 100 + 48;

  return (
    <div className="order-tracking-root">
      {selectedOrderId && (
        <Card className="order-tracking-header" styles={{ body: { padding: '12px 14px' } }}>
          <div className="order-tracking-kpis">
            {kpiItems.map((kpi) => (
              <button
                key={kpi.key}
                type="button"
                className={`ot-kpi-card ot-kpi-${kpi.key}${partStatusFilter === kpi.key ? ' active' : ''}`}
                onClick={() => setPartStatusFilter((prev) => (
                  prev === kpi.key && kpi.key !== 'all' ? 'all' : kpi.key
                ))}
              >
                <span className="ot-kpi-icon" style={{ color: kpi.color }}>{kpi.icon}</span>
                <div className="ot-kpi-body">
                  <span className="ot-kpi-value" style={{ color: kpi.color }}>{kpi.value}</span>
                  <span className="ot-kpi-label">{kpi.label}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="order-tracking-grid">
        {/* Orders */}
        <Card
          title={<Space size={6}><DatabaseOutlined /> Orders</Space>}
          extra={(
            <Select
              showSearch
              allowClear
              placeholder="Search..."
              className="ot-panel-search"
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
          )}
          className="order-tracking-panel"
          styles={{
            body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
            header: { padding: '0 12px', minHeight: 42, flexShrink: 0 },
          }}
        >
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
          extra={(
            <Select
              showSearch
              allowClear
              placeholder="Search..."
              className="ot-panel-search"
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
          )}
          className="order-tracking-panel"
          styles={{
            body: { padding: 0, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
            header: { padding: '0 12px', minHeight: 42, flexShrink: 0 },
          }}
        >
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
          <div className="ot-panel-scroll ot-ops-scroll">
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
                scroll={{ x: operationsTableScrollX }}
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
                    return <ProductionStagesPanel logs={logs} />;
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
        .order-tracking-kpis {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          width: 100%;
        }
        .ot-kpi-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          border: 1px solid #e8e8e8;
          border-radius: 10px;
          background: #fff;
          cursor: pointer;
          transition: all 0.18s ease;
          min-height: 72px;
          text-align: left;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .ot-kpi-card.ot-kpi-all { border-left: 4px solid #1677ff; }
        .ot-kpi-card.ot-kpi-completed { border-left: 4px solid #52c41a; }
        .ot-kpi-card.ot-kpi-in_progress { border-left: 4px solid #1890ff; }
        .ot-kpi-card.ot-kpi-pending { border-left: 4px solid #faad14; }
        .ot-kpi-card:hover {
          border-color: #91caff;
          background: #f8fbff;
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(24,144,255,0.08);
        }
        .ot-kpi-card.active {
          border-color: #1890ff;
          background: linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%);
          box-shadow: 0 0 0 1px #91caff inset, 0 4px 12px rgba(24,144,255,0.12);
        }
        .ot-kpi-icon {
          font-size: 22px;
          flex-shrink: 0;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          background: rgba(0,0,0,0.03);
        }
        .ot-kpi-body {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .ot-kpi-value {
          font-size: 24px;
          font-weight: 700;
          line-height: 1.1;
        }
        .ot-kpi-label {
          font-size: 12px;
          color: #8c8c8c;
          font-weight: 500;
        }
        .ot-panel-search {
          width: min(180px, 42vw) !important;
          min-width: 120px;
        }
        .order-tracking-panel .ant-card-extra {
          padding: 8px 0 !important;
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
          overflow-x: auto;
        }
        .ot-ops-scroll .ant-table-wrapper {
          min-width: 0;
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
        .ot-fit-table .ant-table-thead > tr > th {
          background: #fafafa !important;
          padding: 8px 10px !important;
          font-weight: 600;
          font-size: 12px;
          white-space: nowrap;
        }
        .ot-fit-table .ant-table-tbody > tr > td {
          padding: 8px 10px !important;
          vertical-align: middle;
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
          .order-tracking-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 576px) {
          .order-tracking-root { padding: 8px; gap: 8px; }
          .order-tracking-panel { max-height: none; min-height: 240px; }
          .order-tracking-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </div>
  );
};

export default OrderTracking;