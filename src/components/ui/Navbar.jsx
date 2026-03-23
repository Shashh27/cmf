import React, { useEffect, useState, useCallback } from 'react';
import { Layout, Typography, Button, Avatar, Space, Badge, Popover, Grid, Empty, Spin } from 'antd';
import { UserOutlined, BellOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import config from '../../Config/config';

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
    else if (path.startsWith('/manufacturing_coordinator')) role = 'Manufacturing Coordinator';
    else if (path.startsWith('/supervisor')) role = 'Supervisor';
    else if (path.startsWith('/inventory_supervisor')) role = 'Inventory Supervisor';
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
  const isAdminRoute = location.pathname.startsWith('/admin');

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifItems, setNotifItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const unify = (type, arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(n => !n.is_ack)
      .map(n => ({
        id: n.id,
        type,
        created_at: n.created_at || n.updated_at || null,
        title:
          type === 'orders' ? `Order ${n.sale_order_number || n.order_id}` :
          type === 'machines' ? `Machine Issue: ${n.machine_name || 'Machine'}` :
          type === 'tools' ? `Tool Issue: ${n.tool_name || 'Tool'}` :
          type === 'components' ? `Component Issue: ${n.component_name || n.machine_name || 'Component'}` :
          type === 'calibrations' ? `Calibration Due: ${n.machine_name || 'Machine'}` :
          'Notification',
        tab:
          type === 'orders' ? '1' :
          type === 'machines' ? '2' :
          type === 'tools' ? '3' :
          type === 'components' ? '4' :
          '5'
      }));
  };

  const fetchUnreadNotifications = useCallback(async () => {
    if (!isAdminRoute) {
      setNotifItems([]);
      setUnreadCount(0);
      return;
    }
    try {
      setNotifLoading(true);
      // const endpoints = [
      //   `${config.API_BASE_URL}/order-notifications/`,
      //   `${config.API_BASE_URL}/machine-notifications/`,
      //   `${config.API_BASE_URL}/tool-issues-notifications/`,
      //   `${config.API_BASE_URL}/component-issues-notifications/`,
      //   `${config.API_BASE_URL}/machine-calibration-notifications/`,
      // ];
      const [orders, machines, tools, components, calibrations] = await Promise.all(
        endpoints.map((url) => fetch(url).then((r) => (r.ok ? r.json() : [])))
      );
      const items = [
        ...unify('orders', orders),
        ...unify('machines', machines),
        ...unify('tools', tools),
        ...unify('components', components),
        ...unify('calibrations', calibrations),
      ].sort((a, b) => (new Date(b.created_at || 0)) - (new Date(a.created_at || 0)))
       .slice(0, 10);
      setNotifItems(items);
      setUnreadCount(items.length);
    } catch (e) {
      setNotifItems([]);
      setUnreadCount(0);
    } finally {
      setNotifLoading(false);
    }
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) {
      fetchUnreadNotifications();
    } else {
      setUnreadCount(0);
    }
  }, [isAdminRoute, fetchUnreadNotifications, location.pathname]);

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
        {isAdminRoute && (
          <Popover
            trigger="click"
            placement="bottomRight"
            open={notifOpen}
            onOpenChange={(v) => {
              setNotifOpen(v);
              if (v) fetchUnreadNotifications();
            }}
            content={
              <div style={{ width: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                  <Text strong>Notifications</Text>
                  <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fetchUnreadNotifications} />
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto', paddingTop: 8 }}>
                  {notifLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                      <Spin />
                    </div>
                  ) : notifItems.length === 0 ? (
                    <Empty description="No notifications" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    notifItems.map(item => (
                      <div
                        key={`${item.type}_${item.id}`}
                        style={{ padding: '8px 6px', borderRadius: 6, cursor: 'pointer' }}
                        onClick={() => {
                          setNotifOpen(false);
                          navigate(`/admin/notification?tab=${item.tab}`);
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title}</div>
                        {item.created_at && (
                          <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2 }}>
                            {new Date(item.created_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            }
          >
            <Badge dot={unreadCount > 0}>
              <Button 
                type="text" 
                icon={<BellOutlined style={{ fontSize: screens.xs ? 18 : 20 }} />} 
              />
            </Badge>
          </Popover>
        )}
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
