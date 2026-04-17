import React, { useState, useEffect } from 'react';
import { Spin, Alert, Typography } from 'antd';
import { motion } from 'framer-motion';
import axios from 'axios';
import { API_BASE_URL } from '../Config/auth';

import { MachineGrid } from './MachineComponents';

const { Text } = Typography;

// Main ShopFloorDashboard Component
const ShopFloorDashboard = ({ onBack }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

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

  const fetchShopFloorData = async () => {
    setLoading(true);
    setError(null);
    try {
      const adminId = getCurrentAdminId();
      if (!adminId) {
        setError('No admin ID found. Please log in again.');
        return;
      }

      const response = await axios.get(`${API_BASE_URL}/orders/shop-floor/hierarchical`, {
        params: { admin_id: adminId }
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
      {/* Machines Grid Section */}
      <div style={{ marginTop: 0 }}>
        <MachineGrid machines={data.machines} onBack={onBack} />
      </div>
    </motion.div>
  );
};

export default ShopFloorDashboard;
