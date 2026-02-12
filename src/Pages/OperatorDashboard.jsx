import React from 'react';
import { useLocation } from 'react-router-dom';
import InspectionResults from '../Operator Components/InspectionResults';
import InventoryData from '../Operator Components/InventoryData';
import Documents from '../Operator Components/Documents';
import Dashboard from '../Operator Components/Dashboard';

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
    
    // Default Dashboard View
    return <Dashboard />;
  };

  return (
    <div style={{ padding: '24px' }}>
      {renderContent()}
    </div>
  );
};

export default OperatorDashboard;
