import React from 'react';

export const INVENTORY_OVERVIEW_TABLE_CLASS = 'inventory-overview-table';

/** Colors matched to OMS table — light blue header, white rows */
export const INVENTORY_TABLE_COLORS = {
  headerBg: '#e6f0ff',
  headerText: '#374151',
  headerBorder: '#91caff',
  rowBg: '#ffffff',
  rowHoverBg: '#f5f5f5',
  rowText: '#1f2937',
  cellBorder: '#c5cdd8',
  outerBorder: '#b8c4d9',
};

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

export const inventoryTableComponents = {
  header: {
    cell: (props) => (
      <th
        {...props}
        style={{
          ...(props.style || {}),
          background: 'linear-gradient(to bottom, #f0f5ff, #e6f0ff)',
          color: INVENTORY_TABLE_COLORS.headerText,
          fontWeight: 600,
          fontSize: 13,
          border: `1px solid ${INVENTORY_TABLE_COLORS.headerBorder}`,
          borderBottom: '2px solid #1890ff',
          borderRadius: 0,
          padding: '6px 10px',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      />
    ),
  },
  body: {
    cell: (props) => (
      <td
        {...props}
        style={{
          ...(props.style || {}),
          background: INVENTORY_TABLE_COLORS.rowBg,
          color: INVENTORY_TABLE_COLORS.rowText,
          fontSize: 12,
          border: `1px solid ${INVENTORY_TABLE_COLORS.cellBorder}`,
          padding: '4px 10px',
          lineHeight: 1.35,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          verticalAlign: 'middle',
        }}
      />
    ),
    row: (props) => (
      <tr
        {...props}
        onMouseEnter={(e) => {
          props.onMouseEnter?.(e);
          e.currentTarget.querySelectorAll('td').forEach((td) => {
            td.style.background = INVENTORY_TABLE_COLORS.rowHoverBg;
          });
        }}
        onMouseLeave={(e) => {
          props.onMouseLeave?.(e);
          e.currentTarget.querySelectorAll('td').forEach((td) => {
            td.style.background = INVENTORY_TABLE_COLORS.rowBg;
          });
        }}
      />
    ),
  },
};

/** Scoped styles for sorter icons + sharp table shell */
export const InventoryOverviewTableStyles = () => (
  <style>{`
    .${INVENTORY_OVERVIEW_TABLE_CLASS}.ant-table-wrapper .ant-table,
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-container,
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-content table {
      border-radius: 0 !important;
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table {
      border: 1px solid ${INVENTORY_TABLE_COLORS.outerBorder};
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-thead > tr > th::before {
      display: none !important;
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-column-sorter {
      color: rgba(0, 0, 0, 0.35);
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-column-sorter-up.active,
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-column-sorter-down.active {
      color: #1890ff;
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-pagination {
      margin-top: 12px;
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-tbody > tr > td {
      height: 32px;
      background-color: #ffffff !important;
    }
    .${INVENTORY_OVERVIEW_TABLE_CLASS} .ant-table-tbody > tr:hover > td {
      background-color: #f5f5f5 !important;
    }
  `}</style>
);

const DEFAULT_MIN_WIDTHS = {
  sl_no: 52,
  action: 150,
  actions: 150,
  document: 110,
  date: 128,
  default: 108,
};

export const applyInventoryOverviewColumns = (columns) =>
  columns.map((column) => {
    const next = { ...column };
    delete next.className;
    delete next.width;
    delete next.fixed;

    const isDateCol =
      (typeof column.dataIndex === 'string' && DATE_KEYS.has(column.dataIndex))
      || ['approved_at', 'collected_at', 'returned_at', 'issue_raised_at', 'created_at'].includes(column.key);

    if (!next.minWidth) {
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
  scrollX = 1200,
  pagination,
  loading = false,
  rowKey = 'id',
  dataSource,
  columns,
}) => ({
  bordered: true,
  size: 'small',
  className: INVENTORY_OVERVIEW_TABLE_CLASS,
  tableLayout: 'auto',
  rowKey,
  dataSource,
  columns: applyInventoryOverviewColumns(columns),
  loading,
  pagination,
  scroll: { x: scrollX },
  components: inventoryTableComponents,
});
