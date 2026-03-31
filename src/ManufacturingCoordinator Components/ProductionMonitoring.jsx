import React from 'react';
import { Card, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import PokaYoke from '../Product Monitoring Components/PokaYoke';
import Maintenance from '../Product Monitoring Components/Maintenance';
import LiveMonitoring from '../Product Monitoring Components/LiveMonitoring';
import PlannedVsActual from '../Product Monitoring Components/PlannedVsActual';
import OrderTracking from '../Product Monitoring Components/OrderTracking';

const { Title, Text } = Typography;

const ProductionMonitoring = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/product-monitoring/maintenance')) {
      return <Maintenance />;
    }
    if (path.includes('/product-monitoring/live-monitoring')) {
      return <LiveMonitoring />;
    }
    if (path.includes('/product-monitoring/planned-vs-actual')) {
      return <PlannedVsActual />;
    }
    if (path.includes('/product-monitoring/order-tracking')) {
      return <OrderTracking />;
    }
    return <PokaYoke />;
  };

  const titleText = (() => {
    if (path.includes('/product-monitoring/maintenance')) return 'Maintenance';
    if (path.includes('/product-monitoring/live-monitoring')) return 'Live Monitoring';
    if (path.includes('/product-monitoring/planned-vs-actual')) return 'Planned vs Actual';
    if (path.includes('/product-monitoring/order-tracking')) return 'Order Tracking';
    return 'Preventive Maintenance';
  })();
  const showPokaYokeIcon = path.includes('/product-monitoring/pokayoke-checklists');

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showPokaYokeIcon && <SafetyCertificateOutlined style={{ color: '#1890ff' }} />}
          {titleText}
        </Title>
      </div>
      
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

export default ProductionMonitoring;
