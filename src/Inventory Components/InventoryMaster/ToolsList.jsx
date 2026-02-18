import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Input, Select, Card, Row, Col, Statistic } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined, CheckCircleOutlined, CloseCircleOutlined, MonitorOutlined } from '@ant-design/icons';

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
    setLoading(true);
    try {
      const response = await fetch('http://172.18.7.89:8000/api/v1/tools-list/');
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
      title: 'Sl No',
      key: 'sl_no',
      width: 60,
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Item Description',
      dataIndex: 'item_description',
      key: 'item_description',
      width: 140,
      ellipsis: true,
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
      width: 80,
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
    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      {/* KPI Cards */}
      <Row gutter={8} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              background: activeFilter === 'all' 
                ? 'linear-gradient(145deg, #1890ff 0%, #096dd9 100%)'
                : 'linear-gradient(145deg, #f0f5ff 0%, #e6f4ff 100%)',
              border: 'none',
              minHeight: '85px',
              padding: '16px',
              boxShadow: activeFilter === 'all'
                ? '0 8px 16px rgba(24, 144, 255, 0.2), 0 4px 8px rgba(24, 144, 255, 0.15)'
                : '0 3px 8px rgba(24, 144, 255, 0.06), 0 1px 3px rgba(24, 144, 255, 0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer'
            }}
            hoverable
            bodyStyle={{ padding: 0 }}
            onClick={() => handleKpiClick('all')}
            onMouseEnter={(e) => {
              if (activeFilter !== 'all') {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(24, 144, 255, 0.12), 0 4px 8px rgba(24, 144, 255, 0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeFilter !== 'all') {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 3px 8px rgba(24, 144, 255, 0.06), 0 1px 3px rgba(24, 144, 255, 0.04)';
              }
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <ToolOutlined 
                  style={{ 
                    fontSize: '20px', 
                    color: activeFilter === 'all' ? '#ffffff' : '#1890ff', 
                    marginRight: '12px' 
                  }} 
                />
                <div>
                  <div style={{ fontSize: '13px', color: activeFilter === 'all' ? '#ffffff' : '#595959', fontWeight: '600', lineHeight: '18px' }}>Total Tools</div>
                </div>
              </div>
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: activeFilter === 'all' ? '#ffffff' : '#1890ff', lineHeight: '34px' }}>
                  {kpiData.totalTools}
                </div>
                <div style={{ fontSize: '11px', color: activeFilter === 'all' ? '#e6f4ff' : '#8c8c8c', marginTop: '2px' }}>Tools available</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              background: activeFilter === 'consumables' 
                ? 'linear-gradient(145deg, #52c41a 0%, #389e0d 100%)'
                : 'linear-gradient(145deg, #f6ffed 0%, #f0f9e8 100%)',
              border: 'none',
              minHeight: '85px',
              padding: '16px',
              boxShadow: activeFilter === 'consumables'
                ? '0 8px 16px rgba(82, 196, 26, 0.2), 0 4px 8px rgba(82, 196, 26, 0.15)'
                : '0 3px 8px rgba(82, 196, 26, 0.06), 0 1px 3px rgba(82, 196, 26, 0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer'
            }}
            hoverable
            bodyStyle={{ padding: 0 }}
            onClick={() => handleKpiClick('consumables')}
            onMouseEnter={(e) => {
              if (activeFilter !== 'consumables') {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(82, 196, 26, 0.12), 0 4px 8px rgba(82, 196, 26, 0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeFilter !== 'consumables') {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 3px 8px rgba(82, 196, 26, 0.06), 0 1px 3px rgba(82, 196, 26, 0.04)';
              }
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <CheckCircleOutlined 
                  style={{ 
                    fontSize: '20px', 
                    color: activeFilter === 'consumables' ? '#ffffff' : '#52c41a', 
                    marginRight: '12px' 
                  }} 
                />
                <div>
                  <div style={{ fontSize: '13px', color: activeFilter === 'consumables' ? '#ffffff' : '#595959', fontWeight: '600', lineHeight: '18px' }}>Consumables</div>
                </div>
              </div>
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: activeFilter === 'consumables' ? '#ffffff' : '#52c41a', lineHeight: '34px' }}>
                  {kpiData.consumables}
                </div>
                <div style={{ fontSize: '11px', color: activeFilter === 'consumables' ? '#f0f9e8' : '#8c8c8c', marginTop: '2px' }}>Consumable items</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8} lg={6}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              background: activeFilter === 'non-consumables' 
                ? 'linear-gradient(145deg, #ff4d4f 0%, #cf1322 100%)'
                : 'linear-gradient(145deg, #fff2f0 0%, #fff1f0 100%)',
              border: 'none',
              minHeight: '85px',
              padding: '16px',
              boxShadow: activeFilter === 'non-consumables'
                ? '0 8px 16px rgba(255, 77, 79, 0.2), 0 4px 8px rgba(255, 77, 79, 0.15)'
                : '0 3px 8px rgba(255, 77, 79, 0.06), 0 1px 3px rgba(255, 77, 79, 0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer'
            }}
            hoverable
            bodyStyle={{ padding: 0 }}
            onClick={() => handleKpiClick('non-consumables')}
            onMouseEnter={(e) => {
              if (activeFilter !== 'non-consumables') {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.boxShadow = '0 8px 16px rgba(255, 77, 79, 0.12), 0 4px 8px rgba(255, 77, 79, 0.08)';
              }
            }}
            onMouseLeave={(e) => {
              if (activeFilter !== 'non-consumables') {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 3px 8px rgba(255, 77, 79, 0.06), 0 1px 3px rgba(255, 77, 79, 0.04)';
              }
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <CloseCircleOutlined 
                  style={{ 
                    fontSize: '20px', 
                    color: activeFilter === 'non-consumables' ? '#ffffff' : '#ff4d4f', 
                    marginRight: '12px' 
                  }} 
                />
                <div>
                  <div style={{ fontSize: '13px', color: activeFilter === 'non-consumables' ? '#ffffff' : '#595959', fontWeight: '600', lineHeight: '18px' }}>Non-Consumables</div>
                </div>
              </div>
              <div style={{ marginTop: 'auto' }}>
                <div style={{ fontSize: '28px', fontWeight: '700', color: activeFilter === 'non-consumables' ? '#ffffff' : '#ff4d4f', lineHeight: '34px' }}>
                  {kpiData.nonConsumables}
                </div>
                <div style={{ fontSize: '11px', color: activeFilter === 'non-consumables' ? '#fff1f0' : '#8c8c8c', marginTop: '2px' }}>Durable items</div>
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
      />
    </div>
  );
};

export default ToolsList;
