import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../Config/auth.js";
import { Modal, Form, Input, DatePicker, Button, message, InputNumber } from "antd";
import dayjs from "dayjs";

const MachineModal = ({ machine, workCenterId, isOpen, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (machine) {
      form.setFieldsValue({
        work_center_id: machine.work_center_id || workCenterId,
        type: machine.type || "",
        make: machine.make || "",
        model: machine.model || "",
        year_of_installation: machine.year_of_installation || "",
        cnc_controller: machine.cnc_controller || "",
        cnc_controller_service: machine.cnc_controller_service || "",
        remarks: machine.remarks || "",
        calibration_date: machine.calibration_date ? dayjs(machine.calibration_date) : null,
        calibration_due_date: machine.calibration_due_date ? dayjs(machine.calibration_due_date) : null,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ work_center_id: workCenterId });
    }
  }, [machine, workCenterId, isOpen, form]);

  const handleSubmit = async (values) => {
    setLoading(true);

    // Prepare data with proper types
    const submitData = {
      work_center_id: parseInt(workCenterId),
      type: values.type,
      make: values.make,
      model: values.model,
      year_of_installation: values.year_of_installation ? parseInt(values.year_of_installation) : null,
      cnc_controller: values.cnc_controller || null,
      cnc_controller_service: values.cnc_controller_service || null,
      remarks: values.remarks || null,
      calibration_date: values.calibration_date ? values.calibration_date.toISOString() : null,
      calibration_due_date: values.calibration_due_date ? values.calibration_due_date.toISOString() : null,
    };

    if (!machine) {
      submitData.password = values.password;
    } else if (values.password) {
      submitData.password = values.password;
    }

    try {
      const url = machine 
        ? `${API_BASE_URL}/machines/${machine.id}`
        : `${API_BASE_URL}/machines/`;
      const method = machine ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        onSave();
      } else {
        const errorData = await response.json();
        console.error("Failed to save machine:", errorData);
        
        if (errorData.detail) {
            message.error(typeof errorData.detail === 'string' ? errorData.detail : "Failed to save machine");
        } else {
            message.error("Failed to save machine. Please check your input.");
        }
      }
    } catch (error) {
      console.error("Error saving machine:", error);
      message.error("Error saving machine. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={machine ? "Edit Machine" : "Add Machine"}
      open={isOpen}
      onCancel={onClose}
      width={800}
      footer={null}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Form.Item
            name="type"
            label="Type"
            rules={[{ required: true, message: 'Please enter type' }]}
          >
            <Input placeholder="Enter machine type" />
          </Form.Item>

          <Form.Item
            name="make"
            label="Make"
            rules={[{ required: true, message: 'Please enter make' }]}
          >
            <Input placeholder="Enter make" />
          </Form.Item>

          <Form.Item
            name="model"
            label="Model"
            rules={[{ required: true, message: 'Please enter model' }]}
          >
            <Input placeholder="Enter model" />
          </Form.Item>

          <Form.Item
            name="year_of_installation"
            label="Year of Installation"
          >
            <InputNumber style={{ width: '100%' }} placeholder="e.g., 2020" />
          </Form.Item>

          <Form.Item
            name="cnc_controller"
            label="CNC Controller"
          >
            <Input placeholder="Enter CNC controller" />
          </Form.Item>

          <Form.Item
            name="cnc_controller_service"
            label="CNC Controller Service"
          >
            <Input placeholder="Enter service provider" />
          </Form.Item>

          <Form.Item
            name="calibration_date"
            label="Calibration Date"
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="calibration_due_date"
            label="Calibration Due Date"
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: !machine, message: 'Please enter password' }]}
          >
            <Input.Password placeholder="Enter password" />
          </Form.Item>
        </div>

        <Form.Item
          name="remarks"
          label="Remarks"
        >
          <Input.TextArea rows={3} placeholder="Enter any additional remarks" />
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {machine ? "Update" : "Create"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default MachineModal;
