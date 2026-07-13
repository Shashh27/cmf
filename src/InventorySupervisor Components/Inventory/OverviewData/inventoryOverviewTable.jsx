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
  sl_no: 52,
  tool_name: 130,
  tool_range: 100,
  identification_code: 100,
  project: 150,
  product: 130,
  part: 140,
  part_number: 100,
  operation: 140,
  operation_number: 80,
  quantity: 70,
  requested_qty: 80,
  returned_qty: 80,
  tool_issue_qty: 80,
  total_requested_qty: 90,
  status: 100,
  request_status: 100,
  return_status: 110,
  requested_by: 110,
  approved_by: 110,
  collected_by: 110,
  request_created_at: 120,
  request_updated_at: 120,
  return_created_at: 120,
  return_updated_at: 120,
  approved_at: 120,
  collected_at: 120,
  returned_at: 120,
  issue_raised_at: 120,
  action: 100,
  actions: 100,
  document: 90,
  default: 100,
  date: 120,
};

const MULTILINE_KEYS = new Set(['project', 'part', 'operation']);

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
      font-size: 12px !important;
      padding: 6px 8px !important;
      white-space: nowrap;
      text-align: center;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td {
      font-size: 12px !important;
      padding: 6px 8px !important;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      vertical-align: middle;
    }
    .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td.inventory-cell-wrap {
      white-space: normal !important;
      text-align: left;
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
      .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-thead > tr > th {
        font-size: 10px !important;
        padding: 4px 6px !important;
      }
      .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td {
        font-size: 10px !important;
        padding: 4px 6px !important;
      }
    }
    @media (max-width: 480px) {
      .${MODERN_TABLE_CLASS}.ant-table-wrapper .ant-table {
        font-size: 10px;
      }
      .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-thead > tr > th {
        font-size: 9px !important;
        padding: 3px 4px !important;
      }
      .${MODERN_TABLE_CLASS}.${COMPACT_TABLE_CLASS} .ant-table-tbody > tr > td {
        font-size: 9px !important;
        padding: 3px 4px !important;
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
      // Use flexible widths instead of fixed widths for better responsiveness
      if (column.key === 'sl_no') {
        next.width = 60;
      } else if (NO_SORT_KEYS.has(column.key)) {
        next.width = 120;
      } else if (isDateCol) {
        next.width = 140;
      } else {
        // Let other columns expand based on content
        next.width = undefined;
        next.flex = 1;
      }
      
      if (MULTILINE_KEYS.has(column.key)) {
        next.ellipsis = false;
        next.onCell = () => ({ className: 'inventory-cell-wrap' });
      } else {
        next.ellipsis = { showTitle: true };
      }
    } else {
      // Non-compact mode: use minWidth to allow expansion based on content
      if (column.key === 'sl_no') {
        next.minWidth = 60;
      } else if (NO_SORT_KEYS.has(column.key)) {
        next.minWidth = 120;
      } else if (isDateCol) {
        next.minWidth = 140;
      } else {
        next.minWidth = 100;
        next.flex = 1;
      }
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

  const processedColumns = applyInventoryOverviewColumns(columns, { compact });
  
  // With flexible columns, use a reasonable scroll width or let table auto-size
  const computedScrollX = compact
    ? 'max-content' // Let table expand based on content
    : scrollX;

  const scroll = scrollY
    ? { x: computedScrollX, y: scrollY }
    : { x: computedScrollX };

  return {
    bordered: true,
    size: 'small',
    className: tableClass,
    tableLayout: 'auto', // Use auto layout for flexible column sizing
    rowKey,
    dataSource,
    columns: processedColumns,
    loading,
    pagination: pagination ? { placement: 'bottom', responsive: true, ...pagination } : pagination,
    scroll,
    style: { width: '100%' },
  };
};
