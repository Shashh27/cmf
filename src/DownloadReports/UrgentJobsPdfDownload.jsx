import React, { useState } from 'react';
import { Button, Dropdown, message } from 'antd';
import { DownloadOutlined, FilePdfOutlined, FileExcelOutlined } from '@ant-design/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';

const fmt = (val) => (val == null || val === '' ? '—' : String(val));

const formatWhen = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-GB', { hour12: false });
};

const fromDisplay = (row) => {
  if (row?.from_name) return row.from_name;
  if (row?.created_by != null && row?.mc_id != null && Number(row.created_by) !== Number(row.mc_id)) {
    return row.created_by_name || '—';
  }
  return row?.created_by_name || '—';
};

const logReviewLabel = (row) => {
  if (row?.mc_decision === 'approved') return `Approved by ${row.mc_decision_by || 'MC'}`;
  if (row?.supervisor_decision === 'approved') return `Approved by ${row.supervisor_decision_by || 'Supervisor'}`;
  if (row?.mc_decision === 'rejected') return `Rejected by ${row.mc_decision_by || 'MC'}`;
  if (row?.supervisor_decision === 'rejected') return `Rejected by ${row.supervisor_decision_by || 'Supervisor'}`;
  if (row?.completed_at) return 'Pending';
  return '—';
};

const COLUMNS = [
  'SL NO',
  'From',
  'Project No',
  'Project Name',
  'Description',
  'Operator',
  'Machine',
  'Center',
  'Duration From',
  'Duration To',
  'Log Review',
  'Remarks',
  'Status',
  'Assigned By',
  'Created At',
];

const mapRows = (rows) => (rows || []).map((row, index) => [
  index + 1,
  fromDisplay(row),
  fmt(row.order_no || row.project_no),
  fmt(row.project_name),
  fmt(row.description),
  fmt(row.operator_name),
  fmt(row.machine_name),
  fmt(row.from_dept),
  formatWhen(row.activated_at),
  formatWhen(row.completed_at),
  logReviewLabel(row),
  fmt(row.mc_remark || row.mc_decision_remark || row.supervisor_decision_remark),
  fmt(row.status),
  fmt(row.mc_name),
  formatWhen(row.created_at),
]);

const exportPDF = (rows, label) => {
  if (!rows?.length) {
    message.warning('No data to export');
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;
  const generatedAt = new Date().toLocaleString();

  const drawHeader = () => {
    doc.setFillColor(30, 64, 175);
    doc.rect(margin, 8, pageW - margin * 2, 10, 'F');
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('RIGHT NOW JOBS - REPORT', pageW / 2, 14.5, { align: 'center' });

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${generatedAt}`, margin, 22);
    doc.text(`Total Logs: ${rows.length}  |  ${label}`, pageW / 2, 22, { align: 'center' });
    doc.text('CMF Digitization', pageW - margin, 22, { align: 'right' });

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.3);
    doc.line(margin, 24, pageW - margin, 24);
  };

  drawHeader();

  autoTable(doc, {
    startY: 27,
    head: [COLUMNS],
    body: mapRows(rows),
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: [30, 64, 175],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    margin: { left: margin, right: margin },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) drawHeader();
      const pageH = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Page ${data.pageNumber}`, pageW / 2, pageH - 6, { align: 'center' });
    },
  });

  doc.save(`RightNow_Jobs_Logs_${new Date().toISOString().slice(0, 10)}.pdf`);
};

const exportExcel = async (rows, label) => {
  if (!rows?.length) {
    message.warning('No data to export');
    return;
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Right Now Jobs');

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell('A1');
  title.value = 'RIGHT NOW JOBS - LOGS REPORT';
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const sub = ws.getCell('A2');
  sub.value = `Generated: ${new Date().toLocaleString()}   |   ${label}   |   Records: ${rows.length}`;
  sub.font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  sub.alignment = { horizontal: 'center' };
  ws.getRow(2).height = 16;

  ws.addRow([]);

  const hdr = ws.addRow(COLUMNS);
  hdr.height = 20;
  hdr.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF93C5FD' } },
      bottom: { style: 'thin', color: { argb: 'FF93C5FD' } },
      left: { style: 'thin', color: { argb: 'FF93C5FD' } },
      right: { style: 'thin', color: { argb: 'FF93C5FD' } },
    };
  });

  mapRows(rows).forEach((values, idx) => {
    const dr = ws.addRow(values);
    dr.height = 18;
    const isAlt = idx % 2 === 1;
    dr.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? 'FFEFF6FF' : 'FFFFFFFF' } };
      cell.border = {
        top: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        left: { style: 'hair', color: { argb: 'FFD1D5DB' } },
        right: { style: 'hair', color: { argb: 'FFD1D5DB' } },
      };
    });
  });

  const widths = [8, 16, 14, 20, 28, 14, 18, 12, 18, 18, 18, 18, 12, 14, 18];
  COLUMNS.forEach((_, i) => {
    ws.getColumn(i + 1).width = widths[i] || 14;
  });

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `RightNow_Jobs_Logs_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};

const UrgentJobsPdfDownload = ({ rows, rowCount, getRowsForExport, label = 'All Records' }) => {
  const [loading, setLoading] = useState('');

  const resolveRows = () => {
    if (getRowsForExport) return getRowsForExport() || [];
    return rows || [];
  };

  const resolvedCount = rowCount ?? resolveRows().length;

  const handlePDF = async () => {
    const exportRows = resolveRows();
    if (!exportRows.length) {
      message.warning('No data to export');
      return;
    }
    setLoading('pdf');
    try {
      exportPDF(exportRows, label);
    } catch {
      message.error('PDF export failed');
    } finally {
      setLoading('');
    }
  };

  const handleExcel = async () => {
    const exportRows = resolveRows();
    if (!exportRows.length) {
      message.warning('No data to export');
      return;
    }
    setLoading('excel');
    try {
      await exportExcel(exportRows, label);
    } catch {
      message.error('Excel export failed');
    } finally {
      setLoading('');
    }
  };

  const menuItems = [
    { key: 'pdf', label: 'Download PDF', icon: <FilePdfOutlined style={{ color: '#ef4444' }} />, onClick: handlePDF },
    { key: 'excel', label: 'Download Excel', icon: <FileExcelOutlined style={{ color: '#16a34a' }} />, onClick: handleExcel },
  ];

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']} disabled={!!loading || resolvedCount === 0}>
      <Button icon={<DownloadOutlined />} loading={!!loading} size="middle" style={{ fontSize: 13 }}>
        Download
      </Button>
    </Dropdown>
  );
};

export default UrgentJobsPdfDownload;
