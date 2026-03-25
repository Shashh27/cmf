import React, { useState, useEffect } from 'react';
import { Table, Button, Tag, message, notification, Modal, Input, InputNumber, Form, Card, Row, Col, Select } from 'antd';
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
      styles={{ body: { padding: 0 } }}
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

const ToolRequested = ({ onReturnSuccess, onReportIssueSuccess }) => {
  const [requests, setRequests] = useState([]);
  const [returnRequests, setReturnRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [returnLoading, setReturnLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });

  // Modal state
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [returnQuantity, setReturnQuantity] = useState(1);
  const [remarks, setRemarks] = useState('');
  // Quantity exceeded popup (return qty > remaining)
  const [showQuantityExceededModal, setShowQuantityExceededModal] = useState(false);
  const [quantityExceededRemaining, setQuantityExceededRemaining] = useState(0);
  // Issue modal state
  const [isIssueModalVisible, setIsIssueModalVisible] = useState(false);
  const [issueQty, setIssueQty] = useState(1);
  const [issueCategory, setIssueCategory] = useState(undefined);
  const [issueDescription, setIssueDescription] = useState('');
  const [issueFiles, setIssueFiles] = useState([]);
  const [issueCustomCategory, setIssueCustomCategory] = useState('');
  const [issuesByReq, setIssuesByReq] = useState({});
  // Issue quantity exceeded popup (issue qty > remaining)
  const [showIssueQuantityExceededModal, setShowIssueQuantityExceededModal] = useState(false);
  const [issueQuantityExceededRemaining, setIssueQuantityExceededRemaining] = useState(0);

  const computeRemaining = (req) => {
    if (!req) return 0;
    const returned = returnRequests
      .filter(rr => rr.requested_id === req.id)
      .reduce((sum, rr) => sum + (rr.returned_qty || 0), 0);
    const issues = issuesByReq[req.id] || 0;
    return Math.max(0, (req.quantity || 0) - returned - issues);
  };

  useEffect(() => {
    fetchRequests();
    fetchReturnRequests();
    fetchToolIssues();
  }, []);

  const getCurrentOperatorId = () => {
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user && user.id != null) return parseInt(user.id);
      }
    } catch {
      void 0;
    }
    const fallback = localStorage.getItem('operator_id');
    return fallback ? parseInt(fallback) : null;
  };

  const handleTableChange = (newPagination) => {
    setPagination(newPagination);
  };

  const totalRequested = requests.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const totalReturned = returnRequests.reduce((sum, rr) => {
    return rr.status === 'collected' ? sum + (rr.returned_qty || 0) : sum;
  }, 0);
  const totalToBeReturned = requests.reduce((sum, r) => {
    if (r.status !== 'approved') return sum;
    const remaining = computeRemaining(r);
    return sum + remaining;
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
        let data = await response.json();
        const sortedData = Array.isArray(data) ? data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
        const currentOpId = getCurrentOperatorId();
        const filteredSorted = currentOpId != null
          ? sortedData.filter(r => {
              const oid = r.operator_id ?? r.operatorId ?? r.operator_id_fk ?? r.operator?.id;
              return oid == null ? true : parseInt(oid) === currentOpId;
            })
          : sortedData;
        setRequests(filteredSorted);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReturnRequests = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/inventory-return-requests/`);
      if (response.ok) {
        let data = await response.json();
        const arr = Array.isArray(data) ? data : [];
        const currentOpId = getCurrentOperatorId();
        const filtered = currentOpId != null
          ? arr.filter(rr => {
              const top = rr.operator_id ?? rr.operatorId ?? rr.operator_id_fk;
              const nested = rr.inventory_request_details?.operator_id ?? rr.inventory_request_details?.operator?.id;
              const oid = top != null ? top : nested;
              return oid == null ? true : parseInt(oid) === currentOpId;
            })
          : arr;
        setReturnRequests(filtered);
      }
    } catch (error) {
      console.error('Failed to fetch return requests:', error);
    }
  };

  const fetchToolIssues = async () => {
    try {
      let operator_id = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operator_id = user.id;
        } catch {}
      }
      if (!operator_id) {
        operator_id = localStorage.getItem('operator_id');
      }
      let url = `${API_BASE_URL}/tool-issues/`;
      if (operator_id) url = `${API_BASE_URL}/tool-issues/by-operator/${operator_id}`;
      const res = await fetch(url);
      if (res.ok) {
        const arr = await res.json();
        const map = {};
        (Array.isArray(arr) ? arr : []).forEach(i => {
          const reqId = i.request_id;
          const st = (i.status || '').toLowerCase();
          if (reqId != null && (st === 'pending' || st === 'approved')) {
            map[reqId] = (map[reqId] || 0) + (i.tool_issue_qty || 0);
          }
        });
        setIssuesByReq(map);
      }
    } catch (e) {
      // silent fail
    }
  };

  const handleReturnTool = (record) => {
    fetchToolIssues();
    fetchReturnRequests();
    const remaining = computeRemaining(record);
    if (remaining <= 0) {
      message.warning('No items remaining to return');
      return;
    }
    setCurrentRecord(record);
    setReturnQuantity(remaining);
    setRemarks('');
    setIsModalVisible(true);
  };

  const handleReturnSubmit = async () => {
    if (!currentRecord) return;
    const remaining = computeRemaining(currentRecord);
    if (returnQuantity < 1) {
      message.error('Return quantity must be at least 1');
      return;
    }
    if (returnQuantity > remaining) {
      setQuantityExceededRemaining(remaining);
      setShowQuantityExceededModal(true);
      return;
    }
    setReturnLoading(true);
    try {
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
      if (!operator_id) {
        operator_id = localStorage.getItem('operator_id');
      }
      if (!operator_id) {
        throw new Error('Operator ID not found. Please log in again.');
      }
      const payload = {
        requested_id: currentRecord.id,
        operator_id: operator_id ? parseInt(operator_id) : null,
        total_requested_qty: currentRecord.quantity,
        returned_qty: returnQuantity,
        remarks: remarks || "Returned by operator",
        status: 'pending',
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
        fetchRequests();
        fetchReturnRequests();
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

  const openIssueModal = (record) => {
    fetchToolIssues();
    fetchReturnRequests();
    const outstanding = computeRemaining(record);
    if (outstanding <= 0) {
      message.warning('No items remaining to report as issue');
      return;
    }
    setCurrentRecord(record);
    setIssueQty(Math.min(1, outstanding) || 1);
    setIssueCategory(undefined);
    setIssueDescription('');
    setIssueFiles([]);
    setIsIssueModalVisible(true);
  };

  const handleIssueSubmit = async () => {
    if (!currentRecord) return;
    const outstanding = computeRemaining(currentRecord);
    if (issueQty <= 0) {
      message.error('Issue quantity must be at least 1');
      return;
    }
    if (issueQty > outstanding) {
      setIssueQuantityExceededRemaining(outstanding);
      setShowIssueQuantityExceededModal(true);
      return;
    }
    try {
      let operator_id = null;
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          operator_id = user.id;
        } catch {}
      }
      if (!operator_id) {
        operator_id = localStorage.getItem('operator_id');
      }
      if (!operator_id) {
        throw new Error('Operator ID not found. Please log in again.');
      }
      const formData = new FormData();
      formData.append('tool_id', String(currentRecord.tool_id));
      formData.append('request_id', String(currentRecord.id));
      formData.append('tool_issue_qty', String(issueQty));
      formData.append('operator_id', String(operator_id));
      let categoryToSend = issueCategory;
      if (issueCategory === 'other') {
        categoryToSend = issueCustomCategory && issueCustomCategory.trim() ? issueCustomCategory.trim() : 'other';
      }
      if (categoryToSend) formData.append('issue_category', categoryToSend);
      if (issueDescription) formData.append('description', issueDescription);
      if (issueFiles && issueFiles.length > 0) {
        issueFiles.forEach(file => {
          formData.append('document', file);
        });
      }
      const resp = await fetch(`${API_BASE_URL}/tool-issues/`, {
        method: 'POST',
        body: formData,
        headers: {
          'accept': 'application/json'
        }
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${resp.status}`);
      }
      message.success('Issue reported successfully');
      setIsIssueModalVisible(false);
      fetchToolIssues();
      if (typeof onReportIssueSuccess === 'function') {
        onReportIssueSuccess();
      }
    } catch (e) {
      notification.error({
        message: 'Report Issue Failed',
        description: e.message || 'Could not submit the issue'
      });
    }
  };

  const columns = [
    {
      title: 'Tool Name',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 150,
      ellipsis: true,
      fixed: 'left',
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
      title: 'Requested Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
    },
    {
      title: 'Remaining Qty',
      key: 'remaining_qty',
      width: 130,
      // align: 'center',
      render: (_, record) => {
        const remaining = computeRemaining(record);
        return remaining > 0 ? remaining : 0;
      }
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
      title: 'Approved By',
      dataIndex: 'inventory_supervisor_name',
      key: 'inventory_supervisor_name',
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
        const remaining = computeRemaining(record);
        const isExhausted = remaining <= 0;
        return (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              type="primary"
              size="small"
              disabled={record.status !== 'approved' || isExhausted}
              onClick={() => handleReturnTool(record)}
              loading={returnLoading}
            >
              {isExhausted ? 'Returned' : 'Return Tool'}
            </Button>
            <Button
              danger
              size="small"
              disabled={record.status !== 'approved' || isExhausted}
              onClick={() => openIssueModal(record)}
            >
              Report Issue
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ background: '#f0f2f5', padding: '0px', borderRadius: '8px' }}>
      <Card style={{ borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>

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
              title="Total Tool Collected"
              count={totalReturned}
              label="Collected"
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

        {/* Search + Table */}
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
      </Card>

      {/* Return Tool Modal */}
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
              value={returnQuantity}
              onChange={(val) => {
                if (!currentRecord) return;
                if (typeof val === 'number') {
                  if (val < 1) setReturnQuantity(1);
                  else setReturnQuantity(val);
                }
              }}
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
              Remaining quantity: {currentRecord ? computeRemaining(currentRecord) : 0}. You cannot return more than this.
            </div>
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

      {/* Return Quantity Exceeded Modal */}
      <Modal
        title="Invalid Quantity"
        open={showQuantityExceededModal}
        onCancel={() => setShowQuantityExceededModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowQuantityExceededModal(false)}>
            OK
          </Button>,
        ]}
        closable
      >
        <p style={{ margin: 0 }}>
          Return quantity is more than the remaining quantity. Remaining quantity is <strong>{quantityExceededRemaining}</strong>.
        </p>
      </Modal>

      {/* Report Issue Modal */}
      <Modal
        title="Report Issue"
        open={isIssueModalVisible}
        onOk={handleIssueSubmit}
        onCancel={() => setIsIssueModalVisible(false)}
        maskClosable={false}
      >
        <Form layout="vertical">
          <Form.Item label="Tool Name">
            <Input value={currentRecord?.tool_name} disabled />
          </Form.Item>
          <Form.Item label="Issue Quantity">
            <InputNumber
              min={1}
              value={issueQty}
              onChange={(val) => {
                if (typeof val === 'number') {
                  if (val < 1) setIssueQty(1);
                  else setIssueQty(val);
                }
              }}
              style={{ width: '100%' }}
            />
            <div style={{ marginTop: 6, fontSize: 12, color: '#8c8c8c' }}>
              Remaining quantity: {currentRecord ? computeRemaining(currentRecord) : 0}. You cannot report more than this.
            </div>
          </Form.Item>
          <Form.Item label="Issue Category">
            <Select
              placeholder="Select issue category"
              value={issueCategory}
              onChange={setIssueCategory}
              allowClear
              options={[
                { value: 'wear and tear', label: 'Wear and Tear' },
                { value: 'calibration drift', label: 'Calibration Drift' },
                { value: 'other', label: 'Other' },
              ]}
            />
          </Form.Item>
          {issueCategory === 'other' && (
            <Form.Item label="Custom Category">
              <Input
                value={issueCustomCategory}
                onChange={(e) => setIssueCustomCategory(e.target.value)}
                placeholder="Type category"
              />
            </Form.Item>
          )}
          <Form.Item label="Description">
            <Input.TextArea
              rows={4}
              value={issueDescription}
              onChange={(e) => setIssueDescription(e.target.value)}
            />
          </Form.Item>
          <Form.Item label="Attach Documents (optional)">
            <input
              type="file"
              multiple
              onChange={(e) => setIssueFiles(Array.from(e.target.files || []))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Issue Quantity Exceeded Modal */}
      <Modal
        title="Invalid Quantity"
        open={showIssueQuantityExceededModal}
        onCancel={() => setShowIssueQuantityExceededModal(false)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setShowIssueQuantityExceededModal(false)}>
            OK
          </Button>,
        ]}
        closable
      >
        <p style={{ margin: 0 }}>
          Issue quantity is more than the remaining quantity. Remaining quantity is <strong>{issueQuantityExceededRemaining}</strong>.
        </p>
      </Modal>
    </div>
  );
};

export default ToolRequested;