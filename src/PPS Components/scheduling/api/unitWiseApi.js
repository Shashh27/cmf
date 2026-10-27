/**
 * Unit-wise / Intelligent Scheduler API helpers.
 *
 * Scheduling host (gantt, unit-wise, machines): Config/schedulingconfig.js
 *   → http://172.18.7.85:8989/api/v1
 *
 * OMS / Configuration host (orders, legacy workcenters): Config/config.js + auth.js
 *   → http://172.18.7.89:8000/api/v1
 *   Note: that host may be down; machines + WC for this page come from the scheduling API.
 */
import { SCHEDULING_API_BASE_URL } from '../../../Config/schedulingconfig.js';
import { API_BASE_URL } from '../../../Config/auth.js';

const UNIT_WISE_BASE = `${SCHEDULING_API_BASE_URL}/scheduling/unit-wise`;

/**
 * @param {object} opts
 * @param {number} [opts.partId]
 * @param {number} [opts.orderId]
 * @param {'greedy'|'ga'|'nsga2'} [opts.optimizer]
 * @param {'auto'|'process_plan'|'manual'} [opts.assignmentMode]
 * @param {boolean} [opts.pinPreferred] — true = batch all qty on preferred machine
 * @param {number} [opts.preferredMachineId]
 * @param {number} [opts.preferredWorkcenterId]
 * @param {boolean} [opts.quick]
 */
export async function rebuildUnitWiseSchedule(opts = {}) {
  const mode = (opts.assignmentMode || '').toLowerCase() || null;
  const pinPreferred =
    mode === 'process_plan' ? true : mode === 'auto' || mode === 'manual' ? false : (opts.pinPreferred ?? false);

  const body = {
    optimizer:
      mode === 'manual'
        ? 'greedy'
        : opts.optimizer === 'ga' || opts.optimizer === 'nsga2'
          ? 'nsga2'
          : 'greedy',
    quick: opts.optimizer === 'ga' ? true : undefined,
    part_id: opts.partId ?? undefined,
    order_id: opts.orderId ?? undefined,
    assignment_mode: mode || undefined,
    pin_preferred: pinPreferred,
    preferred_machine_id: pinPreferred ? (opts.preferredMachineId ?? null) : null,
    preferred_workcenter_id: pinPreferred ? (opts.preferredWorkcenterId ?? null) : null,
  };

  const res = await fetch(`${UNIT_WISE_BASE}/rebuild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail;
    const msg = typeof detail === 'string'
      ? detail
      : (data.message || 'Unit-wise rebuild failed');
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchUnitWiseSchedule({ partId, orderId, latestOnly = true } = {}) {
  const q = new URLSearchParams();
  if (partId) q.set('part_id', String(partId));
  if (orderId) q.set('order_id', String(orderId));
  if (latestOnly) q.set('latest_only', 'true');
  const res = await fetch(`${UNIT_WISE_BASE}?${q.toString()}`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Failed to load unit-wise schedule');
  }
  return res.json();
}

export async function fetchUnitWiseCompare(partId) {
  const res = await fetch(`${UNIT_WISE_BASE}/compare?part_id=${partId}`);
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || 'Comparison failed');
  }
  return res.json();
}

export async function fetchGanttMachines() {
  const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/gantt-data`);
  if (!res.ok) throw new Error('Failed to load machines');
  return res.json();
}

/**
 * Machines from the scheduling backend (same DB as unit-wise).
 * Prefer /with-work-center so WC names are available for the pin dropdown.
 */
export async function fetchMachines() {
  const withWc = await fetch(`${SCHEDULING_API_BASE_URL}/machines/with-work-center`);
  if (withWc.ok) {
    const data = await withWc.json();
    const list = Array.isArray(data) ? data : [];
    return list.map((m) => ({
      ...m,
      workcenter_id: m.work_center_id ?? m.workcenter_id ?? null,
      work_center_id: m.work_center_id ?? m.workcenter_id ?? null,
    }));
  }

  const res = await fetch(`${SCHEDULING_API_BASE_URL}/machines/`);
  if (!res.ok) throw new Error('Failed to load machines');
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.machines || [];
  return list.map((m) => ({
    ...m,
    workcenter_id: m.work_center_id ?? m.workcenter_id ?? null,
    work_center_id: m.work_center_id ?? m.workcenter_id ?? null,
  }));
}

/**
 * Workcenters derived from scheduling machines (no /workcenters route on :8989).
 * Falls back to OMS config.js host only if scheduling machines are empty.
 */
export async function fetchWorkcenters(machines = null) {
  const list = machines ?? (await fetchMachines().catch(() => []));
  const byId = new Map();
  (list || []).forEach((m) => {
    const wc = m.work_center || m.workcenter;
    const id = m.work_center_id ?? m.workcenter_id ?? wc?.id;
    if (id == null || byId.has(id)) return;
    byId.set(id, {
      id,
      name: wc?.work_center_name || wc?.name || `Workcenter ${id}`,
      code: wc?.code || null,
      work_center_name: wc?.work_center_name || wc?.name || `Workcenter ${id}`,
    });
  });
  if (byId.size > 0) return Array.from(byId.values()).sort((a, b) => a.id - b.id);

  // Legacy OMS host from config.js / auth.js (often unreachable in this setup)
  try {
    const res = await fetch(`${API_BASE_URL}/workcenters/`);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data) ? data : data?.items || [];
    return rows.map((wc) => ({
      id: wc.id,
      name: wc.work_center_name || wc.name || wc.code || `WC ${wc.id}`,
      code: wc.code || null,
      work_center_name: wc.work_center_name || wc.name,
    }));
  } catch {
    return [];
  }
}

export async function fetchShiftHours() {
  const res = await fetch(`${SCHEDULING_API_BASE_URL}/shift-hours/`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.items || data?.data || []);
}

/** Orders from scheduling host (not config.js :8000). */
export async function fetchOrders() {
  try {
    const res = await fetch(
      `${SCHEDULING_API_BASE_URL}/scheduling/orders-by-project-coordinator`
    );
    if (res.ok) {
      const data = await res.json();
      const rows = Array.isArray(data?.orders) ? data.orders : Array.isArray(data) ? data : [];
      return rows.map((o) => ({
        id: o.order_id ?? o.id ?? o.sale_order_id,
        sale_order_number: o.sale_order_number || o.order_number,
        product_name: o.product_name,
        status: o.status,
      })).filter((o) => o.id != null);
    }
  } catch {
    /* fall through */
  }

  // Legacy OMS host — soft-fail
  try {
    const res = await fetch(`${API_BASE_URL}/orders/`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data?.orders || []);
  } catch {
    return [];
  }
}

/** Make-parts for a sale order (scheduling host). */
export async function fetchOrderParts(saleOrderId) {
  if (!saleOrderId) return [];
  const res = await fetch(
    `${SCHEDULING_API_BASE_URL}/scheduling/make-parts/${saleOrderId}`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data?.make_parts) ? data.make_parts : [];
  return list.map((p) => ({
    id: p.part_id ?? p.id,
    part_number: p.part_number,
    part_name: p.part_name,
  }));
}
