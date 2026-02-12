import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Typography, Tag, message, Space, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import config from '../Config/config';
import UserModal from '../Access Control Components/UserModal';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Title } = Typography;

const AccessControl = () => {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [users, setUsers] = useState([]);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/access-users/`);
      if (response.ok) {
        const data = await response.json();
        const mappedUsers = data.map((user, index) => ({
          ...user,
          slno: index + 1,
          username: user.user_name,
          createdAt: user.created_at || user.createdAt,
          updatedAt: user.updated_at || user.updatedAt
        }));
        setUsers(mappedUsers);
      } else {
        message.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      message.error('Error fetching users');
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const togglePasswordVisibility = (id) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Are you sure you want to delete this user?',
      onOk: async () => {
        try {
          const response = await fetch(`${config.API_BASE_URL}/access-users/${id}/`, {
            method: 'DELETE',
          });
          if (response.ok) {
            message.success('User deleted successfully');
            fetchUsers();
          } else {
            message.error('Failed to delete user');
          }
        } catch (error) {
          message.error('Delete failed: ' + error.message);
        }
      },
    });
  };

  const handleEdit = (record) => {
    setEditingUser(record);
    setIsModalVisible(true);
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchText.toLowerCase()) ||
    user.role.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Sl No',
      dataIndex: 'slno',
      key: 'slno',
      width: 70,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Gmail',
      dataIndex: 'gmail',
      key: 'gmail',
    },
    {
      title: 'Role',
      dataIndex: 'role',
      key: 'role',
      render: (role) => {
        let color = 'geekblue';
        if (role === 'admin') color = 'volcano';
        if (role === 'operator') color = 'green';
        return (
          <Tag color={color} key={role}>
            {role.toUpperCase()}
          </Tag>
        );
      },
    },
    {
      title: 'Center',
      dataIndex: 'center',
      key: 'center',
    },
    {
      title: 'Group',
      dataIndex: 'group',
      key: 'group',
    },
    {
      title: 'Created At',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text) => text ? dayjs.utc(text).tz('Asia/Kolkata').format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Updated At',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (text) => text ? dayjs.utc(text).tz('Asia/Kolkata').format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Password',
      dataIndex: 'password',
      key: 'password',
      render: (text, record) => (
        <Space>
          <span>{visiblePasswords[record.id] ? (text || 'Not Returned by API') : '••••••••'}</span>
          <Button 
            type="text" 
            icon={visiblePasswords[record.id] ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
            onClick={() => togglePasswordVisibility(record.id)} 
          />
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="middle">
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button type="text" icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Access Control Management</Title>
      </div>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <Input 
            placeholder="Search by username or role..." 
            prefix={<SearchOutlined />} 
            style={{ width: 300 }}
            onChange={e => setSearchText(e.target.value)}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => {
            setEditingUser(null);
            setIsModalVisible(true);
          }}>
            Register New User
          </Button>
        </div>

        <Table 
          columns={columns} 
          dataSource={filteredUsers} 
          rowKey="id"
          scroll={{ x: 'max-content' }}
          pagination={{ 
            total: filteredUsers.length,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showQuickJumper: true,
            position: ['bottomCenter']
          }} 
        />
      </div>

      <UserModal 
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false);
          setEditingUser(null);
        }}
        onSuccess={() => {
          fetchUsers();
        }}
        editingUser={editingUser}
      />
    </div>
  );
};

export default AccessControl;