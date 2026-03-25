import React from 'react';
import { useLocation } from 'react-router-dom';
import OMS from '../ProjectCoordinator Components/OMS';
import ProjectCoordinatorProductView from '../ProjectCoordinator Components/ProjectCoordinatorProductView';

const ProjectCoordinatorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    // Single product view from OMS (click Project Name) – hierarchical view, no create product
    if (path.match(/^\/project_coordinator\/oms\/product\/\d+$/)) {
      return <ProjectCoordinatorProductView />;
    }
    if (path.includes('/project_coordinator/oms')) {
      return <OMS />;
    }
    return (
      <div className="p-4">
        <a href="/project_coordinator/oms/orders" className="text-blue-600 hover:underline">
          Go to Orders
        </a>
      </div>
    );
  };

  return (
    <div>
      {renderContent()}
    </div>
  );
};

export default ProjectCoordinatorDashboard;
