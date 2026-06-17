import React, { useState, useEffect } from 'react';
import { Tabs, message } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import config from '../Config/config';

const PokaYoke = () => {
  const [activeTab, setActiveTab] = useState('checklists');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const fetchMachines = async () => {
    setMachinesLoading(true);
    try {
      const res = await fetch(`${config.API_BASE_URL}/machines/`);
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
    // Preload machines so dropdowns have options immediately
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
      ) 
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
      ) 
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabItems}
      size="large"
      style={{ marginBottom: 0 }}
    />
  );
};

export default PokaYoke;