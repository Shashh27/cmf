import React, { useState, useEffect, useMemo } from "react";
import { Layout, Drawer, Button, Tabs, Tooltip } from "antd";
import { MenuOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import BillOfMaterials from "./PDM Components/BillOfMaterials";
import ProductDetails from "./PDM Components/ProductDetails";
import ProductSummary from "./PDM Components/ProductSummary";
import AssemblyDocumentsPanel from "./PDM Components/AssemblyDocumentsPanel";
import ProcessPlanning from "../PPS Components/ProcessPlanning";
import Recyclebin from "./Recyclebin";
import MCDocumentNotifications from "./MCDocumentNotifications";

const { Sider, Content } = Layout;

const BOM_SIDER_COLLAPSED = 48;

function getBomWidth(viewportWidth) {
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

  const [selectedItem, setSelectedItem] = useState(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1280
  );
  const [productHierarchies, setProductHierarchies] = useState({});
  const [activeTopTab, setActiveTopTab] = useState("pdm");
  const [bomRefreshTrigger, setBomRefreshTrigger] = useState(0);
  const [bomCollapsed, setBomCollapsed] = useState(false);

  const useBomDrawer = viewportWidth < 992;
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

  const handleItemSelected = (item) => {
    setSelectedItem(item);
    if (useBomDrawer) setMobileDrawerOpen(false);
  };
  const handleHierarchyLoaded = (productId, hierarchy) => {
    setProductHierarchies((prev) => ({ ...prev, [productId]: hierarchy }));
  };
  const handlePartsCreated = () => {
    setBomRefreshTrigger((prev) => prev + 1);
  };
  const isProductSelected = selectedItem?.itemType === "product";

  const userId = (() => {
    const userStr = localStorage.getItem("user");
    if (!userStr) return null;
    try {
      return JSON.parse(userStr)?.id || null;
    } catch {
      return null;
    }
  })();

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
        .mc-pdm-shell {
          height: 100%;
          width: 100%;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .mc-pdm-main {
          flex: 1;
          min-height: 0;
          min-width: 0;
          width: 100%;
          overflow: hidden;
          display: flex !important;
        }
        .mc-pdm-bom-sider.ant-layout-sider {
          flex: 0 0 auto !important;
          max-width: none !important;
          min-width: 0 !important;
        }
        .mc-pdm-bom-sider .ant-layout-sider-children {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-width: 0;
          overflow: hidden;
        }
        .mc-pdm-detail {
          flex: 1 1 auto !important;
          min-width: 0 !important;
        }
        .mc-pdm-bom-toggle {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 1001;
          background: #fff;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        @media (min-width: 768px) and (max-width: 991px) {
          .mc-pdm-bom-toggle { left: 96px; }
        }
      `}</style>

      <div className="mc-pdm-shell" style={{ paddingTop: fromOms ? 0 : 8 }}>
        {fromOms && (
          <div
            style={{
              padding: "0 8px 8px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
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
                { key: "recycle-bin", label: viewportWidth < 1100 ? "Recycle" : "Recycle Bin" },
              ]}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <MCDocumentNotifications orderId={initialOrderId} />
              <Button size="small" onClick={() => navigate("/manufacturing_coordinator/oms/orders")}>
                {viewportWidth < 900 ? "Back" : "Back to Orders"}
              </Button>
            </div>
          </div>
        )}

        {!fromOms || activeTopTab === "pdm" ? (
          <Layout className="mc-pdm-main">
            {useBomDrawer && (
              <Button
                type="default"
                icon={<MenuOutlined />}
                onClick={() => setMobileDrawerOpen(true)}
                className="mc-pdm-bom-toggle"
              >
                BOM
              </Button>
            )}

            {!useBomDrawer && (
              <Sider
                className="mc-pdm-bom-sider"
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
                  }}
                >
                  {!bomCollapsed && (
                    <span style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>BOM panel</span>
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
                    />
                  </Tooltip>
                </div>
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
              destroyOnClose={false}
            >
              {bomPanel}
            </Drawer>

            <Content
              className="mc-pdm-detail"
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                backgroundColor: "#f8fafc",
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
                      <ProductDetails selectedItem={selectedItem} />
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
                </>
              )}
            </Content>
          </Layout>
        ) : activeTopTab === "pps" ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 12 }}>
            <ProcessPlanning initialOrderId={initialOrderId} />
          </div>
        ) : activeTopTab === "recycle-bin" ? (
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <Recyclebin orderId={initialOrderId} />
          </div>
        ) : null}
      </div>
    </>
  );
};

export default PDM;
