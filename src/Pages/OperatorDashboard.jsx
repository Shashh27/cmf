import React from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from 'antd';
import InspectionResults from '../Operator Components/InspectionResults';
import InventoryData from '../Operator Components/InventoryData';
import Documents from '../Operator Components/Documents';
import Dashboard from '../Operator Components/Dashboard';
import LeaveLog from '../Operator Components/LeaveLog';
import PokaYokeChecklist from '../Operator Components/PokaYokeChecklist';
import OperatorNotifications from '../Operator Components/Notifications';
import ProductionLogsHistory from '../Operator Components/ProductionLogsHistory';

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
    if (path.includes('/preventive-maintenance')) {
      return <PokaYokeChecklist open={true} onClose={() => {}} isPage={true} />;
    }
    if (path.includes('/notifications')) {
      return <OperatorNotifications />;
    }
    if (path.includes('/production-logs')) {
      return (
        <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh'}}>
          <Card
            bordered={false}
            style={{
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <ProductionLogsHistory />
          </Card>
        </div>
      );
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
