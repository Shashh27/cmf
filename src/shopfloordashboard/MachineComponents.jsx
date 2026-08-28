import React, { useState } from 'react';
import { Card, Tag, Button, Space, Table, Modal, Row, Col, Empty, Input, Select, Typography, Tooltip, Tabs, Collapse, Segmented } from 'antd';
import {
  SettingOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  ShoppingCartOutlined,
  InfoCircleOutlined,
  ExpandOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  StopOutlined,
  SearchOutlined,
  ArrowLeftOutlined,
  PoweroffOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  RocketOutlined
} from '@ant-design/icons';
import { motion } from 'framer-motion';

const { Search } = Input;
const { Text } = Typography;
const { TabPane } = Tabs;
const { Panel } = Collapse;

// MachineCard Component
const MachineCard = ({ machine }) => {
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [activeKeys, setActiveKeys] = useState([]);

  // Group operations by parts
  const partsOperations = Array.isArray(machine.parts_operations) ? machine.parts_operations : [];
  const machineOrders = Array.isArray(machine.orders) ? machine.orders : [];

  const partsWithOperations = partsOperations.reduce((acc, op) => {
    if (!acc[op.part_id]) {
      acc[op.part_id] = {
        part_id: op.part_id,
        part_name: op.part_name,
        part_number: op.part_number,
        part_status: op.part_status,
        operations: [],
        sale_order_number: op.sale_order_number,
        order_id: op.order_id
      };
    }
    acc[op.part_id].operations.push({
      operation_id: op.operation_id,
      operation_name: op.operation_name,
      operation_number: op.operation_number,
      operation_status: op.operation_status
    });
    return acc;
  }, {});

  const partsList = Object.values(partsWithOperations);

  // Group parts by order
  const ordersWithParts = machineOrders.reduce((acc, order) => {
    const orderParts = partsList.filter(part => part.order_id === order.order_id);
    if (orderParts.length > 0) {
      acc.push({
        ...order,
        parts: orderParts
      });
    }
    return acc;
  }, []);

  const getStatusColor = (status) => {
    const statusColors = {
      'Running': 'success',
      'In Operation': 'processing',
      'Idle': 'default',
      'Stopped': 'error',
      'Maintenance': 'warning',
      'Not Started': 'default',
      'Pending': 'default',
      'In Progress': 'processing',
      'Completed': 'success',
      'active': 'success',
      'inactive': 'default',
      'pending': 'default',
      'inprogress': 'processing'
    };
    return statusColors[status] || 'default';
  };

  const getMachineStatusColor = (status) => {
    const statusColors = {
      'off': '#6b7c8f',
      'on': '#f59e0b',
      'idle': '#f59e0b',
      'production': '#22c55e',
      'Running': '#22c55e',
      'In Operation': '#22c55e',
      'Idle': '#f59e0b',
      'Stopped': '#6b7c8f',
      'Maintenance': '#ef4444',
      'maintenance': '#ef4444'
    };
    return statusColors[status] || '#d9d9d9';
  };

  const getMachineStatusIcon = (status) => {
    const statusIcons = {
      'off': <PoweroffOutlined />,
      'on': <PlayCircleOutlined />,
      'idle': <PauseCircleOutlined />,
      'production': <RocketOutlined />,
      'maintenance': <ToolOutlined />,
    };
    return statusIcons[status] || <InfoCircleOutlined />;
  };

  const getMachineStatusText = (status) => {
    const statusTexts = {
      'off': 'OFF',
      'on': 'IDLE',
      'idle': 'IDLE',
      'production': 'PRODUCTION',
      'maintenance': 'MAINTENANCE',
    };
    return statusTexts[status] || 'UNKNOWN';
  };

  const getStatusIcon = (status) => {
    const statusIcons = {
    
      'Not Started': <ClockCircleOutlined />,
      'Pending': <ClockCircleOutlined />,
      'In Progress': <SyncOutlined spin />,
      'Completed': <CheckCircleOutlined />,
      'active': <CheckCircleOutlined />,
      'inactive': <ClockCircleOutlined />,
      'pending': <ClockCircleOutlined />,
      'inprogress': <SyncOutlined spin />
    };
    return statusIcons[status] || <InfoCircleOutlined />;
  };

  const getMachineLoadPercentage = () => {
    if (machine.total_orders === 0) return 0;
    return Math.min((machine.total_orders * 20), 100);
  };

  const operationColumns = [
    {
      title: '#',
      dataIndex: 'operation_number',
      key: 'operation_number',
      width: 60,
      render: (text) => <Tag color="blue">{text}</Tag>
    },
    {
      title: 'Operation',
      dataIndex: 'operation_name',
      key: 'operation_name',
      render: (text) => (
        <Space>
          <ToolOutlined style={{ color: '#1890ff' }} />
          <span>{text}</span>
        </Space>
      )
    },
    {
      title: 'Status',
      dataIndex: 'operation_status',
      key: 'operation_status',
      width: 120,
      render: (status) => (
        <Tag color={getStatusColor(status.status)} icon={getStatusIcon(status.status)} style={{ fontSize: 11 }}>
          {status.status || 'Pending'}
        </Tag>
      )
    }
  ];

  const orderColumns = [
    {
      title: 'Order Number',
      dataIndex: 'sale_order_number',
      key: 'sale_order_number',
      render: (text) => (
        <Space>
          <ShoppingCartOutlined style={{ color: '#722ed1' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
      )
    },
    {
      title: 'Product',
      dataIndex: 'product_name',
      key: 'product_name'
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity'
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={getStatusColor(status)}>{status}</Tag>
      )
    }
  ];

  return (
    <>
      <Card
          hoverable
          style={{
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            border: `2px solid ${getMachineStatusColor(machine.machine_status?.status || 'off')}`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            overflow: 'hidden'
          }}
          styles={{ body: { padding: '8px', flex: 1, display: 'flex', flexDirection: 'column', height: '140px' } }}
        >
          {/* Status Indicator */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            background: getMachineStatusColor(machine.machine_status?.status || 'off'),
            padding: '4px 8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}>
            <span style={{
              color: 'white',
              fontSize: '10px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {getMachineStatusIcon(machine.machine_status?.status || 'off')}
              {getMachineStatusText(machine.machine_status?.status || 'off')}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', marginTop: '20px' }}>
            <div style={{ marginBottom: 6, height: '40px', overflow: 'hidden' }}>
              <Space style={{ width: '100%' }}>
                <SettingOutlined style={{ fontSize: '12px', color: '#1890ff', flexShrink: 0 }} />
                <Tooltip title={`${machine.machine_make || ''} ${machine.machine_model || ''}`.trim()}>
                  <span style={{ 
                    fontSize: '12px', 
                    fontWeight: 600, 
                    color: '#262626',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 'calc(100% - 20px)'
                  }}>
                    {[machine.machine_make, machine.machine_model].filter(Boolean).join(' ') || 'Unknown Machine'}
                  </span>
                </Tooltip>
              </Space>
              <Tooltip title={`${machine.machine_type} • ${machine.work_center || 'N/A'}`}>
                <div style={{ 
                  fontSize: '10px', 
                  color: '#8c8c8c', 
                  marginTop: 2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {machine.machine_type} • {machine.work_center || 'N/A'}
                </div>
              </Tooltip>
            </div>

            <div style={{
              display: 'flex',
              gap: 4,
              marginBottom: 6,
              height: '50px'
            }}>
              <div style={{
                flex: 1,
                background: '#fafafa',
                padding: '4px',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 600, color: '#262626' }}>
                  {machine.total_orders || 0}
                </div>
                <div style={{ fontSize: 'clamp(8px, 1.2vw, 10px)', color: '#8c8c8c' }}>Orders</div>
              </div>
              <div style={{
                flex: 1,
                background: '#fafafa',
                padding: '4px',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 600, color: '#262626' }}>
                  {partsList.length}
                </div>
                <div style={{ fontSize: 'clamp(8px, 1.2vw, 10px)', color: '#8c8c8c' }}>Parts</div>
              </div>
              <div style={{
                flex: 1,
                background: '#fafafa',
                padding: '4px',
                borderRadius: '4px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 'clamp(12px, 2.5vw, 14px)', fontWeight: 600, color: '#262626' }}>
                  {machine.total_operations || 0}
                </div>
                <div style={{ fontSize: 'clamp(8px, 1.2vw, 10px)', color: '#8c8c8c' }}>Operations</div>
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <Button
                block
                icon={<ExpandOutlined />}
                onClick={() => setDrawerVisible(true)}
                style={{
                  height: '24px',
                  borderRadius: '4px',
                  fontWeight: 500,
                  fontSize: '11px'
                }}
              >
                View Details
              </Button>
            </div>
          </div>
        </Card>

        <Modal
          title={<span style={{ fontWeight: 600, fontSize: 16 }}>{[machine.machine_make, machine.machine_model].filter(Boolean).join(' ') || 'Machine Details'}</span>}
          open={drawerVisible}
          onCancel={() => setDrawerVisible(false)}
          footer={null}
          width={{ xs: '95%', sm: '80%', md: '70%', lg: '60%', xl: '50%' }}
          style={{ top: 10 }}
        >
          {ordersWithParts.length > 0 ? (
          <Tabs
            defaultActiveKey="0"
            size="small"
            onChange={() => setActiveKeys([])}
            items={ordersWithParts.map((order, index) => ({
              key: index.toString(),
              label: (
                <Space size={4}>
                  <ShoppingCartOutlined style={{ fontSize: 12 }} />
                  <span style={{ fontSize: 12 }}>{order.sale_order_number}</span>
                  <Tag color={getStatusColor(order.status)} style={{ fontSize: 10, margin: 0 }}>{order.status}</Tag>
                </Space>
              ),
              children: (
                <div style={{ padding: '12px 0' }}>
                  <div style={{
                    background: '#f5f5f5',
                    borderRadius: 6,
                    padding: 10,
                    marginBottom: 12
                  }}>
                    <Space size={12}>
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                        Product: {order.product_name}
                      </span>
                      <span style={{ fontSize: 12, color: '#8c8c8c' }}>
                        Quantity: {order.quantity}
                      </span>
                    </Space>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#595959' }}>
                      Parts ({order.parts.length})
                    </span>
                    <Space size={4}>
                      <Button
                        type="link"
                        size="small"
                        style={{ fontSize: 10, padding: '0 4px', height: 'auto' }}
                        onClick={() => setActiveKeys(order.parts.map(p => p.part_id))}
                      >
                        Expand All
                      </Button>
                      <Button
                        type="link"
                        size="small"
                        style={{ fontSize: 10, padding: '0 4px', height: 'auto' }}
                        onClick={() => setActiveKeys([])}
                      >
                        Collapse All
                      </Button>
                    </Space>
                  </div>

                  <Collapse
                    activeKey={activeKeys}
                    onChange={setActiveKeys}
                    size="small"
                    style={{ background: 'transparent', border: 'none' }}
                    items={order.parts.map((part, partIndex) => ({
                      key: part.part_id,
                      label: (
                        <Space size={6}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#1890ff',
                            background: '#e6f7ff',
                            padding: '2px 4px',
                            borderRadius: 3
                          }}>
                            {part.part_number}
                          </span>
                          <span style={{ fontWeight: 500, fontSize: 11, color: '#262626' }}>
                            {part.part_name}
                          </span>
                          <Tag
                            color={getStatusColor(part.part_status.status)}
                            style={{ fontSize: 9 }}
                          >
                            {part.part_status.status || 'Not Started'}
                          </Tag>
                          <span style={{ fontSize: 10, color: '#8c8c8c' }}>
                            ({part.operations.length} ops)
                          </span>
                        </Space>
                      ),
                      children: (
                        <Table
                          dataSource={part.operations}
                          columns={operationColumns}
                          pagination={false}
                          size="small"
                          rowKey="operation_id"
                          style={{ marginTop: 8 }}
                        />
                      )
                    }))}
                  />
                </div>
              )
            }))}
          />
          ) : (
            <div style={{ padding: '8px 0 0' }}>
              <div style={{ background: '#f5f5f5', borderRadius: 6, padding: 12 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  <div><strong>Status:</strong> {getMachineStatusText(machine.machine_status?.status || 'off')}</div>
                  <div><strong>Work Center:</strong> {machine.work_center || 'N/A'}</div>
                  <div><strong>Type:</strong> {machine.machine_type || 'N/A'}</div>
                  <div><strong>Order:</strong> {machine.orders?.[0]?.sale_order_number || 'N/A'}</div>
                  <div><strong>Part:</strong> {partsOperations[0]?.part_number || 'N/A'}</div>
                  <div><strong>Operation:</strong> {partsOperations[0]?.operation_name || 'N/A'}</div>
                </Space>
              </div>
            </div>
          )}
        </Modal>
    </>
  );
};

// Blueprint Layout Definition based on CAD Shop Floor Layout
const LAYOUT_DEFINITION = [
  // Turning centre (Top-Left Box)
  { id: 'tekcel', name: 'Tekcel', section: 'Turning centre', x: 195, y: 195, w: 34, h: 135, isVertical: true, labelX: 182, labelY: 265, icon: 'gear' },
  { id: 'stc25', name: 'STC 25', section: 'Turning centre', x: 275, y: 180, w: 80, h: 55, icon: 'gear', labelX: 315, labelY: 252 },
  { id: 'pinacho225', name: 'Pinacho 225', section: 'Turning centre', x: 380, y: 180, w: 80, h: 55, icon: 'gear_knob', labelX: 420, labelY: 252 },
  { id: 'mazak', name: 'Mazak SBT 10M', section: 'Turning centre', x: 265, y: 295, w: 75, h: 60, icon: 'gear_dial', labelX: 302, labelY: 372, lines: ['Mazak SBT', '10M'] },
  { id: 'stallion', name: 'Stallion 200', section: 'Turning centre', x: 360, y: 295, w: 75, h: 60, icon: 'gear_dial', labelX: 397, labelY: 372, lines: ['Stallion', '200'] },
  { id: 'tc46mc', name: 'TC-46-MC', section: 'Turning centre', x: 455, y: 295, w: 75, h: 60, icon: 'gear_dial', labelX: 492, labelY: 372 },

  // Milling centre (Top-Right Box) - Top Row
  { id: 'bfw', name: 'BFW BMV-50', section: 'Milling centre', x: 665, y: 150, w: 55, h: 46, icon: 'gear_keypad', labelX: 692, labelY: 210, lines: ['BFW', 'BMV-50'] },
  { id: 'mitsubishi', name: 'Mitsubishi MVSC', section: 'Milling centre', x: 735, y: 150, w: 55, h: 46, icon: 'gear_keypad', labelX: 762, labelY: 210, lines: ['Mitsubishi', 'MVSC'] },
  { id: 'mikron', name: 'Mikron WF41C', section: 'Milling centre', x: 805, y: 150, w: 55, h: 46, icon: 'gear_keypad', labelX: 832, labelY: 210, lines: ['Mikron', 'WF41C'] },
  { id: 'dmu1', name: 'DMU 1', displayName: 'DMU', section: 'Milling centre', x: 875, y: 150, w: 55, h: 46, icon: 'screen', labelX: 902, labelY: 210 },
  { id: 'dmu2', name: 'DMU 2', displayName: 'DMU', section: 'Milling centre', x: 945, y: 150, w: 55, h: 46, icon: 'screen', labelX: 972, labelY: 210 },

  // Milling centre (Top-Right Box) - Bottom Row
  { id: 'dmu125u', name: 'DMU 125U Deckel MAHO', section: 'Milling centre', x: 650, y: 280, w: 55, h: 52, icon: 'screen_gear_keypad', labelX: 677, labelY: 348, lines: ['DMU', '125U', 'Deckel', 'MAHO'] },
  { id: 'ams850', name: 'AMS 850 ACE Micromatic', section: 'Milling centre', x: 720, y: 280, w: 55, h: 52, icon: 'curved_screen_keypad', labelX: 747, labelY: 348, lines: ['AMS', '850', 'ACE', 'Micromatic'] },
  { id: 'wh10cnc', name: 'WH10CNC Vivens 800RF TOS', section: 'Milling centre', x: 790, y: 280, w: 55, h: 52, icon: 'knobs_screen_keypad', labelX: 817, labelY: 348, lines: ['WH10CNC', 'Vivens 800RF', 'TOS'] },

  // EDM Room (Top-Right Corner)
  { id: 'ona_qxsf', name: 'ONA-QXSF', section: 'EDM Room', x: 875, y: 35, w: 185, h: 65, isRoom: true, labelX: 967, labelY: 60, lines: ['EDM Room', 'ONA-QXSF'] },

  // Grinding Room (Bottom-Left Box) - Sub-partition 1 (Left)
  { id: 'schaublin1', name: 'Schaublin 125 I', section: 'Grinding Room', x: 105, y: 640, w: 48, h: 36, icon: 'gear', labelX: 129, labelY: 624, lines: ['Schaublin', '125 I'], labelAbove: true },
  { id: 'schaublin2', name: 'Schaublin 125 II', section: 'Grinding Room', x: 185, y: 640, w: 48, h: 36, icon: 'gear', labelX: 209, labelY: 624, lines: ['Schaublin', '125 II'], labelAbove: true },
  { id: 'horder', name: 'Horder-5-devlieg', section: 'Grinding Room', x: 75, y: 690, w: 32, h: 60, isVertical: true, labelX: 115, labelY: 730, lines: ['Horder-5-devlieg'] },

  // Grinding Room (Bottom-Left Box) - Sub-partition 2 (Right)
  { id: 'voumand', name: 'Voumand', section: 'Grinding Room', x: 280, y: 580, w: 50, h: 38, icon: 'gear', labelX: 305, labelY: 564, labelAbove: true },
  { id: 'magerle', name: 'Magerle', section: 'Grinding Room', x: 380, y: 580, w: 50, h: 38, icon: 'gear', labelX: 405, labelY: 564, labelAbove: true },
  { id: 'kellenberger', name: 'Kellenberger', section: 'Grinding Room', x: 280, y: 690, w: 50, h: 38, icon: 'gear_keypad', labelX: 305, labelY: 742, lines: ['Kellenberger'] },
  { id: 'studer', name: '"Studer RHV 650', section: 'Grinding Room', x: 380, y: 685, w: 50, h: 38, icon: 'gear_keypad', labelX: 405, labelY: 738, lines: ['"Studer RHV', '650'] },

  // Thread Grinding Room (Middle Bottom)
  { id: 'thread_grinding', name: 'Thread Grinding Room', section: 'Thread Grinding Room', x: 515, y: 540, w: 52, h: 52, isRoom: true, labelX: 541, labelY: 610, lines: ['Thread', 'Grinding', 'Room'] }
];

// Helper to render interior machine detail icons inside blueprint machine boxes
const MachineIconContent = ({ type, x, y, w, h }) => {
  const strokeColor = '#2a2b2e';
  const strokeWidth = 1.2;

  switch (type) {
    case 'gear':
      return (
        <g>
          <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.22} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <path
            d={`M ${x + w / 2 - 2} ${y + h / 2 - Math.min(w, h) * 0.32} h 4 v ${Math.min(w, h) * 0.64} h -4 z
               M ${x + w / 2 - Math.min(w, h) * 0.32} ${y + h / 2 - 2} v 4 h ${Math.min(w, h) * 0.64} v -4 z`}
            fill={strokeColor}
            opacity="0.85"
          />
        </g>
      );

    case 'gear_knob':
      return (
        <g>
          <circle cx={x + w / 2} cy={y + h * 0.4} r={Math.min(w, h) * 0.22} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <path
            d={`M ${x + w / 2 - 2} ${y + h * 0.4 - 10} h 4 v 20 h -4 z M ${x + w / 2 - 10} ${y + h * 0.4 - 2} v 4 h 20 v -4 z`}
            fill={strokeColor}
            opacity="0.8"
          />
          {/* knob graphic at bottom left */}
          <circle cx={x + 10} cy={y + h - 10} r="3" fill="none" stroke={strokeColor} strokeWidth="1" />
          <circle cx={x + 18} cy={y + h - 10} r="3" fill="none" stroke={strokeColor} strokeWidth="1" />
          <line x1={x + 24} y1={y + h - 14} x2={x + 24} y2={y + h - 6} stroke={strokeColor} strokeWidth="1.2" />
        </g>
      );

    case 'gear_dial':
      return (
        <g>
          <circle cx={x + w / 2} cy={y + h * 0.42} r={Math.min(w, h) * 0.2} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <path
            d={`M ${x + w / 2 - 2} ${y + h * 0.42 - 8} h 4 v 16 h -4 z M ${x + w / 2 - 8} ${y + h * 0.42 - 2} v 4 h 16 v -4 z`}
            fill={strokeColor}
            opacity="0.8"
          />
          {/* control dials */}
          <circle cx={x + 10} cy={y + h - 9} r="2.5" fill="none" stroke={strokeColor} strokeWidth="1" />
          <circle cx={x + 17} cy={y + h - 9} r="2.5" fill="none" stroke={strokeColor} strokeWidth="1" />
        </g>
      );

    case 'gear_keypad':
      return (
        <g>
          <circle cx={x + w * 0.4} cy={y + h / 2} r={Math.min(w, h) * 0.2} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <path
            d={`M ${x + w * 0.4 - 1.5} ${y + h / 2 - 7} h 3 v 14 h -3 z M ${x + w * 0.4 - 7} ${y + h / 2 - 1.5} v 3 h 14 v -3 z`}
            fill={strokeColor}
            opacity="0.8"
          />
          {/* keypad grid right */}
          <rect x={x + w - 16} y={y + 8} width="10" height="14" fill="none" stroke={strokeColor} strokeWidth="1" />
          <line x1={x + w - 16} y1={y + 12.5} x2={x + w - 6} y2={y + 12.5} stroke={strokeColor} strokeWidth="0.7" />
          <line x1={x + w - 16} y1={y + 17} x2={x + w - 6} y2={y + 17} stroke={strokeColor} strokeWidth="0.7" />
          <line x1={x + w - 12.5} y1={y + 8} x2={x + w - 12.5} y2={y + 22} stroke={strokeColor} strokeWidth="0.7" />
          <line x1={x + w - 9.5} y1={y + 8} x2={x + w - 9.5} y2={y + 22} stroke={strokeColor} strokeWidth="0.7" />
        </g>
      );

    case 'screen':
      return (
        <g>
          <rect x={x + 8} y={y + 6} width={w - 16} height={h - 12} rx="2" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <rect x={x + w - 12} y={y + 10} width="6" height={h - 20} fill="none" stroke={strokeColor} strokeWidth="1" />
        </g>
      );

    case 'screen_gear_keypad':
      return (
        <g>
          <rect x={x + 6} y={y + 6} width={w - 20} height={h - 12} rx="2" fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <circle cx={x + (w - 20) / 2 + 3} cy={y + h / 2} r="5" fill="none" stroke={strokeColor} strokeWidth="1" />
          <rect x={x + w - 12} y={y + 8} width="8" height={h - 16} fill="none" stroke={strokeColor} strokeWidth="1" />
        </g>
      );

    case 'curved_screen_keypad':
      return (
        <g>
          <path d={`M ${x + 6} ${y + 8} Q ${x + 18} ${y + 6} ${x + w - 18} ${y + 8} v ${h - 16} H ${x + 6} Z`} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
          <rect x={x + w - 14} y={y + 8} width="8" height={h - 16} fill="none" stroke={strokeColor} strokeWidth="1" />
        </g>
      );

    case 'knobs_screen_keypad':
      return (
        <g>
          {/* knobs left */}
          <circle cx={x + 7} cy={y + 10} r="2" fill="none" stroke={strokeColor} strokeWidth="1" />
          <circle cx={x + 7} cy={y + 17} r="2" fill="none" stroke={strokeColor} strokeWidth="1" />
          <circle cx={x + 7} cy={y + 24} r="2" fill="none" stroke={strokeColor} strokeWidth="1" />
          <circle cx={x + 7} cy={y + 31} r="2" fill="none" stroke={strokeColor} strokeWidth="1" />
          {/* screen right */}
          <rect x={x + 15} y={y + 8} width={w - 20} height={h - 16} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
        </g>
      );

    default:
      return null;
  }
};

// Blueprint CAD Shop Floor Component
const BlueprintLayout = ({ liveMachines, searchText, statusFilter, onSelectMachine }) => {
  const [hoveredId, setHoveredId] = useState(null);

  // Map live machine status to layout definition item
  const getMachineData = (layoutItem) => {
    const matchedLive = (liveMachines || []).find(m => {
      const name = (m.machine_make || m.machine_name || '').toLowerCase();
      const itemTitle = layoutItem.name.toLowerCase();
      return name.includes(itemTitle) || itemTitle.includes(name);
    });

    const rawStatus = matchedLive?.machine_status?.status || 'idle';
    const status = rawStatus === 'production' || rawStatus === 'running' ? 'production' :
                   rawStatus === 'idle' || rawStatus === 'on' ? 'idle' :
                   rawStatus === 'maintenance' ? 'maintenance' : 'off';

    const matchesSearch = !searchText ||
      layoutItem.name.toLowerCase().includes(searchText.toLowerCase()) ||
      layoutItem.section.toLowerCase().includes(searchText.toLowerCase());

    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return {
      live: matchedLive || {
        machine_id: layoutItem.id,
        machine_make: layoutItem.name,
        machine_type: layoutItem.section,
        work_center: layoutItem.section,
        machine_status: { status },
        total_orders: 1,
        total_operations: 1
      },
      status,
      isDimmed: (!matchesSearch || !matchesStatus),
      isHighlighted: Boolean(searchText) && matchesSearch && matchesStatus
    };
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'production': return '#22c55e';
      case 'idle': return '#f59e0b';
      case 'maintenance': return '#ef4444';
      default: return '#9ca3af';
    }
  };

  return (
    <div style={{
      width: '100%',
      overflowX: 'auto',
      background: '#fbf8ee',
      borderRadius: '8px',
      border: '2px solid #2a2b2e',
      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      padding: '16px',
      position: 'relative'
    }}>
      <svg
        viewBox="0 0 1160 820"
        style={{ width: '100%', height: 'auto', display: 'block', minWidth: '850px' }}
      >
        {/* Outer Frame with Blueprint CAD Rulers */}
        <rect x="15" y="15" width="1130" height="790" fill="none" stroke="#2a2b2e" strokeWidth="2.5" />
        <rect x="23" y="23" width="1114" height="774" fill="none" stroke="#2a2b2e" strokeWidth="1" strokeDasharray="6,4" />

        {/* Blueprint Ticks along edge */}
        <line x1="580" y1="15" x2="580" y2="23" stroke="#2a2b2e" strokeWidth="2" />
        <line x1="580" y1="805" x2="580" y2="797" stroke="#2a2b2e" strokeWidth="2" />
        <line x1="15" y1="410" x2="23" y2="410" stroke="#2a2b2e" strokeWidth="2" />
        <line x1="1145" y1="410" x2="1137" y2="410" stroke="#2a2b2e" strokeWidth="2" />

        {/* SECTION 1: Turning centre (Top Left Box) */}
        <g id="section-turning">
          <text x="360" y="105" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Turning centre
          </text>
          <rect x="120" y="120" width="480" height="310" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
        </g>

        {/* SECTION 2: Milling centre (Top Right Box) */}
        <g id="section-milling">
          <text x="830" y="105" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Milling centre
          </text>
          {/* Gear with checkmark icon next to Milling title */}
          <g transform="translate(905, 87)">
            <circle cx="12" cy="12" r="10" fill="none" stroke="#2a2b2e" strokeWidth="1.8" />
            <path d="M 8 12 L 11 15 L 17 9" fill="none" stroke="#2a2b2e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <rect x="635" y="120" width="475" height="310" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
          {/* Blank White Reserved Slot in Milling centre */}
          <rect x="855" y="280" width="235" height="52" fill="#ffffff" stroke="#e0e0e0" strokeWidth="1" rx="4" />
        </g>

        {/* SECTION 3: EDM Room (Top Right Corner Box) */}
        <g id="section-edm">
          <rect x="875" y="35" width="185" height="65" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
        </g>

        {/* SECTION 4: Grinding Room (Bottom Left Box) */}
        <g id="section-grinding">
          <text x="265" y="525" textAnchor="middle" fontSize="22" fontWeight="700" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Grinding Room
          </text>
          <rect x="45" y="540" width="440" height="230" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
          {/* Sub-partition 1 (Left Room) */}
          <rect x="55" y="550" width="200" height="210" fill="none" stroke="#2a2b2e" strokeWidth="1.5" />
          {/* Sub-partition 2 (Right Room) */}
          <rect x="255" y="550" width="220" height="210" fill="none" stroke="#2a2b2e" strokeWidth="1.5" />
        </g>

        {/* SECTION 5: Thread Grinding Room (Middle Bottom Box) */}
        <g id="section-thread-grinding">
          <rect x="515" y="540" width="52" height="52" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
          <text x="541" y="612" textAnchor="middle" fontSize="15" fontWeight="600" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Thread
          </text>
          <text x="541" y="630" textAnchor="middle" fontSize="15" fontWeight="600" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Grinding
          </text>
          <text x="541" y="648" textAnchor="middle" fontSize="15" fontWeight="600" fontFamily="Inter, sans-serif" fill="#1a1a1a">
            Room
          </text>
        </g>

        {/* SECTION 6: Title Block Table Grid (Bottom Right Corner) */}
        <g id="section-title-block">
          <rect x="690" y="640" width="420" height="130" fill="#faf8f0" stroke="#2a2b2e" strokeWidth="2" />
          {/* Table Grid Lines */}
          <line x1="690" y1="666" x2="1110" y2="666" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="690" y1="692" x2="1110" y2="692" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="690" y1="718" x2="1110" y2="718" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="690" y1="744" x2="1110" y2="744" stroke="#2a2b2e" strokeWidth="1.2" />

          <line x1="774" y1="640" x2="774" y2="770" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="858" y1="640" x2="858" y2="770" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="942" y1="640" x2="942" y2="770" stroke="#2a2b2e" strokeWidth="1.2" />
          <line x1="1026" y1="640" x2="1026" y2="770" stroke="#2a2b2e" strokeWidth="1.2" />
        </g>

        {/* MACHINE ELEMENTS RENDER */}
        {LAYOUT_DEFINITION.map((item) => {
          const { live, status, isDimmed, isHighlighted } = getMachineData(item);
          const isHovered = hoveredId === item.id;
          const badgeColor = getStatusBadgeColor(status);

          return (
            <g
              key={item.id}
              style={{
                cursor: 'pointer',
                opacity: isDimmed ? 0.35 : 1,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelectMachine(live)}
            >
              {/* Machine Box Rect */}
              <rect
                x={item.x}
                y={item.y}
                width={item.w}
                height={item.h}
                fill={isHovered ? '#e3f2fd' : isHighlighted ? '#fef08a' : '#faf8f0'}
                stroke={isHovered ? '#1890ff' : isHighlighted ? '#ca8a04' : '#2a2b2e'}
                strokeWidth={isHovered ? '2.5' : '1.8'}
                rx="2"
              />

              {/* Machine Interior Drawings */}
              {item.icon && <MachineIconContent type={item.icon} x={item.x} y={item.y} w={item.w} h={item.h} />}

              {/* Live Status Indicator Badge (Dot) */}
              <circle
                cx={item.x + item.w - 7}
                cy={item.y + 7}
                r="4.5"
                fill={badgeColor}
                stroke="#ffffff"
                strokeWidth="1.2"
              />

              {/* Machine Label Text */}
              {!item.isRoom && (
                item.lines ? (
                  <text x={item.labelX} y={item.labelY} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" fontWeight="600" fill="#1a1a1a">
                    {item.lines.map((line, idx) => (
                      <tspan key={idx} x={item.labelX} dy={idx === 0 ? 0 : 14}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                ) : (
                  <text
                    x={item.labelX}
                    y={item.labelY}
                    textAnchor={item.isVertical ? 'end' : 'middle'}
                    fontFamily="Inter, sans-serif"
                    fontSize={item.isVertical ? '16' : '14'}
                    fontWeight="600"
                    fill="#1a1a1a"
                  >
                    {item.displayName || item.name}
                  </text>
                )
              )}

              {/* Room Text Labels (for EDM & Thread Grinding) */}
              {item.isRoom && item.lines && (
                <text x={item.labelX} y={item.labelY} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="16" fontWeight="600" fill="#1a1a1a">
                  {item.lines.map((line, idx) => (
                    <tspan key={idx} x={item.labelX} dy={idx === 0 ? 0 : 20}>
                      {line}
                    </tspan>
                  ))}
                </text>
              )}

              {/* Hover Tooltip Overlay */}
              {isHovered && (
                <g transform={`translate(${item.x + item.w / 2 - 60}, ${item.y - 40})`}>
                  <rect x="0" y="0" width="120" height="32" rx="4" fill="#1e293b" opacity="0.95" />
                  <text x="60" y="16" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="600">
                    {item.displayName || item.name}
                  </text>
                  <text x="60" y="27" textAnchor="middle" fill={badgeColor} fontSize="9" fontWeight="700">
                    STATUS: {status.toUpperCase()}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// MachineGrid Component
const MachineGrid = ({ machines, onBack }) => {
  const [searchText, setSearchText] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [layoutMode, setLayoutMode] = React.useState('cards'); // 'blueprint' or 'cards'
  const [selectedMachine, setSelectedMachine] = React.useState(null);

  const machinesWithStatus = machines.map(machine => ({
    ...machine,
    machine_status: {
      ...machine.machine_status,
      status: machine.machine_status?.status || 'off'
    }
  }));

  const filteredMachines = machinesWithStatus.filter(machine => {
    const matchesSearch =
      machine.machine_make?.toLowerCase().includes(searchText.toLowerCase()) ||
      machine.machine_model?.toLowerCase().includes(searchText.toLowerCase()) ||
      machine.machine_type?.toLowerCase().includes(searchText.toLowerCase()) ||
      machine.work_center?.toLowerCase().includes(searchText.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      machine.machine_status.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusOptions = [
    { label: 'All', value: 'all' },
    { label: 'IDLE', value: 'idle' },
    { label: 'OFF', value: 'off' },
    { label: 'PRODUCTION', value: 'production' },
    { label: 'MAINTENANCE', value: 'maintenance' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      <div style={{
        marginBottom: 12,
        padding: '12px',
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <Space wrap style={{ flex: 1 }}>
          <Search
            placeholder="Search machine (e.g., Mazak, BFW, Schaublin)"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: '260px' }}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Select
            placeholder="Filter by status"
            style={{ width: '150px' }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
          />
          <Text type="secondary" style={{ fontSize: '12px' }}>
            Showing {filteredMachines.length} of {machinesWithStatus.length} machines
          </Text>
        </Space>

        <Segmented
          value={layoutMode}
          onChange={setLayoutMode}
          options={[
            { label: 'CAD Blueprint View', value: 'blueprint' },
            { label: 'Machine Cards View', value: 'cards' }
          ]}
          style={{ background: '#f0f0f0' }}
        />
      </div>

      {layoutMode === 'blueprint' ? (
        <BlueprintLayout
          liveMachines={machinesWithStatus}
          searchText={searchText}
          statusFilter={statusFilter}
          onSelectMachine={(m) => setSelectedMachine(m)}
        />
      ) : filteredMachines.length === 0 ? (
        <div style={{
          padding: '40px',
          background: 'white',
          borderRadius: 8,
          textAlign: 'center'
        }}>
          <Empty
            description={
              searchText || statusFilter !== 'all'
                ? 'No machines match your filters'
                : 'No machines available'
            }
          />
        </div>
      ) : (
        <Row gutter={[8, 8]} align="stretch">
          {filteredMachines.map((machine, index) => (
            <Col xs={12} sm={8} md={6} lg={4} xl={3} key={machine.machine_id} style={{ height: '100%' }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                style={{ height: '100%' }}
              >
                <MachineCard machine={machine} />
              </motion.div>
            </Col>
          ))}
        </Row>
      )}

      {/* Selected machine modal when clicked from blueprint */}
      {selectedMachine && (
        <MachineCard machine={selectedMachine} />
      )}
    </motion.div>
  );
};

export { MachineCard, MachineGrid };
export default MachineGrid;

