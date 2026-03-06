import React from 'react';
import { Tabs, Card } from 'antd';
import { ShoppingCartOutlined, ToolOutlined, AppstoreOutlined, ExperimentOutlined, BellOutlined } from '@ant-design/icons';
import OrderNotifications from '../Notification Components/OrderNotifications';
import MachineNotifications from '../Notification Components/MachineNotifications';
import ToolIssuesNotifications from '../Notification Components/ToolIssuesNotifications';
import ComponentIssuesNotifications from '../Notification Components/ComponentIssuesNotifications';
import MachineCalibrationNotifications from '../Notification Components/MachineCalibrationNotifications';

const Notification = () => {
  const tabItems = [
    {
      key: '1',
      label: (
        <span>
          <ShoppingCartOutlined />
          Order Notifications
        </span>
      ),
      children: <OrderNotifications />
    },
    {
      key: '2',
      label: (
        <span>
          <BellOutlined />
          Machine Notifications
        </span>
      ),
      children: <MachineNotifications />
    },
    {
      key: '3',
      label: (
        <span>
          <ToolOutlined />
          Tool Issues Notifications
        </span>
      ),
      children: <ToolIssuesNotifications />
    },
    {
      key: '4',
      label: (
        <span>
          <AppstoreOutlined />
          Component Issues Notifications
        </span>
      ),
      children: <ComponentIssuesNotifications />
    },
    {
      key: '5',
      label: (
        <span>
          <ExperimentOutlined />
          Machine Calibration Notifications
        </span>
      ),
      children: <MachineCalibrationNotifications />
    }
  ];

  return (
    <Card
      title="Notifications Center"
      variant="outlined"
      style={{ 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        borderRadius: '12px'
      }}
    >
      <Tabs defaultActiveKey="1" items={tabItems} />
    </Card>
  );
};

export default Notification;
