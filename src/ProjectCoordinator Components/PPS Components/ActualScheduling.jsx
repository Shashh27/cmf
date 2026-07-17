import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Layout, Button, Select, DatePicker, Tooltip, message, Modal } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import SchedulingGanttTimeline from './SchedulingGanttTimeline.jsx';
import { getComponentColors, getTimeRange } from './schedulingTimelineUtils.js';
import {
  CONTROL_BAR_MOTION,
  LEGEND_CHIP_MOTION,
  LEGEND_MOTION,
  getWindowAnimation,
} from './schedulingTimelineMotion.js';
import { SyncOutlined, ReloadOutlined, LeftOutlined, RightOutlined, InfoCircleOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, CalendarOutlined, WarningOutlined } from '@ant-design/icons';
import moment from 'moment';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../../Config/auth.js';
import { SCHEDULING_API_BASE_URL } from '../../Config/schedulingconfig.js';
import useLenis from '../../hooks/useLenis.js';

const { Content } = Layout;
const { Option } = Select;

const getCurrentProjectCoordinatorId = () => {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const user = JSON.parse(stored);
    if (user?.id == null) return null;
    return user.id;
  } catch {
    return null;
  }
};

const ComponentLegend = React.memo(({ componentColors, title, onToggle, active }) => (
  <div style={{ marginTop: 12, padding: '10px 14px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>{title}</div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {Object.entries(componentColors).map(([po, c], index) => (
        <motion.span
          key={po}
          {...LEGEND_CHIP_MOTION(index)}
          onClick={() => onToggle && onToggle(po)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            cursor: 'pointer', fontSize: 12,
            opacity: !active || active.length === 0 || active.includes(po) ? 1 : 0.35,
            transition: 'opacity .2s',
          }}
        >
          <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, background: c.backgroundColor, display: 'inline-block' }} />
          {po}
        </motion.span>
      ))}
    </div>
  </div>
));

const ActualScheduling = () => {
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
  const [skippedData, setSkippedData] = useState({
    skipped_orders: [],
    skipped_parts: [],
    parts_without_operations: []
  });
  const [shiftConfigs, setShiftConfigs] = useState([]);

  const timelineRef = useRef(null);

  useLenis(true);

  const componentColors = useMemo(
    () => getComponentColors(scheduleData.scheduled_operations),
    [scheduleData.scheduled_operations]
  );

  const fetchSchedule = async () => {
    try {
      const coordinatorId = getCurrentProjectCoordinatorId();
      const url = coordinatorId
        ? `${SCHEDULING_API_BASE_URL}/scheduling/gantt-data-rescheduling/project-coordinator/${coordinatorId}`
        : `${SCHEDULING_API_BASE_URL}/scheduling/view-rescheduling`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const ops = [];
      const gantt = Array.isArray(data?.gantt) ? data.gantt : [];
      gantt.forEach(g => {
        const machineName = g.machine_make && g.machine_model
          ? `(${g.machine_make}) ${g.machine_model}`
          : (g.machine_make || g.machine_model || '').trim();
        const tasks = Array.isArray(g.tasks) ? g.tasks : [];
        tasks.forEach(t => {
          if (g.machine_id != null) {
            ops.push({
              machineId: g.machine_id,
              machineName: machineName || '',
              component: t.part_number || '',
              part_name: t.part_name || '',
              production_order: t.sale_order_number || String(t.sale_order_id ?? t.schedule_item_id ?? ''),
              description: t.operation_name || '',
              operation_number: t.operation_number ?? '',
              start_time: t.planned_start_time,
              end_time: t.planned_end_time,
              quantity: t.total_quantity ?? 0,
              planned_quantity: t.planned_quantity ?? 0,
              remaining_quantity: t.remaining_quantity ?? (t.total_quantity ?? 0) - (t.planned_quantity ?? 0),
            });
          }
        });
      });
      setScheduleData(prev => ({ ...prev, scheduled_operations: ops }));
    } catch (e) { console.error(e); }
  };

  const handleUpdateSchedule = async () => {
    setUpdateScheduleLoading(true);
    try {
      const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/dynamic-reschedule`, {
        method: 'POST',
        headers: { 'accept': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setUpdateModalOpen(false);
        message.success('Schedule updated');
        setSkippedData({
          skipped_orders: data.skipped_orders || [],
          skipped_parts: data.skipped_parts || [],
          parts_without_operations: data.parts_without_operations || []
        });
        await fetchSchedule();
      } else {
        const err = await res.text().catch(() => '');
        message.error(err || 'Failed to update schedule');
      }
    } catch (e) {
      console.error(e);
      message.error('Update failed: ' + e.message);
    } finally {
      setUpdateScheduleLoading(false);
    }
  };

  const availableMachines = useMemo(() => {
    return (scheduleData.machines || [])
      .filter(m => !m.name.includes('Default'))
      .map((m, i) => ({
        id: m.id,
        machineId: m.id,
        name: m.name,
        displayName: m.name,
        order: i,
      }));
  }, [scheduleData.machines]);

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const mRes = await fetch(`${API_BASE_URL}/machines/`);
        const machines = mRes.ok ? await mRes.json() : [];
        const formatted = (machines || []).map(m => {
          const modelName = m.make && m.model
            ? `(${m.make}) ${m.model}`
            : (m.make || m.model || `Machine-${m.id}`);
          return { id: m.id, name: modelName, type: m.type || null };
        });
        setScheduleData(prev => ({ ...prev, machines: formatted }));
      } catch (e) { console.error(e); }
    };
    const fetchOrders = async () => {
      try {
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const uid = storedUser?.id;
        const qs = uid != null ? `?project_coordinator_id=${uid}` : '';
        const res = await fetch(`${API_BASE_URL}/orders/${qs}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(Array.isArray(data) ? data : []);
        }
      } catch (e) { console.error(e); }
    };
    fetchMachines();
    fetchOrders();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { fetchSchedule(); }, 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const fetchShiftConfigs = async () => {
      try {
        const res = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
        if (res.ok) {
          const data = await res.json();
          setShiftConfigs(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchShiftConfigs();
  }, []);

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
      fetch(`${API_BASE_URL}/orders/sale-order/${so}/parts`)
        .then(r => r.ok ? r.json() : [])
        .then(d => {
          const list = Array.isArray(d) ? d : (d.parts || []);
          setParts(list);
        })
        .catch(() => { });
    }
  };

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
  };

  return (
    <Layout className="min-h-screen bg-gray-50 p-4">
      <Content>
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
          <Button size="small" type="primary" icon={<ReloadOutlined />} style={{ background: '#1677ff' }} onClick={() => setUpdateModalOpen(true)}>Update Actual Schedule</Button>
          <Button size="small" icon={<SyncOutlined />} onClick={handleRefresh}>Refresh</Button>
        </motion.div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ padding: 12, background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#1677ff' }}>Skipped Orders:</span>
                <span style={{ color: '#666' }}>
                  {skippedData.skipped_orders.length > 0 ? skippedData.skipped_orders.join(', ') : 'No orders skipped'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#1677ff' }}>Skipped Parts:</span>
                <span style={{ color: '#666' }}>
                  {skippedData.skipped_parts.length > 0 ? skippedData.skipped_parts.join(', ') : 'No parts skipped'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: '#1677ff' }}>Parts Without Operations:</span>
                <span style={{ color: '#666' }}>
                  {skippedData.parts_without_operations.length > 0
                    ? skippedData.parts_without_operations.map(p => p.part_number).join(', ')
                    : 'No parts without operations'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              height: availableMachines.length > 24 ? '70vh' : 'auto',
              overflowY: availableMachines.length > 24 ? 'auto' : 'hidden',
              overflowX: 'hidden',
              border: '1px solid #e8e8e8',
              borderRadius: 8,
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              background: '#fff',
            }}
          >
            <SchedulingGanttTimeline
              ref={timelineRef}
              scheduledOperations={scheduleData.scheduled_operations}
              availableMachines={availableMachines}
              shiftConfigs={shiftConfigs}
              selectedMachines={selectedMachines}
              selectedComponents={selectedComponents}
              selectedProductionOrders={selectedProductionOrders}
              dateRange={dateRange}
              viewType={viewType}
            />
          </div>
        </div>

        <AnimatePresence>
          {Object.keys(componentColors).length > 0 && (
            <motion.div key="legend" {...LEGEND_MOTION} style={{ overflow: 'hidden' }}>
              <ComponentLegend
                componentColors={componentColors}
                title="Production Orders"
                active={selectedProductionOrders}
                onToggle={(po) =>
                  setSelectedProductionOrders(prev =>
                    prev.includes(po) ? prev.filter(p => p !== po) : [...prev, po]
                  )
                }
              />
            </motion.div>
          )}
        </AnimatePresence>

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

        <Modal
          title={
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <WarningOutlined style={{ color: '#faad14', fontSize: 22 }} />
              Update Actual Schedule
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
            Do you want to update the actual schedule? Please wait while we update the schedule.
          </p>
        </Modal>
      </Content>
    </Layout>
  );
};

export default ActualScheduling;
