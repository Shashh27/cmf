import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Card,
  DatePicker,
  Space,
  Button,
  Badge,
  Typography,
  Tabs,
  Modal,
  Radio,
  message,
  Input,
} from 'antd';
import {
  ShoppingCartOutlined,
  ToolOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  BellOutlined,
  FileSearchOutlined,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { authFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import dayjs from 'dayjs';
import { QUALITY_API_BASE_URL } from '../Config/qualityconfig';
import InspectionPlanNotifications from '../Notification Components/InspectionPlanNotifications';
import { useLocation, useNavigate } from 'react-router-dom';
import Lottie from 'lottie-react';
import notificationBell from '../assets/Notification bell.json';
import axios from 'axios';

import OrderNotifications from '../Notification Components/OrderNotifications';
import MachineNotifications from '../Notification Components/MachineNotifications';
import ToolIssuesNotifications from '../Notification Components/ToolIssuesNotifications';
import ComponentIssuesNotifications from '../Notification Components/ComponentIssuesNotifications';
import MachineCalibrationNotifications from '../Notification Components/MachineCalibrationNotifications';
import config from '../Config/config';
import { filterOwnCreatedNotifications, getStoredUser } from '../utils/notificationFilters';
import {
  disableFutureDates,
  normalizeDateRange,
  normalizeUserRole,
  getCurrentUserInfo,
  getOrderAckState,
} from '../Notification Components/notificationTableUtils';

const { Title, Text } = Typography;

const TAB_KEYS = {
  project: '1',
  machines: '2',
  tools: '3',
  components: '4',
  calibrations: '5',
  inspectionPlans: '6',
};

const Notification = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, bootstrapping } = useAuth();
  const supervisorInspectionOnly = location.pathname.startsWith('/supervisor');

  const [dateRange, setDateRange] = useState(null);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState(TAB_KEYS.project);
  const [counts, setCounts] = useState({
    project: 0,
    machines: 0,
    tools: 0,
    components: 0,
    calibrations: 0,
    inspectionPlans: 0,
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
      inspectionPlans: setCount('inspectionPlans'),
    }),
    [setCount],
  );

  useEffect(() => {
    if (supervisorInspectionOnly) return;
    const params = new URLSearchParams(location.search);
    const t = params.get('tab');
    if (t && ['1', '2', '3', '4', '5', '6'].includes(t)) setActiveKey(t);
  }, [location.search, supervisorInspectionOnly]);

  const dateParams = useCallback(() => {
    const params = new URLSearchParams();
    if (dateRange?.[0]) params.set('start_date', dayjs(dateRange[0]).startOf('day').toISOString());
    if (dateRange?.[1]) params.set('end_date', dayjs(dateRange[1]).endOf('day').toISOString());
    return params;
  }, [dateRange]);

  const fetchCounts = useCallback(async () => {
    if (supervisorInspectionOnly) {
      try {
        const inspRes = await fetch(
          `${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications?only_pending=true`,
        );
        const inspectionPlans = inspRes.ok ? await inspRes.json() : [];
        setCounts((c) => ({
          ...c,
          inspectionPlans: Array.isArray(inspectionPlans) ? inspectionPlans.length : 0,
        }));
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const storedUser = getStoredUser();
      const qs = dateParams().toString();
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
      const inspRes = await fetch(
        `${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications?only_pending=true`,
      );
      const inspectionPlans = inspRes.ok ? await inspRes.json() : [];
      const visibleOrders = filterOwnCreatedNotifications(orders, storedUser);
      const role = String(storedUser?.role || storedUser?.user_role || '').toLowerCase();
      setCounts({
        project: Array.isArray(visibleOrders)
          ? visibleOrders.filter((n) => {
              if (role.includes('manufacturing')) return !n.mc_is_ack;
              if (role.includes('project')) return !n.pc_is_ack;
              if (role.includes('admin')) return !n.admin_is_ack;
              return !n.is_ack;
            }).length
          : 0,
        machines: Array.isArray(machines) ? machines.filter((n) => !n.is_ack).length : 0,
        tools: Array.isArray(tools) ? tools.filter((n) => !n.is_ack).length : 0,
        components: Array.isArray(components) ? components.filter((n) => !n.is_ack).length : 0,
        calibrations: Array.isArray(calibrations) ? calibrations.filter((n) => !n.is_ack).length : 0,
        inspectionPlans: Array.isArray(inspectionPlans) ? inspectionPlans.length : 0,
      });
    } catch {
      /* silent fail */
    }
  }, [dateParams, supervisorInspectionOnly]);

  useEffect(() => {
    if (bootstrapping || !isAuthenticated) return;
    fetchCounts();
  }, [fetchCounts, isAuthenticated, bootstrapping]);

  const handleRefresh = () => {
    // Reload active tab immediately; badge counts refresh in background
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

  const ackInspectionPlans = async () => {
    const res = await axios.get(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications`);
    const data = Array.isArray(res.data) ? res.data : [];
    const pending = data.filter((n) => !n.is_ack && n.category !== 'ftp_request');
    const user = getCurrentUserInfo();
    const ackBy = (user.username || '').trim();
    if (!ackBy) throw new Error('Could not read your username');
    await Promise.all(
      pending.map((n) =>
        axios.put(`${QUALITY_API_BASE_URL}/operator/inspection-plan-notifications/${n.id}/ack`, {
          ack_by: ackBy,
        }),
      ),
    );
    return pending.length;
  };

  const fetchTyped = async (path) => {
    const qs = dateParams().toString();
    const res = await authFetch(`${config.API_BASE_URL}${path}${qs ? `?${qs}` : ''}`);
    return res.ok ? res.json() : [];
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
        [TAB_KEYS.inspectionPlans]: 'inspectionPlans',
      };
      const scopes =
        ackAllScope === 'all'
          ? Object.values(tabToKey)
          : [tabToKey[activeKey]];

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
        } else if (key === 'inspectionPlans') {
          total += await ackInspectionPlans();
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
    [TAB_KEYS.inspectionPlans]: 'Search project, part, operator...',
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
      key: TAB_KEYS.inspectionPlans,
      label: (
        <span>
          <FileSearchOutlined />{' '}
          <Badge count={counts.inspectionPlans} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
            <span>Inspection Plan</span>
          </Badge>
        </span>
      ),
      children: <InspectionPlanNotifications {...sharedProps} onCount={countSetters.inspectionPlans} />,
    },
  ];

  const headerControls = (
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
        placeholder={supervisorInspectionOnly ? 'Search project, part, operator...' : searchPlaceholder}
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
        {!supervisorInspectionOnly && (
          <Button
            icon={<CheckOutlined />}
            onClick={() => {
              setAckAllScope('current');
              setAckAllOpen(true);
            }}
          >
            Acknowledge All
          </Button>
        )}
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
  );

  if (supervisorInspectionOnly) {
    return (
      <div style={{ padding: '4px' }}>
        <Card
          variant="outlined"
          style={{
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            borderRadius: 12,
            marginBottom: 20,
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Lottie animationData={notificationBell} style={{ width: 60, height: 60 }} />
            <div>
              <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 600, color: '#1e293b' }}>
                <Space>
                  <span>Inspection plan requests</span>
                  <Badge
                    count={counts.inspectionPlans}
                    showZero
                    style={{ backgroundColor: counts.inspectionPlans ? '#faad14' : '#cbd5e1' }}
                  />
                </Space>
              </Title>
              <Text type="secondary" style={{ fontSize: 14, color: '#64748b', display: 'block' }}>
                Operators request a confirmed plan for an in-progress operation. Acknowledge, then create the plan
                (Create Inspection Plan / QMS).
              </Text>
            </div>
          </div>
        </Card>

        <Card
          variant="outlined"
          style={{
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            borderRadius: 12,
            border: '1px solid #e2e8f0',
          }}
        >
          {headerControls}
          <InspectionPlanNotifications {...sharedProps} onCount={countSetters.inspectionPlans} />
        </Card>
      </div>
    );
  }

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
        {headerControls}
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
          <Radio value="all">All tabs</Radio>
        </Radio.Group>
      </Modal>
    </div>
  );
};

export default Notification;
