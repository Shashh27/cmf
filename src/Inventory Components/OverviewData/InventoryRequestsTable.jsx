import React, { useState, useEffect } from 'react';
import { Table, Button, Space, message, Tag, Modal, Popconfirm } from 'antd';
import { EditOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import config from '../../Config/config';

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
    try {
      const response = await fetch(`${config.API_BASE_URL}/inventory-requests/`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setRequests(data);
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
          const response = await fetch(`${config.API_BASE_URL}/inventory-requests/${record.id}/status?admin_id=6&status=approved`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to approve request');
          }
          
          message.success('Inventory request approved successfully');
          
          // Update only the specific row instead of refetching all data
          setRequests(prev => prev.map(req => 
            req.id === record.id ? { ...req, status: 'approved' } : req
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
          const response = await fetch(`${config.API_BASE_URL}/inventory-requests/${record.id}/status?admin_id=6&status=rejected`, {
            method: 'PUT'
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to reject request');
          }
          
          message.success('Inventory request rejected successfully');
          
          // Update only the specific row instead of refetching all data
          setRequests(prev => prev.map(req => 
            req.id === record.id ? { ...req, status: 'rejected' } : req
          ));
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
