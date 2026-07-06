import moment from 'moment';

export const generateDistinctColors = (count) => {
  const base = [
    '#1890ff', '#13c2c2', '#52c41a', '#faad14', '#f5222d',
    '#722ed1', '#eb2f96', '#fa8c16', '#a0d911', '#fadb14',
    '#2f54eb', '#fa541c', '#08979c', '#389e0d', '#9254de',
  ];
  const colors = [...base];
  while (colors.length < count) {
    const hue = (colors.length * 137.508) % 360;
    colors.push(`hsl(${hue},70%,50%)`);
  }
  return colors;
};

export const getComponentColors = (operations) => {
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

export const getTimeAxisScale = (v) => ({ year: 'month', month: 'day', week: 'minute', day: 'minute' }[v] || 'minute');
export const getTimeAxisStep = (v) => ({ year: 1, month: 1, week: 30, day: 30 }[v] || 30);

const DEFAULT_GENERAL_TIMING = { shift_code: 'GENERAL', shift_start: '08:30:00', shift_end: '17:00:00' };

const parseTimeToMinutes = (timeVal) => {
  if (timeVal == null) return 0;
  const [h, m] = String(timeVal).split(':').map(Number);
  return h * 60 + (m || 0);
};

const minutesOfDay = (d) => d.hours() * 60 + d.minutes();

const mergeMinuteWindows = (windows) => {
  if (!windows.length) return [];
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const merged = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
};

const getShiftTimingsForDay = (shiftConfigs, dayMoment) => {
  const dateStr = dayMoment.format('YYYY-MM-DD');
  const config = shiftConfigs.find(c => moment(c.date).format('YYYY-MM-DD') === dateStr);
  if (!config) return [DEFAULT_GENERAL_TIMING];
  if (!config.working_day && (!config.shift_timings || config.shift_timings.length === 0)) {
    return null;
  }
  if (config.shift_timings?.length) return config.shift_timings;
  return [DEFAULT_GENERAL_TIMING];
};

const getDayShiftWindows = (shiftConfigs, dayMoment) => {
  const timings = getShiftTimingsForDay(shiftConfigs, dayMoment);
  if (!timings) return [];
  return mergeMinuteWindows(
    timings.map(t => ({
      start: parseTimeToMinutes(t.shift_start),
      end: parseTimeToMinutes(t.shift_end),
    }))
  );
};

const isNearMinute = (mins, target, tolerance = 15) => Math.abs(mins - target) <= tolerance;

const getCompletedQuantity = (op) => {
  const total = Number(op.quantity) || 0;
  const remaining = Number(op.remaining_quantity ?? total);
  return Math.max(0, total - remaining);
};

// Memoizes shift-window lookups by calendar day so a dataset of N operations
// against M shift configs costs O(uniqueDays) instead of O(N * M) moment
// parses. This is the single biggest win for 50-100+ order datasets, since
// isZeroProgressShiftEndBlock was previously re-parsing every shift config
// with moment(c.date).format(...) for every operation, every sync.
export const createShiftWindowResolver = (shiftConfigs) => {
  const cache = new Map();
  return (dayMoment) => {
    const key = dayMoment.format('YYYY-MM-DD');
    if (cache.has(key)) return cache.get(key);
    const windows = getDayShiftWindows(shiftConfigs, dayMoment);
    cache.set(key, windows);
    return windows;
  };
};

export const isZeroProgressShiftEndBlock = (op, shiftConfigs, resolver) => {
  const total = Number(op.quantity) || 0;
  if (total <= 0) return false;
  if (getCompletedQuantity(op) > 0) return false;

  const endMoment = moment(op.end_time);
  const windows = resolver ? resolver(endMoment) : getDayShiftWindows(shiftConfigs, endMoment);
  if (!windows.length) return false;

  const endMins = minutesOfDay(endMoment);
  return windows.some(w => isNearMinute(endMins, w.end, 2));
};

const isShiftBoundaryMinute = (mins, windows) =>
  windows.some(w => isNearMinute(mins, w.start) || isNearMinute(mins, w.end));

const shouldShowHourTick = (mins, windows) => {
  if (!windows.some(w => mins >= w.start - 15 && mins <= w.end + 15)) return false;
  if (isShiftBoundaryMinute(mins, windows)) return true;
  const nearestHour = Math.round(mins / 60) * 60;
  if (nearestHour % 60 !== 0) return false;
  return windows.some(w => nearestHour > w.start && nearestHour < w.end) && isNearMinute(mins, nearestHour);
};

export const buildTimelineLabelFormatters = (shiftConfigs) => ({
  minorLabels: (date, scale) => {
    const d = moment(date);
    if (scale === 'minute' || scale === 'hour') {
      const windows = getDayShiftWindows(shiftConfigs, d);
      if (!windows.length) return '';
      const mins = minutesOfDay(d);
      if (!shouldShowHourTick(mins, windows)) return '';
      if (isNearMinute(mins, windows[0].start)) return '';
      return d.format('HH:mm');
    }
    if (scale === 'day') return d.format('D');
    if (scale === 'month') return d.format('MMM');
    return d.format('HH:mm');
  },
  majorLabels: (date, scale) => {
    const d = moment(date);
    if (scale === 'minute' || scale === 'hour') {
      const windows = getDayShiftWindows(shiftConfigs, d);
      if (!windows.length) return '';
      const mins = minutesOfDay(d);
      if (isNearMinute(mins, windows[0].start)) {
        return d.format('ddd D MMM');
      }
      return '';
    }
    if (scale === 'day') return d.format('MMMM YYYY');
    if (scale === 'month') return d.format('YYYY');
    return '';
  },
});

const formatHiddenDate = (dayMoment, totalMinutes) =>
  dayMoment.clone().startOf('day').add(totalMinutes, 'minutes').format('YYYY-MM-DD HH:mm:ss');

export const buildShiftHiddenDates = (shiftConfigs, rangeStart, rangeEnd) => {
  const hidden = [
    { start: '1970-01-04 00:00:00', end: '1970-01-05 00:00:00', repeat: 'weekly' },
  ];

  let day = moment(rangeStart).startOf('day');
  const lastDay = moment(rangeEnd).startOf('day');
  const endOfDayMinutes = 23 * 60 + 59;

  while (day.isSameOrBefore(lastDay, 'day')) {
    const timings = getShiftTimingsForDay(shiftConfigs, day);

    if (!timings) {
      hidden.push({
        start: formatHiddenDate(day, 0),
        end: formatHiddenDate(day, endOfDayMinutes),
      });
      day.add(1, 'day');
      continue;
    }

    const windows = mergeMinuteWindows(
      timings.map(t => ({
        start: parseTimeToMinutes(t.shift_start),
        end: parseTimeToMinutes(t.shift_end),
      }))
    );

    if (!windows.length) {
      day.add(1, 'day');
      continue;
    }

    if (windows[0].start > 0) {
      hidden.push({
        start: formatHiddenDate(day, 0),
        end: formatHiddenDate(day, windows[0].start - 1),
      });
    }

    for (let i = 0; i < windows.length - 1; i++) {
      const gapStart = windows[i].end + 1;
      const gapEnd = windows[i + 1].start - 1;
      if (gapStart <= gapEnd) {
        hidden.push({
          start: formatHiddenDate(day, gapStart),
          end: formatHiddenDate(day, gapEnd),
        });
      }
    }

    const lastEnd = windows[windows.length - 1].end;
    if (lastEnd < endOfDayMinutes) {
      hidden.push({
        start: formatHiddenDate(day, lastEnd + 1),
        end: formatHiddenDate(day, endOfDayMinutes),
      });
    }

    day.add(1, 'day');
  }

  return hidden;
};

export const getHiddenDatesRange = (timeRange, operations) => {
  let start = moment(timeRange.start).startOf('day');
  let end = moment(timeRange.end).startOf('day');
  operations.forEach(op => {
    const opStart = moment(op.start_time);
    const opEnd = moment(op.end_time);
    if (opStart.isBefore(start)) start = opStart.clone().startOf('day');
    if (opEnd.isAfter(end)) end = opEnd.clone().endOf('day');
  });
  return { start, end };
};

export const getTimeRange = (viewType, dateRange, scheduleData) => {
  const now = moment();
  const allOps = scheduleData?.scheduled_operations || [];

  const dataMin = allOps.length
    ? moment(Math.min(...allOps.map(o => new Date(o.start_time)))).subtract(1, 'month').toDate()
    : now.clone().subtract(1, 'year').toDate();
  const dataMax = allOps.length
    ? moment(Math.max(...allOps.map(o => new Date(o.end_time)))).add(1, 'month').toDate()
    : now.clone().add(1, 'year').toDate();

  let start, end;
  if (dateRange && dateRange[0] && dateRange[1]) {
    start = moment(dateRange[0]).hour(0).minute(0).second(0).toDate();
    end = moment(dateRange[1]).hour(23).minute(59).second(59).toDate();
  } else {
    switch (viewType) {
      case 'year':
        start = now.clone().startOf('year').toDate();
        end = now.clone().endOf('year').toDate();
        break;
      case 'month':
        start = now.clone().startOf('month').toDate();
        end = now.clone().endOf('month').toDate();
        break;
      case 'day':
        start = now.clone().startOf('day').hour(0).minute(0).toDate();
        end = now.clone().endOf('day').hour(23).minute(59).toDate();
        break;
      case 'week':
      default:
        start = now.clone().startOf('isoWeek').hour(0).minute(0).toDate();
        end = now.clone().startOf('isoWeek').add(5, 'days').hour(23).minute(59).toDate();
    }
  }

  return { start, end, dataMin, dataMax };
};

export const getFilteredOperationsWindow = (operations) => {
  if (!operations.length) return null;
  const minStart = moment.min(operations.map(op => moment(op.start_time)));
  const maxEnd = moment.max(operations.map(op => moment(op.end_time)));
  return {
    start: minStart.clone().subtract(1, 'day').startOf('day').toDate(),
    end: maxEnd.clone().add(1, 'day').endOf('day').toDate(),
  };
};

export const filterScheduledOperations = (operations, filters) => {
  const {
    selectedComponents = [],
    selectedProductionOrders = [],
    selectedMachines = [],
  } = filters;

  return operations.filter(op => {
    const mc = selectedComponents.length === 0 || selectedComponents.includes(op.component);
    const mo = selectedProductionOrders.length === 0 || selectedProductionOrders.includes(op.production_order);
    const mm = selectedMachines.length === 0 || selectedMachines.includes(op.machineId);
    return mc && mo && mm;
  });
};

export const buildTimelineStyleSheet = (colors) => `
  .scheduling-gantt-root {
    position: relative;
    contain: layout style;
    touch-action: pan-x pan-y;
  }
  .scheduling-gantt-root .vis-timeline {
    border: none;
    transform: translateZ(0);
    backface-visibility: hidden;
  }
  .scheduling-gantt-root .vis-panel.vis-center,
  .scheduling-gantt-root .vis-panel.vis-top,
  .scheduling-gantt-root .vis-panel.vis-left {
    transform: translateZ(0);
  }
  .scheduling-gantt-root.is-interacting .vis-item {
    transition: none !important;
  }
  .scheduling-gantt-root .vis-item {
    transition: transform 0.12s ease-out, box-shadow 0.12s ease-out;
  }
  .scheduling-gantt-root .vis-current-time { background-color:#ff9800!important; width:2px!important; }
  .vis-item { border-width:1px!important; min-height:28px!important; height:28px!important; }
  .vis-item .timeline-item { height:28px!important; }
  .vis-item.vis-selected { border:2px solid rgba(0,0,0,0.35)!important; }
  .vis-label  { border-right:1px solid #e8e8e8; background:#fff; }
  .vis-group  { border-bottom:none; }
  .machine-without-ops { color:#aaa; }
  .machine-with-ops    { font-weight:500; }
  .vis-time-axis .vis-text.vis-major { white-space:nowrap; font-weight:600; }
  .vis-time-axis .vis-text.vis-minor { white-space:nowrap; }
  ${Object.entries(colors).map(([po, c]) => `
    .order-${po.replace(/[^a-zA-Z0-9]/g, '-')} { background-color:${c.backgroundColor}!important; border-color:${c.borderColor}!important; }
    .order-${po.replace(/[^a-zA-Z0-9]/g, '-')}:hover { background-color:${c.hoverColor}!important; }
  `).join('')}
`;

export const buildTimelineItems = (operations, colors, shiftConfigs) => {
  const resolver = createShiftWindowResolver(shiftConfigs);
  return operations.map((op) => {
    const orderClass = `order-${op.production_order.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const zeroProgressClass = isZeroProgressShiftEndBlock(op, shiftConfigs, resolver)
      ? 'zero-progress-shift-end'
      : '';
    const stableId = [
      op.machineId,
      op.production_order,
      op.component,
      op.operation_number,
      op.start_time,
    ].join('::');
    return {
      id: stableId,
      group: op.machineId,
      content: `<div class="timeline-item" style="padding:3px 8px;height:100%;display:flex;flex-direction:column;justify-content:center;"><div style="font-weight:600;font-size:13px;line-height:1.2;">${op.component}</div><div style="font-size:10px;opacity:0.85;">${op.production_order} · ${op.description}</div></div>`,
      start: new Date(op.start_time),
      end: new Date(op.end_time),
      className: [orderClass, zeroProgressClass].filter(Boolean).join(' '),
      operation: op,
      style: `background-color:${colors[op.production_order].backgroundColor};border-color:${colors[op.production_order].borderColor};color:white;border-radius:4px;`,
    };
  });
};

export const buildTimelineGroups = (availableMachines, operations, filters) => {
  const {
    selectedComponents = [],
    selectedProductionOrders = [],
    selectedMachines = [],
  } = filters;

  return availableMachines
    .filter(machine => {
      const machineSelected = selectedMachines.length === 0 || selectedMachines.includes(machine.machineId);
      if (selectedComponents.length === 0 && selectedProductionOrders.length === 0) {
        return machineSelected;
      }
      const hasComp = selectedComponents.length === 0 ||
        operations.some(op => selectedComponents.includes(op.component) && op.machineId === machine.machineId);
      const hasOrder = selectedProductionOrders.length === 0 ||
        operations.some(op => selectedProductionOrders.includes(op.production_order) && op.machineId === machine.machineId);
      return hasComp && hasOrder && machineSelected;
    })
    .map(machine => ({
      id: machine.machineId,
      content: `<div style="padding:4px 10px;font-size:13px;font-weight:500;white-space:nowrap;">${machine.displayName}</div>`,
      className: operations.some(op => op.machineId === machine.machineId) ? 'machine-with-ops' : 'machine-without-ops',
      order: machine.order,
    }));
};

export const buildTooltipTemplate = (shiftConfigs) => {
  const resolver = createShiftWindowResolver(shiftConfigs);
  return (item) => {
  const op = item.operation;
  if (!op) return '';
  const displayStart = moment(op.start_time);
  const displayEnd = moment(op.end_time);
  const totalQty = op.quantity || 0;
  const remainingQty = op.remaining_quantity || 0;
  const plannedQty = totalQty - remainingQty;
  const zeroProgressNote = isZeroProgressShiftEndBlock(op, shiftConfigs, resolver)
    ? '<div style="margin-top:6px;padding:6px 8px;background:#fff7e6;border:1px solid #ffd591;border-radius:4px;color:#d46b08;font-size:12px;"><b>No output this shift:</b> 0 parts completed before shift end</div>'
    : '';
  return `<div style="padding:10px 14px;min-width:220px;font-size:13px;line-height:1.9;background:#fff;border-radius:6px;">
    <div><b>Production Order:</b> ${op.production_order}</div>
    <div><b>Part Number:</b> ${op.component}</div>
    <div><b>Part Name:</b> ${op.part_name || 'N/A'}</div>
    <div><b>Machine:</b> ${op.machineName}</div>
    <div><b>Operation:</b> ${op.operation_number ? '#' + op.operation_number + ' - ' : ''}${op.description}</div>
    <div><b>Quantity:</b> ${plannedQty}/${totalQty}</div>
    <div><b>Remaining Qty:</b> ${remainingQty}</div>
    <div><b>Start:</b> ${displayStart.format('DD-MM-YYYY, HH:mm')}</div>
    <div><b>End:</b> ${displayEnd.format('DD-MM-YYYY, HH:mm')}</div>
    ${zeroProgressNote}
  </div>`;
  };
};