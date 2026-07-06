import React, { useState, useEffect } from 'react';
import { Tabs, message } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import PokaYokeSupervisorReview from './PokaYokeSupervisorReview';
import { API_BASE_URL } from '../Config/auth';

const PreventiveMaintenance = () => {
  const [activeTab, setActiveTab] = useState('pending-review');
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
    {
      key: 'pending-review',
      label: 'Pending Review',
      children: (
        <PokaYokeSupervisorReview
          machines={machines}
          fetchMachines={fetchMachines}
          machinesLoading={machinesLoading}
        />
      ),
    },
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
      key: 'submission-history',
      label: 'Submission History',
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
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabItems}
      size="middle"
      style={{ marginBottom: 0, marginTop: 0 }}
    />
  );
};

export default PreventiveMaintenance;
