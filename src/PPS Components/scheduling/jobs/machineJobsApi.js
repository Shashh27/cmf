/**
 * Operator job cards from the latest unit-wise plan.
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

export async function fetchMachineJobCards(machineId, partId = null) {
  if (!machineId) return { machine_id: null, total: 0, cards: [] };
  const q = new URLSearchParams();
  if (partId) q.set('part_id', String(partId));
  const suffix = q.toString() ? `?${q.toString()}` : '';
  const res = await fetch(`${UNIT_WISE_BASE}/machine-jobs/${machineId}${suffix}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(apiError(data, 'Failed to load machine jobs'));
  }
  return {
    machine_id: data.machine_id ?? machineId,
    total: data.total ?? (Array.isArray(data.jobs) ? data.jobs.length : 0),
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
  };
}

export async function activateUnitWiseJob(machineId, body) {
  if (!machineId) throw new Error('Machine id is required');
  const res = await fetch(`${UNIT_WISE_BASE}/machine-jobs/${machineId}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(apiError(data, 'Failed to activate unit-wise job'));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function submitUnitWiseJob(machineId, body) {
  if (!machineId) throw new Error('Machine id is required');
  const res = await fetch(`${UNIT_WISE_BASE}/machine-jobs/${machineId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(apiError(data, 'Failed to submit unit-wise production log'));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
