import React, { useState, useEffect } from "react";

import { Layout, Menu, Drawer, Button, Badge } from "antd";

import { Link, useLocation } from "react-router-dom";

import { AppstoreOutlined, DeploymentUnitOutlined, SettingOutlined, ShoppingCartOutlined,DashboardOutlined,MonitorOutlined,ToolOutlined,CarryOutOutlined,

  SafetyCertificateOutlined,DatabaseOutlined,FileTextOutlined,BellOutlined,LockOutlined,MenuOutlined,CloseOutlined,ExperimentOutlined,CalendarOutlined,BuildOutlined,HistoryOutlined,SyncOutlined,DeleteOutlined

} from "@ant-design/icons";

import cmtisLogo from "../../assets/cmtis.png";

import { SCHEDULING_API_BASE_URL } from '../../Config/schedulingconfig';

import { API_BASE_URL } from '../../Config/auth';



const { Sider } = Layout;



const Sidebar = ({ collapsed, onCollapse }) => {

  const location = useLocation();

  const selectedKey = location.pathname;

  const [isMobile, setIsMobile] = useState(false);

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const [notificationCount, setNotificationCount] = useState(0);



  // Get the role prefix from the path

  const getRolePrefix = () => {

    const path = location.pathname;

    if (path.startsWith('/admin')) return '/admin';

    if (path.startsWith('/project_coordinator')) return '/project_coordinator';

    if (path.startsWith('/operator')) return '/operator';

    if (path.startsWith('/manufacturing_coordinator')) return '/manufacturing_coordinator';

    if (path.startsWith('/supervisor')) return '/supervisor';

    if (path.startsWith('/inventory_supervisor')) return '/inventory_supervisor';

    return ''; // Default fallback

  };



  const prefix = getRolePrefix();



  // Determine open keys based on path

  const getOpenKeys = () => {

    const path = location.pathname;

    const keys = [];

    if (path.includes('/oms')) keys.push('oms');

    if (path.includes('/pps')) keys.push('pps');

    if (path.includes('/product-monitoring')) keys.push('product-monitoring');

    if (path.includes('/maintenance-management')) keys.push('maintenance-management');

    if (path.includes('/inventory-management')) keys.push('inventory-management');

    return keys;

  };



  const [openKeys, setOpenKeys] = useState(getOpenKeys());

  

  // Detect mobile screen

  useEffect(() => {

    const handleResize = () => {

      const mobile = window.innerWidth < 768;

      setIsMobile(mobile);

      if (!mobile) {

        setMobileDrawerOpen(false);

      }

    };



    handleResize();

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);

  }, []);



  // Fetch notification count for operator and project coordinator

  useEffect(() => {

    if (prefix === '/operator') {

      fetchOperatorNotificationCount();

    } else if (prefix === '/supervisor') {

      fetchSupervisorNotificationCount();

    } else if (prefix === '/project_coordinator') {

      fetchPCNotificationCount();

    }

  }, []);



  const fetchOperatorNotificationCount = async () => {

    try {

      // Get operator ID from localStorage

      let operatorId = null;

      const storedUser = localStorage.getItem('user');

      if (storedUser) {

        try {

          const user = JSON.parse(storedUser);

          operatorId = user.id;

        } catch (e) {

          console.error("Error parsing user from local storage", e);

        }

      }

      if (!operatorId) operatorId = localStorage.getItem('operator_id');



      if (!operatorId) return;



      // Fetch production logs

      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true&operator_id=${operatorId}`;



      const response = await fetch(apiUrl);

      if (response.ok) {

        const data = await response.json();

        // Count logs where supervisor has responded, produced_quantity > 0, and not acknowledged

        const supervisorRespondedLogs = (data || []).filter(

          log => (log.supervisor_id !== null && log.supervisor_id !== undefined) &&

                 (log.produced_quantity || 0) > 0 &&

                 !log.operator_acknowledged_at &&

                 !log.acknowledged

        );

        setNotificationCount(supervisorRespondedLogs.length);

      }

    } catch (error) {

      console.error('Error fetching notification count:', error);

    }

  };



  const fetchSupervisorNotificationCount = async () => {

    try {

      // Get supervisor ID from localStorage

      const storedUser = localStorage.getItem('user');

      let supervisorId = null;

      if (storedUser) {

        try {

          const user = JSON.parse(storedUser);

          supervisorId = user.id;

        } catch (e) {

          console.error("Error parsing user from local storage", e);

        }

      }

      if (!supervisorId) supervisorId = localStorage.getItem('supervisor_id');



      // Fetch all production logs

      const apiUrl = `${SCHEDULING_API_BASE_URL}/production-logs/?hierarchical=true`;



      const response = await fetch(apiUrl);

      if (response.ok) {

        const data = await response.json();

        // Count logs related to supervisor (both responded and not responded)

        // where produced_quantity > 0 and not acknowledged

        const supervisorLogs = (data || []).filter(

          log => ((log.supervisor_id === null || log.supervisor_id === undefined) ||

                 String(log.supervisor_id) === String(supervisorId)) &&

                 (log.produced_quantity || 0) > 0 &&

                 !log.supervisor_acknowledged_at &&

                 !log.acknowledged

        );

        setNotificationCount(supervisorLogs.length);

      }

    } catch (error) {

      console.error('Error fetching notification count:', error);

    }

  };



  const fetchPCNotificationCount = async () => {

    try {

      const storedUser = localStorage.getItem('user');

      if (!storedUser) return;

      

      const user = JSON.parse(storedUser);

      if (!user.id) return;



      const response = await fetch(`${API_BASE_URL}/pc-notifications/${user.id}/unread-count`);

      if (response.ok) {

        const data = await response.json();

        setNotificationCount(data.unread_count || 0);

      }

    } catch (error) {

      console.error('Error fetching PC notification count:', error);

    }

  };



  // Define all menu items with dynamic paths

  const allItems = [

    {

      key: `${prefix}/dashboard`,

      label: <Link to={`${prefix}/dashboard`} onClick={() => setMobileDrawerOpen(false)}>Dashboard</Link>,

      icon: <DashboardOutlined />,

    },

    {

      key: 'oms',

      label: 'OMS',

      icon: <ShoppingCartOutlined />,

      children: [

        { key: `${prefix}/oms/orders`, label: <Link to={`${prefix}/oms/orders`} onClick={() => setMobileDrawerOpen(false)}>Orders</Link> },

        { key: `${prefix}/oms/parts-priority`, label: <Link to={`${prefix}/oms/parts-priority`} onClick={() => setMobileDrawerOpen(false)}>Parts Priority</Link> },

      ],

    },

    ...(prefix === '/admin'

      ? []

      : [{

          key: `${prefix}/pdm`,

          label: <Link to={`${prefix}/pdm`} onClick={() => setMobileDrawerOpen(false)}>PDM</Link>,

          icon: <DeploymentUnitOutlined />,

        }]

    ),

    {

      key: `${prefix}/rawmaterials`,

      label: <Link to={`${prefix}/rawmaterials`} onClick={() => setMobileDrawerOpen(false)}>Raw Materials</Link>,

      icon: <ExperimentOutlined />,

    },

    {

      key: `${prefix}/configuration`,

      label: <Link to={`${prefix}/configuration`} onClick={() => setMobileDrawerOpen(false)}>Configuration</Link>,

      icon: <SettingOutlined />,

    },

    {

      key: 'pps',

      label: 'PPS',

      icon: <AppstoreOutlined />,

      children: [

        // { key: `${prefix}/pps/process-planning`, label: <Link to={`${prefix}/pps/process-planning`}>Process Planning</Link> },

        { key: `${prefix}/pps/assets-availability`, label: <Link to={`${prefix}/pps/assets-availability`}>Assets Availability</Link> },

        { key: `${prefix}/pps/capacity-planning`, label: <Link to={`${prefix}/pps/capacity-planning`}>Capacity Planning</Link> },

        { key: `${prefix}/pps/machine-scheduling`, label: <Link to={`${prefix}/pps/machine-scheduling`}>Machine Scheduling</Link> },

      ],

    },

    {

      key: 'production monitoring',

      label: 'Production Monitoring',

      icon: <MonitorOutlined />,

      children: [

        { key: `${prefix}/product-monitoring/live-monitoring`, label: <Link to={`${prefix}/product-monitoring/live-monitoring`}>Live Monitoring</Link> },

        { key: `${prefix}/product-monitoring/oee-overview`, label: <Link to={`${prefix}/product-monitoring/oee-overview`}>OEE Overview</Link> },

        { key: `${prefix}/product-monitoring/planned-vs-actual`, label: <Link to={`${prefix}/product-monitoring/planned-vs-actual`}>Planned vs Actual</Link> },

        { key: `${prefix}/product-monitoring/order-tracking`, label: <Link to={`${prefix}/product-monitoring/order-tracking`}>Order Tracking</Link> },

      ],

    },

    {

      key: 'maintenance-management',

      label: 'Maintenance Management',

      icon: <ToolOutlined />,

      children: [

        { key: `${prefix}/maintenance-management/maintenance`, label: <Link to={`${prefix}/maintenance-management/maintenance`}>Maintenance</Link> },

        { key: `${prefix}/maintenance-management/preventive-maintenance`, label: <Link to={`${prefix}/maintenance-management/preventive-maintenance`}>Preventive Maintenance</Link> },

      ],

    },

    // {

    //   key: `${prefix}/quality-management`,

    //   label: <Link to={`${prefix}/quality-management`} onClick={() => setMobileDrawerOpen(false)}>Quality Management</Link>,

    //   icon: <SafetyCertificateOutlined />,

    // },

    {

      key: 'inventory-management',

      label: 'Inventory Management',

      icon: <DatabaseOutlined />,

      children: [

        { key: `${prefix}/inventory-management/inventory-master`, label: <Link to={`${prefix}/inventory-management/inventory-master`} onClick={() => setMobileDrawerOpen(false)}>Inventory Master</Link> },

        { key: `${prefix}/inventory-management/overview-data`, label: <Link to={`${prefix}/inventory-management/overview-data`} onClick={() => setMobileDrawerOpen(false)}>Overview Data</Link> },

      ],

    },

    {

      key: `${prefix}/document-management`,

      label: <Link to={`${prefix}/document-management`} onClick={() => setMobileDrawerOpen(false)}>Document Management</Link>,

      icon: <FileTextOutlined />,

    },

    {

      key: `${prefix}/notification`,

      label: <Link to={`${prefix}/notification`} onClick={() => setMobileDrawerOpen(false)}>Notification</Link>,

      icon: <BellOutlined />,

    },

    {

      key: `${prefix}/access_control`,

      label: <Link to={`${prefix}/access_control`} onClick={() => setMobileDrawerOpen(false)}>Access Control</Link>,

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

        label: <Link to={`${prefix}/dashboard`} onClick={() => setMobileDrawerOpen(false)}>Dashboard</Link>,

        icon: <DashboardOutlined />,

      },
      {

        key: `${prefix}/preventive-maintenance`,

        label: <Link to={`${prefix}/preventive-maintenance`} onClick={() => setMobileDrawerOpen(false)}>Preventive Maintenance</Link>,

        icon: <CarryOutOutlined />,

      },
      {

        key: `${prefix}/inspection-results`,

        label: <Link to={`${prefix}/inspection-results`} onClick={() => setMobileDrawerOpen(false)}>Inspection Results</Link>,

        icon: <SafetyCertificateOutlined />,

      },

      {

        key: `${prefix}/inventory-data`,

        label: <Link to={`${prefix}/inventory-data`} onClick={() => setMobileDrawerOpen(false)}>Inventory Data</Link>,

        icon: <DatabaseOutlined />,

      },

      {

        key: `${prefix}/documents`,

        label: <Link to={`${prefix}/documents`} onClick={() => setMobileDrawerOpen(false)}>Documents</Link>,

        icon: <FileTextOutlined />,

      },

      {

        key: `${prefix}/production-logs`,

        label: <Link to={`${prefix}/production-logs`} onClick={() => setMobileDrawerOpen(false)}>Production Logs</Link>,

        icon: <HistoryOutlined />,

      },

      

      {

        key: `${prefix}/leave-log`,

        label: <Link to={`${prefix}/leave-log`} onClick={() => setMobileDrawerOpen(false)}>Leave Log</Link>,

        icon: <CalendarOutlined />,

      },

      {

        key: `${prefix}/notifications`,

        label: (

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <Link to={`${prefix}/notifications`} onClick={() => setMobileDrawerOpen(false)}>

              <Badge count={notificationCount} offset={[10, 0]}>

                Notifications

              </Badge>

            </Link>

          </div>

        ),

        icon: <BellOutlined />,

      },

    ];

  } else if (prefix === '/project_coordinator') {

    items = [

      {

        key: `${prefix}/oms/orders`,

        label: <Link to={`${prefix}/oms/orders`} onClick={() => setMobileDrawerOpen(false)}>Orders</Link>,

        icon: <ShoppingCartOutlined />,

      },

      {

        key: `${prefix}/order-tracking`,

        label: <Link to={`${prefix}/order-tracking`} onClick={() => setMobileDrawerOpen(false)}>Order Tracking</Link>,

        icon: <SyncOutlined />,

      },

      {

        key: `${prefix}/pps/machine-scheduling`,

        label: <Link to={`${prefix}/pps/machine-scheduling`} onClick={() => setMobileDrawerOpen(false)}>Machine Scheduling</Link>,

        icon: <AppstoreOutlined />,

      },

      {

        key: `${prefix}/product-monitoring/planned-vs-actual`,

        label: <Link to={`${prefix}/product-monitoring/planned-vs-actual`} onClick={() => setMobileDrawerOpen(false)}>Planned vs Actual</Link>,

        icon: <MonitorOutlined />,

      },

      {

        key: `${prefix}/recycle-bin`,

        label: <Link to={`${prefix}/recycle-bin`} onClick={() => setMobileDrawerOpen(false)}>Recycle Bin</Link>,

        icon: <DeleteOutlined />,

      },

      {

        key: `${prefix}/notifications`,

        label: (

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

            <Link to={`${prefix}/notifications`} onClick={() => setMobileDrawerOpen(false)}>

              <Badge count={notificationCount} offset={[10, 0]}>

                Notifications

              </Badge>

            </Link>

          </div>

        ),

        icon: <BellOutlined />,

      },

    ];

  } else if (prefix === '/manufacturing_coordinator') {

    items = [

      {

        key: `${prefix}/dashboard`,

        label: <Link to={`${prefix}/dashboard`} onClick={() => setMobileDrawerOpen(false)}>Dashboard</Link>,

        icon: <DashboardOutlined />,

      },

      {

        key: 'oms',

        label: 'OMS',

        icon: <ShoppingCartOutlined />,

        children: [

          { key: `${prefix}/oms/orders`, label: <Link to={`${prefix}/oms/orders`} onClick={() => setMobileDrawerOpen(false)}>Orders</Link> },

          { key: `${prefix}/oms/parts-priority`, label: <Link to={`${prefix}/oms/parts-priority`} onClick={() => setMobileDrawerOpen(false)}>Parts Priority</Link> },

        ],

      },

      {

        key: `${prefix}/rawmaterials`,

        label: <Link to={`${prefix}/rawmaterials`} onClick={() => setMobileDrawerOpen(false)}>Raw Materials</Link>,

        icon: <ExperimentOutlined />,

      },

      {

        key: `${prefix}/configuration`,

        label: <Link to={`${prefix}/configuration`} onClick={() => setMobileDrawerOpen(false)}>Configuration</Link>,

        icon: <SettingOutlined />,

      },

      {

        key: 'pps',

        label: 'PPS',

        icon: <AppstoreOutlined />,

        children: [

          { key: `${prefix}/pps/assets-availability`, label: <Link to={`${prefix}/pps/assets-availability`} onClick={() => setMobileDrawerOpen(false)}>Assets Availability</Link> },

          { key: `${prefix}/pps/capacity-planning`, label: <Link to={`${prefix}/pps/capacity-planning`} onClick={() => setMobileDrawerOpen(false)}>Capacity Planning</Link> },

          { key: `${prefix}/pps/machine-scheduling`, label: <Link to={`${prefix}/pps/machine-scheduling`} onClick={() => setMobileDrawerOpen(false)}>Machine Scheduling</Link> },

        ],

      },

      {

        key: 'production monitoring',

        label: 'Production Monitoring',

        icon: <MonitorOutlined />,

        children: [

          { key: `${prefix}/product-monitoring/live-monitoring`, label: <Link to={`${prefix}/product-monitoring/live-monitoring`} onClick={() => setMobileDrawerOpen(false)}>Live Monitoring</Link> },

          { key: `${prefix}/product-monitoring/oee-overview`, label: <Link to={`${prefix}/product-monitoring/oee-overview`} onClick={() => setMobileDrawerOpen(false)}>OEE Overview</Link> },

          { key: `${prefix}/product-monitoring/planned-vs-actual`, label: <Link to={`${prefix}/product-monitoring/planned-vs-actual`} onClick={() => setMobileDrawerOpen(false)}>Planned vs Actual</Link> },

          { key: `${prefix}/product-monitoring/order-tracking`, label: <Link to={`${prefix}/product-monitoring/order-tracking`} onClick={() => setMobileDrawerOpen(false)}>Order Tracking</Link> },

        ],

      },

      {

        key: 'maintenance-management',

        label: 'Maintenance Management',

        icon: <ToolOutlined />,

        children: [

          { key: `${prefix}/maintenance-management/maintenance`, label: <Link to={`${prefix}/maintenance-management/maintenance`} onClick={() => setMobileDrawerOpen(false)}>Maintenance</Link> },

          { key: `${prefix}/maintenance-management/preventive-maintenance`, label: <Link to={`${prefix}/maintenance-management/preventive-maintenance`} onClick={() => setMobileDrawerOpen(false)}>Preventive Maintenance</Link> },

        ],

      },

      {

        key: 'inventory-management',

        label: 'Inventory Management',

        icon: <DatabaseOutlined />,

        children: [

          { key: `${prefix}/inventory-management/inventory-master`, label: <Link to={`${prefix}/inventory-management/inventory-master`} onClick={() => setMobileDrawerOpen(false)}>Inventory Master</Link> },

          { key: `${prefix}/inventory-management/overview-data`, label: <Link to={`${prefix}/inventory-management/overview-data`} onClick={() => setMobileDrawerOpen(false)}>Overview Data</Link> },

        ],

      },

      {

        key: `${prefix}/document-management`,

        label: <Link to={`${prefix}/document-management`} onClick={() => setMobileDrawerOpen(false)}>Document Management</Link>,

        icon: <FileTextOutlined />,

      },

      {

        key: `${prefix}/notification`,

        label: <Link to={`${prefix}/notification`} onClick={() => setMobileDrawerOpen(false)}>Notification</Link>,

        icon: <BellOutlined />,

      },

      {

        key: `${prefix}/access_control`,

        label: <Link to={`${prefix}/access_control`} onClick={() => setMobileDrawerOpen(false)}>Access Control</Link>,

        icon: <LockOutlined />,

      },

    ];

  } else if (prefix === '/supervisor') {

    items = [

      {

        key: `${prefix}/production_logs`,

        label: <Link to={`${prefix}/production_logs`} onClick={() => setMobileDrawerOpen(false)}>Production logs</Link>,

        icon: <FileTextOutlined />,

      },
      {
        key: `${prefix}/create-inspection-plan`,

        label: <Link to={`${prefix}/create-inspection-plan`} onClick={() => setMobileDrawerOpen(false)}>Create Inspection Plan</Link>,

        icon: <BuildOutlined />,

      },
      {

        key: `${prefix}/pps/assets-availability`,

        label: <Link to={`${prefix}/pps/assets-availability`} onClick={() => setMobileDrawerOpen(false)}>Assets Availability</Link>,

        icon: <AppstoreOutlined />,

      },
      {

        key: `${prefix}/product-monitoring/pokayoke-checklists`,

        label: <Link to={`${prefix}/product-monitoring/pokayoke-checklists`} onClick={() => setMobileDrawerOpen(false)}>Preventive Maintenance</Link>,

        icon: <CarryOutOutlined  />,

      },
      {
        key: `${prefix}/pokayoke-operation-checklists`,

        label: <Link to={`${prefix}/pokayoke-operation-checklists`} onClick={() => setMobileDrawerOpen(false)}>PokaYoke Checklist</Link>,

        icon: <SafetyCertificateOutlined />,
      },
      {
        key: `${prefix}/notifications`,

        label: (

          <Link to={`${prefix}/notifications`} onClick={() => setMobileDrawerOpen(false)}>

            <Badge count={notificationCount} offset={[10, 0]}>

              Notifications

            </Badge>

          </Link>

        ),

        icon: <BellOutlined />,

      },

    ];

  } else if (prefix === '/inventory_supervisor') {

    items = [

      {

        key: 'inventory-management',

        label: 'Inventory Management',

        icon: <DatabaseOutlined />,

        children: [

          { key: `${prefix}/inventory-management/inventory-master`, label: <Link to={`${prefix}/inventory-management/inventory-master`} onClick={() => setMobileDrawerOpen(false)}>Inventory Master</Link> },

          { key: `${prefix}/inventory-management/overview-data`, label: <Link to={`${prefix}/inventory-management/overview-data`} onClick={() => setMobileDrawerOpen(false)}>Overview Data</Link> },

        ],

      },

    ];

  } else {

    items = [allItems[0]];

  }



  const MenuContent = () => (

    <>

      <div className="p-3 sm:p-4 flex justify-center items-center border-b border-gray-100 mb-2">

        <img src={cmtisLogo} alt="CMTIS Logo" style={{ height: isMobile ? 32 : 40 }} />

      </div>

      <Menu

        mode="inline"

        defaultSelectedKeys={[selectedKey]}

        openKeys={openKeys}

        onOpenChange={setOpenKeys}

        selectedKeys={[selectedKey]}

        style={{ borderRight: 0 }}

        items={items}

      />

    </>

  );



  // Mobile Drawer

  if (isMobile) {

    return (

      <>

        <Button

          type="text"

          icon={<MenuOutlined />}

          onClick={() => setMobileDrawerOpen(true)}

          style={{

            position: 'fixed',

            top: 16,

            left: 16,

            zIndex: 1001,

            fontSize: 20,

            width: 40,

            height: 40,

            display: 'flex',

            alignItems: 'center',

            justifyContent: 'center',

            backgroundColor: 'white',

            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',

            borderRadius: 8

          }}

        />

        <Drawer

          placement="left"

          onClose={() => setMobileDrawerOpen(false)}

          open={mobileDrawerOpen}

          closable={false}

          styles={{ 

            body: { padding: 0 },

            wrapper: { width: 280 }

          }}

          style={{ zIndex: 1000 }}

        >

          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>

            <Button

              type="text"

              icon={<CloseOutlined />}

              onClick={() => setMobileDrawerOpen(false)}

              size="large"

            />

          </div>

          <MenuContent />

        </Drawer>

      </>

    );

  }



  // Desktop Sidebar

  return (

    <Sider 

      width={224}

      collapsedWidth={80}

      collapsed={collapsed}

      onCollapse={onCollapse}

      collapsible

      theme="light" 

      style={{ 

        overflow: 'auto', 

        height: '100vh', 

        position: 'fixed', 

        left: 0, 

        top: 0, 

        bottom: 0, 

        borderRight: '1px solid #f0f0f0',

        zIndex: 100,

        transition: 'all 0.2s'

      }}

    >

      <MenuContent />

    </Sider>

  );

};

export default Sidebar;