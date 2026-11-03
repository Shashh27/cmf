/**
 * Info control explaining that the shop floor can run only one live schedule.
 */
import React from 'react';
import { Tooltip } from 'antd';
import { InfoCircleFilled } from '@ant-design/icons';

const COPY = {
  batch: {
    title: 'One shop-floor schedule',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>
          Operators can follow only one live schedule at a time.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          If they start jobs from this Batch plan, Unit-wise job cards are blocked until that work is finished or submitted.
        </p>
        <p style={{ margin: 0 }}>
          Do not mix Batch and Unit-wise for the same in-progress part. Use Unit Scheduling if the shop should run unit-wise instead.
        </p>
      </>
    ),
  },
  unit_wise: {
    title: 'One shop-floor schedule',
    body: (
      <>
        <p style={{ margin: '0 0 8px' }}>
          Operators can follow only one live schedule at a time.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          If they start jobs from this Unit-wise plan, Batch job cards and Planned / Actual Update are blocked until that work is finished or submitted.
        </p>
        <p style={{ margin: 0 }}>
          Do not mix Unit-wise and Batch for the same in-progress part. Keep updating this plan from Process Planning.
        </p>
      </>
    ),
  },
};

export default function OneScheduleInfoButton({ engine = 'batch' }) {
  const copy = COPY[engine] || COPY.batch;
  return (
    <Tooltip
      placement="bottomLeft"
      mouseEnterDelay={0.1}
      overlayStyle={{ maxWidth: 360 }}
      title={
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{copy.title}</div>
          {copy.body}
        </div>
      }
    >
      <InfoCircleFilled
        aria-label={copy.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          fontSize: 20,
          color: '#1677ff',
          cursor: 'help',
          verticalAlign: 'middle',
        }}
      />
    </Tooltip>
  );
}
