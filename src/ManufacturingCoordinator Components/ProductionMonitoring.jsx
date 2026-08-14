import React from 'react';
import { useLocation } from 'react-router-dom';
import LiveMonitoring from './ProductMonitoringComponents/LiveMonitoring';
import OEEDashboard from './ProductMonitoringComponents/OEEDashboard';
import PlannedVsActual from './ProductMonitoringComponents/PlannedVsActual';
import OrderTracking from './ProductMonitoringComponents/OrderTracking';
import ProductionLog from './ProductMonitoringComponents/ProductionLog';

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
    if (path.includes('/product-monitoring/production-log')) {
      return <ProductionLog />;
    }
    return <LiveMonitoring />;
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {renderContent()}
    </div>
  );
};

export default ProductionMonitoring;
