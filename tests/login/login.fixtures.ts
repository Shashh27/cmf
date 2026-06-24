export const ROLES = {
  admin: {
    value: 'admin',
    label: 'Admin',
    username: process.env.TEST_ADMIN_USER || 'admin_user',
    password: process.env.TEST_ADMIN_PASS || 'admin_pass123',
    expectedRedirect: '/admin/dashboard',
  },
  supervisor: {
    value: 'supervisor',
    label: 'Supervisor',
    username: process.env.TEST_SUPERVISOR_USER || 'supervisor_user',
    password: process.env.TEST_SUPERVISOR_PASS || 'super_pass123',
    expectedRedirect: '/supervisor/production_logs',
  },
  operator: {
    value: 'operator',
    label: 'Operator',
    username: process.env.TEST_OPERATOR_USER || 'op_user',
    password: process.env.TEST_OPERATOR_PASS || 'op_pass123',
    machineId: process.env.TEST_MACHINE_ID || '1',
    machinePassword: process.env.TEST_MACHINE_PASS || 'machine_pass123',
    expectedRedirect: '/operator/dashboard',
  },
};

export const INVALID_CREDENTIALS = {
  username: 'invalid_user_xyz',
  password: 'wrongpassword999',
};