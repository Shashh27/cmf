import React, { useState } from "react";
import { Layout } from "antd";
import { useLocation } from "react-router-dom";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";

const { Content } = Layout;

const AppLayout = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const [collapsed, setCollapsed] = useState(false);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout 
        style={{ 
          marginLeft: collapsed ? 80 : 224,
          minHeight: '100vh',
          transition: 'all 0.2s'
        }}
        className="responsive-layout"
      >
        <style>{`
          @media (max-width: 768px) {
            .responsive-layout {
              margin-left: 0 !important;
            }
          }
        `}</style>
        <Navbar />
        <Content 
          style={{ 
            margin: 'clamp(60px, 15vw, 80px) clamp(12px, 3vw, 24px) clamp(12px, 3vw, 24px)', 
            overflowY: 'auto', 
            backgroundColor: 'transparent', 
            padding: 0 
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
