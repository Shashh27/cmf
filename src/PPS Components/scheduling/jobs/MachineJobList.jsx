/**
 * Operator view: one card per unit-wise quantity band on a machine.
 * Read-only. Does not activate job cards or call production logs.
 */
import React, { useEffect, useState } from 'react';
import { Alert, Empty, Select, Spin } from 'antd';
import dayjs from 'dayjs';
import { fetchMachineJobCards } from './machineJobsApi.js';

const { Option } = Select;

function formatWhen(value) {
  if (!value) return '—';
  const d = dayjs(value);
  return d.isValid() ? d.format('DD MMM YYYY HH:mm') : String(value);
}

export default function MachineJobList({ machines = [] }) {
  const [machineId, setMachineId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cards, setCards] = useState([]);

  useEffect(() => {
    if (!machineId) {
      setCards([]);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMachineJobCards(machineId)
      .then((data) => {
        if (cancelled) return;
        setCards(Array.isArray(data?.jobs) ? data.jobs : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setCards([]);
        setError(e.message || 'Failed to load jobs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
      <div className="flex flex-col gap-1 max-w-sm">
        <span className="text-xs font-medium text-slate-500">Machine</span>
        <Select
          showSearch
          allowClear
          size="small"
          placeholder="Select machine"
          value={machineId ?? undefined}
          onChange={(v) => setMachineId(v ?? null)}
          filterOption={(input, option) =>
            (option?.label || '').toLowerCase().includes(input.toLowerCase())
          }
        >
          {(machines || []).map((m) => (
            <Option key={m.id} value={m.id} label={m.name || `Machine ${m.id}`}>
              {m.name || `Machine ${m.id}`}
            </Option>
          ))}
        </Select>
      </div>

      <p className="text-xs text-slate-500 m-0">
        Cards come from the latest unit-wise plan. A later operation stays blocked until the previous operation has at least one approved unit. This view does not activate a job card.
      </p>

      {!machineId && (
        <Alert type="info" showIcon message="Select a machine to see its quantity bands." />
      )}
      {error && <Alert type="error" showIcon message={error} />}
      {loading && (
        <div className="py-8 text-center">
          <Spin />
        </div>
      )}
      {!loading && machineId && !error && cards.length === 0 && (
        <Empty description="No unit-wise jobs on this machine" />
      )}
      {!loading && cards.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {cards.map((card) => (
            <div
              key={`${card.part_id}-${card.operation_id}-${card.unit_from}`}
              className={`rounded border px-3 py-2 ${
                card.can_activate
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-amber-200 bg-amber-50/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-slate-800">
                  Op {card.operation_number || card.operation_id}
                  {card.operation_name ? ` — ${card.operation_name}` : ''}
                </div>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    card.can_activate
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {card.can_activate ? 'Ready' : 'Blocked'}
                </span>
              </div>
              <div className="text-xs text-slate-500">
                {card.part_name || card.part_number || `Part ${card.part_id}`}
                {card.order_number ? ` · ${card.order_number}` : ''}
              </div>
              <div className="mt-1 text-sm text-slate-700">
                Units {card.unit_from}–{card.unit_to} · qty {card.quantity}
              </div>
              <div className="text-xs text-slate-500">
                {formatWhen(card.planned_start)} → {formatWhen(card.planned_end)}
                {card.schedule_version != null ? ` · v${card.schedule_version}` : ''}
              </div>
              {card.blocked_reason && (
                <div className="mt-1 text-xs text-amber-900">{card.blocked_reason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
