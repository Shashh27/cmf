import React, { useEffect, useState, useCallback } from 'react';
import { Layout, Typography, Button, Avatar, Space, Badge, Popover, Grid, Empty, Spin } from 'antd';
import { BellOutlined, LogoutOutlined, ReloadOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import config from '../../Config/config';
import { useAuth } from '../../auth/AuthContext.jsx';
import { authFetch } from '../../api/client.js';
import { filterOwnCreatedNotifications, getStoredUser } from '../../utils/notificationFilters';

const { Header } = Layout;
const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const Navbar = ({ collapsed }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const screens = useBreakpoint();
  const { user, logoutToLogin } = useAuth();

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
      const u = user || null;
      if (u?.user_name) {
        name = u.user_name;
      } else if (u?.username) {
        name = u.username;
      }
    } catch (e) {}
    const avatar = name && name.length > 0 ? name.charAt(0).toUpperCase() : role.charAt(0).toUpperCase();
    return { role, name, avatar };
  };

  const roleInfo = getRoleInfo();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isMCRoute = location.pathname.startsWith('/manufacturing_coordinator');
  const showNotifBell = isAdminRoute || isMCRoute;
  const notifBasePath = isMCRoute
    ? '/manufacturing_coordinator/notification'
    : '/admin/notification';

  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifItems, setNotifItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadNotifications = useCallback(async () => {
    if (!showNotifBell) {
      setNotifItems([]);
      setUnreadCount(0);
      return;
    }
    try {
      setNotifLoading(true);
      const endpoints = [
        `${config.API_BASE_URL}/order-notifications/`,
        `${config.API_BASE_URL}/machine-notifications/`,
        `${config.API_BASE_URL}/tool-issues-notifications/`,
        `${config.API_BASE_URL}/component-issues-notifications/`,
        `${config.API_BASE_URL}/machine-calibration-notifications/`,
      ];
      const [orders, machines, tools, components, calibrations] = await Promise.all(
        endpoints.map((url) => authFetch(url).then((r) => (r.ok ? r.json() : []))),
      );

      const isPending = (n, type) => {
        if (type === 'orders') {
          if (isMCRoute) return !n.mc_is_ack;
          if (isAdminRoute) return !n.admin_is_ack;
          return !n.is_ack;
        }
        return !n.is_ack;
      };

      const unify = (type, arr) => {
        if (!Array.isArray(arr)) return [];
        let list = arr;
        if (type === 'orders') {
          list = filterOwnCreatedNotifications(list, getStoredUser());
        }
        return list
          .filter((n) => isPending(n, type))
          .map((n) => ({
            id: n.id,
            type,
            created_at: n.created_at || n.updated_at || null,
            title:
              type === 'orders'
                ? `Project ${n.sale_order_number || n.order_id}`
                : type === 'machines'
                  ? `Machine Breakdown: ${n.machine_name || 'Machine'}`
                  : type === 'tools'
                    ? `Tool Issue: ${n.tool_description || n.tool_name || 'Tool'}`
                    : type === 'components'
                      ? `Component Issue: ${n.component_name || n.machine_name || 'Component'}`
                      : type === 'calibrations'
                        ? `Calibration Due: ${n.machine_name || 'Machine'}`
                        : 'Notification',
            tab:
              type === 'orders'
                ? '1'
                : type === 'machines'
                  ? '2'
                  : type === 'tools'
                    ? '3'
                    : type === 'components'
                      ? '4'
                      : '5',
          }));
      };

      const items = [
        ...unify('orders', orders),
        ...unify('machines', machines),
        ...unify('tools', tools),
        ...unify('components', components),
        ...unify('calibrations', calibrations),
      ].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      setUnreadCount(items.length);
      setNotifItems(items.slice(0, 3));
    } catch (e) {
      setNotifItems([]);
      setUnreadCount(0);
    } finally {
      setNotifLoading(false);
    }
  }, [showNotifBell, isAdminRoute, isMCRoute]);

  useEffect(() => {
    if (!showNotifBell) {
      setUnreadCount(0);
      setNotifItems([]);
    }
  }, [showNotifBell]);

  const goToNotifications = (tab) => {
    setNotifOpen(false);
    navigate(tab ? `${notifBasePath}?tab=${tab}` : notifBasePath);
  };

  const getTitle = () => {
    const path = location.pathname;
    if (path.includes('/production_logs')) return 'Production Logs';
    if (path.includes('/dashboard')) return 'Dashboard';
    if (path.includes('/oms/orders')) return 'Orders';
    if (path.includes('/oms/product/')) return 'Product Data Management';
    if (path.includes('/order-tracking')) return 'Order Tracking';
    if (path.includes('/production-logs')) return 'Production Logs History';
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
    if (path.includes('/assets-availability')) return 'Assets Availability';
    if (path.includes('/pokayoke-checklists')) return 'PokaYoke Checklist';
    if (path.includes('/preventive-maintenance')) return 'Preventive Maintenance';
    if (path.includes('/create-inspection-plan')) return 'Inspection Plan';
    if (path.includes('/production-log')) return 'Production Log';
    if (path.includes('/product-monitoring')) return 'Production Monitoring';
    if (path.includes('/quality-management')) return 'Quality Management';
    if (path.includes('/maintenance-management')) return 'Maintenance Management';
    if (path.includes('/inventory-management')) return 'Inventory Management';
    if (path.includes('/document-management')) return 'Document Management';
    if (path.includes('/notification')) return 'Notification';
    if (path.includes('/access_control')) return 'Access Control';
    if (path.includes('/inspection-results')) return 'Inspection Results';
    if (path.includes('/inventory-data')) return 'Inventory Data';
    if (path.includes('/documents')) return 'Documents';
    if (path.includes('/leave-log')) return 'Leave Log';
    return '';
  };

  const handleLogout = async () => {
    await logoutToLogin(navigate);
  };

  const userMenu = (
    <div style={{ minWidth: '120px' }}>
      <div style={{ padding: '4px 0 8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '8px' }}>
        <Text type="secondary" style={{ fontSize: 'clamp(11px, 2vw, 12px)' }}>
          Role: {roleInfo.role}
        </Text>
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

  const notifPopover = (
    <div style={{ width: 320 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 8,
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Text strong>Latest Notifications</Text>
        <Button size="small" type="text" icon={<ReloadOutlined />} onClick={fetchUnreadNotifications} />
      </div>
      <div style={{ maxHeight: 280, overflowY: 'auto', paddingTop: 8 }}>
        {notifLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spin />
          </div>
        ) : notifItems.length === 0 ? (
          <Empty description="No new notifications" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          notifItems.map((item) => (
            <div
              key={`${item.type}_${item.id}`}
              style={{ padding: '8px 6px', borderRadius: 6, cursor: 'pointer' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => goToNotifications(item.tab)}
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
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8, marginTop: 4 }}>
        <Button type="link" block onClick={() => goToNotifications()}>
          View all notifications
        </Button>
      </div>
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
        width: screens.md ? `calc(100% - ${collapsed ? 80 : 224}px)` : '100%',
      }}
      className="responsive-navbar"
    >
      <style>{`
        @media (max-width: 768px) {
          .responsive-navbar {
            padding-left: 64px !important;
          }
        }
        @keyframes notif-bell-ring {
          0%, 100% { transform: rotate(0); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(4deg); }
          60% { transform: rotate(0); }
        }
        @keyframes notif-badge-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.65); }
          70% { box-shadow: 0 0 0 8px rgba(255, 77, 79, 0); }
          100% { box-shadow: 0 0 0 0 rgba(255, 77, 79, 0); }
        }
        .notif-bell-btn.has-unread .anticon-bell {
          color: #ff4d4f !important;
          animation: notif-bell-ring 2.5s ease-in-out infinite;
          transform-origin: top center;
        }
        .notif-bell-btn.has-unread {
          position: relative;
        }
        .notif-alert-badge .ant-badge-count {
          animation: notif-badge-pulse 1.8s ease-out infinite;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          line-height: 18px;
          padding: 0 5px;
          box-shadow: 0 0 0 2px #fff;
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
          maxWidth: 'calc(100vw - 200px)',
        }}
      >
        {getTitle()}
      </Title>

      <Space size={screens.xs ? 'small' : 'large'}>
        {showNotifBell && (
          <Popover
            trigger="click"
            placement="bottomRight"
            open={notifOpen}
            onOpenChange={(v) => {
              setNotifOpen(v);
              if (v) fetchUnreadNotifications();
            }}
            content={notifPopover}
          >
            <Badge
              className={unreadCount > 0 ? 'notif-alert-badge' : undefined}
              count={unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : 0}
              overflowCount={99}
              offset={[-4, 4]}
              style={{ backgroundColor: '#ff4d4f' }}
            >
              <Button
                type="text"
                aria-label="Notifications"
                className={unreadCount > 0 ? 'notif-bell-btn has-unread' : 'notif-bell-btn'}
                icon={
                  <BellOutlined
                    style={{
                      fontSize: screens.xs ? 18 : 20,
                      color: unreadCount > 0 ? '#ff4d4f' : undefined,
                    }}
                  />
                }
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
                fontSize: screens.xs ? '14px' : '18px',
              }}
            >
              {roleInfo.avatar}
            </Avatar>
            {!screens.xs && (
              <Text
                strong
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: 'clamp(12px, 2.5vw, 14px)',
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
