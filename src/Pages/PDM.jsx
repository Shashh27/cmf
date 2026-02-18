import React, { useState } from "react";
import { Layout } from "antd";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import DocumentsPanel from "../PDM Components/DocumentsPanel";

const { Sider, Content } = Layout;

const PDM = () => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    setPartDocuments([]);
  };

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      {/* Bill of Materials - Left Sidebar */}
      <Sider width="33%" theme="light" style={{ borderRight: "1px solid #f0f0f0", overflow: 'auto' }}>
        <BillOfMaterials onItemSelected={handleItemSelected} />
      </Sider>
      
      {/* Right: compact ProductDetails on top, DocumentsPanel gets remaining space */}
      <Content style={{ display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "#f8fafc" }}>
        <div style={{ flexShrink: 0, maxHeight: "38vh", minHeight: 0 }}>
          <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments} />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <DocumentsPanel selectedItem={selectedItem} onDocumentsLoaded={setPartDocuments} />
        </div>
      </Content>
    </Layout>
  );
};

export default PDM;
