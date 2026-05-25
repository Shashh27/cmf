import React, { useState, useEffect } from "react";
import dayjs from "dayjs";
import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import {Card,Table,Button,Modal,Form,Select,Spin,Popconfirm,Calendar,Badge,Tag,Space,Row,Col,message,} from "antd";
import { DeleteOutlined, EditOutlined, ReloadOutlined } from "@ant-design/icons";

const { Option } = Select;
const { TextArea } = Select;

const MachineAssignment = ({ activeTab, machineData }) => {
  // ================= STATE =================
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [currentConfig, setCurrentConfig] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentModalVisible, setAssignmentModalVisible] = useState(false);
  const [assignmentForm] = Form.useForm();
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [calendarDowntimes, setCalendarDowntimes] = useState([]);
  const [selectedDateDowntimes, setSelectedDateDowntimes] = useState([]);

  // ================= EFFECT =================
  useEffect(() => {
    if (activeTab === "machine-assignment") {
      fetchMachines();
      fetchOperators();
      fetchShiftConfigs();
    }
  }, [activeTab]);

  // ================= API CALLS =================
  const fetchMachines = async () => {
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/machine-status/machine-status/`);
      if (response.ok) {
        const data = await response.json();
        setMachines(data.statuses || []);
      } else {
        message.error("Failed to fetch machines");
      }
    } catch (error) {
      console.error("Error fetching machines:", error);
      message.error("Error fetching machines");
    }
  };

  const fetchOperators = async () => {
    try {
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/operators`);
      if (response.ok) {
        const data = await response.json();
        setOperators(data);
      } else {
        message.error("Failed to fetch operators");
      }
    } catch (error) {
      console.error("Error fetching operators:", error);
      message.error("Error fetching operators");
    }
  };

  const fetchShiftConfigs = async () => {
    try {
      setShiftLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
      if (response.ok) {
        const data = await response.json();
        setShiftConfigs(data);
      } else {
        message.error("Failed to fetch shift configurations");
      }
    } catch (error) {
      console.error("Error fetching shift configs:", error);
      message.error("Error fetching shift configurations");
    } finally {
      setShiftLoading(false);
    }
  };

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

  const fetchAssignments = async (shiftConfigId) => {
    if (!shiftConfigId) {
      setAssignments([]);
      return;
    }
    try {
      setAssignmentLoading(true);
      const response = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/assignments/${shiftConfigId}`);
      if (response.ok) {
        const data = await response.json();
        setAssignments(data);
      } else if (response.status === 404) {
        setAssignments([]);
      } else {
        message.error("Failed to fetch assignments");
      }
    } catch (error) {
      console.error("Error fetching assignments:", error);
      message.error("Error fetching assignments");
    } finally {
      setAssignmentLoading(false);
    }
  };

  // ================= DATE SELECT =================
  const handleDateSelect = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    setSelectedDate(date);

    const downtimeMachines = getDowntimesForDate(date);
    setSelectedDateDowntimes(downtimeMachines);

    const existingConfig = shiftConfigs.find(config =>
      dayjs(config.date).format('YYYY-MM-DD') === dateStr
    );

    if (existingConfig) {
      setCurrentConfig(existingConfig);
      fetchAssignments(existingConfig.id);
    } else {
      setCurrentConfig(null);
      setAssignments([]);
    }
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

  const getDateCellData = (date) => {
    const dateStr = date.format('YYYY-MM-DD');
    const config = shiftConfigs.find(config => 
      dayjs(config.date).format('YYYY-MM-DD') === dateStr
    );
    return config;
  };

  const handleRefresh = () => {
    fetchShiftConfigs();
    fetchCurrentBreakdowns();
  };

  const dateCellRender = (value) => {
    const config = getDateCellData(value);
    const downtimes = getDowntimesForDate(value);

    return (
      <div
        style={{
          position: "relative",
          textAlign: "center",
          minHeight: 60
        }}
      >
        {/* TOP LEFT ALERT ICON */}
        {downtimes.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 2,
              zIndex: 2,
              color: '#ff4d4f',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            ⚠️
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
              {config.number_of_shifts !== 1 ? "s" : ""}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ================= CREATE =================
  const handleCreateAssignment = async (values) => {
    try {
      setAssignmentLoading(true);
      const payload = {
        machine_id: values.machine_id,
        operator_id: values.operator_id,
        shift_config_id: values.shift_config_id,
      };

      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/shift-hours/machine/${values.machine_id}/operator/${values.operator_id}/shifts`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        message.success('Assignment created successfully');
        setAssignmentModalVisible(false);
        assignmentForm.resetFields();
        fetchAssignments(values.shift_config_id);
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || 'Failed to create assignment');
      }
    } catch (error) {
      console.error('Error creating assignment:', error);
      message.error('Error creating assignment');
    } finally {
      setAssignmentLoading(false);
    }
  };

  // ================= DELETE =================
  const handleDeleteAssignment = async (assignment) => {
    try {
      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/shift-hours/machine/${assignment.machine_id}/operator/${assignment.operator_id}/shifts/${assignment.id}`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        message.success('Assignment deleted successfully');
        fetchAssignments(currentConfig?.id);
      } else {
        message.error('Failed to delete assignment');
      }
    } catch (error) {
      console.error('Error deleting assignment:', error);
      message.error('Error deleting assignment');
    }
  };

  // ================= MODAL =================
  const openAssignmentModal = (assignment = null) => {
    setEditingAssignment(assignment);
    if (assignment) {
      assignmentForm.setFieldsValue({
        machine_id: assignment.machine_id,
        operator_id: assignment.operator_id,
        shift_config_id: assignment.shift_config_id,
      });
    } else {
      assignmentForm.resetFields();
      // Auto-prefill the shift config from the selected date
      if (currentConfig?.id) {
        assignmentForm.setFieldsValue({ shift_config_id: currentConfig.id });
      }
    }
    setAssignmentModalVisible(true);
  };

  const closeAssignmentModal = () => {
    setAssignmentModalVisible(false);
    setEditingAssignment(null);
    assignmentForm.resetFields();
  };

  // ================= TABLE COLUMNS =================
  const assignmentColumns = [
    {
      title: "Machine",
      dataIndex: "machine_id",
      key: "machine_id",
      render: (machineId, record) => {
        const machine = machines.find(m => m.machine_id === machineId);
        return machine ? `(${machine.machine_make}) ${machine.machine_model || ''}` : `Machine ID: ${machineId}`;
      },
    },
    {
      title: "Operator",
      dataIndex: "operator_id",
      key: "operator_id",
      render: (operatorId, record) => {
        const operator = operators.find(o => o.id === operatorId);
        return operator ? operator.user_name : `Operator ID: ${operatorId}`;
      },
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Popconfirm
          title="Are you sure you want to delete this assignment?"
          description="This action cannot be undone."
          onConfirm={() => handleDeleteAssignment(record)}
          okText="Yes"
          cancelText="No"
        >
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            style={{
              color: '#ff4d4f',
              transition: 'all 0.3s ease',
              padding: '4px 8px',
            }}
            className="delete-button-hover"
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.2) rotate(40deg)';
              e.currentTarget.style.color = '#ff7875';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
              e.currentTarget.style.color = '#ff4d4f';
            }}
          />
        </Popconfirm>
      ),
    },
  ];

  // ================= RENDER =================
  return (
    <div style={{ padding: window.innerWidth < 768 ? '10px' : '20px' }}>
      <Row gutter={[24, 24]}>
        {/* Left Side - Calendar */}
        <Col xs={24} lg={16}>
          <Card 
            title="Machine Assignment Calendar" 
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

        {/* Right Side - Assignments Panel */}
        <Col xs={24} lg={8}>
          {/* Selected Date Shift Info */}
          {selectedDate && (
            <Card
              size="small"
              style={{ marginBottom: 12 }}
              bodyStyle={{ padding: '10px 16px' }}
            >
              {currentConfig ? (
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {selectedDate.format('DD MMM YYYY')}
                  </div>
                  <div>
                    <Tag color={currentConfig.working_day ? 'blue' : 'orange'}>
                      {currentConfig.working_day ? 'Working Day' : 'Non-Working Day'}
                    </Tag>
                    {currentConfig.shift_timings?.map(timing => (
                      <Tag key={timing.shift_code} color="geekblue" style={{ margin: '2px' }}>
                        {timing.shift_code}: {timing.shift_start} - {timing.shift_end}
                      </Tag>
                    ))}
                  </div>
                </div>
              ) : (
                <span style={{ color: '#999' }}>
                  No shift configured for {selectedDate.format('DD MMM YYYY')}
                </span>
              )}
            </Card>
          )}

          <Card
            title={
              selectedDate
                ? `Assignments — ${selectedDate.format('DD MMM YYYY')}`
                : 'Machine-Operator Assignments'
            }
            extra={
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => openAssignmentModal()}
                size={window.innerWidth < 768 ? 'small' : 'middle'}
                disabled={!currentConfig}
                title={!currentConfig ? 'Select a date with a shift config first' : ''}
              >
                {window.innerWidth < 768 ? '' : 'New Assignment'}
              </Button>
            }
          >
            {!selectedDate ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                <p>Select a date from the calendar to view assignments.</p>
              </div>
            ) : !currentConfig ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                <p>No shift configured for this date.</p>
                <p style={{ fontSize: 12 }}>Configure a shift first in the <strong>Shift Hours Configuration</strong> tab.</p>
              </div>
            ) : assignmentLoading ? (
              <div style={{ textAlign: 'center', padding: '30px' }}>
                <Spin size="large" />
                <p>Loading assignments...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                <p>No assignments for this date.</p>
                <p style={{ fontSize: 12 }}>Click <strong>New Assignment</strong> to add one.</p>
              </div>
            ) : (
              <Table
                columns={assignmentColumns}
                dataSource={assignments}
                rowKey="id"
                scroll={{ x: 400 }}
                pagination={{
                  pageSize: 5,
                  showSizeChanger: false,
                  simple: true,
                }}
                size="small"
              />
            )}
          </Card>

          {/* Selected Date Downtimes */}
          {selectedDateDowntimes.length > 0 && (
            <Card 
              title="Machine Breakdown" 
              style={{ marginTop: 16, borderColor: "#ff4d4f" }}
              size="small"
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

      {/* Machine Assignment Modal */}
      <Modal
        title={editingAssignment ? "Edit Assignment" : "Create New Assignment"}
        open={assignmentModalVisible}
        onCancel={closeAssignmentModal}
        footer={null}
        width={window.innerWidth < 768 ? '95%' : 600}
        centered={window.innerWidth < 768}
      >
        <Form
          form={assignmentForm}
          layout="vertical"
          onFinish={handleCreateAssignment}
        >
          <Form.Item
            label="Machine"
            name="machine_id"
            rules={[{ required: true, message: 'Please select a machine' }]}
          >
            <Select
              placeholder="Select machine"
              showSearch
              optionFilterProp="label"
            >
              {machines
                .filter(machine => machine.status_name?.toLowerCase() !== 'off' && machine.status_id !== 2)
                .map(machine => (
                  <Option key={machine.machine_id} value={machine.machine_id} label={`(${machine.machine_make}) ${machine.machine_model || ''}`}>
                    ({machine.machine_make}) {machine.machine_model || ''}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Operator"
            name="operator_id"
            rules={[{ required: true, message: 'Please select an operator' }]}
          >
            <Select
              placeholder="Select operator"
              showSearch
              optionFilterProp="label"
            >
              {operators.map(operator => (
                <Option key={operator.id} value={operator.id} label={`${operator.user_name} (${operator.gmail || ''})`}>
                  {operator.user_name} ({operator.gmail || ''})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="Shift Configuration"
            name="shift_config_id"
            rules={[{ required: true, message: 'Please select a shift configuration' }]}
          >
            <Select
              placeholder="Select shift configuration"
              showSearch
              optionFilterProp="label"
              disabled={!!currentConfig}
            >
              {shiftConfigs.map(config => (
                <Option key={config.id} value={config.id} label={`${dayjs(config.date).format('DD MMM YYYY')} — ${config.working_day ? 'Working' : 'Non-Working'} (${config.number_of_shifts} shift${config.number_of_shifts !== 1 ? 's' : ''})${config.selected_shifts?.length ? ` · ${config.selected_shifts.join(', ')}` : ''}`}>
                  {dayjs(config.date).format('DD MMM YYYY')} —{' '}
                  {config.working_day ? 'Working' : 'Non-Working'} ({config.number_of_shifts} shift{config.number_of_shifts !== 1 ? 's' : ''})
                  {config.selected_shifts?.length ? ` · ${config.selected_shifts.join(', ')}` : ''}
                </Option>
              ))}
            </Select>
          </Form.Item>
          {currentConfig && (
            <div style={{
              marginTop: -12,
              marginBottom: 16,
              fontSize: 12,
              color: '#1890ff'
            }}>
              Auto-set from selected date: {dayjs(currentConfig.date).format('DD MMM YYYY')}
            </div>
          )}

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space direction={window.innerWidth < 768 ? 'vertical' : 'horizontal'} style={{ width: '100%' }}>
              <Button 
                onClick={closeAssignmentModal} 
                style={{ marginRight: window.innerWidth < 768 ? 0 : 8 }}
                block={window.innerWidth < 768}
              >
                Cancel
              </Button>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={assignmentLoading}
                block={window.innerWidth < 768}
              >
                {editingAssignment ? 'Update Assignment' : 'Create Assignment'}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MachineAssignment;