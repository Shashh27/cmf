import React from 'react';
import { useLocation } from 'react-router-dom';
import OMS from './OMS';
import PDM from './PDM';

const ProjectCoordinatorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/project_coordinator/oms')) {
      return <OMS />;
    }
    if (path.includes('/project_coordinator/pdm')) {
      return <PDM />;
    }
    return <Dashboard />;
  };

  return (
    <div>
      {renderContent()}
    </div>
  );
};

export default ProjectCoordinatorDashboard;
