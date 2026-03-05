import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Input, Select, Card, Row, Col, Statistic } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined, CheckCircleOutlined, CloseCircleOutlined, MonitorOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../Config/auth.js';

const { Option } = Select;
const { Search } = Input;

const ToolsList = ({ onEdit, onDelete, onCreateNew }) => {
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

  // Mock data - replace with actual API call
  useEffect(() => {
    fetchTools();
  }, []);

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
    
    setFilteredData(filtered);
    // Reset to first page when filtering
    setPagination(prev => ({ ...prev, current: 1 }));
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
      title: 'SL NO',
      key: 'sl_no',
      width: 70,
      fixed: 'left',
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Item Description',
      dataIndex: 'item_description',
      key: 'item_description',
      width: 180,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Range',
      dataIndex: 'range',
      key: 'range',
      width: 100,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'ID Code',
      dataIndex: 'identification_code',
      key: 'identification_code',
      width: 120,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Make',
      dataIndex: 'make',
      key: 'make',
      width: 100,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 110,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Gauge',
      dataIndex: 'gauge',
      key: 'gauge',
      width: 90,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Amount',
      dataIndex: 'amount',
      key: 'amount',
      width: 100,
      align: 'right',
      className: 'table-header-styled',
      render: (amount) => amount ? `$${amount.toFixed(2)}` : '-'
    },
    {
      title: 'Ref Ledger',
      dataIndex: 'ref_ledger',
      key: 'ref_ledger',
      width: 110,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 130,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      fixed: 'right',
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit(record)}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            danger
            onClick={() => onDelete(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%' }}>
      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              borderBottom: `4px solid ${activeFilter === 'all' ? '#1890ff' : '#f0f0f0'}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              background: activeFilter === 'all' ? '#f0f7ff' : '#fff'
            }}
            hoverable
            bodyStyle={{ padding: '20px 24px' }}
            onClick={() => handleKpiClick('all')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Total Tools</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Inventory Items</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1890ff' }}>{kpiData.totalTools}</div>
              </div>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '12px', 
                background: '#e6f7ff', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}>
                <ToolOutlined style={{ fontSize: '32px', color: '#1890ff' }} />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              borderBottom: `4px solid ${activeFilter === 'consumables' ? '#52c41a' : '#f0f0f0'}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              background: activeFilter === 'consumables' ? '#f6ffed' : '#fff'
            }}
            hoverable
            bodyStyle={{ padding: '20px 24px' }}
            onClick={() => handleKpiClick('consumables')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Consumables</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Fast-Moving Items</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#52c41a' }}>{kpiData.consumables}</div>
              </div>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '12px', 
                background: '#f6ffed', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}>
                <CheckCircleOutlined style={{ fontSize: '32px', color: '#52c41a' }} />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              borderBottom: `4px solid ${activeFilter === 'non-consumables' ? '#ff4d4f' : '#f0f0f0'}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              background: activeFilter === 'non-consumables' ? '#fff1f0' : '#fff'
            }}
            hoverable
            bodyStyle={{ padding: '20px 24px' }}
            onClick={() => handleKpiClick('non-consumables')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Non-Consumables</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Fixed Assets</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#ff4d4f' }}>{kpiData.nonConsumables}</div>
              </div>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '12px', 
                background: '#fff1f0', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}>
                <CloseCircleOutlined style={{ fontSize: '32px', color: '#ff4d4f' }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Search
          placeholder="Search tools..."
          allowClear
          enterButton={<SearchOutlined />}
          size="medium"
          style={{ width: 300 }}
          onSearch={handleSearch}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button 
          type="primary" 
          onClick={onCreateNew}
        >
          Create New Tool
        </Button>
      </div>
      
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({
              current: page,
              pageSize: pageSize || pagination.pageSize,
            });
          },
          onShowSizeChange: (current, size) => {
            setPagination({
              current: 1,
              pageSize: size,
            });
          },
        }}
        onChange={handleTableChange}
        size="small"
        scroll={{ x: 1300 }}
      />
    </div>
  );
};

export default ToolsList;
