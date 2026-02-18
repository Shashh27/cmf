import React from "react";
import { Layout, Menu } from "antd";
import { Link, useLocation } from "react-router-dom";
import { AppstoreOutlined, DeploymentUnitOutlined, SettingOutlined, ShoppingCartOutlined,DashboardOutlined,MonitorOutlined,ToolOutlined,SafetyCertificateOutlined,
  DatabaseOutlined,FileTextOutlined,BellOutlined,LockOutlined } from "@ant-design/icons";
import cmtisLogo from "../../assets/cmtis.png";

const { Sider } = Layout;

const Sidebar = () => {
  const location = useLocation();
  const selectedKey = location.pathname;
  
  // Get the role prefix from the path
  const getRolePrefix = () => {
    const path = location.pathname;
    if (path.startsWith('/admin')) return '/admin';
    if (path.startsWith('/project_coordinator')) return '/project_coordinator';
    if (path.startsWith('/operator')) return '/operator';
    return ''; // Default fallback
  };

  const prefix = getRolePrefix();

  // Determine open keys based on path
  const getOpenKeys = () => {
    const path = location.pathname;
    if (path.includes('/oms')) return ['oms'];
    if (path.includes('/pps')) return ['pps'];
    if (path.includes('/product-monitoring')) return ['product-monitoring'];
    if (path.includes('/inventory-management')) return ['inventory-management'];
    return [];
  };

  // Define all menu items with dynamic paths
  const allItems = [
    {
      key: `${prefix}/dashboard`,
      label: <Link to={`${prefix}/dashboard`}>Dashboard</Link>,
      icon: <DashboardOutlined />,
    },
    {
      key: 'oms',
      label: 'OMS',
      icon: <ShoppingCartOutlined />,
      children: [
        { key: `${prefix}/oms/orders`, label: <Link to={`${prefix}/oms/orders`}>Orders</Link> },
        { key: `${prefix}/oms/rawmaterials`, label: <Link to={`${prefix}/oms/rawmaterials`}>Raw Materials</Link> },
      ],
    },
    {
      key: `${prefix}/pdm`,
      label: <Link to={`${prefix}/pdm`}>PDM</Link>,
      icon: <DeploymentUnitOutlined />,
    },
    {
      key: 'pps',
      label: 'PPS',
      icon: <AppstoreOutlined />,
      children: [
        { key: `${prefix}/pps/assets-availability`, label: <Link to={`${prefix}/pps/assets-availability`}>Assets Availability</Link> },
        { key: `${prefix}/pps/capacity-planning`, label: <Link to={`${prefix}/pps/capacity-planning`}>Capacity Planning</Link> },
        { key: `${prefix}/pps/machine-scheduling`, label: <Link to={`${prefix}/pps/machine-scheduling`}>Machine Scheduling</Link> },
      ],
    },
    {
      key: `${prefix}/configuration`,
      label: <Link to={`${prefix}/configuration`}>Configuration</Link>,
      icon: <SettingOutlined />,
    },
    {
      key: 'product-monitoring',
      label: 'Product Monitoring',
      icon: <MonitorOutlined />,
      children: [
        { key: `${prefix}/product-monitoring/live-monitoring`, label: <Link to={`${prefix}/product-monitoring/live-monitoring`}>Live Monitoring</Link> },
        { key: `${prefix}/product-monitoring/planned-vs-actual`, label: <Link to={`${prefix}/product-monitoring/planned-vs-actual`}>Planned vs Actual</Link> },
        { key: `${prefix}/product-monitoring/order-tracking`, label: <Link to={`${prefix}/product-monitoring/order-tracking`}>Order Tracking</Link> },
        { key: `${prefix}/product-monitoring/maintenance`, label: <Link to={`${prefix}/product-monitoring/maintenance`}>Maintenance</Link> },
      ],
    },
    {
      key: `${prefix}/quality-management`,
      label: <Link to={`${prefix}/quality-management`}>Quality Management</Link>,
      icon: <SafetyCertificateOutlined />,
    },
    {
      key: 'inventory-management',
      label: 'Inventory Management',
      icon: <DatabaseOutlined />,
      children: [
        { key: `${prefix}/inventory-management/inventory-master`, label: <Link to={`${prefix}/inventory-management/inventory-master`}>Inventory Master</Link> },
        { key: `${prefix}/inventory-management/overview-data`, label: <Link to={`${prefix}/inventory-management/overview-data`}>Overview Data</Link> },
      ],
    },
    {
      key: `${prefix}/document-management`,
      label: <Link to={`${prefix}/document-management`}>Document Management</Link>,
      icon: <FileTextOutlined />,
    },
    {
      key: `${prefix}/notification`,
      label: <Link to={`${prefix}/notification`}>Notification</Link>,
      icon: <BellOutlined />,
    },
    {
      key: `${prefix}/access_control`,
      label: <Link to={`${prefix}/access_control`}>Access Control</Link>,
      icon: <LockOutlined />,
    },
  ];

  // Filter items based on role
  let items = [];
  if (prefix === '/admin') {
    items = allItems;
  } else if (prefix === '/operator') {
    items = [
      {
        key: `${prefix}/dashboard`,
        label: <Link to={`${prefix}/dashboard`}>Dashboard</Link>,
        icon: <DashboardOutlined />,
      },
      {
        key: `${prefix}/inspection-results`,
        label: <Link to={`${prefix}/inspection-results`}>Inspection Results</Link>,
        icon: <SafetyCertificateOutlined />,
      },
      {
        key: `${prefix}/inventory-data`,
        label: <Link to={`${prefix}/inventory-data`}>Inventory Data</Link>,
        icon: <DatabaseOutlined />,
      },
      {
        key: `${prefix}/documents`,
        label: <Link to={`${prefix}/documents`}>Documents</Link>,
        icon: <FileTextOutlined />,
      },
    ];
  } else if (prefix === '/project_coordinator') {
    items = [
      {
        key: `${prefix}/oms/orders`,
        label: <Link to={`${prefix}/oms/orders`}>Orders</Link>,
        icon: <ShoppingCartOutlined />,
      },
      {
        key: `${prefix}/pdm`,
        label: <Link to={`${prefix}/pdm`}>PDM</Link>,
        icon: <DeploymentUnitOutlined />,
      },
    ];
  } else {
    items = [allItems[0]];
  }

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
