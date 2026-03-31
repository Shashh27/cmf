import React, { useState, useEffect } from 'react';
import { Table, Space, Tag, Alert,Spin,Empty,Input,Button,Row,Col,DatePicker,Select } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth';
const { RangePicker } = DatePicker;
const TransactionHistory = () => {
const [allTransactionsLoading, setAllTransactionsLoading] = useState(false);
const [allTransactionsData, setAllTransactionsData] = useState(null);
const [error, setError] = useState(null);
const [searchProjectNumber, setSearchProjectNumber] = useState('');
const [dateRange, setDateRange] = useState([null, null]);
const [typeFilter, setTypeFilter] = useState('all'); // all | requests | returns
const [pagination, setPagination] = useState({current: 1, pageSize: 10,});

  useEffect(() => {
    fetchAllTransactions();
  }, []);

  const fetchAllTransactions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/transaction-history/all`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAllTransactionsData(data);
    } catch (error) {
      console.error('Failed to fetch all transactions:', error);
      setError('Failed to fetch all transactions: ' + error.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
      case 'collected':
        return 'success';
      case 'pending':
        return 'processing';
      case 'rejected':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    // Format: DD/MM/YYYY
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    // Format: DD/MM/YYYY HH:MM
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  };

  // Combined Transaction Table Columns - Multiple rows for multiple returns
  const combinedTransactionColumns = [
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
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 180,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Project Number',
      dataIndex: 'project_name',
      key: 'project_number',
      width: 150,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 150,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Requested Qty',
      dataIndex: 'requested_qty',
      key: 'requested_qty',
      width: 150,
      align: 'center',
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Requested By',
      dataIndex: 'requested_by',
      key: 'requested_by',
      width: 130,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Approved By',
      dataIndex: 'approved_by',
      key: 'approved_by',
      width: 130,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Request Status',
      dataIndex: 'request_status',
      key: 'request_status',
      width: 160,
      align: 'center',
      className: 'table-header-styled',
      render: (status) => (
        <Tag color={getStatusColor(status)} style={{ borderRadius: '4px' }}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 150,
      align: 'center',
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Collected By',
      dataIndex: 'collected_by',
      key: 'collected_by',
      width: 130,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Return Status',
      dataIndex: 'return_status',
      key: 'return_status',
      width: 130,
      align: 'center',
      className: 'table-header-styled',
      render: (status) => status ? (
        <Tag color={getStatusColor(status)} style={{ borderRadius: '4px' }}>
          {status?.toUpperCase()}
        </Tag>
      ) : (
        <Tag color="default" style={{ borderRadius: '4px' }}>NO RETURNS</Tag>
      ),
    },
  ];

  // Prepare data for combined table - Multiple rows for multiple returns
  const getCombinedTableData = () => {
    if (!allTransactionsData?.transactions) return [];
    
    let allRows = [];
    
    allTransactionsData.transactions.forEach(transaction => {
      const inventoryRequest = transaction.inventory_request;
      
      // Check if there are return requests
      const hasReturns = transaction.return_requests && transaction.return_requests.length > 0;
      
      // Only add the request row if there are no returns
      if (!hasReturns) {
        const requestRow = {
          key: `request_${inventoryRequest.id}`,
          tool_name: inventoryRequest.tool_name || '-',
          project_name: inventoryRequest.project_name || '-',
          part_name: inventoryRequest.part_name || '-',
          requested_qty: inventoryRequest.quantity || '-',
          requested_by: inventoryRequest.operator_name || '-',
          request_created_at: inventoryRequest.created_at,
          approved_by: inventoryRequest.inventory_supervisor_name || '-',
          request_status: inventoryRequest.status || '-',
          request_updated_at: inventoryRequest.updated_at,
          returned_qty: '-',
          return_created_at: null,
          collected_by: '-',
          return_status: null,
          return_updated_at: null,
        };
        
        allRows.push(requestRow);
      }
      
      // Add each return request as a separate row
      if (hasReturns) {
        transaction.return_requests.forEach(returnRequest => {
          const returnRow = {
            key: `return_${returnRequest.id}`,
            tool_name: inventoryRequest.tool_name || '-',
            project_name: inventoryRequest.project_name || '-',
            part_name: inventoryRequest.part_name || '-',
            requested_qty: inventoryRequest.quantity || '-',
            requested_by: inventoryRequest.operator_name || '-',
            request_created_at: inventoryRequest.created_at,
            approved_by: inventoryRequest.inventory_supervisor_name || '-',
            request_status: inventoryRequest.status || '-',
            request_updated_at: inventoryRequest.updated_at,
            returned_qty: returnRequest.returned_qty || '-',
            return_created_at: returnRequest.created_at,
            collected_by: returnRequest.inventory_supervisor_name || '-',
            return_status: returnRequest.status || '-',
            return_updated_at: returnRequest.updated_at,
          };
          allRows.push(returnRow);
        });
      }
    });
    
    // Filter by any field
    if (searchProjectNumber.trim()) {
      const s = searchProjectNumber.toLowerCase();
      allRows = allRows.filter(row => {
        return Object.values(row).some(val => {
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(s);
        });
      });
    }
    
    // Type filter
    if (typeFilter === 'requests') {
      allRows = allRows.filter(r => !r.return_status);
    } else if (typeFilter === 'returns') {
      allRows = allRows.filter(r => !!r.return_status);
    }
    // Date range filter
    const [start, end] = dateRange || [];
    if (start && end) {
      const s = start.startOf('day').toDate();
      const e = end.endOf('day').toDate();
      allRows = allRows.filter(r => {
        const d = r.return_status ? r.return_created_at : r.request_created_at;
        if (!d) return false;
        const dt = new Date(d);
        return dt >= s && dt <= e;
      });
    }
    return allRows;
  };

  try {
    return (
      <div style={{ padding: '24px' }}>
          <div style={{ marginBottom: 12 }}>
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} sm={12} md={10} lg={8} xl={6}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Date Range</span>
                  <RangePicker
                    style={{ width: '100%' }}
                    value={dateRange}
                    onChange={(vals) => setDateRange(vals)}
                    allowClear
                    inputReadOnly
                  />
                </div>
              </Col>
              <Col xs={24} sm={12} md={6} lg={6} xl={4}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Type</span>
                  <Select
                    value={typeFilter}
                    onChange={setTypeFilter}
                    style={{ width: '100%' }}
                    options={[
                      { value: 'all', label: 'All Types' },
                      { value: 'requests', label: 'Requests' },
                      { value: 'returns', label: 'Returns' },
                    ]}
                  />
                </div>
              </Col>
              <Col xs={24} sm={24} md={8} lg={8} xl={8}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Search</span>
                  <Input.Search
                    placeholder="Search transactions by any field..."
                    value={searchProjectNumber}
                    onChange={(e) => setSearchProjectNumber(e.target.value)}
                    maxLength={20}
                    prefix={<SearchOutlined />}
                    allowClear
                  />
                </div>
              </Col>
              <Col xs="auto">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>&nbsp;</span>
                  <Space>
                    <Button onClick={fetchAllTransactions}>Refresh</Button>
                    <Button onClick={() => { setDateRange([null, null]); setTypeFilter('all'); setSearchProjectNumber(''); }}>Clear</Button>
                  </Space>
                </div>
              </Col>
            </Row>
          </div>
          {error && (
            <Alert
              message="Error"
              description={error}
              type="error"
              showIcon
              style={{ marginBottom: '24px' }}
            />
          )}

          {allTransactionsLoading && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" tip="Loading all transactions..." />
            </div>
          )}

          {!allTransactionsLoading && allTransactionsData && (
            <div>             
              <Table
                className="inventory-history-table"
                columns={combinedTransactionColumns}
                dataSource={getCombinedTableData()}
                rowKey="key"
                loading={allTransactionsLoading}
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
                components={{
                  header: {
                    cell: (props) => (
                      <th
                        {...props}
                        style={{
                          ...(props.style || {}),
                          paddingTop: 10,
                          paddingBottom: 10,
                        }}
                      />
                    ),
                  },
                }}
                size="small"
                scroll={{ x: 1800 }}
                bordered
              />
            </div>
          )}

          {!allTransactionsLoading && !allTransactionsData && !error && (
            <Empty
              description="No transaction data available"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
      </div>
    );
  } catch (err) {
    console.error('Error rendering TransactionHistory:', err);
    return (
      <div style={{ padding: '24px' }}>
        <Alert
          message="Component Error"
          description="There was an error rendering the Transaction History component. Please check the console for details."
          type="error"
          showIcon
        />
      </div>
    );
  }
};

export default TransactionHistory;
