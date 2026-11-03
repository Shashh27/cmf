import moment from 'moment';

export const generateDistinctColors = (count, basePalette = null) => {
  const base = basePalette || [
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

/** Distinct parts across the whole Gantt: red → blue → green, then the rest. */
const PART_WITHIN_ORDER_PALETTE = [
  '#f5222d', '#1890ff', '#52c41a', '#faad14', '#722ed1',
  '#eb2f96', '#13c2c2', '#fa8c16', '#2f54eb', '#a0d911',
  '#fa541c', '#08979c', '#389e0d', '#9254de', '#fadb14',
];

const toColorEntry = (hex) => ({
  backgroundColor: hex,
  borderColor: hex,
  hoverColor: `${hex}80`,
});

export const getComponentColors = (operations) => {
  const uniqueOrders = [...new Set(
    (operations || [])
      .map(op => (op.production_order != null ? String(op.production_order) : ''))
      .filter(Boolean)
  )];
  const colors = generateDistinctColors(Math.max(uniqueOrders.length, 1));
  return uniqueOrders.reduce((acc, order, i) => {
    acc[order] = toColorEntry(colors[i]);
    return acc;
  }, {});
};

/** Stable key for a part bar under an order (unit-wise coloring). */
export const orderPartColorKey = (order, part) => `${String(order || '')}::${String(part || '')}`;

/**
 * Unit-wise: colors keyed by order::part.
 * One palette for every distinct part on the Gantt (not restarted per order),
 * so the same part stays one color on every machine, operation, and unit.
 */
export const getPartColors = (operations) => {
  const byOrder = {};
  const allParts = new Set();
  (operations || []).forEach((op) => {
    const order = op.production_order != null ? String(op.production_order) : '';
    const part = op.component != null ? String(op.component) : '';
    if (!order || !part) return;
    if (!byOrder[order]) byOrder[order] = new Set();
    byOrder[order].add(part);
    allParts.add(part);
  });

  const parts = [...allParts].sort((a, b) => a.localeCompare(b));
  const palette = generateDistinctColors(Math.max(parts.length, 1), PART_WITHIN_ORDER_PALETTE);
  const colorByPart = {};
  parts.forEach((part, i) => {
    colorByPart[part] = toColorEntry(palette[i]);
  });

  const acc = {};
  Object.keys(byOrder).forEach((order) => {
    byOrder[order].forEach((part) => {
      acc[orderPartColorKey(order, part)] = colorByPart[part];
    });
  });
  return acc;
};

export const getScheduleBarColors = (operations, colorBy = 'order') => (
  colorBy === 'part' ? getPartColors(operations) : getComponentColors(operations)
);

export const getTimeAxisScale = (v) => ({ year: 'month', month: 'day', week: 'minute', day: 'minute' }[v] || 'minute');
export const getTimeAxisStep = (v) => ({ year: 1, month: 1, week: 30, day: 30 }[v] || 30);

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Finest step whose labels still fit on the visible window. About 16 ticks
// across the axis, matching 1 min → 5 → 10 → 15 → 1 hr → 4 hr → 1 day → 2 day → week.
const ZOOM_AXIS_STEPS = [
  { ms: MINUTE_MS, scale: 'minute', step: 1 },
  { ms: 5 * MINUTE_MS, scale: 'minute', step: 5 },
  { ms: 10 * MINUTE_MS, scale: 'minute', step: 10 },
  { ms: 15 * MINUTE_MS, scale: 'minute', step: 15 },
  { ms: HOUR_MS, scale: 'hour', step: 1 },
  { ms: 4 * HOUR_MS, scale: 'hour', step: 4 },
  { ms: DAY_MS, scale: 'day', step: 1 },
  { ms: 2 * DAY_MS, scale: 'day', step: 2 },
  { ms: 7 * DAY_MS, scale: 'week', step: 1 },
];

const MAX_AXIS_TICKS = 16;

export const getTimeAxisForWindow = (start, end) => {
  const duration = Math.abs(new Date(end).getTime() - new Date(start).getTime());
  if (!Number.isFinite(duration) || duration <= 0) return ZOOM_AXIS_STEPS[4];
  for (let i = 0; i < ZOOM_AXIS_STEPS.length; i += 1) {
    if (duration / ZOOM_AXIS_STEPS[i].ms <= MAX_AXIS_TICKS) return ZOOM_AXIS_STEPS[i];
  }
  return ZOOM_AXIS_STEPS[ZOOM_AXIS_STEPS.length - 1];
};

export const ZOOM_MIN_MS = 8 * MINUTE_MS;
export const ZOOM_MAX_MS = 16 * 7 * DAY_MS;

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

export const buildTimelineLabelFormatters = (shiftConfigs) => {
  const resolver = createShiftWindowResolver(shiftConfigs);
  const cache = new Map();
  const remember = (kind, date, scale, compute) => {
    const stamp = date instanceof Date ? date.getTime() : new Date(date).getTime();
    const key = `${kind}|${scale}|${stamp}`;
    if (cache.has(key)) return cache.get(key);
    const value = compute();
    cache.set(key, value);
    return value;
  };

  return {
    minorLabels: (date, scale) => remember('minor', date, scale, () => {
      const d = moment(date);
      if (scale === 'minute') {
        const windows = resolver(d);
        if (!windows.length) return '';
        const mins = minutesOfDay(d);
        if (!shouldShowHourTick(mins, windows)) return '';
        if (isNearMinute(mins, windows[0].start)) return '';
        return d.format('HH:mm');
      }
      if (scale === 'hour') return d.format('HH:mm');
      if (scale === 'day') return d.format('D');
      if (scale === 'week') return d.format('D MMM');
      if (scale === 'month') return d.format('MMM');
      return d.format('HH:mm');
    }),
    majorLabels: (date, scale) => remember('major', date, scale, () => {
      const d = moment(date);
      if (scale === 'minute' || scale === 'hour') {
        const windows = resolver(d);
        if (!windows.length) return '';
        const mins = minutesOfDay(d);
        if (isNearMinute(mins, windows[0].start)) {
          return d.format('ddd D MMM');
        }
        return '';
      }
      if (scale === 'day') return d.format('ddd D MMM');
      if (scale === 'week') return d.format('MMMM YYYY');
      if (scale === 'month') return d.format('YYYY');
      return '';
    }),
  };
};

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

export const getHiddenDatesRange = (timeRange) => ({
  start: moment(timeRange.start).startOf('day'),
  end: moment(timeRange.end).startOf('day'),
});

export const getTimeRange = (viewType, dateRange, scheduleData) => {
  const now = moment();
  const allOps = scheduleData?.scheduled_operations || [];

  let dataMin;
  let dataMax;
  if (!allOps.length) {
    dataMin = now.clone().subtract(1, 'year').toDate();
    dataMax = now.clone().add(1, 'year').toDate();
  } else {
    let minMs = Infinity;
    let maxMs = -Infinity;
    for (let i = 0; i < allOps.length; i += 1) {
      const startMs = new Date(allOps[i].start_time).getTime();
      const endMs = new Date(allOps[i].end_time).getTime();
      if (Number.isFinite(startMs) && startMs < minMs) minMs = startMs;
      if (Number.isFinite(endMs) && endMs > maxMs) maxMs = endMs;
    }
    dataMin = moment(Number.isFinite(minMs) ? minMs : now).subtract(1, 'month').toDate();
    dataMax = moment(Number.isFinite(maxMs) ? maxMs : now).add(1, 'month').toDate();
  }

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

/**
 * Day/week/month window that actually contains bars.
 * Used when the calendar window (usually today) has none, so the chart
 * opens on the latest work instead of an empty grid.
 * Bars more than about a year from now are ignored when nearer bars exist,
 * so a far outlier does not hide the current schedule.
 */
export const getWindowContainingOperations = (operations, viewType = 'day') => {
  const points = [];
  (operations || []).forEach((op) => {
    const start = new Date(op.start_time).getTime();
    const end = new Date(op.end_time).getTime();
    if (Number.isFinite(start) && Number.isFinite(end)) points.push({ start, end });
  });
  if (!points.length) return null;

  const now = Date.now();
  const horizon = 400 * 24 * 60 * 60 * 1000;
  const near = points.filter((point) => point.end >= now - horizon && point.start <= now + horizon);
  const pool = near.length ? near : points;
  const started = pool.filter((point) => point.start <= now);
  const anchor = (started.length ? started : pool).reduce((best, point) => (
    point.end > best.end ? point : best
  ));
  const anchorDay = moment(anchor.end);

  if (viewType === 'year') {
    return {
      start: anchorDay.clone().startOf('year').toDate(),
      end: anchorDay.clone().endOf('year').toDate(),
    };
  }
  if (viewType === 'month') {
    return {
      start: anchorDay.clone().startOf('month').toDate(),
      end: anchorDay.clone().endOf('month').toDate(),
    };
  }
  if (viewType === 'week') {
    return {
      start: anchorDay.clone().startOf('isoWeek').hour(0).minute(0).toDate(),
      end: anchorDay.clone().startOf('isoWeek').add(5, 'days').hour(23).minute(59).toDate(),
    };
  }
  return {
    start: anchorDay.clone().startOf('day').toDate(),
    end: anchorDay.clone().endOf('day').toDate(),
  };
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

const UNIT_ROW_LIMIT = 80;

const hasUnitIndex = (op) => op.unit_index != null && op.unit_index !== '';

const operationGroupKey = (op) => [
  op.machineId ?? '',
  op.production_order ?? '',
  op.component ?? '',
  op.operation_number ?? '',
].join('::');

const aggregateOperations = (group) => {
  let minStart = group[0].start_time;
  let maxEnd = group[0].end_time;
  let minMs = new Date(minStart).getTime();
  let maxMs = new Date(maxEnd).getTime();
  const units = new Set();
  group.forEach((op) => {
    const startMs = new Date(op.start_time).getTime();
    const endMs = new Date(op.end_time).getTime();
    if (Number.isFinite(startMs) && startMs < minMs) {
      minMs = startMs;
      minStart = op.start_time;
    }
    if (Number.isFinite(endMs) && endMs > maxMs) {
      maxMs = endMs;
      maxEnd = op.end_time;
    }
    if (hasUnitIndex(op)) units.add(String(op.unit_index));
  });
  return {
    ...group[0],
    start_time: minStart,
    end_time: maxEnd,
    unit_index: null,
    aggregated: true,
    aggregated_count: units.size || group.length,
  };
};

const collapseOperations = (operations, shouldCollapse) => {
  const groups = new Map();
  const kept = [];
  operations.forEach((op) => {
    if (!shouldCollapse(op)) {
      kept.push(op);
      return;
    }
    const key = operationGroupKey(op);
    const bucket = groups.get(key);
    if (bucket) bucket.push(op);
    else groups.set(key, [op]);
  });
  groups.forEach((group) => {
    kept.push(group.length === 1 ? group[0] : aggregateOperations(group));
  });
  return kept;
};

export const filterOperationsToVisibleWindow = (operations, displayWindow) => {
  if (!displayWindow) return operations;
  const windowStart = new Date(displayWindow.start).getTime();
  const windowEnd = new Date(displayWindow.end).getTime();
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return operations;
  return operations.filter((op) => {
    const start = new Date(op.start_time).getTime();
    const end = new Date(op.end_time).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return start < windowEnd && end > windowStart;
  });
};

export const downsampleOperationsForView = (operations, viewTypeOrWindow) => {
  if (!operations.length) return operations;
  const spanMs = viewTypeOrWindow && viewTypeOrWindow.start != null && viewTypeOrWindow.end != null
    ? new Date(viewTypeOrWindow.end).getTime() - new Date(viewTypeOrWindow.start).getTime()
    : null;
  if (spanMs != null && Number.isFinite(spanMs)) {
    if (spanMs >= 14 * DAY_MS) return collapseOperations(operations, () => true);
    if (spanMs < 3 * DAY_MS) return operations;
  } else if (viewTypeOrWindow === 'month' || viewTypeOrWindow === 'year') {
    return collapseOperations(operations, () => true);
  } else if (viewTypeOrWindow !== 'week') {
    return operations;
  }
  const unitCounts = new Map();
  operations.forEach((op) => {
    if (!hasUnitIndex(op)) return;
    unitCounts.set(op.machineId, (unitCounts.get(op.machineId) || 0) + 1);
  });
  const denseMachines = new Set();
  unitCounts.forEach((count, machineId) => {
    if (count > UNIT_ROW_LIMIT) denseMachines.add(machineId);
  });
  if (!denseMachines.size) return operations;
  return collapseOperations(
    operations,
    (op) => denseMachines.has(op.machineId) && hasUnitIndex(op),
  );
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

export const buildTimelineStyleSheet = (colors, { classPrefix = 'order' } = {}) => `
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
  ${Object.entries(colors || {}).map(([key, c]) => {
    const safe = String(key || 'UNIT').replace(/[^a-zA-Z0-9]/g, '-');
    return `
    .${classPrefix}-${safe} { background-color:${c.backgroundColor}!important; border-color:${c.borderColor}!important; }
    .${classPrefix}-${safe}:hover { background-color:${c.hoverColor}!important; }
  `;
  }).join('')}
`;

export const buildTimelineItems = (operations, colors, shiftConfigs, { colorBy = 'order' } = {}) => {
  const resolver = createShiftWindowResolver(shiftConfigs);
  const fallbackColor = {
    backgroundColor: '#1677ff',
    borderColor: '#1677ff',
    hoverColor: '#1677ff80',
  };
  const classPrefix = colorBy === 'part' ? 'part' : 'order';
  return operations.map((op) => {
    const productionOrder = String(op.production_order || 'UNIT');
    const partKey = String(op.component || productionOrder);
    const colorKey = colorBy === 'part'
      ? orderPartColorKey(productionOrder, partKey)
      : productionOrder;
    const colorClass = `${classPrefix}-${colorKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const zeroProgressClass = isZeroProgressShiftEndBlock(op, shiftConfigs, resolver)
      ? 'zero-progress-shift-end'
      : '';
    const unitLabel = op.unit_index
      ? `U-${String(op.unit_index).padStart(3, '0')}`
      : null;
    const titleLine = op.aggregated
      ? `${op.component || op.description || 'Operation'} (${op.aggregated_count})`
      : (unitLabel || op.component || 'Unit');
    const subLine = op.aggregated
      ? `${productionOrder} · Op ${op.operation_number || ''} · ${op.aggregated_count} scheduled`
      : unitLabel
        ? `${op.component || ''} · ${productionOrder} · Op ${op.operation_number || ''}`
        : `${productionOrder} · ${op.description || ''}`;
    const stableId = op.aggregated
      ? ['agg', op.machineId, productionOrder, op.component, op.operation_number, op.start_time, op.end_time].join('::')
      : [
        op.machineId,
        productionOrder,
        op.component,
        op.operation_number,
        op.unit_index ?? '',
        op.start_time,
      ].join('::');
    const color = colors[colorKey] || fallbackColor;
    return {
      id: stableId,
      group: op.machineId,
      content: `<div class="timeline-item" style="padding:3px 8px;height:100%;display:flex;flex-direction:column;justify-content:center;"><div style="font-weight:600;font-size:13px;line-height:1.2;">${titleLine}</div><div style="font-size:10px;opacity:0.85;">${subLine}</div></div>`,
      start: new Date(op.start_time),
      end: new Date(op.end_time),
      className: [colorClass, zeroProgressClass].filter(Boolean).join(' '),
      operation: { ...op, production_order: productionOrder },
      style: `background-color:${color.backgroundColor};border-color:${color.borderColor};color:white;border-radius:4px;`,
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
    ${op.aggregated ? `<div><b>Bars combined:</b> ${op.aggregated_count}. Times are the earliest start and latest end.</div>` : ''}
    ${zeroProgressNote}
  </div>`;
  };
};

/**
 * Legend structure for unit-wise: each order → palette of its scheduled parts.
 */
export const getUnitWiseOrderPalettes = (operations, partColors = null) => {
  const colors = partColors || getPartColors(operations);
  const byOrder = {};
  (operations || []).forEach((op) => {
    const order = op.production_order != null ? String(op.production_order) : '';
    const part = op.component != null ? String(op.component) : '';
    if (!order || !part) return;
    if (!byOrder[order]) byOrder[order] = new Map();
    const key = orderPartColorKey(order, part);
    const entry = byOrder[order].get(part) || {
      part,
      part_name: op.part_name || '',
      unitIds: new Set(),
      color: colors[key] || toColorEntry('#1677ff'),
    };
    if (op.unit_index != null) entry.unitIds.add(Number(op.unit_index));
    if (op.part_name && !entry.part_name) entry.part_name = op.part_name;
    byOrder[order].set(part, entry);
  });

  return Object.keys(byOrder)
    .sort((a, b) => a.localeCompare(b))
    .map((order) => ({
      order,
      parts: [...byOrder[order].values()]
        .sort((a, b) => a.part.localeCompare(b.part))
        .map(({ part, part_name, unitIds, color }) => ({
          part,
          part_name,
          quantity: unitIds.size || 0,
          color,
        })),
    }));
};

/**
 * Map unit-wise schedule items to timeline operations format.
 */
export const mapUnitWiseItemsToOperations = (items, machines) => {
  const machineMap = new Map();
  (machines || []).forEach((m) => {
    machineMap.set(m.id, m.name || `Machine ${m.id}`);
  });
  
  return (items || []).map((item) => ({
    id: item.id,
    machineId: item.machine_id,
    machineName: machineMap.get(item.machine_id) || `Machine ${item.machine_id}`,
    production_order: item.order_number || `Order ${item.order_id}`,
    component: item.part_number || `Part ${item.part_id}`,
    part_name: item.part_name,
    operation_number: item.operation_number,
    description: item.operation_name || `Operation ${item.operation_id}`,
    start_time: item.start_time,
    end_time: item.end_time,
    quantity: item.quantity || 0,
    remaining_quantity: item.remaining_quantity || 0,
    unit_from: item.unit_from,
    unit_to: item.unit_to,
    unit_index: item.unit_index ?? item.unit_no ?? item.unit_number ?? null,
  }));
};