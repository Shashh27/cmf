import React, { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";

const MachineScheduling = lazy(() => import("./PPS Components/MachineScheduling"));

const PPS = () => {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div style={{ padding: '24px', background: "#f5f5f5", minHeight: "100vh" }}>
      <Suspense fallback={<div style={{ padding: 24, color: "#595959" }}>Loading schedule…</div>}>
        <MachineScheduling />
      </Suspense>
    </div>
  );
};

export default PPS;