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
  const [modalVisible, setModalVisible] = useState(false);

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
    <>
      <button
        type="button"
        onClick={() => setModalVisible(true)}
        style={{
          position: 'fixed',
          top: 80,
          right: 20,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          background: '#fff',
          border: '1px solid #e6e8ee',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: '#1f1f1f',
        }}
      >
        <SettingOutlined style={{ color: '#1677ff', fontSize: 16 }} />
        <span>{active === 'unit_wise' ? 'Unit-wise' : 'Batch'}</span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#52c41a',
          }}
        />
      </button>

      <Modal
        title="Shopfloor Execution Mode"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        width={700}
        centered
        style={{ top: 80 }}
        getContainer={() => document.body}
      >
        <div style={{ marginBottom: 16, fontSize: 14, color: '#8c8c8c', lineHeight: 1.5 }}>
          Choose which schedule the shopfloor should follow. Only one mode can be active at a time.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {MODES.map((mode) => {
            const selected = active === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  onChange(mode.value);
                  setModalVisible(false);
                }}
                disabled={saving}
                aria-pressed={selected}
                style={{
                  textAlign: 'left',
                  cursor: canToggle || selected ? 'pointer' : 'not-allowed',
                  padding: 16,
                  borderRadius: 12,
                  border: selected ? '2px solid #1677ff' : '1px solid #e6e8ee',
                  background: selected ? '#f5f9ff' : '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  transition: 'all 0.2s',
                  minHeight: 140,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        marginTop: 3,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        border: selected ? '5px solid #1677ff' : '2px solid #bfbfbf',
                        boxSizing: 'border-box',
                        flex: '0 0 auto',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 650, color: '#1f1f1f', fontSize: 15, marginBottom: 4 }}>{mode.title}</div>
                      <div style={{ fontSize: 13, color: '#8c8c8c', lineHeight: 1.4 }}>{mode.description}</div>
                    </div>
                  </div>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: selected ? '#1677ff' : '#8c8c8c',
                      background: selected ? '#e6f4ff' : '#f5f5f5',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {selected ? 'Selected' : 'Available'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {mode.points.map((point) => (
                    <span key={point} style={{ fontSize: 13, color: '#595959', display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.4 }}>
                      <CheckCircleFilled style={{ color: '#52c41a', fontSize: 13, flexShrink: 0, marginTop: 1 }} />
                      <span>{point}</span>
                    </span>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                  <span style={{ fontSize: 12, color: '#8c8c8c', display: 'flex', gap: 4, alignItems: 'center' }}>
                    <LockOutlined />
                    {mode.lockedLabel}
                  </span>
                  <ModeIcon kind={mode.icon} active={selected} />
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            marginTop: 20,
            padding: '12px 16px',
            borderRadius: 8,
            background: '#f0f7ff',
            color: '#595959',
            fontSize: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
            lineHeight: 1.5,
          }}
        >
          <InfoCircleOutlined style={{ color: '#1677ff', fontSize: 16, marginTop: 2, flexShrink: 0 }} />
          <span>
            Currently, the shopfloor is following the <strong>{activeTitle}</strong>. {lockedTitle} is locked.
            {!editor.allowed && ' Only admin or manufacturing coordinator can update the shop plan.'}
            {editor.allowed && !allowed && reason ? ` ${reason}` : ''}
          </span>
        </div>
      </Modal>
    </>
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
