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
  const list = await pmFetch('/checklists');
  const detailed = await Promise.all(list.map((c) => fetchChecklistDetails(c.id)));
  return detailed;
}

export function buildCheckpointPayload(item, index) {
  return {
    item_text: item.item_text,
    sequence_number: index + 1,
    item_type: item.item_type,
    expected_value: item.expected_value || null,
    frequency_type: item.frequency_type,
    interval_value: item.interval_value ? Number(item.interval_value) : null,
    interval_unit: item.interval_unit || null,
    trigger_hours: item.trigger_hours ? Number(item.trigger_hours) : null,
    remarks: item.remarks || null,
  };
}

export function emptyCheckpoint(seq = 1) {
  return {
    id: `tmp-${Date.now()}-${Math.random()}`,
    item_text: '',
    sequence_number: seq,
    item_type: 'Boolean',
    expected_value: '',
    frequency_type: 'Time Based',
    interval_value: 1,
    interval_unit: 'Week',
    trigger_hours: null,
    remarks: '',
  };
}

export function validateCheckpoint(item) {
  if (!item.item_text?.trim()) return 'Checkpoint text is required';
  if (item.item_text.trim().length > PM_FIELD_LIMITS.checkpointText) {
    return 'Maximum character limit exceeded';
  }
  if (!item.item_type) return 'Checkpoint type is required';
  if (!item.frequency_type) return 'Frequency type is required';
  if (item.expected_value && String(item.expected_value).length > PM_FIELD_LIMITS.expectedValue) {
    return `Expected value must be at most ${PM_FIELD_LIMITS.expectedValue} characters`;
  }
  if (item.item_type === 'Numeric' && item.expected_value && Number.isNaN(Number(item.expected_value))) {
    return 'Expected value must be a valid number for numeric checkpoints';
  }
  if (item.remarks && String(item.remarks).length > PM_FIELD_LIMITS.remarks) {
    return `Remarks must be at most ${PM_FIELD_LIMITS.remarks} characters`;
  }
  if (item.frequency_type === 'Time Based') {
    if (!item.interval_value || !item.interval_unit) {
      return 'Interval value and unit are required for time-based checkpoints';
    }
  }
  if (item.frequency_type === 'Condition Based') {
    const hasValue = item.interval_value != null && item.interval_value !== '';
    const hasUnit = !!item.interval_unit;
    if (hasValue !== hasUnit) {
      return 'Provide both interval value and unit, or leave both empty for condition-based checkpoints';
    }
  }
  if (item.frequency_type === 'Usage Based' && !item.trigger_hours) {
    return 'Trigger hours are required for usage-based checkpoints';
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
