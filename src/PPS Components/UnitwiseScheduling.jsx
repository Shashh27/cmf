/**
 * Unit Scheduling — unit-wise Gantt view.
 *
 * Displays the unit-wise schedule with order/part palette legend.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Button, Select, DatePicker, Tooltip, Modal, message } from 'antd';
import {
  CONTROL_BAR_MOTION,
  getWindowAnimation,
} from './schedulingTimelineMotion.js';
import { motion } from 'framer-motion';
import UnitWiseGantt from './scheduling/gantt/UnitWiseGantt.jsx';
import { getTimeRange, mapUnitWiseItemsToOperations } from './schedulingTimelineUtils.js';
import { api } from '../api/client.js';
import {
  fetchMachines,
  fetchOrders,
  fetchShiftHours,
  fetchUnitWiseSchedule,
  rebuildUnitWiseSchedule,
} from './scheduling/api/unitWiseApi.js';
import useLenis from '../hooks/useLenis.js';
import {
  SyncOutlined,
  ReloadOutlined,
  LeftOutlined,
  RightOutlined,
  InfoCircleOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  CalendarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import dayjs from 'dayjs';

const { Content } = Layout;
const { Option } = Select;

const UnitwiseScheduling = () => {
  const [scheduleData, setScheduleData] = useState({
    machines: [],
    scheduled_operations: [],
    component_status: {},
  });

  const [viewType, setViewType] = useState('week');
  const [dateRange, setDateRange] = useState(null);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [selectedProductionOrders, setSelectedProductionOrders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateScheduleLoading, setUpdateScheduleLoading] = useState(false);
  const [shiftConfigs, setShiftConfigs] = useState([]);

  const timelineRef = useRef(null);
  const machinesRef = useRef([]);

  useLenis(true);

  const fetchSchedule = async (machineList = machinesRef.current) => {
    try {
      const data = await fetchUnitWiseSchedule({ latestOnly: true });
      const items = Array.isArray(data?.items) ? data.items : [];
      setScheduleData((prev) => ({
        ...prev,
        machines: machineList?.length ? machineList : prev.machines,
        scheduled_operations: mapUnitWiseItemsToOperations(items, machineList),
        component_status: data?.component_status || {},
      }));
      if (!items.length) {
        message.info('No unit-wise rows yet. Use Update to generate a schedule.');
      }
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Failed to load unit-wise schedule');
    }
  };

  const handleUpdateSchedule = async () => {
    setUpdateScheduleLoading(true);
    try {
      await rebuildUnitWiseSchedule({ optimizer: 'greedy', assignmentMode: 'auto' });
      message.success('Schedule updated successfully');
      await fetchSchedule();
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Failed to update schedule');
    } finally {
      setUpdateScheduleLoading(false);
      setUpdateModalOpen(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [mList, orderList, shifts] = await Promise.all([
          fetchMachines().catch(() => []),
          fetchOrders().catch(() => api.get('/orders').then((r) => r.data).catch(() => [])),
          fetchShiftHours().catch(() => []),
        ]);
        const formatted = (mList || []).map((m) => {
          const modelName =
            m.make && m.model
              ? `(${m.make}) ${m.model}`
              : m.make || m.model || `Machine-${m.id}`;
          return {
            id: m.id,
            name: modelName,
            type: m.type || null,
            workcenter_id: m.workcenter_id ?? m.work_center_id ?? null,
            work_center_id: m.work_center_id ?? m.workcenter_id ?? null,
          };
        });
        machinesRef.current = formatted;
        setScheduleData(prev => ({ ...prev, machines: formatted }));
        setOrders(Array.isArray(orderList) ? orderList : []);
        setShiftConfigs(Array.isArray(shifts) ? shifts : []);
        await fetchSchedule(formatted);
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Project selection → filter Gantt by that sale order ────
  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    setParts([]);
    setSelectedComponents([]);

    if (!orderId) {
      setSelectedProductionOrders([]);
      return;
    }

    const order = orders.find(o => o.id === orderId);
    const so = order?.sale_order_number;

    if (so) {
      setSelectedProductionOrders([so]);
    } else {
      setSelectedProductionOrders([]);
    }

    if (so) {
      api.get(`/orders/sale-order/${so}/parts`)
        .then((r) => r.data)
        .then((d) => {
          const list = Array.isArray(d) ? d : (d.parts || []);
          setParts(list);
        })
        .catch(() => { });
    }
  };

  // ── Navigation ──────────────────────────────────────────────
  const handleTimelineNavigation = (direction) => {
    if (!timelineRef.current) return;
    const win = timelineRef.current.getWindow();
    const start = moment(win.start);
    const end = moment(win.end);
    const delta = direction === 'left' ? -1 : 1;
    const unit = { day: 'day', week: 'week', month: 'month', year: 'year' }[viewType] || 'week';
    timelineRef.current.setWindow(
      start.clone().add(delta, unit).toDate(),
      end.clone().add(delta, unit).toDate(),
      { animation: getWindowAnimation(scheduleData.scheduled_operations.length) }
    );
  };

  const handleViewTypeChange = (v) => {
    setViewType(v);
    if (!dateRange) {
      const r = getTimeRange(v, null, scheduleData);
      if (timelineRef.current) {
        timelineRef.current.setWindow(r.start, r.end, {
          animation: getWindowAnimation(scheduleData.scheduled_operations.length),
        });
      }
    }
  };

  const handleRefresh = () => {
    setSelectedMachines([]);
    setSelectedComponents([]);
    setSelectedProductionOrders([]);
    setDateRange(null);
    setSelectedProjectId(null);
    setParts([]);
    message.success('Filters cleared – data refreshed');
    fetchSchedule();
  };

  const availableMachines = useMemo(() => {
    const fromApi = (scheduleData.machines || [])
      .filter((m) => !(m.name || '').includes('Default'))
      .map((m, i) => {
        const machineId = m.machineId ?? m.id;
        return {
          id: machineId,
          machineId,
          name: m.displayName || m.name,
          displayName: m.displayName || m.name,
          order: i,
        };
      })
      .filter((m) => m.machineId != null);
    const known = new Set(fromApi.map((m) => m.machineId));
    const extras = [];
    (scheduleData.scheduled_operations || []).forEach((op) => {
      if (op.machineId == null || known.has(op.machineId)) return;
      known.add(op.machineId);
      extras.push({
        id: op.machineId,
        machineId: op.machineId,
        name: op.machineName || `Machine-${op.machineId}`,
        displayName: op.machineName || `Machine-${op.machineId}`,
        order: fromApi.length + extras.length,
      });
    });
    return [...fromApi, ...extras].sort((a, b) => a.order - b.order);
  }, [scheduleData.machines, scheduleData.scheduled_operations]);

  // ── Render ────────────────────────────────────────────────
  return (
    <Layout className="min-h-screen bg-gray-50 p-4">
      <Content>
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 mb-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 m-0">Unit Scheduling</h1>
            <p className="text-sm text-slate-500 m-0">
              Unit-wise schedule view with order/part palette legend.
            </p>
          </div>
        </div>

        {/* Controls */}
        <motion.div
          {...CONTROL_BAR_MOTION}
          style={{ marginBottom: 16, padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #f0f0f0', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
        >
          <Select value={viewType} onChange={handleViewTypeChange} style={{ width: 110 }} size="small">
            <Option value="day">Daily</Option>
            <Option value="week">Weekly</Option>
            <Option value="month">Monthly</Option>
            <Option value="year">Yearly</Option>
          </Select>

          <DatePicker.RangePicker
            size="small"
            format="DD-MM-YYYY"
            value={
              dateRange
                ? [dayjs(dateRange[0].format('YYYY-MM-DD')), dayjs(dateRange[1].format('YYYY-MM-DD'))]
                : null
            }
            onChange={(vals) =>
              setDateRange(vals
                ? [moment(vals[0].format('YYYY-MM-DD')), moment(vals[1].format('YYYY-MM-DD'))]
                : null
              )
            }
            placeholder={['Start Date', 'End Date']}
            style={{ width: 220 }}
          />

          <Select
            mode="multiple"
            placeholder="Select Machines"
            showSearch
            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
            value={selectedMachines}
            onChange={setSelectedMachines}
            style={{ minWidth: 210 }} allowClear size="small" maxTagCount={1}
          >
            {availableMachines.map(m => (
              <Option key={m.machineId} value={m.machineId} label={m.displayName}>
                {m.displayName}
              </Option>
            ))}
          </Select>

          <Select
            placeholder="Select Project"
            showSearch
            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
            value={selectedProjectId}
            onChange={handleProjectChange}
            style={{ minWidth: 180 }} allowClear size="small"
          >
            {orders.map(o => {
              const label = o.sale_order_number || `Order ${o.id}`;
              return (
                <Option key={o.id} value={o.id} label={label}>{label}</Option>
              );
            })}
          </Select>

          <Select
            mode="multiple"
            placeholder="Select Parts"
            showSearch
            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
            value={selectedComponents}
            onChange={setSelectedComponents}
            style={{ minWidth: 260 }} allowClear size="small" maxTagCount={1}
          >
            {parts.map(p => (
              <Option key={p.id} value={p.part_number} label={`${p.part_name || ''} (${p.part_number})`}>
                {p.part_name ? `${p.part_name} (${p.part_number})` : p.part_number}
              </Option>
            ))}
          </Select>

          <Button.Group size="small">
            <Tooltip title="Zoom In">
              <Button icon={<ZoomInOutlined />} onClick={() => timelineRef.current?.zoomIn(0.5)} />
            </Tooltip>
            <Tooltip title="Zoom Out">
              <Button icon={<ZoomOutOutlined />} onClick={() => timelineRef.current?.zoomOut(0.5)} />
            </Tooltip>
            <Tooltip title="Fit All">
              <Button icon={<FullscreenOutlined />} onClick={() => timelineRef.current?.fit()} />
            </Tooltip>
            <Button icon={<LeftOutlined />} onClick={() => handleTimelineNavigation('left')} />
            <Button icon={<RightOutlined />} onClick={() => handleTimelineNavigation('right')} />
          </Button.Group>

          <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setHelpOpen(true)} />
          <Button size="small" type="primary" icon={<ReloadOutlined />} style={{ background: '#1677ff' }} onClick={() => setUpdateModalOpen(true)}>Update</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={handleRefresh}>Refresh</Button>
        </motion.div>

        {/* Unit Wise Gantt */}
        <UnitWiseGantt
          timelineRef={timelineRef}
          scheduledOperations={scheduleData.scheduled_operations}
          availableMachines={availableMachines}
          shiftConfigs={shiftConfigs}
          selectedMachines={selectedMachines}
          selectedComponents={selectedComponents}
          selectedProductionOrders={selectedProductionOrders}
          dateRange={dateRange}
          viewType={viewType}
          onToggleOrder={(po) =>
            setSelectedProductionOrders(prev =>
              prev.includes(po) ? prev.filter(p => p !== po) : [...prev, po]
            )
          }
          onTogglePart={(part) =>
            setSelectedComponents(prev =>
              prev.includes(part) ? prev.filter(p => p !== part) : [...prev, part]
            )
          }
        />

        {/* Help Modal */}
        <Modal
          title="How to Use Timeline"
          open={helpOpen}
          onCancel={() => setHelpOpen(false)}
          footer={[<Button key="close" onClick={() => setHelpOpen(false)}>Close</Button>]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Navigation</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LeftOutlined /> <RightOutlined /> <span>Use arrow buttons or drag to move</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarOutlined /> <span>Use date picker to jump to dates</span>
            </div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>Zooming</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ZoomInOutlined /> <span>Click "+" to zoom in</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ZoomOutOutlined /> <span>Click "-" to zoom out</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FullscreenOutlined /> <span>Click "Fit" to show all</span>
            </div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>Interaction</div>
            <div>Click a task to view details</div>
            <div style={{ background: '#f6f7fb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10 }}>
              <InfoCircleOutlined style={{ marginRight: 8 }} />
              <span>Hold CTRL and use mouse wheel to zoom at cursor position</span>
            </div>
          </div>
        </Modal>

        {/* Update Modal */}
        <Modal
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WarningOutlined style={{ color: '#faad14', fontSize: 22 }} />
              Update Schedule
            </span>
          }
          open={updateModalOpen}
          onCancel={() => !updateScheduleLoading && setUpdateModalOpen(false)}
          footer={[
            <Button key="cancel" onClick={() => setUpdateModalOpen(false)} disabled={updateScheduleLoading}>
              Cancel
            </Button>,
            <Button key="ok" type="primary" loading={updateScheduleLoading} onClick={handleUpdateSchedule}>
              OK
            </Button>,
          ]}
          closable={!updateScheduleLoading}
          maskClosable={!updateScheduleLoading}
        >
          <p style={{ margin: 0 }}>
            Do you want to generate a new schedule? Please wait while we generate the new schedule.
          </p>
        </Modal>
      </Content>
    </Layout>
  );
};

export default UnitwiseScheduling;
