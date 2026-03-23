import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Layout, Card, Button, Select, DatePicker, Tooltip, Tabs, message, Modal } from 'antd';
import { SyncOutlined, ReloadOutlined, LeftOutlined, RightOutlined, InfoCircleOutlined,ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined, CalendarOutlined, WarningOutlined } from '@ant-design/icons';
import { Timeline } from "vis-timeline";
import { DataSet } from "vis-data";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import moment from 'moment';
import dayjs from 'dayjs';
import { API_BASE_URL } from '../Config/auth.js';
import config from '../Config/config.js';

const { Content } = Layout;
const { Option } = Select;
const { TabPane } = Tabs;

// ─────────────────────────────────────────────────────────────
//  COLOUR HELPERS
// ─────────────────────────────────────────────────────────────
const generateDistinctColors = (count) => {
  const base = [
    '#1890ff','#13c2c2','#52c41a','#faad14','#f5222d',
    '#722ed1','#eb2f96','#fa8c16','#a0d911','#fadb14',
    '#2f54eb','#fa541c','#08979c','#389e0d','#9254de',
  ];
  const colors = [...base];
  while (colors.length < count) {
    const hue = (colors.length * 137.508) % 360;
    colors.push(`hsl(${hue},70%,50%)`);
  }
  return colors;
};

const getComponentColors = (operations) => {
  const uniqueOrders = [...new Set(operations.map(op => op.production_order))];
  const colors = generateDistinctColors(uniqueOrders.length);
  return uniqueOrders.reduce((acc, order, i) => {
    acc[order] = {
      backgroundColor: colors[i],
      borderColor: colors[i],
      hoverColor: colors[i] + '80',
    };
    return acc;
  }, {});
};

// ─────────────────────────────────────────────────────────────
//  TIME HELPERS
// ─────────────────────────────────────────────────────────────
const getTimeAxisScale = (v) => ({ year:'month', month:'day', week:'hour', day:'hour' }[v] || 'hour');
const getTimeAxisStep  = (v) => ({ year:1, month:1, week:1, day:1 }[v] || 1);

const getTimeRange = (viewType, dateRange, scheduleData) => {
  const now = moment();
  const allOps = scheduleData?.scheduled_operations || [];

  const dataMin = allOps.length
    ? moment(Math.min(...allOps.map(o => new Date(o.start_time)))).subtract(1,'month').toDate()
    : now.clone().subtract(1,'year').toDate();
  const dataMax = allOps.length
    ? moment(Math.max(...allOps.map(o => new Date(o.end_time)))).add(1,'month').toDate()
    : now.clone().add(1,'year').toDate();

  let start, end;
  if (dateRange && dateRange[0] && dateRange[1]) {
    start = moment(dateRange[0]).hour(8).minute(30).second(0).toDate();
    end   = moment(dateRange[1]).hour(17).minute(30).second(0).toDate();
  } else {
    switch (viewType) {
      case 'year':
        start = now.clone().startOf('year').toDate();
        end   = now.clone().endOf('year').toDate();
        break;
      case 'month':
        start = now.clone().startOf('month').toDate();
        end   = now.clone().endOf('month').toDate();
        break;
      case 'day':
        start = now.clone().startOf('day').hour(8).minute(30).toDate();
        end   = now.clone().endOf('day').hour(17).minute(30).toDate();
        break;
      case 'week':
      default:
        start = now.clone().startOf('isoWeek').hour(8).minute(30).toDate();
        end   = now.clone().startOf('isoWeek').add(4,'days').hour(17).minute(30).toDate();
    }
  }
  return { start, end, dataMin, dataMax };
};

// ─────────────────────────────────────────────────────────────
//  ComponentLegend
// ─────────────────────────────────────────────────────────────
const ComponentLegend = ({ componentColors, title, onToggle, active }) => (
  <div style={{ marginTop:12, padding:'10px 14px', background:'#fafafa', borderRadius:6, border:'1px solid #f0f0f0' }}>
    <div style={{ fontWeight:600, fontSize:13, marginBottom:8 }}>{title}</div>
    <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
      {Object.entries(componentColors).map(([po, c]) => (
        <span
          key={po}
          onClick={() => onToggle && onToggle(po)}
          style={{
            display:'inline-flex', alignItems:'center', gap:6,
            cursor:'pointer', fontSize:12,
            opacity: !active || active.length === 0 || active.includes(po) ? 1 : 0.35,
            transition:'opacity .2s',
          }}
        >
          <span style={{ width:13, height:13, borderRadius:3, flexShrink:0, background:c.backgroundColor, display:'inline-block' }} />
          {po}
        </span>
      ))}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────
const MachineScheduling = () => {
  const [scheduleData, setScheduleData] = useState({
    machines: [],
    scheduled_operations: [],
    component_status: {},
  });

  const [viewType,                 setViewType]                 = useState('week');
  const [dateRange,                setDateRange]                = useState(null);
  const [selectedMachines,         setSelectedMachines]         = useState([]);
  const [selectedComponents,       setSelectedComponents]       = useState([]);
  const [selectedProductionOrders, setSelectedProductionOrders] = useState([]);
  const [componentColors,          setComponentColors]          = useState({});
  const [orders,                   setOrders]                   = useState([]);
  const [parts,                    setParts]                    = useState([]);
  const [selectedProjectId,        setSelectedProjectId]        = useState(null);
  const [helpOpen,                 setHelpOpen]                 = useState(false);
  const [updateModalOpen,          setUpdateModalOpen]          = useState(false);
  const [updateScheduleLoading,    setUpdateScheduleLoading]    = useState(false);

  const timelineRef          = useRef(null);
  const timelineContainerRef = useRef(null);
  const styleElementRef      = useRef(null);

  const fetchSchedule = async () => {
    try {
      const res = await fetch(`${config.API_BASE_URL}/scheduling/gantt-data`);
      if (!res.ok) return;
      const data = await res.json();
      const ops = [];
      const gantt = Array.isArray(data?.gantt) ? data.gantt : [];
      gantt.forEach(g => {
        const machineName = [g.machine_make, g.machine_model].filter(Boolean).join(' ').trim();
        const tasks = Array.isArray(g.tasks) ? g.tasks : [];
        tasks.forEach(t => {
          if (g.machine_id != null) {
            ops.push({
              machineId: g.machine_id,
              machineName: machineName || '',
              component: t.part_number || '',
              production_order: t.sale_order_number || String(t.sale_order_id ?? t.schedule_item_id ?? ''),
              description: t.operation_name || String(t.operation_number ?? ''),
              start_time: t.planned_start_time,
              end_time: t.planned_end_time,
              quantity: t.total_quantity ?? 0,
            });
          }
        });
      });
      setScheduleData(prev => ({
        ...prev,
        scheduled_operations: ops,
      }));
    } catch (e) { console.error(e); }
  };

  const handleUpdateSchedule = async () => {
    setUpdateScheduleLoading(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}/scheduling/generate-schedule`, {
        method: 'POST',
        headers: { 'accept': 'application/json' },
      });
      if (res.ok) {
        setUpdateModalOpen(false);
        message.success('Schedule generated');
        await fetchSchedule();
      } else {
        const err = await res.text().catch(() => '');
        message.error(err || 'Failed to generate schedule');
      }
    } catch (e) {
      console.error(e);
      message.error('Update failed: ' + e.message);
    } finally {
      setUpdateScheduleLoading(false);
    }
  };

  // ── Derived lists ──────────────────────────────────────────
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

  const machineMapping = useMemo(() => {
    const map = new Map();
    availableMachines.forEach(m => {
      map.set(m.machineId, m.machineId);
    });
    return map;
  }, [availableMachines]);

  // Production order list removed with dropdown; legend uses componentColors only

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const mRes = await fetch(`${API_BASE_URL}/machines/`);
        const machines = mRes.ok ? await mRes.json() : [];
        const formatted = (machines || []).map(m => {
          const modelName = [m.make, m.model].filter(Boolean).join(' ').trim() || m.model || m.make || `Machine-${m.id}`;
          return {
            id: m.id,
            name: modelName,
            type: m.type || null,
          };
        });
        setScheduleData(prev => ({
          ...prev,
          machines: formatted,
        }));
      } catch (e) { console.error(e); }
    };
    const fetchOrders = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/orders/`);
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

  const handleProjectChange = (orderId) => {
    setSelectedProjectId(orderId);
    const order = orders.find(o => o.id === orderId);
    const so = order?.sale_order_number;
    setParts([]);
    if (!so) return;
    fetch(`${API_BASE_URL}/orders/sale-order/${so}/parts`)
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = Array.isArray(d) ? d : (d.parts || []);
        setParts(list);
      })
      .catch(() => {});
  };

  // ── INIT TIMELINE ────────────────────────────────────────────
  useEffect(() => {
    const initializeTimeline = () => {
      if (!timelineContainerRef.current) return;

      try {
        // 1. Filter operations
        let operations = scheduleData.scheduled_operations.filter(op => {
          const mc = selectedComponents.length === 0        || selectedComponents.includes(op.component);
          const mo = selectedProductionOrders.length === 0  || selectedProductionOrders.includes(op.production_order);
          const mm = selectedMachines.length === 0          || selectedMachines.includes(op.machineId);
          return mc && mo && mm;
        });

        // 2. Colors for ALL operations
        const colors = getComponentColors(scheduleData.scheduled_operations);
        setComponentColors(colors);

        // 3. Items
        const items = new DataSet(
          operations.map((op, index) => ({
            id:        index,
            group:     op.machineId,
            content:   `<div class="timeline-item" style="padding:3px 8px;height:100%;display:flex;flex-direction:column;justify-content:center;"><div style="font-weight:600;font-size:13px;line-height:1.2;">${op.production_order}</div><div style="font-size:10px;opacity:0.85;">${op.component} · ${op.description}</div></div>`,
            start:     new Date(op.start_time),
            end:       new Date(op.end_time),
            className: `order-${op.production_order.replace(/[^a-zA-Z0-9]/g, '-')}`,
            operation: op,
            style:     `background-color:${colors[op.production_order].backgroundColor};border-color:${colors[op.production_order].borderColor};color:white;border-radius:4px;`,
          }))
        );

        // 4. Groups
        const groupsArr = availableMachines
          .filter(machine => {
            const machineSelected = selectedMachines.length === 0 || selectedMachines.includes(machine.machineId);
            if (selectedComponents.length === 0 && selectedProductionOrders.length === 0) {
              return machineSelected;
            }
            const hasComp  = selectedComponents.length === 0 ||
              operations.some(op => selectedComponents.includes(op.component) && op.machineId === machine.machineId);
            const hasOrder = selectedProductionOrders.length === 0 ||
              operations.some(op => selectedProductionOrders.includes(op.production_order) && op.machineId === machine.machineId);
            return hasComp && hasOrder && machineSelected;
          })
          .map(machine => ({
            id:        machine.machineId,
            content:   `<div style="padding:4px 10px;font-size:13px;font-weight:500;white-space:nowrap;">${machine.displayName}</div>`,
            className: operations.some(op => op.machineId === machine.machineId) ? 'machine-with-ops' : 'machine-without-ops',
            order:     machine.order,
          }));

        const groups = new DataSet(groupsArr);
        const groupCount = groupsArr.length;
        const rowHeight = 40;
        const timelineHeightPx = Math.max(560, groupCount * rowHeight);

        // 5. Dynamic styles
        if (styleElementRef.current) styleElementRef.current.remove();
        const styleEl = document.createElement('style');
        styleEl.textContent = `
          .vis-custom-time { background-color:#e53935!important; width:2px!important; }
          .vis-item { border-width:1px!important; min-height:28px!important; height:28px!important; }
          .vis-item .timeline-item { height:28px!important; }
          .vis-item.vis-selected { border:2px solid rgba(0,0,0,0.35)!important; }
          .vis-label  { border-right:1px solid #e8e8e8; background:#fff; }
          .vis-group  { border-bottom:none; }
          .machine-without-ops { color:#aaa; }
          .machine-with-ops    { font-weight:500; }
          ${Object.entries(colors).map(([po, c]) => `
            .order-${po.replace(/[^a-zA-Z0-9]/g,'-')} { background-color:${c.backgroundColor}!important; border-color:${c.borderColor}!important; }
            .order-${po.replace(/[^a-zA-Z0-9]/g,'-')}:hover { background-color:${c.hoverColor}!important; }
          `).join('')}
        `;
        document.head.appendChild(styleEl);
        styleElementRef.current = styleEl;

        // 6. Options
        const timeRange = getTimeRange(viewType, dateRange, scheduleData);
        const options = {
          stack:       false,
          moveable:    true,
          zoomable:    true,
          zoomKey:     '',
          orientation: 'top',
          height:           `${timelineHeightPx}px`,
          margin: {
            item:  { horizontal:10, vertical: 4 },
            axis:  5,
          },
          start:   timeRange.start,
          end:     timeRange.end,
          zoomMin: 1000 * 60 * 30,
          zoomMax: 1000 * 60 * 60 * 24 * 365 * 2,
          editable: false,
          tooltip: {
            followMouse:    true,
            overflowMethod: 'cap',
            template: (item) => {
              const op = item.operation;
              if (!op) return '';
              return `<div style="padding:10px 14px;min-width:220px;font-size:13px;line-height:1.9;background:#fff;border-radius:6px;">
                <div><b>Production Order:</b> ${op.production_order}</div>
                <div><b>Part Number:</b> ${op.component}</div>
                <div><b>Machine:</b> ${op.machineName}</div>
                <div><b>Operation:</b> ${op.description}</div>
                <div><b>Quantity:</b> ${op.quantity}</div>
                <div><b>Start:</b> ${new Date(op.start_time).toLocaleString()}</div>
                <div><b>PDC of Operation:</b> ${new Date(op.end_time).toLocaleString()}</div>
              </div>`;
            },
          },
          timeAxis: { scale: getTimeAxisScale(viewType), step: getTimeAxisStep(viewType) },
          format: {
            minorLabels: { hour:'HH:mm', day:'D', month:'MMM' },
            majorLabels: { hour:'ddd D MMM', day:'MMMM YYYY', month:'YYYY' },
          },
          hiddenDates: [
            // Hide non-shift hours
            { start:'1970-01-01 00:00:00', end:'1970-01-01 08:30:00', repeat:'daily' },
            { start:'1970-01-01 17:30:01', end:'1970-01-01 23:59:59', repeat:'daily' },
            // Hide weekends (Saturday & Sunday)
            { start:'1970-01-03 00:00:00', end:'1970-01-05 00:00:00', repeat:'weekly' },
          ],
        };

        // 7. Destroy old, create new
        if (timelineRef.current) {
          timelineRef.current.destroy();
          timelineRef.current = null;
        }

        const tl = new Timeline(timelineContainerRef.current, items, groups, options);
        timelineRef.current = tl;
        tl.setWindow(timeRange.start, timeRange.end, { animation: false });

        try { tl.addCustomTime(new Date(), 'now'); } catch (e) { console.error(e); }

      } catch (err) {
        console.error('Timeline init error:', err);
        message.error('Timeline failed: ' + err.message);
      }
    };

    const raf = requestAnimationFrame(initializeTimeline);
    return () => {
      cancelAnimationFrame(raf);
      if (timelineRef.current) {
        try { timelineRef.current.destroy(); } catch (e) { console.error(e); }
        timelineRef.current = null;
      }
      if (styleElementRef.current) {
        try { styleElementRef.current.remove(); } catch (e) { console.error(e); }
        styleElementRef.current = null;
      }
    };
  }, [scheduleData, selectedMachines, selectedComponents, selectedProductionOrders, dateRange, viewType, availableMachines, machineMapping]);

  // ── Navigation ──────────────────────────────────────────────
  const handleTimelineNavigation = (direction) => {
    if (!timelineRef.current) return;
    const win   = timelineRef.current.getWindow();
    const start = moment(win.start);
    const end   = moment(win.end);
    const delta = direction === 'left' ? -1 : 1;
    const unit  = { day:'day', week:'week', month:'month', year:'year' }[viewType] || 'week';
    timelineRef.current.setWindow(
      start.clone().add(delta, unit).toDate(),
      end.clone().add(delta, unit).toDate(),
      { animation: true }
    );
  };

  const handleViewTypeChange = (v) => {
    setViewType(v);
    if (!dateRange) {
      const r = getTimeRange(v, null, scheduleData);
      if (timelineRef.current) timelineRef.current.setWindow(r.start, r.end, { animation: false });
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

  // ── Render ────────────────────────────────────────────────
  return (
    <Layout className="min-h-screen bg-gray-50 p-4">
      <Content>
        <Card bodyStyle={{ padding:0 }} className="overflow-hidden">
          <Tabs defaultActiveKey="machine" type="card" style={{ paddingLeft:16, paddingTop:8, marginBottom:0 }}>
            <TabPane tab="Machine Schedule" key="machine">

              {/* Controls */}
              <div style={{ padding:'8px 16px 12px', borderBottom:'1px solid #f0f0f0', display:'flex', flexWrap:'wrap', gap:8, alignItems:'center' }}>

                <Select value={viewType} onChange={handleViewTypeChange} style={{ width:110 }} size="small">
                  <Option value="day">Daily</Option>
                  <Option value="week">Weekly</Option>
                  <Option value="month">Monthly</Option>
                  <Option value="year">Yearly</Option>
                </Select>

                <Button size="small" icon={<LeftOutlined />}  onClick={() => handleTimelineNavigation('left')} />
                <Button size="small" icon={<RightOutlined />} onClick={() => handleTimelineNavigation('right')} />

                <DatePicker.RangePicker
                  size="small"
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
                  placeholder={['Start Date','End Date']}
                  style={{ width:220 }}
                />

                <Select
                  mode="multiple" placeholder="Select Machines"
                  value={selectedMachines} onChange={setSelectedMachines}
                  style={{ minWidth:190 }} allowClear size="small" maxTagCount={1}
                >
                  {availableMachines.map(m => (
                    <Option key={m.machineId} value={m.machineId}>{m.displayName}</Option>
                  ))}
                </Select>

                <Select
                  placeholder="Select Project"
                  value={selectedProjectId}
                  onChange={handleProjectChange}
                  style={{ minWidth:180 }} allowClear size="small"
                >
                  {orders.map(o => (
                    <Option key={o.id} value={o.id}>{o.sale_order_number || `Order ${o.id}`}</Option>
                  ))}
                </Select>

                <Select
                  mode="multiple" placeholder="Select Parts"
                  value={selectedComponents}
                  onChange={setSelectedComponents}
                  style={{ minWidth:160 }} allowClear size="small" maxTagCount={1}
                >
                  {parts.map(p => (
                    <Option key={p.id} value={p.part_number}>{p.part_name || p.part_number}</Option>
                  ))}
                </Select>

                

                <Button.Group size="small">
                  <Tooltip title="Zoom In">
                    <Button icon={<ZoomInOutlined />}    onClick={() => timelineRef.current?.zoomIn(0.5)} />
                  </Tooltip>
                  <Tooltip title="Zoom Out">
                    <Button icon={<ZoomOutOutlined />}   onClick={() => timelineRef.current?.zoomOut(0.5)} />
                  </Tooltip>
                  <Tooltip title="Fit All">
                    <Button icon={<FullscreenOutlined />} onClick={() => timelineRef.current?.fit()} />
                  </Tooltip>
                </Button.Group>

                <Button size="small" icon={<InfoCircleOutlined />} onClick={() => setHelpOpen(true)} />

                <Button size="small" type="primary" icon={<ReloadOutlined />} style={{ background:'#1677ff' }} onClick={() => setUpdateModalOpen(true)}>Update</Button>
                <Button size="small" icon={<SyncOutlined />} onClick={handleRefresh}>Refresh</Button>
              </div>

              {/* Timeline - scrollable when many machines */}
              <div style={{ padding:'12px 16px' }}>
                <div
                  style={{
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    border: '1px solid #e8e8e8',
                    borderRadius: 8,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    background: '#fff',
                  }}
                >
                  <div
                    ref={timelineContainerRef}
                    style={{
                      minHeight: 560,
                      background: '#fff',
                    }}
                  />
                </div>

                {Object.keys(componentColors).length > 0 && (
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
                )}
                <Modal
                  title="How to Use Timeline"
                  open={helpOpen}
                  onCancel={() => setHelpOpen(false)}
                  footer={[
                    <Button key="close" onClick={() => setHelpOpen(false)}>Close</Button>
                  ]}
                >
                  <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                    <div style={{ fontWeight:600 }}>Navigation</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <LeftOutlined /> <RightOutlined /> <span>Use arrow buttons or drag to move</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <CalendarOutlined /> <span>Use date picker to jump to dates</span>
                    </div>
                    <div style={{ fontWeight:600, marginTop:8 }}>Zooming</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <ZoomInOutlined /> <span>Click "+" to zoom in</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <ZoomOutOutlined /> <span>Click "-" to zoom out</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <FullscreenOutlined /> <span>Click "Fit" to show all</span>
                    </div>
                    <div style={{ fontWeight:600, marginTop:8 }}>Interaction</div>
                    <div>Click a task to view details</div>
                    <div style={{ background:'#f6f7fb', border:'1px solid #e5e7eb', borderRadius:6, padding:10 }}>
                      <InfoCircleOutlined style={{ marginRight:8 }} />
                      <span>Hold CTRL and use mouse wheel to zoom at cursor position</span>
                    </div>
                  </div>
                </Modal>
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
              </div>
            </TabPane>
          </Tabs>
        </Card>
      </Content>
    </Layout>
  );
};

export default MachineScheduling;
