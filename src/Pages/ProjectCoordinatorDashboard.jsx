import React from 'react';
import { useLocation } from 'react-router-dom';
import OMS from '../ProjectCoordinator Components/OMS';
import ProjectCoordinatorProductView from '../ProjectCoordinator Components/ProjectCoordinatorProductView';
import Configuration from '../ProjectCoordinator Components/Configuration';

const ProjectCoordinatorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    // Single product view from OMS (click Project Name) – hierarchical view, no create product
    if (path.match(/^\/project_coordinator\/oms\/product\/\d+$/)) {
      return <ProjectCoordinatorProductView />;
    }
    if (path.includes('/project_coordinator/configuration')) {
      return <Configuration />;
    }
    if (path.includes('/project_coordinator/oms')) {
      return <OMS />;
    }
    return (
      <div className="p-4">
        <a href="/project_coordinator/oms/orders" className="text-blue-600 hover:underline">
          Go to Projects
        </a>
      </div>
    );
  };

  const isProductView = Boolean(path.match(/^\/project_coordinator\/oms\/product\/\d+$/));

  return (
    <div
      style={
        isProductView
          ? {
              height: "100%",
              minHeight: 0,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }
          : undefined
      }
    >
      {renderContent()}
    </div>
  );
};

export default ProjectCoordinatorDashboard;