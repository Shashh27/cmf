import { QUALITY_API_BASE_URL } from '../../Config/qualityconfig';
import { DEFAULT_MEASURED_INSTRUMENT } from './inspectorConstants';

const SUB_CATEGORIES_URL = `${QUALITY_API_BASE_URL}/quality/instruments/sub-categories?category=${encodeURIComponent('Instruments')}`;

/** Module-level cache so opening Set Instrument / Edit / Stamp does not refetch every time. */
let cachedSubCategories = null;
let inflight = null;

/**
 * Distinct instrument sub-category names for the Set Instrument dropdown.
 * Uses the lightweight /quality/instruments/sub-categories endpoint (not full tools list).
 */
export async function fetchInstrumentSubCategories({ force = false } = {}) {
  if (!force && cachedSubCategories) {
    return cachedSubCategories;
  }
  if (!force && inflight) {
    return inflight;
  }

  inflight = (async () => {
    const res = await fetch(SUB_CATEGORIES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data)
      ? data.map((s) => String(s || '').trim()).filter(Boolean)
      : [];
    cachedSubCategories = list;
    return list;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Build Select options including default + optional current value. */
export function buildInstrumentSelectOptions(subCategories = [], extraValues = []) {
  const seen = new Set();
  const merged = [];
  const push = (v) => {
    const t = (v || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    merged.push({ value: t, label: t });
  };
  push(DEFAULT_MEASURED_INSTRUMENT);
  (extraValues || []).forEach(push);
  (subCategories || []).forEach(push);
  return merged;
}
