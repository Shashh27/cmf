import React from "react";
import { Layout, Menu } from "antd";
import { Link, useLocation } from "react-router-dom";
import { 
  AppstoreOutlined, 
  DeploymentUnitOutlined, 
  SettingOutlined, 
  ShoppingCartOutlined,
  DashboardOutlined,
  MonitorOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  BellOutlined,
  LockOutlined
} from "@ant-design/icons";
import cmtisLogo from "../../assets/cmtis.png";

const { Sider } = Layout;

const Sidebar = () => {
  const location = useLocation();
  const selectedKey = location.pathname;
  
  // Determine open keys based on path
  const getOpenKeys = () => {
    const path = location.pathname;
    if (path.startsWith('/oms')) return ['oms'];
    if (path.startsWith('/pps')) return ['pps'];
    if (path.startsWith('/product-monitoring')) return ['product-monitoring'];
    if (path.startsWith('/inventory-management')) return ['inventory-management'];
    return [];
  };

  const items = [
    {
      key: '/dashboard',
      label: <Link to="/dashboard">Dashboard</Link>,
      icon: <DashboardOutlined />,
    },
    {
      key: 'oms',
      label: 'OMS',
      icon: <ShoppingCartOutlined />,
      children: [
        { key: '/oms/orders', label: <Link to="/oms/orders">Orders</Link> },
        { key: '/oms/rawmaterials', label: <Link to="/oms/rawmaterials">Raw Materials</Link> },
      ],
    },
    {
      key: '/pdm',
      label: <Link to="/pdm">PDM</Link>,
      icon: <DeploymentUnitOutlined />,
    },
    {
      key: 'pps',
      label: 'PPS',
      icon: <AppstoreOutlined />,
      children: [
        { key: '/pps/assets-availability', label: <Link to="/pps/assets-availability">Assets Availability</Link> },
        { key: '/pps/capacity-planning', label: <Link to="/pps/capacity-planning">Capacity Planning</Link> },
        { key: '/pps/machine-scheduling', label: <Link to="/pps/machine-scheduling">Machine Scheduling</Link> },
      ],
    },
    {
      key: '/configuration',
      label: <Link to="/configuration">Configuration</Link>,
      icon: <SettingOutlined />,
    },
    {
      key: 'product-monitoring',
      label: 'Product Monitoring',
      icon: <MonitorOutlined />,
      children: [
        { key: '/product-monitoring/live-monitoring', label: <Link to="/product-monitoring/live-monitoring">Live Monitoring</Link> },
        { key: '/product-monitoring/planned-vs-actual', label: <Link to="/product-monitoring/planned-vs-actual">Planned vs Actual</Link> },
        { key: '/product-monitoring/order-tracking', label: <Link to="/product-monitoring/order-tracking">Order Tracking</Link> },
        { key: '/product-monitoring/maintenance', label: <Link to="/product-monitoring/maintenance">Maintenance</Link> },
      ],
    },
    {
      key: '/quality-management',
      label: <Link to="/quality-management">Quality Management</Link>,
      icon: <SafetyCertificateOutlined />,
    },
    {
      key: 'inventory-management',
      label: 'Inventory Management',
      icon: <DatabaseOutlined />,
      children: [
        { key: '/inventory-management/inventory-master', label: <Link to="/inventory-management/inventory-master">Inventory Master</Link> },
        { key: '/inventory-management/overview-data', label: <Link to="/inventory-management/overview-data">Overview Data</Link> },
      ],
    },
    {
      key: '/document-management',
      label: <Link to="/document-management">Document Management</Link>,
      icon: <FileTextOutlined />,
    },
    {
      key: '/notification',
      label: <Link to="/notification">Notification</Link>,
      icon: <BellOutlined />,
    },
    {
      key: '/access-control',
      label: <Link to="/access-control">Access Control</Link>,
      icon: <LockOutlined />,
    },
  ];

  return (
    <Sider 
      width={224} 
      theme="light" 
      style={{ 
        overflow: 'auto', 
        height: '100vh', 
        position: 'fixed', 
        left: 0, 
        top: 0, 
        bottom: 0, 
        borderRight: '1px solid #f0f0f0',
        zIndex: 100
      }}
    >
       <div className="p-4 flex justify-center items-center border-b border-gray-100 mb-2">
         <img src={cmtisLogo} alt="CMTIS Logo" style={{ height: 40 }} />
       </div>
       <Menu
         mode="inline"
         defaultSelectedKeys={[selectedKey]}
         defaultOpenKeys={getOpenKeys()}
         selectedKeys={[selectedKey]}
         style={{ borderRight: 0 }}
         items={items}
       />
    </Sider>
  );
};

export default Sidebar;