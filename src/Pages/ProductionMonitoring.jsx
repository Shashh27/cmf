import React from 'react';
import { Card, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import LiveMonitoring from '../Product Monitoring Components/LiveMonitoring';
import OEEDashboard from '../Product Monitoring Components/OEEDashboard';
import PlannedVsActual from '../Product Monitoring Components/PlannedVsActual';
import OrderTracking from '../Product Monitoring Components/OrderTracking';

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

  const isOrderTracking = path.includes('/product-monitoring/order-tracking');

  const titleText = (() => {
    if (path.includes('/product-monitoring/live-monitoring')) return 'Live Monitoring';
    if (path.includes('/product-monitoring/oee-overview')) return 'OEE Overview';
    if (path.includes('/product-monitoring/planned-vs-actual')) return 'Planned vs Actual';
    if (path.includes('/product-monitoring/order-tracking')) return 'Order Tracking';
    return 'Production Monitoring';
  })();

  return (
    <div style={{ padding: isOrderTracking ? '0' : '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      {isOrderTracking ? (
        renderContent()
      ) : (
        <Card 
          variant="borderless"
          style={{ 
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
          }}
        >
          {renderContent()}
        </Card>
      )}
    </div>
  );
};

export default ProductionMonitoring;
