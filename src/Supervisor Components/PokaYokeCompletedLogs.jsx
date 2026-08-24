import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { message, Spin, DatePicker, Button, Tooltip, Modal, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, ClearOutlined,
  CalendarOutlined, DownloadOutlined, ReloadOutlined, StopFilled,
} from '@ant-design/icons';
import {
  pmFetch, machineLabel, itemTypeShort,
  indexMachineAvailability, isMachineBreakdownOnDay,
} from './pmUtils';
import cmtisLogo from '../assets/cmtis.png';

const { Text } = Typography;

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
const PDF_MARK_PARTIAL = '!';
const PDF_MARK_BREAKDOWN = '–';

const DAY_TONE = {
  green: { color: '#22c55e', label: 'Fully completed' },
  orange: { color: '#F5B800', label: 'Partial / mixed' },
  red: { color: '#ef4444', label: 'Not submitted' },
  breakdown: { color: '#64748b', label: 'Machine breakdown' },
};

/** @returns {'green'|'orange'|'red'} */
const resolveDayTone = (submittedCount, rejectedCount, expectedCount) => {
  if (!submittedCount) return 'red';
  const incomplete = expectedCount > 0 && submittedCount < expectedCount;
  if (incomplete || rejectedCount > 0) return 'orange';
  return 'green';
};

/** Red "not submitted" only after the workday window (9–5) has ended. */
const SHIFT_END_HOUR = 17; // 5 PM

const isPastSubmissionDeadline = (ymd, now = new Date()) => {
  if (!ymd) return false;
  const today = toYMD(now);
  if (ymd > today) return false; // future — don't mark red yet
  if (ymd < today) return true;  // past day — missed if empty
  return now.getHours() >= SHIFT_END_HOUR; // today — red only after 5 PM
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
  doc.text('Preventive Maintenance — Supervisor Submission History', pageWidth / 2, boxTop + 17, { align: 'center' });

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
  const machineW = viewMode === 'year' || viewMode === 'custom' ? 48 : 56;
  const dayW = Math.max(3.6, (usable - slW - machineW) / Math.max(dayCount, 1));
  const dayFont = dayW < 4.5 ? 5 : 6;

  const columnStyles = {
    0: { cellWidth: slW, halign: 'center', fontSize: 6 },
    1: { cellWidth: machineW, halign: 'left', fontSize: 6 },
  };
  for (let i = 0; i < dayCount; i += 1) {
    columnStyles[2 + i] = {
      cellWidth: dayW,
      halign: 'center',
      fontSize: dayFont,
      overflow: 'hidden',
      minCellHeight: 4,
    };
  }
  return { columnStyles, tableWidth: usable, margin };
}

/* ─── Date / response helpers ───────────────────────────────────────────── */
const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYMD = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const isPositiveResponse = (responseValue, expectedValue = 'yes') => {
  const val = String(responseValue ?? '').toLowerCase().trim();
  const expected = String(expectedValue ?? 'yes').toLowerCase().trim();
  const truthy = new Set(['true', 'yes', 'y', '1', 'on', 'ok', 'pass', 'passed', 'accept', 'accepted']);
  const falsy = new Set([
    'false', 'no', 'n', '0', 'off', 'reject', 'rejected', 'fail', 'failed', 'wrong',
    'non-conforming', 'non conforming', 'nonconforming',
  ]);
  if (falsy.has(val)) {
    if (falsy.has(expected)) return true;
    return false;
  }
  if (truthy.has(val) && truthy.has(expected)) return true;
  if (truthy.has(val) && falsy.has(expected)) return false;
  return val === expected;
};

const isRejectedResponse = (responseValue, expectedValue = 'yes') => {
  const val = String(responseValue ?? '').toLowerCase().trim();
  if (!val) return false;
  const rejectWords = new Set([
    'reject', 'rejected', 'fail', 'failed', 'wrong', 'no', 'n', 'false', '0', 'off',
    'non-conforming', 'non conforming', 'nonconforming',
  ]);
  if (rejectWords.has(val)) return true;
  return !isPositiveResponse(responseValue, expectedValue);
};

const hasSubmittedResponse = (sub) =>
  !!(sub.submitted_at ?? sub.completed_at ?? sub.created_at ?? sub.timestamp)
  && sub.response_value != null
  && String(sub.response_value).trim() !== '';

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
  for (let m = 0; m < 12; m++) {
    const days = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
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

const rowKey = (machineId) => `m-${machineId}`;

/* ═══════════════════════════════════════════════════════════════════════════
   Component
═══════════════════════════════════════════════════════════════════════════ */
const PokaYokeCompletedLogs = ({ machines = [] }) => {
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [availabilityById, setAvailabilityById] = useState({});
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContext, setDetailContext] = useState(null);

  const now = new Date();
  const monthLabel = now.toLocaleString('default', { month: 'long' });
  const currentYear = now.getFullYear();

  const [viewMode, setViewMode] = useState('month');
  const [selectedDayjs, setSelectedDayjs] = useState(dayjs());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(toYMD(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toYMD(now));
  const [viewportW, setViewportW] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  );
  const [tableAreaW, setTableAreaW] = useState(0);
  const tableScrollRef = useRef(null);
  const isNarrow = viewportW < 768;
  const isCompact = viewportW < 1024;

  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setTableAreaW(w);
    });
    ro.observe(el);
    setTableAreaW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const defaultCustomStart = toYMD(new Date(now.getFullYear(), now.getMonth(), 1));
  const defaultCustomEnd = toYMD(now);

  const hasActiveFilters = Boolean(
    viewMode !== 'month'
    || selMonth !== now.getMonth()
    || selYear !== now.getFullYear()
    || (viewMode === 'day' && !selectedDayjs.isSame(dayjs(), 'day'))
    || (viewMode === 'custom' && (customStart !== defaultCustomStart || customEnd !== defaultCustomEnd)),
  );

  const clearFilters = () => {
    const n = new Date();
    setViewMode('month');
    setSelMonth(n.getMonth());
    setSelYear(n.getFullYear());
    setSelectedDayjs(dayjs());
    setCustomStart(toYMD(new Date(n.getFullYear(), n.getMonth(), 1)));
    setCustomEnd(toYMD(n));
  };

  const clearFiltersButton = hasActiveFilters ? (
    <Tooltip title="Clear filters">
      <Button
        type="text"
        size="small"
        icon={<ClearOutlined />}
        onClick={clearFilters}
        aria-label="Clear filters"
        style={{ color: '#ff4d4f', padding: '0 6px', height: 26, display: 'inline-flex', alignItems: 'center' }}
      />
    </Tooltip>
  ) : null;

  const scrollToMonth = (monthIdx) => {
    const container = tableScrollRef.current;
    if (!container) return;
    const target = container.querySelector(`th[data-month-start="${monthIdx}"]`);
    if (!target) return;
    const stickyWidth = slW + machineW;
    container.scrollTo({
      left: Math.max(0, target.offsetLeft - stickyWidth),
      behavior: 'smooth',
    });
  };

  const machineNameFor = useCallback((machineId, fallback) => {
    if (fallback) return fallback;
    const m = machines.find((x) => x.id === machineId);
    return machineLabel(m) || (machineId != null ? `Machine #${machineId}` : '—');
  }, [machines]);

  /* ── Fetch once on mount (date columns filter cells client-side) ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, assigns, cls, avail] = await Promise.all([
        pmFetch('/submissions'),
        pmFetch('/assignments'),
        pmFetch('/checklists'),
        pmFetch('/machine-availability').catch(() => []),
      ]);
      setSubmissions(Array.isArray(subs) ? subs.filter(hasSubmittedResponse) : []);
      setAssignments(Array.isArray(assigns) ? assigns : []);
      setChecklists(Array.isArray(cls) ? cls : []);
      setAvailabilityById(indexMachineAvailability(avail));
    } catch (e) {
      message.error(e.message || 'Failed to load submission history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Columns ── */
  const columns = useMemo(() => {
    if (viewMode === 'day') {
      const ymd = selectedDayjs.format('YYYY-MM-DD');
      return [{ key: ymd, day: selectedDayjs.date(), monthIdx: selectedDayjs.month(), isToday: ymd === toYMD(now) }];
    }
    if (viewMode === 'month') return buildMonthColumns(selYear, selMonth);
    if (viewMode === 'year') return buildYearColumns(selYear);
    if (viewMode === 'custom') return buildRangeColumns(customStart, customEnd);
    return [];
  }, [viewMode, selectedDayjs, selMonth, selYear, customStart, customEnd]);

  /* ── Rows: one per machine (FIFO by machine_id), all checklists aggregated ── */
  const rows = useMemo(() => {
    const colKeySet = new Set(columns.map((c) => c.key));
    const map = {};

    const ensureRow = (machineId, machineLbl) => {
      if (machineId == null) return null;
      const key = rowKey(machineId);
      if (!map[key]) {
        map[key] = {
          key,
          machine_id: machineId,
          machine_label: machineNameFor(machineId, machineLbl),
          checklist_ids: new Set(),
          expectedCount: 0,
          dayStatus: {},
          itemsByDay: {},
          _dayItems: {},
        };
      } else if (machineLbl && !map[key].machine_label) {
        map[key].machine_label = machineLbl;
      }
      return map[key];
    };

    assignments.forEach((a) => {
      const row = ensureRow(a.machine_id);
      if (!row) return;
      if (a.checklist_id != null) row.checklist_ids.add(a.checklist_id);
      const n = (a.assignment_items || []).length;
      row.expectedCount += n;
    });

    Object.values(map).forEach((row) => {
      if (row.expectedCount > 0) return;
      row.checklist_ids.forEach((cid) => {
        const cl = checklists.find((c) => c.id === cid);
        row.expectedCount += (cl?.items || []).length;
      });
    });

    submissions.forEach((s) => {
      const machineId = s.machine_id;
      const row = ensureRow(machineId, s.machine_label);
      if (!row) return;
      if (s.checklist_id != null) row.checklist_ids.add(s.checklist_id);

      const ymd = toYMD(new Date(s.submitted_at));
      if (!row.itemsByDay[ymd]) row.itemsByDay[ymd] = [];
      row.itemsByDay[ymd].push(s);

      if (!colKeySet.has(ymd)) return;

      const expected = s.checklist_item?.expected_value ?? 'yes';
      const rejected = isRejectedResponse(s.response_value, expected);
      const itemId = s.checklist_item_id ?? s.checklist_item?.id ?? `anon-${s.id}`;
      if (!row._dayItems[ymd]) row._dayItems[ymd] = new Map();
      const prev = row._dayItems[ymd].get(itemId);
      row._dayItems[ymd].set(itemId, prev === true ? true : rejected);
    });

    Object.values(map).forEach((row) => {
      Object.entries(row._dayItems).forEach(([ymd, itemMap]) => {
        let rejectedCount = 0;
        itemMap.forEach((rej) => { if (rej) rejectedCount += 1; });
        const submittedCount = itemMap.size;
        const tone = resolveDayTone(submittedCount, rejectedCount, row.expectedCount);
        row.dayStatus[ymd] = {
          tone,
          ok: tone === 'green',
          rejected: rejectedCount > 0,
          count: submittedCount,
          rejectedCount,
          expectedCount: row.expectedCount,
        };
      });
      delete row._dayItems;
      row.checklist_ids = Array.from(row.checklist_ids);
    });

    // FIFO by machine id
    return Object.values(map).sort((a, b) => (a.machine_id ?? 0) - (b.machine_id ?? 0));
  }, [assignments, submissions, checklists, columns, machineNameFor]);

  /* ── Detail modal data ── */
  const detailItems = useMemo(() => {
    if (!detailContext) return [];
    const { machine_id, dayKey } = detailContext;
    return submissions
      .filter((s) => s.machine_id === machine_id)
      .filter((s) => {
        if (!dayKey) {
          const ymd = toYMD(new Date(s.submitted_at));
          return columns.some((c) => c.key === ymd);
        }
        return toYMD(new Date(s.submitted_at)) === dayKey;
      })
      .sort((a, b) => {
        const cname = (a.checklist_name || '').localeCompare(b.checklist_name || '');
        if (cname !== 0) return cname;
        const seq = (a.checklist_item?.sequence_number ?? 0) - (b.checklist_item?.sequence_number ?? 0);
        if (seq !== 0) return seq;
        return new Date(b.submitted_at) - new Date(a.submitted_at);
      });
  }, [detailContext, submissions, columns]);

  const checklistRowSpans = useMemo(() => {
    const spans = Array(detailItems.length).fill(0);
    let i = 0;
    while (i < detailItems.length) {
      const name = detailItems[i].checklist_name || '—';
      let j = i + 1;
      while (j < detailItems.length && (detailItems[j].checklist_name || '—') === name) j += 1;
      spans[i] = j - i;
      i = j;
    }
    return spans;
  }, [detailItems]);

  const detailHasRemarks = useMemo(
    () => detailItems.some((r) => Boolean(r.operator_comments && String(r.operator_comments).trim())),
    [detailItems],
  );

  const detailGroups = useMemo(() => {
    const groups = [];
    detailItems.forEach((item) => {
      const name = item.checklist_name || '—';
      const last = groups[groups.length - 1];
      if (last && last.name === name) last.items.push(item);
      else groups.push({ name, items: [item] });
    });
    return groups;
  }, [detailItems]);

  const openChecklistDetail = (row, dayKey = null) => {
    setDetailContext({
      machine_id: row.machine_id,
      machine_label: row.machine_label,
      checklist_ids: row.checklist_ids || [],
      dayKey,
    });
    setDetailOpen(true);
  };

  /* ── Shared styles (responsive + strong header borders) ── */
  const CELL_BORDER = '1px solid #94a3b8';
  const slW = isNarrow ? 32 : 40;
  const machineW = isNarrow ? 140 : isCompact ? 200 : 260;
  const stickyMachineLeft = slW;

  const isYearOrCustom = viewMode === 'year' || viewMode === 'custom';
  const isDay = viewMode === 'day';
  const dayCount = Math.max(columns.length, 1);
  const fixedColsW = slW + machineW;
  const availableForDays = Math.max((tableAreaW || viewportW) - fixedColsW - 8, dayCount * 18);
  const minDayW = isDay ? 72 : (isYearOrCustom ? 18 : 22);
  const maxDayW = isDay ? 140 : (isYearOrCustom ? 28 : 42);
  const cellW = Math.max(minDayW, Math.min(maxDayW, Math.floor(availableForDays / dayCount)));
  const tableMinW = fixedColsW + (dayCount * cellW);
  const rowH = isDay ? (isNarrow ? 36 : 40) : (isNarrow ? 28 : 32);
  const bodyFont = isNarrow ? 11 : 12;

  const TH = {
    border: '1px solid #0f2744',
    borderBottom: '2px solid #0f2744',
    padding: isNarrow ? '6px 4px' : '8px 6px',
    background: '#1e3a5f',
    backgroundClip: 'padding-box',
    color: '#fff',
    fontWeight: 700,
    fontSize: isNarrow ? 11 : 12,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
    zIndex: 3,
  };
  const TD = {
    border: CELL_BORDER,
    padding: isNarrow ? '5px 6px' : '7px 10px',
    fontSize: bodyFont,
    verticalAlign: 'middle',
  };

  const colHeaderStyle = (col) => {
    if (isYearOrCustom) {
      const mc = MONTH_COLORS[col.monthIdx];
      return {
        ...TH,
        width: cellW, minWidth: cellW, maxWidth: cellW, padding: '4px 1px',
        background: col.isToday ? '#0f2744' : mc.bg,
        backgroundClip: 'padding-box',
        color: col.isToday ? '#fff' : mc.text,
        fontWeight: col.isToday ? 900 : 700,
        fontSize: isNarrow ? 9 : 10,
        borderLeft: col.isMonthStart ? '3px solid #0f172a' : '1px solid #0f2744',
        boxShadow: col.isToday ? 'inset 0 -3px 0 #60a5fa' : undefined,
      };
    }
    if (isDay) {
      return {
        ...TH, width: cellW, minWidth: cellW, maxWidth: cellW,
        padding: isNarrow ? '8px 4px' : '10px 8px',
        fontSize: isNarrow ? 12 : 13,
        background: col.isToday ? '#0f2744' : '#1e3a5f',
        backgroundClip: 'padding-box',
        color: '#fff',
        boxShadow: col.isToday ? 'inset 0 -3px 0 #60a5fa' : undefined,
      };
    }
    return {
      ...TH, width: cellW, minWidth: cellW, maxWidth: cellW,
      padding: isNarrow ? '5px 1px' : '6px 2px',
      fontSize: isNarrow ? 10 : 11,
      background: col.isToday ? '#0f2744' : '#1e3a5f',
      backgroundClip: 'padding-box',
      color: '#fff',
      fontWeight: col.isToday ? 800 : 700,
      boxShadow: col.isToday ? 'inset 0 -3px 0 #60a5fa' : undefined,
    };
  };

  const renderCell = (row, col) => {
    const status = row.dayStatus[col.key];
    const down = isMachineBreakdownOnDay(availabilityById, row.machine_id, col.key, toYMD(now));
    const missed = !down && isPastSubmissionDeadline(col.key);
    const tone = status?.tone || (down ? 'breakdown' : (missed ? 'red' : null));
    const iconSize = isDay ? 15 : (isNarrow ? 12 : 13);
    let content = null;
    if (tone === 'green') {
      content = <CheckCircleFilled style={{ color: DAY_TONE.green.color, fontSize: iconSize }} />;
    } else if (tone === 'orange') {
      content = <ExclamationCircleFilled style={{ color: DAY_TONE.orange.color, fontSize: iconSize }} />;
    } else if (tone === 'breakdown') {
      content = <StopFilled style={{ color: DAY_TONE.breakdown.color, fontSize: iconSize }} />;
    } else if (tone === 'red') {
      content = <CloseCircleFilled style={{ color: DAY_TONE.red.color, fontSize: iconSize }} />;
    }

    const title = !tone
      ? (col.key > toYMD(now) ? 'Future date' : 'Shift open until 5 PM — not marked yet')
      : tone === 'green'
        ? `Fully completed (${status.count}/${status.expectedCount || status.count}) — click for details`
        : tone === 'orange'
          ? `Partial / mixed (${status.count}/${status.expectedCount || '?'} · ${status.rejectedCount} reject) — click for details`
          : tone === 'breakdown'
            ? 'Machine breakdown — checkpoints not required'
            : 'Not submitted';

      return (
      <td
        key={col.key}
        onClick={() => openChecklistDetail(row, col.key)}
        title={title}
        style={{
          border: CELL_BORDER,
          borderLeft: col.isMonthStart && isYearOrCustom ? '2px solid #64748b' : CELL_BORDER,
          textAlign: 'center',
          padding: 0,
          width: cellW,
          minWidth: cellW,
          maxWidth: cellW,
          background: col.isToday ? '#eff6ff' : 'inherit',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '100%', height: rowH,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        >
          {content}
        </div>
      </td>
    );
  };

  const colSpanTotal = 2 + columns.length;
  const monthNames = MONTH_COLORS.map((m) => m.label);

  const getViewPeriodLabel = () => {
    if (viewMode === 'day') return selectedDayjs.format('DD MMM YYYY');
    if (viewMode === 'month') return `${monthNames[selMonth]} ${selYear}`;
    if (viewMode === 'year') return String(selYear);
    if (viewMode === 'custom') return `${customStart} to ${customEnd}`;
    return '';
  };

  const pdfCellMark = (status, dayKey, machineId) => {
    if (status?.tone === 'green') return PDF_MARK_CHECK;
    if (status?.tone === 'orange') return PDF_MARK_PARTIAL;
    if (isMachineBreakdownOnDay(availabilityById, machineId, dayKey, toYMD(now))) return PDF_MARK_BREAKDOWN;
    const tone = status?.tone || (isPastSubmissionDeadline(dayKey) ? 'red' : null);
    if (tone === 'red') return PDF_MARK_CROSS;
    return '';
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
        machineDisplay: 'All Machines',
        monthLabel,
        currentYear,
        periodLabel: getViewPeriodLabel(),
        logoDataUrl,
      });

      if (rows.length === 0) {
        doc.setFontSize(11);
        doc.text('No machine assignments found.', pageWidth / 2, startY + 10, { align: 'center' });
        doc.save('pm_supervisor_submission_history.pdf');
        message.success('PDF downloaded successfully');
        return;
      }

      const dayHeaders = columns.map((col) => String(col.day));
      const headRow = ['Sl.', 'Machines', ...dayHeaders];
      const { columnStyles, tableWidth, margin } = buildPdfColumnStyles(pageWidth, columns.length, viewMode);

      const bodyRows = rows.map((row, i) => [
        `${i + 1}.`,
        row.machine_label,
        ...columns.map((col) => pdfCellMark(row.dayStatus[col.key], col.key, row.machine_id)),
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
          if (data.section === 'head' && data.column.index >= 2) {
            data.cell.styles.overflow = 'hidden';
            data.cell.styles.halign = 'center';
            data.cell.styles.minCellHeight = 5;
          }
          if (data.section === 'body' && data.column.index >= 2) {
            const text = data.cell.raw;
            if (text === PDF_MARK_CHECK || text === PDF_MARK_CROSS) {
              data.cell.styles.font = 'ZapfDingbats';
              data.cell.styles.fontSize = 7;
              data.cell.styles.textColor = text === PDF_MARK_CHECK ? [34, 197, 94] : [239, 68, 68];
              data.cell.styles.halign = 'center';
              data.cell.styles.valign = 'middle';
              data.cell.styles.overflow = 'hidden';
            } else if (text === PDF_MARK_PARTIAL) {
              data.cell.styles.font = 'helvetica';
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 8;
              data.cell.styles.textColor = [245, 184, 0];
              data.cell.styles.halign = 'center';
              data.cell.styles.valign = 'middle';
              data.cell.styles.overflow = 'hidden';
            } else if (text === PDF_MARK_BREAKDOWN) {
              data.cell.styles.font = 'helvetica';
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fontSize = 8;
              data.cell.styles.textColor = [100, 116, 139];
              data.cell.styles.halign = 'center';
              data.cell.styles.valign = 'middle';
              data.cell.styles.overflow = 'hidden';
            }
          }
        },
      });

      doc.save('pm_supervisor_submission_history.pdf');
      message.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF error:', error);
      message.error('Failed to generate PDF');
    }
  };

  const legend = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      {[
        { icon: <CheckCircleFilled style={{ color: DAY_TONE.green.color, fontSize: 13 }} />, label: 'Fully completed (all OK)' },
        { icon: <ExclamationCircleFilled style={{ color: DAY_TONE.orange.color, fontSize: 13 }} />, label: 'Partial / mixed (half done or some reject)' },
        { icon: <CloseCircleFilled style={{ color: DAY_TONE.red.color, fontSize: 13 }} />, label: 'Not submitted (past day / today after 5 PM)' },
        { icon: <StopFilled style={{ color: DAY_TONE.breakdown.color, fontSize: 13 }} />, label: 'Machine breakdown (not counted)' },
        { icon: <span style={{ width: 10, height: 10, border: '1px solid #d1d5db', display: 'inline-block' }} />, label: 'Future / shift still open' },
        { icon: <span style={{ color: '#1d4ed8', fontWeight: 700, fontSize: 11 }}>Machine</span>, label: 'Click row / day for checkpoints' },
      ].map(({ icon, label }) => (
        <span key={label} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}>
          {icon} {label}
        </span>
      ))}
    </div>
  );

  const filterControls = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: isNarrow ? 6 : 8,
      flexWrap: 'wrap', width: isNarrow ? '100%' : 'auto',
    }}
    >
      <div style={{
        display: 'flex', border: '1px solid #d1d5db', borderRadius: 6,
        overflow: 'auto', maxWidth: '100%',
      }}
      >
        {['day', 'month', 'year', 'custom'].map((mode, i, arr) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            style={{
              padding: isNarrow ? '4px 10px' : '4px 14px',
              fontSize: isNarrow ? 11 : 12,
              fontWeight: 600, cursor: 'pointer', border: 'none', flexShrink: 0,
              background: viewMode === mode ? '#1e3a5f' : '#fff',
              color: viewMode === mode ? '#fff' : '#374151',
              borderRight: i < arr.length - 1 ? '1px solid #d1d5db' : 'none',
              transition: 'all .15s',
            }}
          >
            {mode.charAt(0).toUpperCase() + mode.slice(1)}
          </button>
        ))}
      </div>

      {viewMode === 'day' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <DatePicker
            value={selectedDayjs}
            onChange={(v) => v && setSelectedDayjs(v)}
            format="DD-MM-YYYY"
            allowClear={false}
            suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f', cursor: 'pointer' }} />}
            inputReadOnly
            style={{ borderRadius: 6, fontSize: 12, width: 148 }}
          />
          {clearFiltersButton}
        </div>
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
            style={{ border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
          >
            ‹
          </button>
          <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 100, textAlign: 'center' }}>
            {monthNames[selMonth]} {selYear}
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
            style={{ border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
          >
            ›
          </button>
          {clearFiltersButton}
        </div>
      )}

      {viewMode === 'year' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              onClick={() => setSelYear((y) => y - 1)}
              style={{ border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
            >
              ‹
            </button>
            <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 40, textAlign: 'center' }}>{selYear}</span>
            <button
              type="button"
              onClick={() => setSelYear((y) => y + 1)}
              style={{ border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}
            >
              ›
            </button>
            {clearFiltersButton}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MONTH_COLORS.map((m, idx) => (
              <Tooltip key={m.label} title={`Go to ${m.label}`}>
                <button
                  type="button"
                  onClick={() => scrollToMonth(idx)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#374151',
                    border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: m.bg, display: 'inline-block' }} />
                  {m.label}
                </button>
              </Tooltip>
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
            style={{ borderRadius: 6, fontSize: 12, width: 148 }}
          />
          <span style={{ fontSize: 12, color: '#6b7280' }}>to</span>
          <DatePicker
            value={customEnd ? dayjs(customEnd) : null}
            onChange={(v) => v && setCustomEnd(v.format('YYYY-MM-DD'))}
            format="DD-MM-YYYY"
            allowClear={false}
            inputReadOnly
            suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
            style={{ borderRadius: 6, fontSize: 12, width: 148 }}
          />
          {clearFiltersButton}
        </div>
      )}
    </div>
  );

  const topBar = (
    <div style={{
      display: 'flex',
      alignItems: isNarrow ? 'stretch' : 'center',
      justifyContent: 'space-between',
      flexDirection: isNarrow ? 'column' : 'row',
      marginBottom: 12,
      flexWrap: 'wrap',
      gap: 8,
      width: '100%',
    }}
    >
      {legend}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        width: isNarrow ? '100%' : 'auto', justifyContent: isNarrow ? 'flex-start' : 'flex-end',
      }}
      >
        {filterControls}
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading} size="small" style={{ borderRadius: 7 }} />
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleDownloadPDF}
          size="small"
          style={{ borderRadius: 7 }}
        >
          {isNarrow ? 'PDF' : 'Download PDF'}
        </Button>
      </div>
    </div>
  );

  const detailColumns = useMemo(() => {
    const fs = isNarrow ? 10 : isCompact ? 11 : 12;
    const cols = [
      {
        title: isNarrow ? 'List' : 'Checklist',
        key: 'checklist',
        width: isNarrow ? 72 : isCompact ? 96 : 120,
        onCell: (_, index) => ({
          rowSpan: checklistRowSpans[index] ?? 0,
          style: { verticalAlign: 'middle', background: '#f8fafc', fontWeight: 600 },
        }),
        render: (_, r) => (
          <Text style={{ fontSize: fs, color: '#1e3a5f', wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {r.checklist_name || '—'}
          </Text>
        ),
      },
      {
        title: isNarrow ? 'Code' : 'Code',
        key: 'code',
        width: isNarrow ? 56 : isCompact ? 72 : 88,
        render: (_, r) => (
          <Text strong style={{ fontSize: fs, color: '#1e3a5f', wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {r.checklist_item?.item_code || '—'}
          </Text>
        ),
      },
      {
        title: isNarrow ? 'Point' : 'Checkpoint',
      key: 'checkpoint',
        render: (_, r) => (
          <Text style={{ fontSize: fs, wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {r.checklist_item?.item_text || '—'}
          </Text>
        ),
    },
    {
      title: 'Type',
      key: 'type',
        width: isNarrow ? 52 : isCompact ? 64 : 72,
        render: (_, r) => <Text style={{ fontSize: fs }}>{itemTypeShort(r.checklist_item?.item_type)}</Text>,
    },
    {
        title: isNarrow ? 'Resp.' : 'Response',
      dataIndex: 'response_value',
      key: 'response',
        width: isNarrow ? 58 : isCompact ? 70 : 80,
        render: (v, r) => {
          const rejected = isRejectedResponse(v, r.checklist_item?.expected_value);
          return (
            <Text style={{ fontSize: fs, color: rejected ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
              {v || '—'}
            </Text>
          );
        },
      },
      {
        title: isNarrow ? 'Op.' : 'Operator',
      key: 'operator',
        width: isNarrow ? 64 : isCompact ? 80 : 96,
      render: (_, r) => (
          <Text style={{ fontSize: fs - 1, wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {r.operator_name || (r.operator_id ? `#${r.operator_id}` : '—')}
        </Text>
      ),
    },
    {
        title: isNarrow ? 'Time' : 'Submitted',
      dataIndex: 'submitted_at',
      key: 'submitted_at',
        width: isNarrow ? 72 : isCompact ? 92 : 110,
        render: (d) => (
          <Text type="secondary" style={{ fontSize: fs - 1, whiteSpace: 'normal' }}>
            {d ? dayjs(d).format(isNarrow ? 'DD/MM HH:mm' : 'DD MMM HH:mm') : '—'}
          </Text>
      ),
    },
  ];

    if (detailHasRemarks && !isNarrow) {
      cols.push({
        title: isCompact ? 'Note' : 'Remarks',
        key: 'remarks',
        width: isCompact ? 80 : 110,
      render: (_, r) => (
          <Text type="secondary" style={{ fontSize: fs - 1, wordBreak: 'break-word', whiteSpace: 'normal' }}>
            {r.operator_comments || '—'}
        </Text>
      ),
      });
    }

    return cols;
  }, [checklistRowSpans, detailHasRemarks, isNarrow, isCompact]);

  const detailCardView = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      {detailGroups.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>
          No checkpoint responses for this selection.
        </div>
      ) : detailGroups.map((group) => (
        <div
          key={group.name}
          style={{
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
          }}
        >
          <div style={{
            background: '#1e3a5f',
            color: '#fff',
            fontWeight: 700,
            fontSize: 12,
            padding: '8px 12px',
          }}
          >
            {group.name}
            <span style={{ fontWeight: 500, opacity: 0.85, marginLeft: 8 }}>
              ({group.items.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {group.items.map((r, idx) => {
              const rejected = isRejectedResponse(r.response_value, r.checklist_item?.expected_value);
              return (
                <div
                  key={r.id}
                  style={{
                    padding: '10px 12px',
                    borderTop: idx === 0 ? 'none' : '1px solid #e2e8f0',
                    background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 6, wordBreak: 'break-word' }}>
                    {r.checklist_item?.item_code ? (
                      <span style={{ color: '#1e3a5f', marginRight: 6 }}>{r.checklist_item.item_code}</span>
                    ) : null}
                    {r.checklist_item?.item_text || '—'}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '6px 10px',
                    fontSize: 12,
                  }}
                  >
                    <div>
                      <span style={{ color: '#64748b' }}>Type: </span>
                      {itemTypeShort(r.checklist_item?.item_type)}
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Response: </span>
                      <span style={{ color: rejected ? '#dc2626' : '#16a34a', fontWeight: 700 }}>
                        {r.response_value || '—'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Operator: </span>
                      {r.operator_name || (r.operator_id ? `#${r.operator_id}` : '—')}
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>Time: </span>
                      {r.submitted_at ? dayjs(r.submitted_at).format('DD MMM HH:mm') : '—'}
                    </div>
                    {r.operator_comments ? (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <span style={{ color: '#64748b' }}>Remarks: </span>
                        {r.operator_comments}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const table = (
    <div
      ref={tableScrollRef}
      style={{
        overflow: 'auto',
        width: '100%',
        maxWidth: '100%',
        maxHeight: isNarrow ? 'calc(100vh - 280px)' : 'calc(100vh - 360px)',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        background: '#fff',
      }}
    >
      <table style={{
        borderCollapse: 'separate',
        borderSpacing: 0,
        width: '100%',
        minWidth: tableMinW,
        fontSize: bodyFont,
        tableLayout: 'fixed',
      }}
      >
        <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: '#1e3a5f' }}>
          <tr style={{ background: '#1e3a5f' }}>
            <th style={{
              ...TH, width: slW, minWidth: slW, maxWidth: slW,
              left: 0, zIndex: 6,
            }}
            >
              Sl.
            </th>
            <th style={{
              ...TH, width: machineW, minWidth: machineW, maxWidth: machineW,
              textAlign: 'left', left: stickyMachineLeft, zIndex: 6,
            }}
            >
              Machines
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                style={colHeaderStyle(col)}
                {...(col.isMonthStart ? { 'data-month-start': col.monthIdx } : {})}
              >
                {col.day}
              </th>
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
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colSpanTotal} style={{ ...TD, textAlign: 'center', padding: 48, color: '#9ca3af' }}>
                No machine assignments found.
              </td>
            </tr>
          ) : rows.map((row, ii) => {
            const rowBg = ii % 2 === 0 ? '#fff' : '#f8fafc';
            return (
              <tr
                key={row.key}
                style={{ background: rowBg }}
              >
                <td style={{
                  ...TD, textAlign: 'center', color: '#6b7280', fontWeight: 600,
                  width: slW, minWidth: slW, maxWidth: slW,
                  position: 'sticky', left: 0, zIndex: 1, background: rowBg,
                }}
                >
                  {ii + 1}.
                </td>
                <td
                  style={{
                    ...TD,
                    width: machineW, minWidth: machineW, maxWidth: machineW,
                    position: 'sticky', left: stickyMachineLeft, zIndex: 1, background: rowBg,
                    cursor: 'pointer',
                  }}
                  onClick={() => openChecklistDetail(row)}
                  title="Click for all checkpoints"
                >
                  <span style={{
                    color: '#111827', fontWeight: 600, lineHeight: 1.4,
                    display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: isNarrow ? 'normal' : 'nowrap',
                    wordBreak: 'break-word',
                  }}
                  >
                    {row.machine_label}
                  </span>
                </td>
                {columns.map((col) => renderCell(row, col))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      {topBar}

      <div style={{
        border: '2px solid #1e3a5f',
        background: '#fff',
        overflow: 'hidden',
        width: '100%',
        maxWidth: '100%',
      }}
      >
        {table}
      </div>

      <Modal
        open={detailOpen}
        onCancel={() => { setDetailOpen(false); setDetailContext(null); }}
        footer={null}
        width={isNarrow ? '100%' : isCompact ? '94vw' : Math.min(1140, viewportW - 40)}
        style={{ top: isNarrow ? 0 : 20, maxWidth: '100%', paddingBottom: 0 }}
        styles={{
          body: {
            padding: isNarrow ? 10 : 16,
            overflowX: 'hidden',
            maxHeight: isNarrow ? 'calc(100dvh - 72px)' : 'calc(100vh - 100px)',
            overflowY: 'auto',
          },
        }}
        destroyOnClose
        title={(
          <div style={{ paddingRight: 28 }}>
            <div style={{
              fontWeight: 700,
              fontSize: isNarrow ? 13 : 15,
              color: '#1e3a5f',
              wordBreak: 'break-word',
              lineHeight: 1.35,
            }}
            >
              {detailContext?.machine_label || 'Machine'}
              {!isNarrow ? ' — Checkpoints & Responses' : null}
            </div>
            <div style={{ fontSize: isNarrow ? 11 : 12, color: '#6b7280', fontWeight: 400, marginTop: 2 }}>
              {isNarrow ? 'Checkpoints & Responses · ' : null}
              {detailContext?.dayKey ? `Date: ${detailContext.dayKey}` : `Period: ${getViewPeriodLabel()}`}
              {detailItems.length ? ` · ${detailItems.length} items` : null}
            </div>
          </div>
        )}
      >
        {isNarrow ? detailCardView : (
          <div style={{ width: '100%', overflowX: 'hidden' }}>
            <Table
              rowKey="id"
              size={isCompact ? 'small' : 'middle'}
              bordered
              tableLayout="fixed"
              pagination={false}
              columns={detailColumns}
              dataSource={detailItems}
              locale={{ emptyText: 'No checkpoint responses for this selection.' }}
              style={{ width: '100%' }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default PokaYokeCompletedLogs;
