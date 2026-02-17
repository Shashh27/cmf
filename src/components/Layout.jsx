import React from "react";
import { Layout } from "antd";
import { useLocation } from "react-router-dom";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";

const { Content } = Layout;

const AppLayout = ({ children }) => {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <Layout hasSider>
      <Sidebar />
      <Layout style={{ marginLeft: 224, minHeight: '100vh' }}>
        <Navbar />
        <Content style={{ margin: '80px 24px 24px', overflowY: 'auto', backgroundColor: 'transparent', padding: 0 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
