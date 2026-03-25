import React, { useState } from "react";
import { Layout } from "antd";
import { useLocation } from "react-router-dom";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";
import Footer from "./ui/Footer";

const { Content } = Layout;

const AppLayout = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const [collapsed, setCollapsed] = useState(false);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Layout hasSider style={{ height: '100vh', overflow: 'hidden' }}>
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <Layout 
        style={{ 
          marginLeft: collapsed ? 80 : 224,
          height: '100vh',
          overflow: 'hidden',
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
        <Navbar collapsed={collapsed} />
        <Content 
          style={{ 
            margin: 'clamp(50px, 10vw, 60px) clamp(12px, 3vw, 24px) clamp(30px, 5vw, 40px)', 
            overflowY: 'auto', 
            backgroundColor: 'transparent', 
            padding: 0 
          }}
        >
          {children}
        </Content>
        <Footer collapsed={collapsed} />
      </Layout>
    </Layout>
  );
};

export default AppLayout;
