import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Card,
  DatePicker,
  Space,
  Button,
  Badge,
  Tabs,
  Modal,
  Radio,
  message,
  Typography,
  Input,
} from 'antd';
import {
  ShoppingCartOutlined,
  ToolOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  BellOutlined,
  HistoryOutlined,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { authFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

import OrderNotifications from './Notification Components/OrderNotifications';
import MachineNotifications from './Notification Components/MachineNotifications';
import ToolIssuesNotifications from './Notification Components/ToolIssuesNotifications';
import ComponentIssuesNotifications from './Notification Components/ComponentIssuesNotifications';
import MachineCalibrationNotifications from './Notification Components/MachineCalibrationNotifications';
import PokayokeOperationNotification from './Notification Components/PokayokeOperationNotification';
import ProductionLogNotification from './Notification Components/ProductionLogNotification';
import config from '../Config/config';
import { filterOwnCreatedNotifications, getStoredUser } from '../utils/notificationFilters';
import {
  disableFutureDates,
  normalizeDateRange,
  normalizeUserRole,
  getCurrentUserInfo,
  getOrderAckState,
} from '../Notification Components/notificationTableUtils';

const { Text } = Typography;

const TAB_KEYS = {
  project: '1',
  machines: '2',
  tools: '3',
  components: '4',
  calibrations: '5',
  pokayoke: '6',
  productionLogs: '7',
};

const Notification = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, bootstrapping } = useAuth();
  const [dateRange, setDateRange] = useState(null);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState(TAB_KEYS.project);
  const [counts, setCounts] = useState({
    project: 0,
    machines: 0,
    tools: 0,
    components: 0,
    calibrations: 0,
    pokayoke: 0,
    productionLogs: 0,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [ackAllOpen, setAckAllOpen] = useState(false);
  const [ackAllScope, setAckAllScope] = useState('current');
  const [ackAllLoading, setAckAllLoading] = useState(false);

  const setCount = useCallback(
    (key) => (n) => {
      setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }));
    },
    [],
  );

  const countSetters = useMemo(
    () => ({
      project: setCount('project'),
      machines: setCount('machines'),
      tools: setCount('tools'),
      components: setCount('components'),
      calibrations: setCount('calibrations'),
      pokayoke: setCount('pokayoke'),
      productionLogs: setCount('productionLogs'),
    }),
    [setCount],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && ['1', '2', '3', '4', '5', '6', '7'].includes(t)) setActiveKey(t);
  }, [location.search]);

  const dateParams = useCallback(() => {
    const params = new URLSearchParams();
    if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
    if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
    return params;
  }, [dateRange]);

  const fetchCounts = useCallback(async () => {
    try {
      const params = dateParams();
      const user = getStoredUser();
      const userRole = String(user?.role || user?.user_role || '').toLowerCase();
      const qs = params.toString();
      const endpoints = [
        `${config.API_BASE_URL}/order-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/machine-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/tool-issues-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/component-issues-notifications/${qs ? `?${qs}` : ''}`,
        `${config.API_BASE_URL}/machine-calibration-notifications/${qs ? `?${qs}` : ''}`,
      ];
      const [orders, machines, tools, components, calibrations] = await Promise.all(
        endpoints.map((url) => authFetch(url).then((r) => (r.ok ? r.json() : []))),
      );
      const visibleOrders = filterOwnCreatedNotifications(orders, user);
      const countPendingOrders = (notifications) => {
        if (!Array.isArray(notifications)) return 0;
        return notifications.filter((n) => {
          if (userRole.includes('manufacturing')) return !n.mc_is_ack;
          if (userRole.includes('project')) return !n.pc_is_ack;
          if (userRole.includes('admin')) return !n.admin_is_ack;
          return !n.is_ack;
        }).length;
      };
      const countPendingSimple = (notifications) =>
        Array.isArray(notifications) ? notifications.filter((n) => !n.is_ack).length : 0;

      setCounts((c) => ({
        ...c,
        project: countPendingOrders(visibleOrders),
        machines: countPendingSimple(machines),
        tools: countPendingSimple(tools),
        components: countPendingSimple(components),
        calibrations: countPendingSimple(calibrations),
      }));
    } catch {
      /* silent */
    }
  }, [dateParams]);

  useEffect(() => {
    if (bootstrapping || !isAuthenticated) return;
    fetchCounts();
  }, [fetchCounts, isAuthenticated, bootstrapping]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    fetchCounts();
  };

  const onTabChange = (k) => {
    setActiveKey(k);
    setQuery('');
    const params = new URLSearchParams(location.search);
    params.set('tab', k);
    navigate({ pathname: location.pathname, search: `?${params.toString()}` }, { replace: true });
  };

  const fetchTyped = async (path) => {
    const qs = dateParams().toString();
    const res = await authFetch(`${config.API_BASE_URL}${path}${qs ? `?${qs}` : ''}`);
    return res.ok ? res.json() : [];
  };

  const ackSimpleList = async (endpoint, items) => {
    const pending = (items || []).filter((n) => !n.is_ack);
    await Promise.all(
      pending.map((n) => authFetch(`${config.API_BASE_URL}${endpoint}/${n.id}/ack`, { method: 'PUT' })),
    );
    return pending.length;
  };

  const ackProjects = async (items) => {
    const user = getCurrentUserInfo();
    if (!user.username || !user.role) throw new Error('User information not found');
    const role = normalizeUserRole(user.role);
    const pending = (items || []).filter((n) => !getOrderAckState(n, user.role).isAck);
    await Promise.all(
      pending.map((n) =>
        authFetch(`${config.API_BASE_URL}/order-notifications/${n.id}/ack`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, user_name: user.username }),
        }),
      ),
    );
    return pending.length;
  };

  const handleAckAll = async () => {
    setAckAllLoading(true);
    try {
      const tabToKey = {
        [TAB_KEYS.project]: 'project',
        [TAB_KEYS.machines]: 'machines',
        [TAB_KEYS.tools]: 'tools',
        [TAB_KEYS.components]: 'components',
        [TAB_KEYS.calibrations]: 'calibrations',
      };
      const coreKeys = Object.values(tabToKey);
      const scopes =
        ackAllScope === 'all'
          ? coreKeys
          : [tabToKey[activeKey]].filter(Boolean);

      if (!scopes.length) {
        message.info('Acknowledge All is not available for this tab. Use row actions instead.');
        setAckAllOpen(false);
        return;
      }

      let total = 0;
      for (const key of scopes) {
        if (key === 'project') {
          const raw = await fetchTyped('/order-notifications/');
          total += await ackProjects(filterOwnCreatedNotifications(raw, getStoredUser()));
        } else if (key === 'machines') {
          total += await ackSimpleList('/machine-notifications', await fetchTyped('/machine-notifications/'));
        } else if (key === 'tools') {
          total += await ackSimpleList(
            '/tool-issues-notifications',
            await fetchTyped('/tool-issues-notifications/'),
          );
        } else if (key === 'components') {
          total += await ackSimpleList(
            '/component-issues-notifications',
            await fetchTyped('/component-issues-notifications/'),
          );
        } else if (key === 'calibrations') {
          total += await ackSimpleList(
            '/machine-calibration-notifications',
            await fetchTyped('/machine-calibration-notifications/'),
          );
        }
      }
      message.success(total ? `Acknowledged ${total} notification(s)` : 'No pending notifications to acknowledge');
      setAckAllOpen(false);
      handleRefresh();
    } catch (e) {
      message.error(e.message || 'Failed to acknowledge notifications');
    } finally {
      setAckAllLoading(false);
    }
  };

  const sharedProps = { dateRange, refreshKey, query };

  const searchPlaceholder = {
    [TAB_KEYS.project]: 'Search projects...',
    [TAB_KEYS.machines]: 'Search machines...',
    [TAB_KEYS.tools]: 'Search tools...',
    [TAB_KEYS.components]: 'Search component issues...',
    [TAB_KEYS.calibrations]: 'Search machines...',
    [TAB_KEYS.pokayoke]: 'Search checklists...',
    [TAB_KEYS.productionLogs]: 'Search production logs...',
  }[activeKey] || 'Search...';

  const tabItems = [
    {
      key: TAB_KEYS.project,
      label: (
        <span>
          <ShoppingCartOutlined />{' '}
          <Badge count={counts.project} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Project Notifications</span>
          </Badge>
        </span>
      ),
      children: <OrderNotifications {...sharedProps} onCount={countSetters.project} />,
    },
    {
      key: TAB_KEYS.machines,
      label: (
        <span>
          <BellOutlined />{' '}
          <Badge count={counts.machines} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Machine Breakdown</span>
          </Badge>
        </span>
      ),
      children: <MachineNotifications {...sharedProps} onCount={countSetters.machines} />,
    },
    {
      key: TAB_KEYS.tools,
      label: (
        <span>
          <ToolOutlined />{' '}
          <Badge count={counts.tools} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Tool Issues</span>
          </Badge>
        </span>
      ),
      children: <ToolIssuesNotifications {...sharedProps} onCount={countSetters.tools} />,
    },
    {
      key: TAB_KEYS.components,
      label: (
        <span>
          <AppstoreOutlined />{' '}
          <Badge count={counts.components} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Component Issues</span>
          </Badge>
        </span>
      ),
      children: <ComponentIssuesNotifications {...sharedProps} onCount={countSetters.components} />,
    },
    {
      key: TAB_KEYS.calibrations,
      label: (
        <span>
          <ExperimentOutlined />{' '}
          <Badge count={counts.calibrations} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Machine Calibration</span>
          </Badge>
        </span>
      ),
      children: <MachineCalibrationNotifications {...sharedProps} onCount={countSetters.calibrations} />,
    },
    {
      key: TAB_KEYS.pokayoke,
      label: (
        <span>
          <BellOutlined />{' '}
          <Badge count={counts.pokayoke} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>PokaYoke Checklist</span>
          </Badge>
        </span>
      ),
      children: (
        <PokayokeOperationNotification
          refreshKey={refreshKey}
          onUnacknowledgedCountChange={countSetters.pokayoke}
        />
      ),
    },
    {
      key: TAB_KEYS.productionLogs,
      label: (
        <span>
          <HistoryOutlined />{' '}
          <Badge count={counts.productionLogs} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Production Logs</span>
          </Badge>
        </span>
      ),
      children: <ProductionLogNotification refreshKey={refreshKey} onCount={countSetters.productionLogs} />,
    },
  ];

  return (
    <div style={{ padding: '4px' }}>
      <Card
        variant="outlined"
        style={{
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'nowrap',
            gap: 12,
            alignItems: 'center',
            marginBottom: 16,
            overflowX: 'auto',
          }}
        >
          <Input.Search
            placeholder={searchPlaceholder}
            allowClear
            maxLength={40}
            value={query}
            onSearch={setQuery}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 260, minWidth: 200, flexShrink: 0 }}
          />
          <Space size={8} style={{ flexShrink: 0 }}>
            <span style={{ fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap' }}>Date Range:</span>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(vals) => setDateRange(normalizeDateRange(vals))}
              disabledDate={disableFutureDates}
              allowClear
              inputReadOnly
              placeholder={['From', 'To']}
              style={{ width: 260, borderRadius: 6 }}
            />
          </Space>
          <div style={{ flex: 1, minWidth: 8 }} />
          <Space size={8} style={{ flexShrink: 0 }}>
            <Button
              icon={<CheckOutlined />}
              onClick={() => {
                setAckAllScope('current');
                setAckAllOpen(true);
              }}
            >
              Acknowledge All
            </Button>
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              style={{ borderRadius: 6, background: '#3b82f6' }}
            >
              Refresh
            </Button>
          </Space>
        </div>

        <Tabs
          activeKey={activeKey}
          onChange={onTabChange}
          items={tabItems}
          destroyInactiveTabPane
          style={{ marginTop: -8 }}
        />
      </Card>

      <Modal
        title="Acknowledge All Notifications"
        open={ackAllOpen}
        onCancel={() => setAckAllOpen(false)}
        onOk={handleAckAll}
        confirmLoading={ackAllLoading}
        okText="Acknowledge"
      >
        <Text style={{ display: 'block', marginBottom: 12 }}>
          Choose which notifications to acknowledge:
        </Text>
        <Radio.Group
          value={ackAllScope}
          onChange={(e) => setAckAllScope(e.target.value)}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          <Radio value="current">Current tab only</Radio>
          <Radio value="all">All core tabs</Radio>
        </Radio.Group>
      </Modal>
    </div>
  );
};

export default Notification;
