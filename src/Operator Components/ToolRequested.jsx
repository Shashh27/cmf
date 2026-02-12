import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, message, notification, Modal, Input, InputNumber, Form, Card, Row, Col } from 'antd';
import { API_BASE_URL } from '../Config/auth';
import { SearchOutlined, ToolOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';

const KpiCard = ({ title, count, label, icon, color, bgColor }) => {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <Card
      style={{
        borderRadius: '16px',
        background: bgColor,
        border: 'none',
        minHeight: '120px',
        padding: '20px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: isHovered ? 'translateY(-5px)' : 'none',
        boxShadow: isHovered ? '0 8px 16px rgba(0,0,0,0.1)' : 'none',
      }}
      bodyStyle={{ padding: 0 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
          {icon}
          <span style={{ fontSize: '16px', fontWeight: '600', color: color, marginLeft: '12px' }}>{title}</span>
        </div>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ fontSize: '36px', fontWeight: 'bold', color: color, lineHeight: '1.2' }}>
            {count}
          </div>
          <div style={{ fontSize: '14px', color: color, opacity: 0.8, fontWeight: '500' }}>{label}</div>
        </div>
      </div>
    </Card>
  );
};

const ToolRequested = ({ onReturnSuccess }) => {
  const [requests, setRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [returnLoading, setReturnLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toolsById, setToolsById] = useState({});
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  
  // Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    fetchRequests();
    fetchReturnRequests();
    fetchToolsList();
  }, []);

  const isConsumableType = (item) => {
    const v = (item?.tool_type ?? item?.type ?? '').toString().trim().toLowerCase();
    if (!v) return false;
    if (v.includes('non')) return false;
    return v.includes('consum');
  };

  const handleTableChange = (newPagination) => {
    setPagination(newPagination);
  };

  const totalRequested = requests.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const pendingByReq = returnRequests.reduce((acc, rr) => {
    if (rr.status === 'pending' || rr.status === 'not_collected') {
      acc[rr.requested_id] = (acc[rr.requested_id] || 0) + (rr.returned_qty || 0);
    }
    return acc;
  }, {});
  const totalReturned = returnRequests.reduce((sum, rr) => {
    return rr.status === 'collected' ? sum + (rr.returned_qty || 0) : sum;
  }, 0);
  const totalToBeReturned = requests.reduce((sum, r) => {
    const isConsum = isConsumableType(r);
    if (r.status === 'approved' && !isConsum) {
      const pendingQty = pendingByReq[r.id] || 0;
      const remainingWithOperator = (r.quantity || 0) - (r.total_returned_qty || 0) - pendingQty;
      return sum + (remainingWithOperator > 0 ? remainingWithOperator : 0);
    }
    return sum;
  }, 0);
  const totalPending = requests.reduce((sum, r) => {
    if (r.status === 'pending') {
      return sum + (r.quantity || 0);
    }
    return sum;
  }, 0);
  const yetToBeCollected = returnRequests.reduce((sum, r) => {
    if (r.status === 'pending' || r.status === 'not_collected') {
      return sum + (r.returned_qty || 0);
    }
    return sum;
  }, 0);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-requests/`);
      if (response.ok) {
        const data = await response.json();
        // Sort by date descending
        const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
        setRequests(sortedData.map(r => ({
          ...r,
          tool_type: r.tool_type || toolsById[r.tool_id] || r.tool_type
        })));
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchToolsList = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/tools-list/`);
      if (res.ok) {
        const tools = await res.json();
        const map = {};
        (Array.isArray(tools) ? tools : []).forEach(t => {
          if (t && t.id != null) map[t.id] = t.type || '';
        });
        setToolsById(map);
        setRequests(prev => prev.map(r => ({ ...r, tool_type: r.tool_type || map[r.tool_id] })));
      }
    } catch (e) {
      console.error('Failed to fetch tools list', e);
    }
  };
  const fetchReturnRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-return-requests/`);
      if (response.ok) {
        const data = await response.json();
        setReturnRequests(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch return requests:', error);
    }
  };

  const handleReturnTool = (record) => {
    setCurrentRecord(record);
    const remaining = record.quantity - (record.total_returned_qty || 0);
    setReturnQuantity(remaining); // Default to remaining quantity
    setRemarks('');
    setIsModalVisible(true);
  };

  const handleReturnSubmit = async () => {
    if (!currentRecord) return;

    // Client-side validation for quantity
    const remaining = currentRecord.quantity - (currentRecord.total_returned_qty || 0);
    if (returnQuantity > remaining) {
      message.error(`Cannot return more than remaining quantity (${remaining})`);
      return;
    }
    
    setReturnLoading(true);
    try {
      // Get operator_id from localStorage user object
      let operator_id = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operator_id = user.id;
        } catch (e) {
          console.error("Error parsing user from local storage", e);
        }
      }
      
      // Fallback to direct operator_id if not found in user object
      if (!operator_id) {
        operator_id = localStorage.getItem('operator_id');
      }

      if (!operator_id) {
        throw new Error('Operator ID not found. Please log in again.');
      }
      
      const payload = {
        requested_id: currentRecord.id, // backend expects requested_id
        operator_id: operator_id ? parseInt(operator_id) : null,
        total_requested_qty: currentRecord.quantity,
        returned_qty: returnQuantity,
        remarks: remarks || "Returned by operator",
        status: 'pending', // Initial status
        return_date: new Date().toISOString()
      };

      const response = await fetch(`${API_BASE_URL}/inventory-return-requests/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        message.success('Return request initiated successfully');
        setIsModalVisible(false);
        fetchRequests(); // Refresh the list to update returned quantities
        fetchReturnRequests(); // Refresh return requests to update KPI
        if (onReturnSuccess) {
          onReturnSuccess();
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = typeof errorData.detail === 'object' 
          ? JSON.stringify(errorData.detail) 
          : (errorData.detail || 'Failed to initiate return');
        throw new Error(errorMessage);
      }

    } catch (error) {
      console.error('Error returning tool:', error);
      notification.error({
        message: 'Return Failed',
        description: error.message || 'Could not process the return request.'
      });
    } finally {
      setReturnLoading(false);
    }
  };

  const columns = [
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 150,
      ellipsis: true,
      filteredValue: [searchText],
      onFilter: (value, record) => {
        return (
          String(record.tool_name || '').toLowerCase().includes(value.toLowerCase()) ||
          String(record.project_name || '').toLowerCase().includes(value.toLowerCase()) ||
          String(record.part_name || '').toLowerCase().includes(value.toLowerCase())
        );
      },
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
    },
    {
      title: 'Project',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Part',
      dataIndex: 'part_name',
      key: 'part_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Date',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (text) => text ? new Date(text).toLocaleDateString() : '-',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status) => {
        let color = 'default';
        if (status === 'approved') color = 'green';
        if (status === 'pending') color = 'orange';
        if (status === 'rejected') color = 'red';
        return <Tag color={color}>{status ? status.toUpperCase() : 'UNKNOWN'}</Tag>;
      },
    },
    {
      title: 'Supervisor',
      dataIndex: 'admin_name',
      key: 'admin_name',
      width: 150,
      ellipsis: true,
      render: (text) => text || <span style={{ color: '#999', fontStyle: 'italic' }}>Pending</span>,
    },
    {
      title: 'Action',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => {
        const isConsumable = isConsumableType(record);
        const pendingQty = returnRequests
          .filter(rr => rr.requested_id === record.id && (rr.status === 'pending' || rr.status === 'not_collected'))
          .reduce((sum, rr) => sum + (rr.returned_qty || 0), 0);
        const remainingWithOperator = (record.quantity || 0) - (record.total_returned_qty || 0) - pendingQty;
        const isExhausted = remainingWithOperator <= 0;
        
        return (
        <Button 
          type="primary" 
          size="small"
          disabled={record.status !== 'approved' || isExhausted || isConsumable}
          onClick={() => handleReturnTool(record)}
          loading={returnLoading}
        >
          {isExhausted ? 'Returned' : (isConsumable ? 'Consumable' : 'Return Tool')}
        </Button>
      )},
    },
  ];

  return (
    <div style={{ background: '#f0f2f5', padding: '0px', borderRadius: '8px' }}>
      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Tool Requested"
            count={totalRequested}
            label="Tools"
            icon={<ToolOutlined style={{ fontSize: '20px', color: '#1677FF' }} />}
            color="#1677FF"
            bgColor="#E6F4FF"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Tool Returned"
            count={totalReturned}
            label="Returned"
            icon={<CheckCircleOutlined style={{ fontSize: '20px', color: '#52C41A' }} />}
            color="#237804"
            bgColor="#F6FFED"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Tool to be Returned"
            count={totalToBeReturned}
            label="To be returned"
            icon={<ClockCircleOutlined style={{ fontSize: '20px', color: '#FA8C16' }} />}
            color="#FA8C16"
            bgColor="#FFF7E6"
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard
            title="Total Tools yet to be Collected"
            count={yetToBeCollected}
            label="Not collected"
            icon={<ClockCircleOutlined style={{ fontSize: '20px', color: '#EB2F96' }} />}
            color="#EB2F96"
            bgColor="#FFF0F6"
          />
        </Col>
      </Row>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
         <Input
            placeholder="Search requested tools..."
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            size="middle"
            style={{ width: 300 }}
            onChange={(e) => setSearchText(e.target.value)}
          />
      </div>
      <Table 
        columns={columns} 
        dataSource={requests} 
        rowKey="id" 
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            position: ['bottomCenter']
        }}
        onChange={handleTableChange}
      />
      
      <Modal
        title="Return Tool"
        open={isModalVisible}
        onOk={handleReturnSubmit}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={returnLoading}
        maskClosable={false}
      >
        <Form layout="vertical">
          <Form.Item label="Tool Name">
             <Input value={currentRecord?.tool_name} disabled />
          </Form.Item>
          <Form.Item label="Return Quantity">
            <InputNumber 
              min={1} 
              // Removed max to allow validation on submit
              value={returnQuantity} 
              onChange={setReturnQuantity} 
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item label="Remarks">
            <Input.TextArea 
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Enter remarks (optional)"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
    </div>
  );
};

export default ToolRequested;
