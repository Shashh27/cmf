import React from "react";



import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";



import Layout from "./components/Layout";



import Login from "./Pages/Login";

import ChatPanel from "./chatbot/Chatbot";



import OMS from "./Pages/OMS";



import AdminPartsPriority from "./OMS Components/PartsPriority";



import ManufacturingCoordinatorPartsPriority from "./ManufacturingCoordinator Components/OMS Components/PartsPriority";



import RawMaterials from "./Pages/RawMaterials";



import PDM from "./Pages/PDM";



import Configuration from "./Pages/Configuration";



import Dashboard from "./Pages/Dashboard";



import ShopFloorDashboard from "./Pages/ShopFloorDashboard";



import ProjectCoordinatorDashboard from "./Pages/ProjectCoordinatorDashboard";

import ProjectCoordinatorProductView from "./ProjectCoordinator Components/ProjectCoordinatorProductView";

import OrderTrackingSidebar from "./ProjectCoordinator Components/OrderTrackingSidebar";

import Recyclebin from "./ProjectCoordinator Components/Recyclebin";

import PCNotifications from "./ProjectCoordinator Components/PCNotifications";

import AdminRecyclebin from "./Pages/Recyclebin";

import PPS from "./Pages/PPS";

import ProductionMonitoring from "./Pages/ProductionMonitoring";



import OperatorDashboard from "./Pages/OperatorDashboard";



import MaintenanceManagement from "./Pages/MaintenanceManagement";

import { EnergyMonitoring, Reportnew } from "./Pages/EMS";

import QualityManagement from "./Quality Management Components/QualityManagement";



import InventoryMaster from "./Pages/Inventory";



import OverviewData from "./Pages/OverviewData";



import DocumentManagement from "./Pages/Document";



import Notification from "./Pages/Notification";



import AccessControl from "./Pages/AccessControl";



import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";



import ManufacturingCoordinator from "./Pages/ManufacturingCoordinator";



import MCSShopFloorDashboard from "./ManufacturingCoordinator Components/ShopFloorDashboard";
import { EnergyMonitoring as MCEnergyMonitoring } from "./ManufacturingCoordinator Components/EMS";



import SupervisorDashboard from "./Pages/SupervisorDashboard";

import CreateInspectionPlan from "./Supervisor Components/CreateInspectionPlan";

import SupervisorNotifications from "./Supervisor Components/Notifications";



import QMSInspector from "./Quality Management Components/QMSInspector";







/** Floating chatbot only after login — hidden on /login and when not authenticated. */
/** Only shown for Admin and Manufacturing Coordinator roles. */
function isChatbotAllowedRole(user) {
  const role = String(user?.role || user?.user_role || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .trim();
  if (!role) return false;
  if (role === 'admin') return true;
  if (role === 'mc' || role.includes('manufacturing coordinator')) return true;
  return false;
}

function AuthenticatedChatPanel() {
  const location = useLocation();
  const { isAuthenticated, user, bootstrapping } = useAuth();
  if (bootstrapping || !isAuthenticated || location.pathname === '/login') {
    return null;
  }
  if (!isChatbotAllowedRole(user)) {
    return null;
  }
  return <ChatPanel />;
}



function App() {



  return (
    <AuthProvider>
    <Router>



      <Layout>



        <Routes>



          <Route path="/login" element={<Login />} />



          <Route path="/" element={<Navigate to="/login" replace />} />



          



          <Route element={<ProtectedRoute><Outlet /></ProtectedRoute>}>



          {/* Admin Routes */}



          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />



          <Route path="/admin/dashboard" element={<Dashboard />} />



          <Route path="/admin/shop-floor" element={<ShopFloorDashboard />} />







          <Route path="/admin/oms" element={<Navigate to="/admin/oms/orders" replace />} />



          <Route path="/admin/oms/orders" element={<OMS />} />



          <Route path="/admin/oms/parts-priority" element={<AdminPartsPriority />} />



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



          <Route path="/admin/product-monitoring/oee-overview" element={<ProductionMonitoring />} />



          <Route path="/admin/product-monitoring/planned-vs-actual" element={<ProductionMonitoring />} />



          <Route path="/admin/product-monitoring/order-tracking" element={<ProductionMonitoring />} />



          <Route path="/admin/maintenance-management" element={<Navigate to="/admin/maintenance-management/maintenance" replace />} />

          <Route path="/admin/maintenance-management/maintenance" element={<MaintenanceManagement />} />

          <Route path="/admin/maintenance-management/preventive-maintenance" element={<MaintenanceManagement />} />

          <Route path="/admin/energy-monitoring" element={<EnergyMonitoring />} />



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



          <Route path="/project_coordinator/pps/*" element={<ProjectCoordinatorProductView />} />



          <Route path="/project_coordinator/product-monitoring/*" element={<ProjectCoordinatorProductView />} />



          <Route path="/project_coordinator/order-tracking" element={<OrderTrackingSidebar />} />



          <Route path="/project_coordinator/recycle-bin" element={<Recyclebin />} />



          <Route path="/project_coordinator/notifications" element={<PCNotifications />} />

          <Route path="/project_coordinator/configuration" element={<ProjectCoordinatorDashboard />} />



         



          {/* Manufacturing Coordinator */}



          <Route path="/manufacturing_coordinator" element={<Navigate to="/manufacturing_coordinator/dashboard" replace />} />
          <Route path="/manufacturing_coordinator/dashboard" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/shop-floor" element={<MCSShopFloorDashboard />} />
          <Route path="/manufacturing_coordinator/energy-monitoring" element={<MCEnergyMonitoring />} />
          <Route path="/manufacturing_coordinator/oms" element={<Navigate to="/manufacturing_coordinator/oms/orders" replace />} />
          <Route path="/manufacturing_coordinator/oms/orders" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/oms/parts-priority" element={<ManufacturingCoordinatorPartsPriority />} />
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
          <Route path="/manufacturing_coordinator/product-monitoring/oee-overview" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/planned-vs-actual" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/order-tracking" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/product-monitoring/production-log" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/production-log" element={<Navigate to="/manufacturing_coordinator/product-monitoring/production-log" replace />} />
          <Route path="/manufacturing_coordinator/shop-floor" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/maintenance-management" element={<Navigate to="/manufacturing_coordinator/maintenance-management/maintenance" replace />} />
          <Route path="/manufacturing_coordinator/maintenance-management/maintenance" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/maintenance-management/preventive-maintenance" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/inventory-management" element={<Navigate to="/manufacturing_coordinator/inventory-management/inventory-master" replace />} />
          <Route path="/manufacturing_coordinator/inventory-management/inventory-master" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/inventory-management/overview-data" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/document-management" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/notification" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/access_control" element={<ManufacturingCoordinator />} />
          <Route path="/manufacturing_coordinator/configuration" element={<Configuration />} />



          {/* Supervisor */}



          <Route path="/supervisor" element={<Navigate to="/supervisor/production_logs" replace />} />



          <Route path="/supervisor/production_logs" element={<SupervisorDashboard />} />

          <Route path="/supervisor/notifications" element={<SupervisorNotifications />} />

          <Route path="/supervisor/assets-availability" element={<SupervisorDashboard />} />

          <Route path="/supervisor/preventive-maintenance" element={<SupervisorDashboard />} />

          <Route path="/supervisor/pokayoke-checklists" element={<SupervisorDashboard />} />

          <Route path="/supervisor/create-inspection-plan" element={<CreateInspectionPlan />} />

          <Route path="/supervisor/quality-management" element={<QualityManagement />} />
          <Route path="/supervisor/notification" element={<Notification />} />
          
          {/* Inventory Supervisor */}



          <Route path="/inventory_supervisor" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />



          <Route path="/inventory_supervisor/dashboard" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />



          <Route path="/inventory_supervisor/inventory-management" element={<Navigate to="/inventory_supervisor/inventory-management/inventory-master" replace />} />



          <Route path="/inventory_supervisor/inventory-management/inventory-master" element={<InventoryMaster />} />



          <Route path="/inventory_supervisor/inventory-management/overview-data" element={<OverviewData />} />



          



          {/* Operator Routes */}



          <Route path="/operator" element={<Navigate to="/operator/dashboard" replace />} />



          <Route path="/operator/dashboard" element={<OperatorDashboard />} />

          {/* <Route path="/operator/qms-inspector" element={<QMSInspector />} /> */}

          <Route path="/operator/inspection-results" element={<OperatorDashboard />} />



          <Route path="/operator/inventory-data" element={<OperatorDashboard />} />

          <Route path="/operator/inspection-results" element={<OperatorDashboard />} />

          <Route path="/operator/documents" element={<OperatorDashboard />} />

          <Route path="/operator/production-logs" element={<OperatorDashboard />} />

          <Route path="/operator/notifications" element={<OperatorDashboard />} />

          <Route path="/operator/leave-log" element={<OperatorDashboard />} />

          <Route path="/operator/preventive-maintenance" element={<OperatorDashboard />} />

          <Route path="/admin/qms-inspector" element={<QMSInspector />} />
          <Route path="/supervisor/qms-inspector" element={<QMSInspector />} />
          <Route path="/operator/qms-inspector" element={<QMSInspector />} />

          </Route>







        </Routes>



      </Layout>

      {/* Chat Panel - only after login */}
      <AuthenticatedChatPanel />

    </Router>
    </AuthProvider>



  );



}







export default App;



