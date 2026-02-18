import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spin, Empty } from 'antd';
import KPICards from '../Dashboard Components/KPICards';
import AnalyticsCharts from '../Dashboard Components/AnalyticsCharts';

const Dashboard = () => {
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    totalOrders: 0,
    inProgress: 0,
    scheduled: 0,
    completed: 0,
    monthlyData: [],
    statusData: []
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // Mock data for now - replace with actual API calls
      const mockData = {
        totalOrders: 1247,
        inProgress: 234,
        scheduled: 157,
        completed: 856,
        monthlyData: [
          { month: 'Jan', total: 65, inProgress: 20, scheduled: 15, completed: 30 },
          { month: 'Feb', total: 78, inProgress: 25, scheduled: 18, completed: 35 },
          { month: 'Mar', total: 92, inProgress: 30, scheduled: 22, completed: 40 },
          { month: 'Apr', total: 85, inProgress: 28, scheduled: 20, completed: 37 },
          { month: 'May', total: 98, inProgress: 32, scheduled: 25, completed: 41 },
          { month: 'Jun', total: 112, inProgress: 35, scheduled: 28, completed: 49 },
          { month: 'Jul', total: 95, inProgress: 30, scheduled: 24, completed: 41 },
          { month: 'Aug', total: 108, inProgress: 33, scheduled: 26, completed: 49 },
          { month: 'Sep', total: 89, inProgress: 29, scheduled: 22, completed: 38 },
          { month: 'Oct', total: 102, inProgress: 31, scheduled: 25, completed: 46 },
          { month: 'Nov', total: 96, inProgress: 28, scheduled: 23, completed: 45 },
          { month: 'Dec', total: 115, inProgress: 36, scheduled: 29, completed: 50 }
        ],
        statusData: [
          { name: 'Completed', value: 856, color: '#52c41a' },
          { name: 'In Progress', value: 234, color: '#fa8c16' },
          { name: 'Scheduled', value: 157, color: '#722ed1' }
        ]
      };
      
      setDashboardData(mockData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <Spin size="large" tip="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#f5f5f5' }}>
      {/* KPI Cards Section */}
      <KPICards data={dashboardData} />

      {/* Analytics Charts Section */}
      <AnalyticsCharts data={dashboardData} />
    </div>
  );
};

export default Dashboard;