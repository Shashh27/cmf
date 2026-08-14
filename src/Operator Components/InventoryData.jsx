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
      label: 'Request Tool',
      children: <Inventory />,
    },
    {
      key: '2',
      label: 'Return Tool',
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
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh', boxSizing: 'border-box' }}>
      <Card
        bordered={false}
        style={{ borderRadius: '8px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)' }}
      >
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
