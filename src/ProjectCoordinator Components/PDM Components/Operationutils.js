import axios from "axios";

// Shared utility: normalise a version string as the user types
export const normalizeVersion = (raw) => {
  let v = raw || '';
  
  // Strip leading 'v' or 'V' prefix for processing
  if (v.startsWith('v') || v.startsWith('V')) v = v.substring(1);
  
  // Allow only digits and dots
  v = v.replace(/[^0-9.]/g, '');
  
  // Prevent consecutive dots
  v = v.replace(/\.{2,}/g, '.');
  
  // Prevent leading dot
  if (v.startsWith('.')) v = v.substring(1);

  return v;
};

// Shared utility: get the latest revision from a list of documents
export const getLatestRevision = (docs) => {
  if (!docs || !Array.isArray(docs) || docs.length === 0) return null;
  const parseV = (v) => {
    const val = parseFloat(String(v || '0').replace(/^v/i, ''));
    return isNaN(val) ? 0 : val;
  };
  const sorted = [...docs].sort((a, b) => parseV(b.document_version) - parseV(a.document_version));
  const latest = sorted[0]?.document_version;
  if (!latest) return null;
  const clean = String(latest).replace(/^v/i, '');
  // If it's a simple integer, pad to 2 digits (e.g. "1" -> "01")
  return /^\d+$/.test(clean) ? clean.padStart(2, '0') : clean;
};

// Shared utility: simple axios → setState helper with loading + guard
export const fetchInto = async (url, setter, setLoading, guard) => {
  if (guard) return; // already loaded
  if (setLoading) setLoading(true);
  try {
    // Do not pass user_id: config (workcenters, machines, part-types, tools) and product data are shared for all roles
    const res = await axios.get(url);
    setter(res.data);
  } catch (e) {
    console.error(`Fetch error [${url}]:`, e);
  } finally {
    if (setLoading) setLoading(false);
  }
};
  
  // Shared rule: TimePicker must not be 00:00:00
  export const timePickerRules = (label) => [
    {
      validator: (_, value) => {
        if (!value) return Promise.reject(new Error(`${label} is required`));
        return value.format('HH:mm:ss') === '00:00:00'
          ? Promise.reject(new Error(`${label} cannot be 00:00:00`))
          : Promise.resolve();
      },
    },
  ];