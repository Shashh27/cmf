import React from 'react';
import { useLocation } from 'react-router-dom';
import LiveMonitoring from '../Product Monitoring Components/LiveMonitoring';
import OEEDashboard from '../Product Monitoring Components/OEEDashboard';
import PlannedVsActual from '../Product Monitoring Components/PlannedVsActual';
import OrderTracking from '../Product Monitoring Components/OrderTracking';

const ProductionMonitoring = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes('/product-monitoring/live-monitoring')) return <LiveMonitoring />;
    if (path.includes('/product-monitoring/oee-overview')) return <OEEDashboard />;
    if (path.includes('/product-monitoring/planned-vs-actual')) return <PlannedVsActual />;
    if (path.includes('/product-monitoring/order-tracking')) return <OrderTracking />;
    return <LiveMonitoring />;
  };

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh' }}>
      {renderContent()}
    </div>
  );
};

export default ProductionMonitoring;