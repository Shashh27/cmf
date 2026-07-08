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
import "../PDM Components/pdm-theme.css";

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

  // Get user from localStorage for additional costs tracking
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = user?.id;

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
            background: #FFFFFF;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          }
        }
      `}</style>
      
      <div className="pdm-container" style={{ height: '100vh', minHeight: 320, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {fromOms && (
          <div className="pdm-section-header" style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      <Layout style={{ height: "100%", flex: 1, overflow: "hidden", display: 'flex', margin: 0, padding: 0 }}>
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
            width="30%"
            theme="light"
            style={{
              borderRight: "1px solid #D6D3C4",
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 280,
              maxWidth: 480,
              height: '100%',
              backgroundColor: '#F5F5DC',
              margin: 0,
              padding: 0
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
            backgroundColor: "#F5F5DC",
            height: "100%",
            margin: 0
          }}
        >
          {isProductSelected ? (
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
              <ProductSummary 
                productId={selectedItem?.id} 
                orderId={initialOrderId}
                userId={userId}
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
        <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#F5F5DC" }}>
          <ProcessPlanning initialOrderId={initialOrderId} />
        </div>
      ) : activeTopTab === "quality" ? (
        <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12, background: "#F5F5DC" }}>
          <QualityManagement 
            initialProductId={fromOms ? initialProductId : null} 
            initialOrderId={initialOrderId}
            fromOms={fromOms} 
          />
        </div>
      ) : activeTopTab === "recycle-bin" ? (
        <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%", background: "#F5F5DC" }}>
          <Recyclebin orderId={initialOrderId} />
        </div>
      ) : null}
      </div>
    </>
  );
};

export default PDM;
