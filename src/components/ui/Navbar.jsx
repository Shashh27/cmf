import React from 'react';
import { Layout, Typography, Button, Avatar, Space, Badge, Popover, Grid } from 'antd';
import { UserOutlined, BellOutlined, LogoutOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Header } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Navbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  
  const getRoleInfo = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return { role: 'Admin', name: 'Admin', avatar: 'A' };
    if (path.startsWith('/project_coordinator')) return { role: 'Project Coordinator', name: 'Coordinator', avatar: 'P' };
    if (path.startsWith('/operator')) return { role: 'Operator', name: 'Operator', avatar: 'O' };
    return { role: 'User', name: 'User', avatar: 'U' };
  };

  const roleInfo = getRoleInfo();

  const getTitle = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return 'Dashboard';
    if (path.includes('/oms/orders')) return 'Orders';
    if (path.includes('/oms/rawmaterials')) return 'Raw Materials';
    if (path.includes('/pdm')) return 'Product Data Management';
    if (path.includes('/pps')) return 'Production Planning System';
    if (path.includes('/configuration')) return 'Configuration';
    if (path.includes('/product-monitoring')) return 'Product Monitoring';
    if (path.includes('/quality-management')) return 'Quality Management';
    if (path.includes('/inventory-management')) return 'Inventory Management';
    if (path.includes('/document-management')) return 'Document Management';
    if (path.includes('/notification')) return 'Notification';
    if (path.includes('/access_control')) return 'Access Control';
    if (path.includes('/inspection-results')) return 'Inspection Results';
    if (path.includes('/inventory-data')) return 'Inventory Data';
    if (path.includes('/documents')) return 'Documents';
    return '';
  };

  const handleLogout = () => {
    localStorage.clear();
    navigate('/login');
  };

  const userMenu = (
    <div style={{ minWidth: '120px' }}>
      <div style={{ padding: '4px 0 8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
        <Text type="secondary">Role: {roleInfo.role}</Text>
      </div>
      <Button 
        type="text" 
        icon={<LogoutOutlined />} 
        onClick={handleLogout}
        style={{ width: '100%', textAlign: 'left', padding: '4px 0' }}
      >
        Logout
      </Button>
    </div>
  );

  return (
    <Header style={{ 
      position: 'fixed', 
      top: 0, 
      zIndex: 1000, 
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
        <Popover content={userMenu} trigger="click" placement="bottomRight">
          <Space style={{ cursor: 'pointer' }}>
            <Avatar style={{ backgroundColor: '#1890ff' }}>{roleInfo.avatar}</Avatar>
            {!screens.xs && <Text strong style={{ whiteSpace: 'nowrap' }}>{roleInfo.name}</Text>}
          </Space>
        </Popover>
      </Space>
    </Header>
  );
};

export default Navbar;