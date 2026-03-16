import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Modal, Popconfirm, DatePicker, Input, Select, Row, Col } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../../../Config/auth.js';

const InventoryRequestsTable = () => {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [dateRange, setDateRange] = useState([null, null]);
  const [typeFilter, setTypeFilter] = useState('all'); // all | pending | approved | rejected
  const [searchText, setSearchText] = useState('');
  const { RangePicker } = DatePicker;

  useEffect(() => {
    fetchInventoryRequests();
  }, []);

  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, dateRange, typeFilter, searchText]);

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

  const fetchInventoryRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-requests/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch inventory requests:', error);
      message.error('Failed to fetch inventory requests: ' + error.message);
    }
  };

  const handleApprove = async (record) => {
    Modal.confirm({
      title: 'Confirm Approval',
      content: `Are you sure you want to approve this inventory request for ${record.tool_name || 'this item'}?`,
      okText: 'Yes, Approve',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const { id: userId, name: userName, role } = getCurrentUserInfo();
          if (!userId) {
            message.error('Unable to determine current user. Please log in again.');
            return;
          }

          // Only inventory_supervisor can approve
          if (role !== 'inventory_supervisor') {
            message.error('Only inventory supervisors can approve requests');
            return;
          }

          const response = await fetch(`${API_BASE_URL}/inventory-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=approved`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to approve request');
          }
          
          message.success('Inventory request approved successfully');
          
          let result = {};
          try {
            result = await response.json();
          } catch {
            result = {};
          }
          setRequests(prev => prev.map(req => 
            req.id === record.id 
              ? { 
                  ...req, 
                  status: 'approved',
                  inventory_supervisor_name: userName || req.inventory_supervisor_name 
                } 
              : req
          ));
        } catch (error) {
          console.error('Failed to approve request:', error);
          message.error('Failed to approve request: ' + error.message);
        }
      }
    });
  };

  const handleReject = async (record) => {
    Modal.confirm({
      title: 'Confirm Rejection',
      content: `Are you sure you want to reject this inventory request for ${record.tool_name || 'this item'}?`,
      okText: 'Yes, Reject',
      cancelText: 'Cancel',
      okType: 'danger',
      onOk: async () => {
        try {
          const { id: userId, name: userName, role } = getCurrentUserInfo();
          if (!userId) {
            message.error('Unable to determine current user. Please log in again.');
            return;
          }

          // Only inventory_supervisor can reject
          if (role !== 'inventory_supervisor') {
            message.error('Only inventory supervisors can reject requests');
            return;
          }

          const response = await fetch(`${API_BASE_URL}/inventory-requests/${record.id}/status?inventory_supervisor_id=${userId}&status=rejected`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to reject request');
          }
          
          message.success('Inventory request rejected successfully');
          
          let result = {};
          try {
            result = await response.json();
          } catch {
            result = {};
          }
          setRequests(prev => prev.map(req => 
            req.id === record.id 
              ? { 
                  ...req, 
                  status: 'rejected',
                  inventory_supervisor_name: userName || req.inventory_supervisor_name 
                } 
              : req
          ));
        } catch (error) {
          console.error('Failed to reject request:', error);
          message.error('Failed to reject request: ' + error.message);
        }
      }
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return 'orange';
      case 'approved':
        return 'green';
      case 'rejected':
        return 'red';
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
    let data = Array.isArray(requests) ? [...requests] : [];
    // Type/status filter
    if (typeFilter !== 'all') {
      data = data.filter(r => (r.status || '').toLowerCase() === typeFilter);
    }
    // Date range filter on created_at
    const [start, end] = dateRange || [];
    if (start && end) {
      const startDate = start.startOf('day').toDate();
      const endDate = end.endOf('day').toDate();
      data = data.filter(r => {
        if (!r.created_at) return false;
        const created = new Date(r.created_at);
        return created >= startDate && created <= endDate;
      });
    }
    // Text search on any field
    if (searchText) {
      const s = searchText.toLowerCase();
      data = data.filter(r => {
        // Search through all properties of the record
        return Object.values(r).some(val => {
          if (val === null || val === undefined) return false;
          // If it's an object (like nested details), stringify it or search its values
          if (typeof val === 'object') {
            return Object.values(val).some(nestedVal => 
              String(nestedVal).toLowerCase().includes(s)
            );
          }
          return String(val).toLowerCase().includes(s);
        });
      });
    }
    setFilteredRequests(data);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleRefresh = () => {
    fetchInventoryRequests();
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
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Requested By',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Approved By',
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
      render: (_, record) => {
        const { role } = getCurrentUserInfo();
        // Only show actions for inventory_supervisor
        if (role !== 'inventory_supervisor') {
          return '-';
        }
        
        return (
          <Space size="small">
            <Button
              type="primary"
              size="small"
              onClick={() => handleApprove(record)}
              disabled={record.status !== 'pending'}
              title={record.status !== 'pending' ? `Cannot approve: request is ${record.status}` : 'Approve this request'}
            >
              Approve
            </Button>
            <Button
              danger
              size="small"
              onClick={() => handleReject(record)}
              disabled={record.status !== 'pending'}
              title={record.status !== 'pending' ? `Cannot reject: request is ${record.status}` : 'Reject this request'}
            >
              Reject
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
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
              />
            </div>
          </Col>
          <Col xs={24} sm={24} md={8} lg={8} xl={8}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Search</span>
              <Input.Search
                placeholder="Search inventory requests by any field..."
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
        columns={columns}
        dataSource={filteredRequests}
        rowKey="id"
        loading={loading}
        className="modern-table"
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
        scroll={{ x: 1200 }}
      />
    </div>
  );
};

export default InventoryRequestsTable;
