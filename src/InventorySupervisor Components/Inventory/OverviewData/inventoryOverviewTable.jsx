import React from 'react';

/** Same class name as OMS tables */
export const MODERN_TABLE_CLASS = 'modern-table';
export const COMPACT_TABLE_CLASS = 'inventory-compact-table';
export const INVENTORY_OVERVIEW_TABLE_CLASS = MODERN_TABLE_CLASS;

const textCompare = (a, b) =>
  String(a ?? '')
    .trim()
    .toLowerCase()
    .localeCompare(String(b ?? '').trim().toLowerCase(), undefined, {
      numeric: true,
      sensitivity: 'base',
    });

const numCompare = (a, b) => (Number(a) || 0) - (Number(b) || 0);

const NO_SORT_KEYS = new Set(['action', 'actions', 'document', 'sl_no']);

const NUMERIC_KEYS = new Set([
  'quantity',
  'tool_issue_qty',
  'total_requested_qty',
  'returned_qty',
  'requested_qty',
]);

const DATE_KEYS = new Set([
  'created_at',
  'updated_at',
  'request_created_at',
  'request_updated_at',
  'return_created_at',
  'return_updated_at',
]);

const COMPACT_WIDTHS = {
  sl_no: 40,
  tool_name: 86,
  tool_range: 68,
  identification_code: 68,
  project: 96,
  part: 88,
  operation: 88,
  quantity: 48,
  requested_qty: 52,
  returned_qty: 52,
  status: 76,
  request_status: 76,
  return_status: 84,
  requested_by: 76,
  approved_by: 76,
  collected_by: 76,
  request_created_at: 104,
  return_created_at: 104,
  approved_at: 104,
  collected_at: 104,
  action: 88,
  actions: 88,
  document: 72,
  default: 68,
  date: 104,
};

const dateCompare = (a, b) => {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta - tb;
};

const getCellValue = (record, column) => {
  if (typeof column.sortValue === 'function') {
    return column.sortValue(record);
  }
  const { dataIndex } = column;
  if (!dataIndex) return '';
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((obj, key) => obj?.[key], record);
  }
  return record[dataIndex];
};

/** OMS header + raw-materials density for overview tabs */
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
    .${MODERN_TABLE_CLASS} .ant-table-column-sorter {
      color: rgba(0, 0, 0, 0.35);
    }
    .${MODERN_TABLE_CLASS} .ant-table-column-sorter-up.active,
    .${MODERN_TABLE_CLASS} .ant-table-column-sorter-down.active {
      color: #1890ff;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-thead > tr > th {
      font-size: 11px !important;
      padding: 4px 5px !important;
      white-space: nowrap;
      text-align: center;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td {
      font-size: 11px !important;
      padding: 3px 5px !important;
      line-height: 1.25;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      vertical-align: middle;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td .ant-tag {
      font-size: 10px !important;
      line-height: 16px;
      padding: 0 4px;
      margin: 0;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table {
      width: 100% !important;
    }
    @media (max-width: 768px) {
      .${MODERN_TABLE_CLASS}.ant-table-wrapper .ant-table {
        font-size: 11px;
      }
    }
  `}</style>
);

export const InventoryOverviewTableStyles = ModernTableStyles;

const DEFAULT_MIN_WIDTHS = {
  sl_no: 52,
  action: 150,
  actions: 150,
  document: 110,
  date: 128,
  default: 108,
};

export const applyInventoryOverviewColumns = (columns, { compact = false } = {}) =>
  columns.map((column) => {
    const next = { ...column };
    delete next.className;

    const isDateCol =
      (typeof column.dataIndex === 'string' && DATE_KEYS.has(column.dataIndex))
      || ['approved_at', 'collected_at', 'returned_at', 'issue_raised_at', 'created_at'].includes(column.key);

    if (compact) {
      const w = COMPACT_WIDTHS[column.key]
        || (column.dataIndex && COMPACT_WIDTHS[column.dataIndex])
        || (isDateCol ? COMPACT_WIDTHS.date : COMPACT_WIDTHS.default);
      next.width = w;
      next.ellipsis = true;
    } else if (!next.minWidth && !next.width) {
      if (column.key === 'sl_no') next.minWidth = DEFAULT_MIN_WIDTHS.sl_no;
      else if (NO_SORT_KEYS.has(column.key)) next.minWidth = DEFAULT_MIN_WIDTHS[column.key] || DEFAULT_MIN_WIDTHS.action;
      else if (isDateCol) next.minWidth = DEFAULT_MIN_WIDTHS.date;
      else next.minWidth = DEFAULT_MIN_WIDTHS.default;
    }

    if (NO_SORT_KEYS.has(column.key) || column.sorter === false) {
      return next;
    }

    if (column.sorter) {
      return {
        ...next,
        sortDirections: ['ascend', 'descend'],
        showSorterTooltip: true,
      };
    }

    const isNumeric =
      typeof column.dataIndex === 'string' && NUMERIC_KEYS.has(column.dataIndex);
    const isDate =
      (typeof column.dataIndex === 'string' && DATE_KEYS.has(column.dataIndex))
      || ['approved_at', 'collected_at', 'returned_at', 'issue_raised_at'].includes(column.key);

    return {
      ...next,
      sortDirections: ['ascend', 'descend'],
      showSorterTooltip: true,
      sorter: (a, b) => {
        const av = getCellValue(a, column);
        const bv = getCellValue(b, column);
        if (isNumeric) return numCompare(av, bv);
        if (isDate) return dateCompare(av, bv);
        return textCompare(av, bv);
      },
    };
  });

export const getInventoryOverviewTableProps = ({
  compact = true,
  scrollX = 1200,
  scrollY,
  pagination,
  loading = false,
  rowKey = 'id',
  dataSource,
  columns,
}) => {
  const tableClass = compact
    ? `${MODERN_TABLE_CLASS} ${COMPACT_TABLE_CLASS}`
    : MODERN_TABLE_CLASS;

  const scroll = compact
    ? (scrollY ? { y: scrollY } : undefined)
    : (scrollY ? { x: scrollX, y: scrollY } : { x: scrollX });

  return {
    bordered: true,
    size: 'small',
    className: tableClass,
    tableLayout: compact ? 'fixed' : 'auto',
    rowKey,
    dataSource,
    columns: applyInventoryOverviewColumns(columns, { compact }),
    loading,
    pagination: pagination ? { placement: 'bottom', responsive: true, ...pagination } : pagination,
    scroll,
    style: compact ? { width: '100%' } : undefined,
  };
};
