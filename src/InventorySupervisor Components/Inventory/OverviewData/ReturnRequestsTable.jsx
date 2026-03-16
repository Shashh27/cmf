import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Modal, Popconfirm, DatePicker, Input, Select, Row, Col } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth.js';

const ReturnRequestsTable = () => {
  const [returnRequests, setReturnRequests] = useState([]);
  const [filteredReturnRequests, setFilteredReturnRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [dateRange, setDateRange] = useState([null, null]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchText, setSearchText] = useState('');
  const { RangePicker } = DatePicker;
  
  useEffect(() => {
    fetchReturnRequests();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [returnRequests, dateRange, typeFilter, searchText]);

  const getCurrentUserInfo = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return { id: null, name: null, role: null };
      const u = JSON.parse(stored);
      const id = u?.id != null ? parseInt(u.id) : null;
      const name = u?.user_name || u?.username || null;
      const role = u?.role || null;
      return { id, name, role };
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
      return { id: null, name: null, role: null };
    }
  };

  const fetchReturnRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-return-requests/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Debug: Log the fetched data to check inventory_supervisor_name values
      console.log('=== FETCHED RETURN REQUESTS ===');
      data.forEach((req, index) => {
        console.log(`Request ${index + 1}: ID=${req.id}, Status=${req.status}, Inventory_Supervisor_Name=${req.inventory_supervisor_name}`);
      });
      console.log('===============================');
      
      setReturnRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch return requests:', error);
      message.error('Failed to fetch return requests: ' + error.message);
    }
  };

  const handlePending = async (record) => {
    Modal.confirm({
      title: 'Confirm Status Change',
      content: `Are you sure you want to change the status to "Pending" for ${record.inventory_request_details?.tool_name || 'this item'}?`,
      okText: 'Yes, Change to Pending',
      cancelText: 'Cancel',
      onOk: async () => {
        console.log('=== FRONTEND PENDING CLICK ===');
        console.log('Clicked record:', record);
        console.log('Record ID:', record.id);
        console.log('Record Tool Name:', record.inventory_request_details?.tool_name);
        console.log('Current Status:', record.status);
        const { id: userId, role } = getCurrentUserInfo();
        if (!userId) {
          message.error('Unable to determine current user. Please log in again.');
          return;
        }

        // Only inventory_supervisor can change status
        if (role !== 'inventory_supervisor') {
          message.error('Only inventory supervisors can change status');
          return;
        }

        console.log('API URL:', `${API_BASE_URL}/inventory-return-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=pending&table_id=${record.id}`);
        
        try {
          const response = await fetch(`${API_BASE_URL}/inventory-return-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=pending&table_id=${record.id}`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to update status to pending');
          }
          
          const result = await response.json();
          console.log('API Response:', result);
          
          // Update UI immediately for better UX
          setReturnRequests(prev => 
            prev.map(req => 
              req.id === record.id 
                ? { 
                    ...req, 
                    status: 'pending', 
                    inventory_supervisor_name: null, // Clear inventory_supervisor_name when marking as pending
                    updated_at: new Date().toISOString()
                  }
                : req
            )
          );
          
          message.success('Return request status updated to pending successfully');
        } catch (error) {
          console.error('Failed to update status to pending:', error);
          message.error('Failed to update status to pending: ' + error.message);
        }
      }
    });
  };

  const handleCollected = async (record) => {
    Modal.confirm({
      title: 'Confirm Status Change',
      content: `Are you sure you want to change the status to "Collected" for ${record.inventory_request_details?.tool_name || 'this item'}?`,
      okText: 'Yes, Change to Collected',
      cancelText: 'Cancel',
      onOk: async () => {
        console.log('=== FRONTEND COLLECTED CLICK ===');
        console.log('Clicked record:', record);
        console.log('Record ID:', record.id);
        console.log('Record Tool Name:', record.inventory_request_details?.tool_name);
        console.log('Current Status:', record.status);
        const { id: userId, name: userName, role } = getCurrentUserInfo();
        if (!userId) {
          message.error('Unable to determine current user. Please log in again.');
          return;
        }

        // Only inventory_supervisor can change status
        if (role !== 'inventory_supervisor') {
          message.error('Only inventory supervisors can change status');
          return;
        }

        console.log('API URL:', `${API_BASE_URL}/inventory-return-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=collected&table_id=${record.id}`);
        
        try {
          const response = await fetch(`${API_BASE_URL}/inventory-return-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=collected&table_id=${record.id}`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to update status to collected');
          }
          
          const result = await response.json();
          console.log('API Response:', result);
          
          // Update the local state immediately with inventory_supervisor_name and persist it
          setReturnRequests(prevRequests => 
            prevRequests.map(req => 
              req.id === record.id 
                ? { 
                    ...req, 
                    status: 'collected', 
                    inventory_supervisor_name: userName || result.inventory_supervisor_name,
                    updated_at: new Date().toISOString()
                  }
                : req
            )
          );
          
          message.success(`Return request marked as collected by ${userName || result.inventory_supervisor_name || 'inventory supervisor'}`);
        } catch (error) {
          console.error('Failed to update status to collected:', error);
          message.error('Failed to update status to collected: ' + error.message);
        }
      }
    });
  };

 

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'orange';
      case 'collected':
        return 'green';
      default:
        return 'default';
    }
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

  const applyFilters = () => {
    let data = Array.isArray(returnRequests) ? [...returnRequests] : [];
    if (typeFilter !== 'all') {
      data = data.filter(r => (r.status || '').toLowerCase() === typeFilter);
    }
    const [start, end] = dateRange || [];
    if (start && end) {
      const s = start.startOf('day').toDate();
      const e = end.endOf('day').toDate();
      data = data.filter(r => {
        if (!r.created_at) return false;
        const c = new Date(r.created_at);
        return c >= s && c <= e;
      });
    }
    if (searchText) {
      const s = searchText.toLowerCase();
      data = data.filter(r => {
        // Search in the main record
        const inMain = Object.values(r).some(val => {
          if (val === null || val === undefined || typeof val === 'object') return false;
          return String(val).toLowerCase().includes(s);
        });
        
        // Search in nested inventory_request_details
        const inDetails = r.inventory_request_details ? 
          Object.values(r.inventory_request_details).some(val => 
            val != null && String(val).toLowerCase().includes(s)
          ) : false;
          
        return inMain || inDetails;
      });
    }
    setFilteredReturnRequests(data);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleRefresh = () => {
    fetchReturnRequests();
  };

  const handleClear = () => {
    setDateRange([null, null]);
    setTypeFilter('all');
    setSearchText('');
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
      title: 'Tool Name',
      dataIndex: ['inventory_request_details', 'tool_name'],
      key: 'tool_name',
      width: 180,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
      render: (text, record) => record.inventory_request_details?.tool_name || '-',
    },
    {
      title: 'Project Number',
      dataIndex: ['inventory_request_details', 'project_name'],
      key: 'project_number',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text, record) => record.inventory_request_details?.project_name || '-',
    },
    {
      title: 'Part Name',
      dataIndex: ['inventory_request_details', 'part_name'],
      key: 'part_name',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text, record) => record.inventory_request_details?.part_name || '-',
    },
    {
      title: 'Requested Qty',
      dataIndex: 'total_requested_qty',
      key: 'total_requested_qty',
      width: 160,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 160,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      align: 'center',
      className: 'table-header-styled',
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Collected', value: 'collected' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Returned By',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Collected By',
      dataIndex: 'inventory_supervisor_name',
      key: 'inventory_supervisor_name',
      width: 140,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Action',
      key: 'action',
      width: 180,
      fixed: 'right',
      align: 'center',
      className: 'table-header-styled',
      render: (_, record, index) => {
        const { role } = getCurrentUserInfo();
        // Only show actions for inventory_supervisor
        if (role !== 'inventory_supervisor') {
          return '-';
        }

        console.log(`=== TABLE ROW RENDER ===`);
        console.log(`Row Index: ${index}`);
        console.log(`Record ID: ${record.id}`);
        console.log(`Record Tool: ${record.inventory_request_details?.tool_name}`);
        console.log(`Record Status: ${record.status}`);
        console.log(`Full Record:`, record);
        console.log(`========================`);
        
        return (
          <Space size="small">
            <Button
              type="primary"
              size="small"
              onClick={() => handleCollected(record)}
              disabled={record.status !== 'pending'}
              title={record.status !== 'pending' ? `Already collected: request is ${record.status}` : 'Mark this return as collected'}
            >
              {record.status === 'pending' ? 'Collect' : 'Collected'}
            </Button>
          </Space>
        );
      },
    },
  ].filter(col => {
    if (col.key === 'action') {
      const { role } = getCurrentUserInfo();
      return role === 'inventory_supervisor';
    }
    return true;
  });

  return (
    <div>
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
                  { value: 'pending', label: 'Pending' },
                  { value: 'collected', label: 'Collected' },
                ]}
              />
            </div>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} xl={8}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Search</span>
              <Input.Search
                placeholder="Search return requests by any field..."
                allowClear
                maxLength={20}
                onSearch={(v) => setSearchText(v || '')}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
          </Col>
          <Col xs="auto">
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>&nbsp;</span>
              <Space>
                <Button onClick={handleRefresh}>Refresh</Button>
                <Button onClick={handleClear}>Clear</Button>
              </Space>
            </div>
          </Col>
        </Row>
      </div>
      <Table
        className="inventory-return-table modern-table"
        columns={columns}
        dataSource={filteredReturnRequests}
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
        scroll={{ x: 1000 }}
      />
    </div>
  );
};

export default ReturnRequestsTable;
