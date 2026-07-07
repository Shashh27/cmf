import React, { useState } from 'react';
import { Tabs } from 'antd';
import PokaYokeSupervisorReview from './PokaYokeSupervisorReview';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';

const PokaYokeReviewHistory = ({ machines = [], fetchMachines, machinesLoading }) => {
  const [activeSubTab, setActiveSubTab] = useState('pending-review');

  const subTabItems = [
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
    {
      key: 'history',
      label: 'History',
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
      activeKey={activeSubTab}
      onChange={setActiveSubTab}
      items={subTabItems}
      size="small"
      style={{ marginBottom: 0 }}
    />
  );
};

export default PokaYokeReviewHistory;
