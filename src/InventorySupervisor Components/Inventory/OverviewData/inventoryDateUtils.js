import dayjs from 'dayjs';

/** Prevent selecting dates after today in range pickers. */
export function disableFutureDates(current) {
  return current && current > dayjs().endOf('day');
}

/** Cap range end at today; default end to today when only start is chosen. */
export function normalizeDateRange(range) {
  if (!range?.[0]) return null;
  const start = range[0].startOf('day');
  let end = (range[1] || dayjs()).endOf('day');
  const today = dayjs().endOf('day');
  if (end.isAfter(today)) end = today;
  return [start, end];
}
