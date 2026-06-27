import React, { useState, useCallback, useEffect } from 'react';
import { Tabs, Card, DatePicker, Space, Button, Badge, Typography } from 'antd';
import { ShoppingCartOutlined, ToolOutlined, AppstoreOutlined, ExperimentOutlined, BellOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import Lottie from 'lottie-react';
import notificationBell from '../assets/Notification bell.json';

const { Title, Text } = Typography;
import OrderNotifications from './Notification Components/OrderNotifications';
import MachineNotifications from './Notification Components/MachineNotifications';
import ToolIssuesNotifications from './Notification Components/ToolIssuesNotifications';
import ComponentIssuesNotifications from './Notification Components/ComponentIssuesNotifications';
import MachineCalibrationNotifications from './Notification Components/MachineCalibrationNotifications';
import PokayokeOperationNotification from './Notification Components/PokayokeOperationNotification';
import config from '../Config/config';

const Notification = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState([null, null]);
  const [activeKey, setActiveKey] = useState('1');
  const [counts, setCounts] = useState({ orders: 0, machines: 0, tools: 0, components: 0, calibrations: 0, pokayoke: 0 });
  const setOrdersCount = useCallback((n) => setCounts((c) => ({ ...c, orders: n })), []);
  const setMachinesCount = useCallback((n) => setCounts((c) => ({ ...c, machines: n })), []);
  const setToolsCount = useCallback((n) => setCounts((c) => ({ ...c, tools: n })), []);
  const setComponentsCount = useCallback((n) => setCounts((c) => ({ ...c, components: n })), []);
  const setCalibrationsCount = useCallback((n) => setCounts((c) => ({ ...c, calibrations: n })), []);
  const setPokayokeCount = useCallback((n) => setCounts((c) => ({ ...c, pokayoke: n })), []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && ['1','2','3','4','5','6'].includes(t)) {
      setActiveKey(t);
    }
  }, [location.search]);

  const fetchCounts = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
      if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
      
      // Add role-based filtering based on user's role
      const storedUser = localStorage.getItem('user');
      let userRole = '';
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          userRole = (user.role || user.user_role || '').toLowerCase();
          if (userRole.includes('manufacturing') || userRole === 'mc') {
            if (user.id) params.set('mc_id', user.id);
          } else if (userRole.includes('project') || userRole === 'pc') {
            if (user.id) params.set('pc_id', user.id);
          } else if (userRole.includes('admin')) {
            if (user.id) params.set('admin_id', user.id);
          }
        } catch (e) {
          console.error('Error parsing user from localStorage', e);
        }
      }
      
      const qs = params.toString();
      const endpoints = [
        `${config.API_BASE_URL}/order-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/machine-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/tool-issues-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/component-issues-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/machine-calibration-notifications/${qs ? `?${qs}` : ''}`,
      ];
      const [orders, machines, tools, components, calibrations] = await Promise.all(
        endpoints.map((url) => fetch(url).then((r) => (r.ok ? r.json() : [])))
      );
      
      // Count pending notifications based on role-specific acknowledgment status
      const countPending = (notifications) => {
        if (!Array.isArray(notifications)) return 0;
        return notifications.filter((n) => {
          if (userRole.includes('manufacturing')) return !n.mc_is_ack;
          if (userRole.includes('project')) return !n.pc_is_ack;
          if (userRole.includes('admin')) return !n.admin_is_ack;
          return !n.is_ack; // fallback for other roles
        }).length;
      };
      
      setCounts({
        orders: countPending(orders),
        machines: countPending(machines),
        tools: countPending(tools),
        components: countPending(components),
        calibrations: countPending(calibrations),
      });
    } catch (e) {
      // silent fail; badges will update when tabs are visited
    }
  }, [dateRange]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const tabItems = [
    {
      key: '1',
      label: (
        <span>
          <ShoppingCartOutlined />
          <Badge count={counts.orders} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Order Notifications</span>
          </Badge>
        </span>
      ),
      children: <OrderNotifications dateRange={dateRange} onCount={setOrdersCount} />
    },
    {
      key: '2',
      label: (
        <span>
          <BellOutlined />
          <Badge count={counts.machines} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Machine Breakdown Notifications</span>
          </Badge>
        </span>
      ),
      children: <MachineNotifications dateRange={dateRange} onCount={setMachinesCount} />
    },
    {
      key: '3',
      label: (
        <span>
          <ToolOutlined />
          <Badge count={counts.tools} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Tool Issues Notifications</span>
          </Badge>
        </span>
      ),
      children: <ToolIssuesNotifications dateRange={dateRange} onCount={setToolsCount} />
    },
    {
      key: '4',
      label: (
        <span>
          <AppstoreOutlined />
          <Badge count={counts.components} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Component Issues Notifications</span>
          </Badge>
        </span>
      ),
      children: <ComponentIssuesNotifications dateRange={dateRange} onCount={setComponentsCount} />
    },
    {
      key: '5',
      label: (
        <span>
          <ExperimentOutlined />
          <Badge count={counts.calibrations} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Machine Calibration Notifications</span>
          </Badge>
        </span>
      ),
      children: <MachineCalibrationNotifications dateRange={dateRange} onCount={setCalibrationsCount} />
    },
    {
      key: '6',
      label: (
        <span>
          <BellOutlined />
          <Badge count={counts.pokayoke} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>PokaYoke Checklist</span>
          </Badge>
        </span>
      ),
      children: <PokayokeOperationNotification onUnacknowledgedCountChange={setPokayokeCount} />
    }
  ];

  const headerControls = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
      <Space>
        <span style={{ fontWeight: 600, color: '#64748b' }}>Date Range:</span>
        <DatePicker.RangePicker
          onChange={(vals) => setDateRange(vals)}
          allowClear
          inputReadOnly
          placeholder={['Start date', 'End date']}
          style={{ width: 300, borderRadius: '6px' }}
        />
      </Space>
      <Button 
        type="primary" 
        onClick={fetchCounts}
        style={{ borderRadius: '6px', background: '#3b82f6' }}
      >
        Refresh
      </Button>
    </div>
  );

  return (
    <div style={{ padding: '4px' }}>
      <Card
        variant="outlined"
        style={{ 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          marginBottom: 20,
          border: '1px solid #e2e8f0'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Lottie animationData={notificationBell} style={{ width: 60, height: 60 }} />
          <div>
            <Title level={2} style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#1e293b' }}>
              Notifications Centre
            </Title>
            <Text type="secondary" style={{ fontSize: 14, color: '#64748b', display: 'block' }}>
              Monitor and acknowledge system alerts
            </Text>
          </div>
        </div>
      </Card>

      <Card
        variant="outlined"
        style={{ 
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          border: '1px solid #e2e8f0'
        }}
      >
        {headerControls}
        <Tabs 
          activeKey={activeKey}
          onChange={(k) => {
            setActiveKey(k);
            const params = new URLSearchParams(location.search);
            params.set('tab', k);
            navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
          }}
          items={tabItems} 
          destroyInactiveTabPane 
          style={{ marginTop: -8 }}
        />
      </Card>
    </div>
  );
};

export default Notification;
