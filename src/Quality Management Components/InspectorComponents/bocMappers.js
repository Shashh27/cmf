/** Map CMF pdf-annotation dimension rows to Inspector BOC table rows */

import { DEFAULT_MEASURED_INSTRUMENT } from './inspectorConstants';

export { DEFAULT_MEASURED_INSTRUMENT };

/** Display label: use backend dimension_type as-is (Length, Diameter, GDT-Flatness, …). */
export function mapDimensionTypeToDimType(dimensionType) {
  const s = (dimensionType || '').toString().trim();
  return s || '—';
}

export function fmtTolPlus(val) {
  if (val == null || val === '') return '-';
  const t = String(val).trim();
  if (t === '0' || t === '0.0') return '-';
  return t.startsWith('+') || t.startsWith('-') ? t : `+${t}`;
}

export function fmtTolMinus(val) {
  if (val == null || val === '') return '-';
  const t = String(val).trim();
  if (t === '0' || t === '0.0') return '-';
  return t.startsWith('-') ? t : t.startsWith('+') ? t : `-${t}`;
}

export function mapDimensionsToBocRows(dimensions, { zone, instrument }, startId = 1) {
  if (!Array.isArray(dimensions)) return [];
  return dimensions.map((d, i) => {
    const id = startId + i;
    const nominal = d.nominal_value != null && d.nominal_value !== '' ? String(d.nominal_value) : (d.text || '—');
    return {
      key: id,
      id,
      zone: zone || 'A1',
      nominal,
      tolPlus: fmtTolPlus(d.upper_tolerance),
      tolMinus: fmtTolMinus(d.lower_tolerance),
      dimType: mapDimensionTypeToDimType(d.dimension_type),
      instrument: instrument || DEFAULT_MEASURED_INSTRUMENT,
      _raw: d,
    };
  });
}

/** Quad [[x,y],…] in PDF space from axis-aligned rect (same convention as detection). */
export function pdfRectToQuad(x, y, width, height) {
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ];
}

/** Parse stored master_boc.bbox JSON into PDF user-space rectangle (same coords as detection). */
export function parseMasterBocBboxToPdfRect(bboxStr) {
  if (!bboxStr || typeof bboxStr !== 'string') return null;
  try {
    const o = JSON.parse(bboxStr);
    const pts = o.bbox;
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const width = Math.max(...xs) - x;
    const height = Math.max(...ys) - y;
    if (width <= 0 || height <= 0) return null;
    const page = typeof o.page === 'number' && o.page >= 1 ? o.page : 1;
    return { x, y, width, height, page };
  } catch {
    return null;
  }
}

/** Parse master_boc_id from quality.stage_inspection.bbox JSON (set by ensure endpoint). */
export function parseMasterBocIdFromStageBbox(bboxStr) {
  if (!bboxStr || typeof bboxStr !== 'string') return null;
  try {
    const o = JSON.parse(bboxStr);
    const mid = o.master_boc_id;
    if (mid == null || mid === '') return null;
    const n = Number(mid);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Map API Master BOC row to Inspector table rows (includes bbox string for overlays). */
export function mapDbMasterBocRowsToTable(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    key: row.id,
    id: row.id,
    zone: row.zone,
    nominal: row.nominal != null ? String(row.nominal) : '—',
    tolPlus: fmtTolPlus(row.uppertol),
    tolMinus: fmtTolMinus(row.lowertol),
    /** Raw tolerances for pass/fail checks (same as DB). */
    uppertolNum: typeof row.uppertol === 'number' ? row.uppertol : parseFloat(String(row.uppertol ?? 0)) || 0,
    lowertolNum: typeof row.lowertol === 'number' ? row.lowertol : parseFloat(String(row.lowertol ?? 0)) || 0,
    dimType: mapDimensionTypeToDimType(row.dimension_type),
    instrument: row.measured_instrument || DEFAULT_MEASURED_INSTRUMENT,
    _bbox: row.bbox,
  }));
}

/** Stable 1-based balloon / table # order (by DB id), same sequence as overlays. */
export function withBalloonNumbers(rows) {
  if (!Array.isArray(rows)) return [];
  return [...rows]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .map((r, i) => ({ ...r, balloonNo: i + 1 }));
}

/** Build balloon overlay props; labels use row.balloonNo from withBalloonNumbers(). */
export function buildBalloonOverlaysFromBocRows(bocRows) {
  if (!Array.isArray(bocRows)) return [];
  const out = [];
  bocRows.forEach((r) => {
    const rect = parseMasterBocBboxToPdfRect(r._bbox);
    if (!rect) return;
    out.push({
      id: r.id,
      page: rect.page,
      pdfRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      label: String(r.balloonNo ?? ''),
    });
  });
  return out;
}
