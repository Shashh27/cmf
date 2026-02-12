import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import OMS from "./Pages/OMS";
import RawMaterials from "./OMS Components/RawMaterials";
import PDM from "./Pages/PDM";
// PPS is now a category, we might use the existing PPS page as a dashboard or redirect
// import PPS from "./Pages/PPS"; 
import Configuration from "./Pages/Configuration";
import Placeholder from "./components/Placeholder";
import Dashboard from "./Pages/Dashboard";
import Inventory from "./Pages/Inventory";
import OverviewData from "./Pages/OverviewData";
import Document from "./Pages/Document";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          <Route path="/dashboard" element={<Dashboard />} />

          <Route path="/oms" element={<Navigate to="/oms/orders" replace />} />
          <Route path="/oms/orders" element={<OMS />} />
          <Route path="/oms/product/:productId" element={<OMS />} />
          <Route path="/oms/rawmaterials" element={<RawMaterials />} />

          <Route path="/pdm" element={<PDM />} />

          <Route path="/pps" element={<Navigate to="/pps/assets-availability" replace />} />
          <Route path="/pps/assets-availability" element={<Placeholder title="Assets Availability" />} />
          <Route path="/pps/capacity-planning" element={<Placeholder title="Capacity Planning" />} />
          <Route path="/pps/machine-scheduling" element={<Placeholder title="Machine Scheduling" />} />

          <Route path="/configuration" element={<Configuration />} />

          <Route path="/product-monitoring" element={<Navigate to="/product-monitoring/live-monitoring" replace />} />
          <Route path="/product-monitoring/live-monitoring" element={<Placeholder title="Live Monitoring" />} />
          <Route path="/product-monitoring/planned-vs-actual" element={<Placeholder title="Planned vs Actual" />} />
          <Route path="/product-monitoring/order-tracking" element={<Placeholder title="Order Tracking" />} />
          <Route path="/product-monitoring/maintenance" element={<Placeholder title="Maintenance" />} />

          <Route path="/quality-management" element={<Placeholder title="Quality Management" />} />

          <Route path="/inventory-management" element={<Navigate to="/inventory-management/inventory-master" replace />} />
          <Route path="/inventory-management/inventory-master" element={<Inventory />} />
          <Route path="/inventory-management/overview-data" element={<OverviewData />} />

          <Route path="/document-management" element={<Document />} />
          
          <Route path="/notification" element={<Placeholder title="Notification" />} />
          
          <Route path="/access-control" element={<Placeholder title="Access Control" />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
