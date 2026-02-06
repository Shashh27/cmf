import React from 'react';
import { Layout, Typography, Button, Avatar, Space, Badge } from 'antd';
import { UserOutlined, BellOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';

const { Header } = Layout;
const { Title, Text } = Typography;

const Navbar = () => {
  const location = useLocation();
  
  const getTitle = () => {
    if (location.pathname === '/oms/orders') return 'Orders';
    if (location.pathname === '/oms/rawmaterials') return 'Raw Materials';
    if (location.pathname === '/pdm') return 'Product Data Management';
    if (location.pathname === '/pps') return 'Production Planning System';
    if (location.pathname === '/configuration') return 'Configuration';
    return '';
  };

  return (
    <Header style={{ 
      position: 'fixed', 
      top: 0, 
      zIndex: 1, 
      width: 'calc(100% - 224px)', 
      background: '#fff', 
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #f0f0f0',
      left: 224
    }}>
      <Title level={4} style={{ margin: 0 }}>{getTitle()}</Title>
      
      <Space size="large">
        <Badge dot>
          <Button type="text" icon={<BellOutlined style={{ fontSize: 20 }} />} />
        </Badge>
        <Space>
          <Avatar style={{ backgroundColor: '#1890ff' }} icon={<UserOutlined />} />
          <Text strong>User</Text>
        </Space>
      </Space>
    </Header>
  );
};

export default Navbar;