import React, { useState, useEffect } from "react";
import { API_BASE_URL } from "../Config/auth";
import { Modal, Form, Input, Button, Typography, message } from "antd";

const { Title } = Typography;

const CustomerModal = ({ isOpen, onClose, onCustomerCreated, editingCustomer }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (editingCustomer) {
      form.setFieldsValue(editingCustomer);
    }
  }, [editingCustomer, form]);

  const handleSubmit = async (values) => {
    setLoading(true);

    try {
      const url = editingCustomer 
        ? `${API_BASE_URL}/customers/${editingCustomer.id}/`
        : `${API_BASE_URL}/customers/`;
      
      const method = editingCustomer ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const result = await response.json();
        onCustomerCreated(result);
        handleClose();
        message.success(`Customer ${editingCustomer ? 'updated' : 'created'} successfully`);
      } else {
        message.error("Failed to save customer");
      }
    } catch (error) {
      console.error("Error saving customer:", error);
      message.error("Error saving customer");
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
      width={600}
      title={
        <Title level={4} style={{ margin: 0 }}>
          {editingCustomer ? "Edit Customer" : "Create New Customer"}
        </Title>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        style={{ padding: '24px' }}
      >
        <Form.Item
          name="company_name"
          label="Company Name"
          rules={[{ required: true, message: 'Please enter company name' }]}
        >
          <Input placeholder="Enter company name" />
        </Form.Item>
        
        <Form.Item
          name="address"
          label="Address"
          rules={[{ required: true, message: 'Please enter address' }]}
        >
          <Input placeholder="Enter complete address" />
        </Form.Item>
        
        <Form.Item
          name="branch"
          label="Branch"
        >
          <Input placeholder="Enter branch name" />
        </Form.Item>
        
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Please enter email' },
            { type: 'email', message: 'Please enter a valid email' }
          ]}
        >
          <Input type="email" placeholder="company@example.com" />
        </Form.Item>
        
        <Form.Item
          name="contact_number"
          label="Contact Number"
          rules={[{ required: true, message: 'Please enter contact number' }]}
        >
          <Input placeholder="+1 (555) 123-4567" />
        </Form.Item>
        
        <Form.Item
          name="contact_person"
          label="Contact Person"
          rules={[{ required: true, message: 'Please enter contact person' }]}
        >
          <Input placeholder="Full name of contact person" />
        </Form.Item>
        
        <div style={{ textAlign: 'right', marginTop: '24px' }}>
          <Button onClick={handleClose} style={{ marginRight: '8px' }}>
            Cancel
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            {loading ? "Saving..." : editingCustomer ? "Update" : "Create"}
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CustomerModal;
