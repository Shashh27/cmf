/**
 * Per-operation qty band editor (unit_from / unit_to / machine in WC).
 */
import React from 'react';
import { Button, InputNumber, Select, Space, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Option } = Select;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatBusyUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hh}:${mm}`;
}

function wipLabel(parts) {
  const list = Array.isArray(parts) ? parts : [];
  if (!list.length) return '';
  return list
    .map((p) => {
      const name = (p.part_name || '').trim();
      const number = (p.part_number || '').trim();
      if (name && number) return `${name} (${number})`;
      return name || number || `Part ${p.part_id}`;
    })
    .join(', ');
}

function machineOccupancyHint(machine) {
  const until = formatBusyUntil(machine?.occupied_until);
  const wip = wipLabel(machine?.wip_parts);
  if (!until) return 'Free · no WIP';
  return wip ? `Busy until ${until} · WIP: ${wip}` : `Busy until ${until} · no WIP`;
}

export default function OperationAllocationEditor({
  operation,
  quantity,
  bands,
  onChange,
}) {
  const machines = operation?.machines || [];
  const approved = Number(operation?.approved_quantity || 0);

  const updateBand = (index, patch) => {
    const next = (bands || []).map((b, i) => (i === index ? { ...b, ...patch } : b));
    onChange(next);
  };

  const addBand = () => {
    const usedMax = (bands || []).reduce((m, b) => Math.max(m, Number(b.unit_to) || 0), 0);
    const start = Math.min(usedMax + 1, quantity);
    const mid =
      operation.default_machine_id &&
      machines.some((m) => m.id === operation.default_machine_id)
        ? operation.default_machine_id
        : machines[0]?.id;
    if (!mid) return;
    onChange([
      ...(bands || []),
      {
        operation_id: operation.operation_id,
        unit_from: start,
        unit_to: quantity,
        machine_id: mid,
      },
    ]);
  };

  const removeBand = (index) => {
    onChange((bands || []).filter((_, i) => i !== index));
  };

  const clearBands = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text type="secondary" className="text-xs">
          Work center: {(operation.workcenter_name || operation.workcenter_id) ?? '—'}
          {approved > 0 ? ` · ${approved} unit(s) already approved (skipped on rebuild)` : ''}
        </Text>
        <Space size="small">
          <Button size="small" icon={<PlusOutlined />} onClick={addBand} disabled={!machines.length}>
            Add band
          </Button>
          {(bands || []).length > 0 && (
            <Button size="small" onClick={clearBands}>
              Use auto
            </Button>
          )}
        </Space>
      </div>

      {(bands || []).length === 0 ? (
        <Text type="secondary" className="text-xs block">
          No bands — rebuild uses WC earliest-free for this operation.
        </Text>
      ) : (
        (bands || []).map((b, idx) => {
          const locked = approved > 0 && Number(b.unit_to) <= approved;
          return (
            <div
              key={`${b.operation_id}-${idx}`}
              className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5"
            >
              <span className="text-xs text-slate-500 w-10">Units</span>
              <InputNumber
                size="small"
                min={1}
                max={quantity}
                value={b.unit_from}
                disabled={locked}
                onChange={(v) => updateBand(idx, { unit_from: Number(v) || 1 })}
              />
              <span className="text-xs text-slate-400">–</span>
              <InputNumber
                size="small"
                min={1}
                max={quantity}
                value={b.unit_to}
                disabled={locked}
                onChange={(v) => updateBand(idx, { unit_to: Number(v) || 1 })}
              />
              <Select
                size="small"
                style={{ minWidth: 180 }}
                popupMatchSelectWidth={false}
                optionLabelProp="label"
                value={b.machine_id}
                disabled={locked || !machines.length}
                onChange={(v) => updateBand(idx, { machine_id: v })}
                placeholder="Machine"
              >
                {machines.map((m) => {
                  const name = m.name || `Machine ${m.id}`;
                  return (
                    <Option key={m.id} value={m.id} label={name}>
                      <div style={{ lineHeight: 1.25, padding: '2px 0' }}>
                        <div>{name}</div>
                        <div style={{ fontSize: 11, color: '#8c8c8c', whiteSpace: 'normal' }}>
                          {machineOccupancyHint(m)}
                        </div>
                      </div>
                    </Option>
                  );
                })}
              </Select>
              <Button
                size="small"
                danger
                type="text"
                icon={<DeleteOutlined />}
                disabled={locked}
                onClick={() => removeBand(idx)}
              />
            </div>
          );
        })
      )}
    </div>
  );
}
