import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import OMS from "./Pages/OMS";
import RawMaterials from "./Pages/RawMaterials";
import PDM from "./Pages/PDM";
import PPS from "./Pages/PPS";
import Configuration from "./Pages/Configuration";

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/oms/oms" replace />} />
          <Route path="/oms" element={<Navigate to="/oms/oms" replace />} />
          <Route path="/oms/oms" element={<OMS />} />
          <Route path="/oms/product/:productId" element={<OMS />} />
          <Route path="/oms/rawmaterials" element={<RawMaterials />} />
          <Route path="/pdm" element={<PDM />} />
          <Route path="/pps" element={<PPS />} />
          <Route path="/configuration" element={<Configuration />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
