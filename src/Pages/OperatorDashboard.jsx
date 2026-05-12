import React from 'react';
import { useLocation } from 'react-router-dom';
import InspectionResults from '../Operator Components/InspectionResults';
import InventoryData from '../Operator Components/InventoryData';
import Documents from '../Operator Components/Documents';
import Dashboard from '../Operator Components/Dashboard';
import LeaveLog from '../Operator Components/LeaveLog';

const OperatorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  // Render content based on current path
  const renderContent = () => {
    if (path.includes('/inspection-results')) {
      return <InspectionResults />;
    }
    if (path.includes('/inventory-data')) {
      return <InventoryData />;
    }
    if (path.includes('/documents')) {
      return <Documents />;
    }
    if (path.includes('/leave-log')) {
      return <LeaveLog />;
    }
    
    // Default Dashboard View
    return <Dashboard />;
  };

  return (
    <div>
      {renderContent()}
    </div>
  );
};

export default OperatorDashboard;
