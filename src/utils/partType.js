export const isInHouseType = (typeName) => {
  const normalized = String(typeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.includes('inhouse');
};
