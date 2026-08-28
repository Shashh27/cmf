import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { API_BASE_URL } from '../Config/auth';
import { authFetch } from '../api/client.js';

dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

export const PM_API = `${API_BASE_URL}/pm`;

export const PM_T = {
  bg: '#FDFBF7',
  surface: '#FFFFFF',
  border: '#D1D5DB',
  primary: '#4A6CF7',
  primaryBg: '#EEF2FF',
  success: '#22C55E',
  warning: '#F59E0B',
  text: '#111827',
  textMid: '#374151',
  textSub: '#6B7280',
  textMuted: '#9CA3AF',
  shadow: '0 1px 4px rgba(0,0,0,0.07), 0 4px 16px rgba(0,0,0,0.05)',
};

/** Square sharp-edge buttons (existing app style) */
export const btnSharp = { borderRadius: 0 };

export const nativeSelectStyle = {
  width: '100%',
  height: '28px',
  borderRadius: 0,
  border: '1px solid #d9d9d9',
  padding: '0 4px',
  fontSize: '10px',
};

export const ITEM_TYPES = [
  { value: 'Boolean', label: 'Yes / No' },
  { value: 'Numeric', label: 'Numeric' },
  { value: 'Text', label: 'Text' },
];

export const FREQUENCY_TYPES = [
  { value: 'Time Based', label: 'Time Based' },
  { value: 'Usage Based', label: 'Usage Based' },
  { value: 'Condition Based', label: 'Condition Based' },
];

export const INTERVAL_UNITS = ['Day', 'Week', 'Month', 'Year'];

export const PM_FIELD_LIMITS = {
  checklistName: 50,
  description: 50,
  checkpointCode: 32,
  checkpointText: 50,
  expectedValue: 50,
  remarks: 100,
  intervalMax: 9999,
  triggerHoursMax: 99999,
};

const MAX_MSG = 'Maximum character limit exceeded';

export const checklistNameRules = [
  { required: true, whitespace: true, message: 'Checklist name is required' },
  { max: PM_FIELD_LIMITS.checklistName, message: MAX_MSG },
];

export const descriptionRules = [
  { max: PM_FIELD_LIMITS.description, message: MAX_MSG },
  {
    validator: (_, value) => {
      if (value && !String(value).trim()) return Promise.reject(new Error('Description cannot be only spaces'));
      return Promise.resolve();
    },
  },
];

export const checkpointTextRules = [
  { required: true, whitespace: true, message: 'Checkpoint text is required' },
  { max: PM_FIELD_LIMITS.checkpointText, message: MAX_MSG },
];

export const checkpointCodeRules = [
  { required: true, whitespace: true, message: 'Checkpoint code is required' },
  { max: PM_FIELD_LIMITS.checkpointCode, message: MAX_MSG },
];

export const expectedValueRules = [
  { max: PM_FIELD_LIMITS.expectedValue, message: MAX_MSG },
  {
    validator: (_, value) => {
      if (value && !String(value).trim()) return Promise.reject(new Error('Expected value cannot be only spaces'));
      return Promise.resolve();
    },
  },
];

export const remarksRules = [
  { max: PM_FIELD_LIMITS.remarks, message: MAX_MSG },
  {
    validator: (_, value) => {
      if (value && !String(value).trim()) return Promise.reject(new Error('Remarks cannot be only spaces'));
      return Promise.resolve();
    },
  },
];

export function clampInt(value, min = 1, max = PM_FIELD_LIMITS.intervalMax) {
  if (value === '' || value === null || value === undefined) return null;
  const n = parseInt(String(value), 10);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}

export function clampText(value, maxLen) {
  if (value == null) return '';
  return String(value).slice(0, maxLen);
}

export const STATUS_COLORS = {
  Submitted: 'processing',
  Approved: 'success',
  Rejected: 'error',
};

export const FREQ_TAG_COLORS = {
  'Time Based': 'blue',
  'Usage Based': 'orange',
  'Condition Based': 'purple',
};

export function getCurrentUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return user.id || user.user_id || 1;
  } catch {
    return 1;
  }
}

/** Display name for acknowledgements (falls back to id). */
export function getCurrentUserLabel() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return (
      user.user_name
      || user.name
      || user.username
      || (user.id != null ? `User ${user.id}` : null)
      || (user.user_id != null ? `User ${user.user_id}` : null)
      || 'user'
    );
  } catch {
    return 'user';
  }
}

export function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Returns true if isoDate falls within dayjs range [start, end] (inclusive). */
export function isDateInRange(isoDate, range) {
  if (!range?.[0] || !range?.[1] || !isoDate) return true;
  const d = dayjs(isoDate);
  return d.isSameOrAfter(range[0].startOf('day')) && d.isSameOrBefore(range[1].endOf('day'));
}

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

export function itemTypeShort(type) {
  if (type === 'Boolean') return 'Yes/No';
  if (type === 'Numeric') return 'Num';
  if (type === 'Text') return 'Text';
  return type;
}

export const itemTypeLabel = itemTypeShort;

export function frequencySummary(item) {
  if (!item?.frequency_type) return '-';
  if (item.frequency_type === 'Usage Based') {
    return `${item.frequency_type} · ${item.trigger_hours ?? '-'} hrs`;
  }
  if (item.interval_value && item.interval_unit) {
    return `${item.frequency_type} · every ${item.interval_value} ${item.interval_unit}${item.interval_value > 1 ? 's' : ''}`;
  }
  return item.frequency_type;
}

export async function pmFetch(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = isFormData
    ? { ...options.headers }
    : { 'Content-Type': 'application/json', ...options.headers };
  const res = await authFetch(`${PM_API}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let detail = 'Request failed';
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = res.statusText;
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function fetchChecklistDetails(id) {
  return pmFetch(`/checklists/${id}`);
}

export async function fetchAllChecklistsWithItems() {
  // GET /checklists now returns items inline — no per-id N+1
  const list = await pmFetch('/checklists');
  return Array.isArray(list) ? list : [];
}

export function buildCheckpointPayload(item, index) {
  return {
    item_code: String(item.item_code || '').trim().toUpperCase(),
    item_text: item.item_text,
    sequence_number: index + 1,
    item_type: item.item_type,
    expected_value: item.expected_value || null,
    remarks: item.remarks || null,
  };
}

export function emptyCheckpoint(seq = 1) {
  return {
    id: `tmp-${Date.now()}-${Math.random()}`,
    item_code: '',
    item_text: '',
    sequence_number: seq,
    item_type: 'Boolean',
    expected_value: '',
    remarks: '',
  };
}

export function validateCheckpoint(item) {
  const code = String(item.item_code || '').trim();
  if (!code) return 'Checkpoint code is required';
  if (code.length > PM_FIELD_LIMITS.checkpointCode) {
    return `Checkpoint code must be at most ${PM_FIELD_LIMITS.checkpointCode} characters`;
  }
  if (!item.item_text?.trim()) return 'Checkpoint text is required';
  if (item.item_text.trim().length > PM_FIELD_LIMITS.checkpointText) {
    return 'Maximum character limit exceeded';
  }
  if (!item.item_type) return 'Checkpoint type is required';
  if (item.expected_value && String(item.expected_value).length > PM_FIELD_LIMITS.expectedValue) {
    return `Expected value must be at most ${PM_FIELD_LIMITS.expectedValue} characters`;
  }
  if (item.item_type === 'Numeric' && item.expected_value && Number.isNaN(Number(item.expected_value))) {
    return 'Expected value must be a valid number for numeric checkpoints';
  }
  if (item.remarks && String(item.remarks).length > PM_FIELD_LIMITS.remarks) {
    return `Remarks must be at most ${PM_FIELD_LIMITS.remarks} characters`;
  }
  return null;
}

export function validateAssignFrequency(item) {
  if (!item.frequency_type) return 'Frequency is required for selected checkpoints';
  if (item.frequency_type === 'Time Based') {
    if (!item.interval_value || !item.interval_unit) {
      return 'Interval value and unit are required for time-based frequency';
    }
  }
  if (item.frequency_type === 'Condition Based') {
    const hasValue = item.interval_value != null && item.interval_value !== '';
    const hasUnit = !!item.interval_unit;
    if (hasValue !== hasUnit) {
      return 'Provide both interval value and unit, or leave both empty for condition-based';
    }
  }
  if (item.frequency_type === 'Usage Based' && !item.trigger_hours) {
    return 'Trigger hours are required for usage-based frequency';
  }
  if (item.interval_value != null && (item.interval_value < 1 || item.interval_value > PM_FIELD_LIMITS.intervalMax)) {
    return `Interval value must be between 1 and ${PM_FIELD_LIMITS.intervalMax}`;
  }
  if (item.trigger_hours != null && (item.trigger_hours < 1 || item.trigger_hours > PM_FIELD_LIMITS.triggerHoursMax)) {
    return `Trigger hours must be between 1 and ${PM_FIELD_LIMITS.triggerHoursMax}`;
  }
  return null;
}

export function machineLabel(machine) {
  if (!machine) return '-';
  if (machine.make && machine.model) return `${machine.make} - ${machine.model}`;
  return machine.make || machine.type || `Machine ${machine.id}`;
}

export function isPositiveResponse(responseValue, expectedValue = 'yes') {
  const val = String(responseValue ?? '').toLowerCase().trim();
  const expected = String(expectedValue ?? 'yes').toLowerCase().trim();
  const truthy = new Set(['true', 'yes', 'y', '1', 'on', 'ok', 'pass', 'passed', 'accept', 'accepted']);
  const falsy = new Set([
    'false', 'no', 'n', '0', 'off', 'reject', 'rejected', 'fail', 'failed', 'wrong',
    'non-conforming', 'non conforming', 'nonconforming',
  ]);
  if (falsy.has(val)) {
    if (falsy.has(expected)) return true;
    return false;
  }
  if (truthy.has(val) && truthy.has(expected)) return true;
  if (truthy.has(val) && falsy.has(expected)) return false;
  return val === expected;
}

/** True when operator response fails / mismatches expected. */
export function isRejectedResponse(responseValue, expectedValue = 'yes') {
  const val = String(responseValue ?? '').toLowerCase().trim();
  if (!val) return false;
  const rejectWords = new Set([
    'reject', 'rejected', 'fail', 'failed', 'wrong', 'no', 'n', 'false', '0', 'off',
    'non-conforming', 'non conforming', 'nonconforming',
  ]);
  if (rejectWords.has(val)) return true;
  return !isPositiveResponse(responseValue, expectedValue);
}

/** Shift end for PM submission deadline (5 PM local). */
export const PM_SHIFT_END_HOUR = 17;

/** Past day, or today at/after 5 PM → miss deadline reached. */
export function isPastSubmissionDeadline(ymd, now = new Date()) {
  if (!ymd) return false;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (ymd < today) return true;
  if (ymd > today) return false;
  return now.getHours() >= PM_SHIFT_END_HOUR;
}

const ymdFromAny = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  return null;
};

/** Map GET /pm/machine-availability → { [machineId]: record } */
export function indexMachineAvailability(list) {
  const map = {};
  (Array.isArray(list) ? list : []).forEach((r) => {
    if (r?.machine_id != null) map[r.machine_id] = r;
  });
  return map;
}

/**
 * OFF (status 2) days in available_from..available_to are breakdown — not missed.
 * Extending available_to expands the window.
 */
export function isMachineBreakdownOnDay(availabilityById, machineId, ymd, todayYmd) {
  if (machineId == null || !ymd) return false;
  const rec = availabilityById?.[machineId];
  if (!rec?.is_breakdown) return false;
  const from = ymdFromAny(rec.available_from);
  const to = ymdFromAny(rec.available_to);
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  if (!to && todayYmd && ymd > todayYmd) return false;
  return true;
}

export function resolveAssignmentItemFrequency(ai) {
  const ci = ai?.checklist_item;
  if (ai?.frequency_type) {
    return {
      frequency_type: ai.frequency_type,
      interval_value: ai.interval_value,
      interval_unit: ai.interval_unit,
      trigger_hours: ai.trigger_hours,
    };
  }
  return ci || null;
}

/** Condition-based checkpoint with no interval — optional, not scheduled per day. */
export function isConditionOnDemand(freq) {
  return (
    freq?.frequency_type === 'Condition Based'
    && (freq.interval_value == null || freq.interval_value === '' || !freq.interval_unit)
  );
}

export function isTimeDaily(freq) {
  return (
    freq?.frequency_type === 'Time Based'
    && freq.interval_value === 1
    && freq.interval_unit === 'Day'
  );
}

/** First calendar due date for recurring (non-daily) checkpoints from assignment day. */
export function getRecurrenceAnchor(freq, assignedDay) {
  if (!freq || !assignedDay) return assignedDay;
  if (isTimeDaily(freq)) return assignedDay;
  if (freq.frequency_type !== 'Time Based') return assignedDay;

  const iv = freq.interval_value || 1;
  const iu = freq.interval_unit;
  if (iu === 'Week') return dayjs(assignedDay).add(iv, 'week').format('YYYY-MM-DD');
  if (iu === 'Month') return dayjs(assignedDay).add(iv, 'month').format('YYYY-MM-DD');
  if (iu === 'Year') return dayjs(assignedDay).add(iv, 'year').format('YYYY-MM-DD');
  return assignedDay;
}

/** Whether a recurring checkpoint falls on dateKey, anchored from assignment day. */
export function isScheduledDueOnDate(freq, anchorDateKey, dateKey) {
  if (!freq || !anchorDateKey || !dateKey) return false;
  if (isTimeDaily(freq) || isConditionOnDemand(freq)) return false;

  const due = dayjs(anchorDateKey);
  const target = dayjs(dateKey);
  if (target.isBefore(due, 'day')) return false;

  if (freq.frequency_type === 'Usage Based') {
    return target.isSame(due, 'day');
  }

  const iv = freq.interval_value || 1;
  const iu = freq.interval_unit || 'Day';

  if (iu === 'Day') {
    const days = target.diff(due, 'day');
    return days >= 0 && days % iv === 0;
  }
  if (iu === 'Week') {
    if (target.day() !== due.day()) return false;
    const weeks = target.diff(due.startOf('week'), 'week');
    const dueWeeks = due.diff(due.startOf('week'), 'week');
    return weeks >= dueWeeks && (weeks - dueWeeks) % iv === 0;
  }
  if (iu === 'Month') {
    if (target.date() !== due.date()) return false;
    const months = target.diff(due, 'month');
    return months >= 0 && months % iv === 0;
  }
  if (iu === 'Year') {
    if (target.month() !== due.month() || target.date() !== due.date()) return false;
    const years = target.diff(due, 'year');
    return years >= 0 && years % iv === 0;
  }
  return target.isSame(due, 'day');
}

/** True when this assignment item is required on the given calendar day. */
export function isAssignmentItemDueOnDate(ai, assignment, dateKey) {
  if (!ai || !assignment || !dateKey) return false;
  if (ai.is_required === false) return false;

  const assignedDay = dayjs(assignment.assigned_at).format('YYYY-MM-DD');
  if (dateKey < assignedDay) return false;

  const freq = resolveAssignmentItemFrequency(ai);
  if (!freq?.frequency_type) return false;
  if (isConditionOnDemand(freq)) return false;
  if (isTimeDaily(freq)) return true;

  const anchor = getRecurrenceAnchor(freq, assignedDay);
  return isScheduledDueOnDate(freq, anchor, dateKey);
}

export function countDueAssignmentItemsForMachineOnDate(assignments, machineId, dateKey) {
  let count = 0;
  (assignments || []).forEach((assignment) => {
    if (assignment.machine_id !== machineId) return;
    (assignment.assignment_items || []).forEach((ai) => {
      if (isAssignmentItemDueOnDate(ai, assignment, dateKey)) count += 1;
    });
  });
  return count;
}

/** Day cell tone: compare submissions to checkpoints due that day (not total assigned). */
export function resolveDayTone(submittedCount, rejectedCount, expectedCount) {
  if (!expectedCount) return null;
  if (!submittedCount) return null;
  const incomplete = submittedCount < expectedCount;
  if (incomplete || rejectedCount > 0) return 'orange';
  return 'green';
}
