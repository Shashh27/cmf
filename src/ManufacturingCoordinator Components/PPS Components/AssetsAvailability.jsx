import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import Lottie from "lottie-react";
import warningAnimation from "../assets/warning.json";

import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";


dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import { Card, Row, Col, Tabs, Table, Tag, Statistic, message, Spin, Button, Modal, Form, Select, DatePicker, Input, Popconfirm, Calendar, Radio, Space } from "antd";
import { 
  CheckCircleOutlined, 
  ExclamationCircleOutlined, 
  InfoCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";

const { TabPane } = Tabs;
const { Option } = Select;
const { TextArea } = Input;
const { Search } = Input;


const AssetAvailability = () => {
  const [machineData, setMachineData] = useState(null);
  const [downtimeLogs, setDowntimeLogs] = useState([]);
  const [calendarDowntimes, setCalendarDowntimes] = useState([]);
  const [selectedDateDowntimes, setSelectedDateDowntimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downtimeLoading, setDowntimeLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("machine-status");
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [updateForm] = Form.useForm();
  const [updateLoading, setUpdateLoading] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [shiftForm] = Form.useForm();
  const [isWorkingDay, setIsWorkingDay] = useState(true);

  // Search and Pagination states
  const [machineSearchText, setMachineSearchText] = useState(null);
  const [logSearchText, setLogSearchText] = useState(null);
  const [machinePageSize, setMachinePageSize] = useState(10);
  const [logPageSize, setLogPageSize] = useState(10);

  // Get unique machine names for dropdown
  const getMachineOptions = () => {
    if (!machineData?.statuses) return [];
    const uniqueNames = [...new Set(machineData.statuses.map(item => item.machine_make))];
    return uniqueNames.map(name => ({ label: name, value: name }));
  };

  useEffect(() => {
    fetchMachineStatus();
  }, []);

  useEffect(() => {
    if (activeTab === "downtime-logs") {
      fetchDowntimeLogs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "shift-hours") {
      fetchShiftConfigs();
      fetchCurrentBreakdowns();
    }
  }, [activeTab]);

  const fetchDowntimeLogs = async () => {
    try {
      setDowntimeLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-downtime/`);
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched downtime logs:', data);
        const logsWithKeys = (data || []).map((log, idx) => ({
          ...log,
          tempId: log.id || `${log.machine_id}-${idx}-${Date.now()}`
        }));
        setDowntimeLogs(logsWithKeys);
      } else {
        console.error("Failed to fetch downtime logs:", response.statusText);
        message.error("Failed to fetch downtime logs");
      }
    } catch (error) {
      console.error("Error fetching downtime logs:", error);
      message.error("Error fetching downtime logs");
    } finally {
      setDowntimeLoading(false);
    }
  };

  const fetchShiftConfigs = async () => {
    try {
      setShiftLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched shift configs:', data);
        setShiftConfigs(data);
      } else {
        console.error("Failed to fetch shift configs:", response.statusText);
        message.error("Failed to fetch shift configurations");
      }
    } catch (error) {
      console.error("Error fetching shift configs:", error);
      message.error("Error fetching shift configurations");
    } finally {
      setShiftLoading(false);
    }
  };


// const fetchCalendarDowntimes = async () => {
//   try {
//     const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-downtime/`);
//     if (response.ok) {
//       const data = await response.json();
//       setCalendarDowntimes(data);
//     }
//   } catch (err) {
//     console.error("Downtime fetch error", err);
//   }
// };

const fetchCurrentBreakdowns = async () => {
  try {
    const res = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-status/`);
    const data = await res.json();

    const breakdowns = data.statuses.filter(m => m.status_id === 2);

    setCalendarDowntimes(breakdowns);
  } catch (err) {
    console.error("breakdown fetch error", err);
  }
};



  const handleDateSelect = (date) => {
  const dateStr = date.format('YYYY-MM-DD');
  setSelectedDate(date);

  const machines = getDowntimesForDate(date);
  setSelectedDateDowntimes(machines);

  // existing logic stays
  const existingConfig = shiftConfigs.find(config => 
    dayjs(config.date).format('YYYY-MM-DD') === dateStr
  );

  if (existingConfig) {
    setCurrentConfig(existingConfig);
    setIsWorkingDay(existingConfig.working_day);
    shiftForm.setFieldsValue({
      working_day: existingConfig.working_day,
      number_of_shifts: existingConfig.number_of_shifts
    });
  } else {
    setCurrentConfig(null);
    setIsWorkingDay(true);
    shiftForm.resetFields();
    shiftForm.setFieldsValue({
      working_day: true,
      number_of_shifts: 2
    });
  }
};

  const handleSaveShiftConfig = async (values) => {
    if (!selectedDate) {
      message.error('Please select a date first');
      return;
    }

    try {
      setShiftLoading(true);
      const dateStr = selectedDate.format('YYYY-MM-DD');
      const payload = {
        date: dateStr,
        working_day: values.working_day,
        number_of_shifts: values.working_day ? values.number_of_shifts : 0
      };

      let response;
      if (currentConfig) {
        // Update existing config
        response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/${currentConfig.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new config
        response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (response.ok) {
        const savedConfig = await response.json();
        message.success('Shift configuration saved successfully');
        
        // Update local state
        if (currentConfig) {
          setShiftConfigs(prev => prev.map(config => 
            config.id === currentConfig.id ? savedConfig : config
          ));
        } else {
          setShiftConfigs(prev => [...prev, savedConfig]);
        }
        
        setCurrentConfig(savedConfig);
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to save shift configuration');
      }
    } catch (error) {
      console.error('Error saving shift config:', error);
      message.error('Error saving shift configuration');
    } finally {
      setShiftLoading(false);
    }
  };

  const handleClearConfig = () => {
    shiftForm.resetFields();
    shiftForm.setFieldsValue({
      working_day: true,
      number_of_shifts: 2
    });
    setCurrentConfig(null);
    setIsWorkingDay(true);
  };

  const handleRefresh = () => {
    fetchShiftConfigs();
  };

  const getDateCellData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    const config = shiftConfigs.find(config => 
      dayjs(config.date).format('YYYY-MM-DD') === dateStr
    );
    return config;
  };


  const getDowntimesForDate = (date) => {
  return calendarDowntimes.filter(m => {
    if (m.status_id !== 2) return false;

    const start = dayjs(m.available_from).startOf("day");
    const end = m.available_to
      ? dayjs(m.available_to).endOf("day")
      : dayjs().endOf("day");

    return date.isSameOrAfter(start) && date.isSameOrBefore(end);
  });
};

  const dateCellRender = (value) => {
  const config = getDateCellData(value);
  const downtimes = getDowntimesForDate(value);

  return (
    <div
      style={{
        position: "relative",   // IMPORTANT
        textAlign: "center",
        minHeight: 60
      }}
    >
      {/* 🚨 TOP LEFT ALERT ICON */}
      {downtimes.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            zIndex: 2
          }}
        >
          <Lottie
            animationData={warningAnimation}
            loop
            autoplay
            style={{ width: 35, height: 35}}
            speed={3.0}
          />
        </div>
      )}

      {/* Normal Work/Off Block */}
      {config && (
        <div
          style={{
            background: config.working_day ? "#e6f7ff" : "#fff2e8",
            padding: "2px 4px",
            borderRadius: "4px",
            fontSize: "12px"
          }}
        >
          <div style={{ color: config.working_day ? "#1890ff" : "#fa8c16" }}>
            {config.working_day ? "Work" : "Off"}
          </div>
          <div style={{ color: "#666" }}>
            {config.number_of_shifts} shift
          </div>
        </div>
      )}
    </div>
  );
};

  const handleWorkingDayChange = (e) => {
    const isWorking = e.target.value;
    setIsWorkingDay(isWorking);
    
    // Reset number of shifts to default when switching to non-working day
    if (!isWorking) {
      shiftForm.setFieldsValue({ number_of_shifts: 0 });
    } else {
      // Set to 2 shifts when switching back to working day
      shiftForm.setFieldsValue({ number_of_shifts: 2 });
    }
  };

  const handleDeleteDowntime = async (record) => {
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-downtime/${record.machine_id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        message.success('Downtime record deleted successfully');
        // Refresh the downtime logs
        fetchDowntimeLogs();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to delete downtime record');
      }
    } catch (error) {
      console.error('Error deleting downtime record:', error);
      message.error('Error deleting downtime record');
    }
  };

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
    };
    
    // Only set dates if they exist and are valid using dayjs
    try {
      if (machine.available_from) {
        const fromDate = dayjs(machine.available_from);
        if (fromDate.isValid()) {
          formValues.available_from = fromDate;
        }
      }
      
      if (machine.available_to) {
        const toDate = dayjs(machine.available_to);
        if (toDate.isValid()) {
          formValues.available_to = toDate;
        }
      }
    } catch (error) {
      console.warn('Error parsing dates:', error);
    }
    
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

  // Table columns for downtime logs
  const downtimeColumns = [
    {
      title: "Machine Name",
      dataIndex: "machine_name",
      key: "machine_name",
      sorter: (a, b) => a.machine_name.localeCompare(b.machine_name),
    },
    {
      title: "Status Name",
      dataIndex: "status_name",
      key: "status_name",
      render: (status) => {
        let color = "default";
        if (status?.toLowerCase() === 'on' || status?.toLowerCase().includes('active') || status?.toLowerCase().includes('running')) {
          color = "green";
        } else if (status?.toLowerCase() === 'off' || status?.toLowerCase().includes('inactive') || status?.toLowerCase().includes('down')) {
          color = "red";
        } else if (status?.toLowerCase().includes('maintenance')) {
          color = "orange";
        }
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "Start Time",
      dataIndex: "start_time",
      key: "start_time",
      render: (date) => date ? new Date(date).toLocaleString() : "N/A",
      sorter: (a, b) => new Date(a.start_time) - new Date(b.start_time),
    },
    {
      title: "End Time",
      dataIndex: "end_time",
      key: "end_time",
      render: (date) => date ? new Date(date).toLocaleString() : "N/A",
      sorter: (a, b) => {
        if (!a.end_time && !b.end_time) return 0;
        if (!a.end_time) return 1;
        if (!b.end_time) return -1;
        return new Date(a.end_time) - new Date(b.end_time);
      },
    },
    {
      title: "Duration",
      key: "duration",
      render: (_, record) => {
        if (!record.start_time) return "N/A";
        const startTime = new Date(record.start_time);
        const endTime = record.end_time ? new Date(record.end_time) : new Date();
        const duration = Math.floor((endTime - startTime) / (1000 * 60)); // minutes
        const hours = Math.floor(duration / 60);
        const minutes = duration % 60;
        return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
      },
    },
    {
      title: "Created At",
      dataIndex: "created_at",
      key: "created_at",
      render: (date) => date ? new Date(date).toLocaleString() : "N/A",
      sorter: (a, b) => new Date(a.created_at) - new Date(b.created_at),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Popconfirm
          title="Are you sure you want to delete this downtime record?"
          description="This action cannot be undone."
          onConfirm={() => handleDeleteDowntime(record)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type="primary"
            danger
            size="small"
            icon={<DeleteOutlined />}
          >
            Delete
          </Button>
        </Popconfirm>
      ),
    },
  ];

  // Table columns for machine status
  const machineStatusColumns = [
    {
      title: "Machine Name",
      dataIndex: "machine_make",
      key: "machine_make",
    },
    {
      title: "Status",
      dataIndex: "status_name",
      key: "status_name",
      render: (status) => {
        let color = "default";
        if (status?.toLowerCase() === 'on' || status?.toLowerCase().includes('active') || status?.toLowerCase().includes('running')) {
          color = "green";
        } else if (status?.toLowerCase() === 'off' || status?.toLowerCase().includes('inactive') || status?.toLowerCase().includes('down')) {
          color = "red";
        } else if (status?.toLowerCase().includes('maintenance')) {
          color = "orange";
        }
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
      ellipsis: true,
    },
    {
      title: "From",
      dataIndex: "available_from",
      key: "available_from",
      render: (date) => date ? new Date(date).toLocaleString() : "N/A",
    },
    {
      title: "To",
      dataIndex: "available_to",
      key: "available_to",
      render: (date) => date ? new Date(date).toLocaleString() : "N/A",
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<EditOutlined />}
          onClick={() => handleUpdateStatus(record)}
        >
          Update Status
        </Button>
      ),
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
    <div style={{ padding: '24px' }}>
      <h2 style={{ marginBottom: '24px' }}>Asset Availability</h2>
      
      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Total Machines"
              value={getTotalMachines()}
              prefix={<InfoCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Active Machines"
              value={getActiveMachines()}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card>
            <Statistic
              title="Inactive Machines"
              value={getInactiveMachines()}
              prefix={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Tabs */}
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Machine Status" key="machine-status">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <Select
                placeholder="Filter by Machine"
                allowClear
                style={{ width: 250 }}
                value={machineSearchText}
                onChange={value => setMachineSearchText(value)}
                options={getMachineOptions()}
              />
            </div>
            <Table
              columns={machineStatusColumns}
              dataSource={(machineData?.statuses || []).filter(item => 
                !machineSearchText || item.machine_make === machineSearchText
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
            />
          </TabPane>
          <TabPane tab="Machine Logs" key="downtime-logs">
            {downtimeLoading ? (
              <div style={{ textAlign: 'center', padding: '50px' }}>
                <Spin size="large" />
                <p>Loading downtime logs...</p>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Select
                    placeholder="Filter by Machine"
                    allowClear
                    style={{ width: 250 }}
                    value={logSearchText}
                    onChange={value => setLogSearchText(value)}
                    options={getMachineOptions()}
                  />
                </div>
                <Table
                  columns={downtimeColumns}
                  dataSource={downtimeLogs.filter(item => 
                    !logSearchText || item.machine_name === logSearchText
                  )}
                  rowKey="tempId"
                  scroll={{ x: 800 }}
                  pagination={{
                    pageSize: logPageSize,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    onShowSizeChange: (current, size) => setLogPageSize(size),
                    showTotal: (total, range) => 
                      `${range[0]}-${range[1]} of ${total} items`,
                    simple: window.innerWidth < 768,
                  }}
                />
              </>
            )}
          </TabPane>
          <TabPane tab="Shift Hours Configuration" key="shift-hours">
            <div style={{ padding: window.innerWidth < 768 ? '10px' : '20px' }}>
              <Row gutter={[24, 24]}>
                {/* Left Side - Calendar */}
                <Col xs={24} lg={16}>
                  <Card 
                    title="Shift Calendar" 
                    extra={
                      <Button 
                        icon={<ReloadOutlined />} 
                        onClick={handleRefresh}
                        loading={shiftLoading}
                        size={window.innerWidth < 768 ? 'small' : 'middle'}
                      >
                        {window.innerWidth < 768 ? '' : 'Refresh Data'}
                      </Button>
                    }
                  >
                    {shiftLoading ? (
                      <div style={{ textAlign: 'center', padding: '50px' }}>
                        <Spin size="large" />
                        <p>Loading shift configurations...</p>
                      </div>
                    ) : (
                      <Calendar 
                        key={JSON.stringify(shiftConfigs)}
                        onSelect={handleDateSelect}
                        dateCellRender={dateCellRender}
                      />
                    )}
                  </Card>
                </Col>

                {/* Right Side - Configuration Panel */}
                <Col xs={24} lg={8}>
                  <Card title={selectedDate ? `Configure: ${selectedDate.format('DD MMM YYYY')}` : 'Configure: Select Date'}>
                    {selectedDate ? (
                      <Form
                        form={shiftForm}
                        layout="vertical"
                        onFinish={handleSaveShiftConfig}
                        initialValues={{
                          working_day: true,
                          number_of_shifts: 2
                        }}
                      >
                        <Form.Item
                          label="Day Type"
                          name="working_day"
                          rules={[{ required: true, message: 'Please select day type' }]}
                        >
                          <Radio.Group 
                            onChange={handleWorkingDayChange}
                            size={window.innerWidth < 768 ? 'small' : 'middle'}
                          >
                            <Radio value={true}>Working Day</Radio>
                            <Radio value={false}>Non-Working Day</Radio>
                          </Radio.Group>
                        </Form.Item>

                        <Form.Item
                          label="Number of Shifts"
                          name="number_of_shifts"
                          rules={[{ required: isWorkingDay, message: 'Please select number of shifts' }]}
                        >
                          <Radio.Group 
                            disabled={!isWorkingDay}
                            size={window.innerWidth < 768 ? 'small' : 'middle'}
                          >
                            <Radio value={1}>1 Shift</Radio>
                            <Radio value={2}>2 Shifts</Radio>
                            <Radio value={3}>3 Shifts</Radio>
                          </Radio.Group>
                        </Form.Item>

                        <Form.Item style={{ marginBottom: 0 }}>
                          <Space direction={window.innerWidth < 768 ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
                            <Button 
                              type="primary" 
                              htmlType="submit" 
                              loading={shiftLoading}
                              block={window.innerWidth < 768}
                            >
                              Save Changes
                            </Button>
                            <Button 
                              onClick={handleClearConfig}
                              block={window.innerWidth < 768}
                            >
                              Clear
                            </Button>
                          </Space>
                        </Form.Item>
                      </Form>
                    ) : (
                      <div style={{ 
                        textAlign: 'center', 
                        padding: '40px 0',
                        color: '#999'
                      }}>
                        <p>Please select a date from the calendar to configure shifts.</p>
                      </div>
                    )}
                  </Card>

                    {selectedDateDowntimes.length > 0 && (
  <Card 
    title="Machine Breakdown"
    style={{ marginTop: 16, borderColor: "#ff4d4f" }}
  >
    {selectedDateDowntimes.map((m, idx) => (
      <Card 
        key={idx}
        size="small"
        style={{ marginBottom: 10, background: "#fff1f0", borderColor: "#ffccc7" }}
      >
        <b>{m.machine_make}</b>
        <p>Status: {m.status_name}</p>
        <p>{m.description}</p>
        <p><b>Start:</b> {dayjs(m.available_from).format("DD MMM YYYY HH:mm")}</p>
        <p><b>End:</b> {m.available_to ? dayjs(m.available_to).format("DD MMM YYYY HH:mm") : "Ongoing"}</p>
      </Card>
    ))}
  </Card>
)}
                    

                  </Col>
              </Row>
            </div>
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