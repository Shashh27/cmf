/**
 * Client-side validation mirroring backend qty-band rules.
 * Ops with no bands are allowed (auto fallback).
 * Ops with any bands must partition 1..qty with no gaps/overlaps.
 */

/**
 * @param {Array<{operation_id:number, unit_from:number, unit_to:number, machine_id:number}>} bands
 * @param {number} quantity
 * @param {Array<{operation_id:number, machines:Array<{id:number}>}>} operations
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAllocationBands(bands, quantity, operations = []) {
  const errors = [];
  const qty = Number(quantity) || 0;
  if (qty <= 0) {
    return { ok: false, errors: ['Part quantity must be > 0'] };
  }

  const opMachines = new Map();
  (operations || []).forEach((op) => {
    opMachines.set(
      Number(op.operation_id),
      new Set((op.machines || []).map((m) => Number(m.id)))
    );
  });

  const byOp = new Map();
  (bands || []).forEach((b, idx) => {
    const opId = Number(b.operation_id);
    const from = Number(b.unit_from);
    const to = Number(b.unit_to);
    const mid = Number(b.machine_id);
    if (!opId || !mid) {
      errors.push(`Row ${idx + 1}: operation and machine are required`);
      return;
    }
    if (from < 1 || to < from || to > qty) {
      errors.push(
        `Op ${opId}: invalid range ${from}–${to} (must be within 1–${qty})`
      );
      return;
    }
    const allowed = opMachines.get(opId);
    if (allowed && allowed.size > 0 && !allowed.has(mid)) {
      errors.push(`Op ${opId}: machine ${mid} is not in this operation's work center`);
    }
    if (!byOp.has(opId)) byOp.set(opId, []);
    byOp.get(opId).push({ from, to, mid });
  });

  byOp.forEach((opBands, opId) => {
    const covered = Array(qty + 1).fill(false);
    opBands
      .slice()
      .sort((a, b) => a.from - b.from)
      .forEach((b) => {
        for (let u = b.from; u <= b.to; u += 1) {
          if (covered[u]) {
            errors.push(`Op ${opId}: overlapping unit ${u}`);
          }
          covered[u] = true;
        }
      });
    const missing = [];
    for (let u = 1; u <= qty; u += 1) {
      if (!covered[u]) missing.push(u);
    }
    if (missing.length) {
      const preview = missing.slice(0, 12).join(', ');
      errors.push(
        `Op ${opId}: gaps — missing units ${preview}${missing.length > 12 ? '…' : ''}`
      );
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Default single band covering 1..qty on routing default / first WC machine.
 */
export function defaultBandForOperation(op, quantity) {
  const qty = Number(quantity) || 0;
  const machines = op.machines || [];
  const mid =
    op.default_machine_id && machines.some((m) => m.id === op.default_machine_id)
      ? op.default_machine_id
      : machines[0]?.id ?? null;
  if (!mid || qty < 1) return null;
  return {
    operation_id: op.operation_id,
    unit_from: 1,
    unit_to: qty,
    machine_id: mid,
  };
}

function startOfLocalDay(value) {
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Machine is free on the selected day when occupied_until is missing
 * or strictly before local midnight of that day.
 */
export function isMachineFreeOnDay(machine, freeOnDate) {
  const until = machine?.occupied_until;
  if (!until) return true;
  const busyUntil = new Date(until);
  if (Number.isNaN(busyUntil.getTime())) return true;
  return busyUntil < startOfLocalDay(freeOnDate);
}

/**
 * Even qty→machine bands across WC machines that are free on freeOnDate.
 * Keeps locked approved bands; remaining units start after approved_quantity.
 *
 * 20 units / 5 free → 4 each. 22 / 5 → 5,5,4,4,4.
 *
 * @returns {{ ok: boolean, reason?: string, bands: Array, freeCount: number, remainingCount: number }}
 */
export function splitEquallyAcrossMachines({
  operation,
  quantity,
  existingBands = [],
  freeOnDate = new Date(),
} = {}) {
  const qty = Number(quantity) || 0;
  const opId = Number(operation?.operation_id);
  const approved = Math.max(0, Number(operation?.approved_quantity || 0));
  const remainingStart = approved + 1;
  const remainingCount = qty - approved;
  const lockedBands = (existingBands || []).filter(
    (b) => approved > 0 && Number(b.unit_to) <= approved
  );
  const freeMachines = (operation?.machines || []).filter((m) =>
    isMachineFreeOnDay(m, freeOnDate)
  );

  if (!opId || qty < 1) {
    return {
      ok: false,
      reason: 'no_quantity',
      bands: existingBands,
      freeCount: freeMachines.length,
      remainingCount,
    };
  }
  if (remainingCount < 1) {
    return {
      ok: false,
      reason: 'no_remaining_units',
      bands: existingBands,
      freeCount: freeMachines.length,
      remainingCount,
    };
  }
  if (freeMachines.length === 0) {
    return {
      ok: false,
      reason: 'no_free_machines',
      bands: existingBands,
      freeCount: 0,
      remainingCount,
    };
  }

  const n = freeMachines.length;
  const base = Math.floor(remainingCount / n);
  const extra = remainingCount % n;
  const splitBands = [];
  let cursor = remainingStart;
  freeMachines.forEach((machine, index) => {
    const size = base + (index < extra ? 1 : 0);
    if (size < 1) return;
    const unitFrom = cursor;
    const unitTo = cursor + size - 1;
    splitBands.push({
      operation_id: opId,
      unit_from: unitFrom,
      unit_to: unitTo,
      machine_id: machine.id,
    });
    cursor = unitTo + 1;
  });

  return {
    ok: true,
    bands: [...lockedBands, ...splitBands],
    freeCount: n,
    remainingCount,
  };
}
