import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Spin, Empty, Space, Select, Typography } from 'antd';
import {
  ToolOutlined,
  RollbackOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
} from '@ant-design/icons';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { authFetch } from '../../../api/client.js';
import { API_BASE_URL } from '../../../Config/auth.js';

const { Text } = Typography;

const KpiTile = ({ label, value, icon, bg }) => (
  <div
    style={{
      background: bg,
      borderRadius: 10,
      padding: '12px 16px',
      flex: 1,
      minWidth: 130,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    }}
  >
    <span style={{ fontSize: 24, color: 'rgba(255,255,255,0.85)', lineHeight: 1, flexShrink: 0 }}>
      {icon}
    </span>
    <div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 900,
          color: '#fff',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.8)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  </div>
);

const InventoryAnalytics = () => {
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [analyticsData, setAnalyticsData] = useState({
    itemsIssued: 0,
    itemsReturned: 0,
    pendingReturns: 0,
    totalRequests: 0,
    totalReturns: 0,
    monthlyData: [],
    toolUsageData: [],
  });

  useEffect(() => {
    fetchAnalyticsData(selectedYear);
  }, [selectedYear]);

  const fetchAnalyticsData = async (year) => {
    try {
      const requestsResponse = await authFetch(`${API_BASE_URL}/inventory-requests/`);
      const requestsData = await requestsResponse.json();

      const returnsResponse = await authFetch(`${API_BASE_URL}/inventory-return-requests/`);
      const returnsData = await returnsResponse.json();

      const approvedRequests = requestsData.filter((req) => {
        const reqYear = new Date(req.created_at).getFullYear();
        return req.status === 'approved' && reqYear === year;
      });
      const collectedReturns = returnsData.filter((ret) => {
        const retYear = new Date(ret.updated_at).getFullYear();
        return ret.status === 'collected' && retYear === year;
      });

      const itemsIssued = approvedRequests.reduce((sum, req) => sum + (req.quantity || 0), 0);
      const itemsReturned = collectedReturns.reduce((sum, ret) => sum + (ret.returned_qty || 0), 0);
      const calculatedPendingReturns = Math.max(0, itemsIssued - itemsReturned);

      const monthlyData = processMonthlyData(approvedRequests, collectedReturns, year);
      const toolUsageData = processToolUsageData(approvedRequests);

      setAnalyticsData({
        itemsIssued,
        itemsReturned,
        pendingReturns: calculatedPendingReturns,
        totalRequests: requestsData.length,
        totalReturns: returnsData.length,
        monthlyData,
        toolUsageData,
      });
    } catch (error) {
      console.error('Failed to fetch analytics data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processMonthlyData = (requests, returns, year) => {
    const monthlyStats = {};

    for (let i = 0; i < 12; i++) {
      const month = new Date(year, i, 1).toLocaleString('default', { month: 'short' });
      monthlyStats[month] = { issued: 0, returned: 0 };
    }

    requests.forEach((req) => {
      if (req.created_at) {
        const date = new Date(req.created_at);
        if (date.getFullYear() === year) {
          const month = date.toLocaleString('default', { month: 'short' });
          monthlyStats[month].issued += req.quantity || 0;
        }
      }
    });

    returns.forEach((ret) => {
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
      returned: data.returned,
    }));
  };

  const processToolUsageData = (requests) => {
    const toolUsage = {};
    requests.forEach((req) => {
      const toolName = req.tool_name || 'Unknown Tool';
      toolUsage[toolName] = (toolUsage[toolName] || 0) + (req.quantity || 0);
    });

    return Object.entries(toolUsage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, quantity]) => ({ name, quantity }));
  };

  const getReturnStatusData = () => {
    const { itemsIssued, itemsReturned } = analyticsData;
    const pending = Math.max(0, itemsIssued - itemsReturned);

    return [
      { name: 'Returned', value: itemsReturned, color: '#52c41a' },
      { name: 'Pending', value: pending, color: '#fa8c16' },
    ].filter((item) => item.value > 0);
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

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <Select value={selectedYear} onChange={(value) => setSelectedYear(value)} style={{ width: 120 }} size="small">
          {availableYears.map((year) => (
            <Select.Option key={year} value={year}>
              {year}
            </Select.Option>
          ))}
        </Select>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <KpiTile
          label="Items Issued"
          value={analyticsData.itemsIssued}
          icon={<ToolOutlined />}
          bg="#2563eb"
        />
        <KpiTile
          label="Items Returned"
          value={analyticsData.itemsReturned}
          icon={<RollbackOutlined />}
          bg="#16a34a"
        />
        <KpiTile
          label="Pending Returns"
          value={analyticsData.pendingReturns}
          icon={<ClockCircleOutlined />}
          bg="#d97706"
        />
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: '#3b82f6', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Monthly Issued vs Returned</span>
              </Space>
            }
            size="small"
            style={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
          >
            {analyticsData.monthlyData.length > 0 ? (
              <div style={{ height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="month" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="issued" name="Issued" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="returned" name="Returned" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="No monthly data available" style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <PieChartOutlined style={{ color: '#10b981', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Return Status Distribution</span>
              </Space>
            }
            size="small"
            style={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
          >
            {returnStatusData.length > 0 ? (
              <div style={{ height: '280px' }}>
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
                    <Tooltip />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="No return status data available" style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <BarChartOutlined style={{ color: '#f97316', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Most Issued Items</span>
              </Space>
            }
            size="small"
            style={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
          >
            {analyticsData.toolUsageData.length > 0 ? (
              <div style={{ height: '280px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData.toolUsageData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="quantity" name="Quantity Issued" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="No tool usage data available" style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: '#8b5cf6', fontSize: '18px' }} />
                <span style={{ fontSize: '16px', fontWeight: '600' }}>Year-to-Date Summary ({selectedYear})</span>
              </Space>
            }
            size="small"
            style={{ borderRadius: '12px', border: '1px solid #e5e7eb' }}
          >
            <div style={{ height: '280px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analyticsData.monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="issued" name="Issued" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                  <Line type="monotone" dataKey="returned" name="Returned" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ paddingTop: '8px', borderTop: '1px solid #f0f0f0', marginTop: '8px' }}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                Based on approved requests and collected returns for {selectedYear}
              </Text>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default InventoryAnalytics;
