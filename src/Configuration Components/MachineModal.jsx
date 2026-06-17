import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Modal, Form, Input, DatePicker, Button, message, InputNumber, Select } from "antd";
import dayjs from "dayjs";

const MachineModal = ({ machine, workCenterId, userId, isOpen, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [frequencyUnit, setFrequencyUnit] = useState(null);

  useEffect(() => {
    if (machine) {
      const freqUnit = machine.calibration_frequency ? machine.calibration_frequency.split(' ')[1] : null;
      setFrequencyUnit(freqUnit);
      form.setFieldsValue({
        work_center_id: machine.work_center_id || workCenterId,
        type: machine.type || "",
        make: machine.make || "",
        model: machine.model || "",
        year_of_installation: machine.year_of_installation ? dayjs().year(machine.year_of_installation) : null,
        cnc_controller: machine.cnc_controller || "",
        cnc_controller_service: machine.cnc_controller_service || "",
        remarks: machine.remarks || "",
        mhr: machine.mhr ?? null,
        calibration_date: machine.calibration_date ? dayjs(machine.calibration_date) : null,
        calibration_frequency_value: machine.calibration_frequency ? parseInt(machine.calibration_frequency.split(' ')[0]) : null,
        calibration_frequency_unit: freqUnit,
        password: machine.password || "",
      });
    } else {
      form.resetFields();
      setFrequencyUnit(null);
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
      year_of_installation: values.year_of_installation ? values.year_of_installation.year() : null,
      cnc_controller: values.cnc_controller || null,
      cnc_controller_service: values.cnc_controller_service || null,
      remarks: values.remarks || null,
      mhr: values.mhr != null && values.mhr !== '' ? parseInt(values.mhr) : null,
      calibration_date: values.calibration_date ? values.calibration_date.toISOString() : null,
      calibration_frequency: values.calibration_frequency_value && values.calibration_frequency_unit
        ? `${values.calibration_frequency_value} ${values.calibration_frequency_unit}`
        : null,
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
      const method = machine ? "put" : "post";

      await axios({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
        },
        data: { ...submitData, user_id: userId },
      });

      onSave();
    } catch (error) {
      console.error("Error saving machine:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Failed to save machine. Please check your input.";
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={machine ? "Edit Machine" : "Add Machine"}
      open={isOpen}
      onCancel={onClose}
      width="95%"
      style={{ maxWidth: 800 }}
      footer={null}
      destroyOnHidden
      centered
    >
      <style>{`
        @media (max-width: 768px) {
          .responsive-grid {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
          .ant-modal-body {
            padding: 16px;
          }
        }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
      >
        <div 
          className="responsive-grid"
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}
        >
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
            <DatePicker 
              picker="year" 
              style={{ width: '100%' }} 
              placeholder="Select year" 
              inputReadOnly={true}
              disabledDate={(current) => current && current > dayjs().endOf('year')}
            />
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
            name="mhr"
            label="MHR (Machine Hourly Rate)"
            rules={[{ type: 'integer', message: 'Only whole numbers allowed' }]}
          >
            <InputNumber
              placeholder="Enter MHR"
              style={{ width: '100%' }}
              min={0}
              precision={0}
              step={1}
              controls={false}
              addonBefore="₹"
              onKeyPress={(e) => { if (!/[0-9]/.test(e.key)) e.preventDefault(); }}
            />
          </Form.Item>

          <Form.Item
            name="calibration_date"
            label="Calibration Date"
            tooltip="Latest calibration date"
          >
            <DatePicker
              style={{ width: '100%' }}
              inputReadOnly={true}
            />
          </Form.Item>

          <Form.Item
            name="calibration_frequency"
            label="Calibration Frequency"
            tooltip="Frequency for calibration (e.g., every 6 months, 1 year)"
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <Form.Item
                name="calibration_frequency_value"
                noStyle
                rules={[
                  {
                    validator: (_, value) => {
                      if (!frequencyUnit) {
                        return Promise.resolve();
                      }
                      if (!value) {
                        return Promise.reject(new Error('Please enter a value'));
                      }
                      const numValue = Number(value);
                      if (frequencyUnit === 'days' && (numValue < 1 || numValue > 365)) {
                        return Promise.reject(new Error('Days must be between 1 and 365'));
                      }
                      if (frequencyUnit === 'months' && (numValue < 1 || numValue > 24)) {
                        return Promise.reject(new Error('Months must be between 1 and 24'));
                      }
                      if (frequencyUnit === 'years' && (numValue < 1 || numValue > 10)) {
                        return Promise.reject(new Error('Years must be between 1 and 10'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <Input
                  type="text"
                  style={{ width: '100%' }}
                  placeholder="Enter value"
                  disabled={!frequencyUnit}
                  maxLength={frequencyUnit === 'days' ? 3 : 2}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!/^\d*$/.test(value)) {
                      e.target.value = value.replace(/\D/g, '');
                      form.setFieldsValue({ calibration_frequency_value: e.target.value });
                      return;
                    }
                    if (value) {
                      const numValue = Number(value);
                      const maxValue = frequencyUnit === 'days' ? 365 : frequencyUnit === 'months' ? 24 : 10;
                      if (numValue > maxValue) {
                        form.setFieldsValue({ calibration_frequency_value: maxValue });
                      }
                    }
                  }}
                />
              </Form.Item>
              <Form.Item
                name="calibration_frequency_unit"
                noStyle
              >
                <Select
                  style={{ width: '120px' }}
                  placeholder="Unit"
                  onChange={(value) => {
                    setFrequencyUnit(value);
                    form.setFieldsValue({ calibration_frequency_value: null });
                  }}
                >
                  <Select.Option value="days">Days</Select.Option>
                  <Select.Option value="months">Months</Select.Option>
                  <Select.Option value="years">Years</Select.Option>
                </Select>
              </Form.Item>
            </div>
            <div style={{ fontSize: '12px', color: '#8c8c8c', marginTop: '4px' }}>
              {frequencyUnit === 'days' && 'Valid range: 1-365 days'}
              {frequencyUnit === 'months' && 'Valid range: 1-24 months'}
              {frequencyUnit === 'years' && 'Valid range: 1-10 years'}
              {!frequencyUnit && 'Select a unit first, then enter the value'}
            </div>
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
