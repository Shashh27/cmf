import React from 'react';
import { useLocation } from 'react-router-dom';
import ProductionCompletion from '../Supervisor Components/ProductionCompletion';
import AssetsAvailability from '../Supervisor Components/AssetsAvailability';
import PreventiveMaintenance from '../Supervisor Components/PreventiveMaintenance';
import PokaYokeOperationChecklist from '../Supervisor Components/PokaYokeOperationChecklist';

const SupervisorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/pps/assets-availability')) {
      return <AssetsAvailability />;
    }
    if (path.includes('/product-monitoring/pokayoke-checklists')) {
      return <PreventiveMaintenance />;
    }
    if (path.includes('/pokayoke-operation-checklists')) {
      return <PokaYokeOperationChecklist />;
    }
    return <ProductionCompletion />;
  };

  return (
    <div className="supervisor-dashboard" style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {renderContent()}
    </div>
  );
};

export default SupervisorDashboard;
