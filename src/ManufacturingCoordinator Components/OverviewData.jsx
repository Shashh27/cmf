import React, { useState, useEffect } from 'react';
import { Tabs, Badge } from 'antd';
import { InventoryRequestsTable, ReturnRequestsTable, InventoryAnalytics, TransactionHistory, ToolsIssues } from '../InventorySupervisor Components/Inventory/OverviewData';
import { API_BASE_URL } from '../Config/auth';
import { authFetch } from '../api/client.js';

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
      const reqRes = await authFetch(`${API_BASE_URL}/inventory-requests/`);
      const reqData = await reqRes.json();
      const pendingReqs = reqData.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      const retRes = await authFetch(`${API_BASE_URL}/inventory-return-requests/`);
      const retData = await retRes.json();
      const pendingRets = retData.filter(r => (r.status || '').toLowerCase() === 'pending').length;

      const issueRes = await authFetch(`${API_BASE_URL}/tool-issues/`);
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
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Tabs
          defaultActiveKey="inventory-requests"
          size="small"
          destroyInactiveTabPane={false}
          items={[
            {
              key: 'inventory-requests',
              label: (
                <span>
                  {isInventorySupervisor ? (
                    <Badge count={counts.requests} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                      <span>Inventory Requests</span>
                    </Badge>
                  ) : (
                    <span>Inventory Requests</span>
                  )}
                </span>
              ),
              children: <InventoryRequestsTable />,
            },
            {
              key: 'return-requests',
              label: (
                <span>
                  {isInventorySupervisor ? (
                    <Badge count={counts.returns} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                      <span>Return Requests</span>
                    </Badge>
                  ) : (
                    <span>Return Requests</span>
                  )}
                </span>
              ),
              children: <ReturnRequestsTable />,
            },
            {
              key: 'tools-issues',
              label: (
                <span>
                  {isInventorySupervisor ? (
                    <Badge count={counts.issues} offset={[8, -2]} style={{ backgroundColor: '#faad14' }}>
                      <span>Tools Issues</span>
                    </Badge>
                  ) : (
                    <span>Tools Issues</span>
                  )}
                </span>
              ),
              children: <ToolsIssues />,
            },
            {
              key: 'analytics',
              label: 'Inventory Analytics',
              children: <InventoryAnalytics />,
            },
            {
              key: 'transaction-history',
              label: 'Transaction History',
              children: <TransactionHistory />,
            },
          ]}
        />
      </div>
    </div>
  );
};

export default OverviewData;
