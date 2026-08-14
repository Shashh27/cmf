import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Minus, Plus, RefreshCw } from 'lucide-react';
import machineSvg from '/assets/shopfloor/mch.svg';
import { getApiWsUrl } from '../../auth/apiUrl';

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CONFIG = {
  originX: 600,
  originY: 250,
  tileWidth: 140,
  tileHeight: 70,
  gridMin: -15,
  gridMax: 30,
  machineWidth: 75,
  machineHeight: 75,
  machineGridUOffset: 0.5,
  machineGridVOffset: 0.5,
  machineAnchorYPercent: 0.30,   // visual base of machine is 30% from top of image (anchorY = 70% of height)
  machinePixelOffsetX: 0,        // optional fine-tune nudge
  machinePixelOffsetY: 0,        // optional fine-tune nudge
  viewPadding: 100,
  hoverScale: 1.10,
  gridLineWidth: 0.5,
  fontFamily: 'Inter, Segoe UI, sans-serif',
  machineSpacing: 1.0,
  lineGap: 1,
  machinesPerRow: 10,
  tooltipOffsetY: 10,
  tooltipArrowSize: 5,
  tooltipCornerRadius: 0,
  useFilters: true,
  // Per-line label config — add per-line overrides under `lines` keyed by LINE NAME (uppercase)
  lineLabelSettings: {
    box: true,
    width: 1.3,
    height: 0.44,
    textPadding: 0.08,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: '1.5px',
    borderWidth: 2,
    // lines: { 'MILLING': { uOffset: 0, vOffset: 0 }, ... }
    lines: {},
  },
};

// ─── Platform geometry ────────────────────────────────────────────────────────
const rx = 70;
const ry = 35;
const h  = 3.5;

// ─── Coordinate helpers ───────────────────────────────────────────────────────
const isoToScreen = (u, v) => ({
  x: CONFIG.originX + (u - v) * (CONFIG.tileWidth  / 2),
  y: CONFIG.originY + (u + v) * (CONFIG.tileHeight / 2),
});

// Cell centre = the platform top-face centre in screen space
const getCellCentre = (machine) => isoToScreen(
  machine.gridU + CONFIG.machineGridUOffset,
  machine.gridV + CONFIG.machineGridVOffset,
);

// getMachineX — machine image horizontally centred on cell centre
const getMachineX = (machine) =>
  getCellCentre(machine).x - CONFIG.machineWidth / 2 + CONFIG.machinePixelOffsetX;

// getMachineY — matches Vue exactly:
// anchorY = height * (1 - anchorYPercent) = 75 * 0.70 = 52.5
// getMachineY = cellCentre.y - anchorY  (image top = 52.5px above platform centre)
// So platform top (at getMachineY + anchorY) = cellCentre.y  ✓
const ANCHOR_Y = CONFIG.machineHeight * (1 - CONFIG.machineAnchorYPercent);
const getMachineY = (machine) =>
  getCellCentre(machine).y - ANCHOR_Y + CONFIG.machinePixelOffsetY;

// ─── Platform colours ─────────────────────────────────────────────────────────
const getPlatformColors = (state) => {
  const map = {
    PRODUCTION: { top: '#10b981', sideLeft: '#059669', sideRight: '#34d399', stroke: '#6ee7b7', glow: 'rgba(16,185,129,0.35)', hasGlow: true },
    IDLE:       { top: '#f59e0b', sideLeft: '#b45309', sideRight: '#d97706', stroke: '#fbbf24', glow: 'rgba(245,158,11,0.35)', hasGlow: true },
    OFF:        { top: '#9ca3af', sideLeft: '#6b7280', sideRight: '#d1d5db', stroke: '#9ca3af', glow: 'rgba(156,163,175,0.4)', hasGlow: true },
  };
  return map[state] ?? map['OFF'];
};

const getMachineFilter = (state) => {
  if (state === 'PRODUCTION') return 'sepia(0.2) saturate(1.6) hue-rotate(90deg) brightness(1.05)';
  if (state === 'IDLE')       return 'sepia(0.25) saturate(1.4) hue-rotate(0deg) brightness(1.02)';
  if (state === 'OFF')        return 'grayscale(0.85) contrast(0.80) saturate(0.1)';
  return 'none';
};

// ─── Work-center zone styles (labels above each work-center group) ────────────
const WORK_CENTER_PALETTE = [
  { accent: '#0f172a', bg: 'rgba(255,255,255,0.96)', border: '#cbd5e1', text: '#0f172a' },
  { accent: '#0284c7', bg: 'rgba(255,255,255,0.96)', border: '#7dd3fc', text: '#0c4a6e' },
  { accent: '#059669', bg: 'rgba(255,255,255,0.96)', border: '#6ee7b7', text: '#064e3b' },
  { accent: '#7c3aed', bg: 'rgba(255,255,255,0.96)', border: '#c4b5fd', text: '#4c1d95' },
  { accent: '#ea580c', bg: 'rgba(255,255,255,0.96)', border: '#fdba74', text: '#7c2d12' },
  { accent: '#be123c', bg: 'rgba(255,255,255,0.96)', border: '#fda4af', text: '#881337' },
];

const getWorkCenterStyle = (name) => {
  const key = (name || 'UNASSIGNED').trim().toUpperCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = ((hash << 5) - hash) + key.charCodeAt(i);
  return WORK_CENTER_PALETTE[Math.abs(hash) % WORK_CENTER_PALETTE.length];
};

const STATUS_LEGEND = [
  { key: 'PRODUCTION', label: 'PRODUCTION', color: '#10b981', glow: 'rgba(16,185,129,0.45)' },
  { key: 'IDLE',       label: 'IDLE',       color: '#f59e0b', glow: 'rgba(245,158,11,0.45)' },
  { key: 'OFF',        label: 'OFFLINE',    color: '#9ca3af', glow: 'rgba(156,163,175,0.45)' },
];

const TOOLTIP_STYLES = {
  IDLE:       { fill: 'rgba(15,23,42,0.96)', stroke: '#6b7280', text: '#ffffff', showDot: false, bounce: true },
  PRODUCTION: { fill: 'rgba(15,23,42,0.96)', stroke: '#6b7280', text: '#ffffff', showDot: false, bounce: true },
  OFF:        { fill: 'rgba(15,23,42,0.96)', stroke: '#6b7280', text: '#ffffff', showDot: false, bounce: false },
};

const getTooltipStyleForState = (state) => TOOLTIP_STYLES[state] || TOOLTIP_STYLES.OFF;

let _tooltipMeasureCtx = null;
const measureTooltipTextWidth = (text) => {
  if (typeof document !== 'undefined') {
    if (!_tooltipMeasureCtx) {
      const canvas = document.createElement('canvas');
      _tooltipMeasureCtx = canvas.getContext('2d');
    }
    _tooltipMeasureCtx.font = `800 10px ${CONFIG.fontFamily}`;
    return _tooltipMeasureCtx.measureText(text).width;
  }
  return text.length * 5.5;
};

/** V-shaped speech bubble — arrow tip nearly touches machine top (matches original layout) */
const getMachineTooltipLayout = (machine) => {
  const text = machine.machine_name || '';
  const padX = 6;
  const w = Math.ceil(measureTooltipTextWidth(text)) + padX * 2;
  const h = 22;
  const mx = getMachineX(machine);
  const my = getMachineY(machine);
  const cx = mx + CONFIG.machineWidth / 2;
  const arrow = CONFIG.tooltipArrowSize;
  const top = my - h - arrow - 6;
  return { cx, top, left: cx - w / 2, w, h, arrow };
};

const getMachineTooltipPath = ({ cx, top, left, w, h, arrow }) => {
  const bot = top + h;
  const right = left + w;
  return `M ${left} ${top} L ${right} ${top} L ${right} ${bot} `
    + `L ${cx + arrow} ${bot} L ${cx} ${bot + arrow} L ${cx - arrow} ${bot} L ${left} ${bot} Z`;
};

const normalizeDisplayStatus = (value) => {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return 'OFF';
  if (raw === 'ON') return 'IDLE';
  return raw;
};

function shouldShowDefaultTooltip(machine, activeStatusFilter) {
  const state = machine.machine_state;
  if (!activeStatusFilter) return state === 'IDLE' || state === 'PRODUCTION';
  if (activeStatusFilter === 'OFF') return false;
  return state === activeStatusFilter;
}
// Platform top-face centre (ay) = getMachineY + ANCHOR_Y = cellCentre.y (matches Vue exactly)
const MachinePlatform = ({ machine, loading }) => {
  if (loading) return null;
  const col = getPlatformColors(machine.machine_state);
  const cx  = getMachineX(machine) + CONFIG.machineWidth / 2;
  const ay  = getMachineY(machine) + ANCHOR_Y; // = cellCentre.y

  const topFace  = `${cx-rx},${ay} ${cx},${ay-ry} ${cx+rx},${ay} ${cx},${ay+ry}`;
  const leftWall = `M ${cx-rx} ${ay} L ${cx} ${ay+ry} L ${cx} ${ay+ry+h} L ${cx-rx} ${ay+h} Z`;
  const rightWall= `M ${cx} ${ay+ry} L ${cx+rx} ${ay} L ${cx+rx} ${ay+h} L ${cx} ${ay+ry+h} Z`;
  const glowPts  = `${cx-rx-4},${ay+h+1} ${cx},${ay+ry+3} ${cx+rx+4},${ay+h+1} ${cx},${ay-ry-2}`;

  return (
    <g>
      {col.hasGlow && (
        <polygon points={glowPts} fill={col.glow} opacity={0.65} filter="url(#base-glow-filter)" />
      )}
      <path d={leftWall}  fill={col.sideLeft}  stroke={col.stroke} strokeWidth={0.8} />
      <path d={rightWall} fill={col.sideRight} stroke={col.stroke} strokeWidth={0.8} />
      <polygon points={topFace} fill={col.top} stroke={col.stroke} strokeWidth={0.8} />
    </g>
  );
};

// ─── Normalise live-API record to internal shape ─────────────────────────────
const normalizeLiveRecord = (m) => {
  const machine_state = normalizeDisplayStatus(m.status);
  const workCenter = (m.work_center_name || m.work_center || 'Unassigned').trim();
  return {
    ...m,
    id:            m.machine_id,
    machine_name:  m.machine_name || `Machine ${m.machine_id}`,
    machine_state,
    work_center_name: workCenter,
    lineName:      workCenter.toUpperCase(),
  };
};

// ─── Position machines into isometric grid ────────────────────────────────────
// Groups by work center (lineName), assigns gridU/gridV.
const positionMachines = (data) => {
  const { machineSpacing: spacing, lineGap, machinesPerRow: perRow } = CONFIG;
  let currentU = 0;

  const lineMap = new Map();
  data.forEach(m => {
    const line = m.lineName || 'UNASSIGNED';
    if (!lineMap.has(line)) lineMap.set(line, []);
    lineMap.get(line).push(m);
  });

  // Preferred work-center display order
  const workCenterOrder = [
    'MILLING',
    'TURNING',
    'CYLINDRICAL GRINDING',
    'CUTTING MACHINE',
    'DIE SINKING',
    'SURFACE GRINDING',
    'THREAD GRINDING',
  ];
  const normalizeWcKey = (name) => {
    const n = (name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (n.includes('CYLINDR') && n.includes('GRIND')) return 'CYLINDRICAL GRINDING';
    if (n.includes('CUTTING')) return 'CUTTING MACHINE';
    if (n.includes('DIE') && n.includes('SINK')) return 'DIE SINKING';
    if (n.includes('SURFACE') && n.includes('GRIND')) return 'SURFACE GRINDING';
    if (n.includes('THREAD') && n.includes('GRIND')) return 'THREAD GRINDING';
    if (n === 'MILLING' || n.includes('MILLING')) return 'MILLING';
    if (n === 'TURNING' || n.includes('TURNING')) return 'TURNING';
    return n;
  };
  const sortedLines = [...lineMap.keys()].sort((a, b) => {
    const aNorm = normalizeWcKey(a);
    const bNorm = normalizeWcKey(b);
    if (aNorm === 'UNASSIGNED') return 1;
    if (bNorm === 'UNASSIGNED') return -1;
    const idxA = workCenterOrder.indexOf(aNorm);
    const idxB = workCenterOrder.indexOf(bNorm);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return aNorm.localeCompare(bNorm);
  });

  const positioned = [];
  for (const lineName of sortedLines) {
    const machines = lineMap.get(lineName);
    machines.sort((a, b) => (a.machine_name || '').localeCompare(b.machine_name || ''));
    const rows = Math.ceil(machines.length / perRow) || 1;
    machines.forEach((m, idx) => {
      const row = Math.floor(idx / perRow);
      const col = idx % perRow;
      positioned.push({
        ...m,
        lineName,
        gridU: currentU + row * spacing,
        gridV: col * spacing,
      });
    });
    currentU += (rows - 1) * spacing + 1 + lineGap;
  }
  return positioned;
};

const getMonitoringWsUrl = () => getApiWsUrl('monitoring/live/ws');

// ─── Compute line labels ──────────────────────────────────────────────────────
// Mirrors Vue's lineLabels computed exactly: one label per line, centered above the line's U span.
const computeLineLabels = (positioned) => {
  const { machineSpacing: spacing, lineGap, machinesPerRow: perRow } = CONFIG;
  const settings     = CONFIG.lineLabelSettings || {};
  const lineSettings = settings.lines || {};

  // Rebuild line map preserving insertion order
  const lineMap = new Map();
  positioned.forEach(m => {
    if (!lineMap.has(m.lineName)) lineMap.set(m.lineName, []);
    lineMap.get(m.lineName).push(m);
  });

  const labels = [];
  let currentU = 0;
  let lineIndex = 0;

  for (const [lineName, machines] of lineMap) {
    if (!machines.length) continue;
    const rows      = Math.ceil(machines.length / perRow) || 1;
    const nameKey   = lineName.toUpperCase();
    const cfg       = lineSettings[nameKey] || {};

    // Centre of this line's U span (same as Vue)
    let uCenter = currentU + (rows * spacing) / 2 + (cfg.uOffset ?? 0);
    let vCenter = -0.3 + (cfg.vOffset ?? 0);

    const sorted = [...machines].sort((a, b) => {
      if (a.gridV !== b.gridV) return a.gridV - b.gridV;
      return a.gridU - b.gridU;
    });
    const firstMachine = sorted[0];
    const rowStartX = getMachineX(firstMachine) + CONFIG.machineWidth / 2;
    const rowStartY = getMachineY(firstMachine);
    const bannerX = rowStartX;
    const bannerY = rowStartY - 118 - lineIndex * 4;
    const machineTopY = rowStartY - 6;

    labels.push({
      name:          cfg.text || nameKey,
      u:             uCenter,
      v:             vCenter,
      rowStartX,
      rowStartY,
      bannerX,
      bannerY,
      machineTopY,
      lineIndex,
      halfWidth:     (cfg.width    ?? settings.width    ?? 1.3) / 2,
      halfHeight:    (cfg.height   ?? settings.height   ?? 0.44) / 2,
      textPadding:   cfg.textPadding ?? settings.textPadding ?? 0.08,
      fontSize:      settings.fontSize      ?? 12,
      fontWeight:    settings.fontWeight    ?? '900',
      letterSpacing: settings.letterSpacing ?? '1.5px',
      borderWidth:   settings.borderWidth   ?? 2,
      box:           cfg.box ?? settings.box ?? true,
      bgColor:       cfg.bgColor     ?? settings.bgColor     ?? '#000000',
      borderColor:   cfg.borderColor ?? settings.borderColor ?? '#ffffff',
      textColor:     cfg.textColor   ?? settings.textColor   ?? '#ffffff',
    });

    currentU += (rows - 1) * spacing + 1 + lineGap;
    lineIndex += 1;
  }
  return labels;
};

// ─── Compute tight viewBox to fit all machines ────────────────────────────────
// Uses getMachineX/Y bounding rect + platform bottom for vertical extent.
const DEFAULT_ISO_ZOOM = 0.85;

const computeFitViewBox = (positioned, absoluteZoom = DEFAULT_ISO_ZOOM) => {
  if (!positioned || positioned.length === 0) {
    return { vb: { x: 0, y: 0, w: 1200 / absoluteZoom, h: 800 / absoluteZoom }, scale: absoluteZoom };
  }

  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  positioned.forEach(m => {
    const mx = getMachineX(m);
    const my = getMachineY(m);
    const ay = my + ANCHOR_Y; // platform top-face centre = cellCentre.y

    minX = Math.min(minX, mx);
    minY = Math.min(minY, my - 30);          // tooltip space above
    maxX = Math.max(maxX, mx + CONFIG.machineWidth);
    maxY = Math.max(maxY, ay + ry + h + 4);  // bottom of platform walls
  });

  const pad = CONFIG.viewPadding;
  minX -= pad; minY -= pad;
  maxX += pad; maxY += pad;

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.max(0.4, Math.min(6.0, absoluteZoom));
  const viewW = 1200 / scale;
  const viewH = 800 / scale;

  return {
    vb: { x: cx - viewW / 2, y: cy - viewH / 2, w: viewW, h: viewH },
    scale,
  };
};

// ─── Main component ───────────────────────────────────────────────────────────
const IsometricMachineView = ({ embedded = false, selectedMachineIds: externalSelectedIds = [], liveMachines = null }) => {
  const [machines,           setMachines]           = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [isRefreshing,       setIsRefreshing]       = useState(false);
  const [viewBox,            setViewBox]            = useState({ x: 0, y: 0, w: 1200, h: 800 });
  const [zoomScale,          setZoomScale]          = useState(1.0);
  const [hoveredMachine,     setHoveredMachine]     = useState(null);
  const [selectedMachine,    setSelectedMachine]    = useState(null);
  const [isPanning,          setIsPanning]          = useState(false);
  const [startPos,           setStartPos]           = useState({ x: 0, y: 0 });
  const [activeLine,         setActiveLine]         = useState(null);
  const [activeStatusFilter, setActiveStatusFilter] = useState(null);
  const [isMobile,           setIsMobile]           = useState(false);
  const svgRef = useRef(null);
  const hasFittedRef = useRef(false);
  const refreshFlashTimerRef = useRef(null);

  const computedViewBox = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  const svgColors = {
    bg: '#f1f5f9', panelBg: '#ffffff', panelBorder: '#e2e8f0',
    gridLine: 'rgba(100,116,139,0.18)',
    tooltipBg: '#1e293b', tooltipText: '#f1f5f9',
    hudBg: 'rgba(255,255,255,0.92)', hudBorder: 'rgba(203,213,225,0.85)',
    hudText: '#475569', hudDivider: '#cbd5e1',
    fitBg: '#e0f2fe', fitText: '#0284c7',
    labelBg: '#000000', labelBorder: '#ffffff', labelText: '#ffffff',
  };

  const flashRefresh = useCallback(() => {
    setIsRefreshing(true);
    if (refreshFlashTimerRef.current) window.clearTimeout(refreshFlashTimerRef.current);
    refreshFlashTimerRef.current = window.setTimeout(() => setIsRefreshing(false), 900);
  }, []);

  const applyPositioned = useCallback((positioned, { fit = false } = {}) => {
    setMachines(positioned);
    setLoading(false);
    flashRefresh();
    const shouldFit = (fit || !hasFittedRef.current) && positioned.length > 0;
    if (shouldFit) {
      const { vb, scale } = computeFitViewBox(positioned, DEFAULT_ISO_ZOOM);
      setViewBox(vb);
      setZoomScale(scale);
      hasFittedRef.current = true;
    }
  }, [flashRefresh]);

  // ── Responsive ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => () => {
    if (refreshFlashTimerRef.current) window.clearTimeout(refreshFlashTimerRef.current);
  }, []);

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect       = svg.getBoundingClientRect();
      const mouseX     = e.clientX - rect.left;
      const mouseY     = e.clientY - rect.top;
      const svgMouseX  = viewBox.x + (mouseX / rect.width)  * viewBox.w;
      const svgMouseY  = viewBox.y + (mouseY / rect.height) * viewBox.h;
      const factor     = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newScale   = Math.max(0.4, Math.min(6.0, zoomScale * factor));
      if (newScale === zoomScale) return;
      const nw = 1200 / newScale;
      const nh = 800  / newScale;
      setViewBox({
        x: svgMouseX - (mouseX / rect.width)  * nw,
        y: svgMouseY - (mouseY / rect.height) * nh,
        w: nw, h: nh,
      });
      setZoomScale(newScale);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [viewBox, zoomScale]);

  // ── Fetch & position ──────────────────────────────────────────────────────
  useEffect(() => {
    if (Array.isArray(liveMachines)) {
      const data = liveMachines.map(normalizeLiveRecord);
      const positioned = positionMachines(data);
      applyPositioned(positioned, { fit: !hasFittedRef.current });
      return undefined;
    }

    let socket;
    let fallbackTimer;
    let closed = false;

    const applySnapshot = (raw) => {
      const list = Array.isArray(raw) ? raw : [];
      const data = list.map(normalizeLiveRecord);
      const positioned = positionMachines(data);
      applyPositioned(positioned, { fit: !hasFittedRef.current });
    };

    const connectSocket = () => {
      socket = new WebSocket(getMonitoringWsUrl());

      socket.onmessage = (event) => {
        try {
          applySnapshot(JSON.parse(event.data));
        } catch (err) {
          console.error('Failed to parse monitoring websocket payload:', err);
        }
      };

      socket.onerror = () => {
        setLoading(false);
      };

      socket.onclose = () => {
        if (!closed) {
          fallbackTimer = window.setTimeout(connectSocket, 5000);
        }
      };
    };

    connectSocket();

    return () => {
      closed = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    };
  }, [liveMachines, applyPositioned]);

  // ── Derived data ──────────────────────────────────────────────────────────
  const filteredMachines = useMemo(() => {
    let r = machines;
    if (activeLine) r = r.filter(m => m.lineName === activeLine);
    if (activeStatusFilter) r = r.filter(m => m.machine_state === activeStatusFilter);
    if (externalSelectedIds.length > 0 && !externalSelectedIds.includes('ALL'))
      r = r.filter(m => externalSelectedIds.includes(m.machine_id));
    return r;
  }, [machines, activeLine, activeStatusFilter, externalSelectedIds]);

  // Depth-sort: painter's algorithm (same as Vue's sortedPlacedMachines)
  const sortedMachines = useMemo(
    () => [...filteredMachines].sort((a, b) => (a.gridU + a.gridV) - (b.gridU + b.gridV)),
    [filteredMachines],
  );

  const lineLabels = useMemo(() => computeLineLabels(machines), [machines]);

  const totalMachines   = machines.length;
  const totalProduction = machines.filter(m => m.machine_state === 'PRODUCTION').length;
  const totalIdle       = machines.filter(m => m.machine_state === 'IDLE').length;
  const totalOff        = machines.filter(m => m.machine_state === 'OFF').length;

  // ── Grid lines — dynamically cover the current viewBox extent ───────────────
  // Invert isoToScreen: u = ((sx-originX)/tw + (sy-originY)/th) / 2
  //                      v = ((sy-originY)/th - (sx-originX)/tw) / 2
  const { gridUValues, gridVValues } = useMemo(() => {
    const tw = CONFIG.tileWidth / 2, th = CONFIG.tileHeight / 2;
    const ox = CONFIG.originX,       oy = CONFIG.originY;
    const corners = [
      { sx: viewBox.x,              sy: viewBox.y },
      { sx: viewBox.x + viewBox.w,  sy: viewBox.y },
      { sx: viewBox.x,              sy: viewBox.y + viewBox.h },
      { sx: viewBox.x + viewBox.w,  sy: viewBox.y + viewBox.h },
    ];
    const us = corners.map(({ sx, sy }) => ((sx - ox) / tw + (sy - oy) / th) / 2);
    const vs = corners.map(({ sx, sy }) => ((sy - oy) / th - (sx - ox) / tw) / 2);
    const pad = 4;
    const uMin = Math.floor(Math.min(...us)) - pad;
    const uMax = Math.ceil(Math.max(...us))  + pad;
    const vMin = Math.floor(Math.min(...vs)) - pad;
    const vMax = Math.ceil(Math.max(...vs))  + pad;
    const uArr = []; for (let u = uMin; u <= uMax; u++) uArr.push(u);
    const vArr = []; for (let v = vMin; v <= vMax; v++) vArr.push(v);
    return { gridUValues: uArr, gridVValues: vArr };
  }, [viewBox]);

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const zoomToScale = useCallback((target) => {
    const s  = Math.max(0.4, Math.min(6.0, target));
    if (s === zoomScale) return;
    const cx = viewBox.x + viewBox.w / 2;
    const cy = viewBox.y + viewBox.h / 2;
    const nw = 1200 / s;
    const nh = 800  / s;
    setViewBox({ x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh });
    setZoomScale(s);
  }, [viewBox, zoomScale]);

  const zoomIn  = () => zoomToScale(zoomScale * 1.25);
  const zoomOut = () => zoomToScale(zoomScale / 1.25);

  const fitView = useCallback(() => {
    const { vb, scale } = computeFitViewBox(machines, DEFAULT_ISO_ZOOM);
    setViewBox(vb);
    setZoomScale(scale);
  }, [machines]);

  // ── Pan (middle-mouse drag) ───────────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    setIsPanning(true);
    setStartPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e) => {
    if (!isPanning) return;
    e.preventDefault();
    const dx   = e.clientX - startPos.x;
    const dy   = e.clientY - startPos.y;
    setStartPos({ x: e.clientX, y: e.clientY });
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewBox(vb => ({
      ...vb,
      x: vb.x - dx * (vb.w / rect.width),
      y: vb.y - dy * (vb.h / rect.height),
    }));
  };
  const stopPan = () => setIsPanning(false);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : '100vh',
      maxHeight: embedded ? '100%' : '100vh',
      overflow: 'hidden',
      background: '#f1f5f9', padding: embedded ? 0 : (isMobile ? 8 : 12), boxSizing: 'border-box',
    }}>
      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        flex: 1, gap: isMobile ? 8 : 12, width: '100%', height: '100%', minHeight: 0,
      }}>
        {/* Main card */}
        <div style={{
          width: '100%', height: '100%', borderRadius: embedded ? 0 : 6,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          position: 'relative', background: svgColors.panelBg,
          border: embedded ? 'none' : `1px solid ${svgColors.panelBorder}`,
        }}>

          {/* Stage */}
          <div style={{
            flex: 1, minHeight: 0, width: '100%', position: 'relative',
            padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: svgColors.bg, overflow: 'hidden',
          }}>
            {/* Status KPI tiles */}
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 10,
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4,
              padding: 8, borderRadius: 8, backdropFilter: 'blur(8px)',
              background: 'rgba(255,255,255,0.94)', border: `1px solid ${svgColors.panelBorder}`,
              boxShadow: '0 4px 16px rgba(15,23,42,0.06)',
              minWidth: 168,
            }}>
              {[
                { label: 'TOTAL',      value: totalMachines,  bg: '#f8fafc', color: '#1e293b', filter: null },
                { label: 'PRODUCTION', value: totalProduction, bg: '#ecfdf5', color: '#10b981', filter: 'PRODUCTION' },
                { label: 'IDLE',       value: totalIdle,       bg: '#fef3c7', color: '#f59e0b', filter: 'IDLE' },
                { label: 'OFF',        value: totalOff,        bg: '#f3f4f6', color: '#6b7280', filter: 'OFF' },
              ].map(tile => {
                const isActive = activeStatusFilter === tile.filter;
                return (
                  <div
                    key={tile.label}
                    onClick={() => setActiveStatusFilter(prev => prev === tile.filter ? null : tile.filter)}
                    style={{
                      padding: '6px 10px', textAlign: 'center', background: tile.bg,
                      borderRadius: 4, cursor: 'pointer',
                      border: isActive ? `2px solid ${tile.color}` : `1px solid ${svgColors.panelBorder}`,
                      boxShadow: isActive ? `0 0 0 2px ${tile.color}33` : 'none',
                      transition: 'all 0.15s', minWidth: 56,
                      transform: isActive ? 'scale(1.04)' : 'scale(1)',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: tile.color }}>{tile.value}</div>
                    <div style={{ fontSize: 8, fontWeight: 600, color: tile.color, marginTop: 1 }}>{tile.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Loading overlay */}
            {loading && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(1px)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', zIndex: 20,
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                  borderRadius: 12, background: 'rgba(255,255,255,0.80)',
                  border: '1px solid rgba(203,213,225,0.5)',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>Loading Live Factory Layout...</span>
                </div>
              </div>
            )}

            {/* Soft refresh flash on 5s websocket push */}
            {isRefreshing && !loading && (
              <div style={{
                position: 'absolute', top: 16, right: 16, zIndex: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, borderRadius: 8,
                background: 'rgba(240,253,244,0.95)', border: '1px solid #86efac',
                boxShadow: '0 2px 10px rgba(22,163,74,0.12)',
                pointerEvents: 'none',
              }}>
                <RefreshCw size={14} color="#16a34a" className="iso-refresh-spin" />
              </div>
            )}

            {/* ─── Isometric SVG ─── */}
            <svg
              ref={svgRef}
              viewBox={computedViewBox}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopPan}
              onMouseLeave={stopPan}
              preserveAspectRatio="xMidYMid meet"
              style={{
                width: '100%', height: '100%',
                cursor: isPanning ? 'grabbing' : 'grab',
                userSelect: 'none', outline: 'none',
              }}
            >
              <defs>
                <filter id="base-glow-filter" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
                </filter>
              </defs>

              {/* 1. Grid lines — span the full dynamic range */}
              <g stroke={svgColors.gridLine} strokeWidth={CONFIG.gridLineWidth} fill="none">
                {gridUValues.map(u => {
                  const vMin = gridVValues[0], vMax = gridVValues[gridVValues.length - 1];
                  const s = isoToScreen(u, vMin), e = isoToScreen(u, vMax);
                  return <line key={`gu-${u}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y} />;
                })}
                {gridVValues.map(v => {
                  const uMin = gridUValues[0], uMax = gridUValues[gridUValues.length - 1];
                  const s = isoToScreen(uMin, v), e = isoToScreen(uMax, v);
                  return <line key={`gv-${v}`} x1={s.x} y1={s.y} x2={e.x} y2={e.y} />;
                })}
              </g>

              {/* 2. Work-center labels */}
              {lineLabels.map(label => {
                const typeStyle = getWorkCenterStyle(label.name);
                const text = label.name;
                const bw = Math.max(text.length * 7.5 + 28, 88);
                const bh = 22;
                const bx = label.bannerX;
                const by = label.bannerY;
                const machineY = label.machineTopY;

                return (
                  <g key={`${label.name}-${label.lineIndex}`}>
                    <line
                      x1={bx} y1={machineY}
                      x2={bx} y2={by + bh}
                      stroke={typeStyle.accent}
                      strokeWidth={1.2}
                      strokeDasharray="5,4"
                      opacity={0.45}
                    />
                    <rect
                      x={bx - bw / 2} y={by}
                      width={bw} height={bh}
                      rx={3} ry={3}
                      fill={typeStyle.bg}
                      stroke={typeStyle.border}
                      strokeWidth={1.2}
                    />
                    <text
                      x={bx}
                      y={by + bh / 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={typeStyle.text}
                      fontSize={10}
                      fontWeight="800"
                      letterSpacing="1.2px"
                      fontFamily={CONFIG.fontFamily}
                    >
                      {text}
                    </text>
                  </g>
                );
              })}

              {/* 3. Machines — depth-sorted (painter's algorithm) */}
              {sortedMachines.map(machine => {
                const mx        = getMachineX(machine);
                const my        = getMachineY(machine);
                const { x: cx, y: cy } = getCellCentre(machine);
                const isHovered = hoveredMachine === machine.id;
                const dimmed    = activeLine && activeLine !== machine.lineName;
                const showTip   = !loading && (
                  isHovered || shouldShowDefaultTooltip(machine, activeStatusFilter)
                );
                const tipLayout = showTip ? getMachineTooltipLayout(machine) : null;
                const tipStyle  = getTooltipStyleForState(machine.machine_state);
                const tipBounce = !isHovered && (machine.machine_state === 'IDLE' || machine.machine_state === 'PRODUCTION');

                return (
                  <g
                    key={machine.id}
                    style={{ cursor: loading ? 'default' : 'pointer', opacity: dimmed ? 0.25 : 1.0 }}
                    onMouseEnter={() => !loading && setHoveredMachine(machine.id)}
                    onMouseLeave={() => setHoveredMachine(null)}
                    onClick={() => !loading && setSelectedMachine(machine)}
                  >
                    <MachinePlatform machine={machine} loading={loading} />

                    <g style={{
                      transformOrigin: `${cx}px ${cy}px`,
                      transform:  isHovered ? `scale(${CONFIG.hoverScale})` : 'scale(1)',
                      transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                    }}>
                      <image
                        href={machineSvg}
                        x={mx} y={my}
                        width={CONFIG.machineWidth}
                        height={CONFIG.machineHeight}
                        style={{
                          filter: loading
                            ? 'grayscale(0.5) contrast(0.9)'
                            : (CONFIG.useFilters ? getMachineFilter(machine.machine_state) : 'none'),
                        }}
                      />

                      {showTip && tipLayout && (
                        <g style={{ animation: tipBounce ? 'tooltipBounce 1.6s ease-in-out infinite' : 'none' }}>
                          <path
                            d={getMachineTooltipPath(tipLayout)}
                            fill={tipStyle.fill}
                            stroke={tipStyle.stroke}
                            strokeWidth={1.6}
                            opacity={0.98}
                          />
                          {tipStyle.showDot && (
                            <circle
                              cx={tipLayout.left + 12}
                              cy={tipLayout.top + tipLayout.h / 2}
                              r={4}
                              fill={tipStyle.stroke}
                            />
                          )}
                          <text
                            x={tipStyle.showDot ? tipLayout.left + 22 : tipLayout.cx}
                            y={tipLayout.top + tipLayout.h / 2}
                            textAnchor={tipStyle.showDot ? 'start' : 'middle'}
                            dominantBaseline="central"
                            fill={tipStyle.text}
                            fontSize={10}
                            fontWeight={800}
                            fontFamily={CONFIG.fontFamily}
                          >
                            {machine.machine_name}
                          </text>
                        </g>
                      )}
                    </g>
                  </g>
                );
              })}
            </svg>

            {/* Zoom + Fit + Legend (bottom left) */}
            <div style={{
              position: 'absolute', bottom: 16, left: 16, zIndex: 10,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              padding: '7px 12px', borderRadius: 10, backdropFilter: 'blur(10px)',
              background: svgColors.hudBg, border: `1px solid ${svgColors.hudBorder}`,
              boxShadow: '0 4px 18px rgba(15,23,42,0.08)',
            }}>
              <button onClick={zoomOut} title="Zoom Out"
                style={{ padding: 4, border: 'none', background: 'transparent', color: svgColors.hudText, cursor: 'pointer', borderRadius: 4, display: 'flex' }}>
                <Minus size={15} strokeWidth={2.5} />
              </button>
              <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 'bold', minWidth: 42, textAlign: 'center', color: svgColors.hudText }}>
                {Math.round(zoomScale * 100)}%
              </span>
              <button onClick={zoomIn} title="Zoom In"
                style={{ padding: 4, border: 'none', background: 'transparent', color: svgColors.hudText, cursor: 'pointer', borderRadius: 4, display: 'flex' }}>
                <Plus size={15} strokeWidth={2.5} />
              </button>
              <div style={{ width: 1, height: 18, background: svgColors.hudDivider }} />
              <button onClick={fitView}
                style={{ padding: '4px 10px', border: 'none', background: svgColors.fitBg, color: svgColors.fitText, cursor: 'pointer', borderRadius: 5, fontSize: 12, fontWeight: 700 }}>
                Fit
              </button>
              <div style={{ width: 1, height: 18, background: svgColors.hudDivider }} />
              {STATUS_LEGEND.map((item) => (
                <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                  <span style={{
                    width: 11, height: 11, borderRadius: 2, background: item.color,
                    boxShadow: `0 0 0 3px ${item.glow}`,
                    display: 'inline-block',
                  }} />
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                    color: '#475569', textTransform: 'uppercase',
                  }}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Machine details modal */}
      {selectedMachine && (
        <div
          onClick={() => setSelectedMachine(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(2,6,23,0.70)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 500, width: '90%', maxHeight: '85vh', background: '#fff', border: `1px solid ${svgColors.panelBorder}`, borderRadius: 8, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ padding: '10px 16px', borderBottom: `1px solid ${svgColors.panelBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#0284c7' }}>{selectedMachine.lineName}</span>
                <span style={{ color: '#94a3b8' }}>&gt;</span>
                <span>{selectedMachine.machine_name}</span>
                {(() => {
                  const s = selectedMachine.machine_state;
                  const cfg = {
                    PRODUCTION: { bg: '#d1fae5', color: '#065f46', border: '#10b981' },
                    IDLE:       { bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
                    OFF:        { bg: '#f3f4f6', color: '#374151', border: '#6b7280' },
                  }[s] || { bg: '#f3f4f6', color: '#374151', border: '#6b7280' };
                  return (
                    <span style={{ padding: '2px 10px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: '1px', background: cfg.bg, color: cfg.color, border: `1.5px solid ${cfg.border}` }}>
                      {s || 'UNKNOWN'}
                    </span>
                  );
                })()}
              </h2>
              <button onClick={() => setSelectedMachine(null)}
                style={{ padding: 8, border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', borderRadius: 4 }}>
                ✕
              </button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  ['SALE ORDER',    selectedMachine.sale_order_number || '—'],
                  ['PART NUMBER',   selectedMachine.part_number       || '—'],
                  ['OPERATION',     selectedMachine.operation_name    || '—'],
                  ['WORK CENTER',   selectedMachine.work_center_name  || selectedMachine.lineName || '—'],
                  ['MACHINE TYPE',  selectedMachine.machine_type      || '—'],
                  ...(selectedMachine.program_name
                    ? [['PROGRAM', selectedMachine.program_name.includes('\\')
                        ? selectedMachine.program_name.split('\\').pop()
                        : selectedMachine.program_name.includes('/')
                          ? selectedMachine.program_name.split('/').pop()
                          : selectedMachine.program_name]]
                    : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, color: '#1e293b', wordBreak: 'break-word' }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                {[
                  ['TARGET', selectedMachine.part_qty ?? 0, '#334155'],
                  ['PRODUCED', selectedMachine.produced_qty ?? 0, '#2563eb'],
                  ['APPROVED', selectedMachine.approved_qty ?? 0, '#16a34a'],
                  ['REJECTED', selectedMachine.rejected_qty ?? 0, '#dc2626'],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', color: '#94a3b8', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>
              {selectedMachine.last_updated && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>LAST UPDATED</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{selectedMachine.last_updated}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tooltipBounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes isoRefreshSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .iso-refresh-spin { animation: isoRefreshSpin 0.8s linear infinite; }
      `}</style>
    </div>
  );
};

export default IsometricMachineView;