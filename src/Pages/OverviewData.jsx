import React from 'react';
import { Tabs } from 'antd';
import { InventoryRequestsTable, ReturnRequestsTable, InventoryAnalytics, TransactionHistory } from '../Inventory Components/OverviewData';

const { TabPane } = Tabs;

const OverviewData = () => {
  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>Inventory Overview</h1>
      </div>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <Tabs defaultActiveKey="inventory-requests" size="small">
          <TabPane tab="Inventory Requests" key="inventory-requests">
            <InventoryRequestsTable />
          </TabPane>
          <TabPane tab="Return Requests" key="return-requests">
            <ReturnRequestsTable />
          </TabPane>
          <TabPane tab="Inventory Analytics" key="analytics">
            <InventoryAnalytics />
          </TabPane>
          <TabPane tab="Transaction History" key="transaction-history">
            <TransactionHistory />
          </TabPane>
        </Tabs>
      </div>
    </div>
  );
};

export default OverviewData;
