import dayjs from 'dayjs';

export const MAX_CUSTOM_DAYS = 60;

export function resolveCalendarRange(filterMode, selectedDate, customStartDate, customEndDate) {
  let startDate;
  let daysCount;
  let endDate = null;

  if (filterMode === 'day') {
    startDate = selectedDate.startOf('day');
    daysCount = 1;
  } else if (filterMode === 'month') {
    startDate = selectedDate.startOf('month');
    daysCount = selectedDate.daysInMonth();
  } else if (filterMode === 'year') {
    startDate = selectedDate.startOf('year');
    daysCount = startDate.endOf('year').diff(startDate, 'day') + 1;
  } else {
    if (!customStartDate || !customEndDate) {
      return {
        startDate: customStartDate ? dayjs(customStartDate).startOf('day') : dayjs().startOf('day'),
        endDate: null,
        daysCount: 0,
        days: [],
        isReady: false,
      };
    }

    startDate = dayjs(customStartDate).startOf('day');
    endDate = dayjs(customEndDate).startOf('day');
    if (endDate.isBefore(startDate, 'day')) {
      endDate = startDate;
    }

    const maxEnd = startDate.add(MAX_CUSTOM_DAYS - 1, 'day');
    const rangeCapped = endDate.isAfter(maxEnd, 'day');
    if (rangeCapped) {
      endDate = maxEnd;
    }

    daysCount = endDate.diff(startDate, 'day') + 1;
    const days = Array.from({ length: daysCount }, (_, i) => startDate.add(i, 'day'));
    return { startDate, endDate, daysCount, days, isReady: true, rangeCapped };
  }

  const days = Array.from({ length: daysCount }, (_, i) => startDate.add(i, 'day'));
  return { startDate, endDate, daysCount, days, isReady: true, rangeCapped: false };
}

/** O(ops) index — only scheduled days, no empty-cell placeholders */
export function buildMachineScheduleIndex(machines) {
  const index = new Map();

  for (const machine of machines || []) {
    for (const op of machine.parts_operations || []) {
      const schedule = op.planned_schedule;
      if (!schedule?.planned_start_time) continue;

      const dayKey = dayjs(schedule.planned_start_time).format('YYYY-MM-DD');
      const mapKey = `${machine.machine_id}|${dayKey}`;
      let bucket = index.get(mapKey);
      if (!bucket) {
        bucket = [];
        index.set(mapKey, bucket);
      }

      bucket.push({
        order: op.sale_order_number,
        part: op.part_name,
        partNumber: op.part_number,
        operation: op.operation_name,
        operationNumber: op.operation_number,
        start: dayjs(schedule.planned_start_time).format('HH:mm'),
        end: dayjs(schedule.planned_end_time).format('HH:mm'),
        duration: (
          (dayjs(schedule.planned_end_time).valueOf() - dayjs(schedule.planned_start_time).valueOf())
          / (1000 * 60 * 60)
        ).toFixed(1),
        quantity: schedule.total_quantity,
      });
    }
  }

  return index;
}

export function getEmptyDayStatus(date, now) {
  if (date.isBefore(now, 'day')) return 'not_scheduled';
  if (date.isSame(now, 'day')) return 'today_available';
  return 'available';
}

export const MONTH_HEADER_COLORS = [
  '#1890ff', 'oklch(64.8% 0.2 131.684)', '#faad14', '#f5222d', '#722ed1', '#13c2c2',
  '#eb2f96', '#fa541c', '#a0d911', '#2f54eb', '#fadb14', 'oklch(64.6% 0.222 41.116)',
];
