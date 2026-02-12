import React from "react";
import { Layout } from "antd";
import Sidebar from "./ui/sidebar";
import Navbar from "./ui/Navbar";

const { Content } = Layout;

const AppLayout = ({ children }) => {
  return (
    <Layout hasSider>
      <Sidebar />
      <Layout style={{ marginLeft: 224, minHeight: '100vh' }}>
        <Navbar />
        <Content style={{ margin: '80px 24px 24px', overflow: 'initial', backgroundColor: 'transparent', padding: 0 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AppLayout;