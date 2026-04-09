import React, { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Select, message, Space, Popconfirm,Tag,Card,Typography,Input,Divider, DatePicker } from 'antd';
import { PlusOutlined, DeleteOutlined,SettingOutlined,CheckCircleOutlined,ClockCircleOutlined,ReloadOutlined,LinkOutlined } from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;

const PokaYokeMachineAssignments = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [checklists, setChecklists] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checklistsLoading, setChecklistsLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [form] = Form.useForm();

  useEffect(() => {
    if (selectedMachine) {
      fetchMachineAssignments(selectedMachine);
    }
  }, [selectedMachine]);

  const fetchChecklists = async () => {
    setChecklistsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/`);
      if (!response.ok) throw new Error('Failed to fetch checklists');
      const data = await response.json();
      setChecklists(data);
    } catch (error) {
      message.error('Failed to fetch checklists: ' + error.message);
    } finally {
      setChecklistsLoading(false);
    }
  };

  const fetchMachineAssignments = async (machineId) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/machines/${machineId}/assignments`);
      if (!response.ok) throw new Error('Failed to fetch assignments');
      const data = await response.json();
      
      // Data now includes nested checklist and items info
      const assignmentsWithDetails = data.map((assignment) => ({
        ...assignment,
        checklistName: assignment.checklist?.name || 'Unknown',
        itemsCount: assignment.checklist?.items?.length || 0
      }));
      
      setAssignments(assignmentsWithDetails);
    } catch (error) {
      message.error('Failed to fetch assignments: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignChecklist = async (values) => {
    if (!selectedMachine) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/${values.checklist_id}/assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          machine_id: selectedMachine,
          frequency: values.frequency,
          shift: values.frequency === 'Daily' ? values.shift : null,
          scheduled_day: values.frequency === 'Weekly' ? (values.dayOfWeek ? values.dayOfWeek.format('dddd') : null) : (values.frequency === 'Monthly' ? (values.dayOfMonth ? values.dayOfMonth.format('D') : null) : null)
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to assign checklist');
      }
      
      message.success('Checklist assigned successfully');
      setAssignModalVisible(false);
      form.resetFields();
      fetchMachineAssignments(selectedMachine);
    } catch (error) {
      message.error('Failed to assign checklist: ' + error.message);
    }
  };

  const handleDeleteAssignment = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/pokayoke-checklists/assignments/${id}/`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete assignment');
      
      message.success('Assignment deleted successfully');
      fetchMachineAssignments(selectedMachine);
    } catch (error) {
      message.error('Failed to delete assignment: ' + error.message);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const columns = [
    {
      title: 'SL NO',
      key: 'sl_no',
      width: 80,
      align: 'center',
      className: 'table-header-styled',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Checklist',
      dataIndex: 'checklistName',
      key: 'checklistName',
      width: 250,
      className: 'table-header-styled',
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: 'Assigned Items',
      dataIndex: 'itemsCount',
      key: 'itemsCount',
      width: 150,
      align: 'center',
      className: 'table-header-styled',
      render: (count) => (
        <Tag color="green" style={{ fontSize: '12px', padding: '2px 8px' }}>
          {count} items
        </Tag>
      ),
    },
    {
      title: 'Frequency',
      dataIndex: 'frequency',
      key: 'frequency',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      render: (freq) => freq ? (
        <Tag color="blue">{freq}</Tag>
      ) : '-',
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      width: 120,
      align: 'center',
      className: 'table-header-styled',
      render: (shift, record) => record.frequency === 'Daily' ? (
        <Tag color="orange">{shift || 'Both'}</Tag>
      ) : '-',
    },
    {
      title: 'Scheduled Day',
      dataIndex: 'scheduled_day',
      key: 'scheduled_day',
      width: 150,
      align: 'center',
      className: 'table-header-styled',
      render: (day, record) => {
        if (record.frequency === 'Weekly') return <Tag color="purple">{day}</Tag>;
        if (record.frequency === 'Monthly') return <Tag color="cyan">Day {day}</Tag>;
        return '-';
      },
    },
    {
      title: 'Assigned At',
      dataIndex: 'assigned_at',
      key: 'assigned_at',
      width: 180,
      className: 'table-header-styled',
      render: (date) => <Text type="secondary">{formatDate(date)}</Text>,
    },
    {
      title: 'Action',
      key: 'action',
      width: 100,
      align: 'center',
      className: 'table-header-styled',
      render: (_, record) => (
        <Popconfirm
          title="Are you sure you want to remove this assignment?"
          onConfirm={() => handleDeleteAssignment(record.id)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined />}
            danger
            style={{ borderRadius: '4px' }}
          />
        </Popconfirm>
      ),
    },
  ];

  const handleRefresh = () => {
    if (selectedMachine) {
      fetchMachineAssignments(selectedMachine);
    } else {
      fetchMachines();
    }
  };

  return (
    <div style={{ padding: '4px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontSize: '22px', fontWeight: 600 }}>Machine Checklist Assignments</Title>
          <Text type="secondary" style={{ fontSize: '14px', color: '#64748b' }}>
            Assign checklists to machines for operator completion
          </Text>
        </div>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            style={{ borderRadius: '6px' }}
          />
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={() => {
              if (!selectedMachine) {
                message.warning('Please select a machine before assigning a checklist');
                return;
              }
              // Fetch checklists only when opening the modal
              fetchChecklists();
              setAssignModalVisible(true);
            }}
            style={{
              background: '#1890ff',
              borderColor: '#1890ff',
              borderRadius: '6px',
              height: '40px',
              fontWeight: '500'
            }}
          >
            Assign Checklist
          </Button>
        </Space>
      </div>

      <Card 
        style={{ 
          borderRadius: '12px', 
          border: '1px solid #f0f0f0',
          boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
        }}
        bodyStyle={{ padding: '24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: '140px' }}>
            <Text strong style={{ fontSize: '14px' }}>Select Machine:</Text>
          </div>
          <div style={{ flex: '1 1 400px', minWidth: '300px' }}>
            <Select
              placeholder="Select a machine to see its assigned checklists"
              loading={machinesLoading}
              onFocus={() => fetchMachines()}
              style={{ 
                width: '100%',
                borderRadius: '6px'
              }}
              value={selectedMachine}
              onChange={setSelectedMachine}
            >
              {machines.map(machine => (
                <Option key={machine.id} value={machine.id}>
                  {machine.make} - {machine.model || 'N/A'}
                </Option>
              ))}
            </Select>
          </div>
          {selectedMachine && (
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: '1px solid #1890ff',
                  backgroundColor: '#edf5ff',
                  color: '#1890ff',
                  fontSize: '12px',
                  whiteSpace: 'nowrap',
                  maxWidth: '420px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {(() => {
                  const machine = machines.find(m => m.id === selectedMachine);
                  if (!machine) return '';
                  const parts = [];
                  if (machine.make) parts.push(machine.make);
                  if (machine.model) parts.push(machine.model);
                  return parts.join(' - ');
                })()}
              </span>
            </div>
          )}
        </div>
      </Card>

      {selectedMachine ? (
        <div style={{ marginTop: '24px' }}>
          <Title level={5} style={{ marginBottom: '16px' }}>
            Assigned Checklists - {machines.find(m => m.id === selectedMachine)?.make || 'Selected Machine'}
          </Title>
          <Table
            columns={columns}
            dataSource={assignments}
            loading={loading}
            rowKey="id"
            size="small"
            scroll={{ x: 800 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
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
            locale={{
              emptyText: (
                <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                  <SettingOutlined style={{ fontSize: '48px', marginBottom: '16px', display: 'block' }} />
                  <div>No checklists assigned to this machine</div>
                </div>
              )
            }}
          />
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
          <SettingOutlined style={{ fontSize: '64px', marginBottom: '16px', display: 'block', opacity: 0.5 }} />
          <Title level={4} type="secondary">Please select a machine</Title>
          <Text>Please select a machine to view its assigned checklists</Text>
        </div>
      )}

      {/* Assign Checklist Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PlusOutlined style={{ color: '#1890ff' }} />
            Assign Checklist to Machine
          </div>
        }
        open={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false);
          form.resetFields();
        }}
        footer={null}
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAssignChecklist}
          style={{ marginTop: '20px' }}
        >
          <Form.Item
            name="checklist_id"
            label="Select Checklist"
            rules={[{ required: true, message: 'Please select a checklist' }]}
          >
            <Select
              placeholder="Select a checklist to assign"
              loading={checklistsLoading}
              style={{ 
                width: '100%',
                borderRadius: '6px'
              }}
              showSearch
              filterOption={(input, option) => {
                const label = Array.isArray(option?.children) 
                  ? option.children.join('') 
                  : (option?.children || '');
                return label.toString().toLowerCase().includes(input.toLowerCase());
              }}
            >
              {checklists.map(checklist => (
                <Option key={checklist.id} value={checklist.id}>
                  {checklist.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="frequency"
            label="Frequency"
            rules={[{ required: true, message: 'Please select frequency' }]}
          >
            <Select placeholder="Select frequency">
              <Option value="Daily">Daily</Option>
              <Option value="Weekly">Weekly</Option>
              <Option value="Monthly">Monthly</Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.frequency !== currentValues.frequency}
          >
            {({ getFieldValue }) => {
              const frequency = getFieldValue('frequency');
              if (frequency === 'Daily') {
                return (
                  <Form.Item
                    name="shift"
                    label="Select Shift"
                    rules={[{ required: true, message: 'Please select shift' }]}
                    initialValue="Both"
                  >
                    <Select placeholder="Select shift">
                      <Option value="Morning">Morning Shift</Option>
                      <Option value="Evening">Evening Shift</Option>
                      <Option value="Both">Both</Option>
                    </Select>
                  </Form.Item>
                );
              } else if (frequency === 'Weekly') {
                return (
                  <Form.Item
                    name="dayOfWeek"
                    label="Select Day of Week"
                    rules={[{ required: true, message: 'Please select day' }]}
                  >
                    <DatePicker 
                      style={{ width: '100%' }} 
                      placeholder="Select a day"
                      format="dddd"
                    />
                  </Form.Item>
                );
              } else if (frequency === 'Monthly') {
                return (
                  <Form.Item
                    name="dayOfMonth"
                    label="Select Day of Month"
                    rules={[{ required: true, message: 'Please select date' }]}
                  >
                    <DatePicker 
                      style={{ width: '100%' }} 
                      placeholder="Select a date"
                      format="D"
                    />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>
          
          <div style={{ 
            background: '#f8f9fa', 
            padding: '12px', 
            borderRadius: '6px',
            marginBottom: '16px'
          }}>
            <Text type="secondary">
              <strong>Machine:</strong> {machines.find(m => m.id === selectedMachine)?.make || 'Selected Machine'}
            </Text>
          </div>
          
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button 
                onClick={() => {
                  setAssignModalVisible(false);
                  form.resetFields();
                }}
                style={{ borderRadius: '6px' }}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit"
                style={{
                  background: '#1890ff',
                  borderColor: '#1890ff',
                  borderRadius: '6px'
                }}
              >
                Assign Checklist
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PokaYokeMachineAssignments;
