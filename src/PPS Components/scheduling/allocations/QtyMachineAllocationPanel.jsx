/**
 * Manual qty→machine allocation panel for Intelligent Scheduler.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, Select, Spin, message } from 'antd';
import {
  fetchActiveInhouseParts,
  fetchQtyMachineAllocations,
  putQtyMachineAllocations,
} from '../api/qtyAllocationApi.js';
import {
  defaultBandForOperation,
  validateAllocationBands,
} from './allocationValidation.js';
import OperationAllocationEditor from './OperationAllocationEditor.jsx';

const { Option } = Select;
const { Panel } = Collapse;

export default function QtyMachineAllocationPanel({
  selectedPartId,
  selectedOperationId,
  selectedOperationName,
  onPartChange,
  visible = true,
}) {
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meta, setMeta] = useState(null);
  /** @type {[Record<number, Array>, Function]} */
  const [bandsByOp, setBandsByOp] = useState({});

  const loadParts = useCallback(async () => {
    try {
      const list = await fetchActiveInhouseParts();
      setParts(list);
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Failed to load active parts');
    }
  }, []);

  const loadAllocations = useCallback(async (partId) => {
    if (!partId) {
      setMeta(null);
      setBandsByOp({});
      return;
    }
    setLoading(true);
    try {
      const data = await fetchQtyMachineAllocations(partId);
      setMeta(data);
      const map = {};
      (data.allocations || []).forEach((a) => {
        const opId = Number(a.operation_id);
        if (!map[opId]) map[opId] = [];
        map[opId].push({
          operation_id: opId,
          unit_from: a.unit_from,
          unit_to: a.unit_to,
          machine_id: a.machine_id,
        });
      });
      setBandsByOp(map);
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Failed to load allocations');
      setMeta(null);
      setBandsByOp({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  useEffect(() => {
    loadAllocations(selectedPartId);
  }, [selectedPartId, loadAllocations]);

  const flatBands = useMemo(() => {
    const out = [];
    Object.values(bandsByOp).forEach((list) => {
      (list || []).forEach((b) => out.push(b));
    });
    return out;
  }, [bandsByOp]);

  const validation = useMemo(() => {
    if (!meta) return { ok: true, errors: [] };
    return validateAllocationBands(flatBands, meta.quantity, meta.operations || []);
  }, [flatBands, meta]);

  const handleSeedDefaults = () => {
    if (!meta) return;
    const next = {};
    (meta.operations || []).forEach((op) => {
      const band = defaultBandForOperation(op, meta.quantity);
      if (band) next[op.operation_id] = [band];
    });
    setBandsByOp(next);
  };

  const handleSave = async () => {
    if (!selectedPartId || !meta) return;
    if (!validation.ok) {
      message.error(validation.errors[0] || 'Fix validation errors before saving');
      return;
    }
    setSaving(true);
    try {
      const data = await putQtyMachineAllocations(selectedPartId, {
        order_id: meta.order_id ?? undefined,
        allocations: flatBands,
      });
      setMeta(data);
      const map = {};
      (data.allocations || []).forEach((a) => {
        const opId = Number(a.operation_id);
        if (!map[opId]) map[opId] = [];
        map[opId].push({
          operation_id: opId,
          unit_from: a.unit_from,
          unit_to: a.unit_to,
          machine_id: a.machine_id,
        });
      });
      setBandsByOp(map);
      message.success('Allocations saved');
    } catch (e) {
      console.error(e);
      message.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const showPartSelector = !selectedPartId;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3" style={{ maxHeight: '400px', overflowY: 'auto' }}>
      {showPartSelector && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <span className="text-xs font-medium text-slate-500">Part (active IN-House)</span>
            <Select
              showSearch
              allowClear
              placeholder="Select part"
              style={{ minWidth: 240 }}
              value={selectedPartId ?? undefined}
              onChange={(v) => onPartChange?.(v ?? null)}
              filterOption={(input, option) =>
                (option?.label || '').toLowerCase().includes(input.toLowerCase())
              }
              size="small"
            >
              {parts.map((p) => {
                const label = p.part_name
                  ? `${p.part_name} (${p.part_number || p.part_id})`
                  : p.part_number || `Part ${p.part_id}`;
                return (
                  <Option key={p.part_id} value={p.part_id} label={label}>
                    {label} · qty {p.qty}
                  </Option>
                );
              })}
            </Select>
          </div>
        </div>
      )}

      {showPartSelector && (
        <div className="flex flex-wrap items-end gap-3">
          <Button size="small" onClick={handleSeedDefaults} disabled={!meta}>
            Seed 1…qty defaults
          </Button>
        </div>
      )}

      {!showPartSelector && (
        <div className="flex flex-wrap items-end gap-3">
          <Button size="small" onClick={handleSeedDefaults} disabled={!meta}>
            Seed 1…qty defaults
          </Button>
        </div>
      )}

      {!selectedPartId && (
        <Alert
          type="info"
          showIcon
          message="Select an active part to define qty bands per operation (same work center)."
        />
      )}

      {loading && (
        <div className="py-6 text-center">
          <Spin />
        </div>
      )}

      {!loading && meta && (
        <>
          {!validation.ok && (
            <Alert
              type="warning"
              showIcon
              message="Fix before save"
              description={
                <ul className="m-0 pl-4">
                  {validation.errors.slice(0, 6).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              }
            />
          )}
          <Collapse size="small" defaultActiveKey={selectedOperationId ? [String(selectedOperationId)] : (meta.operations || []).slice(0, 2).map((o) => String(o.operation_id))}>
            {(meta.operations || [])
              .filter(op => {
                if (!selectedOperationId) return true;
                // Match by operation_id first
                if (op.operation_id === selectedOperationId) return true;
                // Also try matching by operation name as fallback
                if (selectedOperationName && op.operation_name === selectedOperationName) return true;
                if (selectedOperationName && op.operation === selectedOperationName) return true;
                return false;
              })
              .map((op) => {
                const title = `Op ${op.operation_number || op.operation_id}${op.operation_name ? ` — ${op.operation_name}` : ''
                  }`;
                return (
                  <Panel header={title} key={String(op.operation_id)}>
                    <OperationAllocationEditor
                      operation={op}
                      quantity={meta.quantity}
                      bands={bandsByOp[op.operation_id] || []}
                      onChange={(next) =>
                        setBandsByOp((prev) => ({
                          ...prev,
                          [op.operation_id]: next,
                        }))
                      }
                    />
                  </Panel>
                );
              })}
          </Collapse>
          
          <div className="flex justify-end mt-3">
            <Button
              type="primary"
              size="small"
              onClick={handleSave}
              loading={saving}
              disabled={!selectedPartId || !validation.ok}
            >
              Save allocations
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
