/** Helpers for unit-wise operator job cards (quantity bands). */

export const isUnitWiseJob = (job) =>
  Boolean(job?.is_unit_wise || (job?.unit_from != null && job?.unit_to != null && job?.is_unit_wise !== false && String(job?.schedule_id || '').startsWith('unit-')));

export const getJobOperationId = (job) => {
  if (!job) return null;
  if (isUnitWiseJob(job)) return job.operation_id ?? job.id ?? job.job_id ?? null;
  return job.id || job.operation_id || job.job_id || null;
};

export const getJobStatsKey = (job) => {
  if (!job) return null;
  if (isUnitWiseJob(job)) {
    return job.schedule_id
      || `unit-${job.order_id}-${job.part_id}-${job.operation_id}-${job.unit_from}-${job.unit_to}`;
  }
  return job.id || job.operation_id || job.job_id || job.schedule_id || null;
};

export const getUnitBandQty = (job) => {
  if (!job) return 0;
  if (job.unit_from != null && job.unit_to != null) {
    const qty = Number(job.unit_to) - Number(job.unit_from) + 1;
    if (Number.isFinite(qty) && qty > 0) return qty;
  }
  return Number(job.quantity ?? job.total_quantity ?? 0) || 0;
};

export const getJobTotalQty = (job) => {
  if (!job) return 0;
  if (isUnitWiseJob(job)) return getUnitBandQty(job);
  return Number(job.total_quantity ?? job.quantity ?? job.planned_quantity ?? 0) || 0;
};

export const logsForJob = (logs, job) => {
  const list = Array.isArray(logs) ? logs : [];
  const machineId = job?.machine_id ?? job?.machineId;
  const onMachine = machineId != null
    ? list.filter((log) => Number(log.machine_id) === Number(machineId))
    : list;
  if (!isUnitWiseJob(job) || job.unit_from == null || job.unit_to == null) return onMachine;
  const from = Number(job.unit_from);
  const to = Number(job.unit_to);
  const tagged = onMachine.filter((log) => log.unit_from != null || log.unit_to != null);
  if (!tagged.length) return onMachine;
  return onMachine.filter(
    (log) => Number(log.unit_from) === from && Number(log.unit_to) === to,
  );
};

const SCHEDULE_ENGINE_STATUSES = new Set([
  'scheduled',
  'rescheduled',
  'planned',
  'unit_scheduled',
]);

const isReviewLikeStatus = (raw) => {
  const s = String(raw || '').toLowerCase().trim();
  if (!s || SCHEDULE_ENGINE_STATUSES.has(s)) return false;
  return true;
};

/**
 * Production/review status for operator UI — not schedule-engine status.
 * Batch machine-operations puts rescheduling status on job.status
 * ('scheduled'/'rescheduled'); prefer production log / operation_status.
 */
export const getJobReviewStatus = (job, stats = {}) => {
  const candidates = [
    stats.reviewStatus,
    stats.status,
    job?.operation_status,
    job?.status,
  ];
  for (const raw of candidates) {
    if (!isReviewLikeStatus(raw)) continue;
    return String(raw).toLowerCase().trim();
  }
  return '';
};

export const isJobReviewCompleted = (job, stats = {}) => {
  if (getJobReviewStatus(job, stats) === 'completed') return true;
  if (String(job?.operation_status || '').toLowerCase() === 'completed') return true;
  const total = getJobTotalQty(job);
  const remaining = getJobRemainingQty(job, stats);
  const approved = Number(
    stats.totalApproved
      ?? job?.approved_quantity
      ?? job?.completed_quantity
      ?? 0
  );
  return total > 0 && remaining <= 0 && approved >= total;
};

export const isJobReviewInProgress = (job, stats = {}) => {
  const status = getJobReviewStatus(job, stats);
  if (status === 'inprogress' || status === 'in-progress' || status === 'in progress') {
    return true;
  }
  // Open working log / activated card: can_activate false + operation in progress
  const opStatus = String(job?.operation_status || '').toLowerCase();
  return opStatus === 'inprogress' || opStatus === 'in-progress' || opStatus === 'in progress';
};

export const jobStatusLabel = (job, stats = {}) => {
  if (isJobReviewCompleted(job, stats)) return 'Completed';
  if (isJobReviewInProgress(job, stats)) return 'In Progress';
  return 'Pending';
};

export const getJobRemainingQty = (job, stats = {}) => {
  if (stats.remainingToClose != null && stats.remainingToClose !== '') {
    return Math.max(0, Number(stats.remainingToClose));
  }
  if (job?.remaining_quantity != null && job.remaining_quantity !== '') {
    return Math.max(0, Number(job.remaining_quantity));
  }
  const total = getJobTotalQty(job);
  const approved = Number(
    stats.totalApproved ?? job?.approved_quantity ?? job?.completed_quantity ?? 0
  );
  return Math.max(0, total - approved);
};
