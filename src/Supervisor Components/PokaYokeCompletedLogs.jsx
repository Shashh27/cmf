import React, { useState, useEffect } from 'react';
import {Table,Select,Typography,Card,Button,Space,Tag,Modal,message,Input,Tooltip,Checkbox,} from 'antd';
import {ReloadOutlined,FileTextOutlined,CheckCircleOutlined,CloseCircleOutlined,CheckOutlined,CloseOutlined,UserOutlined,} from '@ant-design/icons';
import { API_BASE_URL } from "../Config/auth";

const { Title, Text } = Typography;
const { Option } = Select;

const PokaYokeCompletedLogs = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);

  const [approvalModalVisible, setApprovalModalVisible] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState(null);
  const [approvalAction, setApprovalAction] = useState(null);
  const [approvalComments, setApprovalComments] = useState('');
  const [submittingApproval, setSubmittingApproval] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedResponses, setSelectedResponses] = useState(new Set());
  const [bulkApprovalModalVisible, setBulkApprovalModalVisible] = useState(false);
  const [bulkApprovalAction, setBulkApprovalAction] = useState(null);

  useEffect(() => {
    fetchLogs();
    const userData = localStorage.getItem('user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setCurrentUser(user);
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    }
  }, []);

  const fetchLogs = async (machineId = null) => {
    try {
      setLoading(true);
      const url = machineId
        ? `${API_BASE_URL}/pokayoke-completed-logs/machines/${machineId}/logs`
        : `${API_BASE_URL}/pokayoke-completed-logs/`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch completion logs');
      const data = await response.json();
      setLogs(Array.isArray(data) ? [...data].reverse() : []);
    } catch (error) {
      message.error(error.message || 'Failed to load completion logs');
    } finally {
      setLoading(false);
    }
  };

  const handleMachineChange = (value) => {
    const newMachine = value || null;
    setSelectedMachine(newMachine);
    fetchLogs(newMachine);
  };

  const handleRefresh = () => {
    fetchLogs(selectedMachine);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '-';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}/${month}/${year}, ${hoursStr}:${minutes}:${seconds} ${ampm}`;
  };

  const getMachineLabel = (id) => {
    const machine = machines.find((m) => m.id === id);
    if (!machine) return '-';
    if (machine.make && machine.model) {
      return `${machine.make} ${machine.model}`;
    }
    return machine.make || `Machine ${machine.id}`;
  };

  const getStatusTag = (allItemsPassed) => {
    if (allItemsPassed) {
      return (
        <Tag color="green" style={{ borderRadius: '16px', padding: '0 12px' }}>
          ALL PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '16px', padding: '0 12px' }}>
        HAS FAILURES
      </Tag>
    );
  };

  const handleViewDetails = (log) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
    setSelectedLogDetails(log);
  };

  const getItemText = (response) => {
    return response.item?.item_text || '-';
  };

  const getResponseStatusTag = (isConfirming) => {
    if (isConfirming) {
      return (
        <Tag color="green" style={{ borderRadius: '12px', padding: '0 10px' }}>
          PASSED
        </Tag>
      );
    }
    return (
      <Tag color="red" style={{ borderRadius: '12px', padding: '0 10px' }}>
        FAILED
      </Tag>
    );
  };

  const getApprovalStatusTag = (approvalStatus) => {
    if (approvalStatus === 'approved') {
      return (
        <Tag color="success" style={{ borderRadius: '12px', padding: '0 10px' }}>
          APPROVED
        </Tag>
      );
    }
    if (approvalStatus === 'rejected') {
      return (
        <Tag color="error" style={{ borderRadius: '12px', padding: '0 10px' }}>
          REJECTED
        </Tag>
      );
    }
    return (
      <Tag color="default" style={{ borderRadius: '12px', padding: '0 10px' }}>
        PENDING
      </Tag>
    );
  };

  const handleApproveClick = (response) => {
    if (!currentUser) {
      message.error('Please log in to approve items');
      return;
    }
    setSelectedResponse(response);
    setApprovalAction('approve');
    setApprovalComments(response.approval_comments || '');
    setApprovalModalVisible(true);
  };

  const handleRejectClick = (response) => {
    if (!currentUser) {
      message.error('Please log in to reject items');
      return;
    }
    setSelectedResponse(response);
    setApprovalAction('reject');
    setApprovalComments(response.approval_comments || '');
    setApprovalModalVisible(true);
  };

  const handleApprovalSubmit = async () => {
    if (!selectedResponse || !approvalAction || !currentUser) return;

    try {
      setSubmittingApproval(true);
      const url = `${API_BASE_URL}/pokayoke-completed-logs/item-responses/${selectedResponse.id}/approve`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          approval_status: approvalAction === 'approve' ? 'approved' : 'rejected',
          approved_by: currentUser.id,
          approval_comments: approvalComments,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to ${approvalAction} item`);
      }

      const updatedResponse = await response.json();

      setSelectedLogDetails(prev => ({
        ...prev,
        item_responses: prev.item_responses.map(item =>
          item.id === updatedResponse.id ? { ...item, ...updatedResponse, approver: currentUser } : item
        ),
      }));

      message.success(`Item ${approvalAction === 'approve' ? 'approved' : 'rejected'} successfully`);
      setApprovalModalVisible(false);
      setSelectedResponse(null);
      setApprovalAction(null);
      setApprovalComments('');
    } catch (error) {
      message.error(error.message || `Failed to ${approvalAction} item`);
    } finally {
      setSubmittingApproval(false);
    }
  };

  const handleSelectResponse = (responseId) => {
    setSelectedResponses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(responseId)) {
        newSet.delete(responseId);
      } else {
        newSet.add(responseId);
      }
      return newSet;
    });
  };

  const handleSelectAll = (checked) => {
    if (!selectedLogDetails) return;
    const pendingResponses = selectedLogDetails.item_responses?.filter(
      r => r.approval_status !== 'approved' && r.approval_status !== 'rejected'
    ) || [];
    
    if (checked) {
      setSelectedResponses(new Set(pendingResponses.map(r => r.id)));
    } else {
      setSelectedResponses(new Set());
    }
  };

  const handleBulkApprove = () => {
    if (selectedResponses.size === 0) {
      message.warning('Please select at least one item to approve');
      return;
    }
    setBulkApprovalAction('approve');
    setBulkApprovalModalVisible(true);
  };

  const handleBulkReject = () => {
    if (selectedResponses.size === 0) {
      message.warning('Please select at least one item to reject');
      return;
    }
    setBulkApprovalAction('reject');
    setBulkApprovalModalVisible(true);
  };

  const handleBulkApprovalSubmit = async () => {
    if (!currentUser || selectedResponses.size === 0 || !bulkApprovalAction) return;

    try {
      setSubmittingApproval(true);
      
      const promises = Array.from(selectedResponses).map(responseId => {
        const url = `${API_BASE_URL}/pokayoke-completed-logs/item-responses/${responseId}/approve`;
        return fetch(url, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            approval_status: bulkApprovalAction === 'approve' ? 'approved' : 'rejected',
            approved_by: currentUser.id,
            approval_comments: approvalComments,
          }),
        });
      });

      const results = await Promise.all(promises);
      
      if (results.some(r => !r.ok)) {
        throw new Error(`Failed to ${bulkApprovalAction} some items`);
      }

      // Refresh the log details
      if (selectedLogDetails) {
        const updatedResponses = selectedLogDetails.item_responses.map(item => {
          if (selectedResponses.has(item.id)) {
            return {
              ...item,
              approval_status: bulkApprovalAction === 'approve' ? 'approved' : 'rejected',
              approved_by: currentUser,
              approved_at: new Date().toISOString(),
              approval_comments: approvalComments,
            };
          }
          return item;
        });

        setSelectedLogDetails(prev => ({
          ...prev,
          item_responses: updatedResponses,
        }));
      }

      message.success(`${selectedResponses.size} item(s) ${bulkApprovalAction === 'approve' ? 'approved' : 'rejected'} successfully`);
      setBulkApprovalModalVisible(false);
      setSelectedResponses(new Set());
      setBulkApprovalAction(null);
      setApprovalComments('');
    } catch (error) {
      message.error(error.message || `Failed to ${bulkApprovalAction} items`);
    } finally {
      setSubmittingApproval(false);
    }
  };

  const columns = [
    {
      title: 'ID',
      key: 'sl_no',
      width: 70,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklist',
      key: 'checklist',
      width: 200,
      className: 'table-header-styled',
      render: (checklist) => <Text strong>{checklist?.name || '-'}</Text>,
    },
    {
      title: 'Machine',
      dataIndex: 'machine',
      key: 'machine',
      width: 260,
      className: 'table-header-styled',
      render: (machine) => (
        <div style={{ whiteSpace: 'normal' }}>
          <Text>{machine ? `${machine.make} ${machine.model || ''}` : '-'}</Text>
        </div>
      ),
    },
    {
      title: 'Frequency',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 120,
      className: 'table-header-styled',
      render: (frequency, record) => {
        const shift = record?.shift;
        return (
          <div>
            {frequency ? (
              <Tag color="blue" style={{ borderRadius: '12px' }}>
                {frequency}{shift ? ` (${shift})` : ''}
              </Tag>
            ) : (
              '-'
            )}
          </div>
        );
      },
    },
    {
      title: 'Operator',
      dataIndex: 'operator',
      key: 'operator',
      width: 160,
      className: 'table-header-styled',
      render: (operator) => operator?.user_name || '-',
    },
    {
      title: 'Completed At',
      dataIndex: 'completed_at',
      key: 'completed_at',
      width: 220,
      className: 'table-header-styled',
      sorter: (a, b) =>
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime(),
      render: (date) => formatDateTime(date),
    },
    {
      title: 'Status',
      dataIndex: 'all_items_passed',
      key: 'status',
      width: 140,
      align: 'center',
      className: 'table-header-styled',
      render: (value) => getStatusTag(value),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Button
          type="text"
          icon={<FileTextOutlined />}
          onClick={() => handleViewDetails(record)}
        />
      ),
    },
  ];

  const responseColumns = [
    {
      title: (
        <Checkbox
          checked={selectedResponses.size > 0 && selectedLogDetails?.item_responses?.filter(
            r => r.approval_status !== 'approved' && r.approval_status !== 'rejected'
          )?.length === selectedResponses.size}
          onChange={(e) => handleSelectAll(e.target.checked)}
          disabled={!selectedLogDetails?.item_responses?.some(
            r => r.approval_status !== 'approved' && r.approval_status !== 'rejected'
          )}
        />
      ),
      key: 'select',
      width: 50,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Checkbox
          checked={selectedResponses.has(record.id)}
          onChange={() => handleSelectResponse(record.id)}
          disabled={record.approval_status === 'approved' || record.approval_status === 'rejected'}
        />
      ),
    },
    {
      title: 'Checklist Item',
      key: 'item_id',
      width: 220,
      className: 'table-header-styled',
      render: (_, record) => getItemText(record),
    },
    {
      title: 'Response',
      dataIndex: 'response_value',
      key: 'response_value',
      width: 120,
      className: 'table-header-styled',
    },
    {
      title: 'Status',
      dataIndex: 'is_confirming',
      key: 'is_confirming',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (value) => getResponseStatusTag(value),
    },
    {
      title: 'Approval',
      dataIndex: 'approval_status',
      key: 'approval_status',
      width: 110,
      align: 'center',
      className: 'table-header-styled',
      render: (value, record) => (
        <div>
          {getApprovalStatusTag(value)}
          {record.approver && (
            <div style={{ fontSize: '11px', marginTop: 4, color: '#666' }}>
              <UserOutlined /> {record.approver.user_name || 'Unknown'}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 140,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Space size="small">
        <Tooltip title="Approve">
          <Button
            type="text"
            size="small"
            icon={<CheckOutlined style={{ color: '#52c41a' }} />}
            onClick={() => handleApproveClick(record)}
            disabled={record.approval_status === 'approved' || record.approval_status === 'rejected'}
          />
        </Tooltip>
        <Tooltip title="Reject">
          <Button
            type="text"
            size="small"
            icon={<CloseOutlined style={{ color: '#ff4d4f' }} />}
            onClick={() => handleRejectClick(record)}
            disabled={record.approval_status === 'approved' || record.approval_status === 'rejected'}
          />
        </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      className: 'table-header-styled',
      render: (date) => formatDateTime(date),
    },
  ];

  return (
    <div>
     

      <Card
        style={{
          borderRadius: '12px',
          border: '1px solid #f0f0f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
          marginBottom: '16px',
        }}
        bodyStyle={{ padding: '16px 20px' }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div style={{ flex: '0 0 450px', maxWidth: '100%' }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Machine
            </Text>
            <Select
              allowClear
              placeholder="Select Machine"
              loading={machinesLoading}
              onFocus={() => fetchMachines()}
              style={{ width: '100%' }}
              value={selectedMachine}
              onChange={handleMachineChange}
              showSearch
              optionFilterProp="children"
            >
              {machines.map((machine) => (
                <Option key={machine.id} value={machine.id}>
                  {getMachineLabel(machine.id)}
                </Option>
              ))}
            </Select>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{
              borderRadius: '50%',
            }}
          />
        </div>
      </Card>

      <Table
        columns={columns}
        dataSource={logs}
        loading={loading}
        rowKey="id"
        size="small"
        scroll={{ x: 1100 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total, range) =>
            `${range[0]}-${range[1]} of ${total} items`,
          pageSizeOptions: ['10', '20', '50', '100'],
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize });
            console.log('Page changed to:', page, 'Page size:', pageSize);
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
            console.log('Page size changed to:', size);
          },
        }}
        style={{
          background: '#fff',
          borderRadius: '8px',
        }}
      />

      <Modal
        title={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Checklist Completion Details</span>
              {selectedLogDetails && (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 13,
                  }}
                >
                  {selectedLogDetails.all_items_passed ? (
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  )}
                  <span>
                    {selectedLogDetails.all_items_passed
                      ? 'All Items Passed'
                      : 'Has Failures'}
                  </span>
                </span>
              )}
            </div>
          </div>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Button onClick={() => setDetailModalVisible(false)}>Close</Button>
        }
        width={900}
      >
        {selectedLogDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
                bordered={false}
                style={{ background: '#fafafa', borderRadius: 8 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    rowGap: 8,
                    columnGap: 40,
                  }}
                >
                  <div>
                    <Text type="secondary">Checklist</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.checklist?.name || '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Machine</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.machine ? `${selectedLogDetails.machine.make} ${selectedLogDetails.machine.model || ''}` : '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Operator</Text>
                    <div style={{ fontWeight: 500 }}>
                      {selectedLogDetails.operator?.user_name || '-'}
                    </div>
                  </div>
                  <div>
                    <Text type="secondary">Completed At</Text>
                    <div style={{ fontWeight: 500 }}>
                      {formatDateTime(selectedLogDetails.completed_at)}
                    </div>
                  </div>
                </div>
              </Card>

              <Card
                bordered={false}
                style={{
                  background: '#f5f9ff',
                  borderRadius: 8,
                }}
              >
                <Text strong style={{ display: 'block', marginBottom: 8 }}>
                  Operator Comments
                </Text>
                <div style={{ minHeight: 40 }}>
                  {selectedLogDetails.comments || '-'}
                </div>
              </Card>

              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <Text strong>Checklist Responses</Text>
                  {selectedResponses.size > 0 && (
                    <Space size="small">
                      <Button
                        type="primary"
                        size="small"
                        onClick={handleBulkApprove}
                      >
                        Approve Selected ({selectedResponses.size})
                      </Button>
                      <Button
                        danger
                        size="small"
                        onClick={handleBulkReject}
                      >
                        Reject Selected ({selectedResponses.size})
                      </Button>
                    </Space>
                  )}
                </div>
                <Table
                  columns={responseColumns}
                  dataSource={selectedLogDetails.item_responses || []}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                  style={{
                    background: '#fff',
                    borderRadius: 8,
                  }}
                />
              </div>
            </div>
          )}
      </Modal>

      <Modal
        title={
          approvalAction === 'approve'
            ? 'Approve Checklist Item'
            : 'Reject Checklist Item'
        }
        open={approvalModalVisible}
        onCancel={() => {
          setApprovalModalVisible(false);
          setSelectedResponse(null);
          setApprovalAction(null);
          setApprovalComments('');
        }}
        onOk={handleApprovalSubmit}
        confirmLoading={submittingApproval}
        okText={approvalAction === 'approve' ? 'Approve' : 'Reject'}
        okButtonProps={{
          type: approvalAction === 'approve' ? 'primary' : 'default',
          danger: approvalAction === 'reject',
        }}
      >
        <div style={{ marginTop: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Item
          </Text>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            {selectedResponse?.item?.item_text || '-'}
          </div>

          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Response
          </Text>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
            {selectedResponse?.response_value || '-'} ({selectedResponse?.is_confirming ? 'Passed' : 'Failed'})
          </div>

          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Comments
          </Text>
          <Input.TextArea
            rows={3}
            value={approvalComments}
            onChange={(e) => setApprovalComments(e.target.value)}
            placeholder={`Add comments for ${approvalAction === 'approve' ? 'approval' : 'rejection'}...`}
          />
        </div>
      </Modal>

      <Modal
        title={
          bulkApprovalAction === 'approve'
            ? `Approve ${selectedResponses.size} Item(s)`
            : `Reject ${selectedResponses.size} Item(s)`
        }
        open={bulkApprovalModalVisible}
        onCancel={() => {
          setBulkApprovalModalVisible(false);
          setSelectedResponses(new Set());
          setBulkApprovalAction(null);
          setApprovalComments('');
        }}
        onOk={handleBulkApprovalSubmit}
        confirmLoading={submittingApproval}
        okText={bulkApprovalAction === 'approve' ? 'Approve All' : 'Reject All'}
        okButtonProps={{
          type: bulkApprovalAction === 'approve' ? 'primary' : 'default',
          danger: bulkApprovalAction === 'reject',
        }}
      >
        <div style={{ marginTop: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Selected Items
          </Text>
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
            {selectedLogDetails?.item_responses
              ?.filter(r => selectedResponses.has(r.id))
              .map(r => (
                <div key={r.id} style={{ marginBottom: 4 }}>
                  {r.item?.item_text || '-'}
                </div>
              ))}
          </div>

          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            Comments
          </Text>
          <Input.TextArea
            rows={3}
            value={approvalComments}
            onChange={(e) => setApprovalComments(e.target.value)}
            placeholder={`Add comments for ${bulkApprovalAction === 'approve' ? 'approval' : 'rejection'}...`}
          />
        </div>
      </Modal>
    </div>
  );
};

export default PokaYokeCompletedLogs;
