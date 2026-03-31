import React from "react";
import { useLocation } from "react-router-dom";
import AssetsAvailability from "../PPS Components/AssetsAvailability";
import CapacityPlanning from "../PPS Components/CapacityPlanning";
import MachineScheduling from "../PPS Components/MachineScheduling";
import ProcessPlanning from "../PPS Components/ProcessPlanning";

const PPS = () => {
  const location = useLocation();
  const path = location.pathname;

  const renderContent = () => {
    if (path.includes("/pps/assets-availability")) return <AssetsAvailability />;
    if (path.includes("/pps/capacity-planning")) return <CapacityPlanning />;
    if (path.includes("/pps/machine-scheduling")) return <MachineScheduling />;
    if (path.includes("/pps/process-planning")) return <ProcessPlanning />;
    return <AssetsAvailability />;
  };

  const titleText = path.includes("/pps/assets-availability")
    ? "Assets Availability"
    : path.includes("/pps/capacity-planning")
    ? "Capacity Planning"
    : path.includes("/pps/machine-scheduling")
    ? "Machine Scheduling"
    : path.includes("/pps/process-planning")
    ? "Process Planning"
    : "Production Planning System";

  return (
    <div style={{ padding: '24px', background: "#f5f5f5", minHeight: "100vh" }}>
      {!path.includes("/pps/process-planning") && !path.includes("/pps/machine-scheduling") && !path.includes("/pps/assets-availability") && (
        <div style={{ marginBottom: "16px" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700 }}>{titleText}</h1>
        </div>
      )}
      {renderContent()}
    </div>
  );
};

export default PPS;
