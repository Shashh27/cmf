import React from 'react';
import { Card, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import LiveMonitoring from './ProductMonitoringComponents/LiveMonitoring';
import OEEDashboard from './ProductMonitoringComponents/OEEDashboard';
import PlannedVsActual from './ProductMonitoringComponents/PlannedVsActual';
import OrderTracking from './ProductMonitoringComponents/OrderTracking';

const { Title } = Typography;

const ProductionMonitoring = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/product-monitoring/live-monitoring')) {
      return <LiveMonitoring />;
    }
    if (path.includes('/product-monitoring/oee-overview')) {
      return <OEEDashboard />;
    }
    if (path.includes('/product-monitoring/planned-vs-actual')) {
      return <PlannedVsActual />;
    }
    if (path.includes('/product-monitoring/order-tracking')) {
      return <OrderTracking />;
    }
    return <LiveMonitoring />;
  };

  const titleText = (() => {
    if (path.includes('/product-monitoring/live-monitoring')) return 'Live Monitoring';
    if (path.includes('/product-monitoring/oee-overview')) return 'OEE Overview';
    if (path.includes('/product-monitoring/planned-vs-actual')) return 'Planned vs Actual';
    if (path.includes('/product-monitoring/order-tracking')) return 'Order Tracking';
    return 'Production Monitoring';
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

export default ProductionMonitoring;
