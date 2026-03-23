import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Button, message } from 'antd';
import { API_BASE_URL } from '../Config/auth.js';

const { Option } = Select;

const UserModal = ({ open, onCancel, onSuccess, editingUser, existingUsers = [] }) => {
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
        
        if (errorMsg.toLowerCase().includes('gmail') && errorMsg.toLowerCase().includes('exist')) {
           message.error('User with this email already exists');
        } else if (errorMsg.toLowerCase().includes('username') && errorMsg.toLowerCase().includes('exist')) {
           message.error('Username already exists');
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
          rules={[
            { required: true, message: 'Please enter username' },
            {
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                const isDuplicate = existingUsers.some(
                  (u) => 
                    u.username?.toLowerCase() === value.toLowerCase() && 
                    u.id !== editingUser?.id
                );
                return isDuplicate 
                  ? Promise.reject(new Error('Username already exists')) 
                  : Promise.resolve();
              }
            }
          ]}
        >
          <Input placeholder="Enter username" />
        </Form.Item>

        <Form.Item
          name="gmail"
          label="E-mail"
          rules={[
            { required: true, message: 'Please enter email' },
            { type: 'email', message: 'Please enter a valid email' },
            { 
              validator: (_, value) => {
                if (!value) return Promise.resolve();
                if (/^[A-Z]/.test(value)) return Promise.reject(new Error('please enter valid email'));
                if (!value.includes('@')) return Promise.reject(new Error('Email must contain @'));
                const isDuplicate = existingUsers.some(
                  (u) => 
                    u.gmail?.toLowerCase() === value.toLowerCase() && 
                    u.id !== editingUser?.id
                );
                return isDuplicate 
                  ? Promise.reject(new Error('Email already exists')) 
                  : Promise.resolve();
              }
            }
          ]}
        >
          <Input placeholder="Enter email" />
        </Form.Item>

        <Form.Item
          name="role"
          label="Role"
          rules={[{ required: true, message: 'Please select role' }]}
        >
          <Select placeholder="Select role">
            <Option value="admin">Admin</Option>
            <Option value="project_coordinator">Project Coordinator</Option>
            <Option value="manufacturing_coordinator">Manufacturing Coordinator</Option>
            <Option value="supervisor">Supervisor</Option>
            <Option value="inventory_supervisor">Inventory Supervisor</Option>
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
