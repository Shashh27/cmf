import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Typography, Tag, message, Space, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import LockAnimation from '../assets/Unlocking.json';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { API_BASE_URL } from '../Config/auth.js';
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
  const lockRef = React.useRef(null);

  useEffect(() => {
    const ensureLottie = () =>
      new Promise((resolve) => {
        if (window.lottie) return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js';
        script.async = true;
        script.onload = () => resolve();
        document.head.appendChild(script);
      });
    ensureLottie().then(() => {
      try {
        if (lockRef.current && window.lottie) {
          window.lottie.loadAnimation({
            container: lockRef.current,
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: LockAnimation,
          });
        }
      } catch {}
    });
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/access-users/`);
      if (response.ok) {
        let data = await response.json();
        data = Array.isArray(data) ? data.slice().sort((a, b) => (a.id || 0) - (b.id || 0)) : [];
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
          const response = await fetch(`${API_BASE_URL}/access-users/${id}/`, {
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
      title: 'E-mail',
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
      render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Updated At',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (text) => text ? dayjs(text).format('DD/MM/YYYY HH:mm') : '-',
    },
    {
      title: 'Password',
      dataIndex: 'password',
      key: 'password',
      render: (text, record) => {
        const password = text || '';
        const isVisible = visiblePasswords[record.id];
        const displayText = isVisible
          ? (password || 'Not Returned by API')
          : (password ? '••••••••' : 'Not Returned by API');
        return (
          <Space>
            <span>{displayText}</span>
            <Button 
              type="text" 
              icon={isVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />} 
              onClick={() => togglePasswordVisibility(record.id)} 
            />
          </Space>
        );
      },
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
      <style>{`
        .modern-table .ant-table-thead > tr > th {
          background: linear-gradient(to bottom, #f0f5ff, #e6f0ff);
          font-weight: 600;
          border-bottom: 2px solid #1890ff;
        }
        .modern-table .ant-table-tbody > tr:hover > td {
          background: #f0f8ff !important;
        }
        .modern-table .ant-table-tbody > tr > td {
          border-bottom: 1px solid #f0f0f0;
        }
        .no-hover-btn, .no-hover-btn:hover, .no-hover-btn:focus, .no-hover-btn:active {
          background-color: #2563eb !important;
          color: white !important;
          opacity: 1 !important;
          border: none !important;
          box-shadow: none !important;
        }
      `}</style>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div style={{ display:'grid', gridTemplateColumns:'36px auto', alignItems:'center', columnGap:12 }}>
            <div ref={lockRef} style={{ width:36, height:36 }} />
            <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
              <Title level={2} style={{ margin:0, lineHeight:'28px', fontSize:'24px' }} className="text-gray-800">
                Access Control Management
              </Title>
              <Typography.Text style={{ marginTop:4 }} className="text-gray-500">
                Manage users, roles, and access permissions
              </Typography.Text>
            </div>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            onClick={() => {
              setEditingUser(null);
              setIsModalVisible(true);
            }} 
            size="large"
            style={{ backgroundColor: '#2563eb' }}
            className="border-none shadow-md no-hover-btn"
          >
            Register New User
          </Button>
        </div>
      </div>

      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
          <Input 
            placeholder="Search by username or role..." 
            prefix={<SearchOutlined />} 
            style={{ width: 300 }}
            onChange={e => setSearchText(e.target.value)}
          />
        </div>

        <Table 
          columns={columns} 
          dataSource={filteredUsers} 
          rowKey="id"
          scroll={{ x: 'max-content' }}
          className="modern-table"
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
        existingUsers={users}
      />
    </div>
  );
};

export default AccessControl;
