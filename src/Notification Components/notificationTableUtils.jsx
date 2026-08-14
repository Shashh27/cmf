import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import {
  getInventoryOverviewTableProps,
  MODERN_TABLE_CLASS,
  COMPACT_TABLE_CLASS,
} from '../InventorySupervisor Components/Inventory/OverviewData/inventoryOverviewTable.jsx';
import {
  disableFutureDates,
  normalizeDateRange,
} from '../InventorySupervisor Components/Inventory/OverviewData/inventoryDateUtils.js';

export { getInventoryOverviewTableProps, MODERN_TABLE_CLASS, COMPACT_TABLE_CLASS };
export { disableFutureDates, normalizeDateRange };

export const NOTIF_TABLE_CLASS = 'notif-table';

/** Modern table with taller header, equal-height body rows */
export const ModernTableStyles = () => (
  <style>{`
    .${MODERN_TABLE_CLASS} .ant-table-thead > tr > th {
      background: linear-gradient(to bottom, #f0f5ff, #e6f0ff) !important;
      font-weight: 600;
      border-bottom: 2px solid #1890ff !important;
      color: #374151;
    }
    .${MODERN_TABLE_CLASS} .ant-table-tbody > tr:hover > td {
      background: #f0f8ff !important;
    }
    .${MODERN_TABLE_CLASS} .ant-table-tbody > tr > td {
      border-bottom: 1px solid #f0f0f0;
    }
    .${MODERN_TABLE_CLASS} .ant-table-thead > tr > th::before {
      display: none !important;
    }
    .${MODERN_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-thead > tr > th,
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-thead > tr > th {
      font-size: 13px !important;
      padding: 12px 10px !important;
      white-space: nowrap;
      line-height: 1.45;
      height: auto !important;
    }
    /* Apply only to real data rows — not Ant Design's hidden measure row */
    .${MODERN_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-tbody > tr:not(.ant-table-measure-row) > td,
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-tbody > tr:not(.ant-table-measure-row) > td {
      font-size: 12px !important;
      padding: 6px 8px !important;
      line-height: 1.35 !important;
      height: 40px !important;
      max-height: 40px !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      vertical-align: middle !important;
      box-sizing: border-box !important;
    }
    .${MODERN_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-tbody > tr:not(.ant-table-measure-row) > td .ant-tag,
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-tbody > tr:not(.ant-table-measure-row) > td .ant-tag {
      font-size: 10px !important;
      line-height: 16px;
      padding: 0 4px;
      margin: 0;
    }
    /* Keep Ant Design column-measure row collapsed (padding !important was inflating row 1) */
    .${MODERN_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-measure-row,
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-measure-row {
      height: 0 !important;
      font-size: 0 !important;
    }
    .${MODERN_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-measure-row > td,
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS}.${NOTIF_TABLE_CLASS} .ant-table-measure-row > td {
      padding: 0 !important;
      border: 0 !important;
      height: 0 !important;
      line-height: 0 !important;
      font-size: 0 !important;
      overflow: hidden !important;
    }
  `}</style>
);

export function getNotificationTableProps(options = {}) {
  const props = getInventoryOverviewTableProps({ compact: true, ...options });
  return {
    ...props,
    className: `${props.className || ''} ${NOTIF_TABLE_CLASS}`.trim(),
  };
}

export function useColumnVisibility(allColumns, storageKey) {
  const selectable = useMemo(
    () =>
      allColumns
        .filter((c) => c.key && c.key !== 'sl_no')
        .map((c) => ({
          label: typeof c.title === 'string' ? c.title : c.columnLabel || c.key,
          value: c.key,
          disabled: c.key === 'acknowledged',
        })),
    [allColumns],
  );

  const defaultKeys = useMemo(
    () => allColumns.filter((c) => c.key).map((c) => c.key),
    [allColumns],
  );

  const [visibleKeys, setVisibleKeys] = useState(() => {
    try {
      const raw = storageKey ? localStorage.getItem(storageKey) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          const allowed = new Set(defaultKeys);
          const next = parsed.filter((k) => allowed.has(k));
          if (!next.includes('acknowledged') && allowed.has('acknowledged')) {
            next.push('acknowledged');
          }
          if (!next.includes('sl_no') && allowed.has('sl_no')) {
            next.unshift('sl_no');
          }
          return next.length ? next : defaultKeys;
        }
      }
    } catch {
      /* ignore */
    }
    return defaultKeys;
  });

  const setAndPersist = (keys) => {
    let next = Array.isArray(keys) ? [...keys] : [];
    if (!next.includes('sl_no') && defaultKeys.includes('sl_no')) next.unshift('sl_no');
    if (!next.includes('acknowledged') && defaultKeys.includes('acknowledged')) {
      next.push('acknowledged');
    }
    setVisibleKeys(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    }
  };

  const visibleColumns = useMemo(
    () => allColumns.filter((c) => !c.key || visibleKeys.includes(c.key)),
    [allColumns, visibleKeys],
  );

  return {
    selectable,
    visibleKeys,
    setVisibleKeys: setAndPersist,
    visibleColumns,
  };
}

export function renderAckCell({ isAck, ackBy, onAcknowledge, disabled }) {
  if (isAck) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          whiteSpace: 'nowrap',
          lineHeight: '20px',
          height: 20,
        }}
      >
        <CheckCircleOutlined style={{ color: 'green', fontSize: 14 }} />
        <span>By: {ackBy || '-'}</span>
      </div>
    );
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        whiteSpace: 'nowrap',
        lineHeight: '20px',
        height: 20,
      }}
    >
      <span style={{ color: 'red' }}>●</span>
      <span>By:</span>
      <Button type="primary" size="small" disabled={disabled} onClick={onAcknowledge}>
        Acknowledge
      </Button>
    </div>
  );
}

export function getOrderAckState(record, role) {
  const userRole = String(role || '').toLowerCase();
  if (userRole.includes('manufacturing')) {
    return { isAck: !!record.mc_is_ack, ackBy: record.mc_ack_by };
  }
  if (userRole.includes('project')) {
    return { isAck: !!record.pc_is_ack, ackBy: record.pc_ack_by };
  }
  if (userRole.includes('admin')) {
    return { isAck: !!record.admin_is_ack, ackBy: record.admin_ack_by };
  }
  return { isAck: !!record.is_ack, ackBy: record.ack_by };
}

export function normalizeUserRole(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('manufacturing')) return 'mc';
  if (r.includes('project')) return 'pc';
  if (r.includes('admin')) return 'admin';
  return r;
}

export function getCurrentUserInfo() {
  try {
    const stored = localStorage.getItem('user');
    if (!stored) return { username: null, role: null };
    const user = JSON.parse(stored);
    return {
      username: user.username || user.user_name || user.name || null,
      role: user.role || user.user_role || null,
    };
  } catch {
    return { username: null, role: null };
  }
}

/** Keep latest callback without putting it in effect/fetch deps (avoids infinite refetch loops). */
export function useLatestCallback(callback) {
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  }, [callback]);
  return ref;
}
