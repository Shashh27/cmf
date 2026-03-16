import React from 'react';
import { Layout, Typography, Button, Avatar, Space, Badge, Popover, Grid } from 'antd';
import { UserOutlined, BellOutlined, LogoutOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Header } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Navbar = ({ collapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  
  const getRoleInfo = () => {
    const path = location.pathname;
    let role = 'User';
    if (path.startsWith('/admin')) role = 'Admin';
    else if (path.startsWith('/project_coordinator')) role = 'Project Coordinator';
    else if (path.startsWith('/operator')) role = 'Operator';
    let name = role;
    try {
      const stored = localStorage.getItem('user');
      const u = stored ? JSON.parse(stored) : null;
      if (u?.user_name) {
        name = u.user_name;
      } else if (u?.username) {
        name = u.username;
      }
    } catch (e) {}
    const avatar = (name && name.length > 0) ? name.charAt(0).toUpperCase() : role.charAt(0).toUpperCase();
    return { role, name, avatar };
  };

  const roleInfo = getRoleInfo();

  const getTitle = () => {
    const path = location.pathname;
    if (path.includes('/dashboard')) return 'Dashboard';
    if (path.includes('/oms/orders')) return 'Orders';
    if (path.includes('/oms/parts-priority')) {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab === 'order-wise') return 'Order Wise Priority';
      return 'Parts Priority';
    }
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
        <Text type="secondary" style={{ fontSize: 'clamp(11px, 2vw, 12px)' }}>Role: {roleInfo.role}</Text>
      </div>
      <Button 
        type="text" 
        icon={<LogoutOutlined />} 
        onClick={handleLogout}
        style={{ width: '100%', textAlign: 'left', padding: '4px 0', fontSize: 'clamp(12px, 2.5vw, 14px)' }}
      >
        Logout
      </Button>
    </div>
  );

  return (
    <Header 
      style={{ 
        position: 'fixed', 
        top: 0, 
        zIndex: 1000, 
        background: '#fff', 
        padding: '0 clamp(12px, 3vw, 24px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #f0f0f0',
        transition: 'all 0.2s',
        left: screens.md ? (collapsed ? 80 : 224) : 0,
        width: screens.md ? `calc(100% - ${(collapsed ? 80 : 224)}px)` : '100%',
      }}
      className="responsive-navbar"
    >
      <style>{`
        @media (max-width: 768px) {
          .responsive-navbar {
            padding-left: 64px !important;
          }
        }
      `}</style>
      <Title 
        level={4} 
        style={{ 
          margin: 0, 
          fontSize: 'clamp(14px, 3.5vw, 18px)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 'calc(100vw - 200px)'
        }}
      >
        {getTitle()}
      </Title>
      
      <Space size={screens.xs ? "small" : "large"}>
        <Badge dot>
          <Button 
            type="text" 
            icon={<BellOutlined style={{ fontSize: screens.xs ? 18 : 20 }} />} 
          />
        </Badge>
        <Popover content={userMenu} trigger="click" placement="bottomRight">
          <Space style={{ cursor: 'pointer' }} size="small">
            <Avatar 
              style={{ 
                backgroundColor: '#1890ff',
                width: screens.xs ? 32 : 40,
                height: screens.xs ? 32 : 40,
                lineHeight: screens.xs ? '32px' : '40px',
                fontSize: screens.xs ? '14px' : '18px'
              }}
            >
              {roleInfo.avatar}
            </Avatar>
            {!screens.xs && (
              <Text 
                strong 
                style={{ 
                  whiteSpace: 'nowrap',
                  fontSize: 'clamp(12px, 2.5vw, 14px)'
                }}
              >
                {roleInfo.name}
              </Text>
            )}
          </Space>
        </Popover>
      </Space>
    </Header>
  );
};

export default Navbar;
