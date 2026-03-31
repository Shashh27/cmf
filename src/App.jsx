import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./Pages/Login";
import OMS from "./Pages/OMS";
import PartsPriority from "./OMS Components/PartsPriority";
import RawMaterials from "./Pages/RawMaterials";
import PDM from "./Pages/PDM";
import Configuration from "./Pages/Configuration";
import Dashboard from "./Pages/Dashboard";
import ProjectCoordinatorDashboard from "./Pages/ProjectCoordinatorDashboard";
import OperatorDashboard from "./Pages/OperatorDashboard";
import PPS from "./Pages/PPS";
import ProductionMonitoring from "./Pages/ProductionMonitoring";
import QualityManagement from "./Quality Management Components/QualityManagement";
import InventoryMaster from "./Pages/Inventory";
import OverviewData from "./Pages/OverviewData";
import DocumentManagement from "./Pages/Document";
import Notification from "./Pages/Notification";
import AccessControl from "./Pages/AccessControl";
import ProtectedRoute from "./components/ProtectedRoute";
import ManufacturingCoordinator from "./Pages/ManufacturingCoordinator";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>
          {/* Admin Routes */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/dashboard" element={<Dashboard />} />

          <Route path="/admin/oms" element={<Navigate to="/admin/oms/orders" replace />} />
          <Route path="/admin/oms/orders" element={<OMS />} />
          <Route path="/admin/oms/parts-priority" element={<PartsPriority />} />
          <Route path="/admin/oms/pdm" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/oms/product/:productId" element={<OMS />} />

          <Route path="/admin/pdm" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="/admin/pdm/:productId" element={<PDM />} />

          <Route path="/admin/rawmaterials" element={<RawMaterials />} />

          <Route path="/admin/pps" element={<Navigate to="/admin/pps/assets-availability" replace />} />
          <Route path="/admin/pps/assets-availability" element={<PPS />} />
          <Route path="/admin/pps/capacity-planning" element={<PPS />} />
          <Route path="/admin/pps/machine-scheduling" element={<PPS />} />
          <Route path="/admin/pps/process-planning" element={<PPS />} />

          <Route path="/admin/configuration" element={<Configuration />} />

          <Route path="/admin/product-monitoring" element={<Navigate to="/admin/product-monitoring/live-monitoring" replace />} />
          <Route path="/admin/product-monitoring/live-monitoring" element={<ProductionMonitoring />} />
          <Route path="/admin/product-monitoring/planned-vs-actual" element={<ProductionMonitoring />} />
          <Route path="/admin/product-monitoring/order-tracking" element={<ProductionMonitoring />} />
          <Route path="/admin/product-monitoring/maintenance" element={<ProductionMonitoring />} />
          <Route path="/admin/product-monitoring/pokayoke-checklists" element={<ProductionMonitoring />} />

          <Route path="/admin/quality-management" element={<QualityManagement />} />

          <Route path="/admin/inventory-management" element={<Navigate to="/admin/inventory-management/inventory-master" replace />} />
          <Route path="/admin/inventory-management/inventory-master" element={<InventoryMaster />} />
          <Route path="/admin/inventory-management/overview-data" element={<OverviewData />} />

          <Route path="/admin/document-management" element={<DocumentManagement />} />
          
          <Route path="/admin/notification" element={<Notification />} />
          
          <Route path="/admin/access_control" element={<AccessControl />} />

          {/* Project Coordinator Routes */}
          <Route path="/project_coordinator" element={<Navigate to="/project_coordinator/oms/orders" replace />} />
          <Route path="/project_coordinator/dashboard" element={<ProjectCoordinatorDashboard />} />
          <Route path="/project_coordinator/oms" element={<Navigate to="/project_coordinator/oms/orders" replace />} />
          <Route path="/project_coordinator/oms/orders" element={<ProjectCoordinatorDashboard />} />
          <Route path="/project_coordinator/oms/product/:productId" element={<ProjectCoordinatorDashboard />} />
          <Route path="/project_coordinator/pdm" element={<Navigate to="/project_coordinator/oms/orders" replace />} />
         
          {/* Manufacturing Coordinator */}
          <Route path="/manufacturing_coordinator" element={<Navigate to="/manufacturing_coordinator/dashboard" replace />} />
          <Route path="/manufacturing_coordinator/dashboard" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/oms" element={<Navigate to="/manufacturing_coordinator/oms/orders" replace />} />
          <Route path="/manufacturing_coordinator/oms/orders" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/oms/parts-priority" element={<Navigate to="/manufacturing_coordinator/dashboard" replace />} />
          <Route path="/manufacturing_coordinator/oms/pdm" element={<Navigate to="/manufacturing_coordinator/dashboard" replace />} />
          <Route path="/manufacturing_coordinator/rawmaterials" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/oms/product/:productId" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/pdm" element={<Navigate to="/manufacturing_coordinator/dashboard" replace />} />
          <Route path="/manufacturing_coordinator/pdm/:productId" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/pps" element={<Navigate to="/manufacturing_coordinator/pps/assets-availability" replace />} />
          <Route path="/manufacturing_coordinator/pps/assets-availability" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/pps/capacity-planning" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/pps/machine-scheduling" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/pps/process-planning" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring" element={<Navigate to="/manufacturing_coordinator/product-monitoring/live-monitoring" replace />} />
          <Route path="/manufacturing_coordinator/product-monitoring/live-monitoring" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/planned-vs-actual" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/order-tracking" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/maintenance" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/pokayoke-checklists" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/inventory-management" element={<Navigate to="/manufacturing_coordinator/inventory-management/inventory-master" replace />} />
          <Route path="/manufacturing_coordinator/inventory-management/inventory-master" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/inventory-management/overview-data" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/document-management" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/notification" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/access_control" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/configuration" element={<Configuration />} />
          
          {/* Supervisor */}
          <Route path="/supervisor" element={<Navigate to="/login" replace />} />
          
          {/* Inventory Supervisor */}
          <Route path="/inventory_supervisor" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />
          <Route path="/inventory_supervisor/dashboard" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />
          <Route path="/inventory_supervisor/inventory-management" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />
          <Route path="/inventory_supervisor/inventory-management/inventory-master" element={<InventoryMaster />} />
          <Route path="/inventory_supervisor/inventory-management/overview-data" element={<OverviewData />} />
          
          {/* Operator Routes */}
          <Route path="/operator" element={<Navigate to="/operator/dashboard" replace />} />
          <Route path="/operator/dashboard" element={<OperatorDashboard />} />
          <Route path="/operator/inspection-results" element={<OperatorDashboard />} />
          <Route path="/operator/inventory-data" element={<OperatorDashboard />} />
          <Route path="/operator/documents" element={<OperatorDashboard />} />
          </Route>

        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
