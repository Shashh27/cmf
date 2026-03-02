import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Modal, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import config from '../../Config/config';

const ReturnRequestsTable = () => {
  const [returnRequests, setReturnRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  
  useEffect(() => {
    fetchReturnRequests();
  }, []);

  const fetchReturnRequests = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/inventory-return-requests/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      // Debug: Log the fetched data to check admin_name values
      console.log('=== FETCHED RETURN REQUESTS ===');
      data.forEach((req, index) => {
        console.log(`Request ${index + 1}: ID=${req.id}, Status=${req.status}, Admin_Name=${req.admin_name}`);
      });
      console.log('===============================');
      
      setReturnRequests(data);
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
        console.log('API URL:', `${config.API_BASE_URL}/inventory-return-requests/${record.id}/status?admin_id=6&status=pending&table_id=${record.id}`);
        
        try {
          const response = await fetch(`${config.API_BASE_URL}/inventory-return-requests/${record.id}/status?admin_id=6&status=pending&table_id=${record.id}`, {
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
                    admin_name: null, // Clear admin_name when marking as pending
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
        console.log('API URL:', `${config.API_BASE_URL}/inventory-return-requests/${record.id}/status?admin_id=6&status=collected&table_id=${record.id}`);
        
        try {
          const response = await fetch(`${config.API_BASE_URL}/inventory-return-requests/${record.id}/status?admin_id=6&status=collected&table_id=${record.id}`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to update status to collected');
          }
          
          const result = await response.json();
          console.log('API Response:', result);
          
          // Update the local state immediately with admin_name and persist it
          setReturnRequests(prevRequests => 
            prevRequests.map(req => 
              req.id === record.id 
                ? { 
                    ...req, 
                    status: 'collected', 
                    admin_name: result.admin_name,
                    updated_at: new Date().toISOString()
                  }
                : req
            )
          );
          
          message.success(`Return request marked as collected by ${result.admin_name || 'admin'}`);
        } catch (error) {
          console.error('Failed to update status to collected:', error);
          message.error('Failed to update status to collected: ' + error.message);
        }
      }
    });
  };

  const handleDelete = async (record) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/inventory-return-requests/${record.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to delete return request');
      }
      
      message.success('Return request deleted successfully');
      
      // Remove the deleted row from state instead of refetching
      setReturnRequests(prev => prev.filter(req => req.id !== record.id));
    } catch (error) {
      console.error('Failed to delete return request:', error);
      message.error('Failed to delete return request: ' + error.message);
    }
  };

  const handleViewDetails = (record) => {
    setSelectedRequest(record);
    setDetailModalVisible(true);
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
      width: 120,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Returned Qty',
      dataIndex: 'returned_qty',
      key: 'returned_qty',
      width: 110,
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
      dataIndex: 'admin_name',
      key: 'admin_name',
      width: 140,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      className: 'table-header-styled',
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Updated At',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 160,
      className: 'table-header-styled',
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Action',
      key: 'action',
      width: 180,
      fixed: 'right',
      align: 'center',
      className: 'table-header-styled',
      render: (_, record, index) => {
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
              type="default"
              size="small"
              onClick={() => handlePending(record)}
              disabled={record.status === 'pending'}
            >
              Pending
            </Button>
            <Button
              type="primary"
              size="small"
              onClick={() => handleCollected(record)}
              disabled={record.status === 'collected'}
            >
              Collected
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Table
        columns={columns}
        dataSource={returnRequests}
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
        scroll={{ x: 1000 }}
      />

      <Modal
        title="Return Request Details"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Close
          </Button>
        ]}
        width={800}
      >
        {selectedRequest && (
          <div>
            <p><strong>Total Requested Quantity:</strong> {selectedRequest.total_requested_qty}</p>
            <p><strong>Returned Quantity:</strong> {selectedRequest.returned_qty}</p>
            <p><strong>Status:</strong> 
              <Tag color={getStatusColor(selectedRequest.status)} style={{ marginLeft: 8 }}>
                {selectedRequest.status?.toUpperCase() || '-'}
              </Tag>
            </p>
            <p><strong>Remarks:</strong> {selectedRequest.remarks || '-'}</p>
            <p><strong>Returned By:</strong> {selectedRequest.operator_name || '-'}</p>
            <p><strong>Collected By:</strong> {selectedRequest.admin_name || '-'}</p>
            <p><strong>Created At:</strong> {formatDateTime(selectedRequest.created_at)}</p>
            <p><strong>Updated At:</strong> {formatDateTime(selectedRequest.updated_at)}</p>
            
            {selectedRequest.inventory_request_details && (
              <div style={{ marginTop: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                <h4>Original Inventory Request Details:</h4>
                <p><strong>Tool:</strong> {selectedRequest.inventory_request_details.tool_name || '-'}</p>
                <p><strong>Project Number:</strong> {selectedRequest.inventory_request_details.project_name || '-'}</p>
                <p><strong>Part Name:</strong> {selectedRequest.inventory_request_details.part_name || '-'}</p>
                <p><strong>Purpose of Use:</strong> {selectedRequest.inventory_request_details.purpose_of_use || '-'}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReturnRequestsTable;
