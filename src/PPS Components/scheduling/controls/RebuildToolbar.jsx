/**
 * Rebuild controls for Intelligent Scheduler.
 * Assignment modes: auto | process_plan | manual (manual uses saved qty→machine bands).
 */
import React from 'react';
import { Button, Popover, Radio, Select } from 'antd';

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
  rebuildLabel = 'Rebuild schedule',
  rebuildingLabel = 'Rebuilding…',
  confirmOpen = false,
  confirmTitle,
  confirmDescription,
  onConfirm,
  onCancelConfirm,
  warningMessage,
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
  const selectedModeLabel =
    modeOptions.find((opt) => opt.value === mode)?.label
    || (mode === 'process_plan' ? 'As per process plan' : mode === 'manual' ? 'Manual qty split' : 'Auto');

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

        <div className="ml-auto flex items-center gap-3">
          <div className="flex flex-col items-end leading-tight pr-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Selected
            </span>
            <span className="text-sm font-semibold text-slate-800">
              {selectedModeLabel}
            </span>
          </div>
          {onConfirm ? (
            <Popover
              open={confirmOpen}
              trigger={[]}
              placement="bottomRight"
              arrow={{ pointAtCenter: true }}
              color="#fffbeb"
              zIndex={2000}
              autoAdjustOverflow={false}
              getPopupContainer={() => document.body}
              classNames={{ root: 'machine-link-save-confirm' }}
              styles={{
                root: { maxWidth: 360 },
                container: {
                  border: '1px solid #fcd34d',
                  padding: '12px 14px',
                  borderRadius: 10,
                  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
                },
              }}
              content={
                <div style={{ width: 320 }}>
                  <p className="text-sm font-semibold text-slate-800 m-0">
                    {confirmTitle}
                  </p>
                  {confirmDescription && (
                    <p className="text-xs text-slate-600 mt-1 mb-0">
                      {confirmDescription}
                    </p>
                  )}
                  <div className="flex justify-end gap-2 mt-3">
                    <Button
                      size="small"
                      onClick={onCancelConfirm}
                      disabled={rebuilding}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      onClick={onConfirm}
                      loading={rebuilding}
                    >
                      Yes
                    </Button>
                  </div>
                </div>
              }
            >
              <button
                type="button"
                onClick={onRebuild}
                disabled={rebuilding}
                className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rebuilding ? rebuildingLabel : rebuildLabel}
              </button>
            </Popover>
          ) : (
            <button
              type="button"
              onClick={onRebuild}
              disabled={rebuilding}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {rebuilding ? rebuildingLabel : rebuildLabel}
            </button>
          )}
        </div>
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

      {warningMessage && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 m-0">
          {warningMessage}
        </p>
      )}

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
