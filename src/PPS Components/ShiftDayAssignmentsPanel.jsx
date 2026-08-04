import React, { useState } from "react";
import dayjs from "dayjs";
import { SCHEDULING_API_BASE_URL } from "../Config/schedulingconfig.js";
import {
  Card, Button, Modal, Form, Select, Spin, Popconfirm, Tag, Space, Tooltip, message,
} from "antd";
import { isMachineAvailableForAssignmentOnDate } from "./breakdownDateUtils.js";
import {
  DeleteOutlined, EditOutlined, PlusOutlined, UserOutlined, ToolOutlined,
  SwapOutlined, TeamOutlined, ArrowRightOutlined, CalendarOutlined, UserSwitchOutlined,
} from "@ant-design/icons";
import "./ShiftPlanning.css";

const { Option } = Select;

const ShiftDayAssignmentsPanel = ({
  machines = [],
  operators = [],
  assignments = [],
  assignmentLoading = false,
  currentConfig = null,
  selectedDate = null,
  onAssignmentsChange,
}) => {
  const [assignmentModalVisible, setAssignmentModalVisible] = useState(false);
  const [assignmentForm] = Form.useForm();
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const getCurrentUserId = () => {
    try {
      const user = JSON.parse(localStorage.getItem("user"));
      return user?.id ?? user?.user_id ?? user?.userId ?? null;
    } catch {
      return null;
    }
  };

  const requireAssignerId = () => {
    const id = getCurrentUserId();
    if (!id) {
      message.error("Could not identify the current user. Log in as admin or manufacturing coordinator.");
    }
    return id;
  };

  const getMachineLabel = (machineId) => {
    const machine = machines.find((m) => m.machine_id === machineId);
    return machine
      ? `${machine.machine_make}${machine.machine_model ? ` · ${machine.machine_model}` : ""}`
      : `Machine #${machineId}`;
  };

  const getOperatorLabel = (operatorId) => {
    const operator = operators.find((o) => o.id === operatorId);
    return operator ? operator.user_name : `Operator #${operatorId}`;
  };

  const formatAssignerRole = (role) => {
    if (role === "manufacturing_coordinator") return "Manufacturing Coordinator";
    if (role === "admin") return "Admin";
    return role;
  };

  const getAssignedByLabel = (record) => {
    const assigner = record.assigned_by;
    if (!assigner?.user_name) return null;
    const roleLabel = assigner.role ? formatAssignerRole(assigner.role) : null;
    return roleLabel ? `${assigner.user_name} (${roleLabel})` : assigner.user_name;
  };

  const refreshAssignments = () => {
    if (currentConfig?.id && onAssignmentsChange) {
      onAssignmentsChange(currentConfig.id);
    }
  };

  const handleUpdateAssignment = async (values) => {
    if (!editingAssignment) return;
    const assignedById = requireAssignerId();
    if (!assignedById) return;
    try {
      setSubmitting(true);
      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/shift-hours/machine/${editingAssignment.machine_id}/operator/${editingAssignment.operator_id}/shifts/${editingAssignment.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machine_id: values.machine_id,
            assigned_by_id: assignedById,
          }),
        }
      );
      if (response.ok) {
        message.success("Machine updated successfully");
        closeAssignmentModal();
        refreshAssignments();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || "Failed to update assignment");
      }
    } catch {
      message.error("Error updating assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAssignment = async (values) => {
    const assignedById = requireAssignerId();
    if (!assignedById) return;
    try {
      setSubmitting(true);
      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/shift-hours/machine/${values.machine_id}/operator/${values.operator_id}/shifts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            machine_id: values.machine_id,
            operator_id: values.operator_id,
            shift_config_id: values.shift_config_id,
            assigned_by_id: assignedById,
          }),
        }
      );
      if (response.ok) {
        message.success("Operator assigned successfully");
        closeAssignmentModal();
        refreshAssignments();
      } else {
        const errorData = await response.json();
        message.error(errorData.detail || "Failed to create assignment");
      }
    } catch {
      message.error("Error creating assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignmentSubmit = async (values) => {
    if (editingAssignment) await handleUpdateAssignment(values);
    else await handleCreateAssignment(values);
  };

  const handleDeleteAssignment = async (assignment) => {
    const assignedById = requireAssignerId();
    if (!assignedById) return;
    try {
      const response = await fetch(
        `${SCHEDULING_API_BASE_URL}/shift-hours/machine/${assignment.machine_id}/operator/${assignment.operator_id}/shifts/${assignment.id}?assigned_by_id=${assignedById}`,
        { method: "DELETE" }
      );
      if (response.ok) {
        message.success("Assignment removed");
        refreshAssignments();
      } else {
        message.error("Failed to remove assignment");
      }
    } catch {
      message.error("Error removing assignment");
    }
  };

  const openAssignmentModal = (assignment = null) => {
    setEditingAssignment(assignment);
    if (assignment) {
      assignmentForm.setFieldsValue({
        machine_id: assignment.machine_id,
        operator_id: assignment.operator_id,
        shift_config_id: assignment.shift_config?.id,
      });
    } else {
      assignmentForm.resetFields();
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

  const assignmentDate = selectedDate || (currentConfig?.date ? dayjs(currentConfig.date) : null);

  const availableMachines = machines.filter((machine) =>
    isMachineAvailableForAssignmentOnDate(machine, assignmentDate)
  );

  const machinesForSelect = editingAssignment
    ? [
        ...availableMachines,
        ...machines.filter(
          (m) =>
            m.machine_id === editingAssignment.machine_id &&
            !availableMachines.some((a) => a.machine_id === m.machine_id)
        ),
      ]
    : availableMachines;

  const renderBody = () => {
    if (!selectedDate) {
      return (
        <div className="sp-empty">
          <div className="sp-empty__icon"><TeamOutlined /></div>
          <div className="sp-empty__text">Select a date to assign operators to machines</div>
        </div>
      );
    }
    if (!currentConfig) {
      return (
        <div className="sp-empty">
          <div className="sp-empty__icon"><ToolOutlined /></div>
          <div className="sp-empty__text">Save shift configuration first, then assign operators here</div>
        </div>
      );
    }
    if (assignmentLoading) {
      return (
        <div style={{ textAlign: "center", padding: 32 }}>
          <Spin />
          <p style={{ marginTop: 10, color: "#94a3b8", fontSize: 12 }}>Loading assignments...</p>
        </div>
      );
    }
    if (!assignments.length) {
      return (
        <div className="sp-empty">
          <div className="sp-empty__icon"><SwapOutlined /></div>
          <div className="sp-empty__text">No operators assigned yet for this date</div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAssignmentModal()} style={{ borderRadius: 8 }}>
            Assign Operator
          </Button>
        </div>
      );
    }

    return (
      <div className="sp-assign-list">
        {assignments.map((record) => (
          <div key={record.id} className="sp-assign-row">
            <div className="sp-assign-row__icon sp-assign-row__icon--machine">
              <ToolOutlined />
            </div>
            <div className="sp-assign-row__body">
              <div className="sp-assign-row__machine">{getMachineLabel(record.machine_id)}</div>
              <div className="sp-assign-row__operator">
                <UserOutlined style={{ marginRight: 4, fontSize: 11 }} />
                {getOperatorLabel(record.operator_id)}
              </div>
              {getAssignedByLabel(record) && (
                <div className="sp-assign-row__assigner">
                  <UserSwitchOutlined style={{ marginRight: 4, fontSize: 11 }} />
                  Assigned by {getAssignedByLabel(record)}
                </div>
              )}
            </div>
            <div className="sp-assign-row__actions">
              <Tooltip title="Change machine">
                <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openAssignmentModal(record)} style={{ color: "#3b82f6" }} />
              </Tooltip>
              <Popconfirm title="Remove assignment?" onConfirm={() => handleDeleteAssignment(record)} okText="Remove" cancelText="Cancel">
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <Card
        className="sp-card sp-assign-card"
        size="small"
        title={
          <Space size={8}>
            <TeamOutlined style={{ color: "#3b82f6" }} />
            <span>Machine Assignment</span>
            {assignments.length > 0 && (
              <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontWeight: 600 }}>{assignments.length}</Tag>
            )}
          </Space>
        }
        extra={
          currentConfig && (
            <Button
              type="primary"
              size="small"
              ghost
              icon={<PlusOutlined />}
              onClick={() => openAssignmentModal()}
              style={{ borderRadius: 8, fontWeight: 500 }}
            >
              Add
            </Button>
          )
        }
        styles={{ body: { padding: assignments.length ? "12px 14px" : "4px 14px" } }}
      >
        {renderBody()}
      </Card>

      <Modal
        open={assignmentModalVisible}
        onCancel={closeAssignmentModal}
        footer={null}
        width={460}
        destroyOnClose
        centered
        styles={{ body: { paddingTop: 0 } }}
      >
        <div className="sp-modal-header">
          <h3>{editingAssignment ? "Change Machine" : "New Assignment"}</h3>
          <p>{editingAssignment ? "Reassign operator to a different machine" : "Link an operator to a machine for this shift"}</p>
        </div>

        <Form form={assignmentForm} layout="vertical" onFinish={handleAssignmentSubmit}>
          {currentConfig && (
            <div className="sp-modal-date-chip">
              <CalendarOutlined />
              <span>
                <strong>{dayjs(currentConfig.date).format("DD MMM YYYY")}</strong>
                {" · "}
                {currentConfig.working_day ? "Working day" : "Non-working day"}
              </span>
            </div>
          )}

          <Form.Item
            label={<span style={{ fontWeight: 500 }}>Machine</span>}
            name="machine_id"
            rules={[{ required: true, message: "Select a machine" }]}
          >
            <Select
              placeholder={
                machinesForSelect.length
                  ? "Choose machine"
                  : "No machines available on this date (all in breakdown)"
              }
              showSearch
              optionFilterProp="label"
              size="large"
              notFoundContent="No machines available for this date"
            >
              {machinesForSelect.map((machine) => (
                <Option
                  key={machine.machine_id}
                  value={machine.machine_id}
                  label={`${machine.machine_make} ${machine.machine_model || ""}`}
                >
                  <Space>
                    <ToolOutlined style={{ color: "#3b82f6" }} />
                    {machine.machine_make}{machine.machine_model ? ` · ${machine.machine_model}` : ""}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ textAlign: "center", margin: "-8px 0 8px", color: "#cbd5e1" }}>
            <ArrowRightOutlined rotate={90} />
          </div>

          <Form.Item
            label={<span style={{ fontWeight: 500 }}>Operator</span>}
            name="operator_id"
            rules={[{ required: true, message: "Select an operator" }]}
          >
            <Select placeholder="Choose operator" showSearch optionFilterProp="label" disabled={!!editingAssignment} size="large">
              {operators.map((operator) => (
                <Option key={operator.id} value={operator.id} label={operator.user_name}>
                  <Space>
                    <UserOutlined style={{ color: "#059669" }} />
                    {operator.user_name}
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="shift_config_id" hidden><Select disabled /></Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Space style={{ width: "100%", justifyContent: "flex-end" }}>
              <Button onClick={closeAssignmentModal} style={{ borderRadius: 8 }}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={submitting} style={{ borderRadius: 8, minWidth: 100 }}>
                {editingAssignment ? "Update" : "Assign"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default ShiftDayAssignmentsPanel;
