import { downloadPmExcel, downloadPmPdf } from '../../../Maintenance Management Components/pmReportDownload';

export { downloadPmExcel as downloadInventoryExcel, downloadPmPdf as downloadInventoryPdf };

export function buildTransactionHistoryReportConfig(rows, metaLines = []) {
  const exportRows = rows.map((r, i) => [
    i + 1,
    r.tool_name || '—',
    r.tool_range || '—',
    r.identification_code || '—',
    r.project_name || '—',
    r.product_name || '—',
    r.part_name || '—',
    r.part_number || '—',
    r.operation_name || '—',
    r.operation_number || '—',
    r.requested_qty ?? '—',
    r.requested_by || '—',
    formatExportDateTime(r.request_created_at),
    r.approved_by || '—',
    r.request_status && r.request_status.toLowerCase() !== 'pending'
      ? formatExportDateTime(r.request_updated_at) : '—',
    (r.request_status || '—').toUpperCase(),
    r.returned_qty ?? '—',
    r.collected_by || '—',
    r.return_created_at ? formatExportDateTime(r.return_created_at) : '—',
    r.return_status && r.return_status.toLowerCase() === 'collected'
      ? formatExportDateTime(r.return_updated_at) : '—',
    r.return_status ? r.return_status.toUpperCase() : 'NO RETURNS',
  ]);

  return {
    subtitle: 'Inventory — Transaction History Report',
    metaLines: [
      ...metaLines,
      `Total rows: ${exportRows.length}`,
      `Generated on: ${new Date().toLocaleString('en-IN')}`,
    ],
    sections: [{
      headers: [
        'SL NO', 'TOOL NAME', 'TOOL RANGE', 'ID CODE', 'PROJECT', 'PRODUCT',
        'PART', 'PART NO', 'OPERATION', 'OP NO', 'REQ QTY', 'REQUESTED BY',
        'REQUESTED AT', 'APPROVED BY', 'APPROVED AT', 'REQUEST STATUS',
        'RETURNED QTY', 'COLLECTED BY', 'RETURNED AT', 'COLLECTED AT', 'RETURN STATUS',
      ],
      rows: exportRows,
    }],
    filename: `inventory-transaction-history-${Date.now()}`,
  };
}

function formatExportDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
