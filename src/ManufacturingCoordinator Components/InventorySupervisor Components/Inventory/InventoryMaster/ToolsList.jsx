import React, { useState, useEffect, useRef } from 'react';
import { Table, Button, Space, message, Input, Select, Card, Row, Col, Upload } from 'antd';
import { EditOutlined, DeleteOutlined, SearchOutlined, ToolOutlined, CheckCircleOutlined, BlockOutlined, HistoryOutlined, UploadOutlined } from '@ant-design/icons';
import {API_BASE_URL} from '../../../Config/auth';
import ToolsHistory from './ToolsHistory';

const { Option } = Select;
const { Search } = Input;

const ToolsList = ({ onEdit, onDelete, onCreateNew }) => {
  const [tools, setTools] = useState(() => {
    try {
      const cached = sessionStorage.getItem('tools_list_cache');
      return cached ? JSON.parse(cached) : [];
    } catch (e) {
      console.error('Failed to parse tools cache', e);
      return [];
    }
  });
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
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyTool, setHistoryTool] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);
  const [activeCard, setActiveCard] = useState(null);

  // Prevent multiple API calls with a ref
  const isFetchingRef = useRef(false);

  // Mock data - replace with actual API call
  useEffect(() => {
    if (!isFetchingRef.current) {
      fetchTools();
    }
  }, []);

  // Debounced filter and KPI calculation
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      filterData();
      calculateKPI();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
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
    if (isFetchingRef.current) return; // Prevent multiple calls
    
    isFetchingRef.current = true;
    // Only show loading spinner if we don't have cached data
    if (tools.length === 0) {
      setLoading(true);
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const sortedData = Array.isArray(data)
        ? [...data].sort((a, b) => (a.id || 0) - (b.id || 0))
        : [];
      
      // Update cache and state
      sessionStorage.setItem('tools_list_cache', JSON.stringify(sortedData));
      setTools(sortedData);
      
      // Check if any tools have null total_quantity and migrate if needed
      const needsMigration = sortedData.some(tool => tool.total_quantity === null);
      if (needsMigration) {
        console.log('Detected tools with null total_quantity, running migration...');
        try {
          const migrateResponse = await fetch(`${API_BASE_URL}/tools-list/migrate-total-quantity`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          if (migrateResponse.ok) {
            const migrateResult = await migrateResponse.json();
            console.log('Migration completed:', migrateResult);
            // Refetch tools after migration
            isFetchingRef.current = false; // Reset ref to allow recursive call
            return fetchTools(); // Recursive call to get updated data
          }
        } catch (migrationError) {
          console.error('Migration failed:', migrationError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch tools:', error);
      message.error('Failed to fetch tools: ' + error.message);
    } finally {
      setLoading(false);
      isFetchingRef.current = false; // Reset the ref
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

    // Then apply search filter - Search by any field
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      filtered = filtered.filter(tool => {
        return Object.values(tool).some(value => {
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(lowerSearch);
        });
      });
    }
    
    setFilteredData(filtered);
    // Reset to first page when filtering
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleBulkUpload = async (file) => {
    if (!file) return;
    
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/tools-list/upload-excel`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload tools');
      }

      const result = await response.json();
      message.success(`Successfully uploaded ${result.length} tools`);
      fetchTools(); // Refresh the list
    } catch (error) {
      console.error('Bulk upload failed:', error);
      message.error('Bulk upload failed: ' + error.message);
    } finally {
      setLoading(false);
    }
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

  const openToolHistory = (tool) => {
    setHistoryTool(tool);
    setHistoryVisible(true);
  };

  const handleCloseHistory = () => {
    setHistoryVisible(false);
    setHistoryTool(null);
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
      render: (text, record) => (
        <Button
          type="link"
          style={{ padding: 0, fontWeight: 500 }}
          onClick={() => openToolHistory(record)}
        >
          {text}
        </Button>
      ),
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
      title: 'Total Qty',
      dataIndex: 'total_quantity',
      key: 'total_quantity',
      width: 90,
      align: 'center',
      className: 'table-header-styled',
      render: (totalQty, record) => totalQty || record.quantity || 0
    },
    {
      title: 'Available Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Issue Qty',
      dataIndex: 'issues_qty',
      key: 'issues_qty',
      width: 110,
      align: 'center',
      className: 'table-header-styled',
      render: (issuesQty) => issuesQty || 0
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
      render: (amount) => amount ? `${amount.toFixed(2)}` : '-'
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
      <Row gutter={12} style={{ marginTop: 8, marginBottom: 10 }}>
        <Col xs={24} sm={12} md={8}>
          <Card 
            style={{ 
              borderRadius: '8px', 
              borderBottom: '3px solid #1890ff',
              boxShadow: activeCard === 'all'
                ? '0 3px 10px rgba(0,0,0,0.12), 0 0 0 2px rgba(24,144,255,0.35)'
                : hoveredCard === 'all'
                  ? '0 4px 12px rgba(0,0,0,0.12)'
                  : '0 1px 6px rgba(0,0,0,0.08)',
              transition: 'box-shadow 0.2s ease, transform 0.1s ease, background-color 0.2s ease',
              cursor: 'pointer',
              transform: hoveredCard === 'all' ? 'translateY(-1px)' : 'none',
              userSelect: 'none',
              background: '#f0f7ff'
            }}
            hoverable
            bodyStyle={{ padding: '12px 16px' }}
            onClick={() => handleKpiClick('all')}
            onMouseEnter={() => setHoveredCard('all')}
            onMouseLeave={() => { setHoveredCard(null); setActiveCard(null); }}
            onMouseDown={(e) => { e.preventDefault(); setActiveCard('all'); }}
            onMouseUp={() => setActiveCard(null)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '700', marginBottom: '2px' }}>Total Tools</div>
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
              borderRadius: '8px', 
              borderBottom: '3px solid #52c41a',
              boxShadow: activeCard === 'consumables'
                ? '0 3px 10px rgba(0,0,0,0.12), 0 0 0 2px rgba(82,196,26,0.35)'
                : hoveredCard === 'consumables'
                  ? '0 4px 12px rgba(0,0,0,0.12)'
                  : '0 1px 6px rgba(0,0,0,0.08)',
              transition: 'box-shadow 0.2s ease, transform 0.1s ease, background-color 0.2s ease',
              cursor: 'pointer',
              transform: hoveredCard === 'consumables' ? 'translateY(-1px)' : 'none',
              userSelect: 'none',
              background: '#f6ffed'
            }}
            hoverable
            bodyStyle={{ padding: '12px 16px' }}
            onClick={() => handleKpiClick('consumables')}
            onMouseEnter={() => setHoveredCard('consumables')}
            onMouseLeave={() => { setHoveredCard(null); setActiveCard(null); }}
            onMouseDown={(e) => { e.preventDefault(); setActiveCard('consumables'); }}
            onMouseUp={() => setActiveCard(null)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '700', marginBottom: '2px' }}>Consumables</div>
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
              borderRadius: '8px', 
              borderBottom: '3px solid #ff4d4f',
              boxShadow: activeCard === 'non-consumables'
                ? '0 3px 10px rgba(0,0,0,0.12), 0 0 0 2px rgba(255,77,79,0.35)'
                : hoveredCard === 'non-consumables'
                  ? '0 4px 12px rgba(0,0,0,0.12)'
                  : '0 1px 6px rgba(0,0,0,0.08)',
              transition: 'box-shadow 0.2s ease, transform 0.1s ease, background-color 0.2s ease',
              cursor: 'pointer',
              transform: hoveredCard === 'non-consumables' ? 'translateY(-1px)' : 'none',
              userSelect: 'none',
              background: '#fff1f0'
            }}
            hoverable
            bodyStyle={{ padding: '12px 16px' }}
            onClick={() => handleKpiClick('non-consumables')}
            onMouseEnter={() => setHoveredCard('non-consumables')}
            onMouseLeave={() => { setHoveredCard(null); setActiveCard(null); }}
            onMouseDown={(e) => { e.preventDefault(); setActiveCard('non-consumables'); }}
            onMouseUp={() => setActiveCard(null)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '15px', color: '#262626', fontWeight: '700', marginBottom: '2px' }}>Non-Consumables</div>
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
                <BlockOutlined style={{ fontSize: '32px', color: '#ff4d4f' }} />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Search
          placeholder="Search tools by any field..."
          allowClear
          enterButton={<SearchOutlined />}
          size="medium"
          style={{ width: 300 }}
          maxLength={20}
          onSearch={handleSearch}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <Space>
          <Upload
            beforeUpload={(file) => {
              handleBulkUpload(file);
              return false; // Prevent automatic upload
            }}
            showUploadList={false}
            accept=".xlsx,.xls"
          >
            <Button icon={<UploadOutlined />} loading={loading}>
              Bulk Upload
            </Button>
          </Upload>
          <Button 
            type="primary" 
            onClick={onCreateNew}
          >
            Create New Tool
          </Button>
        </Space>
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
        components={{
          header: {
            cell: (props) => (
              <th
                {...props}
                style={{
                  ...(props.style || {}),
                  paddingTop: 'clamp(4px, 0.6vw, 6px)',
                  paddingBottom: 'clamp(4px, 0.6vw, 6px)',
                }}
              />
            ),
          },
          body: {
            cell: (props) => (
              <td
                {...props}
                style={{
                  ...(props.style || {}),
                  paddingTop: 'clamp(3px, 0.5vw, 5px)',
                  paddingBottom: 'clamp(3px, 0.5vw, 5px)',
                  paddingLeft: 'clamp(6px, 0.8vw, 10px)',
                  paddingRight: 'clamp(6px, 0.8vw, 10px)',
                  fontSize: 'clamp(10px, 0.9vw, 12px)',
                  lineHeight: 1.1,
                }}
              />
            ),
          },
        }}
        scroll={{ x: 'max-content' }}
      />
      <ToolsHistory
        tool={historyTool}
        visible={historyVisible}
        onClose={handleCloseHistory}
      />
    </div>
  );
};

export default ToolsList;
