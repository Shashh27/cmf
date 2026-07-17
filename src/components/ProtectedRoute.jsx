import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, user, normalizeRole } = useAuth();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const userRole = user.role || user.userRole;
  const normalized = normalizeRole(userRole);

  const rolePrefixes = {
    admin: '/admin',
    'project coordinator': '/project_coordinator',
    project_coordinator: '/project_coordinator',
    'manufacturing coordinator': '/manufacturing_coordinator',
    manufacturing_coordinator: '/manufacturing_coordinator',
    supervisor: '/supervisor',
    'inventory supervisor': '/inventory_supervisor',
    inventory_supervisor: '/inventory_supervisor',
    operator: '/operator',
  };

  const allowedPrefix =
    rolePrefixes[normalized] ||
    rolePrefixes[userRole] ||
    rolePrefixes[String(userRole || '').toLowerCase()];

  if (allowedPrefix && !location.pathname.startsWith(allowedPrefix)) {
    return <Navigate to={`${allowedPrefix}/dashboard`} replace />;
  }

  return children;
};

export default ProtectedRoute;
