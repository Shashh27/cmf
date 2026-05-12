import React, { useState } from 'react';
import { Card, Tag, Button, Space, Table, Modal, Row, Col, Empty, Input, Select, Typography, Tooltip, Tabs, Collapse } from 'antd';
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
  const partsWithOperations = machine.parts_operations.reduce((acc, op) => {
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
  const ordersWithParts = machine.orders.reduce((acc, order) => {
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
      'off': '#ff4d4f',
      'on': '#52c41a', 
      'idle': '#faad14',
      'production': '#1890ff',
      'Running': '#52c41a',
      'In Operation': '#1890ff',
      'Idle': '#faad14',
      'Stopped': '#ff4d4f',
      'Maintenance': '#fa8c16'
    };
    return statusColors[status] || '#d9d9d9';
  };

  const getMachineStatusIcon = (status) => {
    const statusIcons = {
      'off': <PoweroffOutlined />,
      'on': <PlayCircleOutlined />,
      'idle': <PauseCircleOutlined />,
      'production': <RocketOutlined />,
      
    };
    return statusIcons[status] || <InfoCircleOutlined />;
  };

  const getMachineStatusText = (status) => {
    const statusTexts = {
      'off': 'OFF',
      'on': 'ON',
      'idle': 'IDLE',
      'production': 'PRODUCTION',
     
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
                <Tooltip title={`${machine.machine_make} ${machine.machine_model}`}>
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
                    {machine.machine_make} {machine.machine_model}
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
                  {machine.total_orders}
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
                  {machine.total_operations}
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
          title={
            <span style={{ fontWeight: 600, fontSize: 16 }}>{machine.machine_make} {machine.machine_model}</span>
          }
          open={drawerVisible}
          onCancel={() => setDrawerVisible(false)}
          footer={null}
          width={{ xs: '95%', sm: '80%', md: '70%', lg: '60%', xl: '50%' }}
          style={{ top: 10 }}
        >
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
        </Modal>
    </>
  );
};

// Function to assign random status to machines for demonstration
const assignRandomMachineStatus = (machine) => {
  const statuses = ['off', 'on', 'idle', 'production'];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
  
  // If machine already has a status, use it, otherwise assign random
  if (machine.machine_status && machine.machine_status.status) {
    return machine;
  }
  
  return {
    ...machine,
    machine_status: {
      ...machine.machine_status,
      status: randomStatus
    }
  };
};

// MachineGrid Component
const MachineGrid = ({ machines, onBack }) => {
  const [searchText, setSearchText] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');

  // Assign random statuses to machines for demo
  const machinesWithStatus = machines.map(assignRandomMachineStatus);

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
    { label: 'ON', value: 'on' },
    { label: 'OFF', value: 'off' },
    { label: 'IDLE', value: 'idle' },
    { label: 'PRODUCTION', value: 'production' },
  
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
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
      }}>
        <Space wrap style={{ width: '100%' }} orientation="horizontal">
          <Search
            placeholder="Search by make, model, type, or work center"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: '200px' }}
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
      </div>

      {filteredMachines.length === 0 ? (
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
    </motion.div>
  );
};

export { MachineCard, MachineGrid };
export default MachineGrid;
