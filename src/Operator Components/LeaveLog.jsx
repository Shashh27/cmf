import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Form, Input, Button, DatePicker, Table, message, Space, Tag,} from 'antd';
import { SearchOutlined, CalendarOutlined, ReloadOutlined } from '@ant-design/icons';
import moment from 'moment';
import { SCHEDULING_API_BASE_URL } from '../Config/schedulingconfig';

const LeaveLog = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [tableLoading, setTableLoading] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [filteredLeaves, setFilteredLeaves] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editingData, setEditingData] = useState({});

  const getOperatorId = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || user.operator_id || 12;
    } catch (e) {
      return 12;
    }
  };

  const fetchLeaves = async ({ showTableLoading = false } = {}) => {
    try {
      if (showTableLoading) setTableLoading(true);
      const operatorId = getOperatorId();
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/operator-leaves/?operator_id=${operatorId}`);
      if (response.ok) {
        const data = await response.json();
        setLeaves(data);
        setFilteredLeaves(data);
      } else {
        message.error('Failed to fetch leaves');
      }
    } catch (error) {
      message.error('Failed to fetch leaves');
    } finally {
      if (showTableLoading) setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  useEffect(() => {
    let filtered = leaves;
    if (searchText) {
      filtered = filtered.filter(leave =>
        leave.reason?.toLowerCase().includes(searchText.toLowerCase()) ||
        leave.additional_remarks?.toLowerCase().includes(searchText.toLowerCase())
      );
    }
    setFilteredLeaves(filtered);
  }, [leaves, searchText]);

  // ✅ Fixed handleSubmit — reason/additional_remarks only appended if they have values
  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const operatorId = getOperatorId();
      const fromDate = values.from_date.format('YYYY-MM-DD');
      const toDate = values.to_date.format('YYYY-MM-DD');
      const reason = values.reason || null;
      const additionalRemarks = values.additional_remarks || null;
      const leaveType = 'annual';

      let url = `${SCHEDULING_API_BASE_URL}/operator-leaves/?operator_id=${operatorId}&from_date=${fromDate}&to_date=${toDate}&leave_type=${leaveType}`;

      if (reason) {
        url += `&reason=${encodeURIComponent(reason)}`;
      }
      if (additionalRemarks) {
        url += `&additional_remarks=${encodeURIComponent(additionalRemarks)}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        message.success('Leave request submitted successfully');
        form.resetFields();
        fetchLeaves();
      } else {
        const error = await response.json();
        if (error.detail && Array.isArray(error.detail)) {
          const errorMessage = error.detail[0]?.msg || 'Failed to submit leave request';
          message.error(errorMessage);
        } else {
          message.error(error.detail || error.message || 'Failed to submit leave request');
        }
      }
    } catch (error) {
      message.error('Error submitting leave request');
    } finally {
      setLoading(false);
    }
  };

  const calculateDays = (fromDate, toDate) => {
    const start = moment(fromDate);
    const end = moment(toDate);
    return end.diff(start, 'days') + 1;
  };

  const handleEdit = (record) => {
    setEditingRow(record.id);
    setEditingData({
      ...record,
      from_date: moment(record.from_date),
      to_date: moment(record.to_date)
    });
  };

  const handleSave = async (recordId) => {
    try {
      const payload = {
        ...editingData,
        from_date: editingData.from_date.format('YYYY-MM-DD'),
        to_date: editingData.to_date.format('YYYY-MM-DD'),
        operator_id: getOperatorId(),
        leave_type: editingData.leave_type || 'annual'
      };

      const response = await fetch(`${SCHEDULING_API_BASE_URL}/operator-leaves/${recordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        message.success('Leave updated successfully');
        setEditingRow(null);
        setEditingData({});
        fetchLeaves();
      } else {
        message.error('Failed to update leave');
      }
    } catch (error) {
      message.error('Error updating leave');
    }
  };

  const handleCancel = () => {
    setEditingRow(null);
    setEditingData({});
  };

  const columns = [
    {
      title: 'From Date',
      dataIndex: 'from_date',
      key: 'from_date',
      width: 120,
      sorter: (a, b) => moment(a.from_date).unix() - moment(b.from_date).unix(),
      render: (date, record) => {
        if (editingRow === record.id) {
          return (
            <DatePicker
              size="small"
              value={editingData.from_date}
              onChange={(newDate) => setEditingData({ ...editingData, from_date: newDate })}
              format="DD-MM-YYYY"
              style={{ width: '100%' }}
            />
          );
        }
        return moment(date).format('DD-MM-YYYY');
      },
    },
    {
      title: 'To Date',
      dataIndex: 'to_date',
      key: 'to_date',
      width: 120,
      sorter: (a, b) => moment(a.to_date).unix() - moment(b.to_date).unix(),
      render: (date, record) => {
        if (editingRow === record.id) {
          return (
            <DatePicker
              size="small"
              value={editingData.to_date}
              onChange={(newDate) => setEditingData({ ...editingData, to_date: newDate })}
              format="DD-MM-YYYY"
              style={{ width: '100%' }}
            />
          );
        }
        return moment(date).format('DD-MM-YYYY');
      },
    },
    {
      title: 'Days',
      dataIndex: 'days',
      key: 'days',
      width: 60,
      render: (_, record) => calculateDays(
        editingRow === record.id ? editingData.from_date : record.from_date,
        editingRow === record.id ? editingData.to_date : record.to_date
      ),
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 150,
      render: (text, record) => {
        if (editingRow === record.id) {
          return (
            <Input
              size="small"
              value={editingData.reason}
              onChange={(e) => setEditingData({ ...editingData, reason: e.target.value })}
              style={{ width: '100%' }}
            />
          );
        }
        return text || '-';
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: 'Pending', value: 'pending' },
        { text: 'Acknowledged', value: 'acknowledged' },
      ],
      onFilter: (value, record) => record.status?.toLowerCase() === value,
      render: (status) => {
        let color = 'default';
        if (status?.toLowerCase() === 'pending') color = 'orange';
        else if (status?.toLowerCase() === 'acknowledged') color = 'blue';
        else if (status?.toLowerCase() === 'approved') color = 'green';
        else if (status?.toLowerCase() === 'rejected') color = 'red';
        return <Tag color={color}>{status || 'Unknown'}</Tag>;
      },
    },
    {
      title: 'Ack By',
      dataIndex: 'acknowledged_by',
      key: 'acknowledged_by',
      width: 120,
      render: (val, record) => val || record.approved_by_name || '-',
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh', boxSizing: 'border-box' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            bordered={false}
            title="Submit New Leave Request"
            style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}
          >
            <Form form={form} layout="vertical" onFinish={handleSubmit}>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="from_date"
                    label="From Date"
                    rules={[{ required: true, message: 'Please select from date' }]}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      format="DD-MM-YYYY"
                      disabledDate={(current) => current && current < moment().startOf('day')}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="to_date"
                    label="To Date"
                    rules={[
                      { required: true, message: 'Please select to date' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || !getFieldValue('from_date')) return Promise.resolve();
                          if (value.isBefore(getFieldValue('from_date'))) {
                            return Promise.reject(new Error('To date must be after from date'));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <DatePicker
                      style={{ width: '100%' }}
                      format="DD-MM-YYYY"
                      disabledDate={(current) => {
                        const fromDate = form.getFieldValue('from_date');
                        return current && (current < moment().startOf('day') || (fromDate && current < fromDate));
                      }}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="reason" label="Reason for Leave">
                <Input placeholder="Enter reason for leave (Optional)" />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  icon={<CalendarOutlined />}
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                >
                  Submit Request
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={14}>
          <Card
            bordered={false}
            title="My Past Requests"
            style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}
            extra={(
              <Button
                icon={<ReloadOutlined />}
                onClick={() => fetchLeaves({ showTableLoading: true })}
                loading={tableLoading}
              />
            )}
          >
            <Table
              columns={columns}
              dataSource={filteredLeaves}
              rowKey="id"
              size="small"
              loading={tableLoading}
              scroll={{ x: 700, y: '60vh' }}
              pagination={{
                pageSize: 10,
                showSizeChanger: false,
                showQuickJumper: false,
                simple: true,
                showTotal: false,
              }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default LeaveLog;