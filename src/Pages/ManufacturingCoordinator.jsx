import React from "react";
import { useLocation } from "react-router-dom";
import Dashboard from "../ManufacturingCoordinator Components/Dashboard";
import MCOMS from "../ManufacturingCoordinator Components/OMS";
import MCPDM from "../ManufacturingCoordinator Components/PDM";
import MCPPS from "../ManufacturingCoordinator Components/PPS";
import MCProductionMonitoring from "../ManufacturingCoordinator Components/ProductionMonitoring";
import ProductionMonitoring from "../Pages/ProductionMonitoring";
import MCMaintenanceManagement from "../ManufacturingCoordinator Components/MaintenanceManagement";
import MCInventory from "../ManufacturingCoordinator Components/Inventory";
import MCOverviewData from "../ManufacturingCoordinator Components/OverviewData";
import MCRawMaterials from "../ManufacturingCoordinator Components/RawMaterials";
import MCShopFloorDashboard from "../ManufacturingCoordinator Components/ShopFloorDashboard";

import MCDocument from "../ManufacturingCoordinator Components/Document";
import MCNotification from "../ManufacturingCoordinator Components/Notification";
import MCAccessControl from "../ManufacturingCoordinator Components/AccessControl";

const ManufacturingCoordinator = () => {
  const location = useLocation();
  const path = location.pathname || "";

  if (path.startsWith("/manufacturing_coordinator/oms/rawmaterials")) {
    return <MCRawMaterials />;
  }
  if (path.startsWith("/manufacturing_coordinator/rawmaterials")) {
    return <MCRawMaterials />;
  }
  if (path.startsWith("/manufacturing_coordinator/oms")) {
    return <MCOMS />;
  }
  if (path.startsWith("/manufacturing_coordinator/pdm")) {
    return <MCPDM />;
  }
  if (path.startsWith("/manufacturing_coordinator/pps")) {
    return <MCPPS />;
  }
  if (path.startsWith("/manufacturing_coordinator/product-monitoring")) {
    return <MCProductionMonitoring />;
  }
  if (path.startsWith("/manufacturing_coordinator/shop-floor")) {
    return <MCShopFloorDashboard />;
  }
  if (path.startsWith("/manufacturing_coordinator/maintenance-management")) {
    return <MCMaintenanceManagement />;
  }
  if (path.startsWith("/manufacturing_coordinator/inventory-management/overview-data")) {
    return <MCOverviewData />;
  }
  if (path.startsWith("/manufacturing_coordinator/inventory-management")) {
    return <MCInventory />;
  }
  if (path.startsWith("/manufacturing_coordinator/document-management")) {
    return <MCDocument />;
  }
  if (path.startsWith("/manufacturing_coordinator/notification")) {
    return <MCNotification />;
  }
  if (path.startsWith("/manufacturing_coordinator/access_control")) {
    return <MCAccessControl />;
  }

  // Default: dashboard
  return <Dashboard />;
};

export default ManufacturingCoordinator;
