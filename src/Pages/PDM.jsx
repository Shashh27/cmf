import React, { useState } from "react";
import { Layout } from "antd";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import DocumentsPanel from "../PDM Components/DocumentsPanel";

const { Sider, Content } = Layout;

const PDM = () => {
  const [selectedItem, setSelectedItem] = useState(null);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
  };

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* Bill of Materials - Left Sidebar */}
      <Sider width="33%" theme="light" style={{ borderRight: "1px solid #f0f0f0", overflow: 'auto' }}>
        <BillOfMaterials onItemSelected={handleItemSelected} />
      </Sider>
      
      {/* Right Side Container */}
      <Content style={{ display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: '#f5f5f5' }}>
        {/* ProductDetails - Top Right */}
        <div style={{ flexShrink: 0 }}>
          <ProductDetails selectedItem={selectedItem} />
        </div>
        
        {/* DocumentsPanel - Bottom Right with scroll */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <DocumentsPanel selectedItem={selectedItem} />
        </div>
      </Content>
    </Layout>
  );
};

export default PDM;
