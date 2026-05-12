import React from 'react';
import { Card, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import Maintenance from './Maintenance Management Components/Maintenance';
import PokaYoke from './Maintenance Management Components/PokaYoke';

const { Title } = Typography;

const MaintenanceManagement = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/maintenance-management/maintenance')) {
      return <Maintenance />;
    }
    if (path.includes('/maintenance-management/preventive-maintenance')) {
      return <PokaYoke />;
    }
    return <Maintenance />;
  };

  const titleText = (() => {
    if (path.includes('/maintenance-management/maintenance')) return 'Maintenance';
    if (path.includes('/maintenance-management/preventive-maintenance')) return 'Preventive Maintenance';
    return 'Maintenance Management';
  })();

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
       <Card 
        bordered={false} 
        style={{ 
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        {renderContent()}
      </Card>
    </div>
  );
};

export default MaintenanceManagement;
