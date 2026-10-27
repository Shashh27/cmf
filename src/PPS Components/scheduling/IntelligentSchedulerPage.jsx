/**
 * Intelligent Scheduler — unit-wise Gantt + Comparison Analysis.
 *
 * Replaces the old Batch/Unit and Greedy/GA toggles on Machine Scheduling.
 * Pin controls live here (formerly UNIT_WISE_PIN_PREFERRED env).
 *
 * Folder layout (for teammate handoff):
 *   scheduling/
 *     IntelligentSchedulerPage.jsx  ← this page
 *     api/unitWiseApi.js
 *     api/qtyAllocationApi.js
 *     allocations/QtyMachineAllocationPanel.jsx
 *     controls/RebuildToolbar.jsx
 *     gantt/UnitWiseGantt.jsx
 *     jobs/MachineJobList.jsx
 *     comparison/ComparisonTab.jsx
 *     index.js
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Button, Select, DatePicker, Tooltip, message, Tabs, Modal } from 'antd';
import { motion } from 'framer-motion';
import {
  SyncOutlined,
  LeftOutlined,
  RightOutlined,
  InfoCircleOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  CalendarOutlined,
} from '@ant-design/icons';
import moment from 'moment';
import dayjs from 'dayjs';

import UnitWiseGantt from './gantt/UnitWiseGantt.jsx';
import ComparisonTab from './comparison/ComparisonTab.jsx';
import RebuildToolbar from './controls/RebuildToolbar.jsx';
import QtyMachineAllocationPanel from './allocations/QtyMachineAllocationPanel.jsx';
import MachineJobList from './jobs/MachineJobList.jsx';
import {
  rebuildUnitWiseSchedule,
  fetchUnitWiseSchedule,
  fetchUnitWiseCompare,
  fetchMachines,
  fetchWorkcenters,
  fetchShiftHours,
  fetchOrders,
  fetchOrderParts,
} from './api/unitWiseApi.js';
import { mapUnitWiseItemsToOperations, getTimeRange } from '../schedulingTimelineUtils.js';
import {
  CONTROL_BAR_MOTION,
  getWindowAnimation,
} from '../schedulingTimelineMotion.js';
import useLenis from '../../hooks/useLenis.js';

const { Content } = Layout;
const { Option } = Select;

export default function IntelligentSchedulerPage() {
  const [machines, setMachines] = useState([]);
  const [workcenters, setWorkcenters] = useState([]);
  const [scheduledOperations, setScheduledOperations] = useState([]);
  const [shiftConfigs, setShiftConfigs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [parts, setParts] = useState([]);

  const [viewType, setViewType] = useState('week');
  const [viewTab, setViewTab] = useState('gantt');
  const [dateRange, setDateRange] = useState(null);
  const [selectedMachines, setSelectedMachines] = useState([]);
  const [selectedComponents, setSelectedComponents] = useState([]);
  const [selectedProductionOrders, setSelectedProductionOrders] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  // Assignment: auto | process_plan | manual (manual = greedy + saved qty bands)
  const [assignmentMode, setAssignmentMode] = useState('auto');
  const [pinPreferred, setPinPreferred] = useState(false);
  const [partFilter, setPartFilter] = useState(null);
  const [activeParts, setActiveParts] = useState([]);
  const [allocPartId, setAllocPartId] = useState(null);

  const [rebuilding, setRebuilding] = useState(false);
  const [planSource, setPlanSource] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Comparison
  const [unitCompare, setUnitCompare] = useState(null);
  const [unitComparePartId, setUnitComparePartId] = useState(null);
  const [unitCompareLoading, setUnitCompareLoading] = useState(false);
  const [unitComparePartOptions, setUnitComparePartOptions] = useState([]);
  const compareAbortRef = useRef(null);

  const [helpOpen, setHelpOpen] = useState(false);
  const timelineRef = useRef(null);

  useLenis(viewTab !== 'comparison');

  const availableMachines = useMemo(() => {
    const fromApi = (machines || [])
      .filter((m) => !(m.name || '').includes('Default'))
      .map((m, i) => ({
        id: m.id,
        machineId: m.id,
        name: m.name,
        displayName: m.name,
        order: i,
      }));
    const known = new Set(fromApi.map((m) => m.machineId));
    const extras = [];
    (scheduledOperations || []).forEach((op) => {
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
    return [...fromApi, ...extras];
  }, [machines, scheduledOperations]);

  const fetchCompare = useCallback(async (partId) => {
    if (!partId) {
      setUnitCompare(null);
      setUnitComparePartId(null);
      return;
    }
    const id = Number(partId);
    setUnitComparePartId(id);
    if (compareAbortRef.current) compareAbortRef.current.abort();
    const controller = new AbortController();
    compareAbortRef.current = controller;
    setUnitCompareLoading(true);
    try {
      const data = await fetchUnitWiseCompare(id);
      if (controller.signal.aborted) return;
      if (data?.success) setUnitCompare(data);
      else {
        setUnitCompare(null);
        message.info(data?.message || 'No compare data for this part');
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      console.error(e);
      setUnitCompare(null);
      message.error(e.message || 'Failed to load compare data');
    } finally {
      if (compareAbortRef.current === controller) setUnitCompareLoading(false);
    }
  }, []);

  const loadSchedule = useCallback(async () => {
    try {
      const data = await fetchUnitWiseSchedule({ latestOnly: true });
      const items = Array.isArray(data.items) ? data.items : [];
      setScheduledOperations(mapUnitWiseItemsToOperations(items, machines));
      setPlanSource(data.source || data.plan_source || null);

      // Seed Project dropdown from unit-wise rows if OMS/scheduling order list was empty
      setOrders((prev) => {
        if (prev.length > 0) return prev;
        const byOrder = new Map();
        items.forEach((r) => {
          if (r.order_id == null) return;
          if (byOrder.has(r.order_id)) return;
          byOrder.set(r.order_id, {
            id: r.order_id,
            sale_order_number: r.order_number || `Order ${r.order_id}`,
          });
        });
        return Array.from(byOrder.values()).sort((a, b) =>
          String(a.sale_order_number).localeCompare(String(b.sale_order_number))
        );
      });

      const byPart = new Map();
      items.forEach((r) => {
        if (r.part_id == null) return;
        const id = Number(r.part_id);
        if (byPart.has(id)) return;
        const pn = r.part_number || `Part ${id}`;
        const name = r.part_name ? `${r.part_name} (${pn})` : pn;
        byPart.set(id, { part_id: id, label: name });
      });
      const options = Array.from(byPart.values()).sort((a, b) =>
        String(a.label).localeCompare(String(b.label))
      );
      setUnitComparePartOptions(options);

      if (items.length === 0) {
        message.info('No unit-wise rows yet. Use Rebuild schedule to generate.');
        setUnitCompare(null);
        setUnitComparePartId(null);
        return;
      }

      const prefer =
        (unitComparePartId && byPart.has(Number(unitComparePartId))
          ? Number(unitComparePartId)
          : null) ??
        options[0]?.part_id ??
        null;
      await fetchCompare(prefer);
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Failed to load unit-wise schedule');
    }
  }, [machines, unitComparePartId, fetchCompare]);

  useEffect(() => {
    (async () => {
      try {
        const [mList, shifts, orderList] = await Promise.all([
          fetchMachines().catch(() => []),
          fetchShiftHours().catch(() => []),
          fetchOrders().catch(() => []),
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
        setMachines(formatted);
        setWorkcenters(await fetchWorkcenters(mList).catch(() => []));
        setShiftConfigs(shifts);
        setOrders(Array.isArray(orderList) ? orderList : []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const parts = await fetchActiveInhouseParts();
        const formatted = parts.map((p) => ({
          part_id: p.part_id,
          label: p.part_name ? `${p.part_name} (${p.part_number})` : p.part_number,
        }));
        setActiveParts(formatted);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    // Always load unit-wise rows (do not wait on machines — ops can seed Gantt rows)
    const id = setTimeout(() => {
      loadSchedule();
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machines.length]);

  const handleRebuild = async () => {
    confettiShownRef.current = true; // Don't show confetti on manual rebuilds
    setRebuilding(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const data = await rebuildUnitWiseSchedule({
        optimizer: 'greedy',
        assignmentMode,
        pinPreferred: assignmentMode === 'process_plan',
        preferredMachineId: null,
        preferredWorkcenterId: null,
        partId: assignmentMode === 'manual' && allocPartId ? allocPartId : partFilter,
      });
      const src = data.source || data.selected || 'greedy';
      setPlanSource(src);
      const ga = data.ga || {};
      const usedGa = src === 'nsga2' || src === 'ga' || src === 'ga_research';
      const improved = Boolean(data.improved ?? ga.improved);
      let msg = data.message || 'Unit-wise schedule rebuilt';
      if (ga.timed_out) {
        msg = `NSGA-II hit the time budget — kept ${src === 'nsga2' ? 'best GA plan' : 'greedy'}`;
        message.warning(msg);
      } else if (usedGa && improved) {
        const gMs = ga.greedy_objectives?.makespan_hours;
        const bMs = ga.selected_objectives?.makespan_hours ?? data.makespan_hours;
        msg = `NSGA-II improved makespan (${gMs ?? '—'}h → ${bMs ?? '—'}h) · source ${src}`;
        message.success(msg);
      } else {
        message.success(msg);
      }
      const modeLabel =
        assignmentMode === 'manual'
          ? 'manual qty→machine'
          : partFilter
            ? `${assignmentMode === 'process_plan' ? 'process plan' : 'auto'} (single part)`
            : assignmentMode === 'process_plan'
              ? 'process plan adherence'
              : 'WC earliest-free / auto qty split';
      setStatusMessage(`${msg} · ${modeLabel}`);
      await loadSchedule();
    } catch (e) {
      console.error(e);
      const msg = e.message || 'Rebuild failed';
      setErrorMessage(msg);
      message.error(msg);
    } finally {
      setRebuilding(false);
    }
  };

  const handleProjectChange = async (orderId) => {
    setSelectedProjectId(orderId);
    setParts([]);
    setSelectedComponents([]);
    if (!orderId) {
      setSelectedProductionOrders([]);
      return;
    }
    const order = orders.find((o) => o.id === orderId);
    const so = order?.sale_order_number;
    if (so) setSelectedProductionOrders([so]);
    else setSelectedProductionOrders([]);

    try {
      const list = await fetchOrderParts(orderId);
      if (list.length > 0) {
        setParts(list);
        return;
      }
      // Fallback: parts present in the loaded unit-wise Gantt for this order
      const fromOps = [];
      const seen = new Set();
      (scheduledOperations || []).forEach((op) => {
        if (so && op.production_order !== so) return;
        const key = op.component;
        if (!key || seen.has(key)) return;
        seen.add(key);
        fromOps.push({
          id: key,
          part_number: key,
          part_name: op.part_name || key,
        });
      });
      setParts(fromOps);
    } catch {
      setParts([]);
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
      { animation: getWindowAnimation(scheduledOperations.length) }
    );
  };

  const handleViewTypeChange = (v) => {
    setViewType(v);
    if (!dateRange) {
      const r = getTimeRange(v, null, { scheduled_operations: scheduledOperations });
      if (timelineRef.current) {
        timelineRef.current.setWindow(r.start, r.end, {
          animation: getWindowAnimation(scheduledOperations.length),
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
    loadSchedule();
    message.success('Filters cleared – data refreshed');
  };

  return (
    <Layout
      className="min-h-screen bg-gray-50 p-4"
      style={
        viewTab === 'comparison'
          ? { height: '100vh', maxHeight: '100vh', overflow: 'hidden' }
          : undefined
      }
    >
      <Content className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 m-0">Intelligent Scheduler</h1>
            <p className="text-sm text-slate-500 m-0">
              Unit-wise plan (test bed). Does not change batch Machine Scheduling.
              {planSource ? ` · last source: ${planSource}` : ''}
            </p>
          </div>
        </div>

        <RebuildToolbar
          rebuilding={rebuilding}
          onRebuild={handleRebuild}
          statusMessage={statusMessage}
          errorMessage={errorMessage}
          assignmentMode={assignmentMode}
          onAssignmentModeChange={setAssignmentMode}
          pinPreferred={pinPreferred}
          onPinPreferredChange={setPinPreferred}
          partFilter={partFilter}
          onPartFilterChange={setPartFilter}
          parts={activeParts}
        />

        {assignmentMode === 'manual' && (
          <QtyMachineAllocationPanel
            selectedPartId={allocPartId}
            onPartChange={setAllocPartId}
            visible
          />
        )}

        <motion.div
          {...CONTROL_BAR_MOTION}
          style={{
            padding: 12,
            background: '#fff',
            borderRadius: 8,
            border: '1px solid #f0f0f0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center',
          }}
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
              setDateRange(
                vals
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
            filterOption={(input, option) =>
              (option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedMachines}
            onChange={setSelectedMachines}
            style={{ minWidth: 210 }}
            allowClear
            size="small"
            maxTagCount={1}
          >
            {availableMachines.map((m) => (
              <Option key={m.machineId} value={m.machineId} label={m.displayName}>
                {m.displayName}
              </Option>
            ))}
          </Select>

          <Select
            placeholder="Select Project"
            showSearch
            filterOption={(input, option) =>
              (option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedProjectId}
            onChange={handleProjectChange}
            style={{ minWidth: 180 }}
            allowClear
            size="small"
          >
            {orders.map((o) => {
              const label = o.sale_order_number || `Order ${o.id}`;
              return (
                <Option key={o.id} value={o.id} label={label}>
                  {label}
                </Option>
              );
            })}
          </Select>

          <Select
            mode="multiple"
            placeholder="Select Parts"
            showSearch
            filterOption={(input, option) =>
              (option?.label || '').toLowerCase().includes(input.toLowerCase())
            }
            value={selectedComponents}
            onChange={setSelectedComponents}
            style={{ minWidth: 260 }}
            allowClear
            size="small"
            maxTagCount={1}
          >
            {parts.map((p) => (
              <Option
                key={p.id}
                value={p.part_number}
                label={`${p.part_name || ''} (${p.part_number})`}
              >
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
          <Button size="small" icon={<SyncOutlined />} onClick={handleRefresh}>
            Refresh
          </Button>
        </motion.div>

        <Tabs
          activeKey={viewTab}
          onChange={(key) => {
            setViewTab(key);
            if (key === 'comparison') {
              const pid = unitComparePartId || unitComparePartOptions[0]?.part_id;
              if (pid && !unitCompare) fetchCompare(pid);
            }
          }}
          size="small"
          destroyInactiveTabPane={false}
          items={[
            {
              key: 'gantt',
              label: 'Gantt',
              children: (
                <UnitWiseGantt
                  timelineRef={timelineRef}
                  scheduledOperations={scheduledOperations}
                  availableMachines={availableMachines}
                  shiftConfigs={shiftConfigs}
                  selectedMachines={selectedMachines}
                  selectedComponents={selectedComponents}
                  selectedProductionOrders={selectedProductionOrders}
                  dateRange={dateRange}
                  viewType={viewType}
                  onToggleOrder={(po) =>
                    setSelectedProductionOrders((prev) =>
                      prev.includes(po) ? prev.filter((p) => p !== po) : [...prev, po]
                    )
                  }
                  onTogglePart={(part) =>
                    setSelectedComponents((prev) =>
                      prev.includes(part) ? prev.filter((p) => p !== part) : [...prev, part]
                    )
                  }
                />
              ),
            },
            {
              key: 'jobs',
              label: 'Job cards',
              children: <MachineJobList machines={machines} />,
            },
            {
              key: 'comparison',
              label: 'Comparison Analysis',
              children: (
                <ComparisonTab
                  compare={unitCompare}
                  compareLoading={unitCompareLoading}
                  partOptions={unitComparePartOptions}
                  selectedPartId={unitComparePartId}
                  onPartChange={(pid) => fetchCompare(pid)}
                  onRefresh={() =>
                    fetchCompare(unitComparePartId || unitComparePartOptions[0]?.part_id)
                  }
                />
              ),
            },
          ]}
        />

        <Modal
          title="How to Use Timeline"
          open={helpOpen}
          onCancel={() => setHelpOpen(false)}
          footer={[
            <Button key="close" onClick={() => setHelpOpen(false)}>
              Close
            </Button>,
          ]}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontWeight: 600 }}>Navigation</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <LeftOutlined /> <RightOutlined /> <span>Use arrow buttons or drag to move</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CalendarOutlined /> <span>Use date picker to jump to dates</span>
            </div>
            <div style={{ fontWeight: 600, marginTop: 8 }}>Rebuild</div>
            <div>
              Choose assignment mode: Auto (WC earliest-free), Pin one machine, or Manual qty
              split (saved bands per operation). Manual rebuild is greedy only and does not
              change job cards or batch scheduling.
            </div>
          </div>
        </Modal>
      </Content>
    </Layout>
  );
}
