import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import Lottie from "lottie-react";
import warningAnimation from "../assets/warning.json";

import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";


dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import { Card, Row, Col, Tabs, Table, Tag, message, Spin, Button, Modal, Form, Select, DatePicker, Input, Space, Switch } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, FilterOutlined, UploadOutlined, EyeOutlined, DownloadOutlined, LeftOutlined, DeleteOutlined 
} from "@ant-design/icons";
import MaintenanceSection from "./MaintenanceSection";

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;

const AssetAvailability = () => {
  const [machineData, setMachineData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("machine-status");
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [updateForm] = Form.useForm();
  const [inlineEditForm] = Form.useForm();
  const [editingKey, setEditingKey] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  // Search and Pagination states
  const [machineSearchText, setMachineSearchText] = useState(null);
  const [wcSearchText, setWcSearchText] = useState(null);
  const [statusSearchText, setStatusSearchText] = useState(null);
  const [machinePageSize, setMachinePageSize] = useState(10);

  // Get unique machine names for dropdown
  const getMachineOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueNames = [...new Set(machineData.statuses.map(item => item.machine_make))];
    return uniqueNames.map(name => ({ label: name, value: name }));
  };

  const getWcOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueWcs = [...new Set(machineData.statuses.map(item => item.work_center_name))];
    return uniqueWcs.map(wc => ({ label: wc, value: wc }));
  };

  const getStatusOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueStatuses = [...new Set(machineData.statuses.map(item => item.status_name))];
    return uniqueStatuses.map(status => ({ label: status, value: status }));
  };

  useEffect(() => {
    fetchMachineStatus();
  }, []);

  const fetchMachineStatus = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-status/`);
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched machine status data:', data);
        setMachineData(data);
      } else {
        console.error("Failed to fetch machine status:", response.statusText);
        message.error("Failed to fetch machine status data");
      }
    } catch (error) {
      console.error("Error fetching machine status:", error);
      message.error("Error fetching machine status data");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = (machine) => {
    console.log('Machine data received:', machine);
    setSelectedMachine(machine);
    
    // Automatically set the next status: 1 (ON) -> 2 (OFF), 2 (OFF) -> 1 (ON)
    const nextStatusId = machine.status_id === 1 ? 2 : 1;
    setSelectedStatus(nextStatusId); 
    setUpdateModalVisible(true);
    
    // Reset form first to clear any previous values
    updateForm.resetFields();
    
    // Properly handle date values for the form using dayjs
    const formValues = {
      machine_id: machine.machine_id,
      machine_name: machine.machine_make, 
      status_id: nextStatusId, // Set to automatically calculated next status
      description: machine.description || '',
      available_from: null, // Start empty
      available_to: null,   // Start empty
    };
    
    console.log('Setting form values:', formValues);
    updateForm.setFieldsValue(formValues);
  };

  const handleUpdateSubmit = async (values) => {
    if (!selectedMachine) return;
    
    try {
      setUpdateLoading(true);
      let payload = {
        status_id: values.status_id,
        description: values.description || '',
      };

      const currentStatusId = selectedMachine.status_id;
      const newStatusId = values.status_id;
      
      // Case 1: Initial machine creation (no previous status)
      if (!currentStatusId) {
        payload.available_from = '2026-01-01T00:00:00';
        payload.available_to = null;
      }
      // Case 2: ON -> OFF transition
      else if (currentStatusId === 1 && newStatusId === 2) {
        // Ask user for both from and to times
        if (!values.available_from || !values.available_to) {
          message.error('Please provide both "Available From" and "Available To" times for ON -> OFF transition');
          return;
        }
        payload.available_from = values.available_from.toISOString();
        payload.available_to = values.available_to.toISOString();
      }
      // Case 3: OFF -> ON transition
      else if (currentStatusId === 2 && newStatusId === 1) {
        // From time is current time, to is null
        payload.available_from = new Date().toISOString();
        payload.available_to = null;
      }
      // Default case: use form values if provided
      else {
        payload.available_from = values.available_from ? values.available_from.toISOString() : null;
        payload.available_to = values.available_to ? values.available_to.toISOString() : null;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/machine-status/machine-status/${selectedMachine.machine_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const updatedData = await response.json();
        console.log('Update response:', updatedData);
        message.success('Machine status updated successfully');
        setUpdateModalVisible(false);
        updateForm.resetFields();
        setSelectedMachine(null);
        
        // Update local state immediately for better UX
        if (machineData?.statuses) {
          const updatedStatuses = machineData.statuses.map(status => 
            status.machine_id === selectedMachine.machine_id 
              ? { 
                  ...status, 
                  status_id: updatedData.status_id,
                  status_name: updatedData.status_name,
                  description: updatedData.description,
                  available_from: updatedData.available_from,
                  available_to: updatedData.available_to
                }
              : status
          );
          setMachineData({ ...machineData, statuses: updatedStatuses });
        }
        
        // Also refresh from server to ensure consistency
        // fetchMachineStatus();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to update machine status');
      }
    } catch (error) {
      console.error('Error updating machine status:', error);
      message.error('Error updating machine status');
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleCancelUpdate = () => {
    setUpdateModalVisible(false);
    updateForm.resetFields();
    setSelectedMachine(null);
    setSelectedStatus(null);
  };

  const isEditing = (record) => (record.id || record.machine_id).toString() === editingKey;

  const edit = (record) => {
    const key = (record.id || record.machine_id).toString();
    inlineEditForm.setFieldsValue({
      status_id: record.status_id === 1, // true for ON, false for OFF
      description: record.description,
      available_from: null, // Start empty
      available_to: null,   // Start empty
      machine_make: record.machine_make,
      work_center_name: record.work_center_name,
    });
    setEditingKey(key);
  };

  const cancel = () => {
    setEditingKey("");
  };

  const saveInlineEdit = async (record) => {
    try {
      const row = await inlineEditForm.validateFields();
      setUpdateLoading(true);
      
      const machineId = record.machine_id;
      const currentStatusId = record.status_id;
      const newStatusId = row.status_id ? 1 : 2; // true -> 1 (ON), false -> 2 (OFF)
      
      let payload = {
        status_id: newStatusId,
        description: row.description || '',
        work_center_name: row.work_center_name || record.work_center_name,
        machine_make: row.machine_make || record.machine_make,
      };

      // Case 1: Initial machine creation (no previous status)
      if (!currentStatusId) {
        payload.available_from = '2026-01-01T00:00:00';
        payload.available_to = null;
      }
      // Case 2: ON -> OFF transition (Switch OFF)
      else if (newStatusId === 2) {
        if (!row.available_from || !row.available_to) {
          message.error('Please provide both "From" and "To" times for OFF status');
          setUpdateLoading(false);
          return;
        }
        payload.available_from = row.available_from.toISOString();
        payload.available_to = row.available_to.toISOString();
      }
      // Case 3: OFF -> ON transition (Switch ON)
      else if (newStatusId === 1) {
        payload.available_from = new Date().toISOString();
        payload.available_to = null;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/machine-status/machine-status/${machineId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const updatedData = await response.json();
        message.success('Machine status updated successfully');
        setEditingKey("");
        
        // Update local state
        if (machineData?.statuses) {
          const updatedStatuses = machineData.statuses.map(status => 
            status.machine_id === machineId 
              ? { 
                  ...status, 
                  status_id: updatedData.status_id,
                  status_name: updatedData.status_name,
                  description: updatedData.description,
                  available_from: updatedData.available_from,
                  available_to: updatedData.available_to
                }
              : status
          );
          setMachineData({ ...machineData, statuses: updatedStatuses });
        }
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to update machine status');
      }
    } catch (errInfo) {
      console.log('Validate Failed:', errInfo);
    } finally {
      setUpdateLoading(false);
    }
  };

  // Helper function to determine if date fields should be shown
  const shouldShowDateFields = () => {
    if (!selectedMachine || !selectedStatus) return false;
    
    const currentStatusId = selectedMachine.status_id;
    const newStatusId = selectedStatus;
    
    // Show date fields for ON -> OFF transition
    return currentStatusId === 1 && newStatusId === 2;
  };

  // Helper function to get field requirements
  const getFieldRequirements = () => {
    if (!selectedMachine || !selectedStatus) return { fromRequired: false, toRequired: false };
    
    const currentStatusId = selectedMachine.status_id;
    const newStatusId = selectedStatus;
    
    // ON -> OFF: both fields required
    if (currentStatusId === 1 && newStatusId === 2) {
      return { fromRequired: true, toRequired: true };
    }
    
    return { fromRequired: false, toRequired: false };
  };

  // Calculate KPI values
  const getTotalMachines = () => {
    return machineData?.total_machines || 0;
  };

  const getActiveMachines = () => {
    if (!machineData?.statuses) return 0;
    return machineData.statuses.filter(status => {
      const statusName = (status.status_name || '').toLowerCase();
      return statusName.includes('active') || 
             statusName.includes('running') || 
             statusName.includes('on') ||
             status.status_id === 1; // ON status
    }).length;
  };

  const getInactiveMachines = () => {
    if (!machineData?.statuses) return 0;
    return machineData.statuses.filter(status => {
      const statusName = (status.status_name || '').toLowerCase();
      return statusName.includes('inactive') || 
             statusName.includes('down') ||
             statusName.includes('off') ||
             statusName.includes('maintenance') ||
             status.status_id === 2 || // OFF status
             status.status_id === 3; // MAINTENANCE status
    }).length;
  };

  // Table columns for machine status
  const machineStatusColumns = [
    {
      title: "Machine Name",
      dataIndex: "machine_make",
      key: "machine_make",
    },
    {
      title: "Work Center",
      dataIndex: "work_center_name",
      key: "work_center_name",
    },
    {
      title: "From",
      dataIndex: "available_from",
      key: "available_from",
      render: (date, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.status_id !== currentValues.status_id}
            >
              {({ getFieldValue }) => {
                const isON = getFieldValue('status_id');
                return isON ? "-" : (
                  <Form.Item
                    name="available_from"
                    style={{ margin: 0 }}
                  >
                    <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
                  </Form.Item>
                );
              }}
            </Form.Item>
          );
        }
        return record.status_id === 1 ? "-" : (date ? new Date(date).toLocaleString() : "N/A");
      },
    },
    {
      title: "To",
      dataIndex: "available_to",
      key: "available_to",
      render: (date, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) => prevValues.status_id !== currentValues.status_id}
            >
              {({ getFieldValue }) => {
                const isON = getFieldValue('status_id');
                return isON ? "-" : (
                  <Form.Item
                    name="available_to"
                    style={{ margin: 0 }}
                  >
                    <DatePicker showTime format="YYYY-MM-DD HH:mm:ss" />
                  </Form.Item>
                );
              }}
            </Form.Item>
          );
        }
        return record.status_id === 1 ? "-" : (date ? new Date(date).toLocaleString() : "N/A");
      },
    },
    {
      title: "Status",
      dataIndex: "status_id",
      key: "status_id",
      render: (statusId, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Form.Item name="status_id" valuePropName="checked" style={{ margin: 0 }}>
                <Switch
                  checkedChildren="ON"
                  unCheckedChildren="OFF"
                />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.status_id !== currentValues.status_id}
              >
                {({ getFieldValue }) => {
                  const isON = getFieldValue('status_id');
                  return <Tag color={isON ? "green" : "red"}>{isON ? "ON" : "OFF"}</Tag>;
                }}
              </Form.Item>
            </div>
          );
        }
        let color = "default";
        const statusName = record.status_name || '';
        if (statusId === 1 || statusName.toLowerCase() === 'on') {
          color = "green";
        } else if (statusId === 2 || statusName.toLowerCase() === 'off') {
          color = "red";
        }
        return <Tag color={color}>{statusName || (statusId === 1 ? 'ON' : 'OFF')}</Tag>;
      },
    },
    {
      title: "Remarks",
      dataIndex: "description",
      key: "description",
      render: (description, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <Form.Item
              name="description"
              style={{ margin: 0 }}
            >
              <Input.TextArea rows={2} placeholder="Machine status remarks" />
            </Form.Item>
          );
        }
        return description || "No remarks";
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => {
        const editable = isEditing(record);
        return editable ? (
          <Space>
            <Button
              type="primary"
              size="small"
              onClick={() => saveInlineEdit(record)}
              loading={updateLoading}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Save
            </Button>
              <Button size="small" danger onClick={cancel}>Cancel</Button>
          </Space>
        ) : (
          <Button
            size="small"
            disabled={editingKey !== ""}
            onClick={() => edit(record)}
            style={{ borderRadius: '4px' }}
          >
            Edit
          </Button>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <p>Loading machine status data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '0px' }}>
      {/* Tabs */}
      <Card 
        bordered={false} 
        style={{ 
          borderRadius: '16px', 
          boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
          overflow: 'hidden'
        }}
      >
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          style={{ padding: '0 16px' }}
        >
          <TabPane tab="Assets Availability" key="machine-status">
            <div style={{ padding: '24px 0' }}>
              {/* Header Section */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                marginBottom: '24px',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div>
                  <h2 style={{ 
                    margin: 0, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    fontSize: '24px'
                  }}>
                    <SettingOutlined style={{ color: '#1890ff', fontSize: '32px' }} />
                    ASSETS AVAILABILITY
                  </h2>
                  <p style={{ margin: '4px 0 0 44px', color: '#8c8c8c' }}>
                    Real-time machine status and maintenance overview
                  </p>
                </div>
              </div>

              {/* KPI Cards Section */}
              <Row gutter={[24, 24]} style={{ marginBottom: '32px' }}>
                <Col xs={24} sm={12} lg={8}>
                  <Card 
                    style={{ 
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f0f5ff 0%, #ffffff 100%)',
                      border: '1px solid #d6e4ff',
                      boxShadow: '0 4px 12px rgba(24, 144, 255, 0.08)'
                    }}
                    bodyStyle={{ padding: '20px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ color: '#597ef7', fontWeight: 600, fontSize: '16px', margin: 0 }}>Total Machines</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                          <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#2f54eb' }}>{getTotalMachines()}</span>
                          <span style={{ color: '#597ef7', fontSize: '14px' }}>Machines</span>
                        </div>
                      </div>
                      <div style={{ 
                        background: '#f0f5ff', 
                        padding: '12px', 
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <InfoCircleOutlined style={{ fontSize: '24px', color: '#597ef7' }} />
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                  <Card 
                    style={{ 
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #f6ffed 0%, #ffffff 100%)',
                      border: '1px solid #d9f7be',
                      boxShadow: '0 4px 12px rgba(82, 196, 26, 0.08)'
                    }}
                    bodyStyle={{ padding: '20px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ color: '#52c41a', fontWeight: 600, fontSize: '16px', margin: 0 }}>Active Machines</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                          <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#389e0d' }}>{getActiveMachines()}</span>
                          <span style={{ color: '#52c41a', fontSize: '14px' }}>Machines</span>
                        </div>
                      </div>
                      <div style={{ 
                        background: '#f6ffed', 
                        padding: '12px', 
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a' }} />
                      </div>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} sm={12} lg={8}>
                  <Card 
                    style={{ 
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #fff1f0 0%, #ffffff 100%)',
                      border: '1px solid #ffa39e',
                      boxShadow: '0 4px 12px rgba(255, 77, 79, 0.08)'
                    }}
                    bodyStyle={{ padding: '20px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ color: '#f5222d', fontWeight: 600, fontSize: '16px', margin: 0 }}>Inactive Machines</p>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
                          <span style={{ fontSize: '32px', fontWeight: 'bold', color: '#cf1322' }}>{getInactiveMachines()}</span>
                          <span style={{ color: '#f5222d', fontSize: '14px' }}>Machines</span>
                        </div>
                      </div>
                      <div style={{ 
                        background: '#fff1f0', 
                        padding: '12px', 
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <ExclamationCircleOutlined style={{ fontSize: '24px', color: '#f5222d' }} />
                      </div>
                    </div>
                  </Card>
                </Col>
              </Row>

              {/* Filters Section */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                alignItems: 'center',
                marginBottom: '16px',
                flexWrap: 'wrap',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 500 }}>Machine Name:</span>
                    <Select
                      placeholder={<span><SearchOutlined /> All Machines</span>}
                      allowClear
                      showSearch
                      style={{ width: 180 }}
                      value={machineSearchText}
                      onChange={value => setMachineSearchText(value)}
                      options={getMachineOptions()}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 500 }}>Work Center:</span>
                    <Select
                      placeholder={<span><SearchOutlined /> All Work Centers</span>}
                      allowClear
                      showSearch
                      style={{ width: 180 }}
                      value={wcSearchText}
                      onChange={value => setWcSearchText(value)}
                      options={getWcOptions()}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 500 }}>Status:</span>
                    <Select
                      placeholder={<span><FilterOutlined /> All Statuses</span>}
                      allowClear
                      style={{ width: 180 }}
                      value={statusSearchText}
                      onChange={value => setStatusSearchText(value)}
                      options={getStatusOptions()}
                    />
                  </div>
                </div>
              </div>

              {/* Table Section */}
              <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                <Form form={inlineEditForm} component={false}>
                  <Table
                    columns={machineStatusColumns}
                    dataSource={(machineData?.statuses || []).filter(item => 
                      (!machineSearchText || item.machine_make === machineSearchText) &&
                      (!wcSearchText || item.work_center_name === wcSearchText) &&
                      (!statusSearchText || item.status_name === statusSearchText)
                    )}
                    rowKey={(record) => record.id || record.machine_id}
                    scroll={{ x: 800 }}
                    pagination={{
                      pageSize: machinePageSize,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      onShowSizeChange: (current, size) => setMachinePageSize(size),
                      showTotal: (total, range) => 
                        `${range[0]}-${range[1]} of ${total} items`,
                      simple: window.innerWidth < 768,
                    }}
                    className="custom-table"
                  />
                </Form>
              </div>
            </div>
          </TabPane>
          <TabPane tab="Breakdown Logs" key="downtime-logs">
            <MaintenanceSection activeTab={activeTab} machineData={machineData} />
          </TabPane>
          <TabPane tab="Shift Hours Configuration" key="shift-hours">
            <MaintenanceSection activeTab={activeTab} machineData={machineData} />
          </TabPane>
        </Tabs>
      </Card>

      {/* Update Status Modal */}
      <Modal
        title={`Update Status - ${selectedMachine?.machine_make}`}
        open={updateModalVisible}
        onCancel={handleCancelUpdate}
        footer={null}
        width={window.innerWidth < 768 ? '95%' : 600}
        centered={window.innerWidth < 768}
      >
        <Form
          form={updateForm}
          layout="vertical"
          onFinish={handleUpdateSubmit}
        >
          <Form.Item
            label="Machine Name"
            name="machine_name"
          >
            <Input disabled />
          </Form.Item>

          <Form.Item
            label="Status"
            name="status_id"
          >
            <Select disabled>
              <Option value={1}>ON</Option>
              <Option value={2}>OFF</Option>
            </Select>
          </Form.Item>

          <Form.Item
            label="Description"
            name="description"
          >
            <TextArea 
              rows={3} 
              placeholder="Enter description (optional)"
            />
          </Form.Item>

          {/* Dynamic Date Fields - Only show for ON -> OFF transition */}
          {shouldShowDateFields() && (
            <>
              <Form.Item
                label="From"
                name="available_from"
                rules={[{ required: getFieldRequirements().fromRequired, message: 'Please select available from date' }]}
              >
                <DatePicker
                  showTime
                  style={{ width: '100%' }}
                  placeholder="Select available from date"
                  disabledDate={(current) => current && current < dayjs()}
                />
              </Form.Item>

              <Form.Item
                label="To"
                name="available_to"
                rules={[{ required: getFieldRequirements().toRequired, message: 'Please select available to date' }]}
              >
                <DatePicker
                  showTime
                  style={{ width: '100%' }}
                  placeholder="Select available to date"
                  disabledDate={(current) => current && current < dayjs()}
                />
              </Form.Item>
            </>
          )}

          {/* Info message for automatic date handling */}
          {selectedMachine && selectedStatus && !shouldShowDateFields() && (
            <div style={{ 
              padding: '12px', 
              backgroundColor: '#f0f8ff', 
              border: '1px solid #91d5ff', 
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <small style={{ color: '#1890ff' }}>
                {selectedMachine.status_id === 2 && selectedStatus === 1 
                  ? 'Note: Available From will be set to current time and Available To will be null for OFF -> ON transition.'
                  : selectedMachine.status_id === 1 && selectedStatus === 2
                  ? 'Please provide both Available From and Available To times for ON -> OFF transition.'
                  : 'Date fields will be handled automatically based on the status transition.'
                }
              </small>
            </div>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space direction={window.innerWidth < 768 ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
              <Button 
                onClick={handleCancelUpdate} 
                style={{ marginRight: window.innerWidth < 768 ? 0 : 8 }}
                block={window.innerWidth < 768}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={updateLoading}
                block={window.innerWidth < 768}
              >
                Update Status
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AssetAvailability;