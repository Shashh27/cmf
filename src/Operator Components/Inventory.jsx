import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Input, Select, Card, Row, Col, Modal, Form, InputNumber, notification } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined, CheckCircleOutlined, CloseCircleOutlined, MonitorOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth';

const { Option } = Select;
const { Search } = Input;
const { TextArea } = Input;

const KpiCard = ({ title, count, label, icon, color, bgColor, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      style={{
        borderRadius: '16px',
        background: bgColor,
        border: 'none',
        minHeight: '120px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'translateY(-5px)' : 'none',
        boxShadow: isHovered ? '0 8px 16px rgba(0,0,0,0.1)' : 'none',
      }}
      bodyStyle={{ padding: 0 }}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          {icon}
          <span style={{ fontSize: '16px', fontWeight: '600', color: color, marginLeft: '12px' }}>{title}</span>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: color, lineHeight: '1.2' }}>
            {count}
          </div>
          <div style={{ fontSize: '14px', color: color, opacity: 0.8, fontWeight: '500' }}>{label}</div>
        </div>
      </div>
    </Card>
  );
};

const Inventory = () => {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'consumables', 'non-consumables'
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [kpiData, setKpiData] = useState({
    totalTools: 0,
    consumables: 0,
    nonConsumables: 0,
  });

  // Request Modal State
  const [isRequestModalVisible, setIsRequestModalVisible] = useState(false);
  const [requestForm] = Form.useForm();
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [requestLoading, setRequestLoading] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState(null);

  // Mock data - replace with actual API call
  useEffect(() => {
    fetchTools();
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/`);
      if (response.ok) {
        const data = await response.json();
        setOrders(data);
      }
    } catch (error) {
      console.error('Failed to fetch orders:', error);
    }
  };

  const fetchParts = async (saleOrderNumber) => {
    try {
      const response = await fetch(`${API_BASE_URL}/orders/sale-order/${saleOrderNumber}/parts`);
      if (response.ok) {
        const data = await response.json();
        // Assuming the API returns a list of parts directly or inside a property
        const partsList = Array.isArray(data) ? data : (data.parts || []);
        setParts(partsList);
      }
    } catch (error) {
      console.error('Failed to fetch parts:', error);
      message.error('Failed to fetch parts');
    }
  };

  const handleRequestSubmit = async (values) => {
    // Get operator ID from local storage
    let operatorId = 0;
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        operatorId = user.id || 0;
      }
    } catch (e) {
      console.error('Error parsing user from local storage', e);
    }

    // Client-side validation for quantity
    const selectedTool = tools.find(t => t.id === selectedToolId);
    if (selectedTool && values.quantity > selectedTool.quantity) {
      notification.error({
        message: 'Request Failed',
        description: 'The quantity requested is more than available.',
        duration: 0, // Keeps the notification open until manually closed
        placement: 'topRight',
      });
      return;
    }

    setRequestLoading(true);
    try {
      const payload = {
        tool_id: selectedToolId || 0,
        operator_id: operatorId,
        project_id: values.project_id, // Sending Order ID as requested
        part_id: values.part_id,
        quantity: values.quantity,
        purpose_of_use: values.purpose_of_use || ""
      };

      const response = await fetch(`${API_BASE_URL}/inventory-requests/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        message.success('Request submitted successfully');
        setIsRequestModalVisible(false);
        requestForm.resetFields();
      } else {
        const errorData = await response.json().catch(() => ({}));
        notification.error({
          message: 'Request Failed',
          description: errorData.detail || 'The quantity requested is more than available.', // Fallback message as requested
          duration: 0,
          placement: 'topRight',
        });
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      notification.error({
        message: 'Request Error',
        description: error.message || 'An unexpected error occurred while submitting the request.',
        duration: 0,
        placement: 'topRight',
      });
    } finally {
      setRequestLoading(false);
    }
  };


  useEffect(() => {
    filterData();
    calculateKPI();
  }, [tools, searchText, activeFilter]);

  const calculateKPI = () => {
    const total = tools.length;
    const consumables = tools.filter(tool => tool.type === 'CONSUMABLES').length;
    const nonConsumables = tools.filter(tool => tool.type === 'NON-CONSUMABLES').length;
    
    setKpiData({
      totalTools: total,
      consumables: consumables,
      nonConsumables: nonConsumables,
    });
  };

  const fetchTools = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTools(data);
    } catch (error) {
      console.error('Failed to fetch tools:', error);
      message.error('Failed to fetch tools: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    let filtered = tools;

    // Apply KPI filter first
    if (activeFilter === 'consumables') {
      filtered = filtered.filter(tool => tool.type === 'CONSUMABLES');
    } else if (activeFilter === 'non-consumables') {
      filtered = filtered.filter(tool => tool.type === 'NON-CONSUMABLES');
    }

    // Then apply search filter
    if (searchText) {
      filtered = filtered.filter(tool => 
        tool.item_description?.toLowerCase().includes(searchText.toLowerCase()) ||
        tool.identification_code?.toLowerCase().includes(searchText.toLowerCase()) ||
        tool.make?.toLowerCase().includes(searchText.toLowerCase()) ||
        tool.location?.toLowerCase().includes(searchText.toLowerCase()) ||
        tool.type?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    // Ensure stable ordering by ID ascending so rows keep their position
    const sorted = [...filtered].sort((a, b) => {
      const aid = Number(a?.id ?? 0);
      const bid = Number(b?.id ?? 0);
      return aid - bid;
    });
    setFilteredData(sorted);
  };

  const handleKpiClick = (filterType) => {
    setActiveFilter(filterType);
    setSearchText(''); // Clear search when applying KPI filter
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const handleTableChange = (paginationConfig) => {
    setPagination({
      current: paginationConfig.current,
      pageSize: paginationConfig.pageSize,
    });
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 50,
    },
    {
      title: 'Item Description',
      dataIndex: 'item_description',
      key: 'item_description',
      width: 140,
      ellipsis: true,
      fixed: 'left',
    },
    {
      title: 'Range',
      dataIndex: 'range',
      key: 'range',
      width: 80,
      ellipsis: true,
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 100,
      ellipsis: true,
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 80,
      ellipsis: true,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 70,
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 90,
      ellipsis: true,
    },
    {
      title: 'Gauge',
      dataIndex: 'gauge',
      key: 'gauge',
      width: 70,
      ellipsis: true,
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 80,
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '-'
    },
    {
      title: 'Ref Ledger',
      dataIndex: 'ref_ledger',
      key: 'ref_ledger',
      width: 80,
      ellipsis: true,
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 70,
      ellipsis: true,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="primary"
            size="small"
            disabled={record.quantity <= 0}
            onClick={() => {
              setSelectedToolId(record.id);
              setIsRequestModalVisible(true);
              // Ensure orders are loaded if not already
              if (orders.length === 0) fetchOrders();
            }}
          >
            Request
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* KPI Cards */}
      <Row gutter={[24, 24]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={24} md={8} lg={8} xl={8}>
          <KpiCard
            title="Total Tools"
            count={kpiData.totalTools}
            label="Tools"
            icon={<MonitorOutlined style={{ fontSize: '20px', color: '#1677FF' }} />}
            color="#1677FF"
            bgColor="#E6F4FF"
            onClick={() => handleKpiClick('all')}
          />
        </Col>
        <Col xs={24} sm={24} md={8} lg={8} xl={8}>
          <KpiCard
            title="Consumables"
            count={kpiData.consumables}
            label="Consumable items"
            icon={<CheckCircleOutlined style={{ fontSize: '20px', color: '#52C41A' }} />}
            color="#237804"
            bgColor="#F6FFED"
            onClick={() => handleKpiClick('consumables')}
          />
        </Col>
        <Col xs={24} sm={24} md={8} lg={8} xl={8}>
          <KpiCard
            title="Non-Consumables"
            count={kpiData.nonConsumables}
            label="Durable items"
            icon={<CloseCircleOutlined style={{ fontSize: '20px', color: '#F5222D' }} />}
            color="#A8071A"
            bgColor="#FFF1F0"
            onClick={() => handleKpiClick('non-consumables')}
          />
        </Col>
      </Row>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <Input
            placeholder="Search tools..."
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            size="middle"
            style={{ width: 300 }}
            onChange={(e) => {
              setSearchText(e.target.value);
              handleSearch(e.target.value);
            }}
          />
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            position: ['bottomCenter']
          }}
          onChange={handleTableChange}
        />
      </div>

      <Modal
        title="Request Inventory"
        open={isRequestModalVisible}
        onCancel={() => {
          setIsRequestModalVisible(false);
          requestForm.resetFields();
        }}
        footer={null}
        maskClosable={false}
      >
        <Form
          form={requestForm}
          layout="vertical"
          onFinish={handleRequestSubmit}
        >
          <Form.Item
            name="project_id"
            label="Project"
            rules={[{ required: true, message: 'Please select a project' }]}
          >
            <Select
              placeholder="Select a project"
              onChange={(value) => {
                const selectedOrder = orders.find(o => o.id === value);
                if (selectedOrder) {
                  fetchParts(selectedOrder.sale_order_number);
                }
                requestForm.setFieldsValue({ part_id: undefined });
              }}
            >
              {orders.map(o => (
                <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="part_id"
            label="Part"
            rules={[{ required: true, message: 'Please select a part' }]}
          >
            <Select
              placeholder="Select a part"
              disabled={!parts.length}
            >
              {parts.map(p => (
                <Option key={p.id} value={p.id}>{p.part_name || p.part_number}</Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="quantity"
            label="Quantity"
            rules={[{ required: true, message: 'Please enter quantity' }]}
          >
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="purpose_of_use"
            label="Purpose of Use"
          >
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => {
                setIsRequestModalVisible(false);
                requestForm.resetFields();
              }}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={requestLoading}>
                Submit Request
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Inventory;
