import React from "react";
import { Layout } from "antd";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";

const { Content } = Layout;

const AppLayout = ({ children }) => {
  return (
    <Layout hasSider>
      <Sidebar />
      <Layout style={{ marginLeft: 224, height: '100vh', overflow: 'hidden' }}>
        <Navbar />
        <Content style={{ margin: '64px 12px 12px', overflow: 'hidden', height: 'calc(100vh - 76px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;
