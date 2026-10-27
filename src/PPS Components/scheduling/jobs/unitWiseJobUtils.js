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
  if (!isUnitWiseJob(job) || job.unit_from == null || job.unit_to == null) return list;
  const from = Number(job.unit_from);
  const to = Number(job.unit_to);
  const tagged = list.filter((log) => log.unit_from != null || log.unit_to != null);
  if (!tagged.length) return list;
  return list.filter(
    (log) => Number(log.unit_from) === from && Number(log.unit_to) === to,
  );
};

export const getJobRemainingQty = (job, stats = {}) => {
  const total = getJobTotalQty(job);
  const approved = Number(stats.totalApproved || 0);
  if (isUnitWiseJob(job)) {
    return Math.max(0, total - approved);
  }
  if (stats.remainingToClose != null && stats.remainingToClose !== '') {
    return Math.max(0, Number(stats.remainingToClose));
  }
  return Math.max(0, total - approved);
};
