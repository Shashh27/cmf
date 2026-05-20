import React, { useState, useEffect } from 'react';
import { Card, Table, Typography, Tag, Spin, message, Input, Row, Col, DatePicker } from 'antd';
import { HistoryOutlined, SearchOutlined } from '@ant-design/icons';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

const ProductionLogsHistory = () => {
  const [productionLogs, setProductionLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [dateRange, setDateRange] = useState(null);

  useEffect(() => {
    fetchProductionLogs();
  }, []);

  const fetchProductionLogs = async () => {
    setLoading(true);
    try {
      // Get operator ID from localStorage
      let operatorId = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operatorId = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      if (!operatorId) operatorId = localStorage.getItem('operator_id');

      if (!operatorId) {
        message.error('Operator not found in session. Please log in again.');
        setLoading(false);
        return;
      }

      // Fetch production logs with hierarchical data - only operator_id
      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true&operator_id=${operatorId}`;

      const response = await fetch(apiUrl);
      if (response.ok) {
        const data = await response.json();
        // Filter to show only logs where produced_quantity > 0
        const producedLogs = (data || []).filter(log => (log.produced_quantity || 0) > 0);
        setProductionLogs(producedLogs || []);
        setFilteredLogs(producedLogs || []);
      } else {
        message.error('Failed to fetch production logs');
        setProductionLogs([]);
        setFilteredLogs([]);
      }
    } catch (error) {
      console.error('Error fetching production logs:', error);
      message.error('Failed to fetch production logs');
      setProductionLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'approved') return 'success';
    if (s === 'pending') return 'processing';
    if (s === 'rework') return 'warning';
    if (s === 'rejected') return 'error';
    return 'default';
  };

  const formatDateTime = (date, time) => {
    if (!date || !time) return 'N/A';
    try {
      // Parse the date and time
      const dateStr = date;
      const timeStr = time.replace('.000Z', '');
      const dateTimeStr = `${dateStr} ${timeStr}`;
      const dateTime = new Date(dateTimeStr);
      if (isNaN(dateTime.getTime())) return 'N/A';

      return dateTime.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    } catch (error) {
      return 'N/A';
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    applyFilters(value, dateRange);
  };

  const handleDateRangeChange = (dates) => {
    setDateRange(dates);
    applyFilters(searchText, dates);
  };

  const applyFilters = (searchValue, dates) => {
    let filtered = [...productionLogs];

    // Apply search filter
    if (searchValue && searchValue.trim() !== '') {
      const searchLower = searchValue.toLowerCase();
      filtered = filtered.filter((log) => {
        return (
          (log.operation?.operation_number?.toString() || '').toLowerCase().includes(searchLower) ||
          (log.operation?.operation_name || '').toLowerCase().includes(searchLower) ||
          (log.operation?.part?.quantity?.toString() || '').toLowerCase().includes(searchLower) ||
          (log.operation?.order?.sale_order_number || '').toLowerCase().includes(searchLower) ||
          (log.operation?.product?.product_name || '').toLowerCase().includes(searchLower) ||
          (log.operation?.part?.part_name || '').toLowerCase().includes(searchLower) ||
          (log.operation?.part?.part_number || '').toLowerCase().includes(searchLower) ||
          (log.machine?.make || '').toLowerCase().includes(searchLower) ||
          (log.machine?.model || '').toLowerCase().includes(searchLower) ||
          (log.from_date || '').toLowerCase().includes(searchLower) ||
          (log.to_date || '').toLowerCase().includes(searchLower) ||
          (log.produced_quantity?.toString() || '').toLowerCase().includes(searchLower) ||
          (log.approved_quantity?.toString() || '').toLowerCase().includes(searchLower) ||
          (log.rework_quantity?.toString() || '').toLowerCase().includes(searchLower) ||
          (log.status || '').toLowerCase().includes(searchLower) ||
          (log.supervisor?.user_name || '').toLowerCase().includes(searchLower) ||
          (log.remarks || '').toLowerCase().includes(searchLower)
        );
      });
    }

    // Apply date range filter
    if (dates && dates.length === 2) {
      const [startDate, endDate] = dates;
      filtered = filtered.filter((log) => {
        const logDate = dayjs(log.from_date);
        return logDate.isAfter(startDate.startOf('day')) && logDate.isBefore(endDate.endOf('day'));
      });
    }

    setFilteredLogs(filtered);
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'slNo',
      align: 'center',
      width: 70,
      render: (text, record, index) => index + 1,
    },
    {
      title: 'Operation No',
      key: 'operationNumber',
      align: 'center',
      width: 120,
      render: (text, record) => record.operation?.operation_number || 'N/A',
    },
    {
      title: 'Operation Name',
      key: 'operationName',
      align: 'center',
      width: 140,
      render: (text, record) => record.operation?.operation_name || 'N/A',
    },
    {
      title: 'Project Details',
      key: 'projectDetails',
      align: 'center',
      width: 140,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.order?.sale_order_number || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.product?.product_name || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Part Details',
      key: 'partDetails',
      align: 'center',
      width: 120,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.operation?.part?.part_name || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.operation?.part?.part_number || 'N/A'}</div>
        </div>
      ),
    },
    {
      title: 'Machine',
      key: 'machine',
      align: 'center',
      width: 140,
      render: (text, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.machine?.make || 'N/A'}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>{record.machine?.model || 'N/A'}</div>
        </div>
      ),
    },
    
    {
      title: 'From Date & Time',
      key: 'fromDateTime',
      align: 'center',
      width: 150,
      render: (text, record) => formatDateTime(record.from_date, record.from_time),
    },
    {
      title: 'To Date & Time',
      key: 'toDateTime',
      align: 'center',
      width: 140,
      render: (text, record) => formatDateTime(record.to_date, record.to_time),
    },
    {
      title: 'Part Qty',
      key: 'partQuantity',
      align: 'center',
      width: 100,
      render: (text, record) => record.operation?.part?.quantity || 0,
    },
    {
      title: 'Produced Qty',
      dataIndex: 'produced_quantity',
      key: 'producedQuantity',
      align: 'center',
      width: 120,
      render: (text) => text || 0,
    },
    {
      title: 'Approved Qty',
      dataIndex: 'approved_quantity',
      key: 'approvedQuantity',
      align: 'center',
      width: 140,
      render: (text) => text || 0,
    },
    {
      title: 'Rework Qty',
      dataIndex: 'rework_quantity',
      key: 'reworkQuantity',
      align: 'center',
      width: 120,
      render: (text) => text || 0,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (text) => (
        <Tag color={getStatusColor(text)}>
          {(text || 'N/A').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Supervisor',
      key: 'supervisorName',
      align: 'center',
      render: (text, record) => record.supervisor?.user_name || 'N/A',
    },
    {
      title: 'Remarks',
      dataIndex: 'remarks',
      key: 'remarks',
      align: 'center',
      render: (text) => text || '-',
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      {/* Header Card with Filters */}
      <Card
        style={{ borderRadius: 8, marginBottom: '16px' }}
        styles={{ body: { padding: '16px' } }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={24} md={12} lg={10}>
            <div>
              <Title level={3} style={{ margin: 0, marginBottom: '8px' }}>
                Production Logs History
              </Title>
              <Text type="secondary">
                View your production log history with details on operations, quantities, and status
              </Text>
            </div>
          </Col>
          <Col xs={24} sm={24} md={12} lg={8}>
            <Row gutter={[8, 8]} justify="end">
              <Col xs={24} sm={12} md={12}>
                <RangePicker
                  style={{ width: '100%', height: '40px' }}
                  size="large"
                  onChange={handleDateRangeChange}
                  placeholder={['Start Date', 'End Date']}
                />
              </Col>
              <Col xs={24} sm={12} md={12}>
                <Search
                  placeholder="Search by any field..."
                  allowClear
                  enterButton={<SearchOutlined />}
                  size="large"
                  style={{ height: '40px' }}
                  onSearch={handleSearch}
                  onChange={(e) => {
                    if (!e.target.value) {
                      setFilteredLogs(productionLogs);
                      setSearchText('');
                    }
                  }}
                />
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Table Section */}
      <Card
        style={{ borderRadius: 8 }}
        styles={{ body: { padding: 0 } }}
      >
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={filteredLogs}
            rowKey="id"
            pagination={{
              pageSize: 10,
              pageSizeOptions: ['10', '20', '50', '100'],
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            }}
            variant="outlined"
            scroll={{ x: true }}
            style={{
              textAlign: 'center',
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default ProductionLogsHistory;
