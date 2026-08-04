import React, { useState, useEffect } from "react";
import dayjs from "dayjs";

import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";


dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

import { SCHEDULING_API_BASE_URL } from "../../Config/schedulingconfig.js";
import { Card, Row, Col, Tabs, Table, Tag, message, Spin, Button, Modal, Form, Select, DatePicker, Input, Space, Switch } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined, ReloadOutlined, SearchOutlined, SettingOutlined, FilterOutlined, UploadOutlined, EyeOutlined, DownloadOutlined, LeftOutlined, DeleteOutlined } from "@ant-design/icons";
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
  const [machineSearchText, setMachineSearchText] = useState([]);
  const [wcSearchText, setWcSearchText] = useState([]);
  const [statusSearchText, setStatusSearchText] = useState(null);
  const [machinePageSize, setMachinePageSize] = useState(10);
  const [kpiFilter, setKpiFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  // ← NEW: track table-level filters (for Status column filter)
  const [tableFilters, setTableFilters] = useState({});

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

  const fetchMachineStatus = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
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
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  };

  const handleUpdateStatus = (machine) => {
    console.log('Machine data received:', machine);
    setSelectedMachine(machine);
    
    const nextStatusId = machine.status_id === 1 ? 2 : 1;
    setSelectedStatus(nextStatusId); 
    setUpdateModalVisible(true);
    
    updateForm.resetFields();
    
    const formValues = {
      machine_id: machine.machine_id,
      machine_name: machine.machine_make, 
      status_id: nextStatusId,
      description: machine.description || '',
      available_from: null,
      available_to: null,
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
      
      if (!currentStatusId) {
        payload.available_from = dayjs().startOf('year').format('YYYY-MM-DDTHH:mm:ss');
        payload.available_to = null;
      } else if (currentStatusId === 1 && newStatusId === 2) {
        if (!values.available_from || !values.available_to) {
          message.error('Please provide both "Available From" and "Available To" times for ON -> OFF transition');
          return;
        }
        payload.available_from = values.available_from.toISOString();
        payload.available_to = values.available_to.toISOString();
      } else if (currentStatusId === 2 && newStatusId === 1) {
        payload.available_from = new Date().toISOString();
        payload.available_to = null;
      } else {
        payload.available_from = values.available_from ? values.available_from.toISOString() : null;
        payload.available_to = values.available_to ? values.available_to.toISOString() : null;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/machine-status/machine-status/${selectedMachine.machine_id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
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
      status_id: record.status_id === 1,
      description: record.description,
      available_from: null,
      available_to: null,
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
      const newStatusId = row.status_id ? 1 : 2;
      
      let payload = {
        status_id: newStatusId,
        description: row.description || '',
        work_center_name: row.work_center_name || record.work_center_name,
        machine_make: row.machine_make || record.machine_make,
      };

      if (!currentStatusId) {
        payload.available_from = dayjs().startOf('year').format('YYYY-MM-DDTHH:mm:ss');
        payload.available_to = null;
      } else if (newStatusId === 2) {
        if (!row.available_from || !row.available_to) {
          message.error('Please provide both "From" and "To" times for OFF status');
          setUpdateLoading(false);
          return;
        }
        payload.available_from = row.available_from.toISOString();
        payload.available_to = row.available_to.toISOString();
      } else if (newStatusId === 1) {
        payload.available_from = new Date().toISOString();
        payload.available_to = null;
      }

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/machine-status/machine-status/${machineId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        const updatedData = await response.json();
        message.success('Machine status updated successfully');
        setEditingKey("");
        
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

  const shouldShowDateFields = () => {
    if (!selectedMachine || !selectedStatus) return false;
    const currentStatusId = selectedMachine.status_id;
    const newStatusId = selectedStatus;
    return currentStatusId === 1 && newStatusId === 2;
  };

  const getFieldRequirements = () => {
    if (!selectedMachine || !selectedStatus) return { fromRequired: false, toRequired: false };
    const currentStatusId = selectedMachine.status_id;
    const newStatusId = selectedStatus;
    if (currentStatusId === 1 && newStatusId === 2) {
      return { fromRequired: true, toRequired: true };
    }
    return { fromRequired: false, toRequired: false };
  };

  const getTotalMachines = () => machineData?.total_machines || machineData?.statuses?.length || 0;

  const isActiveMachine = (status) => {
    const statusName = (status.status_name || '').toLowerCase();
    return statusName.includes('active') || statusName.includes('running') ||
      statusName.includes('on') || status.status_id === 1;
  };

  const isInactiveMachine = (status) => {
    const statusName = (status.status_name || '').toLowerCase();
    return statusName.includes('inactive') || statusName.includes('down') ||
      statusName.includes('off') || statusName.includes('maintenance') ||
      status.status_id === 2 || status.status_id === 3;
  };

  const getActiveMachines = () => {
    if (!machineData?.statuses) return 0;
    return machineData.statuses.filter(isActiveMachine).length;
  };

  const getInactiveMachines = () => {
    if (!machineData?.statuses) return 0;
    return machineData.statuses.filter(isInactiveMachine).length;
  };

  const getFilteredMachineStatuses = () => {
    const base = machineData?.statuses || [];
    const machineFilters = Array.isArray(machineSearchText) ? machineSearchText : [];
    const wcFilters = Array.isArray(wcSearchText) ? wcSearchText : [];

    return base.filter(item => {
      const matchesSearch =
        (machineFilters.length === 0 || machineFilters.includes(item.machine_make)) &&
        (wcFilters.length === 0 || wcFilters.includes(item.work_center_name)) &&
        (!statusSearchText || item.status_name === statusSearchText);

      if (!matchesSearch) return false;

      if (kpiFilter === 'active') return isActiveMachine(item);
      if (kpiFilter === 'inactive') return isInactiveMachine(item);
      return true;
    });
  };

  const handleKpiClick = (filterKey) => {
    setKpiFilter(filterKey);
    setTableFilters({});
  };

  const kpiCards = [
    {
      key: 'all',
      label: 'Total Machines',
      value: getTotalMachines(),
      color: '#2f54eb',
      iconColor: '#597ef7',
      gradient: 'linear-gradient(135deg, #f0f5ff 0%, #e6f4ff 100%)',
      border: '#d6e4ff',
      ring: '#597ef7',
      icon: <SettingOutlined />,
    },
    {
      key: 'active',
      label: 'Active',
      value: getActiveMachines(),
      color: '#389e0d',
      iconColor: '#52c41a',
      gradient: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)',
      border: '#b7eb8f',
      ring: '#52c41a',
      icon: <CheckCircleOutlined />,
    },
    {
      key: 'inactive',
      label: 'Inactive',
      value: getInactiveMachines(),
      color: '#cf1322',
      iconColor: '#f5222d',
      gradient: 'linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)',
      border: '#ffa39e',
      ring: '#f5222d',
      icon: <ExclamationCircleOutlined />,
    },
  ];

  // ← NEW: handle table onChange to capture filter state
  const handleTableChange = (pagination, filters) => {
    setMachinePageSize(pagination.pageSize);
    setTableFilters(filters);
  };

  // Table columns for machine status
  const machineStatusColumns = [
    {
      title: "Machine Name",
      dataIndex: "machine_make",
      key: "machine_make",
      // ← NEW: A→Z / Z→A sorting
      sorter: (a, b) => (a.machine_make || '').localeCompare(b.machine_make || ''),
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
                  <Form.Item name="available_from" style={{ margin: 0 }}>
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
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.status_id !== currentValues.status_id ||
                prevValues.available_from !== currentValues.available_from
              }
            >
              {({ getFieldValue }) => {
                const isON = getFieldValue('status_id');
                const fromValue = getFieldValue('available_from');
                return isON ? "-" : (
                  <Form.Item name="available_to" style={{ margin: 0 }}>
                    <DatePicker
                      showTime
                      format="YYYY-MM-DD HH:mm:ss"
                      disabledDate={(current) => {
                        if (!current) return false;
                        if (fromValue) return current.isBefore(fromValue, 'day');
                        return false;
                      }}
                      disabledTime={(current) => {
                        if (!fromValue || !current) return {};
                        if (current.isSame(fromValue, 'day')) {
                          return {
                            disabledHours: () => Array.from({ length: fromValue.hour() }, (_, i) => i),
                            disabledMinutes: (selectedHour) =>
                              selectedHour === fromValue.hour()
                                ? Array.from({ length: fromValue.minute() }, (_, i) => i)
                                : [],
                            disabledSeconds: (selectedHour, selectedMinute) =>
                              selectedHour === fromValue.hour() && selectedMinute === fromValue.minute()
                                ? Array.from({ length: fromValue.second() }, (_, i) => i)
                                : [],
                          };
                        }
                        return {};
                      }}
                    />
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
      // ← NEW: ON / OFF filter options
      filters: [
        { text: 'ON', value: 1 },
        { text: 'OFF', value: 2 },
      ],
      filteredValue: kpiFilter === 'all' ? (tableFilters.status_id || null) : null,
      onFilter: kpiFilter === 'all' ? (value, record) => record.status_id === value : undefined,
      render: (statusId, record) => {
        const editable = isEditing(record);
        if (editable) {
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Form.Item name="status_id" valuePropName="checked" style={{ margin: 0 }}>
                <Switch checkedChildren="ON" unCheckedChildren="OFF" />
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
            <Form.Item name="description" style={{ margin: 0 }}>
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
              

              {/* KPI cards (left) + filters (right) */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                marginBottom: 16,
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {kpiCards.map((card) => {
                    const isSelected = kpiFilter === card.key;
                    return (
                      <div
                        key={card.key}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleKpiClick(card.key)}
                        onKeyDown={(e) => e.key === 'Enter' && handleKpiClick(card.key)}
                        style={{
                          width: 175,
                          borderRadius: 10,
                          padding: '14px 16px',
                          background: card.gradient,
                          border: `1px solid ${card.border}`,
                          boxShadow: isSelected
                            ? `0 0 0 2px ${card.ring}`
                            : '0 1px 4px rgba(0,0,0,0.08)',
                          cursor: 'pointer',
                          transition: 'box-shadow 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#64748b',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              marginBottom: 4,
                            }}>
                              {card.label}
                            </div>
                            <div style={{
                              fontSize: 26,
                              fontWeight: 700,
                              color: card.color,
                              lineHeight: 1.1,
                            }}>
                              {card.value}
                            </div>
                          </div>
                          <span style={{ fontSize: 22, color: card.iconColor, flexShrink: 0 }}>
                            {card.icon}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {kpiFilter !== 'all' && (
                    <Button type="link" size="small" style={{ padding: '0 4px', height: 'auto', fontSize: 12 }} onClick={() => handleKpiClick('all')}>
                      Show all
                    </Button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>Machine Name:</span>
                    <Select
                      mode="multiple"
                      placeholder="All Machines"
                      allowClear
                      showSearch
                      maxTagCount={1}
                      maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                      style={{ minWidth: 200 }}
                      value={machineSearchText}
                      onChange={value => setMachineSearchText(value || [])}
                      options={getMachineOptions()}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, whiteSpace: 'nowrap' }}>Work Center:</span>
                    <Select
                      mode="multiple"
                      placeholder="All Work Centers"
                      allowClear
                      showSearch
                      maxTagCount={1}
                      maxTagPlaceholder={(omitted) => `+${omitted.length} more`}
                      style={{ minWidth: 200 }}
                      value={wcSearchText}
                      onChange={value => setWcSearchText(value || [])}
                      options={getWcOptions()}
                      filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                      }
                    />
                  </div>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={() => fetchMachineStatus(true)}
                    loading={refreshing}
                    title="Refresh"
                  />
                </div>
              </div>

              {/* Table Section */}
              <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
                <Form form={inlineEditForm} component={false}>
                  <Table
                    columns={machineStatusColumns}
                    dataSource={getFilteredMachineStatuses()}
                    rowKey={(record) => record.id || record.machine_id}
                    scroll={{ x: 800 }}
                    pagination={{
                      pageSize: machinePageSize,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                      simple: window.innerWidth < 768,
                    }}
                    // ← NEW: captures filter + pagination changes
                    onChange={handleTableChange}
                    loading={refreshing}
                    className="custom-table"
                  />
                </Form>
              </div>
            </div>
          </TabPane>
          <TabPane tab="Breakdown Logs" key="downtime-logs">
            <MaintenanceSection activeTab={activeTab} machineData={machineData} />
          </TabPane>
          <TabPane tab="Shift Hours & Assignments" key="shift-hours">
            <MaintenanceSection activeTab={activeTab} machineData={machineData} />
          </TabPane>
          <TabPane tab="Leave Logs" key="leave-logs">
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
        <Form form={updateForm} layout="vertical" onFinish={handleUpdateSubmit}>
          <Form.Item label="Machine Name" name="machine_name">
            <Input disabled />
          </Form.Item>

          <Form.Item label="Status" name="status_id">
            <Select disabled>
              <Option value={1}>ON</Option>
              <Option value={2}>OFF</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Description" name="description">
            <TextArea rows={3} placeholder="Enter description (optional)" />
          </Form.Item>

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
                <Form.Item noStyle shouldUpdate={(prev, curr) => prev.available_from !== curr.available_from}>
                  {({ getFieldValue }) => {
                    const fromValue = getFieldValue('available_from');
                    return (
                      <DatePicker
                        showTime
                        style={{ width: '100%' }}
                        placeholder="Select available to date"
                        disabledDate={(current) => {
                          if (!current) return false;
                          if (fromValue) return current.isBefore(fromValue, 'day');
                          return current && current < dayjs();
                        }}
                        disabledTime={(current) => {
                          if (!fromValue || !current) return {};
                          if (current.isSame(fromValue, 'day')) {
                            return {
                              disabledHours: () => Array.from({ length: fromValue.hour() }, (_, i) => i),
                              disabledMinutes: (selectedHour) =>
                                selectedHour === fromValue.hour()
                                  ? Array.from({ length: fromValue.minute() }, (_, i) => i)
                                  : [],
                              disabledSeconds: (selectedHour, selectedMinute) =>
                                selectedHour === fromValue.hour() && selectedMinute === fromValue.minute()
                                  ? Array.from({ length: fromValue.second() }, (_, i) => i)
                                  : [],
                            };
                          }
                          return {};
                        }}
                      />
                    );
                  }}
                </Form.Item>
              </Form.Item>
            </>
          )}

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