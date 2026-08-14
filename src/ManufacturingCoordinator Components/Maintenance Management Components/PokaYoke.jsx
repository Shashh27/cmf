import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, message, Badge } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';
import PMMissedNotifications from './PMMissedNotifications';
import { API_BASE_URL } from '../../Config/auth';
import { authFetch } from '../../api/client.js';
import { pmFetch } from './pmUtils';

const PokaYoke = () => {
  const [activeTab, setActiveTab] = useState('checklists');
  const [machines, setMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(false);
  const [missedCount, setMissedCount] = useState(0);

  const fetchMachines = useCallback(async () => {
    setMachinesLoading(true);
    try {
      const res = await authFetch(`${API_BASE_URL}/machines/`);
      if (!res.ok) throw new Error('Failed to fetch machines');
      const data = await res.json();
      setMachines(Array.isArray(data) ? data : []);
    } catch (e) {
      message.error(e.message || 'Failed to load machines');
    } finally {
      setMachinesLoading(false);
    }
  }, []);

  const fetchMissedCount = useCallback(async () => {
    try {
      const data = await pmFetch('/missed-notifications?pending_only=true&limit=500');
      const list = Array.isArray(data) ? data : [];
      setMissedCount(list.filter((n) => !n.is_ack).length);
    } catch {
      setMissedCount(0);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
    fetchMissedCount();
    const t = setInterval(fetchMissedCount, 60000);
    return () => clearInterval(t);
  }, [fetchMachines, fetchMissedCount]);

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
      key: 'submission-history',
      label: 'Submission History',
      children: (
        <PokaYokeCompletedLogs
          machines={machines}
          machinesLoading={machinesLoading}
        />
      ),
    },
    {
      key: 'missed-notifications',
      label: (
        <span>
          Missed Notifications
          <Badge
            count={missedCount}
            overflowCount={99}
            size="small"
            offset={[6, -2]}
            style={{ backgroundColor: '#dc2626' }}
          />
        </span>
      ),
      children: <PMMissedNotifications onCount={setMissedCount} roleLabel="Manufacturing Coordinator" />,
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabItems}
      size="middle"
      destroyInactiveTabPane
      style={{ marginBottom: 0, marginTop: 0 }}
    />
  );
};

export default PokaYoke;
