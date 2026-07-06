import React, { useState, useEffect } from 'react';
import { Tabs, message, Card } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import PokaYokeReviewHistory from './PokaYokeReviewHistory';
import { API_BASE_URL } from '../Config/auth';

const PreventiveMaintenance = () => {
  const [activeTab, setActiveTab] = useState('review-history');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const fetchMachines = async () => {
    setMachinesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/machines/`);
      if (!res.ok) throw new Error('Failed to fetch machines');
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message || 'Failed to load machines');
    } finally {
      setMachinesLoading(false);
    }
  };

  useEffect(() => {
    fetchMachines();
  }, []);

  const tabItems = [
    { key: 'checklists', label: 'Checklists', children: <PokaYokeChecklists /> },
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
      key: 'review-history',
      label: 'Review & History',
      children: (
        <PokaYokeReviewHistory
          machines={machines}
          fetchMachines={fetchMachines}
          machinesLoading={machinesLoading}
        />
      ),
    },
  ];

  return (
    <Card
      className="shadow-sm"
      styles={{ body: { padding: '16px 20px 20px' } }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="middle"
        style={{ marginBottom: 0, marginTop: 0 }}
      />
    </Card>
  );
};

export default PreventiveMaintenance;
