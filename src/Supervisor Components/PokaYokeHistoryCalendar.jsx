import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Select, Space, Spin, message } from 'antd';
import {
  CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled,
  DownloadOutlined, ReloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import cmtisLogo from '../assets/cmtis.png';
import { PM_T, btnSharp, machineLabel, pmFetch } from './pmUtils';

const { Option } = Select;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const COL = {
  checklist: 110,
  machine: 120,
  checkpoint: 180,
  frequency: 120,
};

const STICKY_LEFT = {
  checklist: 0,
  machine: COL.checklist,
  checkpoint: COL.checklist + COL.machine,
  frequency: COL.checklist + COL.machine + COL.checkpoint,
};

const STICKY_Z = { checklist: 5, machine: 4, checkpoint: 3, frequency: 2 };

const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYMD = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

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

const freqLabel = (item) => {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based') return item.trigger_hours ? `Every ${item.trigger_hours} hrs` : 'Usage Based';
  if (ft === 'condition based') return item.inspection_interval ? `${item.inspection_interval} inspection` : 'Condition Based';
  if (ft.includes('daily')) return 'Daily';
  if (ft.includes('condition')) return 'Condition';
  return item?.frequency_type || '-';
};

const freqIcon = (item) => {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based' || ft.includes('daily')) return <CalendarOutlined style={{ fontSize: 11 }} />;
  if (ft === 'usage based') return <ThunderboltOutlined style={{ fontSize: 11 }} />;
  if (ft === 'condition based' || ft.includes('condition')) return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
};

const freqColor = (item) => {
  const ft = (item?.frequency_type ?? '').toLowerCase();
  if (ft === 'time based' || ft.includes('daily')) return { color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
  if (ft === 'usage based') return { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' };
  if (ft === 'condition based' || ft.includes('condition')) return { color: '#059669', bg: '#d1fae5', border: '#6ee7b7' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
};

const isPositiveResponse = (responseValue, expectedValue = 'yes') => {
  const val = String(responseValue ?? '').toLowerCase().trim();
  const expected = String(expectedValue ?? 'yes').toLowerCase().trim();
  const truthy = new Set(['true', 'yes', 'y', '1', 'on']);
  const falsy = new Set(['false', 'no', 'n', '0', 'off']);
  if (truthy.has(val) && truthy.has(expected)) return true;
  if (falsy.has(val) && falsy.has(expected)) return false;
  if (truthy.has(val) && falsy.has(expected)) return false;
  if (falsy.has(val) && truthy.has(expected)) return false;
  return val === expected;
};

const buildMonthColumns = (year, month) => {
  const today = toYMD(new Date());
  const days = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: days }, (_, i) => {
    const d = i + 1;
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return { key: ymd, day: d, monthIdx: month, isToday: ymd === today };
  });
};

const buildYearColumns = (year) => {
  const today = toYMD(new Date());
  const cols = [];
  for (let m = 0; m < 12; m += 1) {
    const days = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= days; d += 1) {
      const ymd = `${year}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cols.push({ key: ymd, day: d, monthIdx: m, isToday: ymd === today, isMonthStart: d === 1 });
    }
  }
  return cols;
};

const buildRangeColumns = (startStr, endStr) => {
  if (!startStr || !endStr) return [];
  const start = parseYMD(startStr);
  const end = parseYMD(endStr);
  if (start > end) return [];
  const today = toYMD(new Date());
  const cols = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ymd = toYMD(cur);
    cols.push({
      key: ymd,
      day: cur.getDate(),
      monthIdx: cur.getMonth(),
      isToday: ymd === today,
      isMonthStart: cur.getDate() === 1,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return cols;
};

const withRowSpans = (rows) => {
  const result = rows.map((row) => ({
    ...row,
    showChecklist: false,
    checklistRowSpan: 1,
    showMachine: false,
    machineRowSpan: 1,
  }));

  for (let i = 0; i < result.length; ) {
    const checklistKey = result[i].checklistKey;
    let j = i + 1;
    while (j < result.length && result[j].checklistKey === checklistKey) j += 1;
    result[i].showChecklist = true;
    result[i].checklistRowSpan = j - i;

    for (let k = i; k < j; ) {
      const machineKey = result[k].machineKey;
      let m = k + 1;
      while (m < j && result[m].machineKey === machineKey) m += 1;
      result[k].showMachine = true;
      result[k].machineRowSpan = m - k;
      k = m;
    }
    i = j;
  }

  return result;
};

const pdfDownloadFilename = () => `pm_checklist_history_${dayjs().format('YYYY-MM-DD')}.pdf`;

function drawPmPdfHeader(doc, pageWidth, { periodLabel, logoDataUrl }) {
  const margin = 10;
  const boxTop = 8;
  const headerH = 20;
  const navy = [30, 58, 95];

  doc.setDrawColor(navy[0], navy[1], navy[2]);
  doc.setLineWidth(0.35);
  doc.rect(margin, boxTop, pageWidth - margin * 2, headerH);

  doc.line(margin + 42, boxTop, margin + 42, boxTop + headerH);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin + 4, boxTop + 4, 34, 12);
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
  doc.text('Preventive Maintenance Checklist History', pageWidth / 2, boxTop + 17, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(80, 80, 80);
  doc.text(`Period: ${periodLabel}`, margin, boxTop + headerH + 4);
  doc.setTextColor(0, 0, 0);

  return boxTop + headerH + 7;
}

function buildPdfColumnStyles(pageWidth, dayCount, viewMode) {
  const margin = 10;
  const usable = pageWidth - margin * 2;
  const checklistW = 22;
  const machineW = 24;
  const pointW = viewMode === 'year' || viewMode === 'custom' ? 30 : 36;
  const freqW = viewMode === 'year' || viewMode === 'custom' ? 16 : 20;
  const dayW = Math.max(3.2, (usable - checklistW - machineW - pointW - freqW) / Math.max(dayCount, 1));
  const dayFont = dayW < 4.5 ? 5 : 6;

  const columnStyles = {
    0: { cellWidth: checklistW, halign: 'left', fontSize: 5, overflow: 'linebreak' },
    1: { cellWidth: machineW, halign: 'left', fontSize: 5, overflow: 'linebreak' },
    2: { cellWidth: pointW, halign: 'left', fontSize: 5, overflow: 'linebreak' },
    3: { cellWidth: freqW, halign: 'center', fontSize: 5 },
  };
  for (let i = 0; i < dayCount; i += 1) {
    columnStyles[4 + i] = {
      cellWidth: dayW,
      halign: 'center',
      fontSize: dayFont,
      overflow: 'hidden',
      minCellHeight: 4,
    };
  }
  return { columnStyles, tableWidth: usable, margin };
}

const stickyStyle = (key, { isHeader = false, bg = '#f3f4f6' } = {}) => ({
  position: 'sticky',
  left: STICKY_LEFT[key],
  zIndex: isHeader ? STICKY_Z[key] + 10 : STICKY_Z[key],
  width: COL[key],
  minWidth: COL[key],
  maxWidth: COL[key],
  background: bg,
  wordBreak: 'break-word',
  overflowWrap: 'anywhere',
  whiteSpace: 'normal',
  verticalAlign: 'middle',
  ...(key === 'frequency' ? { boxShadow: '3px 0 6px -2px rgba(0,0,0,0.12)' } : {}),
});

const PokaYokeHistoryCalendar = ({ machines = [], fetchMachines, machinesLoading }) => {
  const now = new Date();
  const [loading, setLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [machineFilter, setMachineFilter] = useState(null);
  const [checklistFilter, setChecklistFilter] = useState(null);
  const [viewMode, setViewMode] = useState('month');
  const [selectedDayjs, setSelectedDayjs] = useState(dayjs());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(toYMD(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toYMD(now));

  const columns = useMemo(() => {
    if (viewMode === 'day') {
      const ymd = selectedDayjs.format('YYYY-MM-DD');
      return [{
        key: ymd,
        day: selectedDayjs.date(),
        monthIdx: selectedDayjs.month(),
        isToday: ymd === toYMD(now),
      }];
    }
    if (viewMode === 'month') return buildMonthColumns(selYear, selMonth);
    if (viewMode === 'year') return buildYearColumns(selYear);
    if (viewMode === 'custom') return buildRangeColumns(customStart, customEnd);
    return [];
  }, [viewMode, selectedDayjs, selMonth, selYear, customStart, customEnd]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (viewMode === 'month') {
        params.set('month', String(selMonth + 1));
        params.set('year', String(selYear));
      } else if (viewMode === 'year') {
        params.set('year', String(selYear));
      } else if (viewMode === 'day') {
        const d = selectedDayjs.format('YYYY-MM-DD');
        params.set('start_date', d);
        params.set('end_date', d);
      } else if (viewMode === 'custom') {
        params.set('start_date', customStart);
        params.set('end_date', customEnd);
      }

      const [assignmentList, submissionData] = await Promise.all([
        pmFetch('/assignments'),
        pmFetch(`/submissions?${params.toString()}`),
      ]);

      const enriched = await Promise.all(
        (assignmentList || []).map(async (a) => {
          const detail = await pmFetch(`/assignments/${a.id}`);
          return {
            ...detail,
            checklistName: detail.checklist?.name || 'Unknown',
          };
        }),
      );

      setAssignments(enriched);
      setSubmissions(Array.isArray(submissionData) ? submissionData : []);
    } catch (e) {
      message.error(e.message || 'Failed to fetch checklist history');
    } finally {
      setLoading(false);
    }
  }, [viewMode, selMonth, selYear, selectedDayjs, customStart, customEnd]);

  useEffect(() => {
    fetchMachines?.();
    loadHistory();
  }, [loadHistory]);

  const submissionByAssignmentItem = useMemo(() => {
    const colKeySet = new Set(columns.map((c) => c.key));
    const map = {};

    for (const sub of submissions) {
      const assignmentItemId = sub.assignment_item_id;
      if (!assignmentItemId) continue;

      const at = sub.submitted_at ?? sub.completed_at ?? sub.created_at;
      if (!at) continue;

      const ymd = dayjs(at).format('YYYY-MM-DD');
      if (!colKeySet.has(ymd)) continue;

      const ts = new Date(at).getTime();
      const item = sub.checklist_item ?? {};
      if (!map[assignmentItemId]) map[assignmentItemId] = {};

      const existing = map[assignmentItemId][ymd];
      if (!existing || ts > existing._ts) {
        map[assignmentItemId][ymd] = {
          response_value: sub.response_value,
          expected_value: item.expected_value ?? sub.expected_value,
          approval_status: sub.status ?? sub.approval_status,
          _ts: ts,
        };
      }
    }

    return map;
  }, [submissions, columns]);

  const checklistOptions = useMemo(() => {
    const map = new Map();
    assignments.forEach((a) => {
      const id = a.checklist_id || a.checklist?.id;
      const name = a.checklist?.name || a.checklistName;
      if (id) map.set(id, name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [assignments]);

  const tableRows = useMemo(() => {
    let list = assignments;
    if (machineFilter) list = list.filter((a) => String(a.machine_id) === String(machineFilter));
    if (checklistFilter) {
      list = list.filter((a) => String(a.checklist_id || a.checklist?.id) === String(checklistFilter));
    }

    const rows = [];
    for (const assignment of list) {
      const machine = machines.find((m) => String(m.id) === String(assignment.machine_id));
      const checklistId = assignment.checklist_id || assignment.checklist?.id;
      const checklistName = assignment.checklist?.name || assignment.checklistName || `Checklist #${checklistId}`;

      for (const ai of assignment.assignment_items || []) {
        const ci = ai.checklist_item;
        if (!ci) continue;

        rows.push({
          key: `${assignment.id}-${ai.id}`,
          checklistKey: String(checklistId),
          checklistName,
          machineKey: `${checklistId}-${assignment.machine_id}`,
          machineId: assignment.machine_id,
          machineName: machineLabel(machine) || `Machine #${assignment.machine_id}`,
          assignmentItemId: ai.id,
          checkpoint: ci.item_text || 'Checkpoint',
          remarks: ci.remarks,
          expected_value: ci.expected_value,
          is_required: ai.is_required ?? true,
          sequence: ci.sequence_number ?? 0,
          frequencyItem: ci,
          submissions: submissionByAssignmentItem[ai.id] || {},
        });
      }
    }

    rows.sort((a, b) => {
      const byChecklist = a.checklistName.localeCompare(b.checklistName);
      if (byChecklist !== 0) return byChecklist;
      const byMachine = a.machineName.localeCompare(b.machineName);
      if (byMachine !== 0) return byMachine;
      return a.sequence - b.sequence;
    });

    return withRowSpans(rows);
  }, [assignments, machines, machineFilter, checklistFilter, submissionByAssignmentItem]);

  const isYearOrCustom = viewMode === 'year' || viewMode === 'custom';
  const isDay = viewMode === 'day';
  const cellW = isDay ? 100 : 28;

  const getViewPeriodLabel = () => {
    if (viewMode === 'day') return selectedDayjs.format('DD MMM YYYY');
    if (viewMode === 'month') return `${MONTH_NAMES[selMonth]} ${selYear}`;
    if (viewMode === 'year') return String(selYear);
    if (viewMode === 'custom') return `${customStart} to ${customEnd}`;
    return '';
  };

  const pdfCellMark = (sub, expectedValue) => {
    if (!sub) return '';
    return isPositiveResponse(sub.response_value, sub.expected_value ?? expectedValue)
      ? PDF_MARK_CHECK
      : PDF_MARK_CROSS;
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
        periodLabel: getViewPeriodLabel(),
        logoDataUrl,
      });

      if (tableRows.length === 0) {
        doc.setFontSize(11);
        doc.text('No checklist history found.', pageWidth / 2, startY + 10, { align: 'center' });
        doc.save(pdfDownloadFilename());
        message.success('PDF downloaded successfully');
        return;
      }

      const dayHeaders = columns.map((col) => String(col.day));
      const headRow = ['Checklist', 'Machine', 'Checkpoint', 'Frequency', ...dayHeaders];
      const { columnStyles, tableWidth, margin } = buildPdfColumnStyles(pageWidth, columns.length, viewMode);

      const bodyRows = tableRows.map((row) => [
        row.checklistName,
        row.machineName,
        `${row.is_required ? '* ' : ''}${row.checkpoint}`,
        freqLabel(row.frequencyItem),
        ...columns.map((col) => pdfCellMark(row.submissions[col.key], row.expected_value)),
      ]);

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
          if (data.section === 'head' && data.column.index >= 4) {
            data.cell.styles.overflow = 'hidden';
            data.cell.styles.halign = 'center';
            data.cell.styles.minCellHeight = 5;
          }
          if (data.section === 'body' && data.column.index >= 4) {
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

      doc.save(pdfDownloadFilename());
      message.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF error:', error);
      message.error('Failed to generate PDF');
    }
  };

  const TH = {
    border: '1px solid #d1d5db',
    padding: '8px 6px',
    background: '#f3f4f6',
    fontWeight: 700,
    fontSize: 12,
    textAlign: 'center',
  };
  const TD = { border: '1px solid #d1d5db', padding: '7px 8px', fontSize: 12, verticalAlign: 'middle' };

  const colHeaderStyle = (col) => {
    if (isYearOrCustom) {
      const mc = MONTH_COLORS[col.monthIdx];
      return {
        ...TH,
        width: cellW,
        minWidth: cellW,
        padding: '6px 2px',
        background: col.isToday ? '#1e3a5f' : mc.bg,
        color: col.isToday ? '#fff' : mc.text,
        fontWeight: col.isToday ? 900 : 700,
        fontSize: 10,
        borderLeft: col.isMonthStart ? '2px solid rgba(0,0,0,0.25)' : undefined,
      };
    }
    if (isDay) {
      return {
        ...TH,
        width: cellW,
        minWidth: cellW,
        padding: '10px 8px',
        fontSize: 13,
        background: col.isToday ? '#dbeafe' : '#f3f4f6',
        color: col.isToday ? '#1d4ed8' : '#374151',
        borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
      };
    }
    return {
      ...TH,
      width: cellW,
      minWidth: cellW,
      padding: '6px 2px',
      fontSize: 11,
      background: col.isToday ? '#dbeafe' : '#f3f4f6',
      color: col.isToday ? '#1d4ed8' : '#374151',
      fontWeight: col.isToday ? 800 : 700,
      borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
    };
  };

  const renderCell = (rowSubmissions, col, expectedValue) => {
    const sub = rowSubmissions[col.key];
    let content = null;
    if (sub) {
      const ok = isPositiveResponse(sub.response_value, sub.expected_value ?? expectedValue);
      content = ok
        ? <CheckCircleFilled style={{ color: '#22c55e', fontSize: isDay ? 15 : 13 }} />
        : <CloseCircleFilled style={{ color: '#ef4444', fontSize: isDay ? 15 : 13 }} />;
    }
    return (
      <td
        key={col.key}
        style={{
          border: '1px solid #d1d5db',
          borderLeft: col.isMonthStart && isYearOrCustom ? '2px solid rgba(0,0,0,0.2)' : undefined,
          textAlign: 'center',
          padding: 0,
          width: cellW,
          minWidth: cellW,
          background: col.isToday ? '#eff6ff' : 'inherit',
        }}
      >
        <div style={{ width: cellW, height: isDay ? 40 : 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {content}
        </div>
      </td>
    );
  };

  const colSpanTotal = 4 + columns.length;

  const rowBg = (idx) => (idx % 2 === 0 ? '#fff' : '#fafafa');

  const setRowHoverBg = (tr, bg) => {
    tr.style.background = bg;
    tr.querySelectorAll('td[data-sticky]').forEach((td) => {
      td.style.background = bg;
    });
  };

  return (
    <div style={{ background: PM_T.bg }}>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            showSearch
            placeholder="Filter by machine"
            style={{ width: 200 }}
            loading={machinesLoading}
            value={machineFilter}
            onFocus={fetchMachines}
            onChange={(v) => setMachineFilter(v || null)}
            optionFilterProp="children"
          >
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>

          <Select
            allowClear
            showSearch
            placeholder="Filter by checklist"
            style={{ width: 200 }}
            value={checklistFilter}
            onChange={(v) => setChecklistFilter(v || null)}
            optionFilterProp="children"
            disabled={checklistOptions.length === 0}
          >
            {checklistOptions.map((c) => <Option key={c.id} value={c.id}>{c.name}</Option>)}
          </Select>

          <div style={{ display: 'flex', border: `1px solid ${PM_T.border}`, borderRadius: 6, overflow: 'hidden' }}>
            {['day', 'month', 'year', 'custom'].map((mode, i, arr) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: 'none',
                  background: viewMode === mode ? '#1e3a5f' : '#fff',
                  color: viewMode === mode ? '#fff' : '#374151',
                  borderRight: i < arr.length - 1 ? `1px solid ${PM_T.border}` : 'none',
                }}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {viewMode === 'day' && (
            <DatePicker
              value={selectedDayjs}
              onChange={(v) => v && setSelectedDayjs(v)}
              format="DD-MM-YYYY"
              allowClear={false}
              suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
              inputReadOnly
              style={{ borderRadius: 6, fontSize: 12, width: 140 }}
            />
          )}

          {viewMode === 'month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                onClick={() => {
                  let m = selMonth - 1;
                  let y = selYear;
                  if (m < 0) { m = 11; y -= 1; }
                  setSelMonth(m);
                  setSelYear(y);
                }}
                style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
              >
                ‹
              </button>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 90, textAlign: 'center' }}>
                {MONTH_NAMES[selMonth]} {selYear}
              </span>
              <button
                type="button"
                onClick={() => {
                  let m = selMonth + 1;
                  let y = selYear;
                  if (m > 11) { m = 0; y += 1; }
                  setSelMonth(m);
                  setSelYear(y);
                }}
                style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
              >
                ›
              </button>
            </div>
          )}

          {viewMode === 'year' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setSelYear((y) => y - 1)}
                  style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
                >
                  ‹
                </button>
                <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 40, textAlign: 'center' }}>{selYear}</span>
                <button
                  type="button"
                  onClick={() => setSelYear((y) => y + 1)}
                  style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
                >
                  ›
                </button>
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {MONTH_COLORS.map((m) => (
                  <span key={m.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#374151' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: m.bg, display: 'inline-block' }} />
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {viewMode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DatePicker
                value={customStart ? dayjs(customStart) : null}
                onChange={(v) => v && setCustomStart(v.format('YYYY-MM-DD'))}
                format="DD-MM-YYYY"
                allowClear={false}
                inputReadOnly
                suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
                style={{ borderRadius: 6, fontSize: 12, width: 130 }}
              />
              <span style={{ fontSize: 12, color: PM_T.textMuted }}>to</span>
              <DatePicker
                value={customEnd ? dayjs(customEnd) : null}
                onChange={(v) => v && setCustomEnd(v.format('YYYY-MM-DD'))}
                format="DD-MM-YYYY"
                allowClear={false}
                inputReadOnly
                suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
                style={{ borderRadius: 6, fontSize: 12, width: 130 }}
              />
            </div>
          )}
        </Space>

        <Space>
          <Button icon={<ReloadOutlined />} loading={loading} style={btnSharp} onClick={loadHistory}>
            Refresh
          </Button>
          <Button type="primary" icon={<DownloadOutlined />} style={btnSharp} onClick={handleDownloadPDF}>
            Download PDF
          </Button>
        </Space>
      </Space>

      <div style={{ overflowX: 'auto', background: '#fff', border: `1px solid ${PM_T.border}` }}>
        <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%', fontSize: 12, tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: COL.checklist }} />
            <col style={{ width: COL.machine }} />
            <col style={{ width: COL.checkpoint }} />
            <col style={{ width: COL.frequency }} />
            {columns.map((col) => <col key={col.key} style={{ width: cellW }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...TH, ...stickyStyle('checklist', { isHeader: true }), textAlign: 'left' }}>Checklist</th>
              <th style={{ ...TH, ...stickyStyle('machine', { isHeader: true }), textAlign: 'left' }}>Machine</th>
              <th style={{ ...TH, ...stickyStyle('checkpoint', { isHeader: true }), textAlign: 'left' }}>Checkpoint</th>
              <th style={{ ...TH, ...stickyStyle('frequency', { isHeader: true }) }}>Frequency</th>
              {columns.map((col) => (
                <th key={col.key} style={colHeaderStyle(col)}>{col.day}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpanTotal} style={{ ...TD, textAlign: 'center', padding: 48 }}>
                  <Spin size="large" />
                </td>
              </tr>
            ) : tableRows.length === 0 ? (
              <tr>
                <td colSpan={colSpanTotal} style={{ ...TD, textAlign: 'center', padding: 48, color: PM_T.textMuted }}>
                  No checklist assignments found for this period.
                </td>
              </tr>
            ) : tableRows.map((row, idx) => {
              const bg = rowBg(idx);
              return (
                <tr
                  key={row.key}
                  style={{ background: bg }}
                  onMouseEnter={(e) => setRowHoverBg(e.currentTarget, '#f0f6ff')}
                  onMouseLeave={(e) => setRowHoverBg(e.currentTarget, bg)}
                >
                  {row.showChecklist && (
                    <td
                      rowSpan={row.checklistRowSpan}
                      data-sticky="checklist"
                      style={{
                        ...TD,
                        ...stickyStyle('checklist', { bg }),
                        fontWeight: 700,
                        color: '#1e3a5f',
                      }}
                    >
                      {row.checklistName}
                    </td>
                  )}
                  {row.showMachine && (
                    <td
                      rowSpan={row.machineRowSpan}
                      data-sticky="machine"
                      style={{
                        ...TD,
                        ...stickyStyle('machine', { bg }),
                        fontWeight: 600,
                      }}
                    >
                      {row.machineName}
                    </td>
                  )}
                  <td data-sticky="checkpoint" style={{ ...TD, ...stickyStyle('checkpoint', { bg }) }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                      {row.is_required && <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>*</span>}
                      <span>{row.checkpoint}</span>
                    </div>
                    {row.remarks && <div style={{ fontSize: 11, color: PM_T.textMuted, marginTop: 2 }}>{row.remarks}</div>}
                  </td>
                  <td data-sticky="frequency" style={{ ...TD, ...stickyStyle('frequency', { bg }), textAlign: 'center' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color: freqColor(row.frequencyItem).color,
                        background: freqColor(row.frequencyItem).bg,
                        border: `1px solid ${freqColor(row.frequencyItem).border}`,
                        borderRadius: 4,
                        padding: '2px 6px',
                        maxWidth: '100%',
                        flexWrap: 'wrap',
                        justifyContent: 'center',
                      }}
                    >
                      {freqIcon(row.frequencyItem)} {freqLabel(row.frequencyItem)}
                    </span>
                  </td>
                  {columns.map((col) => renderCell(row.submissions, col, row.expected_value))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PokaYokeHistoryCalendar;
