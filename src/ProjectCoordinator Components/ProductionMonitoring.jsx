import React from 'react';
import { Card, Button } from 'antd';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import PlannedVsActual from './Product Monitoring Components/PlannedVsActual';

const ProductionMonitoring = () => {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      
      <Card
        variant="borderless"
        style={{
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        <PlannedVsActual />
      </Card>
    </div>
  );
};

export default ProductionMonitoring;