import React from 'react';
import { Input, Select, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { ITEM_TYPES, PM_T, PM_FIELD_LIMITS } from './pmUtils';

const { TextArea } = Input;

/**
 * Checkpoint master editor — frequency is set at machine assignment, not here.
 * Code is required and shown first.
 */
const CheckpointEditorTable = ({ checkpoints, onChange, onRemove, minRows = 1 }) => {
  const update = (id, patch) => {
    onChange(checkpoints.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const grid = '36px 90px 1.5fr 110px 120px 1.1fr 36px';

  return (
    <div style={{ border: `1px solid ${PM_T.border}`, borderRadius: 8, overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: grid,
          gap: 8,
          padding: '8px 10px',
          background: '#fafafa',
          fontSize: 11,
          fontWeight: 600,
          color: PM_T.textMid,
        }}
      >
        <span>#</span>
        <span>Code *</span>
        <span>Checkpoint *</span>
        <span>Type *</span>
        <span>Expected / Standard</span>
        <span>Remarks / Method</span>
        <span />
      </div>

      {checkpoints.map((item, index) => (
        <div
          key={item.id}
          style={{
            display: 'grid',
            gridTemplateColumns: grid,
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
            placeholder="CL-01"
            maxLength={PM_FIELD_LIMITS.checkpointCode}
            value={item.item_code}
            onChange={(e) => update(item.id, { item_code: e.target.value.toUpperCase() })}
            style={{ fontWeight: 700 }}
          />

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

          <TextArea
            size="small"
            rows={1}
            placeholder="Method / remarks"
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

export default CheckpointEditorTable;
