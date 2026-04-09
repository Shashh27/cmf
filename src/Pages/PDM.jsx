import React, { useState } from "react";
import { Layout, Drawer, Button, Tabs } from "antd";
import { MenuOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import ProductSummary from "../PDM Components/ProductSummary";
import DocumentsPanel from "../PDM Components/DocumentsPanel";
import AssemblyDocumentsPanel from "../PDM Components/AssemblyDocumentsPanel";
import ProcessPlanning from "../PPS Components/ProcessPlanning";
import QualityManagement from "../Quality Management Components/QualityManagement";

const { Sider, Content } = Layout;

const PDM = () => {
  const navigate = useNavigate();
  const { productId: routeProductId } = useParams();
  const [searchParams] = useSearchParams();
  const fromOms = (searchParams.get("from") || "").toLowerCase() === "oms";
  const initialProductId = routeProductId || searchParams.get("productId");
  const initialOrderId = searchParams.get("orderId");

  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [productHierarchies, setProductHierarchies] = useState({});
  const [activeTopTab, setActiveTopTab] = useState("pdm");

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
  const handleHierarchyLoaded = (productId, hierarchy) => {
    setProductHierarchies(prev => ({ ...prev, [productId]: hierarchy }));
  };
  const isProductSelected = selectedItem?.itemType === "product";

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
      
      <div style={{ paddingTop: 10, height: 'calc(100vh - 120px)', minHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {fromOms && (
          <div style={{ padding: '0 4px 10px 4px' }}>
            <Button onClick={() => navigate("/admin/oms/orders")}>
              Back to Orders
            </Button>
          </div>
        )}
        {fromOms && (
          <div style={{ padding: "0 4px 10px 4px" }}>
            <Tabs
              activeKey={activeTopTab}
              onChange={setActiveTopTab}
              items={[
                { key: "pdm", label: "PDM" },
                { key: "pps", label: "PPS" },
                { key: "quality", label: "Quality Management" },
              ]}
            />
          </div>
        )}

      {(!fromOms || activeTopTab === "pdm") ? (
      <Layout style={{ height: "100%", flex: 1, overflow: "hidden", display: 'flex' }}>
        {/* Mobile: Hamburger button */}
        {isMobile && (
          <Button
            type="text"
            icon={<MenuOutlined />}
            onClick={() => setMobileDrawerOpen(true)}
            className="pdm-mobile-toggle"
          />
        )}

        {/* Desktop: Fixed Sidebar - scrolls independently */}
        {!isMobile && (
          <Sider 
            width="33%" 
            theme="light" 
            style={{ 
              borderRight: "1px solid #f0f0f0", 
              overflow: 'auto',
              minWidth: 300,
              maxWidth: 500,
              height: '100%'
            }}
          >
            <BillOfMaterials 
              onItemSelected={handleItemSelected} 
              onHierarchyLoaded={handleHierarchyLoaded}
              disableProductCreate={fromOms}
              initialProductId={fromOms ? initialProductId : null}
            />
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
            <BillOfMaterials 
              onItemSelected={handleItemSelected} 
              onHierarchyLoaded={handleHierarchyLoaded}
              disableProductCreate={fromOms}
              initialProductId={fromOms ? initialProductId : null}
            />
          </Drawer>
        )}
        
        {/* Right: Product summary for product; otherwise details + documents */}
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
          {isProductSelected ? (
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
              <ProductSummary 
                productId={selectedItem?.id} 
                initialHierarchy={productHierarchies[selectedItem?.id]}
              />
            </div>
          ) : (
            <>
              {/* Top panel: only show detailed part view for parts; assemblies/products handled separately */}
              {selectedItem?.itemType === 'part' && (
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
              )}
              <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                {selectedItem?.itemType === 'assembly' ? (
                  <AssemblyDocumentsPanel selectedItem={selectedItem} />
                ) : (
                  <DocumentsPanel
                    selectedItem={selectedItem}
                    onDocumentsLoaded={setPartDocuments}
                  />
                )}
              </div>
            </>
          )}
        </Content>
      </Layout>
      ) : activeTopTab === "pps" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#f5f5f5" }}>
          <ProcessPlanning initialOrderId={initialOrderId} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#f5f5f5" }}>
          <QualityManagement 
            initialProductId={fromOms ? initialProductId : null} 
            initialOrderId={initialOrderId}
            fromOms={fromOms} 
          />
        </div>
      )}
      </div>
    </>
  );
};

export default PDM;
