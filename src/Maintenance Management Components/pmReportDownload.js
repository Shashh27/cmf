import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatDateTime, formatDate, machineLabel, itemTypeShort, frequencySummary,
} from './pmUtils';

const BRAND = 'CMF DIGITALIZATION - CMTI';
const HEADER_FILL = 'FF4A6CF7';
const HEADER_FONT = 'FFFFFFFF';
const ALT_FILL = 'FFF8FAFC';

function thinBorder() {
  const s = { style: 'thin', color: { argb: 'FFE5E7EB' } };
  return { top: s, left: s, bottom: s, right: s };
}

function triggerDownload(buffer, filename, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPmExcel({ subtitle, metaLines = [], sections, filename }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CMF PM Module';
  const ws = wb.addWorksheet('Report');
  const maxCols = Math.max(...sections.map((s) => s.headers.length), 1);
  let row = 1;

  ws.mergeCells(row, 1, row, maxCols);
  const titleCell = ws.getCell(row, 1);
  titleCell.value = BRAND;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF111827' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  row += 1;

  ws.mergeCells(row, 1, row, maxCols);
  const subCell = ws.getCell(row, 1);
  subCell.value = subtitle;
  subCell.font = { size: 12, bold: true, color: { argb: 'FF4A6CF7' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  row += 2;

  metaLines.forEach((line) => {
    ws.mergeCells(row, 1, row, maxCols);
    ws.getCell(row, 1).value = line;
    ws.getCell(row, 1).font = { size: 10, color: { argb: 'FF6B7280' } };
    row += 1;
  });
  row += 1;

  sections.forEach((section, si) => {
    if (section.title) {
      ws.mergeCells(row, 1, row, section.headers.length);
      ws.getCell(row, 1).value = section.title;
      ws.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FF111827' } };
      row += 1;
    }

    const headerRow = ws.getRow(row);
    section.headers.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, color: { argb: HEADER_FONT }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder();
    });
    row += 1;

    section.rows.forEach((dataRow, ri) => {
      const r = ws.getRow(row);
      dataRow.forEach((val, ci) => {
        const cell = r.getCell(ci + 1);
        cell.value = val ?? '—';
        cell.font = { size: 10 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.border = thinBorder();
        if (ri % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_FILL } };
        }
      });
      row += 1;
    });

    if (si < sections.length - 1) row += 1;
  });

  ws.columns.forEach((col) => {
    let max = 12;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      if (len > max) max = Math.min(len + 2, 48);
    });
    col.width = max;
  });

  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function downloadPmPdf({ subtitle, metaLines = [], sections, filename }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(17, 24, 39);
  doc.text(BRAND, pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(12);
  doc.setTextColor(74, 108, 247);
  doc.text(subtitle, pageWidth / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  metaLines.forEach((line) => {
    doc.text(line, 14, y);
    y += 5;
  });
  y += 3;

  sections.forEach((section, si) => {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 14;
    }

    if (section.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(17, 24, 39);
      doc.text(section.title, 14, y);
      y += 6;
    }

    autoTable(doc, {
      head: [section.headers],
      body: section.rows.map((r) => r.map((v) => (v == null || v === '' ? '—' : String(v)))),
      startY: y,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [74, 108, 247], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14, right: 14 },
      theme: 'grid',
    });

    y = (doc.lastAutoTable?.finalY ?? y) + (si < sections.length - 1 ? 10 : 0);
  });

  doc.setFontSize(7);
  doc.setTextColor(156, 163, 175);
  doc.text('Generated by CMF Preventive Maintenance Module', pageWidth - 14, pageHeight - 8, { align: 'right' });
  doc.save(`${filename}.pdf`);
}

export function buildChecklistsReportConfig(checklists, metaLines = []) {
  const rows = [];
  let sl = 0;
  checklists.forEach((c) => {
    const items = c.items || [];
    if (!items.length) {
      sl += 1;
      rows.push([
        sl, c.name, c.description || '—', 0, '—', '—', '—', '—', '—', '—', '—', formatDateTime(c.created_at),
      ]);
      return;
    }
    items.forEach((item, idx) => {
      sl += 1;
      rows.push([
        sl,
        c.name,
        c.description || '—',
        idx + 1,
        item.item_text || '—',
        itemTypeShort(item.item_type),
        item.expected_value || '—',
        item.frequency_type || '—',
        item.interval_unit || (item.trigger_hours != null ? 'Hours' : '—'),
        item.interval_value ?? item.trigger_hours ?? '—',
        item.remarks || '—',
        formatDateTime(c.created_at),
      ]);
    });
  });

  return {
    subtitle: 'Preventive Maintenance — Checklists Report',
    metaLines: [
      ...metaLines,
      `Total checklists: ${checklists.length}`,
      `Generated on: ${new Date().toLocaleString('en-IN')}`,
    ],
    sections: [{
      headers: [
        'SL NO', 'CHECKLIST', 'DESCRIPTION', 'CP #', 'CHECKPOINT', 'TYPE',
        'EXPECTED', 'FREQUENCY', 'UNIT', 'VALUE', 'REMARKS', 'CREATED AT',
      ],
      rows,
    }],
    filename: `pm-checklists-${Date.now()}`,
  };
}

export function buildAssignmentsReportConfig(assignments, machines = [], metaLines = []) {
  const rows = [];
  let sl = 0;
  assignments.forEach((a) => {
    const machine = machines.find((m) => m.id === a.machine_id);
    const machineName = machineLabel(machine) || a.machine_label || `Machine ${a.machine_id}`;
    const checklistName = a.checklist?.name || a.checklistName || '—';
    (a.assignment_items || []).forEach((ai) => {
      sl += 1;
      const ci = ai.checklist_item;
      rows.push([
        sl,
        machineName,
        checklistName,
        ci?.item_text || '—',
        itemTypeShort(ci?.item_type),
        frequencySummary(ci),
        ai.is_required ? 'Yes' : 'No',
        formatDate(a.assigned_at),
        formatDate(ai.schedule?.next_due_date),
        formatDate(ai.schedule?.last_completed_date),
      ]);
    });
  });

  return {
    subtitle: 'Preventive Maintenance — Machine Assignments Report',
    metaLines: [
      ...metaLines,
      `Total assignment rows: ${rows.length}`,
      `Generated on: ${new Date().toLocaleString('en-IN')}`,
    ],
    sections: [{
      headers: [
        'SL NO', 'MACHINE', 'CHECKLIST', 'CHECKPOINT', 'TYPE', 'FREQUENCY',
        'REQUIRED', 'ASSIGNED ON', 'NEXT DUE', 'LAST COMPLETED',
      ],
      rows,
    }],
    filename: `pm-assignments-${Date.now()}`,
  };
}

export function buildSubmissionsReportConfig(grouped, checklistNameFor, metaLines = []) {
  const summaryRows = grouped.map((g, i) => [
    i + 1,
    g.machine_label || '—',
    checklistNameFor(g),
    g.checkpointCount,
    g.operators || '—',
    formatDateTime(g.submitted_at),
  ]);

  const detailRows = [];
  grouped.forEach((g) => {
    g.items
      .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
      .forEach((s) => {
        detailRows.push([
          g.machine_label || '—',
          checklistNameFor(g),
          s.checklist_item?.item_text || '—',
          itemTypeShort(s.checklist_item?.item_type),
          s.response_value || '—',
          s.operator_name || (s.operator_id ? `User #${s.operator_id}` : '—'),
          formatDateTime(s.submitted_at),
          s.operator_comments || '—',
        ]);
      });
  });

  return {
    subtitle: 'Preventive Maintenance — Submission History Report',
    metaLines: [
      ...metaLines,
      `Summary groups: ${grouped.length}`,
      `Total checkpoint submissions: ${detailRows.length}`,
      `Generated on: ${new Date().toLocaleString('en-IN')}`,
    ],
    sections: [
      {
        title: 'Summary',
        headers: ['SL NO', 'MACHINE', 'CHECKLIST', 'CHECKPOINTS', 'OPERATOR', 'LATEST SUBMITTED AT'],
        rows: summaryRows,
      },
      {
        title: 'Checkpoint Details',
        headers: ['MACHINE', 'CHECKLIST', 'CHECKPOINT', 'TYPE', 'RESPONSE', 'OPERATOR', 'SUBMITTED AT', 'REMARKS'],
        rows: detailRows,
      },
    ],
    filename: `pm-submission-history-${Date.now()}`,
  };
}
