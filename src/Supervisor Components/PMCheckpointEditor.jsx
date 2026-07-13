import React from 'react';
import { Input, Select, InputNumber, Button, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { FREQUENCY_TYPES, INTERVAL_UNITS, ITEM_TYPES, PM_T } from './pmUtils';

const { TextArea } = Input;

/**
 * Reusable checkpoint row editor for create / edit checklist modals.
 * Required/Optional is configured at machine assignment — not here.
 */
const CheckpointEditorTable = ({ checkpoints, onChange, onRemove, minRows = 1 }) => {
  const update = (id, patch) => {
    onChange(checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <div style={{ border: `1px solid ${PM_T.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '36px 1.4fr 100px 100px 120px 80px 80px 90px 1fr 36px',
          gap: 8,
          padding: '8px 10px',
          background: '#fafafa',
          fontSize: 11,
          fontWeight: 600,
          color: PM_T.textMid,
        }}
      >
        <span>#</span>
        <span>Checkpoint *</span>
        <span>Type *</span>
        <span>Expected</span>
        <span>Frequency *</span>
        <span>Unit</span>
        <span>Value</span>
        <span>Hours</span>
        <span>Remarks</span>
        <span />
      </div>

      {checkpoints.map((item, index) => (
        <div
          key={item.id}
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1.4fr 100px 100px 120px 80px 80px 90px 1fr 36px',
            gap: 8,
            padding: '8px 10px',
            alignItems: 'start',
            borderTop: `1px solid ${PM_T.border}`,
            background: index % 2 === 0 ? '#fff' : '#fafafa',
          }}
        >
          <span style={{ paddingTop: 6, fontSize: 12, color: PM_T.textSub }}>{index + 1}</span>

          <Input
            size="small"
            placeholder="Checkpoint description"
            value={item.item_text}
            onChange={(e) => update(item.id, { item_text: e.target.value })}
          />

          <Select
            size="small"
            value={item.item_type}
            options={ITEM_TYPES}
            onChange={(v) => update(item.id, { item_type: v })}
          />

          <Input
            size="small"
            placeholder="Expected"
            value={item.expected_value}
            onChange={(e) => update(item.id, { expected_value: e.target.value })}
          />

          <Select
            size="small"
            value={item.frequency_type}
            options={FREQUENCY_TYPES}
            onChange={(v) =>
              update(item.id, {
                frequency_type: v,
                interval_value: v === 'Usage Based' ? null : item.interval_value || 1,
                interval_unit: v === 'Usage Based' ? null : item.interval_unit || 'Week',
                trigger_hours: v === 'Usage Based' ? item.trigger_hours || 100 : null,
              })
            }
          />

          {['Time Based', 'Condition Based'].includes(item.frequency_type) ? (
            <Select
              size="small"
              value={item.interval_unit}
              options={INTERVAL_UNITS.map((u) => ({ value: u, label: u }))}
              onChange={(v) => update(item.id, { interval_unit: v })}
            />
          ) : (
            <span style={{ fontSize: 11, color: PM_T.textMuted, paddingTop: 6 }}>—</span>
          )}

          {['Time Based', 'Condition Based'].includes(item.frequency_type) ? (
            <InputNumber
              size="small"
              min={1}
              style={{ width: '100%' }}
              value={item.interval_value}
              onChange={(v) => update(item.id, { interval_value: v })}
            />
          ) : (
            <span style={{ fontSize: 11, color: PM_T.textMuted, paddingTop: 6 }}>—</span>
          )}

          {item.frequency_type === 'Usage Based' ? (
            <InputNumber
              size="small"
              min={1}
              style={{ width: '100%' }}
              value={item.trigger_hours}
              onChange={(v) => update(item.id, { trigger_hours: v })}
            />
          ) : (
            <span style={{ fontSize: 11, color: PM_T.textMuted, paddingTop: 6 }}>—</span>
          )}

          <Input
            size="small"
            placeholder="Remarks"
            value={item.remarks}
            onChange={(e) => update(item.id, { remarks: e.target.value })}
          />

          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={checkpoints.length <= minRows}
            onClick={() => onRemove(item.id)}
          />
        </div>
      ))}
    </div>
  );
};

export const CheckpointPreviewList = ({ items = [] }) => {
  if (!items.length) {
    return <div style={{ textAlign: 'center', padding: 24, color: PM_T.textMuted }}>No checkpoints</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((item, i) => (
        <div
          key={item.id || i}
          style={{
            border: `1px solid ${PM_T.border}`,
            borderRadius: 8,
            padding: '10px 12px',
            background: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
            <strong style={{ fontSize: 13 }}>
              {i + 1}. {item.item_text}
            </strong>
            <Tag color="blue">{item.item_type}</Tag>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <Tag>{item.frequency_type}</Tag>
            {item.expected_value && <Tag color="geekblue">Expected: {item.expected_value}</Tag>}
            {item.interval_value && item.interval_unit && (
              <Tag color="cyan">
                Every {item.interval_value} {item.interval_unit}
                {item.interval_value > 1 ? 's' : ''}
              </Tag>
            )}
            {item.trigger_hours && <Tag color="orange">{item.trigger_hours} hrs</Tag>}
            {item.remarks && <Tag>{item.remarks}</Tag>}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CheckpointEditorTable;
