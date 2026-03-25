import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth.js";
import { Modal, Form, Input, Checkbox, Button, message } from "antd";

const WorkCenterModal = ({ workCenter, isOpen, userId, onClose, onSave }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workCenter && isOpen) {
      // Use setTimeout to ensure form is mounted
      setTimeout(() => {
        if (form) {
          form.setFieldsValue({
            code: workCenter.code || "",
            work_center_name: workCenter.work_center_name || "",
            description: workCenter.description || "",
            is_schedulable: workCenter.is_schedulable || false,
          });
        }
      }, 0);
    } else if (isOpen && form) {
      form.resetFields();
    }
  }, [workCenter, isOpen, form]);

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const url = workCenter 
        ? `${API_BASE_URL}/workcenters/${workCenter.id}`
        : `${API_BASE_URL}/workcenters/`;
      
      const method = workCenter ? "put" : "post";
      
      await axios({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
        },
        data: { ...values, user_id: userId },
      });

      onSave();
    } catch (error) {
      console.error("Error saving work center:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        "Failed to save work center. Please try again.";
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={workCenter ? "Edit Work Center" : "Add Work Center"}
      open={isOpen}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width="95%"
      style={{ maxWidth: 500 }}
      centered
    >
      <style>{`
        @media (max-width: 640px) {
          .ant-modal-body {
            padding: 16px;
          }
          .ant-form-item {
            margin-bottom: 12px;
          }
        }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          is_schedulable: false
        }}
        style={{ padding: '4px' }}
      >
        <Form.Item
          name="code"
          label="Code"
          rules={[{ required: true, message: 'Please enter code' }]}
        >
          <Input placeholder="Enter code" />
        </Form.Item>

        <Form.Item
          name="work_center_name"
          label="Work Center Name"
          rules={[{ required: true, message: 'Please enter work center name' }]}
        >
          <Input placeholder="Enter work center name" />
        </Form.Item>

        <Form.Item
          name="description"
          label="Description"
        >
          <Input.TextArea rows={3} placeholder="Enter description" />
        </Form.Item>

        <Form.Item
          name="is_schedulable"
          valuePropName="checked"
        >
          <Checkbox>Is Schedulable</Checkbox>
        </Form.Item>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {workCenter ? "Update" : "Create"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default WorkCenterModal;
