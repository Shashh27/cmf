import React, { useState, useEffect } from 'react';
import { Tabs, Card, Typography, Badge } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import { InventoryRequestsTable, ReturnRequestsTable, InventoryAnalytics, TransactionHistory, ToolsIssues } from '../InventorySupervisor Components/Inventory/OverviewData';
import { API_BASE_URL } from '../Config/auth';

const { TabPane } = Tabs;
const { Title, Text } = Typography;

const OverviewData = () => {
  const [counts, setCounts] = useState({
    requests: 0,
    returns: 0,
    issues: 0
  });

  const getUserRole = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const u = JSON.parse(stored);
      return u?.role || null;
    } catch (e) {
      console.error('Failed to parse user from localStorage', e);
      return null;
    }
  };

  const userRole = getUserRole();
  const isInventorySupervisor = userRole === 'inventory_supervisor';

  const fetchCounts = async () => {
    if (!isInventorySupervisor) return;
    
    try {
      // Fetch Inventory Requests
      const reqRes = await fetch(`${API_BASE_URL}/inventory-requests/`);
      const reqData = await reqRes.json();
      const pendingReqs = reqData.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      // Fetch Return Requests
      const retRes = await fetch(`${API_BASE_URL}/inventory-return-requests/`);
      const retData = await retRes.json();
      const pendingRets = retData.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      // Fetch Tool Issues
      const issueRes = await fetch(`${API_BASE_URL}/tool-issues/`);
      const issueData = await issueRes.json();
      const pendingIssues = issueData.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      setCounts({
        requests: pendingReqs,
        returns: pendingRets,
        issues: pendingIssues
      });
    } catch (error) {
      console.error('Failed to fetch counts:', error);
    }
  };

  useEffect(() => {
    fetchCounts();
    // Refresh counts every 30 seconds
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

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
              Track requests, returns, issues and transaction history
            </Text>
          </div>
        </div>
      </Card>
      
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs defaultActiveKey="inventory-requests" size="small" destroyInactiveTabPane={false}>
          <TabPane 
            tab={
              <span>
                {isInventorySupervisor ? (
                  <Badge count={counts.requests} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                    <span>Inventory Requests</span>
                  </Badge>
                ) : (
                  <span>Inventory Requests</span>
                )}
              </span>
            } 
            key="inventory-requests"
          >
            <InventoryRequestsTable />
          </TabPane>
          <TabPane 
            tab={
              <span>
                {isInventorySupervisor ? (
                  <Badge count={counts.returns} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                    <span>Return Requests</span>
                  </Badge>
                ) : (
                  <span>Return Requests</span>
                )}
              </span>
            } 
            key="return-requests"
          >
            <ReturnRequestsTable />
          </TabPane>
          <TabPane 
            tab={
              <span>
                {isInventorySupervisor ? (
                  <Badge count={counts.issues} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                    <span>Tools Issues</span>
                  </Badge>
                ) : (
                  <span>Tools Issues</span>
                )}
              </span>
            } 
            key="tools-issues"
          >
            <ToolsIssues />
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
