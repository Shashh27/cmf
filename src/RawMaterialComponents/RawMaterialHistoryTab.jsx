import React, { useState, useEffect } from 'react';
import { Table, DatePicker, Select, Button, Card, Space, Tag, Typography, message, Row, Col, Avatar, Empty } from 'antd';
import { HistoryOutlined, FilterOutlined, ReloadOutlined, StockOutlined, LinkOutlined, ShoppingOutlined, AppstoreOutlined } from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import dayjs from 'dayjs';
import RawMaterialHistoryDownload from '../DownloadReports/RawMaterialHistoryDownload';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const RawMaterialHistoryTab = ({ materials }) => {
  const [allHistory, setAllHistory] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [isResetting, setIsResetting] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  
  // Filter states
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [day, setDay] = useState(null);
  const [sourceType, setSourceType] = useState(null);
  const [activityType, setActivityType] = useState(null);
  const [materialId, setMaterialId] = useState(null);
  const [filterOrderNumber, setFilterOrderNumber] = useState(null);
  const [filterVendorName, setFilterVendorName] = useState(null);

  const getCurrentUserId = () => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        return userData.id || userData.user_id;
      } catch (e) {
        console.error('Error parsing user data:', e);
        return null;
      }
    }
    return null;
  };

  const getUserRole = () => {
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const userData = JSON.parse(user);
        return userData.role || userData.user_role;
      } catch (e) {
        console.error('Error parsing user role:', e);
        return null;
      }
    }
    return null;
  };

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const params = {};
      
      // Note: No user filtering - both Admin and MC see all history data
      
      const response = await axios.get(`${API_BASE_URL}/rawmaterials/history`, { params });
      setAllHistory(response.data.history);
      // Apply current filters to the new data
      applyFilters(response.data.history);
    } catch (error) {
      console.error('Error fetching history:', error);
      message.error('Failed to fetch history');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (data = allHistory) => {
    let filteredData = [...data];
    
    // Filter by material
    if (materialId) {
      filteredData = filteredData.filter(item => {
        // Try multiple possible fields for material matching
        return item.material_id === materialId || 
               item.raw_material_id === materialId ||
               item.material?.id === materialId;
      });
    }
    
    // Filter by date range
    if (startDate && endDate) {
      filteredData = filteredData.filter(item => {
        const itemDate = dayjs(item.timestamp);
        return itemDate.isAfter(startDate.startOf('day')) && itemDate.isBefore(endDate.endOf('day'));
      });
    } else if (year) {
      filteredData = filteredData.filter(item => {
        const itemDate = dayjs(item.timestamp);
        if (month) {
          if (day) {
            return itemDate.year() === year && itemDate.month() + 1 === month && itemDate.date() === day;
          }
          return itemDate.year() === year && itemDate.month() + 1 === month;
        }
        return itemDate.year() === year;
      });
    }
    
    // Filter by source type
    if (sourceType) {
      filteredData = filteredData.filter(item => item.source_type === sourceType);
    }
    
    // Filter by activity type
    if (activityType) {
      filteredData = filteredData.filter(item => item.activity_type === activityType);
    }
    
    // Filter by order number
    if (filterOrderNumber) {
      filteredData = filteredData.filter(item => item.order_number === filterOrderNumber);
    }
    
    // Filter by vendor name
    if (filterVendorName) {
      filteredData = filteredData.filter(item => {
        // Check received vendor name
        if (item.received_vendor_name && item.received_vendor_name === filterVendorName) {
          return true;
        }
        // Check enquiry vendor name (split by comma for individual vendors)
        if (item.enquiry_vendor_name) {
          const enquiryVendors = item.enquiry_vendor_name.split(',').map(v => v.trim());
          if (enquiryVendors.includes(filterVendorName)) {
            return true;
          }
        }
        // Check vendor name (split by comma for individual vendors)
        if (item.vendor_name) {
          const vendors = item.vendor_name.split(',').map(v => v.trim());
          if (vendors.includes(filterVendorName)) {
            return true;
          }
        }
        return false;
      });
    }
    
    // Force re-render by creating a completely new array
    setHistory([...filteredData]);
    setTotalCount(filteredData.length);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    // Apply filters whenever materialId changes, but not during reset
    if (allHistory.length > 0 && !isResetting) {
      applyFilters();
    }
  }, [materialId, isResetting]);

  useEffect(() => {
    // Apply filters when date filters change
    if (allHistory.length > 0 && !isResetting) {
      applyFilters();
    }
  }, [startDate, endDate, year, month, day]);

  useEffect(() => {
    // Apply filters when activity or source type change
    if (allHistory.length > 0 && !isResetting) {
      applyFilters();
    }
  }, [activityType, sourceType, filterOrderNumber, filterVendorName]);

  const handleMaterialSelect = (material) => {
    // Always select the material - don't deselect on same click
    setSelectedMaterial(material);
    setMaterialId(material.id);
  };

  const handleResetFilters = () => {
    setIsResetting(true);
    
    setStartDate(null);
    setEndDate(null);
    setYear(null);
    setMonth(null);
    setDay(null);
    setSourceType(null);
    setActivityType(null);
    setMaterialId(null);
    setSelectedMaterial(null);
    setFilterOrderNumber(null);
    setFilterVendorName(null);
    
    // Clear history immediately to show all data
    setHistory(allHistory);
    setTotalCount(allHistory.length);
    
    // Then fetch fresh data
    fetchHistory().finally(() => {
      setIsResetting(false);
    });
  };

  const getActivityTypeColor = (type) => {
    switch (type) {
      case 'stock_created':
        return 'blue';
      case 'material_linked':
        return 'green';
      case 'order_status_changed':
        return 'orange';
      case 'stock_updated':
        return 'purple';
      case 'material_unlinked':
        return 'red';
      default:
        return 'default';
    }
  };

  const getActivityTypeLabel = (type) => {
    switch (type) {
      case 'stock_created':
        return 'Stock Created';
      case 'material_linked':
        return 'Material Linked';
      case 'order_status_changed':
        return 'Order Status Changed';
      case 'stock_updated':
        return 'Stock Updated';
      case 'material_unlinked':
        return 'Material Unlinked';
      default:
        return type;
    }
  };

  const columns = [
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Date & Time</span>,
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (timestamp) => dayjs(timestamp).format('YYYY-MM-DD HH:mm'),
      sorter: (a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
      defaultSortOrder: 'descend',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Activity</span>,
      dataIndex: 'activity_type',
      key: 'activity_type',
      render: (type, record) => {
        const tag = (
          <Tag color={getActivityTypeColor(type)} icon={type === 'stock_created' ? <StockOutlined /> : type === 'material_linked' ? <LinkOutlined /> : null}>
            {getActivityTypeLabel(type)}
          </Tag>
        );
        
        // For order status changes, show the description below the tag
        if (type === 'order_status_changed' && record.description) {
          return (
            <div>
              {tag}
              <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', fontWeight: 'bold' }}>
                {record.description}
              </div>
            </div>
          );
        }
        
        return tag;
      },
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Raw Material</span>,
      key: 'raw_material',
      render: (_, record) => {
        const materialName = record.material_name || record.raw_material_name || record.material?.material_name;
        return materialName ? (
          <div>
            <Text strong>{materialName}</Text>
            {record.material_code && (
              <div>
                <Text type="secondary" style={{ fontSize: '11px' }}>{record.material_code}</Text>
              </div>
            )}
          </div>
        ) : '-';
      },
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Form Type</span>,
      dataIndex: 'form_type',
      key: 'form_type',
      render: (formType) => formType || '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Dimensions</span>,
      dataIndex: 'dimensions',
      key: 'dimensions',
      render: (dimensions) => dimensions || '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Source</span>,
      dataIndex: 'source_type',
      key: 'source_type',
      render: (type) => type ? type.toUpperCase() : '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Order</span>,
      key: 'order',
      render: (_, record) => record.order_number || '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Part</span>,
      key: 'part',
      render: (_, record) => record.part_name ? (
        <div>
          <Text strong>{record.part_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: '11px' }}>{record.part_number}</Text>
        </div>
      ) : '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Length Used</span>,
      key: 'length',
      render: (_, record) => {
        if (record.activity_type === 'material_linked' && record.used_length) {
          return `${record.used_length}mm`;
        } else if (record.quantity) {
          return `${record.quantity} units`;
        }
        return '-';
      },
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>User</span>,
      dataIndex: 'user_name',
      key: 'user_name',
      render: (name) => name || '-',
    },
    {
      title: <span style={{ fontWeight: 'bold', color: '#000' }}>Vendor</span>,
      key: 'vendor',
      render: (_, record) => {
        if (record.activity_type === 'order_status_changed') {
          // For order status changes, show both enquiry vendors and received vendor
          if (record.received_vendor_name) {
            return (
              <div>
                <div style={{ fontSize: '11px' }}>
                  <Text type="secondary">Enquiry Vendors: </Text>
                  <Text>{record.enquiry_vendor_name || '-'} ({record.enquiry_vendor_count || 0})</Text>
                </div>
                <div style={{ fontSize: '11px', marginTop: '2px' }}>
                  <Text type="secondary">Received From: </Text>
                  <Text strong style={{ color: '#52c41a' }}>{record.received_vendor_name}</Text>
                </div>
              </div>
            );
          } else if (record.enquiry_vendor_name) {
            return (
              <div style={{ fontSize: '11px' }}>
                <Text type="secondary">Enquiry Vendors: </Text>
                <Text>{record.enquiry_vendor_name} ({record.enquiry_vendor_count})</Text>
              </div>
            );
          }
        }
        return record.vendor_name || '-';
      },
    },
  ];

  // Generate year options (last 5 years)
  const currentYear = new Date().getFullYear();
  const yearOptions = [];
  for (let i = 0; i < 5; i++) {
    yearOptions.push({ label: currentYear - i, value: currentYear - i });
  }

  // Generate month options
  const monthOptions = [
    { label: 'January', value: 1 },
    { label: 'February', value: 2 },
    { label: 'March', value: 3 },
    { label: 'April', value: 4 },
    { label: 'May', value: 5 },
    { label: 'June', value: 6 },
    { label: 'July', value: 7 },
    { label: 'August', value: 8 },
    { label: 'September', value: 9 },
    { label: 'October', value: 10 },
    { label: 'November', value: 11 },
    { label: 'December', value: 12 },
  ];

  // Generate day options (1-31)
  const dayOptions = [];
  for (let i = 1; i <= 31; i++) {
    dayOptions.push({ label: i, value: i });
  }

  return (
    <div style={{ padding: '16px', height: '100%', minHeight: 'calc(100vh - 120px)' }}>
      <Row gutter={16} style={{ height: '100%' }}>
        {/* Left Sidebar - Materials Only */}
        <Col xs={24} sm={24} md={4} lg={4} xl={4} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Materials List */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>
                  <AppstoreOutlined /> Materials
                </span>
                <Button size="small" onClick={handleResetFilters}>
                  Reset
                </Button>
              </div>
            }
            size="small"
            style={{ height: '100%' }}
            styles={{ body: { padding: 0, height: '100%', overflowY: 'auto' } }}
          >
            <div style={{ padding: '8px' }}>
              {materials.length === 0 ? (
                <Empty description="No materials" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                materials.map((material) => (
                  <div
                    key={material.id}
                    style={{
                      cursor: 'pointer',
                      backgroundColor: selectedMaterial?.id === material.id ? '#e6f7ff' : 'transparent',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      marginBottom: '4px',
                      border: selectedMaterial?.id === material.id ? '1px solid #1890ff' : '1px solid transparent'
                    }}
                    onClick={() => handleMaterialSelect(material)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Avatar size="small" icon={<StockOutlined />} />
                      <div>
                        <Text strong style={{ fontSize: '11px', display: 'block' }}>{material.material_name}</Text>
                        <Text type="secondary" style={{ fontSize: '10px' }}>{material.material_code}</Text>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </Col>

        {/* Main Content - History */}
        <Col xs={24} sm={24} md={20} lg={20} xl={20} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header with Filters */}
          <Card size="small" style={{ marginBottom: 16, flex: '0 0 auto' }} styles={{ body: { padding: '12px' } }}>
            <Space size="small" wrap>
              <Text strong style={{ fontSize: '12px' }}>Date Range:</Text>
              <RangePicker
                size="small"
                style={{ width: 200 }}
                value={[startDate, endDate]}
                onChange={(dates) => {
                  setStartDate(dates ? dates[0] : null);
                  setEndDate(dates ? dates[1] : null);
                  setYear(null);
                  setMonth(null);
                  setDay(null);
                }}
              />

              <Text strong style={{ fontSize: '12px' }}>Activity:</Text>
              <Select
                size="small"
                style={{ width: 120 }}
                placeholder="Select activity"
                value={activityType}
                onChange={setActivityType}
                allowClear
                options={[
                  { label: 'Stock Created', value: 'stock_created' },
                  { label: 'Material Linked', value: 'material_linked' },
                  { label: 'Order Status Changed', value: 'order_status_changed' },
                  { label: 'Stock Updated', value: 'stock_updated' },
                  { label: 'Material Unlinked', value: 'material_unlinked' },
                ]}
              />

              <Text strong style={{ fontSize: '12px' }}>Source:</Text>
              <Select
                size="small"
                style={{ width: 80 }}
                placeholder="Source"
                value={sourceType}
                onChange={setSourceType}
                allowClear
                options={[
                  { label: 'General', value: 'general' },
                  { label: 'Order', value: 'order' },
                ]}
              />

              <Text strong style={{ fontSize: '12px' }}>Order:</Text>
              <Select
                size="small"
                style={{ width: 120 }}
                placeholder="Order Number"
                value={filterOrderNumber}
                onChange={setFilterOrderNumber}
                allowClear
                showSearch
                optionFilterProp="children"
                options={[
                  ...new Set(allHistory.filter(h => h.order_number).map(h => h.order_number))
                ].map(order => ({ label: order, value: order }))}
              />

              <Text strong style={{ fontSize: '12px' }}>Vendor:</Text>
              <Select
                size="small"
                style={{ width: 120 }}
                placeholder="Vendor Name"
                value={filterVendorName}
                onChange={setFilterVendorName}
                allowClear
                showSearch
                optionFilterProp="children"
                options={(() => {
                  const vendorNames = new Set();
                  allHistory.forEach(h => {
                    if (h.received_vendor_name) {
                      vendorNames.add(h.received_vendor_name);
                    }
                    if (h.enquiry_vendor_name) {
                      h.enquiry_vendor_name.split(',').forEach(v => vendorNames.add(v.trim()));
                    }
                    if (h.vendor_name) {
                      h.vendor_name.split(',').forEach(v => vendorNames.add(v.trim()));
                    }
                  });
                  return Array.from(vendorNames).sort().map(vendor => ({ label: vendor, value: vendor }));
                })()}
              />

              <RawMaterialHistoryDownload historyData={history} selectedMaterial={selectedMaterial} />
            </Space>

            {/* Selected Material Info */}
            {selectedMaterial && (
              <div style={{ marginTop: 8 }}>
                <Tag color="blue" icon={<StockOutlined />}>
                  Filtering: {selectedMaterial.material_name} ({selectedMaterial.material_code})
                </Tag>
              </div>
            )}
          </Card>

          {/* History Table */}
          <Card style={{ flex: '1 1 auto', height: '100%' }} styles={{ body: { padding: 0, height: '100%', overflow: 'hidden' } }}>
            <Table
              columns={columns}
              dataSource={history}
              loading={loading}
              rowKey="id"
              scroll={{ x: 1000, y: 'calc(100vh - 400px)' }}
              size="small"
              pagination={{
                ...pagination,
                total: history.length,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} records`,
                pageSizeOptions: [10, 20, 50, 100],
                onChange: (page, pageSize) => {
                  setPagination({ current: page, pageSize });
                },
                onShowSizeChange: (current, size) => {
                  setPagination({ current: 1, pageSize: size });
                },
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default RawMaterialHistoryTab;
