import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spin, Empty, Statistic, Progress, Typography, Avatar, Table, Tag, Space, Badge, Flex, Button } from 'antd';
import { 
  ShoppingCartOutlined, 
  ClockCircleOutlined, 
  CheckCircleOutlined, 
  CalendarOutlined,
  RiseOutlined,
  UserOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SettingOutlined,
  SyncOutlined
} from '@ant-design/icons';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Sector, Cell, BarChart, Bar, ComposedChart } from 'recharts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({
    totalOrders: 0,
    pendingOrders: 0,
    scheduledOrders: 0,
    inProgressOrders: 0,
    completedOrders: 0,
    thisMonthOrders: 0,
    lastMonthOrders: 0,
    totalCustomers: 0,
    avgOrderValue: 0
  });

  const getCurrentAdminId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      return user?.id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const adminId = getCurrentAdminId();
      if (!adminId) {
        console.error('No admin ID found in localStorage');
        return;
      }

      // Fetch orders only (company_name is included in orders response)
      const response = await axios.get(`${API_BASE_URL}/orders/`, {
        params: { admin_id: adminId }
      });

      const ordersData = Array.isArray(response.data) ? response.data : [];
      setOrders(ordersData);
      
      // Calculate statistics
      const stats = calculateStats(ordersData);
      setDashboardStats(stats);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (ordersData) => {
    const now = dayjs();
    const thisMonth = now.startOf('month');
    const lastMonth = now.subtract(1, 'month').startOf('month');
    
    const thisMonthOrders = ordersData.filter(order => 
      dayjs(order.created_at) >= thisMonth
    ).length;
    
    const lastMonthOrders = ordersData.filter(order => 
      dayjs(order.created_at) >= lastMonth && dayjs(order.created_at) < thisMonth
    ).length;

    const statusCounts = ordersData.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    const uniqueCustomers = new Set(ordersData.map(order => order.customer_id)).size;

    return {
      totalOrders: ordersData.length,
      pendingOrders: statusCounts['Pending'] || 0,
      scheduledOrders: statusCounts['Scheduled'] || 0,
      inProgressOrders: statusCounts['In Progress'] || 0,
      completedOrders: statusCounts['Completed'] || 0,
      thisMonthOrders,
      lastMonthOrders,
      totalCustomers: uniqueCustomers,
      avgOrderValue: ordersData.reduce((sum, order) => sum + (order.quantity || 0), 0) / ordersData.length || 0
    };
  };

  const getMonthlyData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = dayjs().year();
    
    return months.map((month, index) => {
      const monthOrders = orders.filter(order => {
        const orderDate = dayjs(order.created_at);
        return orderDate.year() === currentYear && orderDate.month() === index;
      });

      const pending = monthOrders.filter(o => o.status === 'Pending').length;
      const scheduled = monthOrders.filter(o => o.status === 'Scheduled').length;
      const inProgress = monthOrders.filter(o => o.status === 'In Progress').length;
      const completed = monthOrders.filter(o => o.status === 'Completed').length;

      return {
        month,
        total: monthOrders.length,
        pending,
        scheduled,
        inProgress,
        completed
      };
    });
  };

  const getStatusData = () => {
    const statusColors = {
      'Pending': '#faad14',      // Orange
      'Scheduled': '#722ed1',    // Purple
      'In Progress': '#1890ff',  // Blue
      'Completed': '#52c41a'     // Green
    };

    return Object.entries(
      orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([status, count]) => ({
      type: status,
      value: count,
      color: statusColors[status] || '#8c8c8c'
    }));
  };

  const getCustomerName = (order) => {
    return order.company_name || `Customer ${order.customer_id}`;
  };

  const getCustomerContact = (order) => {
    return '';
  };

  const getRecentOrders = () => {
    return orders
      .sort((a, b) => dayjs(b.created_at).unix() - dayjs(a.created_at).unix())
      .slice(0, 5);
  };

  const getMonthlyGrowth = () => {
    if (dashboardStats.lastMonthOrders === 0) return 0;
    return ((dashboardStats.thisMonthOrders - dashboardStats.lastMonthOrders) / dashboardStats.lastMonthOrders * 100).toFixed(1);
  };

  const getColumnChartData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentYear = dayjs().year();
    
    return months.map((month, index) => {
      const monthOrders = orders.filter(order => {
        const orderDate = dayjs(order.created_at);
        return orderDate.year() === currentYear && orderDate.month() === index;
      });

      const pending = monthOrders.filter(o => o.status === 'Pending').length;
      const scheduled = monthOrders.filter(o => o.status === 'Scheduled').length;
      const inProgress = monthOrders.filter(o => o.status === 'In Progress').length;
      const completed = monthOrders.filter(o => o.status === 'Completed').length;

      return {
        month,
        Pending: pending,
        Scheduled: scheduled,
        'In Progress': inProgress,
        Completed: completed
      };
    });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large">
          <span style={{ marginTop: 16 }}>Loading dashboard...</span>
        </Spin>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0 }}>Dashboard Overview</Title>
        <Button
          type="primary"
          size="large"
          icon={<SettingOutlined />}
          onClick={() => navigate('/admin/shop-floor')}
          style={{
            background: '#1976d2',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 600
          }}
        >
          View Shop Floor
        </Button>
      </div>
      
      {/* Light KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={4} style={{ flex: '0 0 20%', maxWidth: '20%' }}>
          <Card 
            hoverable
            styles={{ 
              body: { 
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                border: '1px solid #90caf9',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                padding: '20px'
              }
            }}
          >
            <Statistic
              title={<span style={{ color: '#546e7a', fontSize: '14px', fontWeight: '500' }}>Total Orders</span>}
              value={dashboardStats.totalOrders}
              prefix={<ShoppingCartOutlined style={{ color: '#1976d2' }} />}
              styles={{ content: { color: '#1976d2', fontSize: '24px', fontWeight: 'bold' } }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4} style={{ flex: '0 0 20%', maxWidth: '20%' }}>
          <Card 
            hoverable
            styles={{ 
              body: { 
                background: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
                border: '1px solid #ffcc80',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                padding: '20px'
              }
            }}
          >
            <Statistic
              title={<span style={{ color: '#546e7a', fontSize: '14px', fontWeight: '500' }}>Pending</span>}
              value={dashboardStats.pendingOrders}
              prefix={<ClockCircleOutlined style={{ color: '#f57c00' }} />}
              styles={{ content: { fontSize: '24px', fontWeight: 'bold', color: '#f57c00' } }}
              suffix={
                <Tag color="warning" style={{ marginLeft: '8px' }}>
                  {dashboardStats.totalOrders > 0 ? 
                    ((dashboardStats.pendingOrders / dashboardStats.totalOrders) * 100).toFixed(1) : 0
                  }%
                </Tag>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4} style={{ flex: '0 0 20%', maxWidth: '20%' }}>
          <Card 
            hoverable
            styles={{ 
              body: { 
                background: 'linear-gradient(135deg, #f3e5f5 0%, #e1bee7 100%)',
                border: '1px solid #ce93d8',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                padding: '20px'
              }
            }}
          >
            <Statistic
              title={<span style={{ color: '#546e7a', fontSize: '14px', fontWeight: '500' }}>Scheduled</span>}
              value={dashboardStats.scheduledOrders}
              prefix={<ClockCircleOutlined style={{ color: '#7b1fa2' }} />}
              styles={{ content: { fontSize: '24px', fontWeight: 'bold', color: '#7b1fa2' } }}
              suffix={
                <Tag color="purple" style={{ marginLeft: '8px' }}>
                  {dashboardStats.totalOrders > 0 ? 
                    ((dashboardStats.scheduledOrders / dashboardStats.totalOrders) * 100).toFixed(1) : 0
                  }%
                </Tag>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4} style={{ flex: '0 0 20%', maxWidth: '20%' }}>
          <Card 
            hoverable
            styles={{ 
              body: { 
                background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                border: '1px solid #90caf9',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                padding: '20px'
              }
            }}
          >
            <Statistic
              title={<span style={{ color: '#546e7a', fontSize: '14px', fontWeight: '500' }}>In Progress</span>}
              value={dashboardStats.inProgressOrders}
              prefix={<SyncOutlined style={{ color: '#1976d2' }} />}
              styles={{ content: { fontSize: '24px', fontWeight: 'bold', color: '#1976d2' } }}
              suffix={
                <Tag color="processing" style={{ marginLeft: '8px' }}>
                  {dashboardStats.totalOrders > 0 ? 
                    ((dashboardStats.inProgressOrders / dashboardStats.totalOrders) * 100).toFixed(1) : 0
                  }%
                </Tag>
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={4} style={{ flex: '0 0 20%', maxWidth: '20%' }}>
          <Card 
            hoverable
            styles={{ 
              body: { 
                background: 'linear-gradient(135deg, #e8f5e8 0%, #c8e6c9 100%)',
                border: '1px solid #81c784',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                padding: '20px'
              }
            }}
          >
            <Statistic
              title={<span style={{ color: '#546e7a', fontSize: '14px', fontWeight: '500' }}>Completed</span>}
              value={dashboardStats.completedOrders}
              prefix={<CheckCircleOutlined style={{ color: '#2e7d32' }} />}
              styles={{ content: { color: '#2e7d32', fontSize: '24px', fontWeight: 'bold' } }}
              suffix={
                <Tag color="success" style={{ marginLeft: '8px' }}>
                  {dashboardStats.totalOrders > 0 ? 
                    ((dashboardStats.completedOrders / dashboardStats.totalOrders) * 100).toFixed(1) : 0
                  }%
                </Tag>
              }
            />
          </Card>
        </Col>
      </Row>

      {/* Single Additional Stat */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
      </Row>

      {/* Single Chart Row - Responsive Charts */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} xl={12}>
          <Card 
            title="Monthly Order Trend" 
            extra={<Badge status="processing" text="Live" />}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ width: '100%', height: '300px' }}>
              <LineChart 
                width="100%" 
                height={300} 
                data={getMonthlyData()} 
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="month" 
                  tick={{ fill: '#666', fontSize: 12 }}
                  axisLine={{ stroke: '#ccc' }}
                />
                <YAxis 
                  tick={{ fill: '#666', fontSize: 12 }}
                  axisLine={{ stroke: '#ccc' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    border: '1px solid #ddd',
                    borderRadius: '8px'
                  }}
                />
                <Legend 
                  wrapperStyle={{ fontSize: '12px' }}
                  iconType="circle"
                />
                <Line 
                  type="monotone" 
                  dataKey="total" 
                  stroke="#1976d2" 
                  strokeWidth={3}
                  dot={{ fill: '#1976d2', r: 4 }}
                  activeDot={{ r: 6, fill: '#1565c0' }}
                  name="Total Orders"
                />
                <Line 
                  type="monotone" 
                  dataKey="completed" 
                  stroke="#52c41a" 
                  strokeWidth={2}
                  dot={{ fill: '#52c41a', r: 3 }}
                  activeDot={{ r: 5, fill: '#389e0d' }}
                  name="Completed"
                />
                <Line 
                  type="monotone" 
                  dataKey="inProgress" 
                  stroke="#1890ff" 
                  strokeWidth={2}
                  dot={{ fill: '#1890ff', r: 3 }}
                  activeDot={{ r: 5, fill: '#096dd9' }}
                  name="In Progress"
                />
                <Line 
                  type="monotone" 
                  dataKey="scheduled" 
                  stroke="#722ed1" 
                  strokeWidth={2}
                  dot={{ fill: '#722ed1', r: 3 }}
                  activeDot={{ r: 5, fill: '#531dab' }}
                  name="Scheduled"
                />
                <Line 
                  type="monotone" 
                  dataKey="pending" 
                  stroke="#faad14" 
                  strokeWidth={2}
                  dot={{ fill: '#faad14', r: 3 }}
                  activeDot={{ r: 5, fill: '#d48806' }}
                  name="Pending"
                />
              </LineChart>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card 
            title="Order Status Distribution" 
            extra={<Badge status="processing" text="Live" />}
            styles={{ body: { padding: '20px' } }}
          >
            <div style={{ width: '100%', height: '300px' }}>
              <PieChart width="100%" height={300}>
                <Pie 
                  data={getStatusData()} 
                  dataKey="value" 
                  nameKey="type" 
                  cx="50%" 
                  cy="50%" 
                  outerRadius={100} 
                  fill="#8884d8"
                >
                  {getStatusData().map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Recent Orders & Progress - Side by Side */}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card 
            title="Recent Orders" 
            extra={<Text type="secondary">Last 5 orders</Text>}
          >
            <Table
              dataSource={getRecentOrders()}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              rowKey="id"
              columns={[
                {
                  title: 'Order Number',
                  dataIndex: 'sale_order_number',
                  key: 'sale_order_number',
                  render: (text, record) => (
                    <Space size="small">
                      <Avatar size="small" icon={<FileTextOutlined />} />
                      <Text strong>{text}</Text>
                    </Space>
                  ),
                },
                {
                  title: 'Status',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status) => {
                    const statusColors = {
                      'Pending': 'orange',
                      'Scheduled': 'purple',
                      'In Progress': 'blue',
                      'Completed': 'green'
                    };
                    return (
                      <Tag color={statusColors[status] || 'default'}>
                        {status?.toUpperCase()}
                      </Tag>
                    );
                  },
                },
                {
                  title: 'Quantity',
                  dataIndex: 'quantity',
                  key: 'quantity',
                },
                {
                  title: 'Customer',
                  dataIndex: 'customer_id',
                  key: 'customer_id',
                  render: (_, record) => (
                    <Text strong>{getCustomerName(record)}</Text>
                  )
                },
              ]}
              locale={{
                emptyText: <Empty description="No orders found" />
              }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="Order Completion Rate" extra={<Badge status="processing" text="Live" />}>
            <Flex vertical style={{ width: '100%' }} gap="large">
              <div>
                <Text strong>Overall Completion</Text>
                <Progress 
                  percent={dashboardStats.totalOrders > 0 ? 
                    Math.round((dashboardStats.completedOrders / dashboardStats.totalOrders) * 100) : 0
                  } 
                  status="active"
                  strokeColor="#52c41a"
                />
              </div>
              <div>
                <Text strong>Pending Orders</Text>
                <Progress 
                  percent={dashboardStats.totalOrders > 0 ? 
                    Math.round((dashboardStats.pendingOrders / dashboardStats.totalOrders) * 100) : 0
                  } 
                  status="active"
                  strokeColor="#faad14"
                />
              </div>
              <div>
                <Text strong>Scheduled Orders</Text>
                <Progress 
                  percent={dashboardStats.totalOrders > 0 ? 
                    Math.round((dashboardStats.scheduledOrders / dashboardStats.totalOrders) * 100) : 0
                  } 
                  status="active"
                  strokeColor="#722ed1"
                />
              </div>
              <div>
                <Text strong>In Progress Orders</Text>
                <Progress 
                  percent={dashboardStats.totalOrders > 0 ? 
                    Math.round((dashboardStats.inProgressOrders / dashboardStats.totalOrders) * 100) : 0
                  } 
                  status="active"
                  strokeColor="#1890ff"
                />
              </div>
            </Flex>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;