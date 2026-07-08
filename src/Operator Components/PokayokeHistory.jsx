import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { message, Spin, DatePicker, Button } from 'antd';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CheckCircleFilled, CloseCircleFilled,
  CalendarOutlined, ClockCircleOutlined, ThunderboltOutlined,
  DownloadOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { API_BASE_URL } from '../Config/auth.js';
import cmtisLogo from '../assets/cmtis.png';

/* ─── Month colors ─────────────────────────────────────────────────────── */
const MONTH_COLORS = [
  { bg: '#3b82f6', text: '#fff', label: 'Jan' },
  { bg: '#22c55e', text: '#fff', label: 'Feb' },
  { bg: '#f59e0b', text: '#fff', label: 'Mar' },
  { bg: '#ef4444', text: '#fff', label: 'Apr' },
  { bg: '#a855f7', text: '#fff', label: 'May' },
  { bg: '#06b6d4', text: '#fff', label: 'Jun' },
  { bg: '#ec4899', text: '#fff', label: 'Jul' },
  { bg: '#f97316', text: '#fff', label: 'Aug' },
  { bg: '#84cc16', text: '#fff', label: 'Sep' },
  { bg: '#6366f1', text: '#fff', label: 'Oct' },
  { bg: '#eab308', text: '#fff', label: 'Nov' },
  { bg: '#e53e3e', text: '#fff', label: 'Dec' },
];

const PDF_MARK_CHECK = '3';
const PDF_MARK_CROSS = '7';

const loadImageAsDataUrl = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = src;
  });

function drawPmPdfHeader(doc, pageWidth, { machineDisplay, monthLabel, currentYear, periodLabel, logoDataUrl }) {
  const margin = 10;
  const boxTop = 8;
  const headerH = 28;
  const navy = [30, 58, 95];

  doc.setDrawColor(navy[0], navy[1], navy[2]);
  doc.setLineWidth(0.35);
  doc.rect(margin, boxTop, pageWidth - margin * 2, headerH);

  doc.line(margin + 42, boxTop, margin + 42, boxTop + 18);
  if (logoDataUrl) {
    const logoW = 34;
    const logoH = 12;
    doc.addImage(
      logoDataUrl,
      'PNG',
      margin + (42 - logoW) / 2,
      boxTop + (18 - logoH) / 2,
      logoW,
      logoH,
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('CENTRAL MANUFACTURING FACILITY (CMF)', pageWidth / 2, boxTop + 7, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(55, 65, 81);
  doc.text('ISO 9001-2015', pageWidth / 2, boxTop + 12, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(17, 24, 39);
  doc.text('Preventive Maintenance Checklist', pageWidth / 2, boxTop + 17, { align: 'center' });

  const metaTop = boxTop + 18;
  doc.line(margin, metaTop, pageWidth - margin, metaTop);

  const metaFields = [
    { label: 'Machine', value: machineDisplay, flex: 2 },
    { label: 'Month', value: monthLabel, flex: 1 },
    { label: 'Year', value: String(currentYear), flex: 1 },
    { label: 'Location', value: 'Workshop', flex: 1 },
  ];
  const innerW = pageWidth - margin * 2;
  const totalFlex = metaFields.reduce((sum, field) => sum + field.flex, 0);
  let x = margin;
  metaFields.forEach((field, index) => {
    const colW = (innerW * field.flex) / totalFlex;
    if (index > 0) doc.line(x, metaTop, x, boxTop + headerH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(17, 24, 39);
    doc.text(`${field.label}:`, x + 2, metaTop + 5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(29, 78, 216);
    const labelW = doc.getTextWidth(`${field.label}: `);
    doc.text(String(field.value), x + 2 + labelW, metaTop + 5.5, { maxWidth: colW - labelW - 4 });
    x += colW;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(`Period: ${periodLabel}`, margin, boxTop + headerH + 5);
  doc.setTextColor(0, 0, 0);

  return boxTop + headerH + 9;
}

function buildPdfColumnStyles(pageWidth, dayCount, viewMode) {
  const margin = 10;
  const usable = pageWidth - margin * 2;
  const slW = 8;
  const pointW = viewMode === 'year' || viewMode === 'custom' ? 38 : 46;
  const freqW = viewMode === 'year' || viewMode === 'custom' ? 20 : 24;
  const dayW = Math.max(3.6, (usable - slW - pointW - freqW) / Math.max(dayCount, 1));
  const dayFont = dayW < 4.5 ? 5 : 6;

  const columnStyles = {
    0: { cellWidth: slW, halign: 'center', fontSize: 6 },
    1: { cellWidth: pointW, halign: 'left', fontSize: 6 },
    2: { cellWidth: freqW, halign: 'center', fontSize: 5 },
  };
  for (let i = 0; i < dayCount; i += 1) {
    columnStyles[3 + i] = {
      cellWidth: dayW,
      halign: 'center',
      fontSize: dayFont,
      overflow: 'hidden',
      minCellHeight: 4,
    };
  }
  return { columnStyles, tableWidth: usable, margin };
}

/* ─── Frequency helpers ─────────────────────────────────────────────────── */
const freqLabel = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based')     return item.trigger_hours       ? `Every ${item.trigger_hours} hrs`         : 'Usage Based';
  if (ft === 'condition based') return item.inspection_interval ? `${item.inspection_interval} inspection`  : 'Condition Based';
  return '—';
};

const freqIcon = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based')      return <CalendarOutlined    style={{ fontSize: 11 }} />;
  if (ft === 'usage based')     return <ThunderboltOutlined style={{ fontSize: 11 }} />;
  if (ft === 'condition based') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
};

const freqColor = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based')      return { color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
  if (ft === 'usage based')     return { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' };
  if (ft === 'condition based') return { color: '#059669', bg: '#d1fae5', border: '#6ee7b7' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
};

/* ─── Date utils ────────────────────────────────────────────────────────── */
const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

const parseYMD = (str) => { const [y,m,d] = str.split('-').map(Number); return new Date(y,m-1,d); };

const isPositiveResponse = (responseValue, expectedValue = 'yes') => {
  const val = String(responseValue ?? '').toLowerCase().trim();
  const expected = String(expectedValue ?? 'yes').toLowerCase().trim();
  const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
  const falsy = new Set(['false', 'no', 'n', '0', 'off']);
  if (truthy.has(val) && truthy.has(expected)) return true;
  if (falsy.has(val) && falsy.has(expected)) return true;
  if (truthy.has(val) && falsy.has(expected)) return false;
  if (falsy.has(val) && truthy.has(expected)) return false;
  return val === expected;
};

const hasSubmittedResponse = (sub) =>
  !!(sub.submitted_at ?? sub.completed_at ?? sub.created_at ?? sub.timestamp)
  && sub.response_value != null
  && String(sub.response_value).trim() !== '';

const normalizePmSubmissions = (data) => {
  const rawList = Array.isArray(data)
    ? data
    : Array.isArray(data?.submissions)
      ? data.submissions
      : Array.isArray(data?.data)
        ? data.data
        : [];

  if (rawList.length > 0 && rawList[0].item_responses) {
    return rawList.filter((log) => log.completed_at && (log.item_responses?.length ?? 0) > 0);
  }

  const flatSubmissions = rawList.flatMap((entry) => {
    if (Array.isArray(entry.submissions) && !entry.schedule_id && !entry.assignment_item_id) {
      return (entry.submissions ?? []).map((sub) => ({
        ...sub,
        checklist_id: sub.checklist_id ?? entry.checklist_id,
        checklist_name: sub.checklist_name ?? entry.checklist_name ?? entry.checklist?.name,
      }));
    }
    return [entry];
  });

  return flatSubmissions
    .filter((sub) => hasSubmittedResponse(sub))
    .map((sub) => {
      const item = sub.checklist_item ?? {};
      return {
        completed_at: sub.submitted_at ?? sub.completed_at ?? sub.created_at ?? sub.timestamp,
        checklist_id: sub.checklist_id ?? item.checklist_id ?? sub.checklist?.id,
        checklist_name: sub.checklist_name ?? sub.checklist?.name,
        overall_approval_status: sub.approval_status ?? sub.status ?? null,
        item_responses: [{
          item_id: item.id ?? sub.checklist_item_id ?? sub.item_id ?? sub.assignment_item_id,
          sequence_number: item.sequence_number ?? sub.sequence_number,
          item_text: item.item_text ?? sub.item_text ?? sub.checkpoint_name ?? sub.item_name,
          remarks: item.remarks ?? sub.remarks ?? sub.operator_comments ?? null,
          frequency_type: item.frequency_type ?? sub.frequency_type,
          interval_value: item.interval_value ?? sub.interval_value,
          interval_unit: item.interval_unit ?? sub.interval_unit,
          trigger_hours: item.trigger_hours ?? sub.trigger_hours,
          inspection_interval: item.inspection_interval ?? sub.inspection_interval,
          expected_value: item.expected_value ?? sub.expected_value,
          is_required: item.is_required ?? sub.is_required ?? true,
          approval_status: sub.approval_status ?? sub.status,
          response_value: sub.response_value,
        }],
      };
    })
    .filter((log) => log.completed_at && log.checklist_id != null);
};

/* ─── Column builders ───────────────────────────────────────────────────── */
const buildMonthColumns = (year, month) => {
  const today = toYMD(new Date());
  const days  = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d   = i + 1;
    const ymd = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return { key: ymd, day: d, monthIdx: month, isToday: ymd === today };
  });
};

const buildYearColumns = (year) => {
  const today = toYMD(new Date());
  const cols  = [];
  for (let m = 0; m < 12; m++) {
    const days = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const ymd = `${year}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      cols.push({ key: ymd, day: d, monthIdx: m, isToday: ymd === today, isMonthStart: d === 1 });
    }
  }
  return cols;
};

const buildRangeColumns = (startStr, endStr) => {
  if (!startStr || !endStr) return [];
  const start = parseYMD(startStr);
  const end   = parseYMD(endStr);
  if (start > end) return [];
  const today = toYMD(new Date());
  const cols  = [];
  const cur   = new Date(start);
  while (cur <= end) {
    const ymd = toYMD(cur);
    cols.push({ key: ymd, day: cur.getDate(), monthIdx: cur.getMonth(), isToday: ymd === today, isMonthStart: cur.getDate() === 1 });
    cur.setDate(cur.getDate() + 1);
  }
  return cols;
};

/* ═══════════════════════════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════════════════════════ */
const PokayokeHistory = ({ machineId }) => {
  const [loading, setLoading]         = useState(false);
  const [historyData, setHistoryData] = useState([]);

  const now = new Date();
  const monthLabel = now.toLocaleString('default', { month: 'long' });
  const currentYear = now.getFullYear();

  const machineMeta = useMemo(() => {
    try {
      const m = JSON.parse(localStorage.getItem('selectedMachine') || 'null');
      return {
        make:  m?.make  ?? m?.machine_make  ?? null,
        model: m?.model ?? m?.machine_model ?? null,
        name:  m?.name  ?? m?.machine_name  ?? null,
        code:  m?.code  ?? m?.machine_code  ?? null,
      };
    } catch { return {}; }
  }, []);

  /* ── View state ── */
  const [viewMode,      setViewMode]      = useState('month');
  const [selectedDayjs, setSelectedDayjs] = useState(dayjs());
  const [selMonth,      setSelMonth]      = useState(now.getMonth());
  const [selYear,       setSelYear]       = useState(now.getFullYear());
  const [customStart,   setCustomStart]   = useState(toYMD(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd,     setCustomEnd]     = useState(toYMD(now));

  /* ── Fetch ── */
  const loadHistory = useCallback(async () => {
    if (!machineId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE_URL}/pm/machines/${machineId}/submissions`, {
        headers: { accept: 'application/json' },
      });
      if (!r.ok) throw new Error('Failed to fetch');
      const d = await r.json();
      setHistoryData(normalizePmSubmissions(d));
    } catch (e) {
      message.error('Failed to fetch checklist history');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  /* ── Columns ── */
  const columns = useMemo(() => {
    if (viewMode === 'day') {
      const ymd = selectedDayjs.format('YYYY-MM-DD');
      return [{ key: ymd, day: selectedDayjs.date(), monthIdx: selectedDayjs.month(), isToday: ymd === toYMD(now) }];
    }
    if (viewMode === 'month')  return buildMonthColumns(selYear, selMonth);
    if (viewMode === 'year')   return buildYearColumns(selYear);
    if (viewMode === 'custom') return buildRangeColumns(customStart, customEnd);
    return [];
  }, [viewMode, selectedDayjs, selMonth, selYear, customStart, customEnd]);

  /* ── Group logs ── */
  const grouped = useMemo(() => {
    const colKeySet = new Set(columns.map((c) => c.key));
    const map = {};
    for (const log of historyData) {
      const ymd = toYMD(new Date(log.completed_at));
      if (!colKeySet.has(ymd)) continue;
      const cid   = String(log.checklist_id);
      const cName = log.checklist_name ?? `Checklist #${cid}`;
      if (!map[cid]) map[cid] = { id: cid, name: cName, items: {} };
      const logTs = new Date(log.completed_at).getTime();
      for (const item of (log.item_responses ?? [])) {
        if (item.response_value == null || String(item.response_value).trim() === '') continue;

        const ikey = String(item.item_id);
        if (!map[cid].items[ikey]) {
          map[cid].items[ikey] = {
            id: item.item_id,
            item_text:           item.item_text           ?? `Item #${item.item_id}`,
            remarks:             item.remarks             ?? null,
            sequence_number:      item.sequence_number      ?? null,
            frequency_type:      item.frequency_type      ?? null,
            interval_value:      item.interval_value      ?? null,
            interval_unit:       item.interval_unit       ?? null,
            trigger_hours:       item.trigger_hours       ?? null,
            inspection_interval: item.inspection_interval ?? null,
            expected_value:      item.expected_value      ?? null,
            is_required:         item.is_required         ?? true,
            submissions: {},
          };
        }
        const ex     = map[cid].items[ikey].submissions[ymd];
        const prevTs = ex ? new Date(ex._ts ?? 0).getTime() : 0;
        if (!ex || logTs > prevTs) {
          map[cid].items[ikey].submissions[ymd] = {
            approval_status: item.approval_status ?? log.overall_approval_status ?? null,
            response_value: item.response_value,
            expected_value: item.expected_value,
            _ts: log.completed_at,
          };
        }
      }
    }
    return Object.values(map);
  }, [historyData, columns]);

  /* ── Shared styles ── */
  const TH = { border: '1px solid #d1d5db', padding: '8px 6px', background: '#f3f4f6', fontWeight: 700, fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' };
  const TD = { border: '1px solid #d1d5db', padding: '7px 10px', fontSize: 12, verticalAlign: 'middle' };

  const isYearOrCustom = viewMode === 'year' || viewMode === 'custom';
  const isDay          = viewMode === 'day';
  const cellW          = isDay ? 100 : 28;

  /* ── Column header style ── */
  const colHeaderStyle = (col) => {
    if (isYearOrCustom) {
      // Year / custom: day number colored by its month
      const mc = MONTH_COLORS[col.monthIdx];
      return {
        ...TH,
        width: cellW, minWidth: cellW, padding: '6px 2px',
        background:   col.isToday ? '#1e3a5f' : mc.bg,
        color:        col.isToday ? '#fff'    : mc.text,
        fontWeight:   col.isToday ? 900 : 700,
        fontSize:     10,
        borderLeft:   col.isMonthStart ? '2px solid rgba(0,0,0,0.25)' : undefined,
      };
    }
    if (isDay) {
      return {
        ...TH, width: cellW, minWidth: cellW, padding: '10px 8px', fontSize: 13,
        background: col.isToday ? '#dbeafe' : '#f3f4f6',
        color:      col.isToday ? '#1d4ed8' : '#374151',
        borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
      };
    }
    // Month view
    return {
      ...TH, width: cellW, minWidth: cellW, padding: '6px 2px', fontSize: 11,
      background:   col.isToday ? '#dbeafe' : '#f3f4f6',
      color:        col.isToday ? '#1d4ed8' : '#374151',
      fontWeight:   col.isToday ? 800 : 700,
      borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
    };
  };

  /* ── Cell renderer ── */
  const renderCell = (submissions, col, expectedValue) => {
    const sub = submissions[col.key];
    let content = null;
    if (sub) {
      const ok = isPositiveResponse(sub.response_value, sub.expected_value ?? expectedValue);
      content = ok
        ? <CheckCircleFilled style={{ color: '#22c55e', fontSize: isDay ? 15 : 13 }} />
        : <CloseCircleFilled style={{ color: '#ef4444', fontSize: isDay ? 15 : 13 }} />;
    }

    return (
      <td key={col.key} style={{
        border:    '1px solid #d1d5db',
        borderLeft: col.isMonthStart && isYearOrCustom ? '2px solid rgba(0,0,0,0.2)' : undefined,
        textAlign: 'center', padding: 0,
        width: cellW, minWidth: cellW,
        background: col.isToday ? '#eff6ff' : 'inherit',
      }}>
        <div style={{ width: cellW, height: isDay ? 40 : 32, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {content}
        </div>
      </td>
    );
  };

  const colSpanTotal = 3 + columns.length;
  const monthNames   = MONTH_COLORS.map((m) => m.label);

  const machineDisplay = [machineMeta.make, machineMeta.model].filter(Boolean).join(' — ')
    || machineMeta.name
    || `ID ${machineId}`;

  const getViewPeriodLabel = () => {
    if (viewMode === 'day') return selectedDayjs.format('DD MMM YYYY');
    if (viewMode === 'month') return `${monthNames[selMonth]} ${selYear}`;
    if (viewMode === 'year') return String(selYear);
    if (viewMode === 'custom') return `${customStart} to ${customEnd}`;
    return '';
  };

  const pdfCellMark = (sub, expectedValue) => {
    if (!sub) return '';
    return isPositiveResponse(sub.response_value, sub.expected_value ?? expectedValue) ? PDF_MARK_CHECK : PDF_MARK_CROSS;
  };

  const handleDownloadPDF = async () => {
    try {
      const useLandscape = viewMode === 'year' || viewMode === 'custom' || viewMode === 'month';
      const doc = new jsPDF(useLandscape ? 'l' : 'p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      let logoDataUrl = null;
      try {
        logoDataUrl = await loadImageAsDataUrl(cmtisLogo);
      } catch {
        /* logo optional */
      }
      const startY = drawPmPdfHeader(doc, pageWidth, {
        machineDisplay,
        monthLabel,
        currentYear,
        periodLabel: getViewPeriodLabel(),
        logoDataUrl,
      });

      if (grouped.length === 0) {
        doc.setFontSize(11);
        doc.text('No checklist history found.', pageWidth / 2, startY + 10, { align: 'center' });
        doc.save(`pm_checklist_history_${machineId ?? 'machine'}.pdf`);
        message.success('PDF downloaded successfully');
        return;
      }

      const dayHeaders = columns.map((col) => String(col.day));
      const headRow = ['Sl.', 'Check Point', 'Frequency', ...dayHeaders];
      const { columnStyles, tableWidth, margin } = buildPdfColumnStyles(pageWidth, columns.length, viewMode);

      const bodyRows = [];
      grouped.forEach((checklist, ci) => {
        bodyRows.push([{
          content: `${ci + 1}. ${checklist.name}`,
          colSpan: headRow.length,
          styles: { fillColor: [30, 58, 95], textColor: 255, fontStyle: 'bold', halign: 'left' },
        }]);

        const items = Object.values(checklist.items).sort(
          (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
        );

        items.forEach((item, ii) => {
          const pointLabel = `${item.is_required ? '* ' : ''}${item.item_text}${
            item.expected_value ? `\nExpected: ${item.expected_value}` : ''
          }`;
          bodyRows.push([
            `${ii + 1}.`,
            pointLabel,
            freqLabel(item),
            ...columns.map((col) => pdfCellMark(item.submissions[col.key], item.expected_value)),
          ]);
        });
      });

      autoTable(doc, {
        startY,
        margin: { left: margin, right: margin },
        tableWidth,
        head: [headRow],
        body: bodyRows,
        styles: {
          fontSize: viewMode === 'year' || viewMode === 'custom' ? 5 : 6,
          cellPadding: 1,
          overflow: 'linebreak',
          valign: 'middle',
          lineWidth: 0.1,
          lineColor: [209, 213, 219],
        },
        headStyles: {
          fillColor: [243, 244, 246],
          textColor: [30, 58, 95],
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 6,
          cellPadding: 0.8,
          overflow: 'hidden',
          minCellHeight: 5,
        },
        columnStyles,
        didParseCell: (data) => {
          if (data.section === 'head' && data.column.index >= 3) {
            data.cell.styles.overflow = 'hidden';
            data.cell.styles.halign = 'center';
            data.cell.styles.minCellHeight = 5;
          }
          if (data.section === 'body' && data.column.index >= 3) {
            const text = data.cell.raw;
            if (text === PDF_MARK_CHECK || text === PDF_MARK_CROSS) {
              data.cell.styles.font = 'ZapfDingbats';
              data.cell.styles.fontSize = 7;
              data.cell.styles.textColor = text === PDF_MARK_CHECK ? [34, 197, 94] : [239, 68, 68];
              data.cell.styles.halign = 'center';
              data.cell.styles.valign = 'middle';
              data.cell.styles.overflow = 'hidden';
            }
          }
        },
      });

      doc.save(`pm_checklist_history_${machineId ?? 'machine'}.pdf`);
      message.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF error:', error);
      message.error('Failed to generate PDF');
    }
  };

  /* ── Legend (top-left) ── */
  const legend = (
    <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      {[
        { icon: <CheckCircleFilled style={{ color: '#22c55e', fontSize: 13 }} />, label: 'Conforming' },
        { icon: <CloseCircleFilled style={{ color: '#ef4444', fontSize: 13 }} />, label: 'Non-conforming' },
        { icon: <CalendarOutlined style={{ fontSize: 13, color: '#0284c7' }} />, label: 'Time based' },
        { icon: <ThunderboltOutlined style={{ fontSize: 13, color: '#7c3aed' }} />, label: 'Usage based' },
        { icon: <ClockCircleOutlined style={{ fontSize: 13, color: '#059669' }} />, label: 'Condition based' },
        { icon: <span style={{ color: '#ef4444', fontWeight: 700 }}>*</span>, label: 'Required' },
      ].map(({ icon, label }) => (
        <span key={label} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          {icon} {label}
        </span>
      ))}
    </div>
  );

  /* ── Filter controls (top-right) ── */
  const filterControls = (
    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
      {/* Mode buttons */}
      <div style={{ display:'flex', border:'1px solid #d1d5db', borderRadius:6, overflow:'hidden' }}>
        {['day','month','year','custom'].map((mode, i, arr) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding:'4px 14px', fontSize:12, fontWeight:600, cursor:'pointer', border:'none',
            background: viewMode === mode ? '#1e3a5f' : '#fff',
            color:      viewMode === mode ? '#fff'    : '#374151',
            borderRight: i < arr.length - 1 ? '1px solid #d1d5db' : 'none',
            transition: 'all .15s',
          }}>
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {/* Day picker */}
      {viewMode === 'day' && (
        <DatePicker
          value={selectedDayjs}
          onChange={(v) => v && setSelectedDayjs(v)}
          format="DD-MM-YYYY"
          allowClear={false}
          suffixIcon={<CalendarOutlined style={{ color:'#1e3a5f', cursor:'pointer' }} />}
          inputReadOnly
          style={{ borderRadius:6, fontSize:12, width:148 }}
        />
      )}

      {/* Month nav */}
      {viewMode === 'month' && (
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button onClick={() => { let m=selMonth-1,y=selYear; if(m<0){m=11;y--;} setSelMonth(m); setSelYear(y); }}
            style={{ border:'1px solid #d1d5db', borderRadius:4, background:'#fff', cursor:'pointer', padding:'2px 9px', fontSize:13 }}>‹</button>
          <span style={{ fontWeight:700, fontSize:12, color:'#1e3a5f', minWidth:100, textAlign:'center' }}>
            {monthNames[selMonth]} {selYear}
          </span>
          <button onClick={() => { let m=selMonth+1,y=selYear; if(m>11){m=0;y++;} setSelMonth(m); setSelYear(y); }}
            style={{ border:'1px solid #d1d5db', borderRadius:4, background:'#fff', cursor:'pointer', padding:'2px 9px', fontSize:13 }}>›</button>
        </div>
      )}

      {/* Year nav + month color key */}
      {viewMode === 'year' && (
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={() => setSelYear((y) => y-1)}
              style={{ border:'1px solid #d1d5db', borderRadius:4, background:'#fff', cursor:'pointer', padding:'2px 9px', fontSize:13 }}>‹</button>
            <span style={{ fontWeight:700, fontSize:12, color:'#1e3a5f', minWidth:40, textAlign:'center' }}>{selYear}</span>
            <button onClick={() => setSelYear((y) => y+1)}
              style={{ border:'1px solid #d1d5db', borderRadius:4, background:'#fff', cursor:'pointer', padding:'2px 9px', fontSize:13 }}>›</button>
          </div>
          {/* Inline month color legend for year view */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {MONTH_COLORS.map((m) => (
              <span key={m.label} style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:10, color:'#374151' }}>
                <span style={{ width:10, height:10, borderRadius:2, background:m.bg, display:'inline-block' }} /> {m.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Custom range */}
      {viewMode === 'custom' && (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <DatePicker
            value={customStart ? dayjs(customStart) : null}
            onChange={(v) => v && setCustomStart(v.format('YYYY-MM-DD'))}
            format="DD-MM-YYYY" allowClear={false} inputReadOnly
            suffixIcon={<CalendarOutlined style={{ color:'#1e3a5f' }} />}
            style={{ borderRadius:6, fontSize:12, width:148 }}
          />
          <span style={{ fontSize:12, color:'#6b7280' }}>to</span>
          <DatePicker
            value={customEnd ? dayjs(customEnd) : null}
            onChange={(v) => v && setCustomEnd(v.format('YYYY-MM-DD'))}
            format="DD-MM-YYYY" allowClear={false} inputReadOnly
            suffixIcon={<CalendarOutlined style={{ color:'#1e3a5f' }} />}
            style={{ borderRadius:6, fontSize:12, width:148 }}
          />
        </div>
      )}
    </div>
  );

  /* ── Top bar: legend left, filter + actions right ── */
  const topBar = (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
      {legend}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        {filterControls}
        <Button
          icon={<ReloadOutlined />}
          onClick={loadHistory}
          loading={loading}
          size="small"
          style={{ borderRadius: 7 }}
        />
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownloadPDF}
          size="small"
          style={{ borderRadius: 7 }}
        >
          Download PDF
        </Button>
      </div>
    </div>
  );

  /* ── Table ── */
  const table = (
    <div style={{ overflowX:'auto' }}>
      <table style={{ borderCollapse:'collapse', width:'100%', fontSize:12 }}>
        <thead>
          <tr>
            <th style={{ ...TH, width:40, minWidth:40, position:'sticky', left:0, zIndex:3 }}>Sl.</th>
            <th style={{ ...TH, minWidth:220, textAlign:'left', position:'sticky', left:40, zIndex:3 }}>Check Point</th>
            <th style={{ ...TH, minWidth:130 }}>Frequency</th>
            {columns.map((col) => (
              <th key={col.key} style={colHeaderStyle(col)}>{col.day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={colSpanTotal} style={{ ...TD, textAlign:'center', padding:48 }}><Spin size="large" /></td></tr>
          ) : grouped.length === 0 ? (
            <tr><td colSpan={colSpanTotal} style={{ ...TD, textAlign:'center', padding:48, color:'#9ca3af' }}>No checklist history found.</td></tr>
          ) : grouped.map((checklist, ci) => {
            const items = Object.values(checklist.items).sort(
              (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0)
            );
            return (
              <React.Fragment key={checklist.id}>
                <tr>
                  <td colSpan={colSpanTotal} style={{
                    border:'1px solid #d1d5db', background:'#1e3a5f', color:'#fff',
                    fontWeight:700, fontSize:12, padding:'7px 14px', letterSpacing:0.3,
                  }}>
                    {ci + 1}. {checklist.name}
                  </td>
                </tr>
                {items.length === 0 ? (
                  <tr>
                    <td style={{ ...TD, textAlign:'center', color:'#9ca3af' }} />
                    <td colSpan={2+columns.length} style={{ ...TD, color:'#9ca3af', fontStyle:'italic' }}>No check points.</td>
                  </tr>
                ) : items.map((item, ii) => {
                  const required = item.is_required ?? true;
                  return (
                    <tr key={item.id ?? ii}
                      style={{ background: ii%2===0 ? '#fff' : '#fafafa' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background='#f0f6ff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background=ii%2===0?'#fff':'#fafafa'; }}
                    >
                      <td style={{ ...TD, textAlign:'center', color:'#6b7280', fontWeight:600, position:'sticky', left:0, zIndex:1, background:'inherit' }}>
                        {ii+1}.
                      </td>
                      <td style={{ ...TD, position:'sticky', left:40, zIndex:1, background:'inherit' }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:4 }}>
                          {required && <span style={{ color:'#ef4444', fontWeight:700, lineHeight:1.5 }}>*</span>}
                          <span style={{ color:'#111827', lineHeight:1.5 }}>{item.item_text}</span>
                        </div>
                        {item.remarks && <div style={{ fontSize:11, color:'#9ca3af', marginTop:2 }}>{item.remarks}</div>}
                        {item.expected_value && (
                          <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                            Expected: <strong style={{ color:'#374151' }}>{item.expected_value}</strong>
                          </div>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign:'center' }}>
                        <span style={{
                          display:'inline-flex', alignItems:'center', gap:4,
                          fontSize:11, color:freqColor(item).color, background:freqColor(item).bg,
                          border:`1px solid ${freqColor(item).border}`, borderRadius:4, padding:'2px 8px',
                        }}>
                          {freqIcon(item)} {freqLabel(item)}
                        </span>
                      </td>
                      {columns.map((col) => renderCell(item.submissions, col, item.expected_value))}
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div style={{ border: '2px solid #1e3a5f', marginBottom: 14, background: '#fff' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #1e3a5f' }}>
          <div style={{
            width: 180, minWidth: 180, padding: '10px 16px',
            borderRight: '1px solid #1e3a5f',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={cmtisLogo}
              alt="CMTI Logo"
              style={{ maxWidth: 120, maxHeight: 48, objectFit: 'contain' }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 16px' }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1e3a5f', letterSpacing: 0.5 }}>CENTRAL MANUFACTURING FACILITY (CMF)</div>
            <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>ISO 9001-2015</div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#111827', marginTop: 4, borderTop: '1px solid #e5e7eb', paddingTop: 4, width: '100%', textAlign: 'center' }}>
              Preventive Maintenance Checklist
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', borderTop: '1px solid #d1d5db' }}>
          {[
            { label: 'Machine', value: [machineMeta.make, machineMeta.model].filter(Boolean).join(' — ') || machineMeta.name || `ID ${machineId}` },
            { label: 'Month', value: monthLabel },
            { label: 'Year', value: currentYear },
            { label: 'Location', value: 'Workshop' },
          ].map(({ label, value }, i, arr) => (
            <div key={label} style={{
              flex: label === 'Machine' ? 2 : 1,
              padding: '6px 12px',
              borderRight: i < arr.length - 1 ? '1px solid #d1d5db' : 'none',
              fontSize: 12,
            }}>
              <span style={{ fontWeight: 700 }}>{label}:</span>
              <span style={{ marginLeft: 4, color: '#1d4ed8', textDecoration: 'underline' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      {topBar}
      {table}
    </>
  );
};

export default PokayokeHistory;