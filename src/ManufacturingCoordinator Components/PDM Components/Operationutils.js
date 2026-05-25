import axios from "axios";

// Shared utility: normalise a revision string as the user types
export const normalizeVersion = (raw) => {
    let v = raw || '';
    // Allow alphanumeric and common versioning symbols: . - _ / space
    v = v.replace(/[^0-9a-zA-Z\s._\/-]/g, '');
    return v;
  };
  
  // Shared utility: simple axios → setState helper with loading + guard

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