import React from 'react';
import { useLocation } from 'react-router-dom';
import { Card } from 'antd';
import ProductionCompletion from '../Supervisor Components/ProductionCompletion';
import AssetsAvailability from '../Supervisor Components/Assets Availability';
import PreventiveMaintenance from '../Supervisor Components/PreventiveMaintenance';
import PokaYokeOperationChecklist from '../Supervisor Components/PokaYokeOperationChecklist';
import SupervisorNotes from '../Supervisor Components/Notes';

const SupervisorDashboard = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/assets-availability')) {
      return <AssetsAvailability />;
    }
    if (path.includes('/preventive-maintenance')) {
      return <PreventiveMaintenance />;
    }
    if (path.includes('/pokayoke-checklists')) {
      return <PokaYokeOperationChecklist />;
    }
    if (path.includes('/notes')) {
      return <SupervisorNotes />;
    }
    if (path.includes('/production_logs')) {
      return (
        <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
          <Card
            bordered={false}
            style={{
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            }}
          >
            <ProductionCompletion />
          </Card>
        </div>
      );
    }
    return (
      <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
        <Card
          bordered={false}
          style={{
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          }}
        >
          <ProductionCompletion />
        </Card>
      </div>
    );
  };

  return (
    <div>
      {renderContent()}
    </div>
  );
};

export default SupervisorDashboard;
