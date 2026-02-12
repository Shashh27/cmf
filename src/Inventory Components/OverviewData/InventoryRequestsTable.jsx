import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Modal, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';

const InventoryRequestsTable = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  useEffect(() => {
    fetchInventoryRequests();
  }, []);

  const fetchInventoryRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://172.18.100.76:8000/api/v1/inventory-requests/');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRequests(data);
    } catch (error) {
      console.error('Failed to fetch inventory requests:', error);
      message.error('Failed to fetch inventory requests: ' + error.message);
    } finally {
      setLoading(false);
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
          const response = await fetch(`http://172.18.100.76:8000/api/v1/inventory-requests/${record.id}/status?admin_id=6&status=approved`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to approve request');
          }
          
          message.success('Inventory request approved successfully');
          fetchInventoryRequests();
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
          const response = await fetch(`http://172.18.100.76:8000/api/v1/inventory-requests/${record.id}/status?admin_id=6&status=rejected`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to reject request');
          }
          
          message.success('Inventory request rejected successfully');
          fetchInventoryRequests();
        } catch (error) {
          console.error('Failed to reject request:', error);
          message.error('Failed to reject request: ' + error.message);
        }
      }
    });
  };

  const handleViewDetails = (record) => {
    setSelectedRequest(record);
    setDetailModalVisible(true);
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
    },
    {
      title: 'Project Number',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Part Name',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 80,
    },
    {
      title: 'Purpose',
      dataIndex: 'purpose_of_use',
      key: 'purpose_of_use',
      width: 150,
      ellipsis: true,
      render: (text) => text || '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
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
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Approved By',
      dataIndex: 'admin_name',
      key: 'admin_name',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: 'Created At',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Updated At',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 120,
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Action',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            onClick={() => handleApprove(record)}
          >
            Approve
          </Button>
          <Button
            danger
            size="small"
            onClick={() => handleReject(record)}
          >
            Reject
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Table
        columns={columns}
        dataSource={requests}
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
        size="small"
        scroll={{ x: 1200 }}
      />

      <Modal
        title="Inventory Request Details"
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
            <p><strong>Tool Name:</strong> {selectedRequest.tool_name || '-'}</p>
            <p><strong>Project Number:</strong> {selectedRequest.project_name || '-'}</p>
            <p><strong>Part Name:</strong> {selectedRequest.part_name || '-'}</p>
            <p><strong>Quantity:</strong> {selectedRequest.quantity}</p>
            <p><strong>Purpose of Use:</strong> {selectedRequest.purpose_of_use || '-'}</p>
            <p><strong>Status:</strong> 
              <Tag color={getStatusColor(selectedRequest.status)} style={{ marginLeft: 8 }}>
                {selectedRequest.status?.toUpperCase() || '-'}
              </Tag>
            </p>
            <p><strong>Requested By:</strong> {selectedRequest.operator_name || '-'}</p>
            <p><strong>Approved By:</strong> {selectedRequest.admin_name || '-'}</p>
            <p><strong>Created At:</strong> {formatDateTime(selectedRequest.created_at)}</p>
            <p><strong>Updated At:</strong> {formatDateTime(selectedRequest.updated_at)}</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default InventoryRequestsTable;
