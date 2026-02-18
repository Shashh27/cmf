import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Card, 
  Space, 
  Tag, 
  Typography, 
  Alert,
  Spin,
  Empty,
  Input,
  Button
} from 'antd';
import { 
  HistoryOutlined, 
  TableOutlined,
  SearchOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

const TransactionHistory = () => {
  const [allTransactionsLoading, setAllTransactionsLoading] = useState(false);
  const [allTransactionsData, setAllTransactionsData] = useState(null);
  const [error, setError] = useState(null);
  const [searchProjectNumber, setSearchProjectNumber] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  useEffect(() => {
    fetchAllTransactions();
  }, []);

  const fetchAllTransactions = async () => {
    setAllTransactionsLoading(true);
    try {
      console.log('Fetching all transactions...');
      const response = await fetch('http://172.18.7.89:8000/api/v1/transaction-history/all');
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Received data:', data);
      setAllTransactionsData(data);
    } catch (error) {
      console.error('Failed to fetch all transactions:', error);
      setError('Failed to fetch all transactions: ' + error.message);
    } finally {
      setAllTransactionsLoading(false);
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
      title: 'Sl No',
      key: 'sl_no',
      width: 60,
      render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1,
    },
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Project Number',
      dataIndex: 'project_name',
      key: 'project_number',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 120,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Requested Qty',
      dataIndex: 'requested_qty',
      key: 'requested_qty',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: 'Requested By',
      dataIndex: 'requested_by',
      key: 'requested_by',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'request_created_at',
      key: 'request_created_at',
      width: 150,
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Approved By',
      dataIndex: 'approved_by',
      key: 'approved_by',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Status',
      dataIndex: 'request_status',
      key: 'request_status',
      width: 100,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Updated At',
      dataIndex: 'request_updated_at',
      key: 'request_updated_at',
      width: 150,
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 100,
      render: (text) => text || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'return_created_at',
      key: 'return_created_at',
      width: 150,
      render: (date) => date ? formatDateTime(date) : '-',
    },
    {
      title: 'Collected By',
      dataIndex: 'collected_by',
      key: 'collected_by',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Status',
      dataIndex: 'return_status',
      key: 'return_status',
      width: 100,
      render: (status) => status ? (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase()}
        </Tag>
      ) : (
        <Tag color="default">NO RETURNS</Tag>
      ),
    },
    {
      title: 'Updated At',
      dataIndex: 'return_updated_at',
      key: 'return_updated_at',
      width: 150,
      render: (date) => date ? formatDateTime(date) : '-',
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
          approved_by: inventoryRequest.admin_name || '-',
          request_status: inventoryRequest.status || '-',
          request_updated_at: inventoryRequest.updated_at,
          returned_qty: '-',
          return_created_at: null,
          collected_by: '-',
          return_status: null,
          return_updated_at: null,
        };
        
        // Filter by project number if search is active
        if (searchProjectNumber.trim()) {
          if (requestRow.project_name.toLowerCase().includes(searchProjectNumber.toLowerCase())) {
            allRows.push(requestRow);
          }
        } else {
          allRows.push(requestRow);
        }
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
            approved_by: inventoryRequest.admin_name || '-',
            request_status: inventoryRequest.status || '-',
            request_updated_at: inventoryRequest.updated_at,
            returned_qty: returnRequest.returned_qty || '-',
            return_created_at: returnRequest.created_at,
            collected_by: returnRequest.admin_name || '-',
            return_status: returnRequest.status || '-',
            return_updated_at: returnRequest.updated_at,
          };
          
          // Filter by project number if search is active
          if (searchProjectNumber.trim()) {
            if (returnRow.project_name.toLowerCase().includes(searchProjectNumber.toLowerCase())) {
              allRows.push(returnRow);
            }
          } else {
            allRows.push(returnRow);
          }
        });
      }
    });
    
    return allRows;
  };

  try {
    return (
      <div style={{ padding: '24px' }}>
        <Card 
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <HistoryOutlined style={{ fontSize: '20px', color: '#1890ff' }} />
              <Title level={4} style={{ margin: 0 }}>Transaction History</Title>
            </div>
          }
          style={{ marginBottom: '24px' }}
        >
          {/* Search Bar */}
          <div style={{ marginBottom: '20px' }}>
            <Space.Compact style={{ width: '70%', maxWidth: '400px' }}>
              <Input
                placeholder="Search by Project Number"
                value={searchProjectNumber}
                onChange={(e) => setSearchProjectNumber(e.target.value)}
                prefix={<SearchOutlined />}
                size="large"
                allowClear
              />
              <Button 
                type="primary" 
                size="large"
                icon={<SearchOutlined />}
              >
              </Button>
            </Space.Compact>
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
        </Card>
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
