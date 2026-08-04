export function normalizeRoleKey(role) {
  const n = String(role || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
  if (n === 'admin') return 'admin';
  if (n.includes('project coordinator') || n === 'coordinator' || n === 'pc') {
    return 'project_coordinator';
  }
  if (n.includes('manufacturing coordinator') || n === 'mc') {
    return 'manufacturing_coordinator';
  }
  if (n.includes('inventory supervisor')) return 'inventory_supervisor';
  if (n.includes('supervisor')) return 'supervisor';
  if (n.includes('operator')) return 'operator';
  return n.replace(/\s+/g, '_');
}

export const ROLE_HOME_PATHS = {
  admin: '/admin/dashboard',
  project_coordinator: '/project_coordinator/oms/orders',
  manufacturing_coordinator: '/manufacturing_coordinator/dashboard',
  inventory_supervisor: '/inventory_supervisor/inventory-management/inventory-master',
  supervisor: '/supervisor/production_logs',
  operator: '/operator/dashboard',
};

export function roleHomePath(role) {
  return ROLE_HOME_PATHS[normalizeRoleKey(role)] || '/login';
}

export function roleRoutePrefix(role) {
  const home = roleHomePath(role);
  if (home === '/login') return null;
  const segment = home.split('/').filter(Boolean)[0];
  return segment ? `/${segment}` : null;
}
