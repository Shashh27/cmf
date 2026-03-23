import React, { useState, useEffect } from "react";
import axios from "axios";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Button, Typography, message } from "antd";

const { Title } = Typography;

const CustomerModal = ({ isOpen, onClose, userId, onCustomerCreated, editingCustomer }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingCustomer) {
      // Clean up contact_number for the form input
      const formData = { ...editingCustomer };
      if (formData.contact_number) {
        let phone = formData.contact_number;
        // If it starts with +91, remove it
        if (phone.startsWith("+91")) {
          phone = phone.slice(3);
        }
        // Remove any non-numeric characters and limit to 10 digits
        formData.contact_number = phone.replace(/\D/g, "").slice(0, 10);
      }
      form.setFieldsValue(formData);
    }
  }, [editingCustomer, form]);

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      // Prepend +91 to the contact number before sending to backend
      const payload = {
        ...values,
        contact_number: values.contact_number ? `+91${values.contact_number}` : values.contact_number
      };

      const url = editingCustomer 
        ? `${API_BASE_URL}/customers/${editingCustomer.id}/`
        : `${API_BASE_URL}/customers/`;
      
      const method = editingCustomer ? 'put' : 'post';
      
      const response = await axios({
        url,
        method,
        headers: {
          "Content-Type": "application/json",
        },
        data: { ...payload, user_id: userId },
      });

      const result = response.data;
      onCustomerCreated(result);
      handleClose();
    } catch (error) {
      console.error("Error saving customer:", error);
      const detail =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Failed to save customer";
      message.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      width="95%"
      style={{ maxWidth: 600 }}
      centered
      title={
        <Title level={4} style={{ margin: 0, fontSize: 'clamp(16px, 4vw, 20px)' }}>
          {editingCustomer ? "Edit Customer" : "Create New Customer"}
        </Title>
      }
    >
      <style>{`
        @media (max-width: 768px) {
          .ant-modal-body {
            padding: 16px;
          }
        }
      `}</style>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ padding: 'clamp(12px, 3vw, 24px)' }}
      >
        <Form.Item
          name="company_name"
          label="Company Name"
          rules={[{ required: true, message: 'Please enter company name' }]}
        >
          <Input placeholder="Enter company name" size="large" />
        </Form.Item>
        
        <Form.Item
          name="address"
          label="Address"
          rules={[{ required: true, message: 'Please enter address' }]}
        >
          <Input placeholder="Enter complete address" size="large" />
        </Form.Item>
        
        <Form.Item
          name="branch"
          label="Branch"
        >
          <Input placeholder="Enter branch name" size="large" />
        </Form.Item>
        
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Please enter email' },
            { type: 'email', message: 'Please enter a valid email' }
          ]}
        >
          <Input type="email" placeholder="company@example.com" size="large" />
        </Form.Item>
        
        <Form.Item
          name="contact_number"
          label="Contact Number"
          rules={[
            { required: true, message: 'Please enter contact number' },
            { pattern: /^\d{10}$/, message: 'Please enter a valid 10-digit contact number' }
          ]}
          normalize={(value) => {
            // Remove non-numeric characters and limit to 10 digits
            return value.replace(/\D/g, '').slice(0, 10);
          }}
        >
          <Input 
            addonBefore="+91" 
            placeholder="Enter 10-digit number" 
            size="large" 
            maxLength={10}
          />
        </Form.Item>
        
        <Form.Item
          name="contact_person"
          label="Contact Person"
          rules={[{ required: true, message: 'Please enter contact person' }]}
        >
          <Input placeholder="Full name of contact person" size="large" />
        </Form.Item>
        
        <div className="flex flex-col sm:flex-row justify-end gap-2 mt-6">
          <Button 
            onClick={handleClose} 
            size="large"
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            type="primary" 
            htmlType="submit" 
            loading={loading}
            size="large"
            className="w-full sm:w-auto"
          >
            {loading ? "Saving..." : editingCustomer ? "Update" : "Create"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CustomerModal;
