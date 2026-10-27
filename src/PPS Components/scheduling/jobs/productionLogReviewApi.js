/**
 * Supervisor / MC production-log review.
 * Unit-wise logs use /scheduling/unit-wise/production-logs/{id}/status
 */
import { SCHEDULING_API_BASE_URL } from '../../../Config/schedulingconfig.js';

const UNIT_WISE_BASE = `${SCHEDULING_API_BASE_URL}/scheduling/unit-wise`;

const apiError = (data, fallback) => {
  const detail = data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d?.msg || JSON.stringify(d)).join('; ');
  }
  return data?.message || fallback;
};

export const isUnitWiseProductionLog = (log) => {
  if (!log) return false;
  if (log.is_unit_wise === true || log.unit_wise === true) return true;
  const source = String(log.source || log.log_source || log.schedule_type || '').toLowerCase();
  if (source.includes('unit')) return true;
  return log.unit_from != null || log.unit_to != null;
};

export async function fetchUnitWiseProductionLogs() {
  try {
    const res = await fetch(`${UNIT_WISE_BASE}/production-logs`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    const list = Array.isArray(data)
      ? data
      : (Array.isArray(data?.logs) ? data.logs : Array.isArray(data?.items) ? data.items : []);
    return list.map((log) => ({ ...log, is_unit_wise: true }));
  } catch {
    return [];
  }
}

export async function updateProductionLogReview(log, {
  userId,
  status,
  approved_quantity = 0,
  rework_quantity = 0,
  rejected_quantity = 0,
  remarks = '',
  extraPayload = null,
} = {}) {
  if (!log?.id) throw new Error('Production log id is required');

  const unitWise = isUnitWiseProductionLog(log);
  const url = unitWise
    ? `${UNIT_WISE_BASE}/production-logs/${log.id}/status`
    : `${SCHEDULING_API_BASE_URL}/production-logs/${log.id}/status`;

  const body = unitWise
    ? {
        user_id: Number(userId) || 0,
        status,
        approved_quantity,
        rework_quantity,
        rejected_quantity,
        remarks: remarks || '',
      }
    : (extraPayload || {
        user_id: userId,
        status,
        remarks: remarks || null,
        approved_quantity,
        rework_quantity,
        rejected_quantity,
      });

  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(apiError(data, 'Failed to update production log'));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
