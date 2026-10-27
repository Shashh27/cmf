/**
 * Rebuild controls for Intelligent Scheduler.
 * Assignment modes: auto | process_plan | manual (manual uses saved qty→machine bands).
 */
import React from 'react';
import { Radio, Select } from 'antd';

const { Option } = Select;

export default function RebuildToolbar({
  rebuilding,
  onRebuild,
  statusMessage,
  errorMessage,
  assignmentMode = 'auto',
  onAssignmentModeChange,
  pinPreferred,
  onPinPreferredChange,
  partFilter,
  onPartFilterChange,
  parts = [],
  showPartFilter,
  allowedModes,
}) {
  const allModeOptions = [
    { label: 'Auto', value: 'auto' },
    { label: 'As per process plan', value: 'process_plan' },
    { label: 'Manual qty split', value: 'manual' },
  ];
  const modeOptions = Array.isArray(allowedModes) && allowedModes.length
    ? allModeOptions.filter((opt) => allowedModes.includes(opt.value))
    : allModeOptions;
  const mode = assignmentMode || modeOptions[0]?.value || 'auto';
  const partFilterVisible = showPartFilter !== false && (mode === 'auto' || mode === 'process_plan');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500">Assignment mode</span>
          <Radio.Group
            size="small"
            value={mode}
            onChange={(e) => {
              const v = e.target.value;
              onAssignmentModeChange?.(v);
              if (v === 'process_plan') onPinPreferredChange?.(true);
              else onPinPreferredChange?.(false);
            }}
            optionType="button"
            buttonStyle="solid"
            options={modeOptions}
          />
        </div>

        {partFilterVisible && (
          <div className="flex flex-col gap-1 min-w-[200px]">
            <span className="text-xs font-medium text-slate-500">Part filter</span>
            <Select
              size="small"
              allowClear
              placeholder="All parts"
              style={{ minWidth: 200 }}
              value={partFilter ?? undefined}
              onChange={(v) => onPartFilterChange?.(v ?? null)}
            >
              <Option value={null}>All parts</Option>
              {(parts || []).map((p) => (
                <Option key={p.part_id} value={p.part_id}>
                  {p.label}
                </Option>
              ))}
            </Select>
          </div>
        )}

        <button
          type="button"
          onClick={onRebuild}
          disabled={rebuilding}
          className="ml-auto inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {rebuilding ? 'Rebuilding…' : 'Rebuild schedule'}
        </button>
      </div>

      <p className="text-xs text-slate-500 m-0">
        {mode === 'auto' && (
          partFilter
            ? `Rebuild only selected part: WC earliest-free (may split across machines).`
            : 'WC earliest-free — quantity may split across machines automatically.'
        )}
        {mode === 'process_plan' && (
          partFilter
            ? `Rebuild only selected part: Uses the machine defined in operation routing.`
            : 'Uses the machine defined in the operation routing (process plan adherence).'
        )}
        {mode === 'manual' &&
          'Uses saved qty→machine bands below. Rebuild is greedy only.'}
      </p>

      {statusMessage && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 m-0">
          {statusMessage}
        </p>
      )}
      {errorMessage && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2 m-0">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
