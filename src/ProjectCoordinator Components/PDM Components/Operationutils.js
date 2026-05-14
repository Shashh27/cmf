// operationUtils.js
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

// Shared utility: simple axios → setState helper with loading + guard
export const fetchInto = async (url, setter, setLoading, guard) => {
  if (guard) return; // already loaded
  if (setLoading) setLoading(true);
  try {
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
  { required: true, message: `${label} is required` },
  {
    validator: (_, value) => {
      if (!value) return Promise.reject(new Error(`${label} is required`));
      return value.format('HH:mm:ss') === '00:00:00'
        ? Promise.reject(new Error(`${label} cannot be 00:00:00`))
        : Promise.resolve();
    },
  },
];