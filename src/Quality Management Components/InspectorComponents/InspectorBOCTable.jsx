import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Table, Tag, Typography, Space, Button, Empty, Popover, Select, Divider, Input, message, Menu } from 'antd';
import { FilterOutlined, UnorderedListOutlined, EditOutlined, LeftOutlined, RightOutlined, ToolOutlined } from '@ant-design/icons';
import SetInstrumentModal from './SetInstrumentModal';
import UsedInstrumentModal from './UsedInstrumentModal';
import EditCharacteristicModal from './EditCharacteristicModal';
import { fetchInstrumentSubCategories } from './instrumentOptions';

const { Text } = Typography;

function dimTypeColor(type) {
  const s = (type || '').toString();
  if (!s || s === '—') return '#8c8c8c';
  const u = s.toUpperCase();
  const compact = u.replace(/[^A-Z0-9]/g, '');
  if (compact.includes('GDT') || u.includes('GD&T')) return '#722ed1';
  if (u.includes('SURFACE') || u.includes('ROUGH')) return '#faad14';
  if (u.includes('MATERIAL') || u.includes('NOTE')) return '#8c8c8c';
  if (u.includes('DIAMETER') || u.includes('∅') || u.includes('⌀') || /\bDIA\b/i.test(s)) return '#db6f21';
  return '#1890ff';
}

function parseMeasurementNum(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim();
  if (t === '—' || t === '-') return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function formatMean(vals) {
  if (!Array.isArray(vals) || !vals.length) return null;
  const numVals = vals.map(v => parseMeasurementNum(v)).filter(v => v != null);
  if (!numVals.length) return null;
  const sum = numVals.reduce((acc, v) => acc + v, 0);
  const mean = sum / numVals.length;
  if (!Number.isFinite(mean)) return null;
  return mean.toFixed(2);
}

function computeMeanFromStrings(strings) {
  return formatMean(strings);
}

function checkPassFail(value, record) {
  if (value == null || String(value).trim() === '') return null;
  const actual = parseMeasurementNum(value);
  const nominal = parseMeasurementNum(record.nominal);
  if (actual == null || nominal == null) return null;
  const ut = Math.abs(Number(record.uppertolNum) || 0);
  const lt = Math.abs(Number(record.lowertolNum) || 0);
  const hi = nominal + ut;
  const lo = nominal - lt;
  if (actual > hi || actual < lo) return 'fail';
  return 'pass';
}

function measureRowClassName(record, measureMode, selected) {
  const classes = [];
  if (selected) classes.push('ant-table-row-selected');
  if (!measureMode || !record?.stageInspectionId) return classes.join(' ');
  const status = checkPassFail(record.actualValue, record);
  if (status === 'pass') classes.push('qms-measure-row-pass');
  if (status === 'fail') classes.push('qms-measure-row-fail');
  return classes.join(' ');
}

const cellCenter = { textAlign: 'center' };
const MEASURE_SCROLL_X = 960;

function focusMeasureInput(stageId, index) {
  setTimeout(() => {
    const el = document.querySelector(`.measure-cell-stage-${stageId}-${index} input`);
    el?.focus();
    el?.select?.();
  }, 10);
}

function readMeasureInputs(stageId) {
  if (!stageId) return [];
  const inputs = [];
  for (let i = 0; i < 50; i++) {
    const el = document.querySelector(`.measure-cell-stage-${stageId}-${i} input`);
    if (el) {
      inputs.push(el.value ?? '');
    } else {
      break;
    }
  }
  return inputs;
}

const InspectorBOCTable = ({
  selectedIds = [],
  onSelectedIdsChange,
  onDeleteSelected,
  dataSource = [],
  totalCount,
  optionSource = [],
  filterDimTypes = [],
  filterZones = [],
  onFilterDimTypesChange,
  onFilterZonesChange,
  measureMode = false,
  onMeasurePatch,
  onSetInstrument,
  onEditCharacteristic,
  onSetUsedInstrument,
  operatorMeasureMode = false,
  onQuantityChange,
  quantityLocked = false,
  planEditLocked = false,
  quantityOptions = [],
  quantityNo = 1,
}) => {
  const [qtyInput, setQtyInput] = React.useState('');
  useEffect(() => {
    setQtyInput(String(quantityNo));
  }, [quantityNo]);

  // Prefetch instrument sub-categories so Set instrument / Edit open instantly
  useEffect(() => {
    if (operatorMeasureMode || typeof onSetInstrument !== 'function') return;
    void fetchInstrumentSubCategories().catch(() => {});
  }, [operatorMeasureMode, onSetInstrument]);

  const handleQtySubmit = () => {
    const val = (qtyInput || '').trim();
    if (!val) {
      setQtyInput(String(quantityNo));
      return;
    }
    const n = parseInt(val, 10);
    const max = quantityOptions.length;
    if (Number.isNaN(n) || n < 1 || n > max) {
      message.warning(`Quantity ${val} does not exist (Max: ${max})`);
      setQtyInput(String(quantityNo));
      return;
    }
    onQuantityChange?.(n);
  };

  const rangeAnchorIndexRef = useRef(null);
  const rootRef = useRef(null);
  const tableScrollRef = useRef(null);
  const suppressRowClickRef = useRef(false);
  const skipBlurSaveRef = useRef(false);
  const dragStateRef = useRef({ down: false, moved: false, startX: 0, startY: 0, scrollL: 0, scrollT: 0 });
  const [editingInstrumentRowId, setEditingInstrumentRowId] = React.useState(null);
  const [localColCount, setLocalColCount] = React.useState(null);
  const [tableBodyHeight, setTableBodyHeight] = useState(320);
  const [tableAreaHeight, setTableAreaHeight] = useState(360);
  const [instrumentModalOpen, setInstrumentModalOpen] = useState(false);
  const [instrumentModalRows, setInstrumentModalRows] = useState([]);
  const [instrumentSaving, setInstrumentSaving] = useState(false);
  const [usedInstrumentModalOpen, setUsedInstrumentModalOpen] = useState(false);
  const [usedInstrumentRecord, setUsedInstrumentRecord] = useState(null);
  const [usedInstrumentSubCategory, setUsedInstrumentSubCategory] = useState('');
  const [usedInstrumentSaving, setUsedInstrumentSaving] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalRecord, setEditModalRecord] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, record: null });

  const getTableScrollEl = useCallback(() => {
    const wrap = tableScrollRef.current;
    if (!wrap) return null;
    return wrap.querySelector('.ant-table-body') || wrap;
  }, []);

  const measurementCount = useMemo(() => {
    let dataMax = 0;
    dataSource.forEach(r => {
      if (r.measurements && r.measurements.length > dataMax) dataMax = r.measurements.length;
    });
    const base = Math.max(3, dataMax);
    if (localColCount === null || localColCount < base) return base;
    return localColCount;
  }, [dataSource, localColCount]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const wrap = tableScrollRef.current;
    if (!root || !wrap) return;

    const measure = () => {
      const toolbar = root.querySelector('.qms-boc-toolbar');
      const toolbarBottom = toolbar?.getBoundingClientRect().bottom
        ?? root.getBoundingClientRect().top + 44;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const areaHeight = Math.max(200, Math.floor(viewportHeight - toolbarBottom - 8));

      const header = wrap.querySelector('.ant-table-header');
      const headerH = header?.getBoundingClientRect().height ?? 39;
      const bodyH = Math.max(120, areaHeight - headerH);

      setTableAreaHeight(areaHeight);
      setTableBodyHeight(bodyH);
    };

    measure();
    requestAnimationFrame(() => requestAnimationFrame(measure));
    const delayed = window.setTimeout(measure, 120);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (root.parentElement) ro.observe(root.parentElement);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.clearTimeout(delayed);
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [dataSource.length, measureMode, measurementCount]);

  useEffect(() => {
    setLocalColCount(null);
  }, [quantityNo]);

  const handleAddColumn = () => {
    setLocalColCount(measurementCount + 1);
  };

  const handleRemoveColumn = () => {
    if (measurementCount > 1) {
      const newCount = measurementCount - 1;
      setLocalColCount(newCount);
      dataSource.forEach(record => {
        if (record.stageInspectionId && record.measurements && record.measurements.length > newCount) {
          const newList = record.measurements.slice(0, newCount);
          const meanStr = computeMeanFromStrings(newList);
          onMeasurePatch?.(record.stageInspectionId, {
            measurements: newList,
            measured_mean: meanStr
          });
        }
      });
    }
  };

  useEffect(() => {
    const wrap = tableScrollRef.current;
    if (!wrap || !measureMode) return;
    const onDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest?.('input, textarea, button, a, .ant-select, [role="combobox"]')) return;
      const scrollEl = getTableScrollEl();
      if (!scrollEl) return;
      dragStateRef.current = {
        down: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        scrollL: scrollEl.scrollLeft,
        scrollT: scrollEl.scrollTop,
      };
    };
    const onMove = (e) => {
      const st = dragStateRef.current;
      if (!st.down) return;
      const scrollEl = getTableScrollEl();
      if (!scrollEl) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        st.moved = true;
        scrollEl.scrollLeft = st.scrollL - dx;
        scrollEl.scrollTop = st.scrollT - dy;
        e.preventDefault();
      }
    };
    const onUp = () => {
      const st = dragStateRef.current;
      if (st.moved) {
        suppressRowClickRef.current = true;
        window.setTimeout(() => { suppressRowClickRef.current = false; }, 0);
      }
      st.down = false; st.moved = false;
    };
    wrap.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      wrap.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [measureMode, getTableScrollEl]);

  const dimTypeOptions = useMemo(() => {
    const s = new Set();
    optionSource.forEach(r => { if (r.dimType) s.add(r.dimType); });
    return [...s].sort().map(v => ({ value: v, label: v }));
  }, [optionSource]);

  const zoneOptions = useMemo(() => {
    const s = new Set();
    optionSource.forEach(r => { if (r.zone) s.add(r.zone); });
    return [...s].sort().map(v => ({ value: v, label: v }));
  }, [optionSource]);

  const filterActive = filterDimTypes.length > 0 || filterZones.length > 0;
  const filterContent = (
    <div style={{ width: 260 }}>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>Dimension type</Text>
      <Select mode="multiple" allowClear placeholder="All types" style={{ width: '100%', marginBottom: 12 }} options={dimTypeOptions} value={filterDimTypes} onChange={onFilterDimTypesChange} maxTagCount="responsive" />
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>Zone</Text>
      <Select mode="multiple" allowClear placeholder="All zones" style={{ width: '100%', marginBottom: 12 }} options={zoneOptions} value={filterZones} onChange={onFilterZonesChange} maxTagCount="responsive" />
      <Divider style={{ margin: '8px 0' }} />
      <Button size="small" type="link" onClick={() => { onFilterDimTypesChange?.([]); onFilterZonesChange?.([]); }} disabled={!filterActive} style={{ padding: 0 }}>Clear filters</Button>
    </div>
  );

  const saveCurrentRow = async (record) => {
    const stageId = record.stageInspectionId;
    if (!stageId || !onMeasurePatch) return;
    const mList = readMeasureInputs(stageId);
    const meanStr = computeMeanFromStrings(mList);
    const numVals = mList.map(v => parseMeasurementNum(v));
    const allFilled = numVals.length > 0 && numVals.every(v => v != null);
    await onMeasurePatch(stageId, { measurements: mList, measured_mean: meanStr || '', is_done: allFilled });
  };

  const handleMeasureKeyDown = useCallback((e, record, rowIndex, index, maxIndex) => {
    if (!record.stageInspectionId || record.measureLocked) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      void saveCurrentRow(record);
      if (index < maxIndex) focusMeasureInput(record.stageInspectionId, index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      void saveCurrentRow(record);
      if (index > 0) focusMeasureInput(record.stageInspectionId, index - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      skipBlurSaveRef.current = true;
      void saveCurrentRow(record).finally(() => {
        requestAnimationFrame(() => {
          skipBlurSaveRef.current = false;
        });
      });
      if (index < maxIndex) {
        focusMeasureInput(record.stageInspectionId, index + 1);
      } else {
        const next = dataSource[rowIndex + 1];
        if (next?.stageInspectionId) requestAnimationFrame(() => focusMeasureInput(next.stageInspectionId, 0));
      }
    }
  }, [dataSource, onMeasurePatch]);

  const renderMInput = useCallback((index, width, maxIndex) => (v, record, rowIndexArg) => {
    const rowIndex = typeof rowIndexArg === 'number' ? rowIndexArg : dataSource.findIndex(r => r.id === record.id);
    if (!measureMode) {
      return <div style={cellCenter}><Text style={{ fontSize: '11px' }}>{v != null && String(v).trim() !== '' ? String(v) : '—'}</Text></div>;
    }
    const locked = Boolean(record.measureLocked);
    return (
      <div style={cellCenter} className={`measure-cell-stage-${record.stageInspectionId}-${index}`}>
        <Input
          key={`m-${record.id}-${record.stageInspectionId}-${index}`}
          size="small"
          defaultValue={v ?? ''}
          disabled={locked}
          onBlur={() => { if (!locked && !skipBlurSaveRef.current) void saveCurrentRow(record); }}
          onKeyDown={(e) => handleMeasureKeyDown(e, record, rowIndex, index, maxIndex)}
          style={{ width, fontSize: 11, paddingInline: 6 }}
        />
      </div>
    );
  }, [measureMode, dataSource, onMeasurePatch, handleMeasureKeyDown]);

  const renderActualDisplay = useCallback((v, record) => {
    const display = v != null && String(v).trim() !== '' ? String(v) : '—';
    if (!measureMode || !record.stageInspectionId) {
      return <div style={cellCenter}><Text style={{ fontSize: '11px' }}>{display}</Text></div>;
    }
    const status = checkPassFail(v, record);
    return (
      <div style={cellCenter}>
        {status === 'pass' ? (
          <Tag color="success" bordered={false} style={{ margin: 0, borderRadius: '4px', fontWeight: 800, fontSize: '10px', minWidth: '42px', backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bcf0da' }}>{display}</Tag>
        ) : status === 'fail' ? (
          <Tag color="error" bordered={false} style={{ margin: 0, borderRadius: '4px', fontWeight: 800, fontSize: '10px', minWidth: '42px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>{display}</Tag>
        ) : (
          <Text strong style={{ fontSize: '11px', color: '#262626' }}>{display}</Text>
        )}
      </div>
    );
  }, [measureMode]);

  const columns = useMemo(() => {
    const baseCols = [
      { title: 'ID', dataIndex: 'balloonNo', key: 'balloonNo', width: 46, align: 'center', render: (n) => <Text style={{ color: '#595959', fontSize: 11 }}>{n}</Text> },
      { title: 'NOMINAL', dataIndex: 'nominal', key: 'nominal', width: 78, align: 'center', render: (v) => <Text strong style={{ fontSize: '11px' }}>{v}</Text> },
      { title: 'UTOL', dataIndex: 'tolPlus', key: 'tolPlus', width: 56, align: 'center', render: (v) => <Text style={{ color: v !== '-' && v !== '—' ? '#52c41a' : '#bfbfbf', fontSize: 11 }}>{v}</Text> },
      { title: 'LTOL', dataIndex: 'tolMinus', key: 'tolMinus', width: 56, align: 'center', render: (v) => <Text style={{ color: v !== '-' && v !== '—' ? '#ff4d4f' : '#bfbfbf', fontSize: 11 }}>{v}</Text> },
      { title: 'DIM TYPE', dataIndex: 'dimType', key: 'dimType', width: 108, align: 'left', onHeaderCell: () => ({ style: { borderLeft: '3px solid #bfbfbf' } }), onCell: (r) => ({ style: { borderLeft: `2.8px solid ${dimTypeColor(r.dimType)}` } }), render: (t) => <Text style={{ fontSize: '11px', fontWeight: 800, color: dimTypeColor(t), letterSpacing: '0.02em' }}>{t}</Text> },
      { title: 'ZONE', dataIndex: 'zone', key: 'zone', width: 52, align: 'center', render: (z) => <Text strong style={{ fontSize: '11px' }}>{z}</Text> },
    ];
    const actualCol = { title: 'ACTUAL', dataIndex: 'actualValue', key: 'actualValue', width: 64, align: 'center', render: renderActualDisplay };
    const mCols = [];
    for (let i = 0; i < measurementCount; i++) {
      mCols.push({ title: `M${i + 1}`, dataIndex: ['measurements', i], key: `m${i}`, width: 58, align: 'center', render: (v, record, idx) => renderMInput(i, 52, measurementCount - 1)(v, record, idx) });
    }
    const instrumentCol = {
      title: 'INSTRUMENT', dataIndex: 'instrument', key: 'instrument', width: 120, align: 'center',
      render: (instr, record) => {
        const displayVal = instr && instr !== 'default' ? instr : '';
        if (operatorMeasureMode && measureMode) {
          return (
            <Text style={{ fontSize: '11px', color: displayVal ? '#262626' : '#bfbfbf' }}>
              {displayVal || 'default'}
            </Text>
          );
        }
        const isEditing = measureMode && editingInstrumentRowId === record.id;
        if (isEditing) {
          return <Input size="small" autoFocus defaultValue={displayVal} placeholder="default" style={{ fontSize: 11, width: '100%' }} onBlur={(e) => { const val = e.target.value.trim() || 'default'; if (record.stageInspectionId) onMeasurePatch?.(record.stageInspectionId, { measured_instrument: val }); setEditingInstrumentRowId(null); }} onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingInstrumentRowId(null); }} />;
        }
        if (measureMode) {
          return <div style={{ cursor: 'pointer', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 22 }} onClick={(e) => { e.stopPropagation(); setEditingInstrumentRowId(record.id); }}><Text style={{ fontSize: '11px', color: displayVal ? '#262626' : '#bfbfbf' }}>{displayVal || 'default'}</Text><EditOutlined style={{ fontSize: 10, color: '#1890ff' }} /></div>;
        }
        return <Text style={{ fontSize: '11px', color: displayVal ? '#262626' : '#bfbfbf' }}>{displayVal || 'default'}</Text>;
      }
    };
    const usedInstrumentCol = {
      title: 'USED INSTRUMENT',
      dataIndex: 'usedInstrument',
      key: 'usedInstrument',
      width: 140,
      align: 'center',
      render: (val, record) => {
        const displayVal = (val || '').trim();
        const sub = (record.instrument || '').trim();
        const canPick = Boolean(record.stageInspectionId) && !record.measureLocked && sub && sub !== 'default';
        return (
          <div
            style={{
              cursor: canPick ? 'pointer' : 'not-allowed',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minHeight: 22,
              opacity: canPick ? 1 : 0.65,
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!canPick) {
                if (!sub || sub === 'default') message.warning('Supervisor has not assigned an instrument for this characteristic.');
                return;
              }
              setUsedInstrumentRecord(record);
              setUsedInstrumentSubCategory(sub);
              setUsedInstrumentModalOpen(true);
            }}
          >
            <Text
              style={{ fontSize: '11px', color: displayVal ? '#262626' : '#1890ff' }}
              ellipsis={{ tooltip: displayVal || sub || 'Select instrument' }}
            >
              {displayVal || sub || 'Select…'}
            </Text>
            {canPick ? <EditOutlined style={{ fontSize: 10, color: '#1890ff' }} /> : null}
          </div>
        );
      },
    };
    if (measureMode) {
      const measureCols = [baseCols[0], baseCols[5], baseCols[1], baseCols[2], baseCols[3], baseCols[4], actualCol, ...mCols, instrumentCol];
      if (operatorMeasureMode) measureCols.push(usedInstrumentCol);
      return measureCols;
    }
    return [...baseCols, instrumentCol];
  }, [measureMode, measurementCount, renderMInput, renderActualDisplay, editingInstrumentRowId, onMeasurePatch, operatorMeasureMode]);

  const canEditInstrument = useCallback((record) => {
    if (planEditLocked && !measureMode) return false;
    if (measureMode && record?.measureLocked) return false;
    return typeof onSetInstrument === 'function';
  }, [planEditLocked, measureMode, onSetInstrument]);

  const openInstrumentModal = useCallback((record) => {
    let targets;
    if (record) {
      targets =
        selectedIds.includes(record.id) && selectedIds.length > 1
          ? dataSource.filter((r) => selectedIds.includes(r.id))
          : [record];
    } else {
      targets = dataSource.filter((r) => selectedIds.includes(r.id));
    }

    targets = targets.filter((r) => canEditInstrument(r));
    if (!targets.length) {
      if (planEditLocked && !measureMode) message.warning('Plan is confirmed. Instrument cannot be changed.');
      else if (selectedIds.length) message.warning('No editable rows in the current selection.');
      else message.warning('Select one or more rows first.');
      return;
    }

    setInstrumentModalRows(targets);
    setInstrumentModalOpen(true);
  }, [canEditInstrument, selectedIds, dataSource, planEditLocked, measureMode]);

  const editableSelectedCount = useMemo(
    () => dataSource.filter((r) => selectedIds.includes(r.id) && canEditInstrument(r)).length,
    [dataSource, selectedIds, canEditInstrument],
  );

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys: selectedIds,
      columnWidth: 36,
      onChange: (keys, selectedRows) => {
        const last = selectedRows[selectedRows.length - 1]?.id ?? keys[keys.length - 1] ?? null;
        onSelectedIdsChange?.(keys, last);
        if (last != null) rangeAnchorIndexRef.current = dataSource.findIndex((r) => r.id === last);
      },
    }),
    [selectedIds, onSelectedIdsChange, dataSource],
  );

  const handleInstrumentSave = useCallback(async (instrument) => {
    if (!instrumentModalRows.length || !onSetInstrument) return;
    setInstrumentSaving(true);
    try {
      for (const row of instrumentModalRows) {
        await onSetInstrument(row, instrument);
      }
      message.success(
        instrumentModalRows.length > 1
          ? `Instrument updated for ${instrumentModalRows.length} rows.`
          : 'Instrument updated.',
      );
      setInstrumentModalOpen(false);
      setInstrumentModalRows([]);
    } finally {
      setInstrumentSaving(false);
    }
  }, [instrumentModalRows, onSetInstrument]);

  const canEditRow = useCallback((record) => {
    if (planEditLocked || measureMode || operatorMeasureMode) return false;
    return typeof onEditCharacteristic === 'function' && Boolean(record?.id);
  }, [planEditLocked, measureMode, operatorMeasureMode, onEditCharacteristic]);

  const openEditModal = useCallback((record) => {
    if (!record) return;
    if (!canEditRow(record)) {
      if (planEditLocked) message.warning('Plan is confirmed. Characteristics cannot be edited.');
      else if (measureMode) message.warning('Switch to Plan to edit characteristic values.');
      else message.warning('This row cannot be edited.');
      return;
    }
    if (!selectedIds.includes(record.id)) {
      onSelectedIdsChange?.([record.id], record.id);
    }
    setEditModalRecord(record);
    setEditModalOpen(true);
  }, [canEditRow, planEditLocked, measureMode, selectedIds, onSelectedIdsChange]);

  const handleEditSave = useCallback(async (values) => {
    if (!editModalRecord || !onEditCharacteristic) return;
    setEditSaving(true);
    try {
      await onEditCharacteristic(editModalRecord, values);
      message.success('Characteristic updated.');
      setEditModalOpen(false);
      setEditModalRecord(null);
    } finally {
      setEditSaving(false);
    }
  }, [editModalRecord, onEditCharacteristic]);

  const handleRowContextMenu = useCallback((record, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (operatorMeasureMode) return;
    if (!selectedIds.includes(record.id)) {
      onSelectedIdsChange?.([record.id], record.id);
    }
    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      record,
    });
  }, [operatorMeasureMode, selectedIds, onSelectedIdsChange]);

  const contextMenuItems = useMemo(() => {
    const record = contextMenu.record;
    const instrumentOk = record && canEditInstrument(record);
    const editOk = record && canEditRow(record);
    return [
      {
        key: 'set-instrument',
        icon: <ToolOutlined />,
        label: 'Set instrument',
        disabled: !instrumentOk,
      },
      {
        key: 'edit',
        icon: <EditOutlined />,
        label: 'Edit',
        disabled: !editOk,
      },
    ];
  }, [contextMenu.record, canEditInstrument, canEditRow]);

  const handleContextMenuClick = useCallback(({ key }) => {
    const record = contextMenu.record;
    setContextMenu((prev) => ({ ...prev, open: false }));
    if (!record) return;
    if (key === 'set-instrument') openInstrumentModal(record);
    if (key === 'edit') openEditModal(record);
  }, [contextMenu.record, openInstrumentModal, openEditModal]);

  useEffect(() => {
    if (!contextMenu.open) return;
    const close = () => setContextMenu((prev) => ({ ...prev, open: false }));
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu.open]);

  const handleUsedInstrumentSave = useCallback(async (usedInst) => {
    if (!usedInstrumentRecord || !onSetUsedInstrument) return;
    setUsedInstrumentSaving(true);
    try {
      await onSetUsedInstrument(usedInstrumentRecord, usedInst);
      message.success('Used instrument updated.');
      setUsedInstrumentModalOpen(false);
      setUsedInstrumentRecord(null);
      setUsedInstrumentSubCategory('');
    } finally {
      setUsedInstrumentSaving(false);
    }
  }, [usedInstrumentRecord, onSetUsedInstrument]);

  const badge = filterActive ? `${dataSource.length} / ${totalCount ?? dataSource.length}` : String(dataSource.length);
  const handleRowClick = useCallback((record, index, e) => {
    if (suppressRowClickRef.current || e.target?.closest?.('input, textarea, button, a, .ant-select, .ant-input, .anticon, .ant-checkbox-wrapper, .ant-table-selection-column')) return;
    if (e.ctrlKey || e.metaKey) {
      const id = record.id;
      if (selectedIds.includes(id)) {
        onSelectedIdsChange?.(selectedIds.filter((x) => x !== id), id);
      } else {
        onSelectedIdsChange?.([...selectedIds, id], id);
      }
      rangeAnchorIndexRef.current = index;
      return;
    }
    if (e.shiftKey && rangeAnchorIndexRef.current != null) {
      const a = Math.min(rangeAnchorIndexRef.current, index), b = Math.max(rangeAnchorIndexRef.current, index);
      onSelectedIdsChange?.(dataSource.slice(a, b + 1).map(r => r.id), record.id);
      return;
    }
    rangeAnchorIndexRef.current = index; onSelectedIdsChange?.([record.id], record.id);
  }, [dataSource, onSelectedIdsChange, selectedIds]);

  return (
    <div ref={rootRef} style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
      <div className="qms-boc-toolbar" style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4, flexShrink: 0 }}>
        <Space wrap><UnorderedListOutlined style={{ fontSize: 16, color: '#1890ff' }} /><Text strong style={{ fontSize: '12px', textTransform: 'uppercase' }}>Characteristics</Text><Tag color="blue" bordered={false} style={{ margin: 0, borderRadius: '4px', fontSize: '9px' }}>{badge}</Tag>
          {selectedIds.length > 0 && (
            <Tag bordered={false} style={{ margin: 0, borderRadius: '4px', fontSize: '9px', background: '#f0f5ff', color: '#1d4ed8' }}>
              {selectedIds.length} selected
            </Tag>
          )}
          {measureMode && !operatorMeasureMode && (
            <Space size={4}>
              <Button size="small" type="dashed" onClick={handleAddColumn} style={{ fontSize: 10, height: 22, padding: '0 8px' }}>+ Add Column</Button>
              <Button size="small" type="dashed" danger onClick={handleRemoveColumn} disabled={measurementCount <= 1} style={{ fontSize: 10, height: 22, padding: '0 8px' }}>- Remove Column</Button>
            </Space>
          )}
        </Space>
        <Space wrap>
          {measureMode && (
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1px 4px', gap: 6 }}>
              <Button size="small" type="text" icon={<LeftOutlined style={{ fontSize: 10 }} />} disabled={quantityNo === 1 || quantityOptions.length <= 1} onClick={() => { const idx = quantityOptions.findIndex(o => o.value === quantityNo); if (idx > 0) onQuantityChange?.(quantityOptions[idx - 1].value); }} style={{ width: 22, height: 22, padding: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 50, gap: 2 }}>
                <Input size="small" variant="borderless" value={qtyInput} onChange={(e) => setQtyInput(e.target.value)} onPressEnter={handleQtySubmit} onBlur={handleQtySubmit} style={{ width: 24, textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#334155', padding: 0, height: '22px', fontFamily: '"JetBrains Mono", monospace' }} />
                <Text style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, userSelect: 'none' }}>/ {quantityOptions.length}</Text>
              </div>
              <Button size="small" type="text" icon={<RightOutlined style={{ fontSize: 10 }} />} disabled={quantityNo === quantityOptions.length || quantityOptions.length <= 1} onClick={() => { const idx = quantityOptions.findIndex(o => o.value === quantityNo); if (idx >= 0 && idx < quantityOptions.length - 1) onQuantityChange?.(quantityOptions[idx + 1].value); }} style={{ width: 22, height: 22, padding: 0 }} />
            </div>
          )}
          {typeof onSetInstrument === 'function' && !operatorMeasureMode && (
            <Button
              size="small"
              icon={<EditOutlined />}
              disabled={editableSelectedCount === 0}
              onClick={() => openInstrumentModal()}
              style={{ fontSize: '9px' }}
              title="Select rows with checkboxes, then set instrument for all"
            >
              Set instrument{editableSelectedCount > 1 ? ` (${editableSelectedCount})` : ''}
            </Button>
          )}
          {typeof onDeleteSelected === 'function' && !planEditLocked && !operatorMeasureMode && <Button size="small" danger disabled={!selectedIds.length} onClick={onDeleteSelected} style={{ fontSize: '9px' }}>Delete</Button>}
          <Popover content={filterContent} title="Filter" trigger="click" placement="bottomRight"><Button size="small" type={filterActive ? 'primary' : 'text'} icon={<FilterOutlined style={{ fontSize: 14, color: filterActive ? undefined : '#64748b' }} />} /></Popover>
        </Space>
      </div>
      <div
        ref={tableScrollRef}
        className="qms-boc-table-wrap"
        style={{
          height: tableAreaHeight,
          flex: '0 0 auto',
          minHeight: 200,
          overflow: 'hidden',
          overscrollBehavior: 'contain',
          cursor: measureMode ? 'grab' : 'default',
        }}
      >
        <style>{`
          .qms-boc-table-wrap .ant-table-body {
            overflow-y: scroll !important;
            overflow-x: auto !important;
            scrollbar-width: thin;
            scrollbar-color: #94a3b8 #f1f5f9;
          }
          .qms-boc-table-wrap .ant-table-body::-webkit-scrollbar {
            width: 10px;
            height: 10px;
          }
          .qms-boc-table-wrap .ant-table-body::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 5px;
          }
          .qms-boc-table-wrap .ant-table-body::-webkit-scrollbar-thumb {
            background: #94a3b8;
            border-radius: 5px;
            border: 2px solid #f1f5f9;
          }
          .qms-boc-table-wrap .ant-table-body::-webkit-scrollbar-thumb:hover {
            background: #64748b;
          }
          .qms-boc-table-wrap .qms-measure-row-pass > td {
            background-color: #f0fdf4 !important;
          }
          .qms-boc-table-wrap .qms-measure-row-fail > td {
            background-color: #fef2f2 !important;
          }
          .qms-boc-table-wrap .qms-measure-row-pass.ant-table-row-selected > td {
            background-color: #dcfce7 !important;
          }
          .qms-boc-table-wrap .qms-measure-row-fail.ant-table-row-selected > td {
            background-color: #fee2e2 !important;
          }
        `}</style>
        {dataSource.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={totalCount ? 'No rows match filters' : 'Choose Select or Stamp, then use the tools on the drawing'} style={{ marginTop: 24 }} /> : (
          <Table
            size="small"
            dataSource={dataSource}
            columns={columns}
            pagination={false}
            rowKey="id"
            scroll={measureMode ? { x: MEASURE_SCROLL_X + 36, y: tableBodyHeight } : { y: tableBodyHeight }}
            rowSelection={rowSelection}
            rowClassName={(record) => measureRowClassName(record, measureMode, selectedIds.includes(record.id))}
            onRow={(r, i) => ({
              onClick: (e) => handleRowClick(r, i, e),
              onContextMenu: (e) => handleRowContextMenu(r, e),
            })}
          />
        )}
      </div>
      <SetInstrumentModal
        open={instrumentModalOpen}
        record={instrumentModalRows[0] || null}
        rowCount={instrumentModalRows.length}
        onCancel={() => {
          setInstrumentModalOpen(false);
          setInstrumentModalRows([]);
        }}
        onOk={handleInstrumentSave}
        confirmLoading={instrumentSaving}
      />
      <UsedInstrumentModal
        open={usedInstrumentModalOpen}
        record={usedInstrumentRecord}
        subCategory={usedInstrumentSubCategory}
        onCancel={() => {
          setUsedInstrumentModalOpen(false);
          setUsedInstrumentRecord(null);
          setUsedInstrumentSubCategory('');
        }}
        onOk={handleUsedInstrumentSave}
        confirmLoading={usedInstrumentSaving}
      />
      <EditCharacteristicModal
        open={editModalOpen}
        record={editModalRecord}
        onCancel={() => {
          setEditModalOpen(false);
          setEditModalRecord(null);
        }}
        onOk={handleEditSave}
        confirmLoading={editSaving}
      />
      {contextMenu.open ? (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1100,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
            borderRadius: 8,
            background: '#fff',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Menu
            selectable={false}
            items={contextMenuItems}
            onClick={handleContextMenuClick}
            style={{ border: 'none', minWidth: 160 }}
          />
        </div>
      ) : null}
    </div>
  );
};

export default InspectorBOCTable;
