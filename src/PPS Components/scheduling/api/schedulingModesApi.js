/**
 * Which operator job-card schedule is live (batch vs unit-wise).
 */
import { SCHEDULING_API_BASE_URL } from '../../../Config/schedulingconfig.js';

const MODE_STORAGE_KEY = 'operator-schedule-mode';

let cachedModes = null;
let inflight = null;

export async function fetchSchedulingModes({ force = false, machineId = null } = {}) {
  if (!force && cachedModes && machineId == null) return cachedModes;
  if (!force && inflight && machineId == null) return inflight;
  inflight = (async () => {
    const q = machineId != null ? `?machine_id=${encodeURIComponent(machineId)}` : '';
    const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/scheduling-modes${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.detail || data.message || 'Failed to load scheduling modes');
    }
    const modes = {
      shop_plan: data.shop_plan === 'unit_wise' || data.shop_plan === 'batch' ? data.shop_plan : null,
      batch_scheduling: data.batch_scheduling !== false,
      unit_wise_scheduling: data.unit_wise_scheduling !== false,
      in_progress_engine: data.in_progress_engine || null,
      toggle_allowed: data.toggle_allowed !== false,
      toggle_lock_reason: data.toggle_lock_reason || null,
      part_engines: data.part_engines || {},
      machine_part_engines: data.machine_part_engines || {},
      shop_started_unit_wise: Boolean(data.shop_started_unit_wise),
      shop_started_batch: Boolean(data.shop_started_batch),
      pps_block_batch_update: Boolean(data.pps_block_batch_update),
      pps_confirm_planned_update: Boolean(data.pps_confirm_planned_update),
      pps_block_message: data.pps_block_message || null,
      process_plan_save_warning: data.process_plan_save_warning || null,
    };
    cachedModes = modes;
    return modes;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function readPersistedScheduleMode() {
  try {
    const raw = localStorage.getItem(MODE_STORAGE_KEY);
    if (raw === 'batch' || raw === 'unit_wise') return raw;
  } catch { /* ignore */ }
  return null;
}

export function persistScheduleMode(mode) {
  try {
    if (mode === 'batch' || mode === 'unit_wise') {
      localStorage.setItem(MODE_STORAGE_KEY, mode);
    }
  } catch { /* ignore */ }
}

export async function fetchShopPlan() {
  const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/shop-plan`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || 'Failed to load shop plan');
  }
  return data;
}

export function currentShopPlanEditor() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const role = String(user?.role || '').toLowerCase();
    const id = user?.id ?? user?.user_id ?? null;
    return {
      id: id == null ? null : Number(id),
      role,
      allowed: role === 'admin' || role === 'manufacturing_coordinator',
    };
  } catch {
    return { id: null, role: '', allowed: false };
  }
}

export async function saveShopPlan(engine, updatedBy) {
  const res = await fetch(`${SCHEDULING_API_BASE_URL}/scheduling/shop-plan`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ engine, updated_by: updatedBy }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data.message || 'Failed to save shop plan';
    throw new Error(typeof detail === 'string' ? detail : 'Failed to save shop plan');
  }
  cachedModes = null;
  return data;
}

/**
 * One live schedule. The persisted shop plan wins over the operator's last pick.
 * If only one flag is on, that schedule wins.
 */
export function resolveScheduleMode(modes, persisted = readPersistedScheduleMode()) {
  const batch = Boolean(modes?.batch_scheduling);
  const unitWise = Boolean(modes?.unit_wise_scheduling);
  if (modes?.shop_plan === 'unit_wise' && unitWise) return 'unit_wise';
  if (modes?.shop_plan === 'batch' && batch) return 'batch';
  if (modes?.shop_plan === 'unit_wise' && !unitWise) return null;
  if (modes?.shop_plan === 'batch' && !batch) return null;
  if (batch && !unitWise) return 'batch';
  if (unitWise && !batch) return 'unit_wise';
  if (batch && unitWise) {
    return persisted === 'batch' || persisted === 'unit_wise' ? persisted : 'unit_wise';
  }
  return null;
}

export function canSwitchSchedule(modes) {
  return Boolean(modes) && modes.toggle_allowed !== false;
}

export function jobAllowedOnSchedule(job, mode, partEngines = {}) {
  const partId = job?.part_id ?? job?.partId;
  if (partId == null || !mode) return true;
  const started = partEngines[String(partId)];
  if (!started) return true;
  return started === mode;
}

export function jobFilterEngines(modes = {}) {
  return modes.part_engines || {};
}

export function wrongEngineMessage(jobEngine, requiredEngine) {
  const live = requiredEngine === 'unit_wise' ? 'unit-wise' : 'batch';
  const job = jobEngine === 'unit_wise' ? 'unit-wise' : 'batch';
  return `This part is on the ${live} schedule. Use the ${live} job card, not ${job}.`;
}

export function liveEngineForJob(modes, job) {
  const partId = job?.part_id ?? job?.partId;
  const partEngine = partId != null ? jobFilterEngines(modes)[String(partId)] : null;
  return modes?.in_progress_engine || partEngine || resolveScheduleMode(modes);
}

/**
 * PPS Planned/Actual Update while the shop is on unit-wise.
 * Prefer blocking over a silent allow. Planned confirm is only when
 * nobody has started production yet.
 */
export function ppsUpdatePolicy(modes) {
  const shopPlan = modes?.shop_plan || readPersistedScheduleMode();
  const blockMsg =
    modes?.pps_block_message
    || 'Shop floor follows unit-wise. Update the live plan from Unit Scheduling.';
  const confirmMsg =
    'This regenerates the batch planned schedule.';
  if (shopPlan === 'batch') {
    if (modes?.pps_confirm_planned_update) {
      return {
        planned: 'confirm',
        actual: 'allow',
        message: null,
        confirmMessage: confirmMsg,
      };
    }
    return { planned: 'allow', actual: 'allow', message: null, confirmMessage: confirmMsg };
  }
  if (shopPlan === 'unit_wise' || modes?.pps_block_batch_update) {
    return { planned: 'block', actual: 'block', message: blockMsg, confirmMessage: confirmMsg };
  }
  if (modes?.pps_confirm_planned_update) {
    return {
      planned: 'confirm',
      actual: 'allow',
      message: null,
      confirmMessage: confirmMsg,
    };
  }
  return { planned: 'allow', actual: 'allow', message: null, confirmMessage: confirmMsg };
}
