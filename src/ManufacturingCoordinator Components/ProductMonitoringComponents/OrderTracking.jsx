import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, Table, Spin, message, Typography, Tag, Select, Empty, Space, Progress, Tooltip } from 'antd';
import {
  SyncOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ToolOutlined,
  AppstoreOutlined,
  PercentageOutlined,
  CalendarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  getOpQtyTotals,
  getVisibleStageLogs,
  buildProductionStageTree,
} from '../../utils/productionLogDisplay';
import { api } from '../../api/client.js';
import ProductionStagesPanel from '../../components/ProductionStagesPanel';
import { useResizableColumns } from '../../hooks/useResizableColumns';

const { Text } = Typography;

const statusColors = {
  completed: 'success',
  'in progress': 'processing',
  inprogress: 'processing',
  started: 'processing',
  pending: 'warning',
  'not started': 'default',
};

const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

/* ─── MAIN COMPONENT ─────────────────────────────────────────────────────── */
const OrderTracking = () => {
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedPartId, setSelectedPartId] = useState(null);
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderTrackingData, setOrderTrackingData] = useState(null);
  const [productionLogsData, setProductionLogsData] = useState({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searchOrder, setSearchOrder] = useState('');
  const [searchPart, setSearchPart] = useState('');
  const [partStatusFilter, setPartStatusFilter] = useState('all');
  const [expandedOpKeys, setExpandedOpKeys] = useState([]);
  const hasFetchedOrders = useRef(false);

  const matchesPartStatusFilter = (part, filter) => {
    const status = (part.status || '').toLowerCase();
    if (filter === 'all') return true;
    if (filter === 'completed') return status === 'completed';
    if (filter === 'in_progress') return ['in progress', 'started'].includes(status);
    if (filter === 'pending') return ['not started', 'pending'].includes(status);
    return true;
  };

  const getPartsData = (details, tracking) => {
    if (!details?.product_hierarchy) return [];
    const parts = [];
    const trackingMap = {};
    tracking?.parts?.forEach((p) => { trackingMap[p.part_id] = p; });

    const extractPartsFromAssembly = (assembly) => {
      assembly.parts?.forEach((pd) => {
        const tp = trackingMap[pd.part.id];
        parts.push({
          key: pd.part.id,
          part_id: pd.part.id,
          part_name: pd.part.part_name,
          part_number: pd.part.part_number,
          assembly_name: assembly.assembly?.assembly_name || 'Assembly',
          type_name: pd.part.type_name,
          qty: pd.part.qty,
          status: tp?.status || 'Not Started',
          completion_percentage: tp?.completion_percentage || 0,
          total_operations: tp?.total_operations || pd.operations?.length || 0,
          completed_operations: tp?.completed_operations || 0,
          operations: pd.operations || [],
        });
      });
      assembly.subassemblies?.forEach((sub) => extractPartsFromAssembly(sub));
    };

    details.product_hierarchy.assemblies?.forEach((assembly) => {
      extractPartsFromAssembly(assembly);
    });

    details.product_hierarchy.direct_parts?.forEach((pd) => {
      const tp = trackingMap[pd.part.id];
      parts.push({
        key: pd.part.id,
        part_id: pd.part.id,
        part_name: pd.part.part_name,
        part_number: pd.part.part_number,
        assembly_name: 'Direct Part',
        type_name: pd.part.type_name,
        qty: pd.part.qty,
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
      setSelectedPartId(null);
      setExpandedOpKeys([]);
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
      setOrders(data);
      if (data.length > 0 && !selectedOrderId) {
        setSelectedOrderId(data[0].id);
      }
    } catch {
      message.error('Failed to fetch orders');
      setOrders([]);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchOrderDetails = async (orderId) => {
    setLoading(true);
    try {
      const res = await api.get(`/orders/${orderId}/hierarchical`);
      setOrderDetails(res.data);
    } catch {
      message.error('Failed to fetch order details');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderTrackingData = async (orderId) => {
    try {
      const res = await api.get(`/order-tracking/${orderId}`);
      setOrderTrackingData(res.data);
      const logsMap = {};
      res.data.parts?.forEach((part) => {
        part.operations?.forEach((op) => {
          logsMap[op.operation_id] = op.production_logs || [];
        });
      });
      setProductionLogsData(logsMap);
    } catch {
      /* non-critical */
    }
  };

  const partsData = getPartsData(orderDetails, orderTrackingData);
  const selectedPart = partsData.find((p) => p.part_id === selectedPartId);
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

  const operationsForTable = (selectedTrackingPart?.operations?.length
    ? selectedTrackingPart.operations.map((op) => {
        const logs = op.production_logs || [];
        const stages = buildProductionStageTree(logs);
        return {
          id: op.operation_id,
          operation_name: op.operation_name,
          operation_number: op.operation_number,
          status: op.status,
          machine_name: formatMachineName(op),
          production_logs: logs,
          stage_count: stages.length,
          rework_count: stages.reduce((n, g) => n + (g.reworkOutcomes?.length || 0), 0),
        };
      })
    : (selectedPart?.operations || []).map((op) => {
        const tracked = getTrackingOp(op.id);
        const logs = tracked?.production_logs || productionLogsData[op.id] || [];
        const stages = buildProductionStageTree(logs);
        return {
          id: op.id,
          operation_name: op.operation_name,
          operation_number: op.operation_number,
          status: tracked?.status || op.status || 'Not Started',
          machine_name: formatMachineName(tracked),
          production_logs: logs,
          stage_count: stages.length,
          rework_count: stages.reduce((n, g) => n + (g.reworkOutcomes?.length || 0), 0),
        };
      })
  ).slice().sort((a, b) => Number(a.operation_number || 0) - Number(b.operation_number || 0));

  const totalParts = partsData.length;
  const completedParts = partsData.filter((p) => p.status?.toLowerCase() === 'completed').length;
  const inProgressParts = partsData.filter((p) => ['in progress', 'started'].includes(p.status?.toLowerCase())).length;
  const pendingParts = partsData.filter((p) => ['not started', 'pending'].includes(p.status?.toLowerCase())).length;

  const totalOps = partsData.reduce((n, p) => n + (p.total_operations || 0), 0);
  const completedOps = partsData.reduce((n, p) => n + (p.completed_operations || 0), 0);
  const orderCompletion = orderTrackingData?.completion_percentage != null
    ? Math.round(orderTrackingData.completion_percentage)
    : pct(completedParts, totalParts);

  const filteredOrders = orders.filter((o) =>
    o.sale_order_number?.toLowerCase().includes(searchOrder.toLowerCase()),
  );

  const filteredParts = partsData
    .filter((p) => matchesPartStatusFilter(p, partStatusFilter))
    .filter((p) =>
      p.part_name?.toLowerCase().includes(searchPart.toLowerCase())
      || p.part_number?.toLowerCase().includes(searchPart.toLowerCase()),
    );

  const selectedOrderMeta = orders.find((o) => o.id === selectedOrderId);
  const dueDateLabel = orderTrackingData?.due_date
    ? String(orderTrackingData.due_date).slice(0, 10)
    : null;

  const kpiItems = [
    {
      key: 'all',
      label: 'Total Parts',
      value: totalParts,
      sub: `${orderCompletion}% order complete`,
      color: '#1677ff',
      icon: <AppstoreOutlined />,
      progress: orderCompletion,
    },
    {
      key: 'completed',
      label: 'Completed',
      value: completedParts,
      sub: `${pct(completedParts, totalParts)}% of parts`,
      color: '#52c41a',
      icon: <CheckCircleOutlined />,
      progress: pct(completedParts, totalParts),
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      value: inProgressParts,
      sub: `${pct(inProgressParts, totalParts)}% of parts`,
      color: '#1890ff',
      icon: <SyncOutlined />,
      progress: pct(inProgressParts, totalParts),
    },
    {
      key: 'pending',
      label: 'Pending',
      value: pendingParts,
      sub: `${pct(pendingParts, totalParts)}% of parts`,
      color: '#faad14',
      icon: <ClockCircleOutlined />,
      progress: pct(pendingParts, totalParts),
    },
  ];

  useEffect(() => {
    if (selectedPartId && !filteredParts.some((p) => p.part_id === selectedPartId)) {
      setSelectedPartId(null);
    }
  }, [filteredParts, selectedPartId]);

  useEffect(() => {
    setExpandedOpKeys([]);
  }, [selectedPartId]);

  const partsColumnsBase = useMemo(() => [
    {
      title: 'Part No',
      dataIndex: 'part_number',
      key: 'part_number',
      width: 110,
      ellipsis: true,
      render: (text) => <Text strong style={{ fontSize: 12, color: '#1890ff' }}>{text || '—'}</Text>,
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 150,
      ellipsis: true,
      render: (text) => <Text style={{ fontSize: 12 }} title={text}>{text || '—'}</Text>,
    },
    {
      title: 'Assembly',
      dataIndex: 'assembly_name',
      key: 'assembly_name',
      width: 140,
      ellipsis: true,
      render: (text) => (
        <Text style={{ fontSize: 11, color: '#595959' }} title={text}>{text || '—'}</Text>
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'qty',
      key: 'qty',
      width: 64,
      align: 'center',
    },
    {
      title: 'Progress',
      key: 'progress',
      width: 130,
      render: (_, record) => (
        <div style={{ width: '100%', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, gap: 4, marginBottom: 2 }}>
            <span>{record.completed_operations}/{record.total_operations} ops</span>
            <span>{Math.round(record.completion_percentage)}%</span>
          </div>
          <Progress
            percent={Math.round(record.completion_percentage)}
            showInfo={false}
            size="small"
            strokeColor={record.completion_percentage === 100 ? '#52c41a' : '#1890ff'}
          />
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[status?.toLowerCase()] || 'default'} style={{ fontSize: 10, margin: 0 }}>
          {status || 'Pending'}
        </Tag>
      ),
    },
  ], []);

  const operationsColumnsBase = useMemo(() => [
    {
      title: 'Op #',
      dataIndex: 'operation_number',
      key: 'operation_number',
      width: 64,
      align: 'center',
      fixed: 'left',
      render: (n) => <Text strong style={{ fontSize: 12 }}>{n ?? '—'}</Text>,
    },
    {
      title: 'Operation',
      dataIndex: 'operation_name',
      key: 'operation_name',
      width: 150,
      ellipsis: true,
      fixed: 'left',
      render: (text) => <Text style={{ fontSize: 12, color: '#333' }} title={text}>{text || '—'}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine_name',
      key: 'machine_name',
      width: 140,
      ellipsis: true,
      render: (text) => (
        <Text style={{ fontSize: 11, color: '#1677ff' }} title={text}>{text || '—'}</Text>
      ),
    },
    {
      title: 'Stages',
      key: 'stages',
      width: 100,
      align: 'center',
      render: (_, op) => {
        if (!op.stage_count) {
          return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>;
        }
        return (
          <Space size={4} wrap>
            <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>
              {op.stage_count} stage{op.stage_count !== 1 ? 's' : ''}
            </Tag>
            {op.rework_count > 0 && (
              <Tag color="orange" style={{ margin: 0, fontSize: 10 }}>
                {op.rework_count} RW
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Required',
      key: 'required',
      width: 80,
      align: 'center',
      render: () => <Text style={{ fontSize: 12, fontWeight: 500 }}>{selectedPart?.qty || 1}</Text>,
    },
    {
      title: 'Produced',
      key: 'produced',
      width: 80,
      align: 'center',
      render: (_, op) => {
        const { produced } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#1890ff', fontWeight: 'bold', fontSize: 12 }}>{produced}</Text>;
      },
    },
    {
      title: 'Approved',
      key: 'approved',
      width: 80,
      align: 'center',
      render: (_, op) => {
        const { approved } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: 12 }}>{approved}</Text>;
      },
    },
    {
      title: 'Rework',
      key: 'rework',
      width: 72,
      align: 'center',
      render: (_, op) => {
        const { rework } = getOpQtyTotals(op.production_logs);
        return <Text style={{ color: '#fa8c16', fontWeight: 'bold', fontSize: 12 }}>{rework}</Text>;
      },
    },
    {
      title: 'Rejected',
      key: 'rejected',
      width: 80,
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
      width: 110,
      align: 'center',
      render: (status) => (
        <Tag color={statusColors[String(status || '').toLowerCase()] || 'default'} style={{ fontSize: 10, margin: 0 }}>
          {status || 'Not Started'}
        </Tag>
      ),
    },
  ], [selectedPart?.qty]);

  const { columns: partsColumns, scrollX: partsScrollX } = useResizableColumns(
    partsColumnsBase,
    { storageKey: 'ot-parts-col-widths', minWidth: 56 },
  );
  const { columns: operationsColumns, scrollX: operationsScrollX } = useResizableColumns(
    operationsColumnsBase,
    { storageKey: 'ot-ops-col-widths', minWidth: 56 },
  );

  const ordersColumns = [
    {
      title: 'Sale Order',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      ellipsis: true,
      render: (text, record) => (
        <Text strong style={{ color: selectedOrderId === record.id ? '#1890ff' : '#262626', fontSize: 13 }}>
          {text}
        </Text>
      ),
    },
  ];

  return (
    <div className="order-tracking-root">
      {selectedOrderId && (
        <Card className="order-tracking-header" styles={{ body: { padding: '12px 14px' } }}>
          <div className="ot-kpi-top">
            <div className="ot-order-summary">
              <div className="ot-order-summary-main">
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                  ORDER
                </Text>
                <Text strong style={{ fontSize: 16, lineHeight: 1.2 }}>
                  {orderTrackingData?.sale_order_number || selectedOrderMeta?.sale_order_number || '—'}
                </Text>
                <div className="ot-order-meta">
                  {orderTrackingData?.customer_name && (
                    <span><UserOutlined /> {orderTrackingData.customer_name}</span>
                  )}
                  {orderTrackingData?.product_name && (
                    <span><ToolOutlined /> {orderTrackingData.product_name}</span>
                  )}
                  {dueDateLabel && (
                    <span><CalendarOutlined /> Due {dueDateLabel}</span>
                  )}
                  {orderTrackingData?.status && (
                    <Tag color={statusColors[String(orderTrackingData.status).toLowerCase()] || 'default'} style={{ margin: 0 }}>
                      {orderTrackingData.status}
                    </Tag>
                  )}
                </div>
              </div>
              <div className="ot-completion-ring">
                <Progress
                  type="circle"
                  percent={orderCompletion}
                  size={64}
                  strokeColor={{ '0%': '#69b1ff', '100%': '#1677ff' }}
                  format={(p) => (
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{p}%</span>
                  )}
                />
                <div className="ot-completion-caption">
                  <PercentageOutlined /> Completion
                  <div className="ot-completion-ops">{completedOps}/{totalOps} ops done</div>
                </div>
              </div>
            </div>
          </div>

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
                  <span className="ot-kpi-sub">{kpi.sub}</span>
                  <Progress
                    percent={kpi.progress}
                    showInfo={false}
                    size="small"
                    strokeColor={kpi.color}
                    style={{ marginTop: 4 }}
                  />
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
              <Table
                className="ot-fit-table"
                dataSource={filteredOrders}
                columns={ordersColumns}
                pagination={false}
                size="small"
                rowKey="id"
                showHeader
                onRow={(record) => ({
                  onClick: () => setSelectedOrderId(record.id),
                  style: {
                    cursor: 'pointer',
                    background: selectedOrderId === record.id ? '#e6f7ff' : undefined,
                  },
                })}
              />
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
            <Tooltip title="Drag column edges to resize">
              <Table
                className="ot-fit-table ot-resizable-table"
                dataSource={filteredParts}
                pagination={false}
                size="small"
                rowKey="part_id"
                loading={loading}
                scroll={{ x: partsScrollX }}
                columns={partsColumns}
                onRow={(record) => ({
                  onClick: () => setSelectedPartId(record.part_id),
                  style: {
                    cursor: 'pointer',
                    background: selectedPartId === record.part_id ? '#e6f7ff' : undefined,
                  },
                })}
              />
            </Tooltip>
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
              <Tooltip title="Drag column edges to resize · Expand a row to view stages">
                <Table
                  className="ot-fit-table ot-resizable-table"
                  dataSource={operationsForTable}
                  pagination={false}
                  size="small"
                  rowKey="id"
                  scroll={{ x: operationsScrollX }}
                  expandable={{
                    expandedRowKeys: expandedOpKeys,
                    onExpandedRowsChange: setExpandedOpKeys,
                    expandRowByClick: false,
                    expandIconColumnWidth: 32,
                    expandedRowRender: (record) => {
                      const logs = record.production_logs || [];
                      const visible = getVisibleStageLogs(logs);
                      if (!visible.length) {
                        return (
                          <div style={{ padding: 12, textAlign: 'center', color: '#999', background: '#fafafa' }}>
                            No production stages recorded
                          </div>
                        );
                      }
                      return <ProductionStagesPanel logs={logs} />;
                    },
                    rowExpandable: (record) => (record.production_logs || []).length > 0,
                  }}
                  columns={operationsColumns}
                />
              </Tooltip>
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
        .ot-kpi-top {
          margin-bottom: 10px;
        }
        .ot-order-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 4px 2px 10px;
          border-bottom: 1px solid #f0f0f0;
          margin-bottom: 10px;
        }
        .ot-order-summary-main {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .ot-order-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
          align-items: center;
          font-size: 12px;
          color: #595959;
        }
        .ot-order-meta span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .ot-completion-ring {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
        }
        .ot-completion-caption {
          font-size: 11px;
          color: #8c8c8c;
          font-weight: 600;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .ot-completion-ops {
          font-weight: 500;
          color: #595959;
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
          min-height: 88px;
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
          gap: 1px;
          min-width: 0;
          flex: 1;
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
        .ot-kpi-sub {
          font-size: 11px;
          color: #bfbfbf;
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
          display: flex !important;
          flex-direction: column;
          min-height: 0;
          overflow: hidden;
          height: 100%;
        }
        .order-tracking-panel .ant-card-body {
          flex: 1;
          min-height: 0;
        }
        .ot-panel-scroll {
          flex: 1;
          overflow: auto;
          min-height: 0;
        }
        .ot-ops-scroll .ant-table-wrapper {
          min-width: 0;
        }
        .ot-empty-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 180px;
          padding: 16px;
        }
        .ot-fit-table .ant-table-thead > tr > th {
          padding: 8px 10px !important;
          font-size: 11px;
          font-weight: 700;
          background: #fafafa !important;
          white-space: nowrap;
        }
        .ot-fit-table .ant-table-tbody > tr > td {
          padding: 8px 10px !important;
          font-size: 12px;
        }
        .ot-col-title {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          padding-right: 8px;
          user-select: none;
        }
        .ot-col-title-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .ot-col-resizer {
          position: absolute;
          right: -6px;
          top: -8px;
          bottom: -8px;
          width: 10px;
          cursor: col-resize;
          z-index: 2;
        }
        .ot-col-resizer::after {
          content: '';
          position: absolute;
          right: 4px;
          top: 20%;
          bottom: 20%;
          width: 2px;
          border-radius: 2px;
          background: transparent;
          transition: background 0.15s;
        }
        .ot-col-resizer:hover::after,
        .ot-col-resizer:active::after {
          background: #1677ff;
        }
        .ot-resizable-table .ant-table-thead > tr > th {
          position: relative;
        }
        @media (max-width: 1200px) {
          .order-tracking-grid {
            grid-template-columns: minmax(140px, 0.65fr) minmax(0, 1.1fr) minmax(0, 1.7fr);
          }
        }
        @media (max-width: 992px) {
          .order-tracking-grid {
            grid-template-columns: 1fr;
            overflow: auto;
          }
          .order-tracking-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .ot-order-summary {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @media (max-width: 576px) {
          .order-tracking-kpis { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
};

export default OrderTracking;
