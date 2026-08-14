import React from 'react';
import { Card } from 'antd';
import { useLocation } from 'react-router-dom';
import LiveMonitoring from './ProductMonitoringComponents/LiveMonitoring';
import OEEDashboard from './ProductMonitoringComponents/OEEDashboard';
import PlannedVsActual from './ProductMonitoringComponents/PlannedVsActual';
import OrderTracking from './ProductMonitoringComponents/OrderTracking';
import ProductionLog from './ProductMonitoringComponents/ProductionLog';

const ProductionMonitoring = () => {
  const location = useLocation();
  const path = location.pathname;
  const isLive = path.includes('/product-monitoring/live-monitoring');

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
    if (path.includes('/product-monitoring/production-log')) {
      return <ProductionLog />;
    }
    return <LiveMonitoring />;
  };

  if (isLive) {
    return (
      <div style={{
        height: '100%',
        maxHeight: '100%',
        overflow: 'hidden',
        background: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}>
        {renderContent()}
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
        {renderContent()}
      </Card>
    </div>
  );
};

export default ProductionMonitoring;
