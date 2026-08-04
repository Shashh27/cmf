import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { roleHomePath, roleRoutePrefix } from '../auth/roleHomes.js';

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const { isAuthenticated, user, bootstrapping } = useAuth();

  if (bootstrapping) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const allowedPrefix = roleRoutePrefix(user?.role || user?.userRole);
  if (allowedPrefix && !location.pathname.startsWith(allowedPrefix)) {
    return <Navigate to={roleHomePath(user?.role || user?.userRole)} replace />;
  }

  return children;
};

export default ProtectedRoute;
