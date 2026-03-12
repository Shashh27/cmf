import React, { useState, useEffect, useCallback } from 'react';
import { Tabs } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import config from '../Config/config';

const PokaYoke = () => {
  const [activeTab, setActiveTab] = useState('checklists');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);

  const fetchMachines = useCallback(async () => {
    try {
      setMachinesLoading(true);
      const response = await fetch(`${config.API_BASE_URL}/machines/`);
      if (!response.ok) {
        setMachines([]);
        return;
      }
      const data = await response.json();
      setMachines(Array.isArray(data) ? data : []);
    } finally {
      setMachinesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const tabItems = [
    { key: 'checklists', label: 'Checklists', children: <PokaYokeChecklists /> },
    { key: 'machine-assignments', label: 'Machine Assignments', children: <PokaYokeMachineAssignments machines={machines} fetchMachines={fetchMachines} machinesLoading={machinesLoading} /> },
    { key: 'completion-logs', label: 'Completion Logs', children: <PokaYokeCompletedLogs machines={machines} fetchMachines={fetchMachines} machinesLoading={machinesLoading} /> },
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
