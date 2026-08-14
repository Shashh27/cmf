import React, { useState, useEffect, useMemo } from "react";
import { Layout, Drawer, Button, Tabs, Tooltip, App } from "antd";
import { MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
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
import OrderChatPanel, { OrderChatButton, useOrderChat } from "../chatbox/OrderChatPanel";
import { useAuth } from "../auth/AuthContext.jsx";
import "../PDM Components/pdm-theme.css";

const { Sider, Content } = Layout;

const BOM_SIDER_COLLAPSED = 48;

function getBomWidth(viewportWidth) {
  // Leave room for app sidebar + details panel; grow with screen size
  if (viewportWidth >= 1600) return Math.min(520, Math.round(viewportWidth * 0.28));
  if (viewportWidth >= 1400) return Math.min(460, Math.round(viewportWidth * 0.3));
  if (viewportWidth >= 1200) return Math.min(420, Math.round(viewportWidth * 0.32));
  if (viewportWidth >= 992) return Math.min(360, Math.round(viewportWidth * 0.34));
  return Math.min(320, Math.round(viewportWidth * 0.42));
}

const PDM = () => {
  const navigate = useNavigate();
  const { productId: routeProductId } = useParams();
  const [searchParams] = useSearchParams();
  const fromOms = (searchParams.get("from") || "").toLowerCase() === "oms";
  const initialProductId = routeProductId || searchParams.get("productId");
  const initialOrderId = searchParams.get("orderId");
  const [chatOpen, setChatOpen] = useState(false);
  const { message: messageApi } = App.useApp();
  const { user } = useAuth();
  const orderIdNum = initialOrderId ? Number(initialOrderId) : null;
  const chat = useOrderChat({
    orderId: orderIdNum,
    panelOpen: chatOpen,
    currentUserId: user?.id,
    messageApi,
  });

  const [selectedItem, setSelectedItem] = useState(null);
  const [partDocuments, setPartDocuments] = useState([]);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [productHierarchies, setProductHierarchies] = useState({});
  const [activeTopTab, setActiveTopTab] = useState("pdm");
  const [bomRefreshTrigger, setBomRefreshTrigger] = useState(0);
  const [bomCollapsed, setBomCollapsed] = useState(false);

  const userId = user?.id;

  const isMobile = viewportWidth < 768;
  const useBomDrawer = viewportWidth < 992; // tablet + mobile: BOM in drawer
  const bomWidth = useMemo(() => getBomWidth(viewportWidth), [viewportWidth]);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      setViewportWidth(w);
      if (w >= 992) setMobileDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, []);

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    setPartDocuments([]);
    if (useBomDrawer) setMobileDrawerOpen(false);
  };
  const handleHierarchyLoaded = (productId, hierarchy) => {
    setProductHierarchies((prev) => ({ ...prev, [productId]: hierarchy }));
  };
  const handlePartsCreated = () => {
    setBomRefreshTrigger((prev) => prev + 1);
  };
  const isProductSelected = selectedItem?.itemType === "product";

  const bomPanel = (
    <BillOfMaterials
      onItemSelected={handleItemSelected}
      onHierarchyLoaded={handleHierarchyLoaded}
      disableProductCreate={fromOms}
      initialProductId={fromOms ? initialProductId : null}
      bomRefreshTrigger={bomRefreshTrigger}
    />
  );

  return (
    <>
      <style>{`
        .pdm-shell {
          height: 100%;
          width: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .pdm-main-layout {
          flex: 1;
          min-height: 0;
          min-width: 0;
          width: 100%;
          overflow: hidden;
          display: flex !important;
        }
        .pdm-bom-sider.ant-layout-sider {
          flex: 0 0 auto !important;
          max-width: none !important;
          min-width: 0 !important;
        }
        .pdm-bom-sider .ant-layout-sider-children {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .pdm-detail-content {
          flex: 1 1 auto !important;
          min-width: 0 !important;
          width: auto !important;
        }
        .pdm-mobile-toggle {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 1001;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        @media (min-width: 768px) and (max-width: 991px) {
          .pdm-mobile-toggle {
            top: 16px;
            left: 96px;
          }
        }
        .pdm-top-bar {
          flex-wrap: wrap;
          gap: 8px;
        }
        .pdm-top-bar .ant-tabs {
          flex: 1 1 auto;
          min-width: 0;
        }
        .pdm-top-bar .ant-tabs-nav {
          margin-bottom: 0 !important;
        }
      `}</style>

      <div className="pdm-container pdm-shell">
        {fromOms && (
          <div
            className="pdm-section-header pdm-top-bar"
            style={{
              padding: "8px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <Tabs
              activeKey={activeTopTab}
              onChange={setActiveTopTab}
              size={viewportWidth < 1100 ? "small" : "middle"}
              items={[
                { key: "pdm", label: "PDM" },
                { key: "pps", label: "PPS" },
                { key: "quality", label: viewportWidth < 1100 ? "Quality" : "Quality Management" },
                { key: "recycle-bin", label: viewportWidth < 1100 ? "Recycle" : "Recycle Bin" },
              ]}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              {initialOrderId && (
                <OrderChatButton
                  totalUnread={chat.totalUnread}
                  onClick={() => setChatOpen(true)}
                />
              )}
              <AdminDocumentNotifications orderId={initialOrderId} />
              <Button size="small" onClick={() => navigate("/admin/oms/orders")}>
                {viewportWidth < 900 ? "Back" : "Back to Orders"}
              </Button>
            </div>
          </div>
        )}

        {!fromOms || activeTopTab === "pdm" ? (
          <Layout className="pdm-main-layout">
            {useBomDrawer && (
              <Button
                type="default"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawerOpen(true)}
                className="pdm-mobile-toggle"
              >
                BOM
              </Button>
            )}

            {!useBomDrawer && (
              <Sider
                className="pdm-bom-sider"
                width={bomWidth}
                collapsedWidth={BOM_SIDER_COLLAPSED}
                collapsed={bomCollapsed}
                collapsible
                trigger={null}
                theme="light"
                style={{
                  borderRight: "1px solid #f0f0f0",
                  overflow: "hidden",
                  height: "100%",
                  backgroundColor: "#ffffff",
                  transition: "all 0.2s",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: bomCollapsed ? "center" : "space-between",
                    padding: bomCollapsed ? "8px 0" : "6px 10px",
                    borderBottom: "1px solid #f0f0f0",
                    flexShrink: 0,
                    background: "#fafafa",
                    gap: 8,
                  }}
                >
                  {!bomCollapsed && (
                    <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", whiteSpace: "nowrap" }}>
                      BOM panel
                    </span>
                  )}
                  <Tooltip
                    title={bomCollapsed ? "Expand Bill of Materials" : "Minimise Bill of Materials"}
                    placement="right"
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={bomCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                      onClick={() => setBomCollapsed((c) => !c)}
                      aria-label={bomCollapsed ? "Expand BOM" : "Collapse BOM"}
                    />
                  </Tooltip>
                </div>
                {/* Keep BOM mounted when collapsed so selection / expand state is preserved */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    display: bomCollapsed ? "none" : "flex",
                    flexDirection: "column",
                  }}
                >
                  {bomPanel}
                </div>
              </Sider>
            )}

            <Drawer
              title="Bill of Materials"
              placement="left"
              onClose={() => setMobileDrawerOpen(false)}
              open={useBomDrawer && mobileDrawerOpen}
              size={Math.min(420, Math.round(viewportWidth * 0.92))}
              styles={{ body: { padding: 0, height: "100%", overflow: "hidden" } }}
              destroyOnHidden={false}
            >
              {bomPanel}
            </Drawer>

            <Content
              className="pdm-detail-content"
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                backgroundColor: "#ffffff",
                height: "100%",
                margin: 0,
                padding: useBomDrawer ? "48px 8px 8px" : 0,
                minWidth: 0,
              }}
            >
              {isProductSelected ? (
                <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                  <ProductSummary
                    productId={selectedItem?.id}
                    orderId={initialOrderId}
                    userId={userId}
                  />
                </div>
              ) : (
                <>
                  {selectedItem?.itemType === "part" && (
                    <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                      <ProductDetails selectedItem={selectedItem} partDocuments={partDocuments}>
                        <DocumentsPanel
                          selectedItem={selectedItem}
                          onDocumentsLoaded={setPartDocuments}
                        />
                      </ProductDetails>
                    </div>
                  )}
                  {selectedItem?.itemType === "assembly" && (
                    <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
                      <AssemblyDocumentsPanel
                        selectedItem={selectedItem}
                        onPartsCreated={handlePartsCreated}
                      />
                    </div>
                  )}
                  {selectedItem?.itemType !== "part" &&
                    selectedItem?.itemType !== "assembly" && (
                      <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
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
          <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
            <ProcessPlanning initialOrderId={initialOrderId} />
          </div>
        ) : activeTopTab === "quality" ? (
          <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
            <QualityManagement
              initialProductId={fromOms ? initialProductId : null}
              initialOrderId={initialOrderId}
              fromOms={fromOms}
            />
          </div>
        ) : activeTopTab === "recycle-bin" ? (
          <div className="pdm-container" style={{ flex: 1, minHeight: 0, overflow: "hidden", height: "100%" }}>
            <Recyclebin orderId={initialOrderId} />
          </div>
        ) : null}
      </div>

      {initialOrderId && (
        <OrderChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          orderId={orderIdNum}
          chat={chat}
        />
      )}
    </>
  );
};

export default PDM;
