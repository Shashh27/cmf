import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, Empty, Space,Select,Typography } from 'antd';
import { ToolOutlined, RollbackOutlined, ClockCircleOutlined,BarChartOutlined,LineChartOutlined,PieChartOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,PieChart, Pie, Cell,LineChart,Line } from 'recharts';
import { API_BASE_URL } from '../../../Config/auth.js';

const { Text } = Typography;

const InventoryAnalytics = () => {
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedCard, setSelectedCard] = useState(null);
  const [analyticsData, setAnalyticsData] = useState({
    itemsIssued: 0,
    itemsReturned: 0,
    pendingReturns: 0,
    totalRequests: 0,
    totalReturns: 0,
    monthlyData: [],
    toolUsageData: []
  });

  useEffect(() => {
    fetchAnalyticsData(selectedYear);
  }, [selectedYear]);

  const fetchAnalyticsData = async (year) => {
    try {
      // Fetch inventory requests
      const requestsResponse = await fetch(`${API_BASE_URL}/inventory-requests/`);
      const requestsData = await requestsResponse.json();
      
      // Fetch return requests
      const returnsResponse = await fetch(`${API_BASE_URL}/inventory-return-requests/`);
      const returnsData = await returnsResponse.json();
      
      // Process analytics data
      const approvedRequests = requestsData.filter(req => {
        const reqYear = new Date(req.created_at).getFullYear();
        return req.status === 'approved' && reqYear === year;
      });
      const collectedReturns = returnsData.filter(ret => {
        const retYear = new Date(ret.updated_at).getFullYear();
        return ret.status === 'collected' && retYear === year;
      });
      
      // Calculate totals
      const itemsIssued = approvedRequests.reduce((sum, req) => sum + (req.quantity || 0), 0);
      const itemsReturned = collectedReturns.reduce((sum, ret) => sum + (ret.returned_qty || 0), 0);
      
      // Calculate pending returns as the difference between issued and returned
      const calculatedPendingReturns = Math.max(0, itemsIssued - itemsReturned);
      
      // Process monthly data
      const monthlyData = processMonthlyData(approvedRequests, collectedReturns, year);
      
      // Process tool usage data
      const toolUsageData = processToolUsageData(approvedRequests);
      
      setAnalyticsData({
        itemsIssued,
        itemsReturned,
        pendingReturns: calculatedPendingReturns,
        totalRequests: requestsData.length,
        totalReturns: returnsData.length,
        monthlyData,
        toolUsageData
      });
      
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processMonthlyData = (requests, returns, year) => {
    const monthlyStats = {};
    
    // Initialize months
    for (let i = 0; i < 12; i++) {
      const month = new Date(year, i, 1).toLocaleString('default', { month: 'short' });
      monthlyStats[month] = { issued: 0, returned: 0 };
    }
    
    // Process requests
    requests.forEach(req => {
      if (req.created_at) {
        const date = new Date(req.created_at);
        if (date.getFullYear() === year) {
          const month = date.toLocaleString('default', { month: 'short' });
          monthlyStats[month].issued += req.quantity || 0;
        }
      }
    });
    
    // Process returns
    returns.forEach(ret => {
      if (ret.updated_at) {
        const date = new Date(ret.updated_at);
        if (date.getFullYear() === year) {
          const month = date.toLocaleString('default', { month: 'short' });
          monthlyStats[month].returned += ret.returned_qty || 0;
        }
      }
    });
    
    return Object.entries(monthlyStats).map(([month, data]) => ({
      month,
      issued: data.issued,
      returned: data.returned
    }));
  };

  const processToolUsageData = (requests) => {
    const toolUsage = {};
    requests.forEach(req => {
      const toolName = req.tool_name || 'Unknown Tool';
      toolUsage[toolName] = (toolUsage[toolName] || 0) + (req.quantity || 0);
    });
    
    return Object.entries(toolUsage)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 6)
      .map(([name, quantity]) => ({ name, quantity }));
  };

  // Prepare return status data for pie chart
  const getReturnStatusData = () => {
    const { itemsIssued, itemsReturned } = analyticsData;
    const pending = Math.max(0, itemsIssued - itemsReturned);
    
    return [
      { name: 'Returned', value: itemsReturned, color: '#52c41a' },
      { name: 'Pending', value: pending, color: '#fa8c16' }
    ].filter(item => item.value > 0);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '256px' }}>
        <Spin size="large" tip="Loading analytics data..." />
      </div>
    );
  }

  const returnStatusData = getReturnStatusData();
  const availableYears = [new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2];

  const kpiCards = [
    {
      id: 'items-issued',
      title: 'Total Items Issued',
      subtitle: 'Approved Requests',
      value: analyticsData.itemsIssued,
      icon: <ToolOutlined />,
      color: '#3b82f6',
      bgGradient: 'from-blue-50 via-blue-50 to-white',
      bottomGradient: 'from-blue-400 via-blue-500 to-purple-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-blue-100'
    },
    {
      id: 'items-returned',
      title: 'Total Items Returned',
      subtitle: 'Collected Returns',
      value: analyticsData.itemsReturned,
      icon: <RollbackOutlined />,
      color: '#10b981',
      bgGradient: 'from-green-50 via-green-50 to-white',
      bottomGradient: 'from-green-400 via-emerald-500 to-teal-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-green-100'
    },
    {
      id: 'pending-returns',
      title: 'Pending Returns',
      subtitle: 'Awaiting Return',
      value: analyticsData.pendingReturns,
      icon: <ClockCircleOutlined />,
      color: '#f97316',
      bgGradient: 'from-orange-50 via-orange-50 to-white',
      bottomGradient: 'from-orange-400 via-orange-500 to-red-500',
      hoverShadow: 'hover:shadow-xl hover:shadow-orange-100'
    }
  ];

  return (
    <div style={{ marginBottom: '24px' }}>
            
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <Select 
          value={selectedYear} 
          onChange={(value) => setSelectedYear(value)}
          style={{ width: 120 }}
        >
          {availableYears.map(year => (
            <Select.Option key={year} value={year}>{year}</Select.Option>
          ))}
        </Select>
      </div>

      {/* Enhanced KPI Cards Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        {kpiCards.map((card, index) => (
          <Col xs={24} sm={12} lg={8} key={index}>
            <Card
              hoverable
              className={`
                relative overflow-hidden
                transition-all duration-300 ease-out
                bg-gradient-to-br ${card.bgGradient}
                border border-gray-200 rounded-2xl
                ${selectedCard === card.id ? 'ring-2 ring-offset-2 scale-[1.02]' : ''}
                hover:scale-[1.02] cursor-pointer
                ${card.hoverShadow}
              `}
              style={{
                boxShadow: selectedCard === card.id 
                  ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' 
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                borderRadius: '16px'
              }}
              bodyStyle={{ padding: '24px', paddingBottom: '20px' }}
              onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}
            >
              {/* Card Content */}
              <div className="relative z-10">
                {/* Header with title and icon */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1 pr-2">
                    <div className="text-lg font-bold text-gray-900 mb-1">
                      {card.title}
                    </div>
                    <div className="text-xs text-gray-500 font-medium">
                      {card.subtitle}
                    </div>
                  </div>
                  <div className={`
                    flex items-center justify-center
                    transition-all duration-500 ease-in-out
                    ${selectedCard === card.id ? 'scale-110 rotate-12' : 'hover:scale-110 hover:rotate-6'}
                                      `}>
                    <div className="text-5xl transition-all duration-300" style={{ color: card.color }}>
                      {card.icon}
                    </div>
                  </div>
                </div>
                
                {/* Value */}
                <div className="mb-2">
                  <Statistic
                    value={card.value}
                    valueStyle={{
                      color: card.color,
                      fontSize: '36px',
                      fontWeight: '700',
                      lineHeight: 1.2,
                      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
                    }}
                  />
                </div>
              </div>

              {/* Bottom Gradient Border */}
              <div 
                className={`
                  absolute bottom-0 left-0 right-0 h-1
                  bg-gradient-to-r ${card.bottomGradient}
                  transition-all duration-300
                  ${selectedCard === card.id ? 'h-1.5' : ''}
                `}
                style={{
                  borderBottomLeftRadius: '16px',
                  borderBottomRightRadius: '16px'
                }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts Section */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        {/* Monthly Trends */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <LineChartOutlined style={{ color: '#3b82f6', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Monthly Issued vs Returned</span>
              </Space>
            }
            style={{ 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}
            headStyle={{ 
              borderBottom: '2px solid #f3f4f6',
              background: 'linear-gradient(to right, #f9fafb, #ffffff)'
            }}
          >
            {analyticsData.monthlyData.length > 0 ? (
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analyticsData.monthlyData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="issued" name="Issued" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="returned" name="Returned" fill="#10b981" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty 
                description="No monthly data available" 
                style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
              />
            )}
          </Card>
        </Col>

        {/* Return Status Distribution */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <PieChartOutlined style={{ color: '#10b981', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Return Status Distribution</span>
              </Space>
            }
            style={{ 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}
            headStyle={{ 
              borderBottom: '2px solid #f3f4f6',
              background: 'linear-gradient(to right, #f9fafb, #ffffff)'
            }}
          >
            {returnStatusData.length > 0 ? (
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={returnStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {returnStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend verticalAlign="bottom" height={36}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty 
                description="No return status data available" 
                style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Most Issued Items and Year-to-Date Summary */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <BarChartOutlined style={{ color: '#f97316', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Most Issued Items</span>
              </Space>
            }
            style={{ 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}
            headStyle={{ 
              borderBottom: '2px solid #f3f4f6',
              background: 'linear-gradient(to right, #f9fafb, #ffffff)'
            }}
          >
            {analyticsData.toolUsageData.length > 0 ? (
              <div style={{ height: '300px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analyticsData.toolUsageData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip 
                      contentStyle={{ 
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="quantity" name="Quantity Issued" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty 
                description="No tool usage data available" 
                style={{ height: 300, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
              />
            )}
          </Card>
        </Col>

        {/* Year-to-Date Summary */}
        <Col xs={24} lg={12}>
          <Card 
            title={
              <Space>
                <LineChartOutlined style={{ color: '#8b5cf6', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Year-to-Date Summary ({selectedYear})</span>
              </Space>
            }
            style={{ 
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}
            headStyle={{ 
              borderBottom: '2px solid #f3f4f6',
              background: 'linear-gradient(to right, #f9fafb, #ffffff)'
            }}
          >
            <div style={{ height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={analyticsData.monthlyData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip 
                    contentStyle={{ 
                      borderRadius: '8px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                  />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="issued" 
                    name="Issued" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="returned" 
                    name="Returned" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    dot={{ fill: '#10b981', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ 
              paddingTop: '16px', 
              borderTop: '1px solid #f0f0f0',
              marginTop: '16px'
            }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Updated in real-time based on active records for {selectedYear}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default InventoryAnalytics;
