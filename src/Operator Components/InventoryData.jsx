import React, { useState } from 'react';
import { Tabs, Card } from 'antd';
import Inventory from './Inventory';
import ToolRequested from './ToolRequested';
import ToolReturn from './ToolReturn';
import ToolIssues from './ToolIssues';

const InventoryData = () => {
  const [activeTab, setActiveTab] = useState('1');

  const items = [
    {
      key: '1',
      label: 'Tool Request',
      children: <Inventory />,
    },
    {
      key: '2',
      label: 'Tool Return',
      children: <ToolRequested onReturnSuccess={() => setActiveTab('3')} onReportIssueSuccess={() => setActiveTab('4')} />,
    },
    {
      key: '3',
      label: 'Tool Return Status',
      children: <ToolReturn />,
    },
    {
      key: '4',
      label: 'Tool Issues',
      children: <ToolIssues />,
    },
  ];

  return (
    <div style={{ padding: '0px' }}>
      {/* <h2 style={{ fontSize: '24px', fontWeight: '600', marginBottom: '16px', color: '#000000e0' }}>Inventory Data</h2> */}
      <Card>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab} 
          items={items} 
          destroyInactiveTabPane={true} // Ensures fresh data when switching tabs
        />
      </Card>
    </div>
  );
};

export default InventoryData;
