import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

function roleHomePrefix(role) {
  const n = String(role || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
  if (n === 'admin') return '/admin';
  if (n.includes('project coordinator') || n === 'pc') return '/project_coordinator';
  if (n.includes('manufacturing coordinator') || n === 'mc') return '/manufacturing_coordinator';
  if (n.includes('inventory supervisor')) return '/inventory_supervisor';
  if (n.includes('supervisor')) return '/supervisor';
  if (n.includes('operator')) return '/operator';
  return null;
}

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();

  // Fallback if context has not re-rendered yet after login
  let effectiveUser = user;
  if (!effectiveUser) {
    try {
      effectiveUser = JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      effectiveUser = null;
    }
  }

  if (!isAuthenticated && !effectiveUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const allowedPrefix = roleHomePrefix(effectiveUser?.role || effectiveUser?.userRole);
  if (allowedPrefix && !location.pathname.startsWith(allowedPrefix)) {
    return <Navigate to={`${allowedPrefix}/dashboard`} replace />;
  }

  return children;
};

export default ProtectedRoute;
