import React, { useState, useEffect } from 'react';
import { Spin, Alert, Typography, Button, Switch, Radio, Space } from 'antd';
import { motion } from 'framer-motion';
import axios from 'axios';
import { API_BASE_URL } from '../../Config/auth';
import { TableOutlined, CalendarOutlined } from '@ant-design/icons';

import { MachineGrid } from './MachineComponents';
import { SchedulingAnalytics } from './SchedulingAnalytics';

const { Text } = Typography;

// Main ShopFloorDashboard Component
const ShopFloorDashboard = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('2d'); // '2d' or 'analytics'
  const [analyticsViewMode, setAnalyticsViewMode] = useState('table'); // 'table' or 'heatmap'

  const getCurrentmanufacturingcoordinatorId = () => {
    try {
      const stored = localStorage.getItem("user");
      if (!stored) return null;
      const user = JSON.parse(stored);
      // For manufacturing coordinator role, use the user id
      return user?.role === 'manufacturing_coordinator' ? user?.id : user?.manufacturing_coordinator_id;
    } catch {
      return null;
    }
  };

  const fetchShopFloorData = async () => {
    setLoading(true);
    setError(null);
    try {
      const manufacturingcoordinatorId = getCurrentmanufacturingcoordinatorId();
      if (!manufacturingcoordinatorId) {
        setError('No manufacturingcoordinator ID found. Please log in again.');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/orders/shop-floor/hierarchical`, {
        params: { manufacturing_coordinator_id: manufacturingcoordinatorId }
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
      {/* View Toggle */}
      <div style={{
        marginBottom: '12px',
        padding: '12px',
        background: 'white',
        borderRadius: '8px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Text strong style={{ fontSize: '14px' }}>Shop Floor Dashboard</Text>
          <Switch
            checked={viewMode === 'analytics'}
            onChange={(checked) => setViewMode(checked ? 'analytics' : '2d')}
            checkedChildren="Analytics"
            unCheckedChildren="2D View"
            style={{ minWidth: '100px' }}
          />
          {viewMode === 'analytics' && (
            <Radio.Group
              value={analyticsViewMode}
              onChange={(e) => setAnalyticsViewMode(e.target.value)}
              buttonStyle="solid"
              size="small"
            >
              <Radio.Button value="table"><TableOutlined /> Table View</Radio.Button>
              <Radio.Button value="heatmap"><CalendarOutlined /> Calendar Heatmap</Radio.Button>
            </Radio.Group>
          )}
        </div>
        <Button
          type="primary"
          onClick={onBack}
          style={{
            background: '#1976d2',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 500,
            height: '32px'
          }}
        >
          Back
        </Button>
      </div>

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
