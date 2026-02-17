import React from 'react';
import { Tabs, Card, Typography } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { InventoryRequestsTable, ReturnRequestsTable, InventoryAnalytics, TransactionHistory } from '../Inventory Components/OverviewData';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const OverviewData = () => {
  return (
    <div style={{ padding: '16px' }}>
      {/* Header Card */}
      <Card 
        bordered={false} 
        style={{ 
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
          marginBottom: '16px'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <HistoryOutlined style={{ fontSize: '28px', color: '#1890ff' }} />
          <div>
            <Title level={3} style={{ margin: 0, fontSize: '22px', fontWeight: 600, color: '#1a1a1a' }}>
              Inventory Overview
            </Title>
            <Text type="secondary" style={{ fontSize: '14px', marginTop: '2px', display: 'block' }}>
              Track and analyze all inventory requests, returns, and transaction history
            </Text>
          </div>
        </div>
      </Card>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs defaultActiveKey="inventory-requests" size="small" destroyInactiveTabPane={false}>
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
