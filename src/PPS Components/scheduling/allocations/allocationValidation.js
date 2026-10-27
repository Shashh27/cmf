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
