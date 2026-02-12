import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./Pages/Login";
import OMS from "./Pages/OMS";
import RawMaterials from "./OMS Components/RawMaterials";
import PDM from "./Pages/PDM";
import Configuration from "./Pages/Configuration";
import Dashboard from "./Pages/Dashboard";
import ProjectCoordinatorDashboard from "./Pages/ProjectCoordinatorDashboard";
import OperatorDashboard from "./Pages/OperatorDashboard";
import AssetsAvailability from "./PPS Components/AssetsAvailability";
import CapacityPlanning from "./PPS Components/CapacityPlanning";
import MachineScheduling from "./PPS Components/MachineScheduling";
import LiveMonitoring from "./Product Monitoring Components/LiveMonitoring";
import PlannedVsActual from "./Product Monitoring Components/PlannedVsActual";
import OrderTracking from "./Product Monitoring Components/OrderTracking";
import Maintenance from "./Product Monitoring Components/Maintenance";
import QualityManagement from "./Quality Management Components/QualityManagement";
import InventoryMaster from "./Pages/Inventory";
import OverviewData from "./Pages/OverviewData";
import DocumentManagement from "./Pages/Document";
import Notification from "./Notification Components/Notification";
import AccessControl from "./Pages/AccessControl";
import ProtectedRoute from "./components/ProtectedRoute";

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
          <Route path="/admin/oms/product/:productId" element={<OMS />} />
          <Route path="/admin/oms/rawmaterials" element={<RawMaterials />} />

          <Route path="/admin/pdm" element={<PDM />} />

          <Route path="/admin/pps" element={<Navigate to="/admin/pps/assets-availability" replace />} />
          <Route path="/admin/pps/assets-availability" element={<AssetsAvailability />} />
          <Route path="/admin/pps/capacity-planning" element={<CapacityPlanning />} />
          <Route path="/admin/pps/machine-scheduling" element={<MachineScheduling />} />

          <Route path="/admin/configuration" element={<Configuration />} />

          <Route path="/admin/product-monitoring" element={<Navigate to="/admin/product-monitoring/live-monitoring" replace />} />
          <Route path="/admin/product-monitoring/live-monitoring" element={<LiveMonitoring />} />
          <Route path="/admin/product-monitoring/planned-vs-actual" element={<PlannedVsActual />} />
          <Route path="/admin/product-monitoring/order-tracking" element={<OrderTracking />} />
          <Route path="/admin/product-monitoring/maintenance" element={<Maintenance />} />

          <Route path="/admin/quality-management" element={<QualityManagement />} />

          <Route path="/admin/inventory-management" element={<Navigate to="/admin/inventory-management/inventory-master" replace />} />
          <Route path="/admin/inventory-management/inventory-master" element={<InventoryMaster />} />
          <Route path="/admin/inventory-management/overview-data" element={<OverviewData />} />

          <Route path="/admin/document-management" element={<DocumentManagement />} />
          
          <Route path="/admin/notification" element={<Notification />} />
          
          <Route path="/admin/access_control" element={<AccessControl />} />

          {/* Project Coordinator Routes */}
          <Route path="/project_coordinator" element={<Navigate to="/project_coordinator/dashboard" replace />} />
          <Route path="/project_coordinator/dashboard" element={<ProjectCoordinatorDashboard />} />

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
