import React, { useState, useCallback } from 'react';
import { Card, Tabs, Typography, message } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import PokaYokeChecklists from '../Product Monitoring Components/PokaYokeChecklists';
import PokaYokeMachineAssignments from '../Product Monitoring Components/PokaYokeMachineAssignments';
import PokaYokeCompletedLogs from '../Product Monitoring Components/PokaYokeCompletedLogs';
import config from '../Config/config';

const { Title, Text } = Typography;

const ProductionMonitoring = () => {
  const [activeTab, setActiveTab] = useState('checklists');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [machinesFetched, setMachinesFetched] = useState(false);

  const fetchMachines = useCallback(async (force = false) => {
    if ((machinesFetched && !force) || machinesLoading) return;

    setMachinesLoading(true);
    try {
      const response = await fetch(`${config.API_BASE_URL}/machines/?skip=0&limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch machines');
      const data = await response.json();
      const machinesList = Array.isArray(data) ? data : (data.items || []);
      setMachines(machinesList);
      setMachinesFetched(true);
    } catch (error) {
      message.error('Failed to fetch machines: ' + error.message);
    } finally {
      setMachinesLoading(false);
    }
  }, [machinesFetched, machinesLoading]);

  const tabItems = [
    {
      key: 'checklists',
      label: 'Checklists',
      children: <PokaYokeChecklists />,
    },
    {
      key: 'machine-assignments',
      label: 'Machine Assignments',
      children: (
        <PokaYokeMachineAssignments 
          machines={machines} 
          fetchMachines={fetchMachines} 
          machinesLoading={machinesLoading} 
        />
      ),
    },
    {
      key: 'completion-logs',
      label: 'Completion Logs',
      children: (
        <PokaYokeCompletedLogs 
          machines={machines} 
          fetchMachines={fetchMachines} 
          machinesLoading={machinesLoading} 
        />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px' }}>
      <Card 
        bordered={false} 
        style={{ 
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          marginBottom: '16px'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <SafetyCertificateOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
          <div>
            <Title level={3} style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>
              PokaYoke Checklist System
            </Title>
            <Text type="secondary" style={{ fontSize: '14px', marginTop: '2px', display: 'block' }}>
              Manage and monitor checklists, machine assignments, and completion logs
            </Text>
          </div>
        </div>
      </Card>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="large"
          destroyInactiveTabPane={true}
        />
      </div>
    </div>
  );
};

export default ProductionMonitoring;
