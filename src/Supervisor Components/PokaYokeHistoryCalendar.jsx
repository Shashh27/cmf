import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker, Empty, Select, Space, Spin, message } from 'antd';
import dayjs from 'dayjs';
import {
  CalendarOutlined, CheckCircleFilled, ClockCircleOutlined, CloseCircleFilled, ReloadOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { PM_T, btnSharp, machineLabel, pmFetch } from './pmUtils';

const { Option } = Select;

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

const toYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseYMD = (str) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const freqLabel = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') {
    const v = item.interval_value;
    const u = item.interval_unit ?? '';
    if (!v && !u) return 'Time Based';
    return `Every ${v ?? ''} ${u}${v > 1 ? 's' : ''}`.trim();
  }
  if (ft === 'usage based') return item.trigger_hours ? `Every ${item.trigger_hours} hrs` : 'Usage Based';
  if (ft === 'condition based') return item.inspection_interval ? `${item.inspection_interval} inspection` : 'Condition Based';
  return '-';
};

const freqIcon = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') return <CalendarOutlined style={{ fontSize: 11 }} />;
  if (ft === 'usage based') return <ThunderboltOutlined style={{ fontSize: 11 }} />;
  if (ft === 'condition based') return <ClockCircleOutlined style={{ fontSize: 11 }} />;
  return null;
};

const freqColor = (item) => {
  const ft = (item.frequency_type ?? '').toLowerCase();
  if (ft === 'time based') return { color: '#0284c7', bg: '#e0f2fe', border: '#7dd3fc' };
  if (ft === 'usage based') return { color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd' };
  if (ft === 'condition based') return { color: '#059669', bg: '#d1fae5', border: '#6ee7b7' };
  return { color: '#6b7280', bg: '#f3f4f6', border: '#d1d5db' };
};

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
    cols.push({ key: ymd, day: cur.getDate(), monthIdx: cur.getMonth(), isToday: ymd === today, isMonthStart: cur.getDate() === 1 });
    cur.setDate(cur.getDate() + 1);
  }
  return cols;
};

const PokaYokeHistoryCalendar = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyData, setHistoryData] = useState([]);

  const now = new Date();
  const [viewMode, setViewMode] = useState('month');
  const [selectedDayjs, setSelectedDayjs] = useState(dayjs());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState(toYMD(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(toYMD(now));

  const selectedMachineMeta = useMemo(
    () => machines.find((m) => String(m.id) === String(selectedMachine)) || null,
    [machines, selectedMachine],
  );

  const loadHistory = useCallback(async () => {
    if (!selectedMachine) {
      setHistoryData([]);
      return;
    }
    setLoading(true);
    try {
      const data = await pmFetch(`/machines/${selectedMachine}/submissions`);
      setHistoryData(normalizePmSubmissions(data));
    } catch (e) {
      message.error(e.message || 'Failed to fetch checklist history');
    } finally {
      setLoading(false);
    }
  }, [selectedMachine]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const columns = useMemo(() => {
    if (viewMode === 'day') {
      const ymd = selectedDayjs.format('YYYY-MM-DD');
      return [{ key: ymd, day: selectedDayjs.date(), monthIdx: selectedDayjs.month(), isToday: ymd === toYMD(now) }];
    }
    if (viewMode === 'month') return buildMonthColumns(selYear, selMonth);
    if (viewMode === 'year') return buildYearColumns(selYear);
    if (viewMode === 'custom') return buildRangeColumns(customStart, customEnd);
    return [];
  }, [viewMode, selectedDayjs, selMonth, selYear, customStart, customEnd, now]);

  const grouped = useMemo(() => {
    const colKeySet = new Set(columns.map((c) => c.key));
    const map = {};
    for (const log of historyData) {
      const ymd = toYMD(new Date(log.completed_at));
      if (!colKeySet.has(ymd)) continue;
      const cid = String(log.checklist_id);
      const cName = log.checklist_name ?? `Checklist #${cid}`;
      if (!map[cid]) map[cid] = { id: cid, name: cName, items: {} };
      const logTs = new Date(log.completed_at).getTime();
      for (const item of (log.item_responses ?? [])) {
        if (item.response_value == null || String(item.response_value).trim() === '') continue;

        const ikey = String(item.item_id);
        if (!map[cid].items[ikey]) {
          map[cid].items[ikey] = {
            id: item.item_id,
            item_text: item.item_text ?? `Item #${item.item_id}`,
            remarks: item.remarks ?? null,
            sequence_number: item.sequence_number ?? null,
            frequency_type: item.frequency_type ?? null,
            interval_value: item.interval_value ?? null,
            interval_unit: item.interval_unit ?? null,
            trigger_hours: item.trigger_hours ?? null,
            inspection_interval: item.inspection_interval ?? null,
            expected_value: item.expected_value ?? null,
            is_required: item.is_required ?? true,
            submissions: {},
          };
        }
        const ex = map[cid].items[ikey].submissions[ymd];
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

  const TH = { border: '1px solid #d1d5db', padding: '8px 6px', background: '#f3f4f6', fontWeight: 700, fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' };
  const TD = { border: '1px solid #d1d5db', padding: '7px 10px', fontSize: 12, verticalAlign: 'middle' };
  const isYearOrCustom = viewMode === 'year' || viewMode === 'custom';
  const isDay = viewMode === 'day';
  const cellW = isDay ? 100 : 28;

  const colHeaderStyle = (col) => {
    if (isYearOrCustom) {
      const mc = MONTH_COLORS[col.monthIdx];
      return {
        ...TH,
        width: cellW, minWidth: cellW, padding: '6px 2px',
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
        width: cellW, minWidth: cellW, padding: '10px 8px', fontSize: 13,
        background: col.isToday ? '#dbeafe' : '#f3f4f6',
        color: col.isToday ? '#1d4ed8' : '#374151',
        borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
      };
    }
    return {
      ...TH,
      width: cellW, minWidth: cellW, padding: '6px 2px', fontSize: 11,
      background: col.isToday ? '#dbeafe' : '#f3f4f6',
      color: col.isToday ? '#1d4ed8' : '#374151',
      fontWeight: col.isToday ? 800 : 700,
      borderBottom: col.isToday ? '2px solid #3b82f6' : '1px solid #d1d5db',
    };
  };

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

  const colSpanTotal = 3 + columns.length;
  const monthNames = MONTH_COLORS.map((m) => m.label);

  return (
    <div style={{ background: PM_T.bg }}>
      <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Select machine"
            style={{ width: 260 }}
            loading={machinesLoading}
            value={selectedMachine}
            onFocus={fetchMachines}
            onChange={(v) => setSelectedMachine(v || null)}
          >
            {machines.map((m) => <Option key={m.id} value={m.id}>{machineLabel(m)}</Option>)}
          </Select>

          {selectedMachine && (
            <div style={{ display: 'flex', border: `1px solid ${PM_T.border}`, borderRadius: 6, overflow: 'hidden' }}>
              {['day', 'month', 'year', 'custom'].map((mode, i, arr) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    padding: '4px 14px',
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
          )}

          {selectedMachine && viewMode === 'day' && (
            <DatePicker
              value={selectedDayjs}
              onChange={(v) => v && setSelectedDayjs(v)}
              format="DD-MM-YYYY"
              allowClear={false}
              inputReadOnly
              suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
              style={{ width: 148 }}
            />
          )}

          {selectedMachine && viewMode === 'month' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => { let m = selMonth - 1; let y = selYear; if (m < 0) { m = 11; y -= 1; } setSelMonth(m); setSelYear(y); }} style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 100, textAlign: 'center' }}>{monthNames[selMonth]} {selYear}</span>
              <button type="button" onClick={() => { let m = selMonth + 1; let y = selYear; if (m > 11) { m = 0; y += 1; } setSelMonth(m); setSelYear(y); }} style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}>›</button>
            </div>
          )}

          {selectedMachine && viewMode === 'year' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => setSelYear((y) => y - 1)} style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}>‹</button>
              <span style={{ fontWeight: 700, fontSize: 12, color: '#1e3a5f', minWidth: 40, textAlign: 'center' }}>{selYear}</span>
              <button type="button" onClick={() => setSelYear((y) => y + 1)} style={{ border: `1px solid ${PM_T.border}`, borderRadius: 4, background: '#fff', cursor: 'pointer', padding: '2px 9px', fontSize: 13 }}>›</button>
            </div>
          )}

          {selectedMachine && viewMode === 'custom' && (
            <Space size={6}>
              <DatePicker
                value={customStart ? dayjs(customStart) : null}
                onChange={(v) => v && setCustomStart(v.format('YYYY-MM-DD'))}
                format="DD-MM-YYYY"
                allowClear={false}
                inputReadOnly
                suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
                style={{ width: 148 }}
              />
              <span style={{ fontSize: 12, color: PM_T.textSub }}>to</span>
              <DatePicker
                value={customEnd ? dayjs(customEnd) : null}
                onChange={(v) => v && setCustomEnd(v.format('YYYY-MM-DD'))}
                format="DD-MM-YYYY"
                allowClear={false}
                inputReadOnly
                suffixIcon={<CalendarOutlined style={{ color: '#1e3a5f' }} />}
                style={{ width: 148 }}
              />
            </Space>
          )}
        </Space>

        {selectedMachine && (
          <Button icon={<ReloadOutlined />} loading={loading} style={btnSharp} onClick={loadHistory}>
            Refresh
          </Button>
        )}
      </Space>

      {!selectedMachine ? (
        <div style={{ padding: '48px 12px', border: `1px dashed ${PM_T.border}`, background: '#fff', textAlign: 'center' }}>
          <Empty description="Select a machine" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: '#fff', border: `1px solid ${PM_T.border}` }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 40, minWidth: 40, position: 'sticky', left: 0, zIndex: 3 }}>Sl.</th>
                <th style={{ ...TH, minWidth: 220, textAlign: 'left', position: 'sticky', left: 40, zIndex: 3 }}>Check Point</th>
                <th style={{ ...TH, minWidth: 130 }}>Frequency</th>
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
              ) : grouped.length === 0 ? (
                <tr>
                  <td colSpan={colSpanTotal} style={{ ...TD, textAlign: 'center', padding: 48, color: PM_T.textMuted }}>
                    No checklist history found for {machineLabel(selectedMachineMeta)}.
                  </td>
                </tr>
              ) : grouped.map((checklist, ci) => {
                const items = Object.values(checklist.items).sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
                return (
                  <React.Fragment key={checklist.id}>
                    <tr>
                      <td
                        colSpan={colSpanTotal}
                        style={{
                          border: '1px solid #d1d5db',
                          background: '#1e3a5f',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 12,
                          padding: '7px 14px',
                          letterSpacing: 0.3,
                        }}
                      >
                        {ci + 1}. {checklist.name}
                      </td>
                    </tr>
                    {items.length === 0 ? (
                      <tr>
                        <td style={{ ...TD, textAlign: 'center', color: PM_T.textMuted }} />
                        <td colSpan={2 + columns.length} style={{ ...TD, color: PM_T.textMuted, fontStyle: 'italic' }}>No check points.</td>
                      </tr>
                    ) : items.map((item, ii) => (
                      <tr
                        key={item.id ?? ii}
                        style={{ background: ii % 2 === 0 ? '#fff' : '#fafafa' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#f0f6ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ii % 2 === 0 ? '#fff' : '#fafafa'; }}
                      >
                        <td style={{ ...TD, textAlign: 'center', color: PM_T.textSub, fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, background: 'inherit' }}>
                          {ii + 1}.
                        </td>
                        <td style={{ ...TD, position: 'sticky', left: 40, zIndex: 1, background: 'inherit' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                            {(item.is_required ?? true) && <span style={{ color: '#ef4444', fontWeight: 700, lineHeight: 1.5 }}>*</span>}
                            <span style={{ color: PM_T.text, lineHeight: 1.5 }}>{item.item_text}</span>
                          </div>
                          {item.remarks && <div style={{ fontSize: 11, color: PM_T.textMuted, marginTop: 2 }}>{item.remarks}</div>}
                          {item.expected_value && (
                            <div style={{ fontSize: 11, color: PM_T.textSub, marginTop: 2 }}>
                              Expected: <strong style={{ color: PM_T.textMid }}>{item.expected_value}</strong>
                            </div>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              color: freqColor(item).color,
                              background: freqColor(item).bg,
                              border: `1px solid ${freqColor(item).border}`,
                              borderRadius: 4,
                              padding: '2px 8px',
                            }}
                          >
                            {freqIcon(item)} {freqLabel(item)}
                          </span>
                        </td>
                        {columns.map((col) => renderCell(item.submissions, col, item.expected_value))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PokaYokeHistoryCalendar;
