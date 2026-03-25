import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Empty, Card, Row, Col, Input } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, ToolOutlined, CheckCircleOutlined, ClockCircleOutlined, SearchOutlined } from '@ant-design/icons';

const { Search } = Input;

const InstrumentsList = ({ onEdit, onDelete, onCreateNew }) => {
  const [instruments, setInstruments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filteredData, setFilteredData] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchInstruments();
  }, []);

  useEffect(() => {
    filterData();
  }, [instruments, searchText, activeFilter]);

  const filterData = () => {
    let filtered = instruments;
    if (searchText) {
      filtered = filtered.filter(item => 
        item.instrument_name?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.model?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.serial_number?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.manufacturer?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    setFilteredData(filtered);
  };

  const fetchInstruments = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual API call
      setInstruments([]);
    } catch (error) {
      message.error('Failed to fetch instruments');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'sl_no',
      width: 70,
      fixed: 'left',
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Instrument Name',
      dataIndex: 'instrument_name',
      key: 'instrument_name',
      width: 180,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Model',
      dataIndex: 'model',
      key: 'model',
      width: 120,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Serial Number',
      dataIndex: 'serial_number',
      key: 'serial_number',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Manufacturer',
      dataIndex: 'manufacturer',
      key: 'manufacturer',
      width: 120,
      ellipsis: true,
      className: 'table-header-styled',
    },
    {
      title: 'Calibration Date',
      dataIndex: 'calibration_date',
      key: 'calibration_date',
      width: 140,
      className: 'table-header-styled',
    },
    {
      title: 'Next Calibration',
      dataIndex: 'next_calibration',
      key: 'next_calibration',
      width: 140,
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 120,
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
      render: (text, record) => (
        <Space size="small">
          <Button 
            type="text" 
            icon={<EditOutlined />} 
            size="small"
            onClick={() => onEdit(record)}
          />
          <Button 
            type="text" 
            icon={<DeleteOutlined />} 
            size="small"
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
      <Row gutter={16} style={{ marginTop: 10, marginBottom: 12 }}>
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
            bodyStyle={{ padding: '16px 20px' }}
            onClick={() => setActiveFilter('all')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Total Instruments</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Master Registry</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#1890ff' }}>{instruments.length}</div>
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
              borderBottom: `4px solid ${activeFilter === 'active' ? '#52c41a' : '#f0f0f0'}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              background: activeFilter === 'active' ? '#f6ffed' : '#fff'
            }}
            hoverable
            bodyStyle={{ padding: '16px 20px' }}
            onClick={() => setActiveFilter('active')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Active Units</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Ready for Use</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#52c41a' }}>0</div>
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
              borderBottom: `4px solid ${activeFilter === 'pending' ? '#faad14' : '#f0f0f0'}`,
              boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              background: activeFilter === 'pending' ? '#fffbe6' : '#fff'
            }}
            hoverable
            bodyStyle={{ padding: '16px 20px' }}
            onClick={() => setActiveFilter('pending')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '600', marginBottom: '2px' }}>Calibration Due</div>
                <div style={{ fontSize: '12px', color: '#8c8c8c', marginBottom: '12px' }}>Pending Service</div>
                <div style={{ fontSize: '28px', fontWeight: '700', color: '#faad14' }}>0</div>
              </div>
              <div style={{ 
                width: '56px', 
                height: '56px', 
                borderRadius: '12px', 
                background: '#fffbe6', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center'
              }}>
                <ClockCircleOutlined style={{ fontSize: '32px', color: '#faad14' }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Search
          placeholder="Search instruments..."
          allowClear
          enterButton={<SearchOutlined />}
          size="medium"
          style={{ width: 300 }}
          onSearch={handleSearch}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Button 
          type="primary" 
          icon={<PlusOutlined />}
          onClick={onCreateNew}
        >
          Create New Instrument
        </Button>
      </div>
      
      {filteredData.length === 0 ? (
        <Empty
          description="No instruments found"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: '40px' }}
        />
      ) : (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
          }}
          size="small"
          scroll={{ x: 1200 }}
        />
      )}
    </div>
  );
};

export default InstrumentsList;
