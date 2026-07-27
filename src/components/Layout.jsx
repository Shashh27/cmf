import React, { useState, useEffect } from "react";
import { Layout } from "antd";
import { useLocation } from "react-router-dom";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";
import Footer from "./ui/Footer";

const { Content } = Layout;

const APP_SIDER_EXPANDED = 224;
const APP_SIDER_COLLAPSED = 80;

const AppLayout = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const isQmsInspector = location.pathname.includes("/qms-inspector");
  const isPdmPage = location.pathname.includes("/pdm/");
  const isDashboardPage = location.pathname === "/admin/dashboard";
  const isManufacturingDashboard = location.pathname === "/manufacturing_coordinator/dashboard";
  const isPcProductView =
    location.pathname.includes("/project_coordinator/oms/") &&
    (location.pathname.includes("/product/") || location.search.includes("productId"));
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // Auto-collapse app sidebar on tablet so PDM / content has room
      if (window.innerWidth < 1200 && window.innerWidth >= 768) {
        setCollapsed(true);
      }
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (isLoginPage || isQmsInspector) {
    return <>{children}</>;
  }

  const fullBleed =
    isPdmPage || isDashboardPage || isManufacturingDashboard || isPcProductView;
  const contentMarginLeft = isMobile ? 0 : collapsed ? APP_SIDER_COLLAPSED : APP_SIDER_EXPANDED;

  return (
    <Layout hasSider style={{ height: "100vh", width: "100%", overflow: "hidden" }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout
        style={{
          marginLeft: contentMarginLeft,
          height: "100vh",
          width: `calc(100% - ${contentMarginLeft}px)`,
          maxWidth: `calc(100% - ${contentMarginLeft}px)`,
          overflow: "hidden",
          transition: "margin-left 0.2s, width 0.2s",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
        className="responsive-layout"
      >
        <style>{`
          @media (max-width: 768px) {
            .responsive-layout {
              margin-left: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
          }
          .responsive-layout .ant-layout-content {
            min-width: 0;
          }
        `}</style>
        {!fullBleed && <Navbar collapsed={collapsed} />}
        <Content
          style={{
            margin: fullBleed
              ? 0
              : "clamp(50px, 10vw, 60px) clamp(12px, 3vw, 24px) clamp(30px, 5vw, 40px)",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            width: "100%",
            height: fullBleed ? "100%" : "auto",
            overflowY: fullBleed ? "hidden" : "auto",
            overflowX: "hidden",
            backgroundColor: "transparent",
            padding: 0,
            display: fullBleed ? "flex" : "block",
            flexDirection: "column",
          }}
        >
          {children}
        </Content>
        {!fullBleed && <Footer collapsed={collapsed} />}
      </Layout>
    </Layout>
  );
};

export default AppLayout;
