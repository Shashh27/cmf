import React, { useState } from 'react';
import { Card, Tabs, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PokaYokeChecklists from '../Product Monitoring Components/PokaYokeChecklists';
import PokaYokeMachineAssignments from '../Product Monitoring Components/PokaYokeMachineAssignments';
import PokaYokeCompletedLogs from '../Product Monitoring Components/PokaYokeCompletedLogs';

const { Title } = Typography;

const ProductionMonitoring = () => {
  const [activeTab, setActiveTab] = useState('checklists');

  const tabItems = [
    {
      key: 'checklists',
      label: 'Checklists',
      children: <PokaYokeChecklists />,
    },
    {
      key: 'machine-assignments',
      label: 'Machine Assignments',
      children: <PokaYokeMachineAssignments />,
    },
    {
      key: 'completion-logs',
      label: 'Completion Logs',
      children: <PokaYokeCompletedLogs />,
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SafetyCertificateOutlined style={{ color: '#1890ff' }} />
          PokaYoke Checklist System
        </Title>
      </div>
      
      <Card 
        bordered={false}
        style={{ 
          borderRadius: '8px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
          style={{ marginBottom: 0 }}
        />
      </Card>
    </div>
  );
};

export default ProductionMonitoring;
