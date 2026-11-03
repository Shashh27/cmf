/**
 * Supervisor / MC production-log review.
 * Unit-wise logs use /scheduling/unit-wise/production-logs/{id}/status
 */
import { SCHEDULING_API_BASE_URL } from '../../../Config/schedulingconfig.js';

const UNIT_WISE_BASE = `${SCHEDULING_API_BASE_URL}/scheduling/unit-wise`;
const UNIT_WISE_NOTES_RE = /unit-wise units\s+(\d+)\s*-\s*(\d+)/i;

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
  if (UNIT_WISE_NOTES_RE.test(String(log.notes || ''))) return true;
  return log.unit_from != null || log.unit_to != null;
};

export const displayReviewerStatus = (log) => {
  const status = String(log?.status || '').toLowerCase();
  const operatorDone = String(log?.operator_status || '').toLowerCase() === 'completed';
  if (operatorDone && log?.user_id == null && status === 'inprogress') return 'pending';
  return status;
};

export async function fetchUnitWiseProductionLogs() {
  // Unit-wise rows live on scheduling.production_logs and are returned by
  // GET /production-logs/ (is_unit_wise, unit_from, unit_to).
  return [];
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
