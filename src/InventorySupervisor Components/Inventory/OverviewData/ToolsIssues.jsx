import React, { useEffect, useState } from 'react';
import { Table, Button, Tag, Space, message, Modal, Input, Row, Col, Card, DatePicker, Select } from 'antd';
import { API_BASE_URL } from '../../../Config/auth.js';

const { TextArea } = Input;
const { RangePicker } = DatePicker;

const ToolsIssues = () => {
  const [issues, setIssues] = useState([]);
  const [filteredIssues, setFilteredIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // all | pending | approved | rejected
  const [inventorySupervisorId, setInventorySupervisorId] = useState(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [actionType, setActionType] = useState(null); // 'approve' or 'reject'
  const [remarks, setRemarks] = useState('');
  const [documentModalVisible, setDocumentModalVisible] = useState(false);
  const [selectedDocuments, setSelectedDocuments] = useState([]); // Changed to array
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 10,
  });
  const [dateRange, setDateRange] = useState([null, null]);
  const [searchText, setSearchText] = useState('');

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

  const fetchIssues = async (status = statusFilter) => {
    setLoading(true);
    try {
      let url = `${API_BASE_URL}/tool-issues/`;
      if (status !== 'all') {
        url = `${API_BASE_URL}/tool-issues/by-status/${status}`;
      }
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      
      console.log('Tool issues with sale_order_number:', data);
      setIssues(Array.isArray(data) ? data : []);
      
    } catch (e) {
      message.error('Failed to load tool issues');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
    // Auto-set inventory supervisor ID from localStorage if available
    const { id: currentUserId, role } = getCurrentUserInfo();
    if (currentUserId && role === 'inventory_supervisor') {
      setInventorySupervisorId(currentUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    applyFilters();
  }, [issues, dateRange, searchText]);

  const applyFilters = () => {
    let data = Array.isArray(issues) ? [...issues] : [];
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
        return Object.values(r).some(val => {
          if (val === null || val === undefined || typeof val === 'object') return false;
          return String(val).toLowerCase().includes(s);
        });
      });
    }
    setFilteredIssues(data);
    setPagination(prev => ({ ...prev, current: 1 }));
  };

  const handleRefresh = () => {
    fetchIssues();
  };

  const handleClear = () => {
    setDateRange([null, null]);
    setSearchText('');
  };

  const showConfirmModal = (record, action) => {
    setSelectedIssue(record);
    setActionType(action);
    setRemarks('');
    setConfirmModalVisible(true);
  };

  const handleConfirmAction = async () => {
    if (!inventorySupervisorId) {
      message.warning('Please set Inventory Supervisor ID to approve/reject');
      return;
    }

    if (!remarks.trim()) {
      message.error('Remarks are mandatory for approval/rejection');
      return;
    }

    try {
      const payload = {
        inventory_supervisor_id: inventorySupervisorId,
        status: actionType === 'approve' ? 'approved' : 'rejected',
        remarks: remarks.trim()
      };

      const url = `${API_BASE_URL}/tool-issues/${selectedIssue.id}/status`;
      const resp = await fetch(url, { 
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.detail || `HTTP ${resp.status}`);
      }

      message.success(`Issue ${actionType}d successfully`);
      setConfirmModalVisible(false);
      setRemarks('');
      fetchIssues();
    } catch (e) {
      console.error('Failed to update issue status', e);
      message.error('Failed to update issue status: ' + e.message);
    }
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

  const handleViewDocument = (record) => {
    if (record.documents && record.documents.length > 0) {
      const urls = record.documents.map(doc => doc.document_url);
      setSelectedDocuments(urls);
      setDocumentModalVisible(true);
    } else {
      message.info('No document uploaded for this issue');
    }
  };

  const formatDate = (dateString) => {
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
      width: 200,
      fixed: 'left',
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Project Number',
      dataIndex: 'sale_order_number',
      key: 'project_number',
      width: 140,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Issue Raised By',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 150,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Issue Raised Qty',
      dataIndex: 'tool_issue_qty',
      key: 'tool_issue_qty',
      width: 150,
      align: 'center',
      className: 'table-header-styled',
    },
    {
      title: 'Issue Category',
      dataIndex: 'issue_category',
      key: 'issue_category',
      width: 140,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
      className: 'table-header-styled',
      render: (text) => text || '-',
    },
    {
      title: 'Document',
      key: 'document',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Button
          type="default"
          size="small"
          onClick={() => handleViewDocument(record)}
          disabled={!record.documents || record.documents.length === 0}
          title={record.documents && record.documents.length > 0 ? "View uploaded documents" : "No documents uploaded"}
        >
          {record.documents && record.documents.length > 0 ? 'Preview' : 'Not uploaded'}
        </Button>
      ),
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
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (status) => (
        <Tag color={getStatusColor(status)}>
          {status?.toUpperCase() || '-'}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
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
              onClick={() => showConfirmModal(record, 'approve')}
              disabled={record.status !== 'pending'}
              title={record.status !== 'pending' ? `Cannot approve: issue is ${record.status}` : 'Approve this issue'}
            >
              Approve
            </Button>
            <Button
              danger
              size="small"
              onClick={() => showConfirmModal(record, 'reject')}
              disabled={record.status !== 'pending'}
              title={record.status !== 'pending' ? `Cannot reject: issue is ${record.status}` : 'Reject this issue'}
            >
              Reject
            </Button>
          </Space>
        );
      },
    },
  ].filter(col => {
    if (col.key === 'actions') {
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
                value={statusFilter}
                onChange={setStatusFilter}
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
                placeholder="Search issues by any field..."
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
        rowKey="id"
        columns={columns}
        dataSource={filteredIssues}
        loading={loading}
        size="small"
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
        scroll={{ x: 1500 }}
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
      />

      <Modal
        title={`Confirm ${actionType === 'approve' ? 'Approval' : 'Rejection'}`}
        open={confirmModalVisible}
        onOk={handleConfirmAction}
        onCancel={() => {
          setConfirmModalVisible(false);
          setRemarks('');
        }}
        okText={`${actionType === 'approve' ? 'Approve' : 'Reject'}`}
        cancelText="Cancel"
        okType={actionType === 'approve' ? 'primary' : 'danger'}
        width={600}
      >
        {selectedIssue && (
          <div>
            <p><strong>Tool:</strong> {selectedIssue.tool_name || '-'}</p>
            <p><strong>Issue Category:</strong> {selectedIssue.issue_category || '-'}</p>
            <p><strong>Description:</strong> {selectedIssue.description || '-'}</p>
            <p><strong>Quantity:</strong> {selectedIssue.tool_issue_qty}</p>
            <p><strong>Raised By:</strong> {selectedIssue.operator_name || '-'}</p>
            
            <div style={{ marginTop: 16 }}>
              <label><strong>Remarks (Mandatory):</strong></label>
              <TextArea
                rows={4}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={`Enter remarks for ${actionType === 'approve' ? 'approval' : 'rejection'}...`}
                style={{ marginTop: 8 }}
                maxLength={500}
                showCount
              />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title="Document Preview"
        open={documentModalVisible}
        onCancel={() => {
          setDocumentModalVisible(false);
          setSelectedDocuments([]);
        }}
        footer={[
          <Button key="close" onClick={() => setDocumentModalVisible(false)}>
            Close
          </Button>
        ]}
        width={800}
        style={{ top: 20 }}
      >
        {selectedDocuments.length > 0 ? (
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {selectedDocuments.map((url, index) => (
              <div key={index} style={{ marginBottom: 24, borderBottom: index < selectedDocuments.length - 1 ? '1px solid #f0f0f0' : 'none', paddingBottom: 16 }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>Document {index + 1}</span>
                  <Button 
                    type="link" 
                    size="small"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = url;
                      link.target = "_blank";
                      link.download = '';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    Download / Open
                  </Button>
                </div>
                <div style={{ textAlign: 'center', minHeight: '300px', background: '#f9f9f9', padding: 8, borderRadius: 4 }}>
                  {url.toLowerCase().includes('.pdf') ? (
                    <iframe
                      src={url}
                      style={{ width: '100%', height: '400px', border: 'none' }}
                      title={`Document Preview ${index + 1}`}
                    />
                  ) : url.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/) ? (
                    <img
                      src={url}
                      alt={`Document Preview ${index + 1}`}
                      style={{ maxWidth: '100%', maxHeight: '400px' }}
                    />
                  ) : (
                    <div style={{ padding: '40px' }}>
                      <p>Document type cannot be previewed.</p>
                      <p>Please use the Download button to view the document.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <p>No documents to display.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ToolsIssues;
