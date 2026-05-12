import React, { useState, useEffect } from 'react';
import { Spin, Alert, Typography, Button, Switch, Radio, Space, Row, Col, Segmented, Card } from 'antd';
import { motion } from 'framer-motion';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';
import { TableOutlined, CalendarOutlined, AppstoreOutlined, LineChartOutlined } from '@ant-design/icons';

import { MachineGrid } from './MachineComponents';
import { SchedulingAnalytics } from './SchedulingAnalytics';

const { Title, Text } = Typography;

// Main ShopFloorDashboard Component
const ShopFloorDashboard = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('2d'); // '2d' or 'analytics'
  const [analyticsViewMode, setAnalyticsViewMode] = useState('table'); // 'table' or 'heatmap'

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

  const getUserRole = () => {
    try {
      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const userData = JSON.parse(stored);
      return userData.role || userData.user_role;
    } catch { return null; }
  };

  const fetchShopFloorData = async () => {
    setLoading(true);
    setError(null);
    try {
      const userId = getCurrentAdminId();
      const userRole = getUserRole();
      const normalizedRole = (userRole || '').toLowerCase().replace(/_/g, ' ').trim();
      
      if (!userId) {
        setError('No user ID found. Please log in again.');
        return;
      }

      // Use manufacturing_coordinator_id for MC users, admin_id for admin users
      const isManufacturingCoordinator = normalizedRole.includes('manufacturing coordinator') || normalizedRole === 'mc';
      const params = isManufacturingCoordinator 
        ? { manufacturing_coordinator_id: userId }
        : { admin_id: userId };

      const response = await axios.get(`${API_BASE_URL}/orders/shop-floor/hierarchical`, {
        params
      });
      setData(response.data);
    } catch (err) {
      console.error('Failed to fetch shop floor data:', err);
      
      let errorMessage = 'Failed to load shop floor data';
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMessage = err.response.data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        } else {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopFloorData();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f5f5f5' }}>
        <Spin size="large" />
        <Text style={{ marginTop: 16, color: '#666' }}>Loading shop floor dashboard...</Text>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
        <Alert
          title="Error"
          description={typeof error === 'string' ? error : 'Failed to load shop floor data'}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={fetchShopFloorData}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{ padding: '12px', background: '#f5f5f5', minHeight: '100vh' }}
    >
      <style>{`
        .custom-segmented .ant-segmented-item {
          border-radius: 6px;
          transition: all 0.3s ease;
        }
        .custom-segmented .ant-segmented-item-selected {
          background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%) !important;
          color: white !important;
          box-shadow: 0 2px 8px rgba(25, 118, 210, 0.3);
        }
        .custom-segmented .ant-segmented-item:hover:not(.ant-segmented-item-selected) {
          background: #e3f2fd;
        }
        .custom-segmented .ant-segmented-item-selected .anticon {
          color: white !important;
        }
      `}</style>
      {/* Header Section */}
      <Card
        style={{
          marginBottom: '16px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Space size="large" align="center">
              <div>
                <Title level={3} style={{ margin: 0, color: '#262626' }}>
                  Shop Floor Dashboard
                </Title>
                <Text type="secondary" style={{ fontSize: '12px' }}>
                  Monitor and manage shop floor operations
                </Text>
              </div>
            </Space>
          </Col>
          <Col xs={24} sm={12} md={16}>
            <Row justify="end" align="middle" gutter={[12, 12]}>
              <Col>
                <Segmented
                  value={viewMode}
                  onChange={(value) => setViewMode(value)}
                  options={[
                    {
                      label: (
                        <Space size={4}>
                          <AppstoreOutlined />
                          <span>2D View</span>
                        </Space>
                      ),
                      value: '2d'
                    },
                    {
                      label: (
                        <Space size={4}>
                          <LineChartOutlined />
                          <span>Analytics</span>
                        </Space>
                      ),
                      value: 'analytics'
                    }
                  ]}
                  size="large"
                  style={{
                    backgroundColor: '#f5f5f5',
                    padding: '4px',
                    borderRadius: '8px'
                  }}
                  className="custom-segmented"
                />
              </Col>
              {viewMode === 'analytics' && (
                <Col>
                  <Segmented
                    value={analyticsViewMode}
                    onChange={(value) => setAnalyticsViewMode(value)}
                    options={[
                      {
                        label: (
                          <Space size={4}>
                            <TableOutlined />
                            <span>Table</span>
                          </Space>
                        ),
                        value: 'table'
                      },
                      {
                        label: (
                          <Space size={4}>
                            <CalendarOutlined />
                            <span>Calendar</span>
                          </Space>
                        ),
                        value: 'heatmap'
                      }
                    ]}
                    size="large"
                    style={{
                      backgroundColor: '#f5f5f5',
                      padding: '4px',
                      borderRadius: '8px'
                    }}
                    className="custom-segmented"
                  />
                </Col>
              )}
              <Col>
                <Button
                  type="primary"
                  onClick={onBack}
                  icon={<AppstoreOutlined />}
                  style={{
                    background: '#1976d2',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 500,
                    height: '36px'
                  }}
                >
                  Back
                </Button>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>

      {/* Machines Grid Section */}
      <div style={{ marginTop: 0 }}>
        {viewMode === '2d' ? (
          <MachineGrid machines={data.machines} onBack={onBack} />
        ) : (
          <SchedulingAnalytics machines={data.machines} viewMode={analyticsViewMode} />
        )}
      </div>
    </motion.div>
  );
};

export default ShopFloorDashboard;
