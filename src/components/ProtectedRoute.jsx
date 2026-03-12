import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const userRole = user.role || user.userRole; // Handle both potential keys

  if (!isAuthenticated) {
    // Redirect to the login page, but save the current location they were
    // trying to go to when they were redirected. This allows us to send them
    // along to that page after they login, which is a nicer user experience.
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role-based access control
  const rolePrefixes = {
    'admin': '/admin',
    'project_coordinator': '/project_coordinator',
    'project coordinator': '/project_coordinator',
    'manufacturing_coordinator': '/manufacturing_coordinator',
    'manufacturing coordinator': '/manufacturing_coordinator',
    'supervisor': '/supervisor',
    'inventory_supervisor': '/inventory_supervisor',
    'inventory supervisor': '/inventory_supervisor',
    'operator': '/operator',
    'Admin': '/admin',
    'Project Coordinator': '/project_coordinator',
    'Manufacturing Coordinator': '/manufacturing_coordinator',
    'Supervisor': '/supervisor',
    'Inventory Supervisor': '/inventory_supervisor',
    'Operator': '/operator'
  };

  const allowedPrefix = rolePrefixes[userRole] || rolePrefixes[userRole?.toLowerCase()];

  // If the user has a known role and is trying to access a path that doesn't start with their allowed prefix,
  // redirect them to their role's dashboard.
  if (allowedPrefix && !location.pathname.startsWith(allowedPrefix)) {
    return <Navigate to={`${allowedPrefix}/dashboard`} replace />;
  }

  return children;
};

export default ProtectedRoute;
