import React, { useState } from 'react';
import { Tabs } from 'antd';
import PokaYokeChecklists from './PokaYokeChecklists';
import PokaYokeCompletedLogs from './PokaYokeCompletedLogs';
import PokaYokeMachineAssignments from './PokaYokeMachineAssignments';

const PokaYoke = () => {
  const [activeTab, setActiveTab] = useState('checklists');

  const tabItems = [
    { key: 'checklists', label: 'Checklists', children: <PokaYokeChecklists /> },
    { key: 'machine-assignments', label: 'Machine Assignments', children: <PokaYokeMachineAssignments /> },
    { key: 'completion-logs', label: 'Completion Logs', children: <PokaYokeCompletedLogs /> },
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
