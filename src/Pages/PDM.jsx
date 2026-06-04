import React, { useState, useEffect } from "react";
import { Layout, Drawer, Button, Tabs } from "antd";
import { MenuOutlined, BellOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import BillOfMaterials from "../PDM Components/BillOfMaterials";
import ProductDetails from "../PDM Components/ProductDetails";
import ProductSummary from "../PDM Components/ProductSummary";
import DocumentsPanel from "../PDM Components/DocumentsPanel";
import AssemblyDocumentsPanel from "../PDM Components/AssemblyDocumentsPanel";
import ProcessPlanning from "../PPS Components/ProcessPlanning";
import QualityManagement from "../Quality Management Components/QualityManagement";
import Recyclebin from "./Recyclebin";
import AdminDocumentNotifications from "./AdminDocumentNotifications";

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
  const [bomRefreshTrigger, setBomRefreshTrigger] = useState(0);

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

  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    setPartDocuments([]);
    if (isMobile) setMobileDrawerOpen(false); // Close drawer on mobile after selection
  };
  const handleHierarchyLoaded = (productId, hierarchy) => {
    setProductHierarchies(prev => ({ ...prev, [productId]: hierarchy }));
  };
  const handlePartsCreated = () => {
    // Trigger BOM refresh when parts are created for assemblies
    setBomRefreshTrigger(prev => prev + 1);
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
          <div style={{ padding: '0 4px 10px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Tabs
              activeKey={activeTopTab}
              onChange={setActiveTopTab}
              items={[
                { key: "pdm", label: "PDM" },
                { key: "pps", label: "PPS" },
                { key: "quality", label: "Quality Management" },
                { key: "recycle-bin", label: "Recycle Bin" },
              ]}
            />
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <AdminDocumentNotifications orderId={initialOrderId} />
              <Button size="small" onClick={() => navigate("/admin/oms/orders")}>
                Back to Orders
              </Button>
            </div>
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
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 300,
              maxWidth: 500,
              height: '100%'
            }}
          >
            <div className="flex flex-col h-full overflow-hidden">
              <BillOfMaterials 
                onItemSelected={handleItemSelected} 
                onHierarchyLoaded={handleHierarchyLoaded}
                disableProductCreate={fromOms}
                initialProductId={fromOms ? initialProductId : null}
                bomRefreshTrigger={bomRefreshTrigger}
              />
            </div>
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
              bomRefreshTrigger={bomRefreshTrigger}
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
              />
            </div>
          ) : (
            <>
              {/* Top panel: ProductDetails now includes DocumentsPanel */}
              {selectedItem?.itemType === 'part' && (
                <div 
                  style={{ 
                    flex: 1, 
                    minHeight: 0, 
                    overflow: "hidden",
                    height: "100%"
                  }}
                >
                  <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments}>
                    <DocumentsPanel
                      selectedItem={selectedItem}
                      onDocumentsLoaded={setPartDocuments}
                    />
                  </ProductDetails>
                </div>
              )}
              {selectedItem?.itemType === 'assembly' && (
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                  <AssemblyDocumentsPanel selectedItem={selectedItem} onPartsCreated={handlePartsCreated} />
                </div>
              )}
              {selectedItem?.itemType !== "part" && selectedItem?.itemType !== "assembly" && (
                <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
                  <DocumentsPanel
                    selectedItem={selectedItem}
                    onDocumentsLoaded={setPartDocuments}
                  />
                </div>
              )}
            </>
          )}
        </Content>
      </Layout>
      ) : activeTopTab === "pps" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#f5f5f5" }}>
          <ProcessPlanning initialOrderId={initialOrderId} />
        </div>
      ) : activeTopTab === "quality" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#f5f5f5" }}>
          <QualityManagement 
            initialProductId={fromOms ? initialProductId : null} 
            initialOrderId={initialOrderId}
            fromOms={fromOms} 
          />
        </div>
      ) : activeTopTab === "recycle-bin" ? (
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
          <Recyclebin orderId={initialOrderId} />
        </div>
      ) : null}
      </div>
    </>
  );
};

export default PDM;
