import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Modal, Card, Tag, message, Typography, Space, Input, Select, DatePicker, Tooltip, Empty } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, SafetyCertificateOutlined, SearchOutlined, ReloadOutlined, CheckSquareOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TextArea } = Input;

// ── Highlight helper ──────────────────────────────────────────────────────────
const highlightText = (text, query) => {
  if (!query || !text) return text ?? '-';
  const str = String(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = str.split(new RegExp(`(${escaped})`, 'gi'));
  if (parts.length === 1) return str;
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#bae0ff', color: 'inherit', padding: '0 1px', borderRadius: 2 }}>
            {part}
          </mark>
        ) : part
      )}
    </>
  );
};

const PokaYokeOperationChecklist = () => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [dateRange, setDateRange] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [actionModal, setActionModal] = useState({
    visible: false,
    submission: null,
    action: '',
    remarks: '',
  });

  const API_BASE_URL = 'http://172.18.7.89:8000/api/v1';

  const getSupervisorId = () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try { return JSON.parse(storedUser).id; }
      catch (e) { console.error('Error parsing user from localStorage', e); }
    }
    return null;
  };

  const supervisorId = getSupervisorId();

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/operation-checklists/submissions`);
      if (response.ok) {
        const data = await response.json();
        const sortedData = (data || []).sort((a, b) => {
          const dateA = a.submitted_at ? dayjs(a.submitted_at).valueOf() : 0;
          const dateB = b.submitted_at ? dayjs(b.submitted_at).valueOf() : 0;
          return dateB - dateA;
        });
        setSubmissions(sortedData);
      } else {
        message.error('Failed to fetch submissions');
      }
    } catch (error) {
      console.error('Error fetching submissions:', error);
      message.error('Error fetching submissions');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleView = (submission) => {
    setSelectedSubmission(submission);
    setViewModalVisible(true);
  };

  const openActionModal = (submission, action) => {
    setActionModal({
      visible: true,
      submission,
      action,
      remarks: '',
    });
  };

  const closeActionModal = () => {
    setActionModal({
      visible: false,
      submission: null,
      action: '',
      remarks: '',
    });
  };

  const handleActionSubmit = async () => {
    const { submission, action, remarks } = actionModal;
    if (!submission) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/operation-checklists/submissions/${submission.id}/supervisor-action`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: action, 
          supervisor_id: supervisorId,
          sup_remarks: remarks || null,
        }),
      });
      if (response.ok) {
        message.success(`Submission ${action} successfully`);
        fetchSubmissions();
        closeActionModal();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || `Failed to ${action} submission`);
      }
    } catch (error) {
      console.error(`Error ${action}ing submission:`, error);
      message.error(`Error ${action}ing submission`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'pending':
        return 'processing';
      default:
        return 'default';
    }
  };

  const machineOptions = useMemo(() => {
    const names = new Set();
    submissions.forEach((submission) => {
      if (submission.machine) {
        const name = `${submission.machine.make} ${submission.machine.model}`.trim();
        if (name) names.add(name);
      }
    });
    return Array.from(names).sort().map(name => ({ label: name, value: name }));
  }, [submissions]);

  const filteredData = useMemo(() => {
    let result = submissions;
    if (selectedMachines.length > 0) {
      result = result.filter(submission => {
        const machineName = submission.machine ? `${submission.machine.make} ${submission.machine.model}`.trim() : '';
        return selectedMachines.includes(machineName);
      });
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(submission => [
        submission.operation?.order?.sale_order_number,
        submission.operation?.product?.product_name,
        submission.operation?.part?.part_name,
        submission.operation?.part?.part_number,
        submission.operation?.operation_name,
        submission.operation?.operation_number,
        submission.machine?.make,
        submission.machine?.model,
        submission.operator?.user_name,
        submission.status,
      ].some(f => f && String(f).toLowerCase().includes(q)));
    }
    if (dateRange && dateRange.length === 2) {
      const [startDate, endDate] = dateRange;
      result = result.filter(submission => {
        const logDate = submission.submitted_at ? dayjs(submission.submitted_at) : null;
        if (!logDate) return false;
        return logDate.isAfter(startDate.startOf('day')) && logDate.isBefore(endDate.endOf('day'));
      });
    }
    return result;
  }, [submissions, selectedMachines, searchTerm, dateRange]);

  const rowClassName = (record) => {
    if (!searchTerm) return '';
    const q = searchTerm.toLowerCase();
    const matches = [
      record.operation?.order?.sale_order_number,
      record.operation?.product?.product_name,
      record.operation?.part?.part_name,
      record.operation?.part?.part_number,
      record.operation?.operation_name,
      record.operation?.operation_number,
      record.machine?.make,
      record.machine?.model,
      record.operator?.user_name,
      record.status,
    ].some(f => f && String(f).toLowerCase().includes(q));
    return matches ? 'search-highlight-row' : '';
  };

  const columns = [
    {
      title: 'Sl No',
      key: 'sl_no',
      align: 'center',
      render: (_, __, index) => (currentPage - 1) * pageSize + index + 1,
    },
    {
      title: 'Project Details',
      key: 'project_details',
      fixed: 'left',
      sorter: (a, b) => {
        const aVal = a.operation?.order?.sale_order_number || '';
        const bVal = b.operation?.order?.sale_order_number || '';
        return String(aVal).localeCompare(String(bVal));
      },
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.order?.sale_order_number, searchTerm)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.product?.product_name, searchTerm)}</Text>
        </Space>
      ),
    },
    {
      title: 'Part Details',
      key: 'part_details',
      sorter: (a, b) => {
        const aVal = a.operation?.part?.part_name || '';
        const bVal = b.operation?.part?.part_name || '';
        return String(aVal).localeCompare(String(bVal));
      },
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.part?.part_name, searchTerm)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{highlightText(record.operation?.part?.part_number, searchTerm)}</Text>
        </Space>
      ),
    },
    {
      title: 'Operation Details',
      key: 'operation_details',
      sorter: (a, b) => {
        const aVal = a.operation?.operation_name || '';
        const bVal = b.operation?.operation_name || '';
        return String(aVal).localeCompare(String(bVal));
      },
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text strong>{highlightText(record.operation?.operation_name, searchTerm)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>#{highlightText(record.operation?.operation_number, searchTerm)}</Text>
        </Space>
      ),
    },
    {
      title: 'Operator',
      key: 'operator',
      sorter: (a, b) => {
        const aVal = a.operator?.user_name || '';
        const bVal = b.operator?.user_name || '';
        return String(aVal).localeCompare(String(bVal));
      },
      render: (_, record) => <Text style={{ fontSize: 12 }}>{highlightText(record.operator?.user_name, searchTerm)}</Text>,
    },
    {
      title: 'Machine',
      key: 'machine',
      render: (_, record) => {
        const machineName = record.machine ? `(${record.machine.make}) ${record.machine.model}`.trim() : '-';
        return <Text style={{ fontSize: 12 }}>{highlightText(machineName, searchTerm)}</Text>;
      },
    },
    {
      title: 'Submitted At',
      key: 'submitted_at',
      sorter: (a, b) => {
        const aVal = a.submitted_at ? dayjs(a.submitted_at).valueOf() : 0;
        const bVal = b.submitted_at ? dayjs(b.submitted_at).valueOf() : 0;
        return aVal - bVal;
      },
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>
          {record.submitted_at ? dayjs(record.submitted_at).format('DD-MM-YYYY, HH:mm:ss') : 'N/A'}
        </Text>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
      render: (status) => <Tag color={getStatusColor(status)}>{status?.toUpperCase()}</Tag>,
    },
    {
      title: 'Supervisor Remarks',
      dataIndex: 'sup_remarks',
      key: 'sup_remarks',
      render: (remarks) => <Text style={{ fontSize: 12 }}>{remarks || '-'}</Text>,
    },
    {
      title: 'Approved At',
      key: 'sup_action_at',
      sorter: (a, b) => {
        const aVal = a.sup_action_at ? dayjs(a.sup_action_at).valueOf() : 0;
        const bVal = b.sup_action_at ? dayjs(b.sup_action_at).valueOf() : 0;
        return aVal - bVal;
      },
      render: (_, record) => (
        <Text style={{ fontSize: 12 }}>
          {record.sup_action_at ? dayjs(record.sup_action_at).format('DD-MM-YYYY, HH:mm:ss') : 'N/A'}
        </Text>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      render: (_, record) => (
        <div style={{ display: 'flex', gap: '8px' }}>
          <Tooltip title="View Details">
            <Button
              type="text"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
              style={{ color: '#1890ff' }}
            />
          </Tooltip>
          <Tooltip title="Approve">
            <Button
              type="text"
              icon={<CheckOutlined />}
              onClick={() => openActionModal(record, 'approved')}
              style={{ color: '#52c41a' }}
              disabled={record.status !== 'pending'}
            />
          </Tooltip>
          <Tooltip title="Reject">
            <Button
              type="text"
              icon={<CloseOutlined />}
              onClick={() => openActionModal(record, 'rejected')}
              style={{ color: '#ff4d4f' }}
              disabled={record.status !== 'pending'}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td { background: #f0f8ff !important; }
        .modern-table .ant-table-tbody > tr > td { border-bottom: 1px solid #f0f0f0; }
        .search-highlight-row > td { background-color: #e6f4ff !important; }
        .search-highlight-row:hover > td { background-color: #bae0ff !important; }

        .detail-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
      `}</style>

      <Card
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#1890ff' }} />
            <Title level={4} style={{ margin: 0 }}>PokaYoke Checklist</Title>
            {refreshing && <ReloadOutlined spin />}
          </Space>
        }
        className="shadow-sm"
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <Space wrap>
            <Select
              mode="multiple"
              allowClear
              showSearch
              placeholder="Filter by machines..."
              style={{ minWidth: 250, maxWidth: 400 }}
              value={selectedMachines}
              onChange={setSelectedMachines}
              options={machineOptions}
              optionFilterProp="label"
            />
            <Input
              placeholder="Search Project, Part..."
              allowClear
              prefix={<SearchOutlined />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ minWidth: 200, maxWidth: 300 }}
            />
            <RangePicker
              allowClear
              placeholder={['Start Date', 'End Date']}
              value={dateRange}
              onChange={setDateRange}
              format="DD-MM-YYYY"
              style={{ minWidth: 250 }}
            />
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => { setRefreshing(true); fetchSubmissions(); }} loading={refreshing}>
            Refresh
          </Button>
        </div>

        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          loading={loading}
          rowClassName={rowClassName}
          className="modern-table"
          locale={{
            emptyText: (
              <Empty description={selectedMachines.length > 0 ? 'No submissions found for selected machines' : 'No submissions found'} />
            ),
          }}
          pagination={{
            current: currentPage,
            pageSize,
            total: filteredData.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, size) => { setCurrentPage(page); setPageSize(size); },
            onShowSizeChange: (_, size) => { setCurrentPage(1); setPageSize(size); },
          }}
          scroll={{ x: true }}
        />
      </Card>

      <Modal
        title={
          <Space align="center">
            <SafetyCertificateOutlined style={{ color: '#1890ff', fontSize: 18, marginRight: 8 }} />
            <span>Checklist Details</span>
          </Space>
        }
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        footer={null}
        width={700}
        destroyOnClose
      >
        {selectedSubmission && (
          <Card>
            {selectedSubmission.checklist_names && selectedSubmission.checklist_names.length > 0 ? (
              <Table
                className="detail-table"
                columns={[
                  {
                    title: 'Checklist Name',
                    dataIndex: 'checklist_name',
                    key: 'checklist_name',
                    render: (text) => <Text strong>{text}</Text>,
                  },
                  {
                    title: 'Response',
                    dataIndex: 'response',
                    key: 'response',
                    render: (response) => (
                      <Tag color={response === true ? 'success' : response === false ? 'error' : 'default'}>
                        {response === true ? 'Yes' : response === false ? 'No' : 'N/A'}
                      </Tag>
                    ),
                  },
                  {
                    title: 'Operator Remarks',
                    dataIndex: 'op_remarks',
                    key: 'op_remarks',
                    render: (remarks) => <Text>{remarks || '-'}</Text>,
                  },
                ]}
                dataSource={selectedSubmission.checklist_names}
                rowKey={(record, index) => index}
                pagination={false}
                size="small"
              />
            ) : (
              <Empty description="No checklist items available" />
            )}
          </Card>
        )}
      </Modal>

      <Modal
        title={
          <Space align="center">
            <CheckSquareOutlined style={{ color: actionModal.action === 'approved' ? '#52c41a' : '#ff4d4f', fontSize: 18, marginRight: 8 }} />
            <span>{actionModal.action === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}</span>
          </Space>
        }
        open={actionModal.visible}
        onCancel={closeActionModal}
        onOk={handleActionSubmit}
        okText={actionModal.action === 'approved' ? 'Approve' : 'Reject'}
        okButtonProps={{
          style: actionModal.action === 'approved' ? { backgroundColor: '#52c41a', borderColor: '#52c41a' } : { backgroundColor: '#ff4d4f', borderColor: '#ff4d4f' },
          loading,
        }}
        cancelText="Cancel"
        destroyOnClose
      >
        <p style={{ marginBottom: 16, color: '#595959' }}>
          {actionModal.action === 'approved' 
            ? 'Are you sure you want to approve this PokaYoke checklist submission?' 
            : 'Are you sure you want to reject this PokaYoke checklist submission?'}
        </p>

        <Text strong style={{ display: 'block', marginBottom: 6 }}>
          Remarks <Text type="secondary" style={{ fontWeight: 400 }}>(optional)</Text>
        </Text>
        <TextArea
          rows={4}
          placeholder="Enter your remarks here..."
          value={actionModal.remarks}
          onChange={(e) => setActionModal(prev => ({ ...prev, remarks: e.target.value }))}
          maxLength={500}
          showCount
        />
      </Modal>
    </div>
  );
};

export default PokaYokeOperationChecklist;
