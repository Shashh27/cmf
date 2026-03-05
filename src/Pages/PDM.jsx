import React, { useState } from "react";
import { Layout, Drawer, Button } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import DocumentsPanel from "../PDM Components/DocumentsPanel";

const { Sider, Content } = Layout;

const PDM = () => {
  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Detect screen size
  React.useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    setPartDocuments([]);
    if (isMobile) setMobileDrawerOpen(false); // Close drawer on mobile after selection
  };

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .pdm-mobile-toggle {
            position: fixed;
            top: 80px;
            left: 16px;
            z-index: 1001;
            background: white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            border-radius: 8px;
          }
        }
      `}</style>
      
      <Layout style={{ height: "100vh", overflow: "hidden" }}>
        {/* Mobile: Hamburger button */}
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileDrawerOpen(true)}
            className="pdm-mobile-toggle"
          />
        )}

        {/* Desktop: Fixed Sidebar */}
        {!isMobile && (
          <Sider 
            width="33%" 
            theme="light" 
            style={{ 
              borderRight: "1px solid #f0f0f0", 
              overflow: 'auto',
              minWidth: 300,
              maxWidth: 500
            }}
          >
            <BillOfMaterials onItemSelected={handleItemSelected} />
          </Sider>
        )}

        {/* Mobile: Drawer for BOM */}
        {isMobile && (
          <Drawer
            placement="left"
            onClose={() => setMobileDrawerOpen(false)}
            open={mobileDrawerOpen}
            style={{ width: '85%' }}
            styles={{ body: { padding: 0 } }}
          >
            <BillOfMaterials onItemSelected={handleItemSelected} />
          </Drawer>
        )}
        
        {/* Right: ProductDetails on top, DocumentsPanel gets remaining space */}
        <Content 
          style={{ 
            display: "flex", 
            flexDirection: "column", 
            overflow: "hidden", 
            backgroundColor: "#f8fafc", 
            height: "100%",
            marginLeft: isMobile ? 0 : undefined
          }}
        >
          <div 
            style={{ 
              flexShrink: 0, 
              maxHeight: isMobile ? "30vh" : "38vh", 
              minHeight: 0, 
              overflow: "hidden" 
            }}
          >
            <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments} />
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
            <DocumentsPanel selectedItem={selectedItem} onDocumentsLoaded={setPartDocuments} />
          </div>
        </Content>
      </Layout>
    </>
  );
};

export default PDM;
