import React from "react";
import { useLocation } from "react-router-dom";
import MachineScheduling from "./PPS Components/MachineScheduling";

const PPS = () => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div style={{ padding: '24px', background: "#f5f5f5", minHeight: "100vh" }}>
      <MachineScheduling />
    </div>
  );
};

export default PPS;