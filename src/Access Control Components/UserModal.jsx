import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message } from 'antd';
import { API_BASE_URL } from '../Config/auth.js';

const { Option } = Select;

const UserModal = ({ open, onCancel, onSuccess, editingUser }) => {
  const [form] = Form.useForm();

  useEffect(() => {
    if (open) {
      if (editingUser) {
        form.setFieldsValue(editingUser);
      } else {
        form.resetFields();
      }
    }
  }, [open, editingUser, form]);

  const handleFormSubmit = async (values) => {
    const payload = {
      ...values,
      user_name: values.username,
    };

    try {
      let response;
      if (editingUser) {
        response = await fetch(`${API_BASE_URL}/access-users/${editingUser.id}/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(`${API_BASE_URL}/access-users/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (response.ok) {
        message.success(editingUser ? 'User updated successfully' : 'User registered successfully');
        onSuccess();
        onCancel(); 
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.message || errorData.detail || errorData.error || '';
        
        if (errorMsg.toLowerCase().includes('exist')) {
           message.error('User with this email already exists');
        } else {
           message.error(errorMsg || (editingUser ? 'Failed to update user' : 'Failed to register user'));
        }
      }
    } catch (error) {
      message.error('Operation failed: ' + error.message);
    }
  };

  return (
    <Modal
      title={editingUser ? "Edit User" : "Register New User"}
      open={open}
      onCancel={onCancel}
      footer={null}
      maskClosable={false}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleFormSubmit}
      >
        <Form.Item
          name="username"
          label="Username"
          rules={[{ required: true, message: 'Please enter username' }]}
        >
          <Input placeholder="Enter username" />
        </Form.Item>

        <Form.Item
          name="gmail"
          label="Gmail"
          rules={[
            { required: true, message: 'Please enter gmail' },
            { type: 'email', message: 'Please enter a valid email' },
            { pattern: /^[a-zA-Z0-9._%+-]+@gmail\.com$/, message: 'Email must be a @gmail.com address' }
          ]}
        >
          <Input placeholder="Enter gmail" />
        </Form.Item>

        <Form.Item
          name="role"
          label="Role"
          rules={[{ required: true, message: 'Please select role' }]}
        >
          <Select placeholder="Select role">
            <Option value="admin">Admin</Option>
            <Option value="project_coordinator">Project Coordinator</Option>
            <Option value="operator">Operator</Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="center"
          label="Center"
          rules={[{ required: true, message: 'Please enter center' }]}
        >
          <Input placeholder="Enter center" />
        </Form.Item>

        <Form.Item
          name="group"
          label="Group"
          rules={[{ required: true, message: 'Please enter group' }]}
        >
          <Input placeholder="Enter group" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Please enter password' }]}
        >
          <Input.Password placeholder="Enter password" />
        </Form.Item>

        <Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" htmlType="submit">
              {editingUser ? "Update" : "Register"}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default UserModal;
