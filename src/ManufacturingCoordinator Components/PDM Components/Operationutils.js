// Shared utility: normalise a version string as the user types
export const normalizeVersion = (raw) => {
    let v = raw || '';
    if (v && !v.startsWith('v')) v = 'v' + v;
    v = v.replace(/[^v0-9.a-zA-Z]/g, '');
    if (v.startsWith('v')) v = 'v' + v.substring(1).replace(/v/g, '');
    const parts = v.split('.');
    if (parts.length > 2) v = parts[0] + '.' + parts.slice(1).join('');
    const m = v.match(/^(v\d{0,2})(?:\.(\d{0,3}[a-zA-Z0-9]{0,3}))?$/);
    if (m) return (m[1] || 'v') + '.' + (m[2] ? m[2].substring(0, 3) : '');
    const init = v.match(/^(v\d{0,2})/);
    return init ? init[1] + '.' : 'v.';
  };
  
  // Shared utility: simple axios → setState helper with loading + guard
import axios from "axios";

const getCurrentUserId = () => {
  try {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const u = JSON.parse(stored);
    if (u?.id == null) return null;
    return u.id;
  } catch {
    return null;
  }
};

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