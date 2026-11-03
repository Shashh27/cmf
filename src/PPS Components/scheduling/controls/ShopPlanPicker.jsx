/**
 * Admin / manufacturing coordinator control for the one live shop plan.
 * Choosing a card only saves shop_schedule_plan. It does not write a schedule.
 */
import React, { useEffect, useState } from 'react';
import { Modal, message } from 'antd';
import {
  SettingOutlined,
  InfoCircleOutlined,
  LockOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import { fetchShopPlan, saveShopPlan, currentShopPlanEditor } from '../api/schedulingModesApi.js';

export function shopPlanBanner(engine) {
  if (engine === 'unit_wise') {
    return 'Shop floor follows unit-wise — batch job cards are locked. Use Unit Scheduling for the live plan.';
  }
  return 'Shop floor follows batch — unit-wise job cards are locked.';
}

const MODES = [
  {
    value: 'batch',
    title: 'Batch Scheduling',
    description: 'Execute production following batch-wise scheduling.',
    points: ['Batch schedule enabled', 'Batch-based job cards on shopfloor'],
    lockedLabel: 'Unit-wise schedule locked',
    icon: 'batch',
  },
  {
    value: 'unit_wise',
    title: 'Unit-wise Scheduling',
    description: 'Execute and track individual parts independently.',
    points: ['Individual part tracking', 'Unit-wise job cards on shopfloor'],
    lockedLabel: 'Batch schedule locked',
    icon: 'unit',
  },
];

function ModeIcon({ kind, active }) {
  const color = active ? '#1677ff' : '#8c8c8c';
  if (kind === 'unit') {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="6" r="3" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx="6" cy="20" r="3" fill="none" stroke={color} strokeWidth="1.6" />
        <circle cx="22" cy="20" r="3" fill="none" stroke={color} strokeWidth="1.6" />
        <path d="M14 9v4M12 15l-4 3M16 15l4 3" stroke={color} strokeWidth="1.6" fill="none" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="6" y="8" width="16" height="4" rx="1" fill="none" stroke={color} strokeWidth="1.6" />
      <rect x="6" y="14" width="16" height="4" rx="1" fill="none" stroke={color} strokeWidth="1.6" />
      <rect x="6" y="20" width="16" height="3" rx="1" fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

export default function ShopPlanPicker() {
  const [engine, setEngine] = useState('batch');
  const [allowed, setAllowed] = useState(true);
  const [reason, setReason] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchShopPlan()
      .then((data) => {
        setEngine(data.engine === 'unit_wise' ? 'unit_wise' : 'batch');
        setAllowed(data.toggle_allowed !== false);
        setReason(data.toggle_lock_reason || null);
      })
      .catch(() => {});
  }, []);

  const editor = currentShopPlanEditor();
  const canToggle = editor.allowed && editor.id != null && allowed && !saving;
  const active = engine === 'unit_wise' ? 'unit_wise' : 'batch';
  const activeTitle = active === 'unit_wise' ? 'Unit-wise schedule' : 'Batch schedule';
  const lockedTitle = active === 'unit_wise' ? 'Batch schedule' : 'Unit-wise schedule';

  const onChange = async (next) => {
    if (next === active || saving) return;
    if (!editor.allowed || editor.id == null) {
      message.error('Only admin or manufacturing coordinator can update the shop plan');
      return;
    }
    if (!allowed) {
      message.warning(reason || 'An operation is still in progress. Complete it before switching the shop plan.');
      return;
    }
    const nextTitle = next === 'unit_wise' ? 'Unit-wise Scheduling' : 'Batch Scheduling';
    Modal.confirm({
      title: `Switch the shopfloor to ${nextTitle}?`,
      content: 'The shop plan changes only if you choose Yes. Schedules are not rewritten.',
      okText: 'YES',
      cancelText: 'CANCEL',
      onOk: async () => {
        setSaving(true);
        try {
          const data = await saveShopPlan(next, editor.id);
          setEngine(data.engine === 'unit_wise' ? 'unit_wise' : 'batch');
          setAllowed(data.toggle_allowed !== false);
          setReason(data.toggle_lock_reason || null);
          message.success(shopPlanBanner(data.engine));
        } catch (error) {
          message.error(error.message || 'Could not switch the shop plan');
          throw error;
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <section
      style={{
        marginBottom: 16,
        padding: 16,
        background: '#fff',
        border: '1px solid #e6e8ee',
        borderRadius: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <SettingOutlined style={{ color: '#1677ff', fontSize: 18, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 650, color: '#1f1f1f' }}>Shopfloor Execution Mode</div>
            <div style={{ fontSize: 13, color: '#8c8c8c', marginTop: 2 }}>
              Choose which schedule the shopfloor should follow. Only one mode can be active at a time.
            </div>
          </div>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: '#f6ffed',
            border: '1px solid #b7eb8f',
            color: '#389e0d',
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#52c41a' }} />
          {active === 'unit_wise' ? 'Unit-wise mode active' : 'Batch mode active'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {MODES.map((mode) => {
          const selected = active === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => onChange(mode.value)}
              disabled={saving}
              aria-pressed={selected}
              style={{
                textAlign: 'left',
                cursor: canToggle || selected ? 'pointer' : 'not-allowed',
                padding: 14,
                borderRadius: 10,
                border: selected ? '1.5px solid #1677ff' : '1px solid #e6e8ee',
                background: selected ? '#f5f9ff' : '#fff',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      marginTop: 4,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      border: selected ? '5px solid #1677ff' : '1.5px solid #bfbfbf',
                      boxSizing: 'border-box',
                      flex: '0 0 auto',
                    }}
                  />
                  <ModeIcon kind={mode.icon} active={selected} />
                  <div>
                    <div style={{ fontWeight: 650, color: '#1f1f1f' }}>{mode.title}</div>
                    <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>{mode.description}</div>
                  </div>
                </div>
                <span
                  style={{
                    alignSelf: 'flex-start',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    color: selected ? '#1677ff' : '#8c8c8c',
                    background: selected ? '#e6f4ff' : '#f5f5f5',
                  }}
                >
                  {selected ? 'Selected' : 'Available'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {mode.points.map((point) => (
                    <span key={point} style={{ fontSize: 12, color: '#595959', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <CheckCircleFilled style={{ color: '#52c41a', fontSize: 12 }} />
                      {point}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: '#8c8c8c', display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <LockOutlined />
                  {mode.lockedLabel}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 8,
          background: '#f0f7ff',
          color: '#595959',
          fontSize: 13,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <InfoCircleOutlined style={{ color: '#1677ff', marginTop: 3 }} />
        <span>
          Currently, the shopfloor is following the <strong>{activeTitle}</strong>. {lockedTitle} is locked.
          {!editor.allowed && ' Only admin or manufacturing coordinator can update the shop plan.'}
          {editor.allowed && !allowed && reason ? ` ${reason}` : ''}
        </span>
      </div>
    </section>
  );
}

export function ShopPlanActualNote() {
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    fetchShopPlan()
      .then((data) => setEngine(data.engine === 'unit_wise' ? 'unit_wise' : 'batch'))
      .catch(() => setEngine(null));
  }, []);

  if (engine !== 'unit_wise') return null;

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '8px 12px',
        background: '#f9f0ff',
        border: '1px solid #d3adf7',
        borderRadius: 6,
        color: '#531dab',
        fontSize: 13,
      }}
    >
      Shop floor follows unit-wise. This Actual chart is the batch plan. Use Unit Scheduling for the live plan.
    </div>
  );
}
