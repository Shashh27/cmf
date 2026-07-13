/** Shared helpers for production log / stage display in Order Tracking */

export const sortLogsByStage = (logs = []) =>
  [...logs].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));

export const normalizeLogStatus = (status) =>
  String(status || '').toLowerCase().replace(/_/g, ' ').trim();

/** Production batch review — operator produced qty in this log */
export const isProductionReviewLog = (log) => (log.produced_quantity || 0) > 0;

/** Skip empty in-progress placeholder logs */
export const getVisibleStageLogs = (logs = []) => {
  const sorted = sortLogsByStage(logs);
  return sorted.filter((log) => {
    const inProgress = normalizeLogStatus(log.operator_status) === 'in progress';
    const empty =
      !(log.produced_quantity || 0) &&
      !(log.operator_rework_quantity || 0) &&
      !(log.approved_quantity || 0) &&
      !(log.rework_quantity || 0) &&
      !(log.rejected_quantity || 0);
    return !(inProgress && empty);
  });
};

export const getLatestSnapshotLog = (logs = []) => {
  const sorted = sortLogsByStage(logs);
  const completed = [...sorted]
    .reverse()
    .find((log) => normalizeLogStatus(log.operator_status) === 'completed');
  return completed || sorted[sorted.length - 1];
};

/**
 * Rejected qty for stage table rows.
 * - Production stage: rejected_quantity from supervisor review of that batch.
 * - Rework child: only when log is rework-only (produced=0); hybrid/production logs show —.
 */
export const getRejectedForStageRow = (log, isChild) => {
  if (!isChild) return log.rejected_quantity || 0;
  if (isProductionReviewLog(log)) return null;
  return log.rejected_quantity || 0;
};

/**
 * Operation summary totals (parent row).
 * - Produced: sum of all production batches.
 * - Approved: sum per review cycle (each log once).
 * - Rework: sum of supervisor rework marks on production reviews only.
 * - Rejected: sum of all supervisor rejects (production + rework cycles).
 */
export const getOpQtyTotals = (logs = []) => {
  if (!logs.length) {
    return {
      produced: 0,
      approved: 0,
      rework: 0,
      rejected: 0,
      remaining: 0,
    };
  }

  const data = getVisibleStageLogs(logs);
  const rows = data.length ? data : sortLogsByStage(logs);
  const snapshot = getLatestSnapshotLog(rows);

  return {
    produced: rows.reduce((sum, log) => sum + (log.produced_quantity || 0), 0),
    approved: rows.reduce((sum, log) => sum + (log.approved_quantity || 0), 0),
    rework: rows.reduce(
      (sum, log) =>
        isProductionReviewLog(log) ? sum + (log.rework_quantity || 0) : sum,
      0,
    ),
    rejected: rows.reduce((sum, log) => sum + (log.rejected_quantity || 0), 0),
    remaining:
      snapshot.remaining_quantity_to_be_produced ?? snapshot.remaining_to_close ?? 0,
  };
};

/**
 * Group logs: production stage + nested rework outcomes linked to rework_quantity.
 */
export const buildProductionStageTree = (logs = []) => {
  const visible = getVisibleStageLogs(logs);
  const groups = [];
  const hybridApprovedByLogId = new Map();
  let i = 0;

  while (i < visible.length) {
    const log = visible[i];
    const produced = log.produced_quantity || 0;

    if (produced <= 0) {
      i += 1;
      continue;
    }

    const group = {
      key: `prod-${log.id}`,
      stageNumber: groups.length + 1,
      log,
      reworkOutcomes: [],
      displayApproved: Math.max(
        0,
        (log.approved_quantity || 0) - (hybridApprovedByLogId.get(log.id) || 0),
      ),
    };
    i += 1;

    let pendingRework = log.rework_quantity || 0;

    while (i < visible.length && pendingRework > 0) {
      const next = visible[i];
      const nextProduced = next.produced_quantity || 0;
      const nextOpRework = next.operator_rework_quantity || 0;

      if (nextProduced === 0) {
        group.reworkOutcomes.push({
          key: `rework-${next.id}`,
          log: next,
          approvedQty: next.approved_quantity || 0,
        });
        pendingRework -= nextOpRework || next.approved_quantity || 1;
        i += 1;
        continue;
      }

      if (nextOpRework > 0) {
        const reworkApproved = Math.min(next.approved_quantity || 0, nextOpRework);
        group.reworkOutcomes.push({
          key: `rework-${next.id}-linked`,
          log: next,
          approvedQty: reworkApproved,
          fromHybridProductionLog: true,
        });
        pendingRework -= nextOpRework;
        hybridApprovedByLogId.set(
          next.id,
          (hybridApprovedByLogId.get(next.id) || 0) + reworkApproved,
        );
        break;
      }

      break;
    }

    groups.push(group);
  }

  return groups;
};

/** Sum rejected shown in stage tree (for validation scripts) */
export const sumStageTreeRejected = (tree) => {
  let total = 0;
  for (const group of tree) {
    total += group.log.rejected_quantity || 0;
    for (const outcome of group.reworkOutcomes) {
      const v = getRejectedForStageRow(outcome.log, true);
      if (v) total += v;
    }
  }
  return total;
};
