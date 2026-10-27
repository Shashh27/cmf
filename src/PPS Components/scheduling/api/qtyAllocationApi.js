/**
 * Qty→machine allocation API (Intelligent Scheduler Phase 1).
 */
import { SCHEDULING_API_BASE_URL } from '../../../Config/schedulingconfig.js';

const UNIT_WISE_BASE = `${SCHEDULING_API_BASE_URL}/scheduling/unit-wise`;

export async function fetchActiveInhouseParts() {
  const res = await fetch(`${UNIT_WISE_BASE}/active-parts`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to load active parts');
  }
  const data = await res.json();
  return Array.isArray(data?.parts) ? data.parts : [];
}

export async function fetchQtyMachineAllocations(partId, orderId = null) {
  if (!partId) throw new Error('partId is required');
  const q = new URLSearchParams({ part_id: String(partId) });
  if (orderId) q.set('order_id', String(orderId));
  const res = await fetch(`${UNIT_WISE_BASE}/qty-machine-allocations?${q.toString()}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : 'Failed to load allocations');
  }
  return data;
}

/**
 * Replace-all bands for a part.
 * @param {number} partId
 * @param {{ order_id?: number, allocations: Array<{operation_id, unit_from, unit_to, machine_id}>, created_by?: number }} body
 */
export async function putQtyMachineAllocations(partId, body) {
  const res = await fetch(`${UNIT_WISE_BASE}/qty-machine-allocations/${partId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === 'string'
      ? detail
      : (Array.isArray(detail) ? detail.map((d) => d.msg || JSON.stringify(d)).join('; ') : null)
        || data.message
        || 'Failed to save allocations';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
